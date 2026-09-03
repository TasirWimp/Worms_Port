import assert from 'node:assert/strict';
import test from 'node:test';
import { io, type Socket } from 'socket.io-client';

import type { ChallengeResult, ChallengeSnapshot, SessionOpenData } from '../../shared/protocol';
import { PROTOCOL_VERSION, protocolEvents } from '../../shared/protocol';
import { createLatestSimulation } from '../../shared/simulation';
import { adoptSession, bootstrapSession } from '../../client/src/lib/session';
import { PracticeClient } from '../../client/src/practice/client';
import { createRuntimeServer } from '../../server/src/runtime';
import { V8_R1_RULESET_ID } from '../../shared/simulation-v8';
import { V8_AUTOMATION_ID } from '../../shared/combat-version';

test('automated Practice uses the shared session cursor and retry rebinds all live callbacks', async () => {
    installBrowserStorage();
    const runtime = createRuntimeServer({ allowMissingOrigin: true,
        sessionRegistry: { simulationRulesetId: V8_R1_RULESET_ID, simulationTickIntervalMs: false,
            v8TestOnly: { nowUs: () => 0 } } });
    const port = await runtime.listen();
    const socket = io(`http://127.0.0.1:${port}`, { transports: ['websocket'] });
    let client: PracticeClient | undefined;
    try {
        const opened = await bootstrapSession(socket);
        client = await PracticeClient.connect(socket, opened);
        const results: unknown[] = [];
        client.onCombatResult(value => results.push(value));
        const first = await client.startCombat('wizard');
        assert.equal(first.protocolVersion, 8);
        assert.equal('automationId' in first && first.automationId, V8_AUTOMATION_ID);
        assert.equal(first.nextSequence, 1);
        const args = await client.combatArgs(first);
        assert.equal(args.kind, 'v8');
        if (args.kind !== 'v8') throw new Error('Expected V8 scene args.');
        assert.equal((await args.setPaused!(true)).paused, true);
        assert.equal((await args.setPaused!(false)).paused, false);
        const next = await args.restart!();
        assert.notEqual(next.snapshot.challengeId, first.challengeId);
        assert.equal(next.snapshot.rulesetId, V8_R1_RULESET_ID);
        const faced = await next.submitIntent({ type: 'face', direction: -1 });
        assert.equal(faced.challengeId, next.snapshot.challengeId);
        assert.equal(faced.simulation.units[0].facing, -1);
        assert.equal((await next.setPaused!(true)).paused, true);
        assert.deepEqual(results, []);
    } finally { client?.dispose(); socket.close(); await runtime.close(); }
});

test('automated buffered resume re-enters the same paused challenge without creation', async () => {
    installBrowserStorage();
    const runtime = createRuntimeServer({ allowMissingOrigin: true, sessionRegistry: {
        simulationRulesetId: V8_R1_RULESET_ID, simulationTickIntervalMs: false, v8TestOnly: { nowUs: () => 0 } } });
    const port = await runtime.listen();
    const sockets: Socket[] = [];
    let client: PracticeClient | undefined;
    try {
        const firstSocket = io(`http://127.0.0.1:${port}`, { transports: ['websocket'] }); sockets.push(firstSocket);
        const opened = await bootstrapSession(firstSocket);
        client = await PracticeClient.connect(firstSocket, opened);
        const first = await client.startCombat('wizard');
        const args = await client.combatArgs(first);
        await args.setPaused!(true);
        client.dispose(); firstSocket.disconnect();
        const socket = io(`http://127.0.0.1:${port}`, { transports: ['websocket'] }); sockets.push(socket);
        const resumed = await bootstrapSession(socket);
        await new Promise(resolve => setTimeout(resolve, 10));
        client = await PracticeClient.connect(socket, resumed);
        const before = runtime.sessions.getBound(socket.id!)!.nextSequence;
        const current = await client.startCombat('warrior');
        assert.equal(current.challengeId, first.challengeId);
        assert.equal(current.calling, 'wizard');
        assert.equal(current.paused, true);
        assert.equal(runtime.sessions.getBound(socket.id!)!.nextSequence, before);
        assert.equal((await (await client.combatArgs(current)).setPaused!(false)).paused, false);
    } finally { client?.dispose(); for (const socket of sockets) socket.close(); await runtime.close(); }
});

test('automated buffered terminal survives awaited connection and is consumed once by real scene listeners', async () => {
    installBrowserStorage();
    let now = Date.now();
    const runtime = createRuntimeServer({ allowMissingOrigin: true, sessionRegistry: { now: () => now,
        challengeTtlMs: 1000, simulationRulesetId: V8_R1_RULESET_ID, simulationTickIntervalMs: false,
        v8TestOnly: { nowUs: () => 0 } } });
    const port = await runtime.listen(); const sockets: Socket[] = [];
    let client: PracticeClient | undefined;
    try {
        const firstSocket = io(`http://127.0.0.1:${port}`, { transports: ['websocket'] }); sockets.push(firstSocket);
        client = await PracticeClient.connect(firstSocket, await bootstrapSession(firstSocket));
        const first = await client.startCombat('wizard');
        const disconnected = new Promise<void>(resolve => runtime.io.sockets.sockets.get(firstSocket.id!)!.once('disconnect', () => resolve()));
        client.dispose(); firstSocket.disconnect(); await disconnected;
        now += 1001; runtime.sessions.sweep();
        const socket = io(`http://127.0.0.1:${port}`, { transports: ['websocket'] }); sockets.push(socket);
        const resumed = await bootstrapSession(socket);
        await new Promise(resolve => setTimeout(resolve, 10));
        client = await PracticeClient.connect(socket, resumed);
        await Promise.resolve();
        const delivered: unknown[] = [];
        const unsubscribe = client.onCombatResult(value => delivered.push(value));
        await Promise.resolve();
        assert.equal(delivered.length, 1);
        assert.equal((delivered[0] as any).challengeId, first.challengeId);
        assert.equal((delivered[0] as any).outcome, 'expired');
        unsubscribe();
        const later: unknown[] = []; client.onCombatResult(value => later.push(value));
        await Promise.resolve(); assert.deepEqual(later, []);
    } finally { client?.dispose(); for (const socket of sockets) socket.close(); await runtime.close(); }
});

test('automated lost session abandons its old cursor and retries fresh at sequence zero', async () => {
    installBrowserStorage();
    const runtime = createRuntimeServer({ allowMissingOrigin: true, sessionRegistry: {
        simulationRulesetId: V8_R1_RULESET_ID, simulationTickIntervalMs: false, v8TestOnly: { nowUs: () => 0 } } });
    const port = await runtime.listen();
    const socket = io(`http://127.0.0.1:${port}`, { transports: ['websocket'] });
    let client: PracticeClient | undefined;
    try {
        const opened = await bootstrapSession(socket);
        client = await PracticeClient.connect(socket, opened);
        const first = await client.startCombat('wizard');
        const args = await client.combatArgs(first);
        await args.setPaused!(true);
        const unavailable = new Promise<void>(resolve => args.onUnavailable!(() => resolve()));
        socket.disconnect(); runtime.sessions.close(opened.sessionId); socket.connect();
        await unavailable;
        const next = await client.retryCombat('wizard');
        assert.notEqual(next.sessionId, opened.sessionId);
        assert.notEqual(next.challengeId, first.challengeId);
        assert.equal(next.nextSequence, 1);
    } finally { client?.dispose(); socket.close(); await runtime.close(); }
});

test('a delayed versioned create error cannot write an old session cursor into a replacement session', async () => {
    installBrowserStorage();
    const requests: { body: any; reply: (error: null, ack: unknown) => void }[] = [];
    const socket = new FakeSocket() as FakeSocket & { timeout: () => unknown; emit: (...args: any[]) => boolean };
    socket.timeout = () => socket;
    socket.emit = (_event, body, reply) => { requests.push({ body, reply }); return true; };
    adoptSession(socket as unknown as Socket, session());
    const client = new PracticeClient(socket as unknown as Socket, session());
    try {
        const old = client.startCombat('wizard');
        const rejected = assert.rejects(old, /previous session/);
        while (!requests.length) await new Promise(resolve => setTimeout(resolve, 0));
        const nextSession = { ...session(), sessionId: 'replacement_session_01' };
        adoptSession(socket as unknown as Socket, nextSession); socket.trigger('connect', undefined);
        await Promise.resolve(); await Promise.resolve();
        requests[0].reply(null, { protocolVersion: 8, ok: false, requestId: requests[0].body.requestId,
            nextSequence: 9, error: { code: 'BAD_REQUEST', message: 'Old request failed.', retryable: false } });
        await rejected;
        const fresh = client.startCombat('wizard');
        while (requests.length < 2) await new Promise(resolve => setTimeout(resolve, 0));
        assert.equal(requests[1].body.sequence, 0);
        requests[1].reply(null, { protocolVersion: 8, ok: true, requestId: requests[1].body.requestId,
            nextSequence: 1, data: { kind: 'legacy', snapshot: { ...snapshot(0, 'a', false),
                sessionId: nextSession.sessionId, nextSequence: 1 } } });
        assert.equal((await fresh).sessionId, nextSession.sessionId);
    } finally { client.dispose(); }
});

test('practice client rejects stale/conflicting snapshots and delivers one terminal result', () => {
    const socket = new FakeSocket();
    const initial = snapshot(2, 'a', false);
    const client = new PracticeClient(socket as unknown as Socket, session(), [initial]);
    const snapshots: ChallengeSnapshot[] = [];
    const errors: string[] = [];
    const results: ChallengeResult[] = [];
    client.onSnapshot((value) => snapshots.push(value));
    client.onError((message) => errors.push(message));
    client.onResult((value) => results.push(value));

    socket.trigger(protocolEvents.snapshot, snapshot(1, 'b', false));
    assert.equal(client.currentSnapshot()!.revision, 2);
    assert.equal(snapshots.length, 0);

    socket.trigger(protocolEvents.snapshot, snapshot(2, 'a', true));
    assert.deepEqual(errors, ['Conflicting authoritative snapshots were rejected.']);
    assert.equal(client.currentSnapshot()!.paused, false);

    socket.trigger(protocolEvents.snapshot, snapshot(3, 'b', true));
    assert.equal(client.currentSnapshot()!.revision, 3);
    assert.equal(client.currentSnapshot()!.paused, true);
    assert.equal(snapshots.length, 1);

    const terminal = result(4);
    socket.trigger(protocolEvents.result, terminal);
    socket.trigger(protocolEvents.result, terminal);
    assert.equal(results.length, 1);
    assert.deepEqual(results[0], terminal);

    socket.trigger(protocolEvents.snapshot, {
        ...snapshot(5, 'd', false),
        sessionId: 'foreign_practice_session'
    });
    socket.trigger(protocolEvents.result, {
        ...result(6),
        sessionId: 'foreign_practice_session'
    });
    assert.equal(client.currentSnapshot()!.revision, 3);
    assert.equal(snapshots.length, 1);
    assert.equal(results.length, 1);
    client.dispose();
});

test('practice client buffers one terminal result received during session bootstrap', async () => {
    const socket = new FakeSocket();
    const terminal = result(4);
    const client = new PracticeClient(socket as unknown as Socket, session(), [], [terminal]);
    const results: ChallengeResult[] = [];

    client.onResult((value) => results.push(value));
    await Promise.resolve();

    assert.deepEqual(results, [terminal]);
    socket.trigger(protocolEvents.result, terminal);
    assert.deepEqual(results, [terminal]);
    client.dispose();
});

test('lost Practice acknowledgement retries the exact request and applies authority once', async () => {
    installBrowserStorage();
    const socket = new AckFaultSocket('lost-first');
    adoptSession(socket as unknown as Socket, session());
    const client = new PracticeClient(socket as unknown as Socket, session());
    const delivered: ChallengeSnapshot[] = [];
    client.onSnapshot((value) => delivered.push(value));

    const created = await client.start('wizard');

    assert.equal(socket.requests.length, 2);
    assert.deepEqual(socket.requests[1], socket.requests[0]);
    assert.equal(created.challengeId, 'practice_challenge_01');
    assert.equal(created.nextSequence, 1);
    assert.equal(delivered.length, 1);
    assert.equal(client.currentSnapshot()?.challengeId, created.challengeId);
    client.dispose();
});

test('delayed Practice acknowledgement serializes mutations without a duplicate command', async () => {
    installBrowserStorage();
    const socket = new AckFaultSocket('delayed');
    adoptSession(socket as unknown as Socket, session());
    const client = new PracticeClient(socket as unknown as Socket, session());

    const pending = client.start('thief');
    await Promise.resolve();
    await assert.rejects(
        () => client.start('warrior'),
        /Another practice action is still pending/
    );
    const created = await pending;

    assert.equal(socket.requests.length, 1);
    assert.equal((socket.requests[0] as { calling: string }).calling, 'thief');
    assert.equal(created.calling, 'thief');
    client.dispose();
});

test('practice client delivers terminal results for consecutive challenge IDs', () => {
    const socket = new FakeSocket();
    const client = new PracticeClient(socket as unknown as Socket, session());
    const results: ChallengeResult[] = [];
    client.onResult((value) => results.push(value));

    socket.trigger(protocolEvents.result, result(4, 'practice_challenge_01'));
    socket.trigger(protocolEvents.result, result(8, 'practice_challenge_02'));
    socket.trigger(protocolEvents.result, result(8, 'practice_challenge_02'));

    assert.deepEqual(results.map((value) => value.challengeId), [
        'practice_challenge_01',
        'practice_challenge_02'
    ]);
    client.dispose();
});

function session(): SessionOpenData {
    return {
        protocolVersion: 1,
        serverTimeMs: 0,
        sessionId: 'practice_session_01',
        token: 'a'.repeat(43),
        resumed: false,
        expiresAt: '2099-01-01T00:00:00.000Z'
    };
}

function snapshot(revision: number, hash: string, paused: boolean): ChallengeSnapshot {
    return {
        protocolVersion: 1,
        serverTimeMs: revision,
        sessionId: 'practice_session_01',
        challengeId: 'practice_challenge_01',
        mode: 'practice',
        calling: 'wizard',
        loomkeeperDifficulty: 'standard',
        loomkeeperPolicyId: 'nimble-knots-loomkeeper-v2',
        status: 'active',
        paused,
        revision,
        nextSequence: revision,
        expiresAt: '2099-01-01T00:00:00.000Z',
        stateHash: hash.repeat(64),
        simulation: createLatestSimulation(1, 'wizard') as ChallengeSnapshot['simulation']
    };
}

function result(revision: number, challengeId = 'practice_challenge_01'): ChallengeResult {
    return {
        protocolVersion: 1,
        serverTimeMs: revision,
        sessionId: 'practice_session_01',
        challengeId,
        outcome: 'draw',
        revision,
        nextSequence: revision,
        finalTick: 900,
        finalStateHash: 'c'.repeat(64)
    };
}

class FakeSocket {
    public connected = true;
    private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();

    public on(event: string, listener: (...args: unknown[]) => void): this {
        const listeners = this.listeners.get(event) ?? new Set();
        listeners.add(listener);
        this.listeners.set(event, listeners);
        return this;
    }

    public off(event: string, listener: (...args: unknown[]) => void): this {
        this.listeners.get(event)?.delete(listener);
        return this;
    }

    public trigger(event: string, value: unknown): void {
        for (const listener of this.listeners.get(event) ?? []) listener(value);
    }
}

class AckFaultSocket extends FakeSocket {
    public readonly requests: unknown[] = [];

    public constructor(private readonly fault: 'lost-first' | 'delayed') {
        super();
    }

    public timeout(): this {
        return this;
    }

    public emit(event: string, ...args: unknown[]): boolean {
        if (event !== protocolEvents.challengeCreate) return true;
        const request = args[0] as { requestId: string; calling: 'wizard' | 'thief' | 'warrior' };
        const callback = args[1] as (error: Error | null, ack?: unknown) => void;
        this.requests.push(structuredClone(request));
        if (this.fault === 'lost-first' && this.requests.length === 1) {
            queueMicrotask(() => callback(new Error('simulated lost acknowledgement')));
            return true;
        }
        const respond = () => callback(null, {
            protocolVersion: PROTOCOL_VERSION,
            serverTimeMs: 1_700_000_000_000,
            ok: true,
            requestId: request.requestId,
            data: {
                ...snapshot(0, 'a', false),
                calling: request.calling,
                nextSequence: 1
            }
        });
        if (this.fault === 'delayed') setTimeout(respond, 25);
        else queueMicrotask(respond);
        return true;
    }
}

class MemoryStorage {
    private readonly values = new Map<string, string>();

    public getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }

    public setItem(key: string, value: string): void {
        this.values.set(key, value);
    }

    public removeItem(key: string): void {
        this.values.delete(key);
    }
}

function installBrowserStorage(): void {
    Object.assign(globalThis, {
        sessionStorage: new MemoryStorage(),
        window: { setTimeout, clearTimeout }
    });
}
