import assert from 'node:assert/strict';
import test from 'node:test';

import { V7_RULESET_ID } from '../../shared/simulation';
import { CoordinatorReplayV10Schema } from '../../shared/protocol-v10';
import { V9_RULESET_ID } from '../../shared/simulation-v9';
import {
    V10_R1_RULESET_ID, V10_R2_RULESET_ID, V10_RULESET_ID, hashSimulationStateV10
} from '../../shared/simulation-v10';
import { V10_PROCEDURAL_RECIPE_REVISION } from '../../shared/terrain-generation-v10';
import { SimulationCoordinatorV10 } from '../../server/src/simulation/coordinator-v10';
import { VersionedSimulationCoordinator } from '../../server/src/simulation/versioned-coordinator';

test('V10 coordinator reconstructs the exact profile-bound operation stream', () => {
    const coordinator = new SimulationCoordinatorV10();
    try {
        const created = coordinator.create('challenge_v10_replay', 'session_v10_replay', 3, 'wizard');
        coordinator.apply('challenge_v10_replay', 'player', { type: 'face', direction: -1 }, 0, 'action', 0);
        coordinator.apply('challenge_v10_replay', 'player', {
            type: 'aim', angleMilliDegrees: 45_000, powerPermille: 700
        }, 0, 'action', 0);
        coordinator.apply('challenge_v10_replay', 'player', { type: 'fire', aimId: 1 }, 0, 'action', 0);
        coordinator.advance('challenge_v10_replay', 120);

        const replay = coordinator.replay('challenge_v10_replay')!;
        const live = coordinator.get('challenge_v10_replay')!;
        const restored = coordinator.reconstructAndVerify(replay, {
            challengeId: 'challenge_v10_replay', sessionId: 'session_v10_replay'
        });
        assert.equal(replay.rulesetId, V10_RULESET_ID);
        assert.equal(replay.terrainProfileId, 'sheltered-folds');
        assert.equal(replay.initialStateHash, created.stateHash);
        assert.equal(restored.stateHash, live.stateHash);
        assert.deepEqual(restored.state, live.state);
        assert.equal(restored.stateHash, hashSimulationStateV10(restored.state));
    } finally {
        coordinator.dispose();
    }
});

test('V10 replay records automatic phase boundaries and regenerates them', () => {
    const coordinator = new SimulationCoordinatorV10();
    try {
        coordinator.create('challenge_v10_boundary', 'session_v10_boundary', 1, 'thief');
        coordinator.advance('challenge_v10_boundary', 451);
        const replay = coordinator.replay('challenge_v10_boundary')!;
        assert.ok(replay.records.some(record => record.operation.kind === 'automatic'));
        const restored = coordinator.reconstructAndVerify(replay);
        assert.equal(restored.stateHash, coordinator.get('challenge_v10_boundary')!.stateHash);
    } finally {
        coordinator.dispose();
    }
});

test('V10E coordinator reconstructs revised terrain without changing original V10 replay dispatch', () => {
    const coordinator = new SimulationCoordinatorV10();
    try {
        const original = coordinator.create('challenge_v10_original', 'session_v10_original', 1, 'wizard');
        const revised = coordinator.create(
            'challenge_v10e_replay', 'session_v10e_replay', 1, 'wizard', V10_R1_RULESET_ID
        );
        coordinator.apply('challenge_v10e_replay', 'player', { type: 'jump', direction: 1 }, 0, 'action', 0);
        coordinator.advance('challenge_v10e_replay', 63);
        const replay = coordinator.replay('challenge_v10e_replay')!;
        const restored = coordinator.reconstructAndVerify(replay);
        assert.equal(original.state.rulesetId, V10_RULESET_ID);
        assert.equal(revised.state.rulesetId, V10_R1_RULESET_ID);
        assert.equal(replay.rulesetId, V10_R1_RULESET_ID);
        assert.equal(replay.terrainProfileId, 'broken-loom');
        assert.equal(restored.stateHash, coordinator.get('challenge_v10e_replay')!.stateHash);
        assert.deepEqual(restored.state, coordinator.get('challenge_v10e_replay')!.state);
    } finally {
        coordinator.dispose();
    }
});

test('V10F coordinator reconstructs and rejects changed recipe or candidate authority', () => {
    const coordinator = new SimulationCoordinatorV10();
    try {
        const created = coordinator.create(
            'challenge_v10f_replay', 'session_v10f_replay', 4, 'wizard', V10_R2_RULESET_ID
        );
        coordinator.apply('challenge_v10f_replay', 'player', {
            type: 'aim', angleMilliDegrees: 45_000, powerPermille: 850
        }, 0, 'action', 0);
        coordinator.apply('challenge_v10f_replay', 'player', { type: 'fire', aimId: 1 }, 0, 'action', 0);
        coordinator.advance('challenge_v10f_replay', 120);
        const replay = coordinator.replay('challenge_v10f_replay')!;
        const restored = coordinator.reconstructAndVerify(replay);
        assert.equal(created.state.rulesetId, V10_R2_RULESET_ID);
        assert.equal(replay.rulesetId, V10_R2_RULESET_ID);
        assert.equal(replay.recipeRevision, V10_PROCEDURAL_RECIPE_REVISION);
        assert.equal(replay.candidateIndex, created.state.terrainCandidateIndex);
        assert.equal(restored.stateHash, coordinator.get('challenge_v10f_replay')!.stateHash);
        assert.throws(() => coordinator.reconstructAndVerify({
            ...replay, candidateIndex: ((replay.candidateIndex ?? 0) + 1) % 8
        }), /authority mismatch/);
        assert.equal(CoordinatorReplayV10Schema.safeParse({
            ...replay, recipeRevision: undefined
        }).success, false);
    } finally {
        coordinator.dispose();
    }
});

test('V10 replay schema and reconstruction reject mixed identity, terrain profile and ownership', () => {
    const coordinator = new SimulationCoordinatorV10();
    try {
        coordinator.create('challenge_v10_strict', 'session_v10_strict', 1, 'warrior');
        coordinator.apply('challenge_v10_strict', 'player', { type: 'face', direction: -1 }, 0, 'action', 0);
        const replay = coordinator.replay('challenge_v10_strict')!;

        assert.equal(CoordinatorReplayV10Schema.safeParse({ ...replay, rulesetId: V9_RULESET_ID }).success, false);
        assert.equal(CoordinatorReplayV10Schema.safeParse({ ...replay, formatVersion: 9 }).success, false);
        assert.equal(CoordinatorReplayV10Schema.safeParse({ ...replay, unknown: true }).success, false);
        assert.throws(
            () => coordinator.reconstructAndVerify({ ...replay, terrainProfileId: 'open-terraces' }),
            /terrain profile mismatch/
        );
        assert.throws(
            () => coordinator.reconstructAndVerify(replay, {
                challengeId: 'different_challenge', sessionId: replay.sessionId
            }),
            /ownership mismatch/
        );
        const badHash = structuredClone(replay);
        badHash.records[0].stateHash = '0'.repeat(64);
        assert.throws(() => coordinator.reconstructAndVerify(badHash), /divergence/);
    } finally {
        coordinator.dispose();
    }
});

test('versioned coordinator dispatches V10 while preserving historical selectors', () => {
    const versions = new VersionedSimulationCoordinator();
    try {
        const v10 = versions.create('challenge_versioned_10', 'session_versioned_10', 2, 'wizard', V10_RULESET_ID);
        const v10e = versions.create('challenge_versioned_10e', 'session_versioned_10e', 2, 'wizard', V10_R1_RULESET_ID);
        const v10f = versions.create('challenge_versioned_10f', 'session_versioned_10f', 2, 'wizard', V10_R2_RULESET_ID);
        const v9 = versions.create('challenge_versioned_09', 'session_versioned_09', 2, 'wizard', V9_RULESET_ID);
        const v7 = versions.create('challenge_versioned_07', 'session_versioned_07', 2, 'wizard', V7_RULESET_ID);
        assert.deepEqual(
            [v10.state.rulesetId, v10e.state.rulesetId, v10f.state.rulesetId, v9.state.rulesetId, v7.state.rulesetId],
            [V10_RULESET_ID, V10_R1_RULESET_ID, V10_R2_RULESET_ID, V9_RULESET_ID, V7_RULESET_ID]
        );
        const replay = versions.replay('challenge_versioned_10')!;
        assert.equal(versions.reconstructAndVerify(replay).state.rulesetId, V10_RULESET_ID);
        const revisedReplay = versions.replay('challenge_versioned_10e')!;
        assert.equal(versions.reconstructAndVerify(revisedReplay).state.rulesetId, V10_R1_RULESET_ID);
        const proceduralReplay = versions.replay('challenge_versioned_10f')!;
        assert.equal(versions.reconstructAndVerify(proceduralReplay).state.rulesetId, V10_R2_RULESET_ID);
    } finally {
        versions.dispose();
    }
});

test('V10 snapshots and replay records are detached from live authority', () => {
    const coordinator = new SimulationCoordinatorV10();
    try {
        const snapshot = coordinator.create('challenge_v10_detached', 'session_v10_detached', 2, 'wizard');
        const stateHash = snapshot.stateHash;
        snapshot.state.terrain.words[500] ^= 1;
        snapshot.state.units[0].xFp += 256;
        assert.equal(coordinator.get('challenge_v10_detached')!.stateHash, stateHash);
        coordinator.apply('challenge_v10_detached', 'player', { type: 'face', direction: -1 }, 0, 'action', 0);
        const replay = coordinator.replay('challenge_v10_detached')!;
        replay.records[0].stateHash = '0'.repeat(64);
        assert.notEqual(coordinator.replay('challenge_v10_detached')!.records[0].stateHash, replay.records[0].stateHash);
    } finally {
        coordinator.dispose();
    }
});
