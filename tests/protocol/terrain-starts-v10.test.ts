import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CoordinatorReplayV10Schema, ReplayOperationV10Schema, SimulationSnapshotV10Schema
} from '../../shared/protocol-v10';
import { V9_RULESET_ID } from '../../shared/simulation-v9';
import { V10_RULESET_ID, createSimulationV10, hashSimulationStateV10 } from '../../shared/simulation-v10';

test('V10 protocol accepts only the exact state and operation identities', () => {
    const state = createSimulationV10(2, 'wizard');
    assert.equal(SimulationSnapshotV10Schema.safeParse(state).success, true);
    assert.equal(SimulationSnapshotV10Schema.safeParse({ ...state, formatVersion: 9 }).success, false);
    assert.equal(SimulationSnapshotV10Schema.safeParse({ ...state, rulesetId: V9_RULESET_ID }).success, false);
    assert.equal(SimulationSnapshotV10Schema.safeParse({ ...state, extra: true }).success, false);
    assert.equal(ReplayOperationV10Schema.safeParse({
        kind: 'intent', actor: 'player', intent: { type: 'threadguard' },
        expectedTurn: 0, expectedPhase: 'action', expectedEpoch: 0
    }).success, true);
    assert.equal(ReplayOperationV10Schema.safeParse({
        kind: 'intent', actor: 'player', intent: { type: 'threadguard', extra: true },
        expectedTurn: 0, expectedPhase: 'action', expectedEpoch: 0
    }).success, false);
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
});
