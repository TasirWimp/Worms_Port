import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
    V7_RULESET_ID, applySimulationCommand, createSimulation, deformTerrain,
    setTerrainSolid, type PlayerCalling, type RelicId
} from '../../shared/simulation';
import {
    V8_RULESET_ID, V8_SIM_RULES, advanceSimulationTicksV8, applySimulationBarrierV8,
    applySimulationIntentV8, assertSimulationInvariantsV8, canonicalSimulationJsonV8,
    cloneSimulationV8, createSimulationV8, forceSimulationLimitV8,
    type SimulationIntentV8, type SimulationStateV8, type SimulationIntentV8Family,
    type V8RulesetId, type SimulationStateV8R1, V8_R1_RULESET_ID, assertSimulationInvariantsV8Family
} from '../../shared/simulation-v8';

const SEEDS = [1, 2, 3, 4, 17, 42, 1337, 65535, 2147483648, 4294967295];
const FP = 256;
const R1 = V8_R1_RULESET_ID;
function tick<R extends V8RulesetId>(state: SimulationStateV8<R>, count = 1): SimulationStateV8<R> {
    const next = advanceSimulationTicksV8(state, count);
    assert.equal(next.accepted, true, next.error?.message);
    assertSimulationInvariantsV8Family(next.state);
    return next.state;
}
function intent<R extends V8RulesetId>(state: SimulationStateV8<R>, input: SimulationIntentV8Family): SimulationStateV8<R> {
    const next = applySimulationIntentV8(state, state.activeActor, input, state.turn, state.phase, state.inputEpoch);
    assert.equal(next.accepted, true, next.error?.message);
    return next.state;
}
function cancel<R extends V8RulesetId>(state: SimulationStateV8<R>): SimulationStateV8<R> {
    return applySimulationBarrierV8(state, {
        reason: 'cancel', actor: state.activeActor, expectedTurn: state.turn, expectedEpoch: state.inputEpoch
    }).state;
}
function floorFixture(x = 600): SimulationStateV8 {
    const state = createSimulationV8(1, 'wizard');
    state.terrain.words.fill(0);
    for (let cy = 40; cy < 72; cy += 1) {
        for (let cx = 0; cx < 256; cx += 1) setTerrainSolid(state.terrain, cx, cy, true);
    }
    state.units.forEach((unit, index) => {
        unit.xFp = (index === 0 ? x : 1400) * FP;
        unit.yFp = 308 * FP;
        unit.vxFp = 0; unit.vyFp = 0; unit.grounded = true;
        unit.support = 40 * 256 + Math.floor((unit.xFp / FP - 12) / 8);
        unit.airTicks = 0; unit.airDrive = null;
    });
    return state;
}
function hole(state: SimulationStateV8, left: number, right: number): void {
    for (let cy = 40; cy < 72; cy += 1) {
        for (let cx = left / 8; cx < right / 8; cx += 1) setTerrainSolid(state.terrain, cx, cy, false);
    }
}
function walk<R extends V8RulesetId>(state: SimulationStateV8<R>, ticks: number, direction: -1 | 1 = 1): SimulationStateV8<R> {
    state = intent(state, { type: 'walk_start', direction });
    for (let elapsed = 0; elapsed < ticks; elapsed += 1) {
        if (elapsed > 0 && elapsed % 3 === 0) state = intent(state, { type: 'walk_refresh' });
        state = tick(state);
    }
    return state;
}
function fire(state: SimulationStateV8, angle = 45000, power = 1000): SimulationStateV8 {
    state = intent(state, { type: 'aim', angleMilliDegrees: angle, powerPermille: power });
    return intent(state, { type: 'fire', aimId: state.aimId });
}
function finishFlight(state: SimulationStateV8): SimulationStateV8 {
    for (let i = 0; i < 300 && state.phase === 'projectile'; i += 1) state = tick(state);
    assert.notEqual(state.phase, 'projectile');
    return state;
}
function hash(state: SimulationStateV8): string {
    return createHash('sha256').update(canonicalSimulationJsonV8(state)).digest('hex');
}

test('original V8 operation history hashes remain frozen through blocked walking and wall-flush Jump', () => {
    let state = createSimulationV8(1, 'wizard');
    assert.equal(hash(state), 'b3db51fd44be63d9e8100c43b057eb4c3450fb1a7389539fda2dc1d0335fde5f');
    state = walk(state, 24);
    assert.equal(hash(state), '25765bb9e12b45f4d960c626ef18b6eca5f895df323a0e722f6ea35224019f5f');
    state = tick(intent(state, { type: 'jump' }));
    assert.equal(hash(state), '3e775a96f91148d48f2c66c42163f07b8a4773ff7f80b703bb48ece8631f5a74');
    state = tick(state, 62);
    assert.equal(hash(state), '2c24ab80d3935b4cb945517727c2056db052db1cee453e4eb0226270b123f01c');
});

// The family API is selected by an explicit identity, never by a changed default.
function r1Floor(x = 600): SimulationStateV8R1 { return { ...floorFixture(x), rulesetId: R1 }; }
function r1Intent(state: SimulationStateV8R1, input: SimulationIntentV8Family): SimulationStateV8R1 { return intent(state, input); }

test('V8 R1 explicit creation and directional Jump are strict; old intent meanings stay old', () => {
    const candidate = createSimulationV8(1, 'wizard', R1);
    assert.equal(candidate.rulesetId, R1);
    assert.equal(createSimulationV8(1, 'wizard').rulesetId, V8_RULESET_ID);
    const apply = (state: SimulationStateV8<V8RulesetId>, input: SimulationIntentV8Family) => applySimulationIntentV8(state, 'player', input, 0, 'action', 0);
    assert.equal(apply(candidate, { type: 'jump' }).accepted, false);
    assert.equal(apply(createSimulationV8(1, 'wizard'), { type: 'jump', direction: -1 }).accepted, false);
    assert.equal(apply(createSimulationV8(1, 'wizard'), { type: 'walk_stop' }).accepted, false);
    const hop = r1Intent(r1Floor(), { type: 'jump', direction: -1 });
    assert.equal(hop.units[0].facing, -1); assert.equal(hop.units[0].vxFp, -256);
    assert.equal(hop.heldDirection, 0);
    assert.equal(apply(hop, { type: 'jump', direction: 1 }).accepted, false);
    assert.equal(apply(hop, { type: 'walk_start', direction: 1 }).accepted, false);
});

test('V8 R1 center, reversal and directed walking-hop preserve lease cadence and committed drive', () => {
    let state = r1Intent(r1Floor(), { type: 'walk_start', direction: 1 });
    state = tick(state);
    state = r1Intent(state, { type: 'walk_start', direction: -1 });
    assert.equal(state.heldDirection, -1); assert.equal(state.leaseExpiresTick, 9);
    assert.equal(state.lastLeaseRefreshTick, 0);
    state = tick(state, 2);
    state = r1Intent(state, { type: 'walk_start', direction: 1 });
    assert.equal(state.leaseExpiresTick, 12); assert.equal(state.lastLeaseRefreshTick, 3);
    assert.equal(applySimulationIntentV8(state, 'player', { type: 'walk_start', direction: 1 }, 0).accepted, false);
    state = r1Intent(state, { type: 'jump', direction: -1 });
    assert.equal(state.heldDirection, -1); assert.equal(state.leaseExpiresTick, 12);
    state = r1Intent(state, { type: 'walk_stop' });
    assert.equal(state.heldDirection, 0); assert.equal(state.inputEpoch, 0);
    assert.equal(state.lifecycleBarrierCount, 0); assert.equal(state.units[0].vxFp, -256);
    state = r1Intent(state, { type: 'face', direction: 1 });
    state = tick(state);
    assert.equal(state.units[0].vxFp, -256);
    const released = applySimulationBarrierV8(state, { reason: 'walk_stop', actor: 'player', expectedTurn: 0, expectedEpoch: 0 }).state;
    assert.equal(released.inputEpoch, 1); assert.equal(released.units[0].vxFp, -256);
    const stopped = cancel(released);
    assert.equal(stopped.units[0].vxFp, 0);
    assert.equal(tick(stopped, 20).units[0].xFp, stopped.units[0].xFp);
    const neutral = applySimulationBarrierV8(r1Floor(), { reason: 'walk_stop', actor: 'player', expectedTurn: 0, expectedEpoch: 0 }).state;
    assert.equal(neutral.inputEpoch, 1); assert.equal(neutral.lifecycleBarrierCount, 1);
    assert.equal(applySimulationBarrierV8(neutral, { reason: 'walk_stop', actor: 'player', expectedTurn: 0, expectedEpoch: 0 }).mutated, false);
    const expired = tick(r1Intent(r1Floor(), { type: 'walk_start', direction: 1 }), 9);
    const rejected = applySimulationIntentV8(expired, 'player', { type: 'walk_start', direction: -1 }, 0);
    assert.equal(rejected.accepted, false); assert.deepEqual(rejected.state, expired);
    const live = tick(r1Intent(r1Floor(), { type: 'walk_start', direction: 1 }), 8);
    const reversed = r1Intent(live, { type: 'walk_start', direction: -1 });
    assert.equal(reversed.leaseExpiresTick, 17); assert.equal(reversed.inputEpoch, live.inputEpoch);
});

for (const direction of [-1, 1] as const) for (const height of [8, 16, 24]) {
    test(`V8 R1 fractional ${direction} walking climbs ${height <= 16 ? '' : 'no '} ${height}-unit lip`, () => {
        let state = r1Floor(824 - direction * 12 - direction / 2);
        for (let cy = (320-height)/8; cy < 40; cy++) for (let cx = direction === 1 ? 103 : 0; cx < (direction === 1 ? 256 : 103); cx++)
            setTerrainSolid(state.terrain, cx, cy, true);
        if (direction === 1) {
            state.units[1].yFp = (308-height)*FP;
            state.units[1].support = ((320-height)/8)*256 + Math.floor((1400-12)/8);
        }
        state = tick(r1Intent(state, { type: 'walk_start', direction }));
        assert.equal(state.units[0].yFp, (height <= 16 ? 308-height : 308)*FP);
        assert.equal(state.units[0].xFp, (824-direction*12+(height<=16 ? direction/2 : 0))*FP);
        assertSimulationInvariantsV8Family(state);
    });
}

for (const direction of [-1, 1] as const) test(`V8 R1 seed1 wall-flush ${direction} hop keeps takeoff drive and swept one-unit bound`, () => {
    let state = createSimulationV8(1, 'wizard', R1);
    // Left is the 24 lip. The right 16 lip now walks, so stop on its original flush boundary explicitly.
    state = walk(state, direction === 1 ? 12 : 60, direction);
    state = r1Intent(state, { type: 'walk_stop' });
    assert.equal(state.units[0].xFp/FP, direction === 1 ? 716 : 660);
    const start = state.units[0].xFp;
    state = r1Intent(state, { type: 'jump', direction });
    for (let n = 0; n < 45; n++) {
        const before = state.units[0].xFp;
        state = tick(state);
        assert.ok(Math.abs(state.units[0].xFp-before) <= FP);
        assertSimulationInvariantsV8Family(state);
    }
    assert.ok(direction*(state.units[0].xFp-start) > 30*FP);
});

test('V8 R1 smallest supported lift respects ceiling and actor obstruction', () => {
    const state = r1Floor(812);
    // An 8-unit lip and overhead ceiling permit exactly the smaller lift, not a 16-unit rise.
    setTerrainSolid(state.terrain, 103, 39, true);
    for (let cx = 100; cx <= 102; cx++) setTerrainSolid(state.terrain, cx, 35, true);
    const raised = tick(r1Intent(state, { type: 'walk_start', direction: 1 }));
    assert.equal(raised.units[0].yFp, 300*FP); assert.equal(raised.units[0].xFp, 813*FP);
    const ceiling = r1Floor(812);
    setTerrainSolid(ceiling.terrain, 103, 38, true); setTerrainSolid(ceiling.terrain, 103, 39, true);
    for (let cx = 100; cx <= 102; cx++) setTerrainSolid(ceiling.terrain, cx, 36, true);
    const blocked = tick(r1Intent(ceiling, { type: 'walk_start', direction: 1 }));
    assert.equal(blocked.units[0].yFp, 308*FP); assert.equal(blocked.units[0].xFp, 812*FP);
    const bodies = r1Floor(812);
    bodies.units[1].xFp = 836*FP; bodies.units[1].support = 40*256+103;
    const bodyBlock = tick(r1Intent(bodies, { type: 'walk_start', direction: 1 }));
    assert.equal(bodyBlock.units[0].xFp, 812*FP); assert.equal(bodyBlock.units[0].yFp, 308*FP);
    // Retained hop drive may not tunnel through a ceiling or live body either.
    const hop = tick(r1Intent(bodies, { type: 'jump', direction: 1 }));
    assert.equal(hop.units[0].xFp, 812*FP); assert.equal(hop.units[0].vxFp, FP);
    assertSimulationInvariantsV8Family(hop);
});

test('V8 R1 hard cancel permanently clears clipped jump drive; no face/lease/landing revival', () => {
    let state = walk(createSimulationV8(1, 'wizard', R1), 60, -1);
    state = r1Intent(state, { type: 'walk_stop' });
    state = tick(r1Intent(state, { type: 'jump', direction: -1 }));
    assert.equal(state.units[0].xFp, 660*FP); assert.equal(state.units[0].vxFp, -FP);
    state = cancel(state);
    state = r1Intent(state, { type: 'face', direction: -1 });
    const x = state.units[0].xFp;
    state = tick(state, 90);
    assert.equal(state.units[0].xFp, x); assert.equal(state.units[0].vxFp, 0);
    assert.equal(state.units[0].grounded, true); assert.equal(state.heldDirection, 0);
});

test('V8 R1 batched fractional motion agrees and action/retreat deadlines hard-stop committed hops', () => {
    const initial = r1Floor(); initial.units[0].xFp++;
    const hop = r1Intent(initial, { type: 'jump', direction: -1 });
    let single = hop; let triple = hop; let six = hop;
    for (let elapsed = 0; elapsed < 60; elapsed += 6) {
        for (let n = 0; n < 6; n++) single = tick(single);
        triple = tick(tick(triple, 3), 3); six = tick(six, 6);
        assert.deepEqual(single, triple); assert.deepEqual(single, six);
        assert.equal(single.units[0].xFp % FP, 1);
    }
    for (const phase of ['action', 'retreat'] as const) {
        let state = r1Floor();
        if (phase === 'retreat') { state.phase = 'retreat'; state.phaseDeadlineTick = 60; state.castUsed = true; }
        state = tick(state, state.phaseDeadlineTick-1);
        state = tick(r1Intent(state, { type: 'jump', direction: 1 }));
        assert.equal(state.phase, 'settling'); assert.equal(state.units[0].vxFp, 0);
        const x = state.units[0].xFp;
        state = tick(state, 100);
        assert.equal(state.units[0].xFp, x);
    }
});

test('V8 preserves all ten V7 seeds, starts, RNG, terrain and three Calling statistics', () => {
    for (const seed of SEEDS) for (const calling of ['wizard', 'thief', 'warrior'] as PlayerCalling[]) {
        const old = createSimulation(seed, calling, V7_RULESET_ID);
        const state = createSimulationV8(seed, calling);
        assert.equal(state.rulesetId, V8_RULESET_ID);
        assert.equal(state.seed, old.seed); assert.equal(state.rngState, old.rngState);
        assert.deepEqual(state.terrain, old.terrain);
        state.units.forEach((unit, i) => {
            assert.deepEqual([unit.xFp, unit.yFp, unit.calling, unit.facing, unit.stitching],
                [old.units[i].x * FP, old.units[i].y * FP, old.units[i].calling, old.units[i].facing, 100]);
            assert.equal(unit.grounded, true);
        });
        assert.equal(state.phaseDeadlineTick, 450);
        assertSimulationInvariantsV8(state);
    }
});

for (const duration of [1, 3, 9, 30, 450]) {
    test(`V8 exact integer level travel for ${duration} refreshed ticks, both directions`, () => {
        for (const direction of [-1, 1] as const) {
            const state = walk(floorFixture(900), duration, direction);
            assert.equal(state.units[0].xFp, (900 + direction * duration) * FP);
            assert.equal(state.tick, duration); assert.equal(state.units[0].yFp, 308 * FP);
        }
    });
}

test('V8 tick batches and repeated render projections retain subpixel state', () => {
    const initial = floorFixture(); initial.units[0].xFp += 1;
    const walked = intent(initial, { type: 'walk_start', direction: 1 });
    let single = walked; let triple = walked; let six = walked;
    for (let elapsed = 0; elapsed < 60; elapsed += 6) {
        for (let i = 0; i < 6; i += 1) single = tick(single);
        triple = tick(tick(triple, 3), 3); six = tick(six, 6);
        for (let i = 0; i < 100; i += 1) void Math.floor(single.units[0].xFp / FP);
        assert.equal(single.units[0].xFp % FP, 1);
        assert.equal(hash(single), hash(triple)); assert.equal(hash(single), hash(six));
    }
});

test('V8 committed rest jump has exact tick-1/31/32/63 trajectory with no lease', () => {
    let state = intent(floorFixture(), { type: 'jump' });
    state = tick(state); assert.equal(state.units[0].vyFp, -1984);
    state = tick(state, 30); assert.equal(state.units[0].yFp, (308 - 124) * FP);
    state = tick(state); assert.equal(state.units[0].vyFp, 0);
    assert.equal(state.units[0].yFp, 184 * FP);
    state = tick(state, 31);
    assert.equal(state.units[0].xFp, 663 * FP); assert.equal(state.units[0].yFp, 308 * FP);
    assert.equal(state.units[0].grounded, true); assert.equal(state.units[0].airTicks, 0);
    assert.equal(state.units[0].airDrive, null); assert.equal(state.units[0].vxFp, 0);
});

test('V8 canonical 80-unit opening lands at870; 88-unit opening and edge-only contact do not', () => {
    for (const right of [880, 888]) {
        const initial = floorFixture(807); hole(initial, 800, right);
        const state = tick(intent(initial, { type: 'jump' }), 63);
        assert.equal(state.units[0].xFp, 870 * FP);
        assert.equal(state.units[0].grounded, right === 880);
    }
    const edge = floorFixture(812); hole(edge, 800, 888);
    const state = tick(edge); assert.equal(state.units[0].grounded, false);
    assert.ok(state.units[0].yFp > 308 * FP);
});

test('V8 automatic 8-unit step, blocked16 step, and jump across24-high ledge', () => {
    for (const top of [312, 304]) {
        const initial = floorFixture(812);
        for (let cy = top / 8; cy < 40; cy += 1) for (let cx = 103; cx < 256; cx += 1) {
            setTerrainSolid(initial.terrain, cx, cy, true);
        }
        // Keep the remote unit clear of the fixture terrain change.
        initial.units[1].yFp = (top - 12) * FP;
        initial.units[1].support = top / 8 * 256 + 173;
        const state = walk(initial, 20);
        assert.equal(state.units[0].xFp, (top === 312 ? 832 : 812) * FP);
        assert.equal(state.units[0].yFp, (top - (top === 312 ? 12 : -4)) * FP);
    }
    const initial = floorFixture(807);
    for (let cy = 37; cy < 40; cy += 1) setTerrainSolid(initial.terrain, 103, cy, true);
    const state = tick(intent(initial, { type: 'jump' }), 63);
    assert.equal(state.units[0].xFp, 870 * FP); assert.equal(state.units[0].grounded, true);
});

test('V8 crater entry, floor jump-out and lip landing stay clear without snapping', () => {
    const initial = floorFixture(832); deformTerrain(initial.terrain, 832, 320, 40);
    let state = tick(initial);
    assert.ok(state.units[0].yFp > 308 * FP && state.units[0].yFp < 309 * FP);
    for (let i = 0; i < 120 && !state.units[0].grounded; i += 1) state = tick(state);
    assert.ok(state.units[0].yFp > 308 * FP); assert.equal(state.units[0].grounded, true);
    const startX = state.units[0].xFp;
    state = intent(state, { type: 'jump' });
    for (let i = 0; i < 120 && !state.units[0].grounded; i += 1) state = tick(state);
    assert.equal(state.units[0].grounded, true); assert.equal(state.units[0].yFp, 308 * FP);
    assert.ok(state.units[0].xFp > startX + 40 * FP);
});

test('V8 ceiling clips exactly, sides clamp and bottom is open with removal', () => {
    let state = floorFixture(12); state = walk(state, 9, -1);
    assert.equal(state.units[0].xFp, 12 * FP);
    state = floorFixture(2036); state = walk(state, 9);
    assert.equal(state.units[0].xFp, 2036 * FP);
    state = floorFixture(); state.units[0].yFp = 12 * FP;
    state.units[0].grounded = false; state.units[0].support = null;
    state.units[0].vyFp = -2048; state.units[0].airDrive = 'jump';
    state = tick(state); assert.equal(state.units[0].yFp, 12 * FP); assert.equal(state.units[0].vyFp, 0);
    state = floorFixture(832); hole(state, 800, 888);
    state = tick(state, 120);
    assert.equal(state.units[0].alive, false); assert.equal(state.units[0].stitching, 0);
    assert.equal(state.winner, 'loomkeeper'); assert.equal(state.finishReason, 'unravelled');
});

test('V8 live bodies side-block and support stacks; dead bodies do neither', () => {
    let state = floorFixture(600); state.units[1].xFp = 640 * FP;
    state.units[1].support = 40 * 256 + 78;
    state = walk(state, 30); assert.equal(state.units[0].xFp, 616 * FP);
    state = floorFixture(600); state.units[1].xFp = 600 * FP;
    state.units[0].yFp = 284 * FP; state.units[0].support = 'loomkeeper';
    state.units[1].support = 40 * 256 + 73;
    state = tick(state); assert.equal(state.units[0].grounded, true);
    assert.equal(state.units[0].support, 'loomkeeper');
    state.units[1].alive = false; state.units[1].stitching = 0;
    state = tick(state); assert.equal(state.phase, 'settling'); assert.equal(state.units[0].grounded, false);
    state = tick(state, 120); assert.equal(state.units[0].yFp, 308 * FP); assert.equal(state.winner, 'player');
});

test('V8 lease t+2/+3/+8/+9 and explicit airborne cancellation', () => {
    const started = intent(floorFixture(), { type: 'walk_start', direction: 1 });
    assert.equal(applySimulationIntentV8(tick(started, 2), 'player', { type: 'walk_refresh' }, 0).accepted, false);
    assert.equal(intent(tick(started, 3), { type: 'walk_refresh' }).leaseExpiresTick, 12);
    assert.equal(intent(tick(started, 8), { type: 'walk_refresh' }).leaseExpiresTick, 17);
    assert.equal(applySimulationIntentV8(tick(started, 9), 'player', { type: 'walk_refresh' }, 0).accepted, false);
    const expired = tick(started, 30); assert.equal(expired.units[0].xFp, 609 * FP);
    assert.equal(expired.heldDirection, 0); assert.ok(expired.inputEpoch > started.inputEpoch);
    let jump = tick(intent(floorFixture(), { type: 'jump' }), 10);
    const x = jump.units[0].xFp; jump = cancel(jump); jump = tick(jump, 53);
    assert.equal(jump.units[0].xFp, x); assert.equal(jump.units[0].grounded, true);
    const heldJump = tick(intent(started, { type: 'jump' }), 63);
    assert.equal(heldJump.units[0].xFp, 663 * FP);
});

test('V8 airborne input does not steer or buffer another jump', () => {
    let state = tick(intent(floorFixture(), { type: 'jump' }), 8);
    const before = hash(state);
    assert.equal(applySimulationIntentV8(state, 'player', { type: 'jump' }, 0).accepted, false);
    assert.equal(hash(state), before);
    state = intent(state, { type: 'walk_start', direction: -1 });
    state = tick(state, 3); assert.equal(state.units[0].xFp, 611 * FP);
});

test('V8 action449/450/451 rejects late Fire, grants no timeout retreat and keeps last movement step', () => {
    const initial = floorFixture();
    const at449 = tick(initial, 449); assert.equal(at449.phase, 'action');
    assert.equal(fire(at449).phase, 'projectile');
    const at450 = tick(initial, 450); assert.equal(at450.turn, 1); assert.equal(at450.phase, 'action');
    assert.equal(at450.activeActor, 'loomkeeper'); assert.equal(at450.phaseDeadlineTick, 900);
    assert.equal(applySimulationIntentV8(at450, 'player', { type: 'fire', aimId: 1 }, 0).accepted, false);
    assert.equal(tick(initial, 451).turn, 1);
});

test('V8 ascending timeout settles with zero horizontal travel before handover', () => {
    let state = tick(floorFixture(), 449); state = intent(state, { type: 'jump' });
    state = tick(state); assert.equal(state.phase, 'settling'); assert.equal(state.settleReason, 'action_timeout');
    const x = state.units[0].xFp; assert.equal(state.units[0].vxFp, 0);
    state = tick(state, 62); assert.equal(state.turn, 1); assert.equal(state.units[0].xFp, x);
    assert.equal(state.phase, 'action'); assert.equal(state.castUsed, false);
});

test('V8 shot then retreat59/60/61 permits movement only and exactly one cast', () => {
    let state = finishFlight(fire(floorFixture(), 90000, 1000));
    for (let i = 0; i < 120 && state.phase === 'settling'; i += 1) state = tick(state);
    assert.equal(state.phase, 'retreat'); const start = state.tick;
    for (const input of [{ type: 'select_relic', relicId: 'needlepoint' }, { type: 'aim', angleMilliDegrees: 0, powerPermille: 0 },
        { type: 'fire', aimId: state.aimId }] as SimulationIntentV8[]) {
        assert.equal(applySimulationIntentV8(state, 'player', input, 0).accepted, false);
    }
    const at59 = tick(state, 59); assert.equal(at59.phase, 'retreat');
    const at60 = tick(state, 60); assert.equal(at60.turn, 1); assert.equal(at60.tick, start + 60);
    assert.equal(tick(state, 61).turn, 1);
});

test('V8 settling119/120 checks stability/death before safety cap; unsupported120 draws', () => {
    const initial = floorFixture(); initial.phase = 'settling'; initial.settleReason = 'action_timeout';
    initial.phaseStartedTick = 0; initial.phaseDeadlineTick = 120; initial.tick = 119;
    initial.units[0].grounded = false; initial.units[0].support = null; initial.units[0].airTicks = 119;
    initial.units[0].yFp -= 1; initial.units[0].vyFp = 0;
    const landed = tick(initial); assert.equal(landed.turn, 1); assert.equal(landed.finishReason, null);
    const suspended = cloneSimulationV8(initial); suspended.units[0].yFp = 100 * FP;
    const capped = tick(suspended); assert.equal(capped.finishReason, 'simulation_limit');
    assert.equal(capped.winner, 'draw'); assert.equal(tick(capped).tick, 120);
    const dead = cloneSimulationV8(suspended); dead.units.forEach(unit => { unit.alive = false; unit.stitching = 0; });
    assert.equal(tick(dead).finishReason, 'unravelled');
});

test('V8 terminal one/both deaths precede turn16 and terminal operations are inert', () => {
    for (const both of [false, true]) {
        const initial = floorFixture(); initial.turn = 15; initial.tick = 449;
        initial.units[1].alive = false; initial.units[1].stitching = 0;
        if (both) { initial.units[0].alive = false; initial.units[0].stitching = 0; }
        const result = tick(initial); assert.equal(result.finishReason, 'unravelled');
        assert.equal(result.winner, both ? 'draw' : 'player');
        assert.equal(hash(tick(result, 100)), hash(result)); assert.equal(hash(cancel(result)), hash(result));
        assert.equal(hash(forceSimulationLimitV8(result).state), hash(result));
    }
    const exhausted = tick(floorFixture(), 16800);
    assert.equal(exhausted.turn, 16); assert.equal(exhausted.tick, 7200); assert.equal(exhausted.finishReason, 'turn_limit');
    assert.equal(V8_SIM_RULES.maximumTurnTicks, 1050);
});

test('V8 intent512/513, barrier128/129, stale ownership and malformed input fail closed', () => {
    let state = floorFixture();
    for (let i = 0; i < 512; i += 1) state = intent(state, { type: 'face', direction: i % 2 ? 1 : -1 });
    assert.equal(state.acceptedIntentCount, 512);
    const limited = applySimulationIntentV8(state, 'player', { type: 'face', direction: 1 }, 0);
    assert.equal(limited.accepted, false); assert.equal(limited.error?.code, 'INTENT_LIMIT');
    assert.equal(hash(limited.state), hash(state));
    state = floorFixture();
    for (let i = 0; i < 128; i += 1) state = applySimulationBarrierV8(state, {
        reason: 'reconnect', actor: 'player', expectedTurn: 0, expectedEpoch: state.inputEpoch
    }).state;
    assert.equal(state.lifecycleBarrierCount, 128);
    assert.equal(applySimulationBarrierV8(state, { reason: 'resume', actor: 'player', expectedTurn: 0,
        expectedEpoch: state.inputEpoch }).error?.code, 'LIFECYCLE_LIMIT');
    for (const input of [{ type: 'jump', xFp: 1 }, { type: 'face', direction: 2 },
        { type: 'aim', angleMilliDegrees: NaN, powerPermille: 5 }] as unknown as SimulationIntentV8[]) {
        assert.equal(applySimulationIntentV8(state, 'player', input, 0).accepted, false);
    }
    const ai = tick(floorFixture(), 450);
    for (const reason of ['cancel', 'disconnect', 'reconnect'] as const) {
        assert.equal(hash(applySimulationBarrierV8(ai, { reason, actor: 'player', expectedTurn: 1,
            expectedEpoch: ai.inputEpoch }).state), hash(ai));
    }
});

test('V8 strict invariants reject mixed identity, unknown fields and non-integer coordinates', () => {
    const initial = floorFixture();
    for (const malformed of [ { ...initial, rulesetId: V7_RULESET_ID }, { ...initial, extra: true },
        { ...initial, tick: 16801 }, { ...initial, inputEpoch: 65536 } ]) {
        assert.throws(() => assertSimulationInvariantsV8(malformed as SimulationStateV8));
    }
    const fractional = cloneSimulationV8(initial); fractional.units[0].xFp += 0.5;
    assert.throws(() => assertSimulationInvariantsV8(fractional));
    const reversed = Object.fromEntries(Object.entries(initial).reverse()) as SimulationStateV8;
    assert.equal(hash(initial), hash(reversed));
});

test('V8 preserves V7 trace, impact, radial/direct damage and crater for frozen shots', () => {
    for (const seed of SEEDS) for (const relicId of ['threadball', 'needlepoint', 'spoolburst'] as RelicId[]) {
        for (const angle of [0, 45000, 90000]) {
            let old = createSimulation(seed, 'wizard', V7_RULESET_ID);
            old = applySimulationCommand(old, 'player', { type: 'select_relic', relicId }, 0).state;
            old = applySimulationCommand(old, 'player', { type: 'aim', angleMilliDegrees: angle, powerPermille: 1000 }, 0).state;
            old = applySimulationCommand(old, 'player', { type: 'fire' }, 0).state;
            let current = intent(createSimulationV8(seed, 'wizard'), { type: 'select_relic', relicId });
            current = finishFlight(fire(current, angle, 1000));
            assert.deepEqual(current.lastProjectile, old.lastProjectile, `${seed}/${relicId}/${angle}`);
            assert.deepEqual(current.terrain, old.terrain);
            assert.deepEqual(current.units.map(unit => unit.stitching), old.units.map(unit => unit.stitching));
        }
    }
});

test('V8 live walk_start cannot bypass the three-tick lease refresh interval', () => {
    const state = tick(intent(floorFixture(), { type: 'walk_start', direction: 1 }));
    for (const direction of [-1, 1] as const) {
        const result = applySimulationIntentV8(state, 'player', { type: 'walk_start', direction }, 0);
        assert.equal(result.accepted, false); assert.equal(hash(result.state), hash(state));
    }
});

test('V8 descending action timeout and exact landing450 settle or hand over in order', () => {
    for (const launchTick of [387, 390]) {
        let state = intent(tick(floorFixture(), launchTick), { type: 'jump' });
        state = tick(state, 450 - launchTick);
        assert.equal(state.tick, 450);
        assert.equal(state.phase, launchTick === 387 ? 'action' : 'settling');
        assert.equal(state.turn, launchTick === 387 ? 1 : 0);
        const x = state.units[0].xFp;
        if (launchTick === 390) { state = tick(state, 3); assert.equal(state.turn, 1); }
        assert.equal(state.units[0].xFp, x); assert.equal(state.units[0].grounded, true);
    }
});

test('V8 retreat ascending and descending deadline freeze horizontal until stable', () => {
    const ready = finishFlight(fire(floorFixture(), 90000, 1000));
    assert.equal(ready.phase, 'retreat');
    for (const launchTick of [0, 59]) {
        let state = intent(tick(ready, launchTick), { type: 'jump' });
        state = tick(state, 60 - launchTick);
        assert.equal(state.phase, 'settling'); assert.equal(state.settleReason, 'retreat_timeout');
        const x = state.units[0].xFp;
        state = tick(state, launchTick === 0 ? 3 : 62);
        assert.equal(state.turn, 1); assert.equal(state.units[0].xFp, x);
    }
});

test('V8 projectile299/300/301 lifetime commits no damage or crater and pauses bodies', () => {
    let state = fire(floorFixture());
    state.tick = 298;
    Object.assign(state.projectile!, { flightTicks: 298, xFp: 1000 * FP, yFp: 200 * FP, vxFp: 0, vyFp: -80 });
    const beforeTerrain = [...state.terrain.words]; const beforeUnits = JSON.stringify(state.units);
    state = tick(state); assert.equal(state.phase, 'projectile'); assert.equal(state.projectile!.flightTicks, 299);
    state = tick(state); assert.equal(state.tick, 300); assert.equal(state.lastProjectile!.impact, 'lifetime');
    assert.equal(state.phase, 'retreat'); assert.equal(state.phaseDeadlineTick, 360);
    assert.deepEqual(state.terrain.words, beforeTerrain); assert.equal(JSON.stringify(state.units), beforeUnits);
    assert.equal(tick(state).phase, 'retreat');
});

test('V8 post-shot settling waits for survivor; one or both damage deaths skip retreat', () => {
    for (const victims of ['target', 'both', 'caster'] as const) {
        let state = floorFixture(600); state.units[1].xFp = 624 * FP;
        state.units[1].support = 40 * 256 + 76;
        if (victims !== 'target') state.units[0].stitching = 1;
        if (victims !== 'caster') state.units[1].stitching = 1;
        state = finishFlight(fire(state, 0, 0));
        if (victims === 'both') assert.equal(state.phase, 'finished');
        else assert.equal(state.phase, 'settling');
        for (let i = 0; i < 120 && state.phase !== 'finished'; i += 1) {
            state = tick(state); assert.notEqual(state.phase, 'retreat');
        }
        assert.equal(state.finishReason, 'unravelled');
        assert.equal(state.winner, victims === 'both' ? 'draw' : victims === 'target' ? 'player' : 'loomkeeper');
    }
});

test('V8 no lift through ceiling or live body; high-speed sweeps cannot tunnel', () => {
    const ceiling = floorFixture(812);
    setTerrainSolid(ceiling.terrain, 103, 39, true);
    for (let cx = 100; cx <= 105; cx += 1) setTerrainSolid(ceiling.terrain, cx, 36, true);
    assert.equal(walk(ceiling, 9).units[0].xFp, 812 * FP);
    const stacked = floorFixture(812);
    setTerrainSolid(stacked.terrain, 103, 39, true);
    stacked.units[1].xFp = 812 * FP; stacked.units[1].yFp = 284 * FP; stacked.units[1].support = 'player';
    assert.equal(walk(stacked, 9).units[0].xFp, 812 * FP);
    const wall = floorFixture(809);
    for (let cy = 1; cy < 40; cy += 1) setTerrainSolid(wall.terrain, 103, cy, true);
    wall.units[0].grounded = false; wall.units[0].support = null; wall.units[0].yFp = 200 * FP;
    wall.units[0].vxFp = 2048; wall.units[0].airDrive = 'jump';
    assert.equal(tick(wall).units[0].xFp, 812 * FP);
});

test('V8 reject every stale actor/turn/phase/epoch and acknowledged-aim mismatch without mutation', () => {
    const state = intent(floorFixture(), { type: 'aim', angleMilliDegrees: 45000, powerPermille: 1000 });
    for (const result of [
        applySimulationIntentV8(state, 'loomkeeper', { type: 'jump' }, 0),
        applySimulationIntentV8(state, 'player', { type: 'jump' }, 1),
        applySimulationIntentV8(state, 'player', { type: 'jump' }, 0, 'retreat'),
        applySimulationIntentV8(state, 'player', { type: 'jump' }, 0, 'action', state.inputEpoch + 1),
        applySimulationIntentV8(state, 'player', { type: 'fire', aimId: state.aimId + 1 }, 0)
    ]) { assert.equal(result.accepted, false); assert.equal(hash(result.state), hash(state)); }
});

test('V8 snapshots reject half-open expired phases, uncommitted projectiles and invalid terminal facts', () => {
    const ready = floorFixture();
    const ended = forceSimulationLimitV8(ready).state;
    const shot = fire(ready);
    for (const bad of [
        { ...ready, tick: 450 }, { ...shot, castUsed: false },
        { ...ended, winner: 'player' }, { ...ready, aim: { angleMilliDegrees: 0, powerPermille: 100 }, aimId: 0 }
    ] as SimulationStateV8[]) assert.throws(() => assertSimulationInvariantsV8(bad));
});

test('V8 emits canonical automatic lease and phase barriers without extra revisions', () => {
    let state = intent(tick(floorFixture(), 440), { type: 'walk_start', direction: 1 });
    state = tick(state, 9);
    const revision = state.revision;
    const boundary = advanceSimulationTicksV8(state, 1);
    assert.deepEqual(boundary.events.filter(event => event.type === 'input_barrier'), [
        { type: 'input_barrier', reason: 'lease_expired', tick: 449 },
        { type: 'input_barrier', reason: 'phase', tick: 450 }
    ]);
    assert.equal(boundary.state.revision, revision + 1);
    assert.equal(boundary.state.lifecycleBarrierCount, 0);
});
