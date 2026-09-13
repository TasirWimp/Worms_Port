import assert from 'node:assert/strict';
import test from 'node:test';

import {
    LoomkeeperExecutionV10,
    LoomkeeperPlannerV10,
    V10_AI_MAX_ROLLOUT_TICKS,
    V10_AI_MAX_TOTAL_ROLLOUT_TICKS,
    V10_AI_PLANNING_TICKS,
    V10_AI_PLANS,
    V10_AI_PLANS_PER_TICK
} from '../../shared/loomkeeper-v10';
import {
    LoomkeeperPlannerV9,
    V9_AI_MAX_ROLLOUT_TICKS,
    V9_AI_MAX_TOTAL_ROLLOUT_TICKS,
    V9_AI_PLANNING_TICKS,
    V9_AI_PLANS,
    V9_AI_PLANS_PER_TICK
} from '../../shared/loomkeeper-v9';
import {
    advanceSimulationTicksV10,
    applySimulationBarrierV10,
    applySimulationIntentV10,
    canonicalSimulationJsonV10,
    createSimulationV10,
    simulationV9ViewOfV10,
    V10_R1_RULESET_ID,
    V10_R3_RULESET_ID, V10_R4_RULESET_ID,
    V10_RULESET_ID,
    type SimulationStateV10
} from '../../shared/simulation-v10';

for (const ruleset of [V10_R3_RULESET_ID, V10_R4_RULESET_ID]) test(`V10G planner precision/cache parity: ${ruleset}`, () => {
    const source = createSimulationV10(5, 'wizard', ruleset);
    source.activeActor = 'loomkeeper'; source.units[1].thread = 3;
    for (const [index, unit] of source.units.entries()) {
        const x = index === 0 ? 880 : 1168;
        unit.xFp = x * 256; unit.yFp = 324 * 256;
        unit.support = 42 * 256 + Math.floor((x - 12) / 8);
    }
    const original = canonicalSimulationJsonV10(source);
    const planner = new LoomkeeperPlannerV10(source);
    const uncached = new LoomkeeperPlannerV10(source, { reuseIdenticalPrefixes: false });
    for (let tick = 0; tick < 30; tick += 1) { planner.step(); uncached.step(); }
    assert.equal(canonicalSimulationJsonV10(source), original);
    assert.equal(planner.evaluatedCandidates, 180);
    assert.deepEqual(planner.selection, uncached.selection);
    assert.equal(planner.rolloutTicks, uncached.rolloutTicks);
    assert.equal(planner.selectedCandidate()!.relicId, 'needlepoint', 'new 60-damage precision beats the lob');
    let state = advanceSimulationTicksV10(source, 30).state;
    const execution = new LoomkeeperExecutionV10(planner.selectedCandidate()!, planner.selection.prefix, state);
    let fired = false;
    for (let tick = 0; tick < 1050 && state.turn === source.turn && state.phase !== 'finished'; tick += 1) {
        for (let slot = 0; slot < 8; slot += 1) {
            const operation = execution.next(state); if (!operation) break;
            const result: ReturnType<typeof applySimulationIntentV10> = operation.kind === 'intent'
                ? applySimulationIntentV10(state, 'loomkeeper', operation.intent, state.turn, state.phase, state.inputEpoch)
                : applySimulationBarrierV10(state, operation.barrier);
            assert.equal(result.accepted, true);
            fired ||= operation.kind === 'intent' && operation.intent.type === 'fire';
            state = result.state;
        }
        if (state.turn === source.turn) state = advanceSimulationTicksV10(state, 1).state;
    }
    assert.equal(fired, true);
    assert.equal(state.units[0].stitching, 40);
    assert.notEqual(state.turn, source.turn);
});

const V10E_ASSESSMENT_SEEDS = [1, 2, 3, 0x13579BDF, 0xC0FFEE11, 0xDEADBEEF] as const;

function loomkeeperAction(seed = 1): SimulationStateV10 {
    let state = createSimulationV10(seed, 'wizard');
    for (let count = 0; count < 1_000 && state.activeActor !== 'loomkeeper'; count += 1) {
        state = advanceSimulationTicksV10(state, 1).state;
    }
    assert.equal(state.activeActor, 'loomkeeper');
    assert.equal(state.phase, 'action');
    return state;
}

test('V10C planner adapter preserves the exact V9 lattice, work caps, selection, and source state', () => {
    assert.deepEqual([
        V10_AI_PLANS,
        V10_AI_PLANNING_TICKS,
        V10_AI_PLANS_PER_TICK,
        V10_AI_MAX_ROLLOUT_TICKS,
        V10_AI_MAX_TOTAL_ROLLOUT_TICKS
    ], [
        V9_AI_PLANS,
        V9_AI_PLANNING_TICKS,
        V9_AI_PLANS_PER_TICK,
        V9_AI_MAX_ROLLOUT_TICKS,
        V9_AI_MAX_TOTAL_ROLLOUT_TICKS
    ]);
    const source = loomkeeperAction(1);
    const before = canonicalSimulationJsonV10(source);
    const v10 = new LoomkeeperPlannerV10(source);
    const v9 = new LoomkeeperPlannerV9(simulationV9ViewOfV10(source));
    for (let tick = 0; tick < V10_AI_PLANNING_TICKS; tick += 1) {
        v10.step();
        v9.step();
    }
    assert.equal(v10.planningTicks, 30);
    assert.equal(v10.evaluatedCandidates, 180);
    assert.ok(v10.rolloutTicks <= V10_AI_MAX_TOTAL_ROLLOUT_TICKS);
    assert.ok(v10.maximumRolloutTicks <= V10_AI_MAX_ROLLOUT_TICKS);
    assert.deepEqual(v10.selection, v9.selection);
    assert.equal(v10.rolloutTicks, v9.rolloutTicks);
    assert.equal(v10.maximumRolloutTicks, v9.maximumRolloutTicks);
    assert.equal(v10.unaffordableCandidates, v9.unaffordableCandidates);
    assert.equal(canonicalSimulationJsonV10(source), before);
});

test('V10C execution applies the inherited operation cursor only through V10 transitions', () => {
    const source = loomkeeperAction(2);
    const planner = new LoomkeeperPlannerV10(source);
    for (let tick = 0; tick < V10_AI_PLANNING_TICKS; tick += 1) planner.step();
    assert.equal(planner.selection.status, 'selected');
    let state = advanceSimulationTicksV10(source, V10_AI_PLANNING_TICKS).state;
    const execution = new LoomkeeperExecutionV10(
        planner.selectedCandidate()!, planner.selection.prefix, state
    );
    const profile = state.terrainProfileId;
    const operations: string[] = [];
    for (let tick = 0; tick < 1_100 && state.phase !== 'finished' && state.turn === source.turn; tick += 1) {
        for (let slot = 0; slot < 8; slot += 1) {
            const operation = execution.next(state);
            if (!operation) break;
            const transition = operation.kind === 'intent'
                ? applySimulationIntentV10(
                    state, 'loomkeeper', operation.intent,
                    state.turn, state.phase, state.inputEpoch
                )
                : applySimulationBarrierV10(state, operation.barrier);
            assert.equal(transition.accepted, true);
            if (!transition.mutated) continue;
            operations.push(operation.kind === 'intent' ? operation.intent.type : operation.barrier.reason);
            state = transition.state;
            assert.equal(state.rulesetId, V10_RULESET_ID);
            assert.equal(state.terrainProfileId, profile);
        }
        if (state.phase !== 'finished' && state.turn === source.turn) {
            state = advanceSimulationTicksV10(state, 1).state;
        }
    }
    assert.ok(operations.includes('fire'));
    assert.notEqual(state.turn, source.turn);
    assert.equal(state.terrainProfileId, profile);
});

test('V10E tactical openings give both sides legal bounded plans and exercise jump routes', () => {
    let jumpSelections = 0;
    for (const seed of V10E_ASSESSMENT_SEEDS) for (const actor of ['player', 'loomkeeper'] as const) {
        const state = createSimulationV10(seed, 'wizard', V10_R1_RULESET_ID);
        state.activeActor = actor;
        state.units.forEach(unit => { unit.thread = 0; unit.lastCreditedTurn = -1; });
        const active = state.units[actor === 'player' ? 0 : 1];
        active.thread = 3;
        active.lastCreditedTurn = state.turn;
        const planner = new LoomkeeperPlannerV10(state);
        for (let tick = 0; tick < V10_AI_PLANNING_TICKS; tick += 1) planner.step();
        assert.equal(planner.selection.status, 'selected', `${seed}/${actor}: legal plan`);
        assert.equal(planner.evaluatedCandidates, V10_AI_PLANS);
        assert.ok(planner.rolloutTicks <= V10_AI_MAX_TOTAL_ROLLOUT_TICKS);
        if (planner.selectedCandidate()?.jump) jumpSelections += 1;
    }
    assert.ok(jumpSelections >= V10E_ASSESSMENT_SEEDS.length, 'the bounded policy uses tactical jumps across the matrix');
});
