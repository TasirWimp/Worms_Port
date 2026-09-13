import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CoordinatorReplayV10Schema, ReplayOperationV10Schema, SimulationIntentV10Schema, SimulationSnapshotV10Schema
} from '../../shared/protocol-v10';
import { V9_RULESET_ID } from '../../shared/simulation-v9';
import {
    V10_R1_RULESET_ID, V10_R2_RULESET_ID, V10_R6_RULESET_ID, V10_RULESET_ID,
    createSimulationV10, hashSimulationStateV10
} from '../../shared/simulation-v10';
import { V10_PROCEDURAL_RECIPE_REVISION } from '../../shared/terrain-generation-v10';

test('V10 protocol accepts only the exact state and operation identities', () => {
    const state = createSimulationV10(2, 'wizard');
    assert.equal(SimulationSnapshotV10Schema.safeParse(state).success, true);
    assert.equal(SimulationSnapshotV10Schema.safeParse({ ...state, formatVersion: 9 }).success, false);
    assert.equal(SimulationSnapshotV10Schema.safeParse({ ...state, rulesetId: V9_RULESET_ID }).success, false);
    assert.equal(SimulationSnapshotV10Schema.safeParse({ ...state, extra: true }).success, false);
    assert.equal(SimulationSnapshotV10Schema.safeParse({ ...state, terrainRecipeRevision: undefined }).success, false);
    assert.equal(ReplayOperationV10Schema.safeParse({
        kind: 'intent', actor: 'player', intent: { type: 'threadguard' },
        expectedTurn: 0, expectedPhase: 'action', expectedEpoch: 0
    }).success, true);
    assert.equal(ReplayOperationV10Schema.safeParse({
        kind: 'intent', actor: 'player', intent: { type: 'threadguard', extra: true },
        expectedTurn: 0, expectedPhase: 'action', expectedEpoch: 0
    }).success, false);
    assert.equal(SimulationIntentV10Schema.safeParse({ type: 'jump', direction: 0 }).success, true);
    assert.equal(SimulationIntentV10Schema.safeParse({ type: 'jump', direction: 2 }).success, false);
});

test('V10 replay binds seed, selected terrain profile and initial hash without a wire envelope', () => {
    const state = createSimulationV10(2, 'wizard');
    const replay = {
        formatVersion: 10,
        challengeId: 'challenge_protocol_v10',
        sessionId: 'session_protocol_v10',
        seed: state.seed,
        calling: 'wizard',
        rulesetId: V10_RULESET_ID,
        terrainProfileId: state.terrainProfileId,
        initialStateHash: hashSimulationStateV10(state),
        records: []
    };
    assert.equal(CoordinatorReplayV10Schema.safeParse(replay).success, true);
    assert.equal(CoordinatorReplayV10Schema.safeParse({ ...replay, terrainProfileId: 'sheltered-folds' }).success, true);
    assert.equal(CoordinatorReplayV10Schema.safeParse({ ...replay, protocolVersion: 10 }).success, false);
    assert.equal(CoordinatorReplayV10Schema.safeParse({ ...replay, rulesetId: V9_RULESET_ID }).success, false);
    assert.equal(CoordinatorReplayV10Schema.safeParse({ ...replay, recipeRevision: undefined }).success, false);

    const neutralRecord = { index: 0, operation: { kind: 'intent', actor: 'player',
        intent: { type: 'jump', direction: 0 }, expectedTurn: 0, expectedPhase: 'action', expectedEpoch: 0 },
    stateHash: hashSimulationStateV10(state) };
    assert.equal(CoordinatorReplayV10Schema.safeParse({ ...replay, records: [neutralRecord] }).success, false,
        'pre-R6 replay identities cannot acquire the neutral jump');
    const r6 = createSimulationV10(2, 'wizard', V10_R6_RULESET_ID);
    assert.equal(CoordinatorReplayV10Schema.safeParse({
        ...replay, rulesetId: V10_R6_RULESET_ID, terrainProfileId: r6.terrainProfileId,
        recipeRevision: r6.terrainRecipeRevision, candidateIndex: r6.terrainCandidateIndex,
        initialStateHash: hashSimulationStateV10(r6),
        records: [{ ...neutralRecord, stateHash: hashSimulationStateV10(r6) }]
    }).success, true);
});

test('V10E replay schema binds its revised ruleset and tactical profile', () => {
    const state = createSimulationV10(1, 'wizard', V10_R1_RULESET_ID);
    const replay = {
        formatVersion: 10,
        challengeId: 'challenge_protocol_v10e',
        sessionId: 'session_protocol_v10e',
        seed: state.seed,
        calling: 'wizard',
        rulesetId: state.rulesetId,
        terrainProfileId: state.terrainProfileId,
        initialStateHash: hashSimulationStateV10(state),
        records: []
    };
    assert.equal(CoordinatorReplayV10Schema.safeParse(replay).success, true);
    assert.equal(CoordinatorReplayV10Schema.safeParse({ ...replay, rulesetId: V10_RULESET_ID }).success, false);
    assert.notEqual(state.rulesetId, V10_RULESET_ID);
    assert.equal(state.terrainProfileId, 'broken-loom');
});

test('V10F replay schema requires the selected recipe revision and candidate index', () => {
    const state = createSimulationV10(4, 'wizard', V10_R2_RULESET_ID);
    const replay = {
        formatVersion: 10,
        challengeId: 'challenge_protocol_v10f',
        sessionId: 'session_protocol_v10f',
        seed: state.seed,
        calling: 'wizard',
        rulesetId: state.rulesetId,
        terrainProfileId: state.terrainProfileId,
        recipeRevision: state.terrainRecipeRevision,
        candidateIndex: state.terrainCandidateIndex,
        initialStateHash: hashSimulationStateV10(state),
        records: []
    };
    assert.equal(replay.recipeRevision, V10_PROCEDURAL_RECIPE_REVISION);
    assert.equal(CoordinatorReplayV10Schema.safeParse(replay).success, true);
    assert.equal(CoordinatorReplayV10Schema.safeParse({ ...replay, recipeRevision: undefined }).success, false);
    assert.equal(CoordinatorReplayV10Schema.safeParse({ ...replay, candidateIndex: undefined }).success, false);
    assert.equal(CoordinatorReplayV10Schema.safeParse({ ...replay, candidateIndex: 8 }).success, false);
    assert.equal(CoordinatorReplayV10Schema.safeParse({ ...replay, terrainProfileId: 'broken-loom' }).success, false);
    assert.equal(CoordinatorReplayV10Schema.safeParse({ ...replay, rulesetId: V10_RULESET_ID }).success, false);
});
