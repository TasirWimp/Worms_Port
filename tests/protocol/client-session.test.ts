import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { bootstrapSession } from '../../client/src/lib/session';
import { PROTOCOL_VERSION, protocolEvents } from '../../shared/protocol';

class MemoryStorage {
    private readonly values = new Map<string, string>();

    getItem(key: string) { return this.values.get(key) ?? null; }
    setItem(key: string, value: string) { this.values.set(key, value); }
    removeItem(key: string) { this.values.delete(key); }
}

class FakeSocket extends EventEmitter {
    public connected = true;
    public disconnects = 0;
    public connects = 0;
    public attempts = 0;
    public actions: string[] = [];

    timeout() { return this; }

    emit(event: string, ...args: any[]): boolean {
        if (event !== protocolEvents.sessionOpen) {
            return super.emit(event, ...args);
        }
        const request = args[0];
        const callback = args[1];
        this.attempts += 1;
        this.actions.push(request.action);
        if (this.attempts === 1) {
            queueMicrotask(() => callback(new Error('simulated lost acknowledgement')));
        } else {
            queueMicrotask(() => callback(null, {
                protocolVersion: PROTOCOL_VERSION,
                serverTimeMs: 1_700_000_000_000,
                ok: true,
                requestId: request.requestId,
                data: {
                    protocolVersion: PROTOCOL_VERSION,
                    serverTimeMs: 1_700_000_000_000,
                    sessionId: 'session_identifier_01',
                    token: 'b'.repeat(43),
                    resumed: true,
                    expiresAt: '2026-07-12T12:00:00.000Z'
                }
            }));
        }
        return true;
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

    off(event: string, listener: (...args: any[]) => void) {
        return super.off(event, listener);
    }

    once(event: string, listener: (...args: any[]) => void) {
        return super.once(event, listener);
    }
}

test('browser session bootstrap reconnects once and retries a lost resume acknowledgement', async () => {
    const storage = new MemoryStorage();
    storage.setItem('nimble-knots.session-token', 'a'.repeat(43));
    Object.assign(globalThis, {
        sessionStorage: storage,
        window: { setTimeout, clearTimeout }
    });
    const socket = new FakeSocket();

    const session = await bootstrapSession(socket as any);

    assert.equal(session.sessionId, 'session_identifier_01');
    assert.equal(storage.getItem('nimble-knots.session-token'), 'b'.repeat(43));
    assert.equal(socket.disconnects, 1);
    assert.equal(socket.connects, 1);
    assert.equal(socket.attempts, 2);
});

test('browser session bootstrap rotates a retained active-reward token after WebView restart', async () => {
    const sessionStorage = new MemoryStorage();
    const localStorage = new MemoryStorage();
    localStorage.setItem('nimble-knots.active-reward-session-token', 'a'.repeat(43));
    Object.assign(globalThis, {
        sessionStorage,
        localStorage,
        window: { setTimeout, clearTimeout }
    });
    const socket = new FakeSocket();

    const session = await bootstrapSession(socket as any);

    assert.equal(session.sessionId, 'session_identifier_01');
    assert.deepEqual(socket.actions, ['resume', 'resume']);
    assert.equal(sessionStorage.getItem('nimble-knots.session-token'), 'b'.repeat(43));
    assert.equal(localStorage.getItem('nimble-knots.active-reward-session-token'), 'b'.repeat(43));
});

test('browser session bootstrap rotates a retained active-objective token after WebView restart', async () => {
    const sessionStorage = new MemoryStorage();
    const localStorage = new MemoryStorage();
    localStorage.setItem('nimble-knots.active-objective-session-token', 'a'.repeat(43));
    Object.assign(globalThis, {
        sessionStorage,
        localStorage,
        window: { setTimeout, clearTimeout }
    });
    const socket = new FakeSocket();

    const session = await bootstrapSession(socket as any);

    assert.equal(session.sessionId, 'session_identifier_01');
    assert.deepEqual(socket.actions, ['resume', 'resume']);
    assert.equal(sessionStorage.getItem('nimble-knots.session-token'), 'b'.repeat(43));
    assert.equal(localStorage.getItem('nimble-knots.active-objective-session-token'), 'b'.repeat(43));
    assert.equal(localStorage.getItem('nimble-knots.active-reward-session-token'), null);
});
