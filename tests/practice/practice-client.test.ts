import assert from 'node:assert/strict';
import test from 'node:test';
import type { Socket } from 'socket.io-client';

import type { ChallengeResult, ChallengeSnapshot, SessionOpenData } from '../../shared/protocol';
import { protocolEvents } from '../../shared/protocol';
import { createLatestSimulation } from '../../shared/simulation';
import { PracticeClient } from '../../client/src/practice/client';

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
