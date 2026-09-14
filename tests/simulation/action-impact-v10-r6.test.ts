import assert from 'node:assert/strict';
import test from 'node:test';

import { setTerrainSolid, type RelicId } from '../../shared/simulation';
import {
    CURRENT_V10_RULESET_ID,
    V10_R5_RULESET_ID,
    V10_R6_DYNAMICS,
    V10_R6_RULESET_ID,
    SimulationStateV10Schema,
    advanceSimulationTicksV10,
    applySimulationIntentV10,
    assertSimulationInvariantsV10,
    createSimulationV10,
    hashSimulationStateV10,
    mechanicsForV10
} from '../../shared/simulation-v10';

const FP = 256;

test('current V10 R6 keeps the exact R5 volcanic arena and frozen weapon-terrain table', () => {
    assert.equal(CURRENT_V10_RULESET_ID, V10_R6_RULESET_ID);
    const r5 = createSimulationV10(4, 'wizard', V10_R5_RULESET_ID);
    const r6 = createSimulationV10(4, 'wizard', V10_R6_RULESET_ID);

    assert.equal(r6.terrainProfileId, 'volcanic-ruin');
    assert.equal(r6.terrainRecipeRevision, r5.terrainRecipeRevision);
    assert.equal(r6.terrainCandidateIndex, r5.terrainCandidateIndex);
    assert.deepEqual(r6.terrain, r5.terrain);
    const normalizedUnits = structuredClone(r6.units);
    normalizedUnits[0].thread = r5.units[0].thread;
    assert.deepEqual(normalizedUnits, r5.units);
    assert.equal(r5.units[0].thread, 3);
    assert.equal(r6.units[0].thread, 5);

    const r5Mechanics = mechanicsForV10(V10_R5_RULESET_ID)!;
    const r6Mechanics = mechanicsForV10(V10_R6_RULESET_ID)!;
    assert.deepEqual(r6Mechanics.relics, r5Mechanics.relics);
    assert.equal(r6Mechanics.terrainFirst, r5Mechanics.terrainFirst);
    assert.equal(r6Mechanics.shieldBlast, r5Mechanics.shieldBlast);
    assert.deepEqual(r6Mechanics.directHitbox, { halfWidth: 22, top: 56, bottom: 12 });
    assert.equal(r5Mechanics.directHitbox, undefined);
    assert.equal(r5Mechanics.blastImpulse, undefined);
    assert.deepEqual(r6Mechanics.blastImpulse, {
        threadball: { minimumSpeedFp: 384, maximumSpeedFp: 1_536, upwardBiasFp: 1_152 },
        needlepoint: { minimumSpeedFp: 256, maximumSpeedFp: 768, upwardBiasFp: 512 },
        spoolburst: { minimumSpeedFp: 320, maximumSpeedFp: 1_280, upwardBiasFp: 960 }
    });
});

test('R6 grants a deterministic 60-second action while R5 remains frozen at 15 seconds', () => {
    const r5 = createSimulationV10(4, 'wizard', V10_R5_RULESET_ID);
    let r6 = createSimulationV10(4, 'wizard', V10_R6_RULESET_ID);

    assert.equal(r5.phaseDeadlineTick, 450);
    assert.equal(r6.phaseDeadlineTick, V10_R6_DYNAMICS.actionTicks);
    r6 = advanceSimulationTicksV10(r6, 1_799).state;
    assert.equal(r6.tick, 1_799);
    assert.equal(r6.turn, 0);
    assert.equal(r6.activeActor, 'player');
    assert.equal(r6.phase, 'action');

    r6 = advanceSimulationTicksV10(r6, 1).state;
    assert.equal(r6.tick, 1_800);
    assert.equal(r6.turn, 1);
    assert.equal(r6.activeActor, 'loomkeeper');
    assert.equal(r6.phase, 'action');
    assert.equal(r6.phaseDeadlineTick, 3_600);
    assertSimulationInvariantsV10(r6);
});

test('R6 sustains long touch movement with six-tick refreshes and still permits exactly one offensive shot', () => {
    let state = createSimulationV10(4, 'wizard', V10_R6_RULESET_ID);
    state = accepted(state, { type: 'walk_start', direction: -1 });
    for (let interval = 0; interval < 75; interval += 1) {
        state = advanceSimulationTicksV10(state, 6).state;
        state = accepted(state, { type: 'walk_refresh' });
    }
    assert.equal(state.tick, 450);
    assert.equal(state.phase, 'action');
    assert.equal(state.activeActor, 'player');
    assert.equal(state.heldDirection, -1);
    assert.ok(state.acceptedIntentCount < V10_R6_DYNAMICS.maximumIntentsPerTurn);

    state = accepted(state, { type: 'walk_stop' });
    state = accepted(state, { type: 'select_relic', relicId: 'threadball' });
    state = accepted(state, { type: 'aim', angleMilliDegrees: 45_000, powerPermille: 800 });
    const fired = applySimulationIntentV10(state, 'player', { type: 'fire', aimId: state.aimId }, state.turn);
    assert.equal(fired.accepted, true);
    assert.equal(fired.state.phase, 'projectile');
    assert.equal(fired.state.castUsed, true);
    assert.equal(fired.state.phaseDeadlineTick, fired.state.tick + V10_R6_DYNAMICS.projectileTicks);

    const second = applySimulationIntentV10(fired.state, 'player', { type: 'fire', aimId: state.aimId }, state.turn);
    assert.equal(second.accepted, false);
    assert.equal(second.error?.code, 'COMMAND_REJECTED');
});

test('R6 walks at the refined speed and uses a shorter normal jump with bounded aftertouch', () => {
    const r5Initial = createSimulationV10(4, 'wizard', V10_R5_RULESET_ID);
    const r6Initial = createSimulationV10(4, 'wizard', V10_R6_RULESET_ID);
    const r5Walking = advanceSimulationTicksV10(accepted(r5Initial, { type: 'walk_start', direction: -1 }), 1).state;
    const r6Walking = advanceSimulationTicksV10(accepted(r6Initial, { type: 'walk_start', direction: -1 }), 1).state;
    assert.equal(r5Initial.units[0].xFp - r5Walking.units[0].xFp, 256);
    assert.equal(r6Initial.units[0].xFp - r6Walking.units[0].xFp, V10_R6_DYNAMICS.walkSpeedFp);
    assert.equal(V10_R6_DYNAMICS.walkSpeedFp, 336);

    const neutralStartX = r6Initial.units[0].xFp;
    let neutralJump = accepted(r6Initial, { type: 'jump', direction: 0 });
    assert.equal(neutralJump.units[0].vxFp, 0);
    assert.equal(neutralJump.units[0].vyFp, -1_728);
    neutralJump = advanceSimulationTicksV10(neutralJump, 10).state;
    assert.equal(neutralJump.units[0].xFp, neutralStartX);
    assert.equal(neutralJump.units[0].facing, r6Initial.units[0].facing);

    let jump = accepted(createSimulationV10(4, 'wizard', V10_R6_RULESET_ID), { type: 'jump', direction: 1 });
    assert.equal(jump.units[0].vxFp, 336);
    assert.equal(jump.units[0].vyFp, -1_728);
    const steered = applySimulationIntentV10(jump, 'player', { type: 'walk_start', direction: -1 }, jump.turn);
    assert.equal(steered.accepted, true, JSON.stringify(steered.error));
    jump = advanceSimulationTicksV10(steered.state, 10).state;
    assert.equal(jump.units[0].grounded, false);
    assert.equal(jump.units[0].vxFp, 96);
    assert.equal(jump.units[0].vyFp, -1_088);

    const legacyJump = accepted(createSimulationV10(4, 'wizard', V10_R5_RULESET_ID), { type: 'jump', direction: 1 });
    const legacySteer = applySimulationIntentV10(legacyJump, 'player', { type: 'walk_start', direction: -1 }, legacyJump.turn);
    assert.equal(legacySteer.accepted, false);
    assert.equal(legacyJump.units[0].vxFp, 256);
    const legacyNeutral = applySimulationIntentV10(
        createSimulationV10(4, 'wizard', V10_R5_RULESET_ID), 'player', { type: 'jump', direction: 0 }, 0
    );
    assert.equal(legacyNeutral.accepted, false);

    let reinforced = accepted(createSimulationV10(4, 'wizard', V10_R6_RULESET_ID),
        { type: 'threadleap', direction: 1 });
    assert.equal(reinforced.units[0].vyFp, -2_048);
    reinforced = advanceSimulationTicksV10(reinforced, 10).state;
    assert.equal(reinforced.units[0].vyFp, -1_408);
});

test('R6 opens with enough Thread to select and fire Spoolburst while frozen R5 retains three', () => {
    const r5 = createSimulationV10(4, 'wizard', V10_R5_RULESET_ID);
    let r6 = createSimulationV10(4, 'wizard', V10_R6_RULESET_ID);
    assert.equal(r5.units[0].thread, 3);
    assert.equal(r6.units[0].thread, 5);

    r6 = accepted(r6, { type: 'select_relic', relicId: 'spoolburst' });
    r6 = accepted(r6, { type: 'aim', angleMilliDegrees: 45_000, powerPermille: 800 });
    r6 = accepted(r6, { type: 'fire', aimId: r6.aimId });
    assert.equal(r6.selectedRelic, 'spoolburst');
    assert.equal(r6.units[0].thread, 0);
});

test('R6 projectile collision uses the compact character envelope', () => {
    const r5 = directEnvelopeProbe(V10_R5_RULESET_ID);
    const r6 = directEnvelopeProbe(V10_R6_RULESET_ID);

    assert.equal(r5.lastProjectile?.impact, 'loomkeeper');
    assert.equal(r6.lastProjectile, null);
    assert.notEqual(r6.projectile, null);
});

test('R6 direct impacts launch an exposed survivor while R5 damage and terrain remain frozen', () => {
    const r5 = advanceSimulationTicksV10(impactSource(V10_R5_RULESET_ID, 'threadball', 600, 900), 1).state;
    let r6 = advanceSimulationTicksV10(impactSource(V10_R6_RULESET_ID, 'threadball', 600, 900), 1).state;

    assert.equal(r5.lastProjectile?.impact, 'loomkeeper');
    assert.equal(r6.lastProjectile?.impact, 'loomkeeper');
    assert.equal(r5.units[1].stitching, 55);
    assert.equal(r6.units[1].stitching, 55);
    assert.deepEqual(r6.terrain, r5.terrain, 'R6 impulse cannot change the inherited crater');
    assert.deepEqual([r5.units[1].vxFp, r5.units[1].vyFp, r5.units[1].airDrive], [0, 0, 'walk_fall']);
    assert.deepEqual([r6.units[1].vxFp, r6.units[1].vyFp, r6.units[1].airDrive], [1_536, -1_152, 'blast']);
    assert.equal(r6.phase, 'settling');
    assert.equal(r6.heldDirection, 0);
    assert.equal(r6.leaseExpiresTick, null);

    const launchedX = r6.units[1].xFp;
    for (let tick = 0; tick < V10_R6_DYNAMICS.settlingTicks && r6.phase === 'settling'; tick += 1) {
        r6 = advanceSimulationTicksV10(r6, 1).state;
    }
    assert.equal(r6.phase, 'retreat');
    assert.equal(r6.units[1].grounded, true);
    assert.equal(r6.units[1].airDrive, null);
    assert.ok(r6.units[1].xFp > launchedX);
    assertSimulationInvariantsV10(r6);
});

test('R6 impact motion launches both exposed actors away and applies deterministic radial falloff', () => {
    const close = advanceSimulationTicksV10(impactSource(V10_R6_RULESET_ID, 'threadball', 800, 840), 1).state;
    const edge = advanceSimulationTicksV10(impactSource(V10_R6_RULESET_ID, 'threadball', 760, 840), 1).state;
    const mirrored = advanceSimulationTicksV10(impactSource(V10_R6_RULESET_ID, 'threadball', 880, 840), 1).state;

    assert.equal(close.phase, 'settling');
    assert.deepEqual(close.units.map(unit => unit.airDrive), ['blast', 'blast']);
    assert.ok(close.units[0].vxFp < 0, 'the exposed shooter moves left, away from the impact');
    assert.ok(close.units[1].vxFp > 0, 'the coincident target follows rightward projectile travel');
    assert.ok(close.units.every(unit => unit.vyFp < 0), 'grounded actors receive upward launch');
    assert.ok(Math.abs(close.units[0].vxFp) > Math.abs(edge.units[0].vxFp));
    assert.ok(close.units[0].stitching < edge.units[0].stitching);
    assert.equal(mirrored.units[0].vxFp, -close.units[0].vxFp,
        'equal splash distance produces equal force away from the opposite side');
    assert.equal(mirrored.units[0].vyFp, close.units[0].vyFp);
    assert.equal(mirrored.units[0].stitching, close.units[0].stitching);

    const rejected = applySimulationIntentV10(close, 'player', { type: 'walk_start', direction: 1 },
        close.turn, close.phase, close.inputEpoch);
    assert.equal(rejected.accepted, false);
    assert.equal(rejected.error?.code, 'COMMAND_REJECTED');
    assert.deepEqual(rejected.state.units.map(unit => unit.vxFp), close.units.map(unit => unit.vxFp));
});

test('R6 direct-hit travel tie-break and per-Relic impulse are deterministic', () => {
    const expected = {
        threadball: [1_536, -1_152],
        needlepoint: [768, -512],
        spoolburst: [1_280, -960]
    } satisfies Record<RelicId, [number, number]>;
    for (const relic of ['threadball', 'needlepoint', 'spoolburst'] as const) {
        const right = advanceSimulationTicksV10(impactSource(V10_R6_RULESET_ID, relic, 600, 900, 256), 1).state;
        const left = advanceSimulationTicksV10(impactSource(V10_R6_RULESET_ID, relic, 900, 600, -256), 1).state;
        assert.deepEqual([right.units[1].vxFp, right.units[1].vyFp], expected[relic]);
        assert.deepEqual([left.units[1].vxFp, left.units[1].vyFp], [-expected[relic][0], expected[relic][1]]);
        assert.equal(right.units[1].airDrive, 'blast');
        assert.equal(left.units[1].airDrive, 'blast');
    }
});

test('R6 blast motion uses swept terrain collision from both directions without tunnelling', () => {
    for (const side of [1, -1] as const) {
        const targetX = side === 1 ? 900 : 600;
        const source = impactSource(V10_R6_RULESET_ID, 'threadball', side === 1 ? 600 : 900, targetX, side * 256);
        const wallCellX = side === 1 ? 120 : 67;
        for (let cy = 0; cy < 40; cy += 1) setTerrainSolid(source.terrain, wallCellX, cy, true);
        assertSimulationInvariantsV10(source);

        let state = advanceSimulationTicksV10(source, 1).state;
        for (let tick = 0; tick < 20; tick += 1) state = advanceSimulationTicksV10(state, 1).state;
        const target = state.units[1];
        assert.equal(state.phase, 'settling');
        assert.equal(target.airDrive, 'blast');
        assert.equal(target.vxFp, 0);
        assert.ok(side === 1 ? target.xFp <= 948 * FP : target.xFp >= 556 * FP);
        assertSimulationInvariantsV10(state);
    }
});

test('R6 blast state validates only on R6 and advances identically in batches or single ticks', () => {
    const source = impactSource(V10_R6_RULESET_ID, 'threadball', 800, 840);
    const impacted = advanceSimulationTicksV10(source, 1).state;
    assert.equal(SimulationStateV10Schema.safeParse(impacted).success, true);
    const forgedR5 = structuredClone(impacted);
    forgedR5.rulesetId = V10_R5_RULESET_ID;
    assert.equal(SimulationStateV10Schema.safeParse(forgedR5).success, false);

    const batched = advanceSimulationTicksV10(source, 90).state;
    let stepped = source;
    for (let tick = 0; tick < 90; tick += 1) stepped = advanceSimulationTicksV10(stepped, 1).state;
    assert.deepEqual(stepped, batched);
    assert.equal(hashSimulationStateV10(stepped), hashSimulationStateV10(batched));
});

test('R6 unresolved blast motion fails closed at the settling bound', () => {
    const state = advanceSimulationTicksV10(impactSource(V10_R6_RULESET_ID, 'threadball', 600, 900), 1).state;
    state.tick = state.phaseDeadlineTick - 1;
    state.units[1].airTicks = V10_R6_DYNAMICS.maximumAirTicks - 1;
    assertSimulationInvariantsV10(state);

    const terminal = advanceSimulationTicksV10(state, 1).state;
    assert.equal(terminal.phase, 'finished');
    assert.equal(terminal.winner, 'draw');
    assert.equal(terminal.finishReason, 'simulation_limit');
    assert.equal(terminal.units[1].vxFp, 0);
    assertSimulationInvariantsV10(terminal);
});

function accepted(
    state: ReturnType<typeof createSimulationV10>,
    intent: Parameters<typeof applySimulationIntentV10>[2]
) {
    const result = applySimulationIntentV10(state, state.activeActor, intent, state.turn, state.phase, state.inputEpoch);
    assert.equal(result.accepted, true, JSON.stringify(result.error));
    return result.state;
}

function directEnvelopeProbe(rulesetId: typeof V10_R5_RULESET_ID | typeof V10_R6_RULESET_ID) {
    const state = createSimulationV10(4, 'wizard', rulesetId);
    const targetX = Math.floor(state.units[1].xFp / 256);
    const targetY = Math.floor(state.units[1].yFp / 256) - 70;
    state.phase = 'projectile';
    state.phaseStartedTick = state.tick;
    state.phaseDeadlineTick = state.tick + 300;
    state.castUsed = true;
    state.projectile = {
        actor: 'player', relicId: 'threadball', xFp: targetX * 256, yFp: targetY * 256,
        vxFp: 0, vyFp: -80, flightTicks: 0, startX: targetX, startY: targetY,
        trace: [{ x: targetX, y: targetY }]
    };
    assertSimulationInvariantsV10(state);
    return advanceSimulationTicksV10(state, 1).state;
}

function impactSource(
    rulesetId: typeof V10_R5_RULESET_ID | typeof V10_R6_RULESET_ID,
    relicId: RelicId,
    shooterX: number,
    targetX: number,
    projectileVxFp = targetX >= shooterX ? 256 : -256
) {
    const state = createSimulationV10(4, 'wizard', rulesetId);
    state.terrain.words.fill(0);
    for (let cy = 40; cy < 72; cy += 1) {
        for (let cx = 0; cx < 256; cx += 1) setTerrainSolid(state.terrain, cx, cy, true);
    }
    for (const [index, x] of [shooterX, targetX].entries()) {
        const unit = state.units[index];
        unit.xFp = x * FP; unit.yFp = 308 * FP; unit.vxFp = 0; unit.vyFp = 0;
        unit.grounded = true; unit.support = 40 * 256 + Math.floor((x - 12) / 8);
        unit.airTicks = 0; unit.airDrive = null;
    }
    state.selectedRelic = relicId;
    state.castUsed = true;
    state.phase = 'projectile'; state.phaseStartedTick = state.tick;
    state.phaseDeadlineTick = state.tick + V10_R6_DYNAMICS.projectileTicks;
    state.projectile = {
        actor: 'player', relicId, xFp: targetX * FP, yFp: 308 * FP,
        vxFp: projectileVxFp, vyFp: -80, flightTicks: 0,
        startX: targetX - Math.sign(projectileVxFp), startY: 308,
        trace: [{ x: targetX - Math.sign(projectileVxFp), y: 308 }]
    };
    assertSimulationInvariantsV10(state);
    return state;
}
