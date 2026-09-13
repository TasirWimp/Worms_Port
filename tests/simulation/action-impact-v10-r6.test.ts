import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CURRENT_V10_RULESET_ID,
    V10_R5_RULESET_ID,
    V10_R6_DYNAMICS,
    V10_R6_RULESET_ID,
    advanceSimulationTicksV10,
    applySimulationIntentV10,
    assertSimulationInvariantsV10,
    createSimulationV10,
    mechanicsForV10
} from '../../shared/simulation-v10';

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
