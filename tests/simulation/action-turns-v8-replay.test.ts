import assert from 'node:assert/strict';
import test from 'node:test';

import { V8_RULESET_ID } from '../../shared/simulation-v8';
import { CURRENT_COMBAT_RULESET_ID } from '../../shared/combat-version';
import { V7_RULESET_ID } from '../../shared/simulation';
import { SimulationCoordinatorV8, V8_REPLAY_LIMITS } from '../../server/src/simulation/coordinator-v8';
import { VersionedSimulationCoordinator } from '../../server/src/simulation/versioned-coordinator';
import { CoordinatorReplayV8Schema, jsonBytesV8 } from '../../shared/protocol-v8';
import { SimulationCoordinator } from '../../server/src/simulation/coordinator';

const challengeId = 'v8_challenge_fixture';
const sessionId = 'v8_session_fixture';
function fixture(options: ConstructorParameters<typeof SimulationCoordinatorV8>[0] = {}) {
    const coordinator = new SimulationCoordinatorV8({ nowUs: () => 0, ...options });
    coordinator.create(challengeId, sessionId, 1, 'wizard');
    return coordinator;
}
function face(coordinator: SimulationCoordinatorV8, direction: -1 | 1) {
    const { state } = coordinator.get(challengeId)!;
    return coordinator.apply(challengeId, state.activeActor, { type: 'face', direction },
        state.turn, state.phase, state.inputEpoch);
}

test('V8 explicit replay is detached, strict, and reconstructs every accepted operation', () => {
    const coordinator = fixture();
    face(coordinator, -1);
    coordinator.advance(challengeId, 3);
    face(coordinator, 1);
    const replay = coordinator.replay(challengeId)!;
    assert.equal(replay.formatVersion, 8);
    assert.equal(replay.rulesetId, V8_RULESET_ID);
    assert.equal(replay.loomkeeperPolicyId, 'nimble-knots-loomkeeper-v3');
    const verifier = new SimulationCoordinatorV8();
    assert.equal(verifier.reconstructAndVerify(replay).stateHash, coordinator.get(challengeId)!.stateHash);
    for (const patch of [
        { rulesetId: V7_RULESET_ID }, { formatVersion: 7 },
        { loomkeeperPolicyId: 'nimble-knots-loomkeeper-v2' }, { unknown: true }
    ]) assert.throws(() => verifier.reconstructAndVerify({ ...replay, ...patch } as any));
    const tampered = structuredClone(replay);
    tampered.records[0].stateHash = '0'.repeat(64);
    assert.throws(() => verifier.reconstructAndVerify(tampered));
    const wrongIndex = structuredClone(replay);
    wrongIndex.records[0].index = 1;
    assert.throws(() => verifier.reconstructAndVerify(wrongIndex));
    assert.equal(coordinator.replay(challengeId)!.records[0].index, 0);
    coordinator.dispose(); verifier.dispose();
});

test('V8 scheduler retains fractional credits and yields at six ticks without losing debt', async () => {
    let now = 0;
    let yields = 0;
    const coordinator = fixture({ nowUs: () => now, yieldBatch: async () => { yields++; } });
    now = 33_333;
    assert.equal(coordinator.pump(challengeId).state.tick, 0);
    now += 33_334;
    assert.equal(coordinator.pump(challengeId).state.tick, 2);
    now += 233_333;
    assert.equal(coordinator.pump(challengeId).state.tick, 8);
    assert.equal(coordinator.dueTicks(challengeId), 1);
    await coordinator.catchUp(challengeId);
    assert.equal(coordinator.get(challengeId)!.state.tick, 9);
    now += 1_000_000;
    await coordinator.catchUp(challengeId);
    assert.equal(coordinator.get(challengeId)!.state.tick, 39);
    assert.ok(yields >= 4);
    assert.equal(coordinator.dueTicks(challengeId), 0);
    coordinator.dispose();
});

test('V8 scheduler debt of 31 ticks expires unavailable and cannot award a win', () => {
    let now = 0;
    const coordinator = fixture({ nowUs: () => now });
    now = 1_033_334;
    const result = coordinator.pump(challengeId);
    assert.equal(result.unavailable, true);
    assert.equal(result.state.phase, 'finished');
    assert.equal(result.state.winner, 'draw');
    assert.equal(result.state.finishReason, 'simulation_limit');
    assert.equal(coordinator.reconstructAndVerify(coordinator.replay(challengeId)!).stateHash, result.stateHash);
    coordinator.dispose();
});

test('V8 replay reserves terminal space and verifies the same lowered limits detached', () => {
    const coordinator = fixture({ maxReplayRecords: 3 });
    face(coordinator, -1);
    face(coordinator, 1);
    const final = face(coordinator, -1);
    assert.equal(final.state.phase, 'finished');
    assert.equal(final.state.finishReason, 'simulation_limit');
    const replay = coordinator.replay(challengeId)!;
    assert.equal(replay.records.length, 3);
    assert.equal(replay.records[2].operation.kind, 'safety');
    assert.equal(coordinator.reconstructAndVerify(replay).stateHash, final.stateHash);
    assert.equal(V8_REPLAY_LIMITS.records, 32_768);
    assert.equal(V8_REPLAY_LIMITS.bytes, 16 * 1024 * 1024);
    assert.equal(V8_REPLAY_LIMITS.operationBytes, 512);
    coordinator.dispose();
});

test('versioned facade keeps production V7 and verifies by explicit identity', () => {
    const facade = new VersionedSimulationCoordinator();
    assert.equal(CURRENT_COMBAT_RULESET_ID, V7_RULESET_ID);
    assert.equal(facade.create('legacy_challenge_fixture', sessionId, 1, 'wizard').state.rulesetId, V7_RULESET_ID);
    const candidate = facade.create(challengeId, sessionId, 1, 'wizard', V8_RULESET_ID);
    assert.equal(candidate.state.rulesetId, V8_RULESET_ID);
    assert.equal(facade.reconstructAndVerify(facade.replay(challengeId)!).stateHash, candidate.stateHash);
    facade.dispose();
});

test('V8 per-turn accepted intent 512/513 and lifecycle 128/129 fail closed with replayable barriers', () => {
    const coordinator = fixture();
    for (let index = 0; index < 512; index++) assert.equal(face(coordinator, index % 2 ? 1 : -1).transition.accepted, true);
    const before = coordinator.get(challengeId)!;
    assert.equal(before.state.acceptedIntentCount, 512);
    assert.equal(face(coordinator, -1).transition.accepted, false);
    assert.equal(coordinator.get(challengeId)!.state.tick, 0);
    coordinator.dispose();
    const lifecycle = fixture();
    for (let index = 0; index < 128; index++) {
        const state = lifecycle.get(challengeId)!.state;
        lifecycle.barrier(challengeId, { reason: 'reconnect', actor: 'player', expectedTurn: 0, expectedEpoch: state.inputEpoch });
    }
    assert.equal(lifecycle.get(challengeId)!.state.lifecycleBarrierCount, 128);
    const state = lifecycle.get(challengeId)!.state;
    lifecycle.barrier(challengeId, { reason: 'reconnect', actor: 'player', expectedTurn: 0, expectedEpoch: state.inputEpoch });
    const final = lifecycle.get(challengeId)!;
    assert.equal(final.state.phase, 'finished');
    assert.equal(final.unavailable, true);
    assert.equal(lifecycle.reconstructAndVerify(lifecycle.replay(challengeId)!).stateHash, final.stateHash);
    lifecycle.dispose();
});

test('V8 legal replay above 2048 records preserves detached verification and batches', () => {
    const coordinator = fixture();
    for (let turn = 0; turn < 5; turn++) {
        for (let index = 0; index < 450; index++) face(coordinator, index % 2 ? 1 : -1);
        coordinator.advance(challengeId, 450);
    }
    assert.ok(coordinator.replay(challengeId)!.records.length > 2048);
    assert.equal(coordinator.reconstructAndVerify(coordinator.replay(challengeId)!).stateHash,
        coordinator.get(challengeId)!.stateHash);
    coordinator.dispose();
});

test('V8 raw replay count, bytes, per-record bytes and tick boundaries reject before replay work', () => {
    const coordinator = fixture();
    coordinator.advance(challengeId, 1);
    const replay = coordinator.replay(challengeId)!;
    const record = replay.records[0];
    for (const count of [32767,32768]) assert.equal(CoordinatorReplayV8Schema.safeParse({ ...replay,
        records: Array.from({ length: count }, (_, index) => ({ ...record, index })) }).success, true);
    assert.equal(CoordinatorReplayV8Schema.safeParse({ ...replay,
        records: Array.from({ length: 32769 }, (_, index) => ({ ...record, index })) }).success, false);
    assert.throws(() => coordinator.reconstructAndVerify({ ...replay, records: Array(32769).fill(record) }));
    // Valid V8 operation variants are all smaller than 512 bytes. Padding is forbidden even at the byte boundary.
    for (const bytes of [512,513]) {
        const padded: any = { ...record, padding: '' };
        padded.padding = 'x'.repeat(bytes-jsonBytesV8(padded));
        assert.equal(jsonBytesV8(padded), bytes);
        assert.throws(() => coordinator.reconstructAndVerify({ ...replay, records: [padded] }));
    }
    for (const bytes of [16*1024*1024,16*1024*1024+1]) {
        const padded: any = { ...replay, padding: '' };
        padded.padding = 'x'.repeat(bytes-jsonBytesV8(padded));
        assert.equal(jsonBytesV8(padded), bytes);
        assert.throws(() => coordinator.reconstructAndVerify(padded));
    }
    const ticks = { ...record, operation: { kind: 'ticks', count: 16800 } };
    assert.equal(CoordinatorReplayV8Schema.safeParse({ ...replay, records: [ticks] }).success, true);
    assert.throws(() => coordinator.reconstructAndVerify({ ...replay,
        records: [{ ...ticks, operation: { kind: 'ticks', count: 16801 } }] } as any));
    coordinator.dispose();
});

test('V8 pause and resume callbacks carry the acknowledged pause state', async () => {
    const pausedStates: boolean[] = [];
    const coordinator = fixture({ onTransition: update => pausedStates.push(update.paused) });
    await coordinator.setPaused(challengeId, true);
    await coordinator.setPaused(challengeId, false);
    assert.deepEqual(pausedStates, [true,false]);
    coordinator.dispose();
});

test('V8 automatic lease and phase boundaries have explicit ordered replay records without extra ticks', () => {
    const coordinator=fixture();
    coordinator.apply(challengeId,'player',{type:'walk_start',direction:1},0,'action',0);
    coordinator.advance(challengeId,10);
    coordinator.advance(challengeId,440);
    const replay=coordinator.replay(challengeId)!;
    const annotations=replay.records.filter(record=>record.operation.kind==='automatic');
    assert.equal(annotations.length,2);
    assert.equal((annotations[0].operation as any).reason,'lease_expired');
    assert.equal((annotations[1].operation as any).reason,'phase');
    assert.equal(coordinator.get(challengeId)!.state.tick,450);
    assert.equal(coordinator.get(challengeId)!.state.revision,451);
    assert.equal(coordinator.reconstructAndVerify(replay).stateHash,coordinator.get(challengeId)!.stateHash);
    for (const variant of ['missing','extra','forged']) {
        const changed=structuredClone(replay);
        const index=changed.records.findIndex(record=>record.operation.kind==='automatic');
        if(variant==='missing')changed.records.splice(index,1);
        else if(variant==='extra')changed.records.splice(index,0,structuredClone(changed.records[index]));
        else (changed.records[index].operation as any).inputEpoch++;
        changed.records.forEach((record,index)=>{record.index=index;});
        assert.throws(()=>coordinator.reconstructAndVerify(changed));
    }
    coordinator.dispose();
});

test('V8 exact lowered byte reserve boundary admits the mutation; one byte less terminates atomically',()=>{
    const probe=fixture();face(probe,-1);face(probe,1);
    const exact=jsonBytesV8(probe.replay(challengeId))+512;
    assert.ok(exact>1024);
    const admitted=fixture({maxReplayBytes:exact});
    face(admitted,-1);face(admitted,1);
    assert.equal(admitted.get(challengeId)!.state.phase,'action');
    assert.equal(jsonBytesV8(admitted.replay(challengeId)),exact-512);
    const limited=fixture({maxReplayBytes:exact-1});
    face(limited,-1);face(limited,1);
    const final=limited.get(challengeId)!;
    assert.equal(final.state.finishReason,'simulation_limit');
    assert.equal(limited.replay(challengeId)!.records.at(-1)!.operation.kind,'safety');
    assert.ok(jsonBytesV8(limited.replay(challengeId))<=exact-1);
    assert.equal(limited.reconstructAndVerify(limited.replay(challengeId)).stateHash,final.stateHash);
    probe.dispose();admitted.dispose();limited.dispose();
});

test('V8 simultaneous automatic boundaries are atomically reserved before tick mutation',()=>{
    for(const maxReplayRecords of [6,7]){
        const coordinator=fixture({maxReplayRecords});
        coordinator.advance(challengeId,440);
        coordinator.apply(challengeId,'player',{type:'walk_start',direction:1},0,'action',0);
        coordinator.advance(challengeId,10);
        const final=coordinator.get(challengeId)!;
        assert.equal(final.state.tick,maxReplayRecords===6?449:450);
        assert.equal(final.state.phase,maxReplayRecords===6?'finished':'action');
        assert.equal(coordinator.reconstructAndVerify(coordinator.replay(challengeId)).stateHash,final.stateHash);
        coordinator.dispose();
    }
});

test('V7 creation, aim and fire checkpoint hashes stay frozen behind versioned replay dispatch',()=>{
    // Read from the protected V7 implementation at pinned 5025fbc before changing that implementation (never edited).
    const legacy=new SimulationCoordinator();const facade=new VersionedSimulationCoordinator();
    assert.equal(legacy.create('v7_checkpoint_fixture','v7_session_fixture',1,'wizard',V7_RULESET_ID).stateHash,
        '562ee2ef0629f63579d8ea180d297ae8f51734dc3b50bc085d8099fefb5906c5');
    assert.equal(legacy.apply('v7_checkpoint_fixture','player',{type:'aim',angleMilliDegrees:45000,powerPermille:1000},0).stateHash,
        '494b73b5c7381e0d1b47c4766a09c4aa85a2a6c93d2a8b49dc77631c2305534d');
    const final=legacy.apply('v7_checkpoint_fixture','player',{type:'fire'},0);
    assert.equal(final.stateHash,'e34ce239446935a9ef5c7c05f48769d8b94bb7fd717314d63c5948e4fec1758c');
    assert.equal(facade.reconstructAndVerify(legacy.replay('v7_checkpoint_fixture')!).stateHash,final.stateHash);
    legacy.dispose();facade.dispose();
});

test('V8 debt threshold uses whole due ticks while retaining fractional microsecond credit',async()=>{
    for(const elapsed of [1_000_000,1_000_001,1_033_333,1_033_334]){
        let now=0;const coordinator=fixture({nowUs:()=>now,yieldBatch:async()=>{}});
        now=elapsed;await coordinator.catchUp(challengeId);
        const state=coordinator.get(challengeId)!;
        assert.equal(state.unavailable,elapsed===1_033_334);
        if(elapsed!==1_033_334){
            assert.equal(state.state.tick,30);
            now=1_033_334;await coordinator.catchUp(challengeId);
            assert.equal(coordinator.get(challengeId)!.state.tick,31);
        }
        coordinator.dispose();
    }
});

test('V8 intent saturation cannot neutralize another owner/turn/phase/epoch, but authorized overflow stops held Jump',()=>{
    const coordinator=fixture();
    for(let index=0;index<510;index++)face(coordinator,index%2?1:-1);
    coordinator.apply(challengeId,'player',{type:'walk_start',direction:1},0,'action',0);
    coordinator.apply(challengeId,'player',{type:'jump'},0,'action',0);
    const full=coordinator.get(challengeId)!;assert.equal(full.state.acceptedIntentCount,512);
    for(const [actor,turn,phase,epoch] of [['loomkeeper',0,'action',0],['player',1,'action',0],
        ['player',0,'retreat',0],['player',0,'action',1]] as const){
        assert.equal(coordinator.apply(challengeId,actor,{type:'face',direction:-1},turn,phase,epoch).transition.accepted,false);
        assert.equal(coordinator.get(challengeId)!.stateHash,full.stateHash);
    }
    const rejected=coordinator.apply(challengeId,'player',{type:'face',direction:-1},0,'action',0);
    assert.equal(rejected.transition.accepted,false);
    assert.equal(rejected.state.units[0].vxFp,0);assert.equal(rejected.state.heldDirection,0);
    assert.equal(rejected.state.tick,0);assert.equal(rejected.state.units[0].grounded,false);
    assert.equal(coordinator.replay(challengeId)!.records.at(-1)!.operation.kind,'barrier');
    assert.equal(coordinator.reconstructAndVerify(coordinator.replay(challengeId)).stateHash,rejected.stateHash);
    coordinator.dispose();
});

test('V8 action-to-action timeout handover publishes immediately even off the periodic snapshot tick',()=>{
    const published:{tick:number;turn:number}[]=[];
    const coordinator=fixture({onTransition:update=>published.push({tick:update.state.tick,turn:update.state.turn})});
    coordinator.advance(challengeId,1);
    coordinator.apply(challengeId,'player',{type:'aim',angleMilliDegrees:90000,powerPermille:1000},0,'action',0);
    const aimed=coordinator.get(challengeId)!.state;
    coordinator.apply(challengeId,'player',{type:'fire',aimId:aimed.aimId},0,'action',0);
    while(coordinator.get(challengeId)!.state.turn===0)coordinator.advance(challengeId,1);
    coordinator.advance(challengeId,450);
    const final=coordinator.get(challengeId)!;
    assert.notEqual(final.state.tick%3,0);
    assert.deepEqual(published.at(-1),{tick:final.state.tick,turn:final.state.turn});
    coordinator.dispose();
});

test('V8 identical pause/resume histories after10s or600s retain combat hash/replay and next tick',async()=>{
    const results:unknown[]=[];
    for(const duration of [10_000_000,600_000_000]){
        let now=0;const coordinator=fixture({nowUs:()=>now});
        await coordinator.setPaused(challengeId,true);now=duration;await coordinator.setPaused(challengeId,false);
        now+=33334;await coordinator.catchUp(challengeId);
        results.push({state:coordinator.get(challengeId)!.state,hash:coordinator.get(challengeId)!.stateHash,replay:coordinator.replay(challengeId)});
        coordinator.dispose();
    }
    assert.deepEqual(results[0],results[1]);
});
