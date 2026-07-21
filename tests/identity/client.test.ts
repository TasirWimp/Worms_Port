import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { IdentityProtocolClient } from '../../client/src/identity/client';
import { bootstrapSession } from '../../client/src/lib/session';
import { PROTOCOL_VERSION, protocolEvents } from '../../shared/protocol';

const ADDRESS = 'NQ46 KLJE 5TMF 4Y1A 1255 CJHJ YG1S H0NU T604';

class MemoryStorage {
    private readonly values = new Map<string, string>();
    getItem(key: string) { return this.values.get(key) ?? null; }
    setItem(key: string, value: string) { this.values.set(key, value); }
    removeItem(key: string) { this.values.delete(key); }
}

class LostCompleteAckSocket extends EventEmitter {
    public connected = true;
    public completeCalls = 0;
    public disconnects = 0;
    public connects = 0;
    private opened = false;

    timeout() { return this; }

    emit(event: string, ...args: any[]): boolean {
        if (event === protocolEvents.sessionOpen) {
            const request = args[0];
            const callback = args[1];
            const identity = this.opened ? { address: ADDRESS, authorizedAt: '2026-07-21T12:00:00.000Z' } : undefined;
            this.opened = true;
            queueMicrotask(() => callback(null, {
                protocolVersion: PROTOCOL_VERSION,
                serverTimeMs: 1_700_000_000_000,
                ok: true,
                requestId: request.requestId,
                data: {
                    protocolVersion: PROTOCOL_VERSION,
                    serverTimeMs: 1_700_000_000_000,
                    sessionId: 'session_identifier_01',
                    token: (identity ? 'b' : 'a').repeat(43),
                    resumed: Boolean(identity),
                    expiresAt: '2026-07-21T13:00:00.000Z',
                    ...(identity ? { identity } : {})
                }
            }));
            return true;
        }
        if (event === protocolEvents.identityComplete) {
            this.completeCalls += 1;
            const callback = args[1];
            queueMicrotask(() => callback(new Error('simulated lost acknowledgement')));
            return true;
        }
        return super.emit(event, ...args);
    }

    disconnect() {
        this.disconnects += 1;
        this.connected = false;
        super.emit('disconnect');
        return this;
    }

    connect() {
        this.connects += 1;
        queueMicrotask(() => {
            this.connected = true;
            super.emit('connect');
        });
        return this;
    }
}

class CancelAckSocket extends EventEmitter {
    public connected = true;
    public cancelCalls = 0;

    timeout() { return this; }

    emit(event: string, ...args: any[]): boolean {
        if (event === protocolEvents.identityCancel) {
            this.cancelCalls += 1;
            const request = args[0];
            const callback = args[1];
            queueMicrotask(() => callback(null, {
                protocolVersion: PROTOCOL_VERSION,
                serverTimeMs: 1_700_000_000_000,
                ok: true,
                requestId: request.requestId,
                data: { cancelled: true }
            }));
            return true;
        }
        return super.emit(event, ...args);
    }
}

test('lost completion acknowledgement recovers the rotated identity session without proof retry', async () => {
    const storage = new MemoryStorage();
    Object.assign(globalThis, {
        sessionStorage: storage,
        window: { setTimeout, clearTimeout }
    });
    const socket = new LostCompleteAckSocket();
    await bootstrapSession(socket as any);
    const client = new IdentityProtocolClient(socket as any);
    const completed = await client.complete({
        authorizationId: 'A'.repeat(32),
        address: ADDRESS,
        message: 'M'.repeat(64),
        expiresAt: '2026-07-21T12:03:00.000Z'
    }, {
        publicKey: 'ab'.repeat(32),
        signature: 'cd'.repeat(64)
    });

    assert.equal(completed.identity.address, ADDRESS);
    assert.equal(storage.getItem('nimble-knots.session-token'), 'b'.repeat(43));
    assert.equal(socket.completeCalls, 1);
    assert.equal(socket.disconnects, 1);
    assert.equal(socket.connects, 1);
});

test('client sends one strict best-effort cancellation for an abandoned authorization', async () => {
    const socket = new CancelAckSocket();
    const client = new IdentityProtocolClient(socket as any);
    await client.cancel('A'.repeat(32));
    assert.equal(socket.cancelCalls, 1);
});
