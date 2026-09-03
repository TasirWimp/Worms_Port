import assert from 'node:assert/strict';
import test from 'node:test';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { ActionTurnsV8Client, type ActionTurnsV8Clock } from '../../client/src/practice/action-turns-v8';
import { adoptSession, bootstrapSession, whenSessionReady } from '../../client/src/lib/session';
import { protocolEvents, type SessionOpenData } from '../../shared/protocol';
import { protocolEventsV8, SimulationSnapshotV8Schema, type ChallengeSnapshotV8, type ChallengeResultV8 } from '../../shared/protocol-v8';
import { V8_LOOMKEEPER_POLICY_ID, V8_LOOMKEEPER_PROFILE_ID } from '../../shared/combat-version';
import { createSimulationV8, applySimulationIntentV8, advanceSimulationTicksV8,
    applySimulationBarrierV8, V8_RULESET_ID, type SimulationIntentV8, type SimulationStateV8 } from '../../shared/simulation-v8';
import { createRuntimeServer } from '../../server/src/runtime';

test('V8 allows one normal input and one coalesced refresh, never queues jump/Fire/walk', async () => {
    const { client, socket, clock, authority } = await fixture();
    const start = client.submitIntent({ type: 'walk_start', direction: 1 });
    for (const intent of [{ type: 'jump' }, { type: 'fire', aimId: 0 },
        { type: 'walk_start', direction: -1 }] as SimulationIntentV8[]) {
        await assert.rejects(client.submitIntent(intent), /pending/i);
    }
    socket.replyInput(0, authority.intent({ type: 'walk_start', direction: 1 }));
    await start;
    authority.ticks(3); socket.trigger(protocolEventsV8.snapshot, authority.snapshot);
    clock.advance(100);
    assert.equal(socket.inputs.length, 2);
    assert.equal(socket.inputs[1].body.inputSequence, 1);
    clock.advance(100);
    authority.ticks(3); socket.trigger(protocolEventsV8.snapshot, authority.snapshot);
    assert.equal(socket.inputs.length, 2);
    socket.replyInput(1, authority.intent({ type: 'walk_refresh' }));
    await flush();
    // Coalesced refresh may send only after another 3 authoritative ticks.
    assert.ok(socket.inputs.length <= 3);
    assert.deepEqual(socket.inputs.slice(1).map(packet => packet.body.intent.type),
        Array(socket.inputs.length - 1).fill('walk_refresh'));
    client.dispose();
});

test('V8 250ms watchdog sends independent neutral, rejects once, ignores the late ack', async () => {
    const { client, socket, clock, authority } = await fixture();
    const promise = client.submitIntent({ type: 'jump' });
    const rejected = assert.rejects(promise, /timed out/i);
    clock.advance(200);
    authority.ticks(6); socket.trigger(protocolEventsV8.snapshot, authority.snapshot);
    clock.advance(49);
    assert.equal(socket.cancels.length, 0);
    clock.advance(1);
    await rejected;
    assert.equal(socket.inputs.length, 1);
    assert.equal(socket.cancels.length, 1);
    const late = authority.intent({ type: 'jump' });
    const neutral = authority.cancel();
    socket.replyCancel(0, neutral);
    await flush();
    socket.replyInput(0, late);
    await flush();
    assert.equal(client.currentSnapshot()!.simulation.inputEpoch, neutral.simulation.inputEpoch);
    assert.equal(client.currentSnapshot()!.simulation.heldDirection, 0);
    assert.equal(socket.inputs.length, 1);
    client.dispose();
});

test('V8 permanently lost acknowledgement recovers with neutral authority and a fresh press', async () => {
    const { client, socket, clock, authority } = await fixture();
    const lost = client.submitIntent({ type: 'walk_start', direction: 1 });
    const rejection = assert.rejects(lost, /timed out/);
    authority.intent({ type: 'walk_start', direction: 1 });
    clock.advance(200); authority.ticks(6); socket.trigger(protocolEventsV8.snapshot, authority.snapshot);
    clock.advance(50); await rejection;
    socket.replyCancel(0, authority.cancel()); await flush();
    const fresh = client.submitIntent({ type: 'walk_start', direction: -1 });
    assert.equal(socket.inputs.length, 2);
    assert.equal(socket.inputs[1].body.inputSequence, 1);
    assert.notEqual(socket.inputs[0].body.requestId, socket.inputs[1].body.requestId);
    socket.replyInput(1, authority.intent({ type: 'walk_start', direction: -1 })); await fresh;
    client.dispose();
});

test('V8 timeout with unconsumed server cursor rebinds before a fresh normal packet', async () => {
    installStorage();
    const { client, socket, clock, authority } = await fixture();
    adoptSession(asSocket(socket), session());
    const pending = client.submitIntent({ type: 'jump' });
    const rejected = assert.rejects(pending, /timed out/);
    clock.advance(200); authority.ticks(6); socket.trigger(protocolEventsV8.snapshot, authority.snapshot);
    clock.advance(50); await rejected;
    socket.replyCancel(0, authority.cancel()); await flush();
    assert.equal(socket.disconnectCount, 1, 'An unresolved old normal packet needs a transport boundary.');
    await assert.rejects(client.submitIntent({ type: 'jump' }), /disconnect|resynchron/i);
    assert.equal(socket.inputs.length, 1);
    const sessionPacket = socket.requests.find(packet => packet.event === protocolEvents.sessionOpen)!;
    assert.ok(sessionPacket);
    socket.reply(sessionPacket, { protocolVersion: 1, serverTimeMs: 0, requestId: sessionPacket.body.requestId,
        ok: true, data: { ...session(), resumed: true } });
    socket.trigger(protocolEventsV8.snapshot, authority.cancel()); await flush();
    const fresh = client.submitIntent({ type: 'jump' });
    assert.equal(socket.inputs.length, 2); assert.equal(socket.inputs[1].body.inputSequence, 0);
    // The old connection cannot supply authority in the replacement generation.
    socket.failure(0, 'UNAUTHORIZED', 100);
    socket.replyInput(1, authority.intent({ type: 'jump' })); await fresh;
    assert.equal(client.currentSnapshot()!.nextInputSequence, 1);
    client.dispose();
});

test('V8 delayed accepted ack behind newer same-epoch authority does not rewind or cancel a healthy hold', async () => {
    const { client, socket, clock, authority } = await fixture();
    const walk = client.submitIntent({ type: 'walk_start', direction: 1 });
    const ack = authority.intent({ type: 'walk_start', direction: 1 });
    const newer = authority.ticks(3); socket.trigger(protocolEventsV8.snapshot, newer);
    socket.replyInput(0, ack);
    assert.deepEqual(await walk, newer);
    assert.deepEqual(client.currentSnapshot(), newer);
    clock.advance(100);
    assert.equal(socket.inputs[1].body.intent.type, 'walk_refresh');
    assert.equal(socket.cancels.length, 0);
    client.dispose();
});

test('V8 lost ack after published Fire does not strand the later retreat or cancel AI/projectile authority', async () => {
    const { client, socket, clock, authority } = await fixture();
    const aim = client.submitIntent({ type: 'aim', angleMilliDegrees: 45000, powerPermille: 800 });
    socket.replyInput(0, authority.intent({ type: 'aim', angleMilliDegrees: 45000, powerPermille: 800 })); await aim;
    const intent: SimulationIntentV8 = { type: 'fire', aimId: authority.snapshot.simulation.aimId };
    const fire = client.submitIntent(intent); const rejected = assert.rejects(fire, /timed out/i);
    socket.trigger(protocolEventsV8.snapshot, authority.intent(intent));
    clock.advance(250); await rejected;
    for (let tick = 0; tick < 420 && authority.snapshot.simulation.phase !== 'retreat'; tick++) authority.ticks(1);
    assert.equal(authority.snapshot.simulation.phase, 'retreat');
    socket.trigger(protocolEventsV8.snapshot, authority.snapshot);
    const retreat = client.submitIntent({ type: 'walk_start', direction: -1 });
    assert.equal(socket.inputs.length, 3); assert.equal(socket.inputs[2].body.inputSequence, 2);
    assert.equal(socket.cancels.length, 0); assert.equal(socket.disconnectCount, 0);
    socket.replyInput(2, authority.intent({ type: 'walk_start', direction: -1 })); await retreat;
    client.dispose();
});

test('V8 cancel bypasses pending input and preserves the physical one-in-flight bound', async () => {
    const { client, socket, clock, authority } = await fixture();
    const start = client.submitIntent({ type: 'walk_start', direction: -1 });
    const rejected = assert.rejects(start, /cancel/i);
    const stopped = client.cancelInput();
    assert.equal(socket.cancels.length, 1);
    assert.equal(socket.cancels[0].body.expectedTurn, 0);
    assert.equal(socket.cancels[0].body.inputEpoch, 0);
    assert.equal('inputSequence' in socket.cancels[0].body, false);
    socket.replyCancel(0, authority.cancel());
    await stopped; await rejected;
    await assert.rejects(client.submitIntent({ type: 'jump' }), /pending|resynchron/i);
    const late = authority.intent({ type: 'walk_start', direction: -1 });
    socket.replyInput(0, late);
    await flush();
    assert.equal(client.currentSnapshot()!.simulation.heldDirection, 0);
    // A new neutral read reconciles the cursor consumed after the first cancel.
    assert.equal(socket.cancels.length, 2);
    socket.replyCancel(1, authority.cancel()); await flush();
    clock.advance(100);
    assert.equal(socket.inputs.length, 1);
    const jump = client.submitIntent({ type: 'jump' });
    assert.equal(socket.inputs[1].body.inputSequence, 1);
    socket.replyInput(1, authority.intent({ type: 'jump' })); await jump;
    client.dispose();
});

test('V8 strict snapshots cannot change challenge/version or corrupt cursor on stale/conflicting authority', async () => {
    const { client, socket, authority } = await fixture();
    const errors: string[] = []; client.onError(message => errors.push(message));
    const current = authority.ticks(3); socket.trigger(protocolEventsV8.snapshot, current);
    for (const candidate of [
        { ...current, protocolVersion: 1 },
        { ...current, challengeId: 'foreign_challenge_01', nextInputSequence: 90 },
        { ...current, sessionId: 'foreign_session_01', nextInputSequence: 90 },
        { ...current, stateHash: 'b'.repeat(64), nextInputSequence: 90 },
        { ...snapshot(), nextInputSequence: 90 },
        { ...current, simulation: { ...current.simulation, position: 10 } }
    ]) socket.trigger(protocolEventsV8.snapshot, candidate);
    assert.deepEqual(client.currentSnapshot(), current);
    const jump = client.submitIntent({ type: 'jump' });
    assert.equal(socket.inputs[0].body.inputSequence, 0);
    socket.replyInput(0, authority.intent({ type: 'jump' })); await jump;
    assert.ok(errors.length >= 3);
    client.dispose();
});

test('V8 bound challenge mode, Calling and seed remain immutable even at a higher revision', async () => {
    const { client, socket, authority } = await fixture();
    const original = client.currentSnapshot();
    const higher = authority.ticks(3);
    for (const candidate of [
        { ...higher, mode: 'reward', nextInputSequence: 99 },
        { ...higher, calling: 'warrior', nextInputSequence: 99 },
        { ...higher, simulation: { ...higher.simulation, seed: 2 }, nextInputSequence: 99 }
    ]) socket.trigger(protocolEventsV8.snapshot, candidate);
    assert.deepEqual(client.currentSnapshot(), original);
    const jump = client.submitIntent({ type: 'jump' });
    assert.equal(socket.inputs[0].body.inputSequence, 0);
    socket.replyInput(0, authority.intent({ type: 'jump' })); await jump;
    client.dispose();
});

test('V8 consumed rejection and sequence failure reconcile without replaying the intent', async () => {
    const { client, socket, authority } = await fixture();
    const rejected = client.submitIntent({ type: 'fire', aimId: 0 });
    socket.failure(0, 'COMMAND_REJECTED', 1); await assert.rejects(rejected, /COMMAND_REJECTED/);
    authority.snapshot.nextInputSequence = 1;
    socket.replyCancel(0, authority.cancel()); await flush();
    const next = client.submitIntent({ type: 'jump' });
    assert.equal(socket.inputs[1].body.inputSequence, 1);
    socket.failure(1, 'SEQUENCE_GAP', 0); await assert.rejects(next, /SEQUENCE_GAP/);
    // The neutral read supplies the current cursor; no rejected action is retried.
    socket.replyCancel(1, authority.cancel()); await flush();
    assert.equal(socket.inputs.length, 2);
    client.dispose();
});

test('V8 held walk survives ordinary snapshots, phase/epoch change requires a fresh press', async () => {
    const { client, socket, clock, authority } = await fixture();
    const start = client.submitIntent({ type: 'walk_start', direction: 1 });
    socket.replyInput(0, authority.intent({ type: 'walk_start', direction: 1 })); await start;
    authority.ticks(3); socket.trigger(protocolEventsV8.snapshot, authority.snapshot);
    clock.advance(100);
    assert.equal(socket.inputs[1].body.intent.type, 'walk_refresh');
    socket.replyInput(1, authority.intent({ type: 'walk_refresh' })); await flush();
    authority.ticks(447); socket.trigger(protocolEventsV8.snapshot, authority.snapshot);
    clock.advance(200); await flush();
    assert.equal(socket.inputs.length, 2);
    await assert.rejects(client.submitIntent({ type: 'jump' }), /player|phase|unavailable/i);
    assert.equal(socket.cancels.length, 0, 'Player must not cancel AI-owned input.');
    client.dispose();
});

test('V8 duplicate stale snapshots do not keep a hold alive beyond six ticks', async () => {
    const { client, socket, clock, authority } = await fixture();
    const start = client.submitIntent({ type: 'walk_start', direction: 1 });
    socket.replyInput(0, authority.intent({ type: 'walk_start', direction: 1 })); await start;
    clock.advance(100); // No 3-tick advancement: do not refresh early.
    socket.trigger(protocolEventsV8.snapshot, authority.snapshot);
    clock.advance(101);
    assert.equal(socket.cancels.length, 1);
    assert.equal(socket.inputs.length, 1);
    socket.replyCancel(0, authority.cancel()); await flush();
    clock.advance(100);
    assert.equal(socket.inputs.length, 1);
    client.dispose();
});

test('V8 result validates identity, delivers once, buffers bootstrap, and stops late active snapshots', async () => {
    const socket = new FakeSocket(); const clock = new FakeClock();
    const terminal = result();
    const client = await ActionTurnsV8Client.attach(asSocket(socket), session(), [], [terminal], clock);
    const received: ChallengeResultV8[] = [];
    client.onResult(value => received.push(value)); await flush();
    socket.trigger(protocolEventsV8.result, terminal);
    socket.trigger(protocolEventsV8.result, { ...terminal, outcome: 'player_win' });
    socket.trigger(protocolEventsV8.result, { ...terminal, challengeId: 'foreign_challenge_01' });
    socket.trigger(protocolEventsV8.snapshot, snapshot());
    assert.deepEqual(received, [terminal]);
    assert.equal(client.currentSnapshot(), undefined);
    await assert.rejects(client.submitIntent({ type: 'jump' }), /available|finished/i);
    client.dispose();
});

test('V8 disconnect discards ownership, resume buffers authority before session readiness and never resends', async () => {
    installStorage();
    const { client, socket, clock, authority } = await fixture();
    adoptSession(asSocket(socket), session());
    const states: string[] = []; client.onConnection(state => states.push(state));
    const start = client.submitIntent({ type: 'walk_start', direction: 1 });
    const rejected = assert.rejects(start, /disconnect/i);
    socket.connected = false; socket.trigger('disconnect'); await rejected;
    socket.connected = true; socket.trigger('connect');
    socket.trigger(protocolEventsV8.snapshot, authority.cancel());
    await flush(); clock.advance(200);
    assert.deepEqual(states, ['reconnecting', 'connected']);
    assert.equal(socket.inputs.length, 1);
    assert.equal(client.currentSnapshot()!.simulation.heldDirection, 0);
    client.dispose();
    assert.equal(socket.listenerCount(), 0);
    clock.advance(1000); assert.equal(socket.inputs.length, 1);
});

test('V8 lifecycle uses V8 envelopes and session cursor independently of normal input', async () => {
    const { client, socket, authority } = await fixture();
    authority.snapshot.nextSequence = 7;
    authority.ticks(3); socket.trigger(protocolEventsV8.snapshot, authority.snapshot);
    const pause = client.setPaused(true);
    const pausePacket = socket.requests.find(request => request.event === protocolEventsV8.pause)!;
    assert.equal(pausePacket.body.sequence, 7);
    assert.equal(pausePacket.body.rulesetId, V8_RULESET_ID);
    authority.snapshot.paused = true;
    authority.snapshot.simulation.revision++;
    authority.snapshot.simulation.inputEpoch++;
    authority.snapshot.stateHash = 'c'.repeat(64);
    socket.reply(pausePacket, { protocolVersion: 8, requestId: pausePacket.body.requestId,
        nextSequence: 8, ok: true, data: authority.snapshot });
    await pause;
    const left = client.leave();
    const leavePacket = socket.requests.find(request => request.event === protocolEventsV8.leave)!;
    assert.equal(leavePacket.body.sequence, 8);
    socket.reply(leavePacket, { protocolVersion: 8, requestId: leavePacket.body.requestId,
        nextSequence: 9, ok: true, data: result() });
    assert.equal((await left).outcome, 'left');
    assert.equal(socket.inputs.length, 0);
    client.dispose();
});

test('V8 lifecycle rejects the other success payload kind before applying it', async () => {
    const { client, socket } = await fixture();
    const pause = client.setPaused(true);
    const packet = socket.requests[0];
    socket.reply(packet, { protocolVersion: 8, requestId: packet.body.requestId,
        nextSequence: 1, ok: true, data: result() });
    await assert.rejects(pause, /invalid|Expected/i);
    assert.equal(client.currentSnapshot()!.status, 'active');
    const jump = client.submitIntent({ type: 'jump' });
    assert.equal(socket.inputs.length, 1);
    const cancelled = assert.rejects(jump, /cancel|disposed/i); client.dispose(); await cancelled;
});

test('V8 delayed successful resume ack reconciles to newer authority without rewinding', async () => {
    const { client, socket, authority } = await fixture();
    const pause = client.setPaused(true);
    const pausePacket = socket.requests[0];
    socket.reply(pausePacket, { protocolVersion: 8, requestId: pausePacket.body.requestId,
        nextSequence: 1, ok: true, data: authority.pause(true) }); await pause;
    const resume = client.setPaused(false);
    const resumePacket = socket.requests[1];
    assert.equal(resumePacket.body.sequence, 1);
    const ack = authority.pause(false);
    authority.snapshot.nextSequence = 2;
    const newer = authority.ticks(3); socket.trigger(protocolEventsV8.snapshot, newer);
    socket.reply(resumePacket, { protocolVersion: 8, requestId: resumePacket.body.requestId,
        nextSequence: 2, ok: true, data: ack });
    assert.deepEqual(await resume, newer);
    assert.deepEqual(client.currentSnapshot(), newer);
    client.dispose();
});

test('V8 malformed reconnect authority cannot re-enable input or adopt another session', async () => {
    installStorage();
    const { client, socket, authority } = await fixture();
    adoptSession(asSocket(socket), session());
    socket.connected = false; socket.trigger('disconnect');
    socket.connected = true; socket.trigger('connect');
    socket.trigger(protocolEventsV8.snapshot, { ...authority.snapshot, protocolVersion: 1 });
    await flush();
    assert.equal(socket.cancels.length, 1);
    await assert.rejects(client.submitIntent({ type: 'jump' }), /resynchron/i);
    socket.replyCancel(0, authority.cancel()); await flush();
    const unavailable: string[] = []; client.onUnavailable(value => unavailable.push(value));
    socket.connected = false; socket.trigger('disconnect');
    adoptSession(asSocket(socket), { ...session(), sessionId: 'new_unrelated_session' });
    socket.connected = true; socket.trigger('connect'); await flush();
    assert.equal(unavailable.length, 1); assert.equal(client.currentSnapshot(), undefined);
    client.dispose();
});

test('V8 adapter speaks the actual B runtime: resume bootstrap, pause, input, cancel and leave', async () => {
    installStorage();
    const runtime = createRuntimeServer({ allowMissingOrigin: true, sessionRegistry: {
        simulationTickIntervalMs: false, v8TestOnly: { nowUs: () => 0 }, seedSource: () => 1 } });
    let socket: Socket | undefined; let client: ActionTurnsV8Client | undefined;
    try {
        const port = await runtime.listen();
        const opened = runtime.sessions.create('previous_v8_socket'); assert.ok(!('code' in opened));
        const owner = runtime.sessions.getBound('previous_v8_socket')!;
        const initial = runtime.sessions.createChallengeV8ForTest(owner, 'practice', 'wizard');
        assert.ok(!('code' in initial));
        runtime.sessions.disconnect('previous_v8_socket');
        sessionStorage.setItem('nimble-knots.session-token', opened.token);
        socket = io(`http://127.0.0.1:${port}`, { transports: ['websocket'], reconnection: false });
        const resumed = await bootstrapSession(socket);
        client = await ActionTurnsV8Client.attach(socket, resumed, [], [], new FakeClock());
        assert.equal(client.currentSnapshot()?.challengeId, initial.challengeId);
        const paused = await client.setPaused(true); assert.equal(paused.paused, true);
        const resumedMatch = await client.setPaused(false); assert.equal(resumedMatch.paused, false);
        const walk = await client.submitIntent({ type: 'walk_start', direction: 1 });
        assert.equal(walk.nextInputSequence, 1);
        assert.equal(owner.nextSequence, 2);
        const stopped = await client.cancelInput(); assert.ok(stopped);
        assert.equal(stopped.simulation.heldDirection, 0);
        const aim = await client.submitIntent({ type: 'aim', angleMilliDegrees: 45000, powerPermille: 800 });
        const shot = await client.submitIntent({ type: 'fire', aimId: aim.simulation.aimId });
        assert.equal(shot.simulation.phase, 'projectile', 'The pre-ack Fire snapshot is committed authority, not a canceled Fire.');
        const results: ChallengeResultV8[] = []; client.onResult(value => results.push(value));
        assert.equal((await client.leave()).outcome, 'left');
        await flush(); assert.equal(results.length, 1); assert.equal(owner.nextSequence, 3);
        assert.equal((await whenSessionReady(socket)).sessionId, opened.sessionId);
    } finally { client?.dispose(); socket?.close(); await runtime.close(); }
});

function session(): SessionOpenData {
    return { protocolVersion: 1, serverTimeMs: 0, sessionId: 'v8_client_session_01', token: 'a'.repeat(43),
        resumed: false, expiresAt: '2099-01-01T00:00:00.000Z' };
}
function snapshot(): ChallengeSnapshotV8 {
    return { protocolVersion: 8, serverTimeMs: 0, sessionId: session().sessionId,
        challengeId: 'v8_client_challenge_01', mode: 'practice', calling: 'wizard', status: 'active',
        rulesetId: V8_RULESET_ID, loomkeeperPolicyId: V8_LOOMKEEPER_POLICY_ID,
        loomkeeperProfileId: V8_LOOMKEEPER_PROFILE_ID, paused: false, nextSequence: 0, nextInputSequence: 0,
        expiresAt: session().expiresAt, simulation: wireState(createSimulationV8(1, 'wizard')), stateHash: '0'.repeat(64) };
}
function result(): ChallengeResultV8 {
    const initial = snapshot();
    return { protocolVersion: 8, serverTimeMs: 900, sessionId: initial.sessionId, challengeId: initial.challengeId,
        rulesetId: V8_RULESET_ID, loomkeeperPolicyId: V8_LOOMKEEPER_POLICY_ID,
        loomkeeperProfileId: V8_LOOMKEEPER_PROFILE_ID, nextInputSequence: 0,
        outcome: 'left', finalTick: 900, finalStateHash: 'd'.repeat(64) };
}
class Authority {
    public snapshot = snapshot();
    private state = createSimulationV8(1, 'wizard');
    public intent(intent: SimulationIntentV8): ChallengeSnapshotV8 {
        const transition = applySimulationIntentV8(this.state, 'player', intent, this.state.turn);
        assert.equal(transition.accepted, true, transition.error?.message);
        this.state = transition.state;
        this.snapshot.simulation = wireState(this.state); this.snapshot.nextInputSequence++;
        this.snapshot.stateHash = this.snapshot.simulation.revision.toString(16).padStart(64, '0');
        return structuredClone(this.snapshot);
    }
    public ticks(count: number): ChallengeSnapshotV8 {
        this.state = advanceSimulationTicksV8(this.state, count).state;
        this.snapshot.simulation = wireState(this.state);
        this.snapshot.serverTimeMs += count * 34;
        this.snapshot.stateHash = this.snapshot.simulation.revision.toString(16).padStart(64, '0');
        return structuredClone(this.snapshot);
    }
    public cancel(): ChallengeSnapshotV8 {
        const state = this.state;
        this.state = applySimulationBarrierV8(state, { reason: 'cancel', actor: 'player',
            expectedTurn: state.turn, expectedEpoch: state.inputEpoch }).state;
        this.snapshot.simulation = wireState(this.state);
        this.snapshot.stateHash = this.snapshot.simulation.revision.toString(16).padStart(64, '0');
        return structuredClone(this.snapshot);
    }
    public pause(paused: boolean): ChallengeSnapshotV8 {
        this.state = applySimulationBarrierV8(this.state, { reason: paused ? 'pause' : 'resume', actor: 'player',
            expectedTurn: this.state.turn, expectedEpoch: this.state.inputEpoch }).state;
        this.snapshot.simulation = wireState(this.state); this.snapshot.paused = paused;
        this.snapshot.stateHash = this.state.revision.toString(16).padStart(64, '0');
        return structuredClone(this.snapshot);
    }
}
function wireState(state: SimulationStateV8): ChallengeSnapshotV8['simulation'] {
    return SimulationSnapshotV8Schema.parse(state);
}
type Packet = { event: string; body: any; reply: (error: Error | null, ack?: unknown) => void };
class FakeSocket {
    public connected = true;
    public disconnectCount = 0;
    public requests: Packet[] = [];
    private listeners = new Map<string, Set<(...args: any[]) => void>>();
    public get inputs(): Packet[] { return this.requests.filter(packet => packet.event === protocolEventsV8.input); }
    public get cancels(): Packet[] { return this.requests.filter(packet => packet.event === protocolEventsV8.cancel); }
    public timeout(): this { return this; }
    public emit(event: string, body: unknown, reply: Packet['reply']): this {
        this.requests.push({ event, body: structuredClone(body), reply }); return this;
    }
    public on(event: string, listener: (...args: any[]) => void): this {
        const listeners = this.listeners.get(event) ?? new Set(); listeners.add(listener);
        this.listeners.set(event, listeners); return this;
    }
    public once(event: string, listener: (...args: any[]) => void): this {
        const wrapped = (...args: any[]) => { this.off(event, wrapped); listener(...args); };
        return this.on(event, wrapped);
    }
    public disconnect(): this { this.disconnectCount++; this.connected = false; this.trigger('disconnect'); return this; }
    public connect(): this { this.connected = true; this.trigger('connect'); return this; }
    public off(event: string, listener: (...args: any[]) => void): this {
        this.listeners.get(event)?.delete(listener); return this;
    }
    public trigger(event: string, value?: unknown): void {
        for (const listener of this.listeners.get(event) ?? []) listener(value);
    }
    public listenerCount(): number { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
    public reply(packet: Packet, ack: unknown): void { packet.reply(null, structuredClone(ack)); }
    public replyInput(index: number, data: ChallengeSnapshotV8): void { this.success(this.inputs[index], data); }
    public replyCancel(index: number, data: ChallengeSnapshotV8): void { this.success(this.cancels[index], data); }
    public failure(index: number, code: string, nextInputSequence: number): void {
        const packet = this.inputs[index];
        this.reply(packet, { protocolVersion: 8, requestId: packet.body.requestId, ok: false,
            nextInputSequence, error: { code, message: code, retryable: false } });
    }
    private success(packet: Packet, data: ChallengeSnapshotV8): void {
        assert.ok(packet, 'Expected wire packet');
        this.reply(packet, { protocolVersion: 8, requestId: packet.body.requestId, ok: true,
            nextInputSequence: data.nextInputSequence, data });
    }
}
class FakeClock implements ActionTurnsV8Clock {
    private time = 0; private sequence = 0;
    private tasks = new Map<number, { at: number; run: () => void }>();
    public now = (): number => this.time;
    public setTimeout = (run: () => void, delay: number): number => {
        const id = ++this.sequence; this.tasks.set(id, { at: this.time + delay, run }); return id;
    };
    public clearTimeout = (handle: unknown): void => { this.tasks.delete(handle as number); };
    public advance(ms: number): void {
        const end = this.time + ms;
        while (true) {
            const next = [...this.tasks].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!next) break;
            this.time = next[1].at; this.tasks.delete(next[0]); next[1].run();
        }
        this.time = end;
    }
}
async function fixture() {
    const socket = new FakeSocket(); const clock = new FakeClock(); const authority = new Authority();
    const client = await ActionTurnsV8Client.attach(asSocket(socket), session(), [authority.snapshot], [], clock);
    return { client, socket, clock, authority };
}
function asSocket(socket: FakeSocket): Socket { return socket as unknown as Socket; }
async function flush(): Promise<void> { for (let count = 0; count < 8; count++) await Promise.resolve(); }
function installStorage(): void {
    const values = new Map<string, string>();
    Object.assign(globalThis, { sessionStorage: { getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) },
    window: { setTimeout, clearTimeout } });
}
