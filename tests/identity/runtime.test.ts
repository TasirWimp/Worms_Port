import assert from 'node:assert/strict';
import test from 'node:test';

import { PrivateKey, PublicKey, Signature } from '@nimiq/core';
import { io as connectClient, type Socket } from 'socket.io-client';

import {
    IdentityBeginDataSchema,
    IdentityCompleteDataSchema,
    protocolEvents
} from '../../shared/protocol';
import { nimiqSignedMessageHash } from '../../server/src/identity/crypto';
import { createRuntimeServer, type RuntimeServer } from '../../server/src/runtime';

type Ack = Record<string, any>;

async function start(identity = true) {
    const runtime = createRuntimeServer({
        allowMissingOrigin: true,
        identity: identity ? {
            publicOrigin: 'http://127.0.0.1',
            network: 'main-albatross',
            sweepIntervalMs: false
        } : false,
        sessionRegistry: { simulationTickIntervalMs: false }
    });
    const port = await runtime.listen();
    return { runtime, url: `http://127.0.0.1:${port}` };
}

function connect(url: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
        const socket = connectClient(url, {
            transports: ['websocket'],
            reconnection: false,
            timeout: 1_000
        });
        socket.once('connect', () => resolve(socket));
        socket.once('connect_error', reject);
    });
}

function emitAck(socket: Socket, event: string, payload: unknown): Promise<Ack> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout for ${event}`)), 2_000);
        socket.emit(event, payload, (response: Ack) => {
            clearTimeout(timer);
            resolve(response);
        });
    });
}

async function openSession(socket: Socket, requestId = 'identity_session_01') {
    const ack = await emitAck(socket, protocolEvents.sessionOpen, {
        requestId,
        action: 'create'
    });
    assert.equal(ack.ok, true);
    return ack.data;
}

async function begin(socket: Socket, address: string, requestId = 'identity_begin_01') {
    const ack = await emitAck(socket, protocolEvents.identityBegin, { requestId, address });
    assert.equal(ack.ok, true);
    assert.equal(IdentityBeginDataSchema.safeParse(ack.data).success, true);
    return ack.data;
}

function createSigner(hex = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f') {
    const privateKey = PrivateKey.fromHex(hex);
    const publicKey = PublicKey.derive(privateKey);
    const derivedAddress = publicKey.toAddress();
    const address = derivedAddress.toUserFriendlyAddress();
    derivedAddress.free();
    return {
        address,
        sign(message: string) {
            const signature = Signature.create(
                privateKey,
                publicKey,
                nimiqSignedMessageHash(message)
            );
            try {
                return { publicKey: publicKey.toHex(), signature: signature.toHex() };
            } finally {
                signature.free();
            }
        },
        dispose() {
            publicKey.free();
            privateKey.free();
        }
    };
}

async function closeAll(runtime: RuntimeServer, sockets: Socket[]) {
    for (const socket of sockets) socket.close();
    await runtime.close();
}

test('real Socket.IO identity proof rotates the session and replay fails closed', async () => {
    const { runtime, url } = await start();
    const socket = await connect(url);
    const signer = createSigner();
    try {
        const opened = await openSession(socket);
        const authorization = await begin(socket, signer.address);
        const proof = signer.sign(authorization.message);
        const completePayload = {
            requestId: 'identity_complete_01',
            authorizationId: authorization.authorizationId,
            address: authorization.address,
            ...proof
        };
        const completed = await emitAck(socket, protocolEvents.identityComplete, completePayload);
        assert.equal(completed.ok, true);
        assert.equal(IdentityCompleteDataSchema.safeParse(completed.data).success, true);
        assert.equal(completed.data.identity.address, signer.address);
        assert.notEqual(completed.data.token, opened.token);
        assert.equal(runtime.sessions.getBound(socket.id!)?.identity?.address, signer.address);
        assert.equal(runtime.identity?.size, 0);

        const replay = await emitAck(socket, protocolEvents.identityComplete, {
            ...completePayload,
            requestId: 'identity_complete_02'
        });
        assert.equal(replay.ok, false);
        assert.equal(replay.error.code, 'UNAUTHORIZED');
        assert.equal(replay.error.message, 'Identity authorization failed. Start a new authorization attempt.');
    } finally {
        signer.dispose();
        await closeAll(runtime, [socket]);
    }
});

test('invalid proof is consumed and concurrent completion has at most one success', async () => {
    const { runtime, url } = await start();
    const socket = await connect(url);
    const signer = createSigner();
    try {
        await openSession(socket);
        const invalidAttempt = await begin(socket, signer.address, 'identity_begin_invalid');
        const invalid = await emitAck(socket, protocolEvents.identityComplete, {
            requestId: 'identity_complete_invalid',
            authorizationId: invalidAttempt.authorizationId,
            address: invalidAttempt.address,
            publicKey: signer.sign(invalidAttempt.message).publicKey,
            signature: '00'.repeat(64)
        });
        assert.equal(invalid.ok, false);
        assert.equal(invalid.error.code, 'UNAUTHORIZED');
        const burned = await emitAck(socket, protocolEvents.identityComplete, {
            requestId: 'identity_complete_burned',
            authorizationId: invalidAttempt.authorizationId,
            address: invalidAttempt.address,
            ...signer.sign(invalidAttempt.message)
        });
        assert.equal(burned.ok, false);
        assert.equal(burned.error.message, invalid.error.message);

        const concurrent = await begin(socket, signer.address, 'identity_begin_concurrent');
        const proof = signer.sign(concurrent.message);
        const [first, second] = await Promise.all([
            emitAck(socket, protocolEvents.identityComplete, {
                requestId: 'identity_complete_concurrent_a',
                authorizationId: concurrent.authorizationId,
                address: concurrent.address,
                ...proof
            }),
            emitAck(socket, protocolEvents.identityComplete, {
                requestId: 'identity_complete_concurrent_b',
                authorizationId: concurrent.authorizationId,
                address: concurrent.address,
                ...proof
            })
        ]);
        assert.equal([first, second].filter((ack) => ack.ok).length, 1);
        assert.equal([first, second].filter((ack) => !ack.ok).length, 1);
    } finally {
        signer.dispose();
        await closeAll(runtime, [socket]);
    }
});

test('identity stays disabled without configuration and cannot begin during Practice', async () => {
    const disabled = await start(false);
    const disabledSocket = await connect(disabled.url);
    const signer = createSigner();
    try {
        await openSession(disabledSocket, 'identity_disabled_session');
        const unavailable = await emitAck(disabledSocket, protocolEvents.identityBegin, {
            requestId: 'identity_disabled_begin',
            address: signer.address
        });
        assert.equal(unavailable.ok, false);
        assert.equal(unavailable.error.code, 'FEATURE_UNAVAILABLE');
    } finally {
        await closeAll(disabled.runtime, [disabledSocket]);
    }

    const enabled = await start(true);
    const enabledSocket = await connect(enabled.url);
    try {
        await openSession(enabledSocket, 'identity_practice_session');
        const pending = await begin(
            enabledSocket,
            signer.address,
            'identity_before_practice_begin'
        );
        const pendingProof = signer.sign(pending.message);
        const created = await emitAck(enabledSocket, protocolEvents.challengeCreate, {
            requestId: 'identity_practice_create',
            sequence: 0,
            mode: 'practice',
            calling: 'wizard'
        });
        assert.equal(created.ok, true);
        const raced = await emitAck(enabledSocket, protocolEvents.identityComplete, {
            requestId: 'identity_during_practice_complete',
            authorizationId: pending.authorizationId,
            address: pending.address,
            ...pendingProof
        });
        assert.equal(raced.ok, false);
        assert.equal(raced.error.code, 'UNAUTHORIZED');
        const blocked = await emitAck(enabledSocket, protocolEvents.identityBegin, {
            requestId: 'identity_practice_begin',
            address: signer.address
        });
        assert.equal(blocked.ok, false);
        assert.equal(blocked.error.code, 'BAD_REQUEST');
    } finally {
        signer.dispose();
        await closeAll(enabled.runtime, [enabledSocket]);
    }
});

test('malformed proof fields are rejected without echoing wallet material', async () => {
    const { runtime, url } = await start();
    const socket = await connect(url);
    const signer = createSigner();
    try {
        await openSession(socket);
        const authorization = await begin(socket, signer.address);
        const validProof = signer.sign(authorization.message);
        const malformed = await emitAck(socket, protocolEvents.identityComplete, {
            requestId: 'identity_malformed_01',
            authorizationId: authorization.authorizationId,
            address: authorization.address,
            publicKey: 'secret-not-hex',
            signature: 'private-wallet-material'
        });
        assert.equal(malformed.ok, false);
        assert.equal(malformed.error.code, 'BAD_REQUEST');
        assert.doesNotMatch(JSON.stringify(malformed), /secret|private-wallet/);
        const consumed = await emitAck(socket, protocolEvents.identityComplete, {
            requestId: 'identity_malformed_02',
            authorizationId: authorization.authorizationId,
            address: authorization.address,
            ...validProof
        });
        assert.equal(consumed.ok, false);
        assert.equal(consumed.error.code, 'UNAUTHORIZED');
    } finally {
        signer.dispose();
        await closeAll(runtime, [socket]);
    }
});
