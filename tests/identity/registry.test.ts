import assert from 'node:assert/strict';
import test from 'node:test';

import { PrivateKey, PublicKey, Signature } from '@nimiq/core';

import { nimiqSignedMessageHash } from '../../server/src/identity/crypto';
import {
    buildCanonicalIdentityMessage,
    IdentityAuthorizationRegistry
} from '../../server/src/identity/registry';

const ADDRESS = 'NQ46 KLJE 5TMF 4Y1A 1255 CJHJ YG1S H0NU T604';
const AUTHORIZATION_ID = 'A'.repeat(32);
const NONCE = 'N'.repeat(43);
const NOW = 1_700_000_000_000;

function createRegistry(now = () => NOW) {
    return new IdentityAuthorizationRegistry({
        publicOrigin: 'https://game.example',
        network: 'main-albatross',
        now,
        sweepIntervalMs: false,
        authorizationIdSource: () => AUTHORIZATION_ID,
        nonceSource: () => NONCE
    });
}

function sign(message: string) {
    const privateKey = PrivateKey.fromHex(
        '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'
    );
    const publicKey = PublicKey.derive(privateKey);
    const signature = Signature.create(privateKey, publicKey, nimiqSignedMessageHash(message));
    try {
        return { publicKey: publicKey.toHex(), signature: signature.toHex() };
    } finally {
        signature.free();
        publicKey.free();
        privateKey.free();
    }
}

test('authorization is canonical, short-lived, bound, verified, and single use', () => {
    const registry = createRegistry();
    try {
        const begun = registry.begin('session_01', 'socket_01', '127.0.0.1', ADDRESS);
        assert.equal('code' in begun, false);
        if ('code' in begun) return;
        assert.equal(begun.authorizationId, AUTHORIZATION_ID);
        assert.equal(begun.address, ADDRESS);
        assert.match(begun.message, /^NIMble Knots Identity Authorization\nVersion: 1\n/);
        assert.match(begun.message, /Action: Sign in to NIMble Knots/);
        assert.match(begun.message, /Origin: https:\/\/game\.example/);
        assert.match(begun.message, /Network: main-albatross/);
        assert.doesNotMatch(begun.message, /session_01|socket_01/);
        assert.equal(begun.expiresAt, new Date(NOW + 3 * 60_000).toISOString());

        const proof = sign(begun.message);
        const completed = registry.complete(
            'session_01', 'socket_01', '127.0.0.1',
            begun.authorizationId, begun.address, proof.publicKey, proof.signature
        );
        assert.equal('code' in completed, false);
        if (!('code' in completed)) {
            assert.equal(completed.address, ADDRESS);
            assert.equal(completed.publicKeyHex, proof.publicKey);
            assert.equal(completed.authorizedAt, new Date(NOW).toISOString());
        }
        const replay = registry.complete(
            'session_01', 'socket_01', '127.0.0.1',
            begun.authorizationId, begun.address, proof.publicKey, proof.signature
        );
        assert.equal('code' in replay && replay.code, 'UNAUTHORIZED');
    } finally {
        registry.dispose();
    }
});

test('an invalid owning proof burns the attempt while a foreign connection cannot burn it', () => {
    const registry = createRegistry();
    try {
        const begun = registry.begin('session_01', 'socket_01', '127.0.0.1', ADDRESS);
        assert.equal('code' in begun, false);
        if ('code' in begun) return;
        const proof = sign(begun.message);
        const foreign = registry.complete(
            'session_02', 'socket_02', '127.0.0.1',
            begun.authorizationId, begun.address, proof.publicKey, proof.signature
        );
        assert.equal('code' in foreign && foreign.code, 'UNAUTHORIZED');
        assert.equal(registry.size, 1);

        const invalid = registry.complete(
            'session_01', 'socket_01', '127.0.0.1',
            begun.authorizationId, begun.address, proof.publicKey, '00'.repeat(64)
        );
        assert.equal('code' in invalid && invalid.code, 'UNAUTHORIZED');
        assert.equal(registry.size, 0);
        const validAfterFailure = registry.complete(
            'session_01', 'socket_01', '127.0.0.1',
            begun.authorizationId, begun.address, proof.publicKey, proof.signature
        );
        assert.equal('code' in validAfterFailure && validAfterFailure.code, 'UNAUTHORIZED');
    } finally {
        registry.dispose();
    }
});

test('only the owning session can cancel an abandoned attempt and retry immediately', () => {
    const registry = createRegistry();
    try {
        const begun = registry.begin('session_01', 'socket_01', '127.0.0.1', ADDRESS);
        assert.equal('code' in begun, false);
        if ('code' in begun) return;
        registry.cancelAttempt('session_02', 'socket_02', begun.authorizationId);
        assert.equal(registry.size, 1);
        registry.cancelAttempt('session_01', 'socket_01', begun.authorizationId);
        registry.cancelAttempt('session_01', 'socket_01', begun.authorizationId);
        assert.equal(registry.size, 0);

        const retry = registry.begin('session_01', 'socket_01', '127.0.0.1', ADDRESS);
        assert.equal('code' in retry, false);
        assert.equal(registry.size, 1);
    } finally {
        registry.dispose();
    }
});

test('proofs for a different purpose, origin, network, or binding fail closed', () => {
    const mutations = [
        (message: string) => message.replace(
            'Action: Sign in to NIMble Knots',
            'Action: Transfer NIM'
        ),
        (message: string) => message.replace(
            'Origin: https://game.example',
            'Origin: https://attacker.example'
        ),
        (message: string) => message.replace(
            'Network: main-albatross',
            'Network: test-albatross'
        ),
        (message: string) => message.replace(
            /^Session: .+$/m,
            `Session: ${'X'.repeat(43)}`
        )
    ];

    for (const [index, mutate] of mutations.entries()) {
        const registry = createRegistry();
        try {
            const sessionId = `session_${index}`;
            const socketId = `socket_${index}`;
            const begun = registry.begin(sessionId, socketId, '127.0.0.1', ADDRESS);
            assert.equal('code' in begun, false);
            if ('code' in begun) continue;
            const proof = sign(mutate(begun.message));
            const rejected = registry.complete(
                sessionId, socketId, '127.0.0.1', begun.authorizationId,
                begun.address, proof.publicKey, proof.signature
            );
            assert.equal('code' in rejected && rejected.code, 'UNAUTHORIZED');
            assert.equal(registry.size, 0);
        } finally {
            registry.dispose();
        }
    }
});

test('expiry, disconnect, pending bounds, and malformed addresses fail closed', () => {
    let now = NOW;
    const registry = createRegistry(() => now);
    try {
        const invalid = registry.begin('session_bad', 'socket_bad', '127.0.0.1', 'NQ00 BAD');
        assert.equal('code' in invalid && invalid.code, 'BAD_REQUEST');
        const begun = registry.begin('session_01', 'socket_01', '127.0.0.1', ADDRESS);
        assert.equal('code' in begun, false);
        assert.equal(registry.size, 1);
        registry.cancelSocket('socket_01');
        assert.equal(registry.size, 0);

        const expiring = registry.begin('session_02', 'socket_02', '127.0.0.2', ADDRESS);
        assert.equal('code' in expiring, false);
        now += 3 * 60_000 + 1;
        registry.sweep();
        assert.equal(registry.size, 0);
    } finally {
        registry.dispose();
    }
});

test('pending attempts are bounded per session and privacy-safe address key', () => {
    let id = 0;
    const registry = new IdentityAuthorizationRegistry({
        publicOrigin: 'https://game.example',
        network: 'main-albatross',
        now: () => NOW,
        sweepIntervalMs: false,
        authorizationIdSource: () => String(id++).padStart(32, 'A'),
        nonceSource: () => NONCE
    });
    try {
        assert.equal('code' in registry.begin('session_01', 'socket_01', '10.0.0.1', ADDRESS), false);
        assert.equal('code' in registry.begin('session_01', 'socket_01', '10.0.0.1', ADDRESS), false);
        const perSession = registry.begin('session_01', 'socket_01', '10.0.0.1', ADDRESS);
        assert.equal('code' in perSession && perSession.code, 'RATE_LIMITED');
        assert.equal('code' in registry.begin('session_02', 'socket_02', '10.0.0.2', ADDRESS), false);
        const perAddress = registry.begin('session_03', 'socket_03', '10.0.0.3', ADDRESS);
        assert.equal('code' in perAddress && perAddress.code, 'RATE_LIMITED');
        assert.equal(registry.size, 3);
    } finally {
        registry.dispose();
    }
});

test('canonical message builder rejects CRLF, Unicode, and field injection', () => {
    const base = {
        publicOrigin: 'https://game.example',
        network: 'main-albatross',
        address: ADDRESS,
        authorizationId: AUTHORIZATION_ID,
        nonce: NONCE,
        issuedAt: new Date(NOW).toISOString(),
        expiresAt: new Date(NOW + 60_000).toISOString(),
        sessionBinding: 'S'.repeat(43),
        connectionBinding: 'C'.repeat(43)
    };
    assert.doesNotThrow(() => buildCanonicalIdentityMessage(base));
    assert.throws(() => buildCanonicalIdentityMessage({
        ...base,
        network: 'main-albatross\r\nAction: Transfer NIM'
    }));
    assert.throws(() => buildCanonicalIdentityMessage({
        ...base,
        publicOrigin: 'https://game.example/🧵'
    }));
});

test('identity configuration requires an HTTPS origin and bounded network domain', () => {
    assert.throws(() => new IdentityAuthorizationRegistry({
        publicOrigin: 'http://game.example',
        network: 'main-albatross',
        sweepIntervalMs: false
    }));
    assert.throws(() => new IdentityAuthorizationRegistry({
        publicOrigin: 'https://game.example/path',
        network: 'main-albatross',
        sweepIntervalMs: false
    }));
    assert.throws(() => new IdentityAuthorizationRegistry({
        publicOrigin: 'https://game.example',
        network: 'main albatross',
        sweepIntervalMs: false
    }));
});
