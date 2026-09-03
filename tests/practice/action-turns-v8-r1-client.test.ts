import assert from 'node:assert/strict';
import test from 'node:test';
import type { Socket } from 'socket.io-client';
import { ActionTurnsV8Client, type ActionTurnsV8Clock } from '../../client/src/practice/action-turns-v8';
import type { SessionOpenData } from '../../shared/protocol';
import { protocolEventsV8, SimulationSnapshotV8FamilySchema, SimulationSnapshotV8R1Schema, type ChallengeSnapshotV8Family } from '../../shared/protocol-v8';
import { createSimulationV8, applySimulationIntentV8, advanceSimulationTicksV8, applySimulationBarrierV8,
    V8_R1_RULESET_ID, V8_RULESET_ID, type SimulationIntentV8Family } from '../../shared/simulation-v8';

test('V8 r1 release fences a pending Jump without hard cancellation or reconnect', async () => {
    const { client, socket, authority } = await fixture();
    const jump = client.submitIntent({ type: 'jump', direction: -1 });
    const rejected = assert.rejects(jump, /release/i);
    const release = client.releaseMovement();
    assert.equal(socket.releases.length, 1); assert.equal(socket.inputs.length, 1);
    socket.success(socket.releases[0], authority.release()); await release; await rejected;
    socket.failure(socket.inputs[0], authority.snapshot.nextInputSequence); await flush();
    assert.equal(client.inputReady(), true);
    const fresh = client.submitIntent({ type: 'face', direction: -1 });
    assert.equal(socket.inputs[1].body.inputSequence, 0);
    socket.success(socket.inputs[1], authority.intent({ type: 'face', direction: -1 })); await fresh;
    assert.equal(socket.cancels.length, 0); assert.equal(socket.disconnectCount, 0); client.dispose();
});

test('V8 r1 release after accepted Jump preserves flight through a late ack', async () => {
    const { client, socket, authority } = await fixture();
    const jump = client.submitIntent({ type: 'jump', direction: -1 }); const rejected = assert.rejects(jump, /release/i);
    const accepted = authority.intent({ type: 'jump', direction: -1 });
    const release = client.releaseMovement(); socket.success(socket.releases[0], authority.release());
    await release; await rejected;
    const x = authority.snapshot.simulation.units[0].xFp;
    socket.trigger(protocolEventsV8.snapshot, authority.ticks(3));
    socket.success(socket.inputs[0], accepted); await flush();
    assert.ok(client.currentSnapshot()!.simulation.units[0].xFp < x);
    assert.equal(client.currentSnapshot()!.simulation.units[0].vxFp, -256);
    assert.equal(socket.cancels.length, 0); assert.equal(socket.disconnectCount, 0); client.dispose();
});

test('V8 r1 release epoch proof resolves a lost normal ack at watchdog without reconnect', async () => {
    const { client, socket, authority, clock } = await fixture();
    const jump = client.submitIntent({ type: 'jump', direction: -1 }); const rejected = assert.rejects(jump, /release/i);
    authority.intent({ type: 'jump', direction: -1 });
    const release = client.releaseMovement(); socket.success(socket.releases[0], authority.release());
    await release; await rejected;
    clock.advance(200); socket.trigger(protocolEventsV8.snapshot, authority.ticks(6));
    clock.advance(50); await flush();
    assert.equal(client.inputReady(), true); assert.equal(socket.disconnectCount, 0);
    assert.equal(socket.cancels.length, 0); assert.equal(client.currentSnapshot()!.simulation.units[0].vxFp, -256);
    client.dispose();
});

test('V8 r1 explicit hard cancellation escalates while soft release is pending', async () => {
    const { client, socket, authority } = await fixture();
    const jump = client.submitIntent({ type: 'jump', direction: -1 });
    socket.success(socket.inputs[0], authority.intent({ type: 'jump', direction: -1 })); await jump;
    const release = client.releaseMovement(); const hard = client.cancelInput();
    assert.equal(socket.releases.length, 1); assert.equal(socket.cancels.length, 1);
    socket.success(socket.cancels[0], authority.cancel()); await hard;
    socket.success(socket.releases[0], authority.snapshot); await release;
    assert.equal(client.currentSnapshot()!.simulation.units[0].vxFp, 0); client.dispose();
});

test('V8 r1 normal walk_stop acknowledges itself and keeps the same epoch', async () => {
    const { client, socket, authority } = await fixture();
    const walk = client.submitIntent({ type: 'walk_start', direction: 1 });
    socket.success(socket.inputs[0], authority.intent({ type: 'walk_start', direction: 1 })); await walk;
    const epoch = client.currentSnapshot()!.simulation.inputEpoch;
    const stop = client.submitIntent({ type: 'walk_stop' });
    const stopped = authority.intent({ type: 'walk_stop' });
    socket.trigger(protocolEventsV8.snapshot, stopped); socket.success(socket.inputs[1], stopped);
    assert.equal((await stop).simulation.heldDirection, 0);
    assert.equal(client.currentSnapshot()!.simulation.inputEpoch, epoch);
    assert.equal(socket.cancels.length, 0); client.dispose();
});

test('V8 r1 hard-after-applied-soft escalates to the current epoch in either ack order', async () => {
    for (const releaseAckFirst of [true, false]) {
        const { client, socket, authority } = await fixture();
        const jump = client.submitIntent({ type: 'jump', direction: -1 });
        socket.success(socket.inputs[0], authority.intent({ type: 'jump', direction: -1 })); await jump;
        const release = client.releaseMovement(); const softState = authority.release();
        const hard = client.cancelInput();
        assert.equal(socket.cancels[0].body.inputEpoch, softState.simulation.inputEpoch - 1);
        if (releaseAckFirst) { socket.success(socket.releases[0], softState); await release; }
        // The server correctly treats this old-epoch hard request as inert.
        socket.success(socket.cancels[0], softState); await hard;
        if (!releaseAckFirst) { socket.success(socket.releases[0], softState); await release; }
        await flush();
        assert.equal(socket.cancels.length, 2, 'hard interruption must follow the soft fence once');
        assert.equal(socket.cancels[1].body.inputEpoch, softState.simulation.inputEpoch);
        socket.success(socket.cancels[1], authority.cancel()); await flush();
        assert.equal(client.currentSnapshot()!.simulation.units[0].vxFp, 0);
        assert.equal(socket.releases.length, 1); assert.equal(socket.disconnectCount, 0); client.dispose();
    }
});

test('V8 r1 readiness exposes auto-refresh flight and gives live intent priority over coalesced refresh', async () => {
    const { client, socket, authority, clock } = await fixture();
    const walk = client.submitIntent({ type: 'walk_start', direction: 1 });
    socket.success(socket.inputs[0], authority.intent({ type: 'walk_start', direction: 1 })); await walk;
    socket.trigger(protocolEventsV8.snapshot, authority.ticks(3)); clock.advance(100);
    assert.equal(socket.inputs[1].body.intent.type, 'walk_refresh');
    assert.equal(client.inputFlight(), 'locomotion'); assert.equal(client.inputReady(), false);
    let jump: Promise<ChallengeSnapshotV8Family> | undefined;
    const off = client.onInputReady(() => {
        if (!jump) jump = client.submitIntent({ type: 'jump', direction: 1 });
    });
    const refreshed = authority.intent({ type: 'walk_refresh' });
    clock.advance(100); socket.trigger(protocolEventsV8.snapshot, authority.ticks(3));
    socket.success(socket.inputs[1], refreshed); await flush();
    assert.equal(socket.inputs[2].body.intent.type, 'jump');
    off(); socket.success(socket.inputs[2], authority.intent({ type: 'jump', direction: 1 })); await jump;
    assert.equal(socket.cancels.length, 0); client.dispose();
});

test('V8 r1 immutable identity rejects original-V8 snapshot and result events', async () => {
    const { client, socket, authority } = await fixture();
    const original = client.currentSnapshot()!;
    const other = { ...original, rulesetId: V8_RULESET_ID,
        simulation: SimulationSnapshotV8FamilySchema.parse(createSimulationV8(1, 'wizard')) };
    socket.trigger(protocolEventsV8.snapshot, other);
    let results = 0; client.onResult(() => { results++; });
    socket.trigger(protocolEventsV8.result, { protocolVersion: 8, serverTimeMs: 0,
        sessionId: original.sessionId, challengeId: original.challengeId, rulesetId: V8_RULESET_ID,
        loomkeeperPolicyId: original.loomkeeperPolicyId, loomkeeperProfileId: original.loomkeeperProfileId,
        nextInputSequence: 0, outcome: 'left', finalTick: 0, finalStateHash: original.stateHash });
    assert.equal(results, 0); assert.deepEqual(client.currentSnapshot(), original);
    assert.equal(authority.snapshot.rulesetId, V8_R1_RULESET_ID); client.dispose();
});

test('V8 r1 scene completion gets readiness before an already-due refresh', async () => {
    const { client, socket, authority, clock } = await fixture();
    let scenePending = true; let jump: ReturnType<typeof client.submitIntent> | undefined;
    const walk = client.submitIntent({ type: 'walk_start', direction: 1 });
    void walk.then(() => { scenePending = false; });
    authority.intent({ type: 'walk_start', direction: 1 }); authority.ticks(3);
    clock.advance(100); await flush();
    const off = client.onInputReady(() => {
        if (!scenePending && !jump) jump = client.submitIntent({ type: 'jump', direction: 1 });
    });
    socket.success(socket.inputs[0], authority.snapshot); await walk; await flush();
    assert.equal(socket.inputs[1].body.intent.type, 'jump');
    off(); socket.success(socket.inputs[1], authority.intent({ type: 'jump', direction: 1 })); await jump;
    client.dispose();
});

test('V8 r1 double-lost release and normal acknowledgements recover from matching new-epoch snapshots', async () => {
    for (const acceptedFirst of [false, true]) {
        const { client, socket, authority, clock } = await fixture();
        const jump = client.submitIntent({ type: 'jump', direction: -1 }); const rejected = assert.rejects(jump, /release/i);
        if (acceptedFirst) authority.intent({ type: 'jump', direction: -1 });
        const release = client.releaseMovement(); const lostRelease = assert.rejects(release, /timed out/i);
        authority.release(); await rejected;
        clock.advance(100); socket.trigger(protocolEventsV8.snapshot, authority.ticks(3));
        clock.advance(100); socket.trigger(protocolEventsV8.snapshot, authority.ticks(3));
        clock.advance(50); await lostRelease; await flush();
        assert.equal(client.inputReady(), true);
        assert.equal(client.currentSnapshot()!.nextInputSequence, acceptedFirst ? 1 : 0);
        assert.equal(socket.cancels.length, 0); assert.equal(socket.disconnectCount, 0);
        if (acceptedFirst) assert.equal(client.currentSnapshot()!.simulation.units[0].vxFp, -256);
        else {
            const face = client.submitIntent({ type: 'face', direction: -1 });
            assert.equal(socket.inputs[1].body.inputSequence, 0);
            socket.success(socket.inputs[1], authority.intent({ type: 'face', direction: -1 })); await face;
        }
        client.dispose();
    }
});

test('V8 r1 double-lost acknowledgements recover when the first epoch proof is after handover', async () => {
    const { client, socket, authority, clock } = await fixture();
    const jump = client.submitIntent({ type: 'jump', direction: -1 }); const rejected = assert.rejects(jump, /release/i);
    const release = client.releaseMovement(); const lostRelease = assert.rejects(release, /timed out/i);
    authority.release(); await rejected;
    // No acknowledgement or same-turn snapshot arrives. The next authority is
    // the AI's action; after its timeout the player receives a fresh input turn.
    clock.advance(100); socket.trigger(protocolEventsV8.snapshot, authority.ticks(450));
    assert.equal(client.currentSnapshot()!.simulation.turn, 1);
    clock.advance(100); socket.trigger(protocolEventsV8.snapshot, authority.ticks(450));
    clock.advance(50); await lostRelease; await flush();
    assert.equal(client.currentSnapshot()!.simulation.turn, 2);
    assert.equal(client.currentSnapshot()!.nextInputSequence, 0);
    assert.equal(client.inputReady(), true);
    assert.equal(socket.cancels.length, 0); assert.equal(socket.disconnectCount, 0);
    const face = client.submitIntent({ type: 'face', direction: -1 });
    assert.equal(socket.inputs[1].body.inputSequence, 0);
    assert.equal(socket.inputs[1].body.expectedTurn, 2);
    socket.success(socket.inputs[1], authority.intent({ type: 'face', direction: -1 })); await face;
    client.dispose();
});

const session: SessionOpenData = { protocolVersion: 1, serverTimeMs: 0, sessionId: 'r1_client_session_01',
    token: 'a'.repeat(43), resumed: false, expiresAt: '2099-01-01T00:00:00.000Z' };
class Authority {
    private state = createSimulationV8(1, 'wizard', V8_R1_RULESET_ID);
    public snapshot: ChallengeSnapshotV8Family = { protocolVersion: 8, serverTimeMs: 0, sessionId: session.sessionId,
        challengeId: 'r1_client_challenge_01', rulesetId: V8_R1_RULESET_ID,
        loomkeeperPolicyId: 'nimble-knots-loomkeeper-v3', loomkeeperProfileId: 'standard-v8-0',
        mode: 'practice', calling: 'wizard', status: 'active', paused: false, nextSequence: 0,
        nextInputSequence: 0, expiresAt: session.expiresAt, stateHash: '0'.repeat(64),
        simulation: SimulationSnapshotV8R1Schema.parse(this.state) };
    private publish() {
        this.snapshot.simulation = SimulationSnapshotV8FamilySchema.parse(this.state);
        this.snapshot.stateHash = this.state.revision.toString(16).padStart(64, '0');
        return structuredClone(this.snapshot);
    }
    public intent(intent: SimulationIntentV8Family) {
        const next = applySimulationIntentV8(this.state, 'player', intent, this.state.turn);
        assert.equal(next.accepted, true, next.error?.message); this.state = next.state;
        this.snapshot.nextInputSequence++; return this.publish();
    }
    public ticks(count: number) { this.state = advanceSimulationTicksV8(this.state, count).state; return this.publish(); }
    public release() { return this.barrier('walk_stop'); }
    public cancel() { return this.barrier('cancel'); }
    private barrier(reason: 'walk_stop' | 'cancel') {
        this.state = applySimulationBarrierV8(this.state, { reason, actor: 'player',
            expectedTurn: this.state.turn, expectedEpoch: this.state.inputEpoch }).state; return this.publish();
    }
}
type Packet = { event: string; body: any; reply: (error: Error | null, value?: unknown) => void };
class FakeSocket {
    public connected = true; public disconnectCount = 0; public packets: Packet[] = [];
    private listeners = new Map<string, Set<(...args: any[]) => void>>();
    get inputs() { return this.packets.filter(p => p.event === protocolEventsV8.input); }
    get releases() { return this.packets.filter(p => p.event === protocolEventsV8.release); }
    get cancels() { return this.packets.filter(p => p.event === protocolEventsV8.cancel); }
    timeout() { return this; }
    emit(event: string, body: unknown, reply: Packet['reply']) { this.packets.push({ event, body, reply }); return this; }
    on(event: string, listener: (...args: any[]) => void) {
        const set = this.listeners.get(event) ?? new Set(); set.add(listener); this.listeners.set(event, set); return this;
    }
    off(event: string, listener: (...args: any[]) => void) { this.listeners.get(event)?.delete(listener); return this; }
    trigger(event: string, value?: unknown) { for (const fn of this.listeners.get(event) ?? []) fn(value); }
    disconnect() { this.disconnectCount++; this.connected = false; this.trigger('disconnect'); return this; }
    success(packet: Packet, data: ChallengeSnapshotV8Family) {
        assert.ok(packet); packet.reply(null, { protocolVersion: 8, requestId: packet.body.requestId,
            nextInputSequence: data.nextInputSequence, ok: true, data: structuredClone(data) });
    }
    failure(packet: Packet, nextInputSequence: number) { packet.reply(null, { protocolVersion: 8,
        requestId: packet.body.requestId, nextInputSequence, ok: false,
        error: { code: 'STALE_INPUT', message: 'Released epoch', retryable: false } }); }
}
class FakeClock implements ActionTurnsV8Clock {
    private time = 0; private sequence = 0; private tasks = new Map<number, { at: number; run: () => void }>();
    now = () => this.time;
    setTimeout = (run: () => void, delay: number) => {
        const id = ++this.sequence; this.tasks.set(id, { at: this.time + delay, run }); return id;
    };
    clearTimeout = (id: unknown) => { this.tasks.delete(id as number); };
    advance(ms: number) {
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
    const client = await ActionTurnsV8Client.attach(socket as unknown as Socket, session, [authority.snapshot], [], clock, V8_R1_RULESET_ID);
    return { client, socket, clock, authority };
}
async function flush() { for (let i = 0; i < 10; i++) await Promise.resolve(); }
