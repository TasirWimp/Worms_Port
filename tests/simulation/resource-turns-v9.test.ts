import assert from 'node:assert/strict';
import test from 'node:test';
import {
    V9_RULESET_ID, applySimulationBarrierV9, applySimulationIntentV9, advanceSimulationTicksV9,
    createSimulationV9, hashSimulationStateV9
} from '../../shared/simulation-v9';
import { setTerrainSolid, type PlayerCalling } from '../../shared/simulation';
import {
    V8_R1_RULESET_ID, advanceSimulationTicksV8, applySimulationBarrierV8,
    applySimulationIntentV8, createSimulationV8, type SimulationStateV8R1
} from '../../shared/simulation-v8';

const FROZEN_SEEDS = [1, 2, 3, 4, 17, 42, 1337, 65535, 2147483648, 4294967295];
const CALLINGS: PlayerCalling[] = ['wizard', 'thief', 'warrior'];
const FP = 256;

test('V9 creation credits only the opening actor and keeps a canonical hash', () => {
    const state = createSimulationV9(1, 'wizard');
    assert.equal(state.rulesetId, V9_RULESET_ID);
    assert.deepEqual(state.units.map(unit => [unit.thread, unit.lastCreditedTurn]), [[3, 0], [0, -1]]);
    assert.equal(hashSimulationStateV9(state), '1ff143ac0cdc89d50c9dad5e9bb0eddd9f9852342f2f4499efd966c6351c39c5');
});

test('V9 Thread costs are atomic and carry over to the next own action', () => {
    let state = createSimulationV9(1, 'wizard');
    const stale = applySimulationIntentV9(state, 'player', { type: 'fire', aimId: 1 }, 0, 'action', 0);
    assert.equal(stale.accepted, false);
    assert.equal(stale.state.units[0].thread, 3);
    state = applySimulationIntentV9(state, 'player', { type: 'aim', angleMilliDegrees: 0, powerPermille: 0 }, 0, 'action', 0).state;
    state = applySimulationIntentV9(state, 'player', { type: 'fire', aimId: 1 }, 0, 'action', 0).state;
    assert.equal(state.units[0].thread, 1);
    state = advanceSimulationTicksV9(state, 450).state;
    state = advanceSimulationTicksV9(state, 450).state;
    assert.equal(state.activeActor, 'player');
    assert.equal(state.units[0].thread, 4);
});

test('V9 utilities share a slot, require a fresh aim after use, and debit once', () => {
    let state = createSimulationV9(1, 'wizard');
    state = applySimulationIntentV9(state, 'player', { type: 'aim', angleMilliDegrees: 0, powerPermille: 0 }, 0, 'action', 0).state;
    state = applySimulationIntentV9(state, 'player', { type: 'threadguard' }, 0, 'action', 0).state;
    assert.equal(state.units[0].thread, 1);
    assert.equal(state.utilityUsed, true);
    assert.equal(state.aim, null);
    assert.equal(hashSimulationStateV9(state), '763348dde907c6c2d6ce7871eaa29d9f60cd235391a9188a7dd1ec1401dad0ce');
    assert.equal(applySimulationIntentV9(state, 'player', { type: 'threadleap', direction: 1 }, 0, 'action', state.inputEpoch).accepted, false);
    assert.equal(applySimulationIntentV9(state, 'player', { type: 'fire', aimId: 1 }, 0, 'action', state.inputEpoch).accepted, false);
});

test('V9 Threadleap retains the V8-r1 arc while doubling clear-floor travel', () => {
    let state = clearFloorState();
    state = applySimulationIntentV9(state, 'player', { type: 'threadleap', direction: 1 }, 0, 'action', 0).state;
    assert.equal(state.units[0].thread, 1);
    assert.equal(state.units[0].reinforcedLeap, true);
    state = advanceSimulationTicksV9(state, 63).state;
    assert.equal(state.units[0].xFp / 256, 926);
    assert.equal(state.units[0].grounded, true);
    assert.equal(state.units[0].reinforcedLeap, false);
});

test('V9 pause interrupts a reinforced leap without refunding Thread or stopping gravity', () => {
    let state = clearFloorState();
    state = applySimulationIntentV9(state, 'player', { type: 'threadleap', direction: 1 }, 0, 'action', 0).state;
    state = advanceSimulationTicksV9(state, 1).state;
    const paused = applySimulationBarrierV9(state, { reason: 'pause', actor: 'player', expectedTurn: 0, expectedEpoch: state.inputEpoch });
    assert.equal(paused.accepted, true);
    assert.equal(paused.state.units[0].thread, 1);
    assert.equal(paused.state.units[0].vxFp, 0);
    const falling = advanceSimulationTicksV9(paused.state, 1).state;
    assert.equal(falling.units[0].airTicks, 2);
});

test('V9 intent-limit barrier neutralizes an airborne reinforced leap without a debit', () => {
    let state = clearFloorState();
    state = applySimulationIntentV9(state, 'player', { type: 'threadleap', direction: 1 }, 0, 'action', 0).state;
    state.acceptedIntentCount = 512;
    const limited = applySimulationBarrierV9(state, { reason: 'intent_limit', actor: 'player', expectedTurn: 0, expectedEpoch: state.inputEpoch });
    assert.equal(limited.accepted, true);
    assert.equal(limited.state.units[0].thread, 1);
    assert.equal(limited.state.units[0].vxFp, 0);
    assert.equal(limited.state.utilityUsed, true);
});

test('V9 Threadguard absorbs projectile damage independently from Stitching', () => {
    let state = clearFloorState();
    state.units[1].xFp = 840 * 256;
    state.units[1].support = 40 * 256 + 103;
    state = applySimulationIntentV9(state, 'player', { type: 'threadguard' }, 0, 'action', 0).state;
    state = advanceSimulationTicksV9(state, 450).state;
    state = applySimulationIntentV9(state, 'loomkeeper', { type: 'aim', angleMilliDegrees: 0, powerPermille: 0 }, 1, 'action', state.inputEpoch).state;
    state = applySimulationIntentV9(state, 'loomkeeper', { type: 'fire', aimId: 1 }, 1, 'action', state.inputEpoch).state;
    const impact = advanceSimulationTicksV9(state, 2);
    const damage = impact.events.find(event => event.type === 'damage_resolved');
    assert.ok(damage && damage.actor === 'player');
    assert.equal(damage.absorbed, 24);
    assert.equal(damage.stitchingLost, damage.raw - 24);
    assert.equal(impact.state.units[0].stitching, 100 - damage.stitchingLost);
});

test('V9 Threadguard fully absorbs a distant terrain hit and retains the unused shield', () => {
    let state = clearFloorState();
    state = applySimulationIntentV9(state, 'player', { type: 'threadguard' }, 0, 'action', 0).state;
    state.units[0].thread = 3;
    // The first low-power Threadball reaches this x=832, y=304..311 wall as a
    // terrain impact: its radial amount is below 24 and must leave HP untouched.
    for (let cy = 38; cy <= 39; cy += 1) setTerrainSolid(state.terrain, 104, cy, true);
    state = applySimulationIntentV9(state, 'player', { type: 'aim', angleMilliDegrees: 0, powerPermille: 0 }, 0, 'action', state.inputEpoch).state;
    state = applySimulationIntentV9(state, 'player', { type: 'fire', aimId: 1 }, 0, 'action', state.inputEpoch).state;
    const impact = advanceSimulationTicksV9(state, 60);
    const damage = impact.events.find(event => event.type === 'damage_resolved' && event.actor === 'player');
    assert.ok(damage && damage.raw < 24); assert.equal(damage.absorbed, damage.raw); assert.equal(damage.stitchingLost, 0);
    assert.equal(impact.state.units[0].stitching, 100); assert.equal(impact.state.units[0].shield, 24 - damage.raw);
});

test('V9 Threadguard never inflates Stitching during ordinary state evolution or expiry', () => {
    let state = createSimulationV9(1, 'wizard');
    state.units[0].stitching = 70;
    state = applySimulationIntentV9(state, 'player', { type: 'threadguard' }, 0, 'action', 0).state;
    state = applySimulationIntentV9(state, 'player', { type: 'face', direction: -1 }, 0, 'action', state.inputEpoch).state;
    assert.equal(state.units[0].stitching, 70);
    state = advanceSimulationTicksV9(state, 1).state;
    assert.equal(state.units[0].stitching, 70);
    state = advanceSimulationTicksV9(state, 449).state;
    state = advanceSimulationTicksV9(state, 450).state;
    assert.equal(state.activeActor, 'player');
    assert.equal(state.units[0].shield, 0);
    assert.equal(state.units[0].stitching, 70);
});

test('V9 batched ticks equal repeated ticks and credit every intervening action entry', () => {
    const initial = createSimulationV9(1, 'wizard');
    const batched = advanceSimulationTicksV9(initial, 900).state;
    let repeated = initial;
    for (let tick = 0; tick < 900; tick += 1) repeated = advanceSimulationTicksV9(repeated, 1).state;
    assert.deepEqual(batched, repeated);
    assert.deepEqual(batched.units.map(unit => [unit.thread, unit.lastCreditedTurn]), [[6, 2], [3, 1]]);
});

test('V9 Thread income caps at nine without changing the inactive actor', () => {
    let state = createSimulationV9(1, 'wizard');
    state.units[0].thread = 9;
    state = advanceSimulationTicksV9(state, 900).state;
    assert.equal(state.activeActor, 'player');
    assert.deepEqual(state.units.map(unit => [unit.thread, unit.lastCreditedTurn]), [[9, 2], [3, 1]]);
});

test('V9 Threadguard resolves self damage through the same independent absorption path', () => {
    let state = createSimulationV9(1, 'wizard');
    state.units[0].thread = 9;
    state = applySimulationIntentV9(state, 'player', { type: 'threadguard' }, 0, 'action', 0).state;
    state = applySimulationIntentV9(state, 'player', { type: 'aim', angleMilliDegrees: 90000, powerPermille: 0 }, 0, 'action', state.inputEpoch).state;
    state = applySimulationIntentV9(state, 'player', { type: 'fire', aimId: 1 }, 0, 'action', state.inputEpoch).state;
    const impact = advanceSimulationTicksV9(state, 60);
    const damage = impact.events.find(event => event.type === 'damage_resolved');
    assert.deepEqual(damage, { type: 'damage_resolved', actor: 'player', raw: 45, absorbed: 24,
        stitchingLost: 21, stitching: 79, shield: 0 });
});

test('V9 Threadguard expiry and lethal residual damage clear all dead resource state', () => {
    let state = createSimulationV9(1, 'wizard');
    state.units[0].stitching = 20;
    state.units[0].thread = 9;
    state = applySimulationIntentV9(state, 'player', { type: 'threadguard' }, 0, 'action', 0).state;
    state = applySimulationIntentV9(state, 'player', { type: 'aim', angleMilliDegrees: 90000, powerPermille: 0 }, 0, 'action', state.inputEpoch).state;
    state = applySimulationIntentV9(state, 'player', { type: 'fire', aimId: 1 }, 0, 'action', state.inputEpoch).state;
    const impact = advanceSimulationTicksV9(state, 60);
    assert.equal(impact.events.find(event => event.type === 'damage_resolved')?.stitching, 0);
    assert.deepEqual(impact.state.units[0].alive, false);
    assert.deepEqual([impact.state.units[0].shield, impact.state.units[0].shieldExpiresTurn, impact.state.units[0].reinforcedLeap], [0, null, false]);
});

test('V9 clears Threadguard state when a shielded actor dies without a damage event', () => {
    let state = clearFloorState();
    state = applySimulationIntentV9(state, 'player', { type: 'threadguard' }, 0, 'action', 0).state;
    state.units[0].yFp = 588 * FP; state.units[0].grounded = false; state.units[0].support = null;
    state.units[0].vyFp = 2048; state.units[0].airTicks = 0; state.units[0].airDrive = 'walk_fall';
    const result = advanceSimulationTicksV9(state, 1);
    assert.equal(result.events.some(event => event.type === 'damage_resolved' && event.actor === 'player'), false);
    assert.equal(result.state.units[0].alive, false);
    assert.deepEqual([result.state.units[0].stitching, result.state.units[0].shield, result.state.units[0].shieldExpiresTurn], [0, 0, null]);
});

test('V9 utility counter exhaustion terminalizes before any debit or saturated mutation', () => {
    const state = createSimulationV9(1, 'wizard');
    state.revision = 65535;
    const result = applySimulationIntentV9(state, 'player', { type: 'threadguard' }, 0, 'action', 0);
    assert.equal(result.accepted, true);
    assert.equal(result.state.phase, 'finished');
    assert.equal(result.state.finishReason, 'simulation_limit');
    assert.equal(result.state.units[0].thread, 3);
    assert.equal(result.state.utilityUsed, false);
});

test('V9 retains V8-r1 creation and ordinary face parity for every frozen seed and Calling', () => {
    for (const seed of FROZEN_SEEDS) for (const calling of CALLINGS) {
        const v8 = createSimulationV8(seed, calling, V8_R1_RULESET_ID);
        const v9 = createSimulationV9(seed, calling);
        assert.deepEqual(asV8(v9), v8, `${seed}/${calling} creation`);
        const face8 = applySimulationIntentV8(v8, 'player', { type: 'face', direction: -1 }, 0, 'action', 0);
        const face9 = applySimulationIntentV9(v9, 'player', { type: 'face', direction: -1 }, 0, 'action', 0);
        assert.equal(face9.accepted, face8.accepted, `${seed}/${calling} face acceptance`);
        assert.deepEqual(asV8(face9.state), face8.state, `${seed}/${calling} face parity`);
    }
});

test('V9 normal free actions retain V8-r1 reversal, lease, 8/16-step and 63-tick jump behavior', () => {
    let { v8, v9 } = pairedFloor(800);
    ({ v8, v9 } = pairedIntent(v8, v9, { type: 'walk_start', direction: 1 }));
    ({ v8, v9 } = pairedTicks(v8, v9, 1));
    ({ v8, v9 } = pairedIntent(v8, v9, { type: 'walk_start', direction: -1 }));
    ({ v8, v9 } = pairedTicks(v8, v9, 2));
    ({ v8, v9 } = pairedIntent(v8, v9, { type: 'walk_start', direction: 1 }));
    assert.equal(v9.leaseExpiresTick, 12);
    ({ v8, v9 } = pairedIntent(v8, v9, { type: 'walk_refresh' }));
    assert.deepEqual(asV8(v9), v8);

    for (const height of [8, 16]) {
        ({ v8, v9 } = pairedFloor(811.5));
        for (const state of [v8, v9]) for (let cy = (320 - height) / 8; cy < 40; cy += 1) {
            for (let cx = 103; cx < 256; cx += 1) setTerrainSolid(state.terrain, cx, cy, true);
        }
        for (const state of [v8, v9]) {
            state.units[1].yFp = (308 - height) * FP;
            state.units[1].support = ((320 - height) / 8) * FP + Math.floor((1200 - 12) / 8);
        }
        ({ v8, v9 } = pairedIntent(v8, v9, { type: 'walk_start', direction: 1 }));
        ({ v8, v9 } = pairedTicks(v8, v9, 1));
        assert.equal(v9.units[0].yFp, (308 - height) * FP, `${height}-unit step`);
    }

    ({ v8, v9 } = pairedFloor(800));
    ({ v8, v9 } = pairedIntent(v8, v9, { type: 'jump', direction: 1 }));
    ({ v8, v9 } = pairedTicks(v8, v9, 63));
    assert.equal(v9.units[0].xFp, 863 * FP);
    assert.equal(v9.units[0].grounded, true);
});

test('V9 exercises the frozen wall, ceiling, actor, ledge and residual-rise geometry through V8-r1 parity', () => {
    const fixtures: Array<{ name: string; prepare: (v8: SimulationStateV8R1, v9: ReturnType<typeof createSimulationV9>) => void }> = [
        {
            name: 'wall and residual rise retry',
            prepare: (v8, v9) => {
                for (const state of [v8, v9]) for (let cx = 104; cx <= 107; cx += 1) for (let cy = 34; cy <= 39; cy += 1)
                    setTerrainSolid(state.terrain, cx, cy, true);
                for (const state of [v8, v9]) { state.units[0].xFp = 820 * FP; state.units[0].yFp = 308 * FP; state.units[0].support = 40 * FP + Math.floor((820 - 12) / 8); }
            }
        },
        {
            name: 'ceiling',
            prepare: (v8, v9) => {
                for (const state of [v8, v9]) for (let cx = 96; cx <= 111; cx += 1) for (let cy = 23; cy <= 25; cy += 1)
                    setTerrainSolid(state.terrain, cx, cy, true);
            }
        },
        {
            name: 'actor obstruction',
            prepare: (v8, v9) => {
                for (const state of [v8, v9]) { state.units[1].xFp = 840 * FP; state.units[1].yFp = 308 * FP; state.units[1].support = 40 * FP + 103; }
            }
        },
        {
            name: '16-unit ledge',
            prepare: (v8, v9) => {
                for (const state of [v8, v9]) for (let cx = 104; cx <= 111; cx += 1) for (let cy = 37; cy <= 38; cy += 1)
                    setTerrainSolid(state.terrain, cx, cy, true);
            }
        }
    ];
    for (const fixture of fixtures) {
        let { v8, v9 } = pairedFloor(800);
        fixture.prepare(v8, v9);
        ({ v8, v9 } = pairedIntent(v8, v9, { type: 'jump', direction: 1 }));
        ({ v8, v9 } = pairedTicks(v8, v9, 63));
        assert.deepEqual(asV8(v9), v8, fixture.name);
    }
});

test('V9 Threadleap carries its reinforced marker and 512 impulse through every frozen obstacle fixture', () => {
    const prepare = (kind: 'wall' | 'ceiling' | 'actor' | 'ledge') => {
        const state = clearFloorState();
        if (kind === 'wall') {
            for (let cx = 104; cx <= 107; cx += 1) for (let cy = 34; cy <= 39; cy += 1) setTerrainSolid(state.terrain, cx, cy, true);
            state.units[0].xFp = 820 * FP; state.units[0].support = 40 * FP + Math.floor((820 - 12) / 8);
        }
        if (kind === 'ceiling') for (let cx = 96; cx <= 111; cx += 1) for (let cy = 23; cy <= 25; cy += 1) setTerrainSolid(state.terrain, cx, cy, true);
        if (kind === 'actor') { state.units[1].xFp = 840 * FP; state.units[1].support = 40 * FP + 103; }
        if (kind === 'ledge') for (let cx = 104; cx <= 111; cx += 1) for (let cy = 37; cy <= 38; cy += 1) setTerrainSolid(state.terrain, cx, cy, true);
        return state;
    };
    for (const kind of ['wall', 'ceiling', 'actor', 'ledge'] as const) {
        let state = prepare(kind);
        state = applySimulationIntentV9(state, 'player', { type: 'threadleap', direction: 1 }, 0, 'action', 0).state;
        assert.equal(state.units[0].vxFp, 512, kind); assert.equal(state.units[0].reinforcedLeap, true, kind);
        const first = advanceSimulationTicksV9(state, 1).state;
        if (kind === 'wall' || kind === 'actor') assert.ok(first.units[0].xFp <= state.units[0].xFp + 512, kind);
        const landed = advanceSimulationTicksV9(first, 119).state;
        assert.equal(landed.units[0].reinforcedLeap, false, kind);
        assert.equal(landed.units[0].grounded, true, kind);
    }
});

test('V9 rejects unaffordable, stale, duplicate and deadline Fire atomically', () => {
    let state = createSimulationV9(1, 'wizard');
    state.units[0].thread = 1;
    state = applySimulationIntentV9(state, 'player', { type: 'aim', angleMilliDegrees: 0, powerPermille: 0 }, 0, 'action', 0).state;
    const unaffordable = applySimulationIntentV9(state, 'player', { type: 'fire', aimId: 1 }, 0, 'action', state.inputEpoch);
    assert.equal(unaffordable.accepted, false); assert.equal(unaffordable.state.units[0].thread, 1); assert.equal(unaffordable.state.projectile, null);
    state.units[0].thread = 3;
    const fired = applySimulationIntentV9(state, 'player', { type: 'fire', aimId: 1 }, 0, 'action', state.inputEpoch);
    assert.equal(fired.accepted, true); assert.equal(fired.state.units[0].thread, 1);
    const duplicate = applySimulationIntentV9(fired.state, 'player', { type: 'fire', aimId: 1 }, 0, 'action', fired.state.inputEpoch);
    assert.equal(duplicate.accepted, false); assert.equal(duplicate.state.units[0].thread, 1);
    const stale = applySimulationIntentV9(state, 'player', { type: 'fire', aimId: 2 }, 0, 'action', state.inputEpoch + 1);
    assert.equal(stale.accepted, false); assert.equal(stale.state.units[0].thread, 3);
    const deadline = advanceSimulationTicksV9(createSimulationV9(1, 'wizard'), 450).state;
    assert.equal(applySimulationIntentV9(deadline, deadline.activeActor, { type: 'fire', aimId: 1 }, deadline.turn, deadline.phase, deadline.inputEpoch).accepted, false);
});

function asV8(state: ReturnType<typeof createSimulationV9>): SimulationStateV8R1 {
    const { utilityUsed: _utilityUsed, units, ...common } = state;
    return {
        ...common, formatVersion: 8, rulesetId: V8_R1_RULESET_ID, rulesetVersion: 8,
        units: units.map(({ thread: _thread, lastCreditedTurn: _credit, shield: _shield, shieldExpiresTurn: _expiry, reinforcedLeap: _leap, ...unit }) => unit) as SimulationStateV8R1['units']
    };
}

function pairedFloor(x: number): { v8: SimulationStateV8R1; v9: ReturnType<typeof createSimulationV9> } {
    const v8 = createSimulationV8(1, 'wizard', V8_R1_RULESET_ID);
    const v9 = createSimulationV9(1, 'wizard');
    for (const state of [v8, v9]) {
        state.terrain.words.fill(0);
        for (let cx = 0; cx < 256; cx += 1) for (let cy = 40; cy < 72; cy += 1) setTerrainSolid(state.terrain, cx, cy, true);
        state.units.forEach((unit, index) => { unit.xFp = (index === 0 ? x : 1200) * FP; unit.yFp = 308 * FP; unit.vxFp = 0; unit.vyFp = 0; unit.grounded = true; unit.support = 40 * FP + Math.floor((unit.xFp / FP - 12) / 8); unit.airTicks = 0; unit.airDrive = null; });
    }
    return { v8, v9 };
}

function pairedIntent(v8: SimulationStateV8R1, v9: ReturnType<typeof createSimulationV9>, intent: Parameters<typeof applySimulationIntentV8>[2]): { v8: SimulationStateV8R1; v9: ReturnType<typeof createSimulationV9> } {
    const next8 = applySimulationIntentV8(v8, 'player', intent, v8.turn, v8.phase, v8.inputEpoch);
    const next9 = applySimulationIntentV9(v9, 'player', intent, v9.turn, v9.phase, v9.inputEpoch);
    assert.equal(next9.accepted, next8.accepted, JSON.stringify(intent));
    assert.deepEqual(asV8(next9.state), next8.state, JSON.stringify(intent));
    return { v8: next8.state, v9: next9.state };
}

function pairedTicks(v8: SimulationStateV8R1, v9: ReturnType<typeof createSimulationV9>, count: number): { v8: SimulationStateV8R1; v9: ReturnType<typeof createSimulationV9> } {
    const next8 = advanceSimulationTicksV8(v8, count); const next9 = advanceSimulationTicksV9(v9, count);
    assert.equal(next9.accepted, next8.accepted); assert.deepEqual(asV8(next9.state), next8.state);
    return { v8: next8.state, v9: next9.state };
}

function clearFloorState() {
    const state = createSimulationV9(1, 'wizard');
    state.terrain.words.fill(0);
    for (let x = 0; x < 256; x += 1) setTerrainSolid(state.terrain, x, 40, true);
    state.units[0].xFp = 800 * 256; state.units[0].yFp = 308 * 256; state.units[0].support = 40 * 256 + 98;
    state.units[1].xFp = 1200 * 256; state.units[1].yFp = 308 * 256; state.units[1].support = 40 * 256 + 148;
    return state;
}
