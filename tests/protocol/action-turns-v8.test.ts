import assert from 'node:assert/strict';
import test from 'node:test';
import { InputRequestV8Schema, InputCancelV8Schema, SimulationSnapshotV8Schema,
    InputRequestV8FamilySchema, InputReleaseV8R1Schema, ChallengeSnapshotV8Schema, ChallengeSnapshotV8FamilySchema,
    InputAckV8FamilySchema, SimulationSnapshotV8R1Schema } from '../../shared/protocol-v8';
import { createSimulationV8, V8_RULESET_ID, V8_R1_RULESET_ID } from '../../shared/simulation-v8';
import { SimulationSnapshotSchema } from '../../shared/protocol';
import { SessionRegistry } from '../../server/src/session/registry';
import { createRuntimeServer } from '../../server/src/runtime';
import { io as connectClient, type Socket } from 'socket.io-client';
import { protocolEvents } from '../../shared/protocol';
import { protocolEventsV8, InputAckV8Schema } from '../../shared/protocol-v8';
import { LifecycleAckV8Schema, jsonBytesV8 } from '../../shared/protocol-v8';
import { SimulationCoordinatorV8 } from '../../server/src/simulation/coordinator-v8';

const request = {
    requestId: 'v8_request_0001', inputSequence: 0, challengeId: 'v8_challenge_fixture',
    rulesetId: V8_RULESET_ID, expectedTurn: 0, expectedPhase: 'action', inputEpoch: 0,
    intent: { type: 'walk_start', direction: 1 }
};

test('V8 R1 release fences neutral delayed input and caches retries without consuming the fenced cursor', async () => {
    const r1 = V8_R1_RULESET_ID;
    const registry = new SessionRegistry({ simulationTickIntervalMs: false, v8TestOnly: { nowUs: () => 0 } });
    try {
        registry.create('r1_socket'); const session = registry.getBound('r1_socket')!;
        const initial = registry.createChallengeV8ForTest(session, 'practice', 'wizard', r1);
        assert.ok(!('code' in initial));
        assert.equal(initial.rulesetId, r1);
        const release = { requestId: 'r1_release_001', challengeId: initial.challengeId, rulesetId: r1, expectedTurn: 0, inputEpoch: 0 };
        const ack = registry.releaseInputV8(session, release);
        assert.ok(ack.ok); assert.equal(ack.data.simulation.inputEpoch, 1); assert.equal(ack.nextInputSequence, 0);
        const old = { ...request, challengeId: initial.challengeId, rulesetId: r1, intent: { type: 'jump', direction: 1 } };
        assert.equal((await registry.submitInputV8(session, old)).ok, false);
        assert.equal(registry.activeSnapshotV8(session)!.nextInputSequence, 0);
        assert.equal(registry.activeSnapshotV8(session)!.stateHash, ack.data.stateHash);
        assert.equal(registry.releaseInputV8(session, release).data.stateHash, ack.data.stateHash);
        const fresh = await registry.submitInputV8(session, { ...old, requestId: 'r1_fresh_jump', inputEpoch: 1 });
        assert.equal(fresh.ok, true); assert.equal(fresh.nextInputSequence, 1);
        const stop = registry.releaseInputV8(session, { ...release, requestId: 'r1_release_002', inputEpoch: 1 });
        assert.ok(stop.ok);
        assert.equal(stop.data.simulation.units[0].vxFp, 256);
        assert.equal(stop.nextInputSequence, 1);
        // An exact accepted retry is returned before the now-stale epoch check; no cursor rewind.
        assert.deepEqual(await registry.submitInputV8(session, { ...old, requestId: 'r1_fresh_jump', inputEpoch: 1 }), fresh);
        registry.cancelInputV8(session, { ...release, requestId: 'r1_hard_cancel', inputEpoch: 2 });
        assert.equal(registry.activeSnapshotV8(session)!.simulation.units[0].vxFp, 0);
    } finally { registry.dispose(); }
});

test('V8 R1 independent release rejects in-flight Jump after catch-up without consuming its cursor', async () => {
    let now = 0; let release!: () => void; let entered!: () => void;
    const yielded = new Promise<void>(resolve => { entered = resolve; });
    const registry = new SessionRegistry({ simulationTickIntervalMs: false, v8TestOnly: { nowUs: () => now,
        tickIntervalMs: 1000, yieldBatch: async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); } } });
    try {
        registry.create('r1_pending'); const session = registry.getBound('r1_pending')!;
        const initial = registry.createChallengeV8ForTest(session, 'practice', 'wizard', 'nimble-knots-artillery-v8-r1');
        assert.ok(!('code' in initial));
        assert.equal(initial.rulesetId, V8_R1_RULESET_ID);
        now = 233334;
        const pending = registry.submitInputV8(session, { ...request, challengeId: initial.challengeId, rulesetId: initial.rulesetId,
            intent: { type: 'jump', direction: 1 } });
        await yielded;
        const ack = registry.releaseInputV8(session, { requestId: 'r1_pending_release', challengeId: initial.challengeId,
            rulesetId: initial.rulesetId, expectedTurn: 0, inputEpoch: 0 });
        assert.equal(ack.nextInputSequence, 0);
        release(); assert.equal((await pending).ok, false);
        const after = registry.activeSnapshotV8(session)!;
        assert.equal(after.nextInputSequence, 0); assert.equal(after.simulation.units[0].grounded, true);
        const fresh = await registry.submitInputV8(session, { ...request, requestId: 'r1_pending_fresh', challengeId: initial.challengeId,
            rulesetId: initial.rulesetId, inputEpoch: 1, intent: { type: 'jump', direction: -1 } });
        assert.equal(fresh.ok, true);
    } finally { release?.(); registry.dispose(); }
});

test('V8 R1 strict family envelopes reject old, unknown and mixed nested identities', () => {
    const old = createSimulationV8(1, 'wizard');
    const candidate = createSimulationV8(1, 'wizard', V8_R1_RULESET_ID);
    assert.equal(SimulationSnapshotV8Schema.safeParse(candidate).success, false);
    assert.equal(SimulationSnapshotV8R1Schema.safeParse(old).success, false);
    const packet = { ...request, rulesetId: V8_R1_RULESET_ID, intent: { type: 'jump', direction: -1 } };
    assert.equal(InputRequestV8FamilySchema.safeParse(packet).success, true);
    assert.equal(InputRequestV8Schema.safeParse(packet).success, false);
    assert.equal(InputRequestV8FamilySchema.safeParse({ ...packet, intent: { type: 'jump' } }).success, false);
    assert.equal(InputRequestV8FamilySchema.safeParse({ ...packet, rulesetId: V8_RULESET_ID }).success, false);
    assert.equal(InputRequestV8FamilySchema.safeParse({ ...packet, rulesetId: V8_R1_RULESET_ID+'-unknown' }).success, false);
    const release = { requestId: request.requestId, challengeId: request.challengeId,
        rulesetId: V8_R1_RULESET_ID, expectedTurn: 0, inputEpoch: 0 };
    assert.equal(InputReleaseV8R1Schema.safeParse(release).success, true);
    assert.equal(InputReleaseV8R1Schema.safeParse({ ...release, rulesetId: V8_RULESET_ID }).success, false);
    assert.equal(InputReleaseV8R1Schema.safeParse({ ...release, inputSequence: 0 }).success, false);
    const registry = new SessionRegistry({ simulationTickIntervalMs: false, v8TestOnly: { nowUs: () => 0 } });
    try {
        registry.create('r1_identity'); const session = registry.getBound('r1_identity')!;
        const snapshot = registry.createChallengeV8ForTest(session, 'practice', 'wizard', V8_R1_RULESET_ID);
        assert.ok(!('code' in snapshot));
        assert.equal(ChallengeSnapshotV8FamilySchema.safeParse(snapshot).success, true);
        assert.equal(ChallengeSnapshotV8Schema.safeParse(snapshot).success, false);
        assert.equal(ChallengeSnapshotV8FamilySchema.safeParse({ ...snapshot, rulesetId: V8_RULESET_ID }).success, false);
        assert.equal(ChallengeSnapshotV8FamilySchema.safeParse({ ...snapshot, simulation: old }).success, false);
    } finally { registry.dispose(); }
});

test('V8 R1 release lane survives normal saturation, has its own cap, and cannot exhaust hard cancel', async () => {
    const runtime = createRuntimeServer({ allowMissingOrigin: true, sessionRegistry: {
        simulationTickIntervalMs: false, v8TestOnly: { nowUs: () => 0 } } });
    let socket: Socket | undefined;
    try {
        const port = await runtime.listen();
        socket = connectClient(`http://127.0.0.1:${port}`, { transports: ['websocket'], reconnection: false });
        await new Promise<void>(resolve => socket!.once('connect', resolve));
        await emit(socket, protocolEvents.sessionOpen, { requestId: 'r1_wire_session', action: 'create' });
        const session = runtime.sessions.getBound(socket.id!)!;
        const initial = runtime.sessions.createChallengeV8ForTest(session, 'practice', 'wizard', V8_R1_RULESET_ID);
        assert.ok(!('code' in initial));
        const packet = { ...request, challengeId: initial.challengeId, rulesetId: V8_R1_RULESET_ID };
        assert.equal((await emit(socket, protocolEventsV8.input, { ...packet, intent: { type: 'jump', direction: 1 } })).ok, true);
        let flood;
        for (let n = 0; n < 35; n++) flood = await emit(socket, protocolEventsV8.input, {
            ...packet, requestId: `r1_flood_${n}`, inputSequence: n+1, intent: { type: 'face', direction: 1 } });
        assert.equal(flood.ok, false);
        const release = { requestId: 'r1_wire_release1', challengeId: initial.challengeId,
            rulesetId: V8_R1_RULESET_ID, expectedTurn: 0, inputEpoch: 0 };
        const first = await emit(socket, protocolEventsV8.release, release);
        assert.equal(first.ok, true); assert.equal(first.data.simulation.units[0].vxFp, 256);
        assert.equal(InputAckV8FamilySchema().safeParse(first).success, true);
        const second = await emit(socket, protocolEventsV8.release, { ...release, requestId: 'r1_wire_release2', inputEpoch: 1 });
        assert.equal(second.ok, true);
        const limited = await emit(socket, protocolEventsV8.release, { ...release, requestId: 'r1_wire_release3', inputEpoch: 2 });
        assert.equal(limited.ok, false); assert.equal(limited.error.code, 'RATE_LIMITED');
        const hard = await emit(socket, protocolEventsV8.cancel, { ...release, requestId: 'r1_wire_hard', inputEpoch: 2 });
        assert.equal(hard.ok, true); assert.equal(hard.data.simulation.units[0].vxFp, 0);
    } finally { socket?.close(); await runtime.close(); }
});

test('V8 R1 registry identity survives pause, reconnect, leave and TTL expiry; V1 paths refuse both revisions', async () => {
    for (const ending of ['left', 'expired'] as const) {
        let now = 0;
        const registry = new SessionRegistry({ now: () => now, challengeTtlMs: 1000,
            simulationTickIntervalMs: false, v8TestOnly: { nowUs: () => 0 } });
        try {
            const opened = registry.create('r1_lifecycle'); assert.ok(!('code' in opened));
            const session = registry.getBound('r1_lifecycle')!;
            const created = registry.createChallengeV8ForTest(session, 'practice', 'wizard', V8_R1_RULESET_ID);
            assert.ok(!('code' in created));
            assert.equal(registry.activeSnapshot(session), undefined);
            const ordinary = registry.createChallenge(session, 'practice', 'wizard');
            assert.ok('code' in ordinary);
            const paused = await registry.setChallengePausedV8(session, created.challengeId, true);
            assert.ok(!('code' in paused)); assert.equal(paused.rulesetId, V8_R1_RULESET_ID);
            registry.disconnect('r1_lifecycle');
            assert.ok(registry.resume(opened.token, 'r1_resumed').data);
            assert.equal(registry.activeSnapshotV8(session)!.rulesetId, V8_R1_RULESET_ID);
            await registry.setChallengePausedV8(session, created.challengeId, false);
            if (ending === 'left') {
                const result = registry.leaveChallengeV8(session, created.challengeId);
                assert.ok(!('code' in result)); assert.equal(result.rulesetId, V8_R1_RULESET_ID);
            } else { now = 1001; registry.sweep(); }
            assert.equal(registry.activeSnapshotV8(session)!.status, ending);
            const replay = registry.replayForChallengeV8(session, created.challengeId)!;
            assert.equal(replay.rulesetId, V8_R1_RULESET_ID);
            const verifier = new SimulationCoordinatorV8();
            try { assert.equal(verifier.reconstructAndVerify(replay).stateHash, registry.activeSnapshotV8(session)!.stateHash); }
            finally { verifier.dispose(); }
        } finally { registry.dispose(); }
    }
});
test('V8 separate strict intent and snapshot identities do not widen legacy validation', () => {
    assert.equal(InputRequestV8Schema.safeParse(request).success, true);
    for (const patch of [{ x: 1 }, { elapsedTime: 2 }, { duration: 9 }, { rulesetId: 'nimble-knots-artillery-v7' },
        { inputSequence: 2 ** 32 }, { expectedTurn: 17 }, { inputEpoch: 65536 }, { expectedPhase: 'awaiting_command' }]) {
        assert.equal(InputRequestV8Schema.safeParse({ ...request, ...patch }).success, false);
    }
    assert.equal(InputRequestV8Schema.safeParse({ ...request, intent: { ...request.intent, lease: 9 } }).success, false);
    const state = createSimulationV8(1, 'wizard');
    assert.equal(SimulationSnapshotV8Schema.safeParse(state).success, true);
    assert.equal(SimulationSnapshotSchema.safeParse(state).success, false);
    assert.equal(SimulationSnapshotV8Schema.safeParse({ ...state, movementRemaining: 64 }).success, false);
    assert.equal(InputCancelV8Schema.safeParse({ requestId: request.requestId, challengeId: request.challengeId,
        rulesetId: V8_RULESET_ID, expectedTurn: 0, inputEpoch: 0 }).success, true);
});

test('V8 registry input lane is independent of legacy sequence; exact retries are inert', async () => {
    const registry = new SessionRegistry({ simulationTickIntervalMs: false,
        v8TestOnly: { nowUs: () => 0 }, seedSource: () => 1 });
    try {
        const opened = registry.create('socket_v8');
        assert.ok(!('code' in opened));
        const session = registry.getBound('socket_v8')!;
        const created = registry.createChallengeV8ForTest(session, 'practice', 'wizard');
        assert.ok(!('code' in created));
        const packet = { ...request, challengeId: created.challengeId };
        const first = await registry.submitInputV8(session, packet);
        assert.equal(first.ok, true);
        assert.deepEqual(await registry.submitInputV8(session, packet), first);
        assert.equal(session.nextSequence, 0);
        assert.equal((await registry.submitInputV8(session, { ...packet, intent: { type: 'jump' } })).ok, false);
        const cancel = registry.cancelInputV8(session, { requestId: 'v8_cancel_0001',
            challengeId: packet.challengeId, rulesetId: V8_RULESET_ID, expectedTurn: 0, inputEpoch: 0 });
        assert.equal(cancel.ok, true);
        const snapshot = registry.activeSnapshotV8(session)!;
        assert.equal(snapshot.simulation.heldDirection, 0);
        assert.equal(snapshot.nextInputSequence, 1);
        assert.equal(snapshot.simulation.inputEpoch, 1);
    } finally { registry.dispose(); }
});

test('V8 expected-sequence rejection consumes only the cursor, gap/stale packets never queue', async () => {
    const registry = new SessionRegistry({ simulationTickIntervalMs: false, v8TestOnly: { nowUs: () => 0 } });
    try {
        registry.create('socket_v8');
        const session = registry.getBound('socket_v8')!;
        const snapshot = registry.createChallengeV8ForTest(session, 'practice', 'wizard');
        assert.ok(!('code' in snapshot));
        const packet = { ...request, challengeId: snapshot.challengeId };
        const rejected = await registry.submitInputV8(session, { ...packet, expectedTurn: 1 });
        assert.equal(rejected.ok, false);
        assert.equal(rejected.nextInputSequence, 1);
        assert.equal(registry.activeSnapshotV8(session)!.stateHash, snapshot.stateHash);
        for (const inputSequence of [0,2]) {
            assert.equal((await registry.submitInputV8(session, { ...packet, requestId: `rejected_${inputSequence}`, inputSequence })).ok, false);
        }
        assert.equal(registry.activeSnapshotV8(session)!.nextInputSequence, 1);
        assert.equal(registry.activeSnapshotV8(session)!.stateHash, snapshot.stateHash);
    } finally { registry.dispose(); }
});

test('V8 stale pause/reconnect packets cannot revive input, AI ownership is not cancelled', async () => {
    let now = 0;
    const registry = new SessionRegistry({ simulationTickIntervalMs: false, v8TestOnly: { nowUs: () => now } });
    try {
        const opened = registry.create('socket_v8'); assert.ok(!('code' in opened));
        const session = registry.getBound('socket_v8')!;
        const created = registry.createChallengeV8ForTest(session, 'practice', 'wizard'); assert.ok(!('code' in created));
        const packet = { ...request, challengeId: created.challengeId };
        await registry.submitInputV8(session, packet);
        const paused = await registry.setChallengePausedV8(session, created.challengeId, true);
        assert.ok(!('code' in paused));
        assert.equal(paused.paused, true);
        now += 600_000_000;
        await registry.setChallengePausedV8(session, created.challengeId, false);
        assert.equal(registry.activeSnapshotV8(session)!.simulation.tick, 0);
        assert.equal((await registry.submitInputV8(session, { ...packet, requestId: 'stale_pause_01', inputSequence: 1 })).ok, false);
        registry.disconnect('socket_v8');
        assert.ok(registry.resume(opened.token, 'socket_v8_new').data);
        const resumed = registry.activeSnapshotV8(session)!;
        assert.equal(resumed.simulation.heldDirection, 0);
        registry.advanceChallengeTicksV8ForTest(session, created.challengeId, 450);
        const ai = registry.activeSnapshotV8(session)!;
        assert.equal(ai.simulation.activeActor, 'loomkeeper');
        registry.cancelInputV8(session, { requestId: 'cancel_ai_01', challengeId: created.challengeId,
            rulesetId: V8_RULESET_ID, expectedTurn: ai.simulation.turn, inputEpoch: ai.simulation.inputEpoch });
        registry.disconnect('socket_v8_new');
        assert.equal(registry.activeSnapshotV8(session)!.stateHash, ai.stateHash);
    } finally { registry.dispose(); }
});

test('V8 delayed normal input catches up 7/30 ticks before applying and loses at action deadline', async () => {
    let now = 0;
    const registry = new SessionRegistry({ simulationTickIntervalMs: false, v8TestOnly: { nowUs: () => now, yieldBatch: async () => {} } });
    try {
        registry.create('socket_v8');
        const session = registry.getBound('socket_v8')!;
        const created = registry.createChallengeV8ForTest(session, 'practice', 'wizard'); assert.ok(!('code' in created));
        now = 233_334;
        const first = await registry.submitInputV8(session, { ...request, challengeId: created.challengeId });
        assert.equal(first.ok, true);
        assert.equal(registry.activeSnapshotV8(session)!.simulation.tick, 7);
        now += 1_000_000;
        const stale = await registry.submitInputV8(session, { ...request, requestId: 'request_late_01',
            inputSequence: 1, challengeId: created.challengeId, intent: { type: 'walk_refresh' } });
        assert.equal(stale.ok, false);
        assert.equal(registry.activeSnapshotV8(session)!.simulation.tick, 37);
        registry.advanceChallengeTicksV8ForTest(session, created.challengeId, 412);
        now += 33_334;
        const late = await registry.submitInputV8(session, { ...request, requestId: 'request_late_02',
            inputSequence: 2, challengeId: created.challengeId, intent: { type: 'fire', aimId: 0 } });
        assert.equal(late.ok, false);
        assert.equal(registry.activeSnapshotV8(session)!.simulation.tick, 450);
    } finally { registry.dispose(); }
});

test('V8 request cache retains 256 acknowledgements and rejects the evicted 257th retry as stale', async () => {
    const registry = new SessionRegistry({ simulationTickIntervalMs: false, v8TestOnly: { nowUs: () => 0 } });
    try {
        registry.create('socket_v8');
        const session = registry.getBound('socket_v8')!;
        const created = registry.createChallengeV8ForTest(session, 'practice', 'wizard'); assert.ok(!('code' in created));
        const packets = Array.from({ length: 257 }, (_, inputSequence) => ({ ...request,
            challengeId: created.challengeId, inputSequence, requestId: `cached_request_${inputSequence}`,
            intent: { type: 'face', direction: inputSequence % 2 ? 1 : -1 } }));
        let first: any;
        for (let index = 0; index < 256; index++) {
            const ack = await registry.submitInputV8(session, packets[index]);
            assert.equal(ack.ok, true); if (!index) first = ack;
        }
        assert.deepEqual(await registry.submitInputV8(session, packets[0]), first);
        await registry.submitInputV8(session, packets[256]);
        const hash = registry.activeSnapshotV8(session)!.stateHash;
        const stale = await registry.submitInputV8(session, packets[0]);
        assert.equal(stale.ok, false);
        if (!stale.ok) assert.equal(stale.error.code, 'STALE_SEQUENCE');
        assert.equal(registry.activeSnapshotV8(session)!.stateHash, hash);
    } finally { registry.dispose(); }
});

function emit(socket: Socket, event: string, payload: unknown): Promise<any> {
    return new Promise((resolve,reject) => {
        socket.timeout(1500).emit(event,payload,(error: Error | null, response: unknown) => error ? reject(error) : resolve(response));
    });
}
test('V8 socket cancel bypasses saturated normal traffic and pending legacy mutation, not ownership/size', async () => {
    let now = 0;
    const runtime = createRuntimeServer({ allowMissingOrigin: true, sessionRegistry: {
        simulationTickIntervalMs: false, v8TestOnly: { nowUs: () => now, yieldBatch: async () => {} } } });
    const sockets: Socket[] = [];
    let release!: () => void;
    try {
        const port = await runtime.listen();
        const socket = connectClient(`http://127.0.0.1:${port}`, { transports: ['websocket'], reconnection: false });
        sockets.push(socket); await new Promise<void>(resolve => socket.once('connect',resolve));
        const opened = await emit(socket,protocolEvents.sessionOpen,{requestId:'session_wire_01',action:'create'});
        assert.equal(opened.ok,true);
        const session = runtime.sessions.getBound(socket.id!)!;
        const created = runtime.sessions.createChallengeV8ForTest(session,'practice','wizard'); assert.ok(!('code' in created));
        const packet = { ...request, challengeId: created.challengeId };
        const first = await emit(socket,protocolEventsV8.input,packet);
        assert.equal(InputAckV8Schema().safeParse(first).success,true);
        assert.equal(first.ok,true);
        const pending = runtime.sessions.sequenceAsync(session,'pending_legacy_01',0,{},async () => {
            await new Promise<void>(resolve => { release = resolve; });
            return { protocolVersion: 1, serverTimeMs: 0, requestId: 'pending_legacy_01', ok: true, data: {} };
        });
        await Promise.resolve();
        let lastFlood:any;
        for (let index=0; index<35; index++) lastFlood=await emit(socket,protocolEventsV8.input,{ ...packet,
            requestId:`flood_request_${index}`,inputSequence:1,intent:{type:'walk_refresh'} });
        assert.equal(lastFlood.nextInputSequence,runtime.sessions.activeSnapshotV8(session)!.nextInputSequence);
        const cancel = await emit(socket,protocolEventsV8.cancel,{requestId:'cancel_wire_01',challengeId:created.challengeId,
            rulesetId:V8_RULESET_ID,expectedTurn:0,inputEpoch:0});
        assert.equal(cancel.ok,true);
        assert.equal(runtime.sessions.activeSnapshotV8(session)!.simulation.heldDirection,0);
        release(); await pending;
        const hash = runtime.sessions.activeSnapshotV8(session)!.stateHash;
        const oversized = await emit(socket,protocolEventsV8.cancel,{requestId:'cancel_wire_big',challengeId:created.challengeId,
            rulesetId:V8_RULESET_ID,expectedTurn:0,inputEpoch:1,padding:'x'.repeat(1025)});
        assert.equal(oversized.ok,false);
        assert.equal(runtime.sessions.activeSnapshotV8(session)!.stateHash,hash);
    } finally { release?.(); sockets.forEach(socket=>socket.close()); await runtime.close(); }
});

for (const interruption of ['cancel','disconnect','replace'] as const) test(`V8 neutral pending Jump is rejected after ${interruption} during catch-up`,async () => {
    let now = 0;
    let entered!: () => void;
    let release!: () => void;
    const yielded = new Promise<void>(resolve => { entered = resolve; });
    const registry = new SessionRegistry({simulationTickIntervalMs:false,v8TestOnly:{nowUs:()=>now,
        yieldBatch:async()=>{entered();await new Promise<void>(resolve=>{release=resolve;});},tickIntervalMs:1000}});
    try {
        const opened = registry.create('pending_socket'); assert.ok(!('code' in opened));
        const session = registry.getBound('pending_socket')!;
        const snapshot = registry.createChallengeV8ForTest(session,'practice','wizard'); assert.ok(!('code' in snapshot));
        now=233334;
        const pending=registry.submitInputV8(session,{...request,challengeId:snapshot.challengeId,intent:{type:'jump'}});
        await yielded;
        if(interruption==='cancel') registry.cancelInputV8(session,{requestId:'neutral_cancel_01',challengeId:snapshot.challengeId,
            rulesetId:V8_RULESET_ID,expectedTurn:0,inputEpoch:0});
        else if(interruption==='disconnect') registry.disconnect('pending_socket');
        else registry.resume(opened.token,'replacement_socket');
        release();
        assert.equal((await pending).ok,false);
        assert.equal(registry.activeSnapshotV8(session)!.simulation.units[0].grounded,true);
    } finally {release?.();registry.dispose();}
});

test('V8 terminal delivery is retained during disconnect and delivered exactly once after resume',()=>{
    const delivered: string[]=[];
    const registry=new SessionRegistry({simulationTickIntervalMs:false,v8TestOnly:{nowUs:()=>0},
        onChallengeCompletedV8:result=>delivered.push(result.outcome)});
    try{
        const opened=registry.create('finish_socket');assert.ok(!('code'in opened));
        const session=registry.getBound('finish_socket')!;
        const created=registry.createChallengeV8ForTest(session,'practice','wizard');assert.ok(!('code'in created));
        registry.disconnect('finish_socket');
        registry.advanceChallengeTicksV8ForTest(session,created.challengeId,7200);
        assert.deepEqual(delivered,[]);
        registry.resume(opened.token,'finish_socket_new');
        registry.deliverCurrentV8(session);
        registry.deliverCurrentV8(session);
        assert.deepEqual(delivered,['draw']);
    }finally{registry.dispose();}
});

test('V8 all frozen seeds and Callings use identical combat operations in both injected modes',()=>{
    const seeds=[1,2,3,4,17,42,1337,65535,2147483648,4294967295];
    for(const seed of seeds)for(const calling of ['wizard','thief','warrior'] as const){
        const registry=new SessionRegistry({simulationTickIntervalMs:false,v8TestOnly:{nowUs:()=>0},seedSource:()=>seed});
        const verifier=new SimulationCoordinatorV8();
        try{
            registry.create('parity_practice');registry.create('parity_reward');
            const sessions=[registry.getBound('parity_practice')!,registry.getBound('parity_reward')!];
            const matches=sessions.map((session,index)=>{
                const match=registry.createChallengeV8ForTest(session,index?'reward':'practice',calling);
                assert.ok(!('code'in match));return match;
            });
            const same=()=>assert.deepEqual(registry.activeSnapshotV8(sessions[0])!.simulation,registry.activeSnapshotV8(sessions[1])!.simulation);
            same();
            for(let index=0;index<2;index++){
                registry.applyIntentV8ForTest(sessions[index],matches[index].challengeId,{type:'aim',angleMilliDegrees:45000,powerPermille:1000});
                const aimId=registry.activeSnapshotV8(sessions[index])!.simulation.aimId;
                registry.applyIntentV8ForTest(sessions[index],matches[index].challengeId,{type:'fire',aimId});
            }
            same();
            for(let index=0;index<2;index++)registry.advanceChallengeTicksV8ForTest(sessions[index],matches[index].challengeId,360);
            same();
            for(let index=0;index<2;index++){
                const replay=registry.replayForChallengeV8(sessions[index],matches[index].challengeId)!;
                assert.equal(verifier.reconstructAndVerify(replay,{challengeId:matches[index].challengeId,sessionId:sessions[index].id}).stateHash,
                    registry.activeSnapshotV8(sessions[index])!.stateHash);
                assert.throws(()=>verifier.reconstructAndVerify(replay,{challengeId:matches[index].challengeId,sessionId:'wrong_session_fixture'}));
            }
        }finally{registry.dispose();verifier.dispose();}
    }
});

test('V8 rejects exact1024/1025 padded payloads without leaking malformed ack IDs or granting authority',async()=>{
    const registry=new SessionRegistry({simulationTickIntervalMs:false,v8TestOnly:{nowUs:()=>0}});
    try{
        registry.create('size_socket');registry.create('other_socket');
        const session=registry.getBound('size_socket')!;
        const created=registry.createChallengeV8ForTest(session,'practice','wizard');assert.ok(!('code'in created));
        for(const bytes of [1024,1025]){
            const payload:any={...request,challengeId:created.challengeId,padding:''};
            payload.padding='x'.repeat(bytes-jsonBytesV8(payload));
            const response=await registry.submitInputV8(session,payload);
            assert.equal(response.ok,false);
            if(!response.ok)assert.equal(response.error.code,bytes===1024?'BAD_REQUEST':'PAYLOAD_TOO_LARGE');
        }
        const wrongOwner=await registry.submitInputV8(registry.getBound('other_socket')!,{...request,challengeId:created.challengeId});
        assert.equal(wrongOwner.ok,false);
        assert.equal(InputAckV8Schema().safeParse(await registry.submitInputV8(session,{requestId:'?'})).success,true);
        assert.equal(InputAckV8Schema().safeParse(registry.cancelInputV8(session,{requestId:'?'})).success,true);
        assert.equal(registry.activeSnapshotV8(session)!.stateHash,created.stateHash);
    }finally{registry.dispose();}
});

test('V8 pause/leave wire envelopes are separate; legacy public creation and commands retain V7 semantics',async()=>{
    const runtime=createRuntimeServer({allowMissingOrigin:true,sessionRegistry:{simulationTickIntervalMs:false,v8TestOnly:{nowUs:()=>0}}});
    let socket:Socket|undefined;
    try{
        const port=await runtime.listen();socket=connectClient(`http://127.0.0.1:${port}`,{transports:['websocket'],reconnection:false});
        await new Promise<void>(resolve=>socket!.once('connect',resolve));
        await emit(socket,protocolEvents.sessionOpen,{requestId:'lifecycle_open',action:'create'});
        const session=runtime.sessions.getBound(socket.id!)!;
        const created=runtime.sessions.createChallengeV8ForTest(session,'practice','wizard');assert.ok(!('code'in created));
        const oversize=await emit(socket,protocolEventsV8.pause,{requestId:'v8_pause_big',sequence:0,challengeId:created.challengeId,
            rulesetId:V8_RULESET_ID,paused:true,padding:'x'.repeat(1025)});
        assert.equal(LifecycleAckV8Schema.safeParse(oversize).success,true);
        const legacy=await emit(socket,protocolEvents.challengePause,{requestId:'legacy_pause_01',sequence:0,challengeId:created.challengeId,paused:true});
        assert.equal(legacy.protocolVersion,1);assert.equal(legacy.ok,false);
        const pause=await emit(socket,protocolEventsV8.pause,{requestId:'v8_pause_wire',sequence:1,challengeId:created.challengeId,rulesetId:V8_RULESET_ID,paused:true});
        assert.equal(LifecycleAckV8Schema.safeParse(pause).success,true);assert.equal(pause.ok,true);assert.equal(pause.data.paused,true);
        const leave=await emit(socket,protocolEventsV8.leave,{requestId:'v8_leave_wire',sequence:2,challengeId:created.challengeId,rulesetId:V8_RULESET_ID});
        assert.equal(LifecycleAckV8Schema.safeParse(leave).success,true);assert.equal(leave.data.outcome,'left');
        const next=await emit(socket,protocolEvents.challengeCreate,{requestId:'legacy_create_01',sequence:3,mode:'practice',calling:'wizard'});
        assert.equal(next.ok,true);assert.equal(next.data.simulation.rulesetId,'nimble-knots-artillery-v7');
    }finally{socket?.close();await runtime.close();}
});

test('V8 lifecycle request waiting in the legacy session cursor cannot transfer to a replacement socket',async()=>{
    const runtime=createRuntimeServer({allowMissingOrigin:true,sessionRegistry:{simulationTickIntervalMs:false,v8TestOnly:{nowUs:()=>0}}});
    let socket:Socket|undefined;let release!:()=>void;
    try{
        const port=await runtime.listen();socket=connectClient(`http://127.0.0.1:${port}`,{transports:['websocket'],reconnection:false});
        await new Promise<void>(resolve=>socket!.once('connect',resolve));
        const opened=await emit(socket,protocolEvents.sessionOpen,{requestId:'queue_open_01',action:'create'});
        const session=runtime.sessions.getBound(socket.id!)!;
        const created=runtime.sessions.createChallengeV8ForTest(session,'practice','wizard');assert.ok(!('code'in created));
        const blocked=runtime.sessions.sequenceAsync(session,'outer_queue_01',0,{},async()=>{
            await new Promise<void>(resolve=>{release=resolve;});
            return {protocolVersion:1,serverTimeMs:0,requestId:'outer_queue_01',ok:true,data:{}};
        });
        await Promise.resolve();
        const received=new Promise<void>(resolve=>runtime.io.sockets.sockets.get(socket!.id!)!.once(protocolEventsV8.pause,()=>resolve()));
        const pending=emit(socket,protocolEventsV8.pause,{requestId:'queued_pause_01',sequence:1,challengeId:created.challengeId,rulesetId:V8_RULESET_ID,paused:true});
        await received;
        runtime.sessions.resume(opened.data.token,'new_transport_fixture');release();await blocked;
        assert.equal((await pending).ok,false);
        assert.equal(runtime.sessions.activeSnapshotV8(session)!.paused,false);
    }finally{release?.();socket?.close();await runtime.close();}
});

test('V8 socket missing acknowledgement and malformed envelopes retain the invalid-input disconnect safeguard',async()=>{
    const runtime=createRuntimeServer({allowMissingOrigin:true,sessionRegistry:{simulationTickIntervalMs:false,v8TestOnly:{nowUs:()=>0}}});
    let socket:Socket|undefined;
    try{
        const port=await runtime.listen();socket=connectClient(`http://127.0.0.1:${port}`,{transports:['websocket'],reconnection:false});
        await new Promise<void>(resolve=>socket!.once('connect',resolve));
        await emit(socket,protocolEvents.sessionOpen,{requestId:'invalid_open_01',action:'create'});
        const session=runtime.sessions.getBound(socket.id!)!;
        const created=runtime.sessions.createChallengeV8ForTest(session,'practice','wizard');assert.ok(!('code'in created));
        const missingAck=new Promise<any>(resolve=>socket!.once(protocolEvents.error,resolve));
        socket.emit(protocolEventsV8.input,{...request,challengeId:created.challengeId,intent:{type:'jump'}});
        assert.equal((await missingAck).error.code,'BAD_REQUEST');
        assert.equal(runtime.sessions.activeSnapshotV8(session)!.stateHash,created.stateHash);
        const disconnected=new Promise<void>(resolve=>socket!.once('disconnect',()=>resolve()));
        for(let index=0;index<5;index++){
            const response=await emit(socket,protocolEventsV8.input,{...request,requestId:`invalid_schema_${index}`,
                challengeId:created.challengeId,position:12});
            assert.equal(response.ok,false);
        }
        await disconnected;
        assert.equal(runtime.sessions.activeSnapshotV8(session)!.stateHash,created.stateHash);
    }finally{socket?.close();await runtime.close();}
});

test('V8 injected reward fixture cannot call the legacy monetary result verifier',async()=>{
    let settlements=0;const outcomes:string[]=[];
    const runtime=createRuntimeServer({allowMissingOrigin:true,rewards:{initialize:async()=>{},close:async()=>{},
        completeMatch:async()=>{settlements++;}} as any,sessionRegistry:{simulationTickIntervalMs:false,
            v8TestOnly:{nowUs:()=>0},onChallengeCompletedV8:result=>outcomes.push(result.outcome)}});
    try{
        runtime.sessions.create('isolated_reward_socket');
        const session=runtime.sessions.getBound('isolated_reward_socket')!;
        const match=runtime.sessions.createChallengeV8ForTest(session,'reward','wizard');assert.ok(!('code'in match));
        runtime.sessions.advanceChallengeTicksV8ForTest(session,match.challengeId,7200);
        assert.deepEqual(outcomes,['draw']);assert.equal(settlements,0);
        assert.equal(runtime.sessions.replayForChallenge(session,match.challengeId),undefined);
        assert.equal(runtime.sessions.activeSnapshot(session),undefined);
    }finally{await runtime.close();}
});

test('V8 player cancel/disconnect/reconnect never changes AI-held walk, aim or retreat authority',()=>{
    const registry=new SessionRegistry({simulationTickIntervalMs:false,v8TestOnly:{nowUs:()=>0},seedSource:()=>1});
    try{
        const opened=registry.create('ai_owner_socket');assert.ok(!('code'in opened));
        let token=opened.token;let socketId='ai_owner_socket';let suffix=0;
        const session=registry.getBound(socketId)!;
        const match=registry.createChallengeV8ForTest(session,'practice','wizard');assert.ok(!('code'in match));
        registry.advanceChallengeTicksV8ForTest(session,match.challengeId,450);
        const interrupt=()=>{
            const before=registry.activeSnapshotV8(session)!;
            registry.cancelInputV8(session,{requestId:`ai_cancel_${suffix}`,challengeId:match.challengeId,rulesetId:V8_RULESET_ID,
                expectedTurn:before.simulation.turn,inputEpoch:before.simulation.inputEpoch});
            registry.disconnect(socketId);
            const previous=socketId;socketId=`ai_rebound_${++suffix}`;
            const resumed=registry.resume(token,socketId);assert.ok(resumed.data);token=resumed.data.token;
            registry.disconnect(previous);
            assert.equal(registry.activeSnapshotV8(session)!.stateHash,before.stateHash);
            assert.deepEqual(registry.activeSnapshotV8(session)!.simulation,before.simulation);
        };
        registry.applyIntentV8ForTest(session,match.challengeId,{type:'walk_start',direction:-1});interrupt();
        registry.advanceChallengeTicksV8ForTest(session,match.challengeId,10);
        registry.applyIntentV8ForTest(session,match.challengeId,{type:'aim',angleMilliDegrees:90000,powerPermille:1000});interrupt();
        registry.applyIntentV8ForTest(session,match.challengeId,{type:'fire',aimId:registry.activeSnapshotV8(session)!.simulation.aimId});
        for(let count=0;count<420 && registry.activeSnapshotV8(session)!.simulation.phase!=='retreat';count++)
            registry.advanceChallengeTicksV8ForTest(session,match.challengeId,1);
        assert.equal(registry.activeSnapshotV8(session)!.simulation.phase,'retreat');
        registry.applyIntentV8ForTest(session,match.challengeId,{type:'walk_start',direction:-1});interrupt();
    }finally{registry.dispose();}
});
