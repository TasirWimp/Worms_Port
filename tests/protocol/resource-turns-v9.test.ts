import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CoordinatorReplayV9Schema, SimulationBarrierV9Schema, SimulationIntentV9Schema,
    SimulationSnapshotV9Schema, V9_REPLAY_LIMITS
} from '../../shared/protocol-v9';
import { SimulationCoordinatorV9 } from '../../server/src/simulation/coordinator-v9';
import { SessionRegistry } from '../../server/src/session/registry';
import { VersionedSimulationCoordinator } from '../../server/src/simulation/versioned-coordinator';
import { CURRENT_COMBAT_RULESET_ID } from '../../shared/combat-version';
import { V9_LOOMKEEPER_POLICY_ID, V9_LOOMKEEPER_PROFILE_ID, V9_RULESET_ID } from '../../shared/simulation-v9';

test('V9 replay envelopes are strict and reconstruction is deterministic', () => {
    const coordinator = new SimulationCoordinatorV9({ nowUs: () => 0 });
    try {
        const created = coordinator.create('v9_protocol_challenge', 'v9_protocol_session', 1, 'wizard');
        assert.equal(created.state.rulesetId, V9_RULESET_ID);
        const aimed = coordinator.apply('v9_protocol_challenge', 'player',
            { type: 'aim', angleMilliDegrees: 0, powerPermille: 0 }, 0, 'action', 0);
        assert.equal(aimed.transition.accepted, true);
        const replay = coordinator.replay('v9_protocol_challenge')!;
        assert.equal(CoordinatorReplayV9Schema.safeParse(replay).success, true);
        assert.equal(coordinator.reconstructAndVerify(replay).stateHash, aimed.stateHash);
        assert.equal(CoordinatorReplayV9Schema.safeParse({ ...replay, automationId: 'forged' }).success, false);
        assert.equal(CoordinatorReplayV9Schema.safeParse({ ...replay, loomkeeperPolicyId: 'nimble-knots-loomkeeper-v3' }).success, false);
        assert.equal(CoordinatorReplayV9Schema.safeParse({ ...replay, records: [{
            index: 0, operation: { kind: 'ticks', count: 1.5 }, stateHash: '0'.repeat(64)
        }] }).success, false);
    } finally { coordinator.dispose(); }
});

test('coordinator pause neutralizes an accepted airborne Threadleap and replays it', () => {
    const coordinator = new SimulationCoordinatorV9({ nowUs: () => 0 });
    try {
        const created = coordinator.create('v9_pause_leap_challenge', 'v9_pause_leap_session', 1, 'wizard');
        assert.deepEqual(created.state.units.map(unit => [unit.thread, unit.lastCreditedTurn]), [[3, 0], [0, -1]]);
        const leap = coordinator.apply(created.challengeId, 'player', { type: 'threadleap', direction: 1 }, 0, 'action', 0);
        assert.equal(leap.transition.accepted, true);
        assert.equal(leap.state.units[0].vxFp, 512);
        const paused = coordinator.barrier(created.challengeId, { reason: 'pause', actor: 'player', expectedTurn: 0, expectedEpoch: leap.state.inputEpoch });
        assert.equal(paused.transition.accepted, true);
        assert.equal(paused.paused, true);
        assert.equal(paused.state.units[0].vxFp, 0);
        const resumed = coordinator.barrier(created.challengeId, { reason: 'resume', actor: 'player', expectedTurn: 0, expectedEpoch: paused.state.inputEpoch });
        assert.equal(resumed.transition.accepted, true);
        assert.equal(resumed.paused, false);
        const landed = coordinator.advance(created.challengeId, 120);
        assert.equal(landed.state.units[0].grounded, true);
        const replay = coordinator.replay(created.challengeId)!;
        assert.deepEqual(replay.records.map(record => record.operation.kind), ['intent', 'barrier', 'barrier', 'ticks']);
        assert.deepEqual(replay.records.map(record => record.operation.kind === 'intent' ? record.operation.intent.type : record.operation.kind === 'barrier' ? record.operation.barrier.reason : record.operation.kind),
            ['threadleap', 'pause', 'resume', 'ticks']);
        assert.equal(coordinator.reconstructAndVerify(replay).stateHash, landed.stateHash);
    } finally { coordinator.dispose(); }
});

test('ordinary V9 pauses remain grounded-only', () => {
    const coordinator = new SimulationCoordinatorV9({ nowUs: () => 0 });
    try {
        const airborne = coordinator.create('v9_ordinary_pause_challenge', 'v9_ordinary_pause_session', 1, 'wizard');
        const jumped = coordinator.apply(airborne.challengeId, 'player', { type: 'jump', direction: 1 }, 0, 'action', 0);
        assert.equal(jumped.transition.accepted, true);
        const rejected = coordinator.barrier(airborne.challengeId, { reason: 'pause', actor: 'player', expectedTurn: 0, expectedEpoch: jumped.state.inputEpoch });
        assert.equal(rejected.transition.accepted, false);
        const grounded = coordinator.create('v9_ground_pause_challenge', 'v9_ground_pause_session', 1, 'wizard');
        const paused = coordinator.barrier(grounded.challengeId, { reason: 'pause', actor: 'player', expectedTurn: 0, expectedEpoch: 0 });
        assert.equal(paused.transition.accepted, true);
        assert.equal(coordinator.barrier(grounded.challengeId, { reason: 'resume', actor: 'player', expectedTurn: 0, expectedEpoch: paused.state.inputEpoch }).transition.accepted, true);
    } finally { coordinator.dispose(); }
});

test('V9 interrupted-Threadleap resume terminalizes at the lifecycle barrier boundary', () => {
    const coordinator = new SimulationCoordinatorV9({ nowUs: () => 0 });
    try {
        const created = coordinator.create('v9_resume_limit_challenge', 'v9_resume_limit_session', 1, 'wizard');
        let state = created.state;
        for (let count = 0; count < 127; count += 1) {
            const update = coordinator.barrier(created.challengeId, { reason: 'reconnect', actor: 'player', expectedTurn: state.turn, expectedEpoch: state.inputEpoch });
            assert.equal(update.transition.accepted, true); state = update.state;
        }
        const leap = coordinator.apply(created.challengeId, 'player', { type: 'threadleap', direction: 1 }, state.turn, state.phase, state.inputEpoch);
        const paused = coordinator.barrier(created.challengeId, { reason: 'pause', actor: 'player', expectedTurn: leap.state.turn, expectedEpoch: leap.state.inputEpoch });
        assert.equal(paused.state.lifecycleBarrierCount, 128);
        const exhausted = coordinator.barrier(created.challengeId, { reason: 'resume', actor: 'player', expectedTurn: paused.state.turn, expectedEpoch: paused.state.inputEpoch });
        assert.equal(exhausted.state.phase, 'finished'); assert.equal(exhausted.state.finishReason, 'simulation_limit'); assert.equal(exhausted.paused, false);
        assert.equal(coordinator.reconstructAndVerify(coordinator.replay(created.challengeId)!).stateHash, exhausted.stateHash);
    } finally { coordinator.dispose(); }
});

test('V9 coordinator keeps Fire costs atomic and utilities consume the shared fresh-aim slot', () => {
    const coordinator = new SimulationCoordinatorV9({ nowUs: () => 0 });
    try {
        const unaffordable = coordinator.create('v9_unaffordable_challenge', 'v9_unaffordable_session', 1, 'wizard');
        coordinator.apply(unaffordable.challengeId, 'player', { type: 'select_relic', relicId: 'spoolburst' }, 0, 'action', 0);
        coordinator.apply(unaffordable.challengeId, 'player', { type: 'aim', angleMilliDegrees: 0, powerPermille: 0 }, 0, 'action', 0);
        const beforeFire = coordinator.get(unaffordable.challengeId)!;
        const rejectedFire = coordinator.apply(unaffordable.challengeId, 'player', { type: 'fire', aimId: 1 }, 0, 'action', 0);
        assert.equal(rejectedFire.transition.accepted, false);
        assert.equal(rejectedFire.stateHash, beforeFire.stateHash);
        assert.equal(rejectedFire.state.units[0].thread, 3);
        const stale = coordinator.apply(unaffordable.challengeId, 'player', { type: 'aim', angleMilliDegrees: 0, powerPermille: 0 }, 0, 'action', 1);
        assert.equal(stale.transition.accepted, false);
        assert.equal(stale.stateHash, beforeFire.stateHash);

        const fired = coordinator.create('v9_duplicate_fire_challenge', 'v9_duplicate_fire_session', 1, 'wizard');
        coordinator.apply(fired.challengeId, 'player', { type: 'aim', angleMilliDegrees: 0, powerPermille: 0 }, 0, 'action', 0);
        const firstFire = coordinator.apply(fired.challengeId, 'player', { type: 'fire', aimId: 1 }, 0, 'action', 0);
        assert.equal(firstFire.transition.accepted, true);
        assert.equal(firstFire.state.units[0].thread, 1);
        const duplicate = coordinator.apply(fired.challengeId, 'player', { type: 'fire', aimId: 1 }, 0, 'action', 0);
        assert.equal(duplicate.transition.accepted, false);
        assert.equal(duplicate.stateHash, firstFire.stateHash);

        const utility = coordinator.create('v9_utility_slot_challenge', 'v9_utility_slot_session', 1, 'wizard');
        coordinator.apply(utility.challengeId, 'player', { type: 'aim', angleMilliDegrees: 0, powerPermille: 0 }, 0, 'action', 0);
        const guarded = coordinator.apply(utility.challengeId, 'player', { type: 'threadguard' }, 0, 'action', 0);
        assert.equal(guarded.transition.accepted, true);
        assert.equal(guarded.state.utilityUsed, true);
        assert.equal(guarded.state.aim, null);
        assert.equal(guarded.state.units[0].thread, 1);
        const secondUtility = coordinator.apply(utility.challengeId, 'player', { type: 'threadleap', direction: 1 }, 0, 'action', guarded.state.inputEpoch);
        const staleAimFire = coordinator.apply(utility.challengeId, 'player', { type: 'fire', aimId: 1 }, 0, 'action', guarded.state.inputEpoch);
        assert.equal(secondUtility.transition.accepted, false);
        assert.equal(staleAimFire.transition.accepted, false);
        assert.equal(staleAimFire.stateHash, guarded.stateHash);
    } finally { coordinator.dispose(); }
});

test('V9 protocol schemas reject unknown, fractional, and mixed-version inputs', () => {
    const coordinator = new SimulationCoordinatorV9({ nowUs: () => 0 });
    try {
        const created = coordinator.create('v9_schema_challenge', 'v9_schema_session', 1, 'wizard');
        assert.equal(SimulationSnapshotV9Schema.safeParse({ ...created.state, unknown: true }).success, false);
        assert.equal(SimulationSnapshotV9Schema.safeParse({ ...created.state, units: [{ ...created.state.units[0], thread: 1.5 }, created.state.units[1]] }).success, false);
        assert.equal(SimulationIntentV9Schema.safeParse({ type: 'threadleap', direction: 0 }).success, false);
        assert.equal(SimulationBarrierV9Schema.safeParse({ reason: 'pause', actor: 'player', expectedTurn: 0, expectedEpoch: 0, unknown: true }).success, false);
        const replay = coordinator.replay(created.challengeId)!;
        assert.equal(CoordinatorReplayV9Schema.safeParse({ ...replay, formatVersion: 8 }).success, false);
        assert.equal(CoordinatorReplayV9Schema.safeParse({ ...replay, rulesetId: 'nimble-knots-artillery-v8' }).success, false);
    } finally { coordinator.dispose(); }
});

test('V9 authoritative intent-limit barrier operation history reconstructs exactly', () => {
    const coordinator = new SimulationCoordinatorV9({ nowUs: () => 0 });
    try {
        const created = coordinator.create('v9_history_challenge', 'v9_history_session', 1, 'wizard');
        for (let index = 0; index < 512; index += 1) {
            const intent = { type: 'walk_start' as const, direction: index % 2 ? 1 as const : -1 as const };
            const update = coordinator.apply(created.challengeId, 'player', intent, 0, 'action', 0);
            assert.equal(update.transition.accepted, true);
        }
        const limited = coordinator.apply(created.challengeId, 'player', { type: 'walk_start', direction: 1 }, 0, 'action', 0);
        assert.equal(limited.transition.accepted, false);
        assert.equal(limited.transition.error?.code, 'INTENT_LIMIT');
        assert.equal(limited.state.acceptedIntentCount, 512);
        assert.equal(limited.state.inputEpoch, 1);
        const replay = coordinator.replay(created.challengeId)!;
        assert.deepEqual(replay.records.at(-1)?.operation, {
            kind: 'barrier', barrier: { reason: 'intent_limit', actor: 'player', expectedTurn: 0, expectedEpoch: 0 }
        });
        assert.equal(coordinator.reconstructAndVerify(replay).stateHash, limited.stateHash);
    } finally { coordinator.dispose(); }
});

test('V9 byte cap reserves a reconstructable terminal safety record', () => {
    const coordinator = new SimulationCoordinatorV9({ nowUs: () => 0, maxReplayBytes: 1024 });
    try {
        const created = coordinator.create('v9_reserve_challenge', 'v9_reserve_session', 1, 'wizard');
        const update = coordinator.apply(created.challengeId, 'player', { type: 'face', direction: -1 }, 0, 'action', 0);
        assert.equal(update.state.phase, 'finished');
        const replay = coordinator.replay(created.challengeId)!;
        assert.equal(replay.records.at(-1)?.operation.kind, 'safety');
        assert.equal((replay.records.at(-1)?.operation as { reason?: string }).reason, 'replay_limit');
        assert.equal(coordinator.reconstructAndVerify(replay).stateHash, update.stateHash);
        assert.throws(() => coordinator.reconstructAndVerify({ ...replay, padding: 'x'.repeat(1024) }));
    } finally { coordinator.dispose(); }
});

test('V9 replay verifier fails closed on corruption and all replay caps', () => {
    const coordinator = new SimulationCoordinatorV9({ nowUs: () => 0 });
    try {
        coordinator.create('v9_cap_challenge', 'v9_cap_session_01', 1, 'wizard');
        coordinator.apply('v9_cap_challenge', 'player', { type: 'face', direction: 1 }, 0, 'action', 0);
        const replay = coordinator.replay('v9_cap_challenge')!;
        assert.throws(() => coordinator.reconstructAndVerify({ ...replay, records: replay.records.map((record, index) =>
            index === 0 ? { ...record, stateHash: '0'.repeat(64) } : record
        ) }));
        assert.throws(() => coordinator.reconstructAndVerify({ ...replay, records: Array(V9_REPLAY_LIMITS.records + 1).fill(replay.records[0]) }));
        assert.throws(() => coordinator.reconstructAndVerify({ ...replay, records: [{
            index: 0, operation: { kind: 'ticks', count: V9_REPLAY_LIMITS.ticks + 1 }, stateHash: '0'.repeat(64)
        }] }));
        assert.throws(() => coordinator.reconstructAndVerify({ ...replay, formatVersion: 8 }));
        assert.throws(() => coordinator.reconstructAndVerify({ ...replay, automationId: 'forged' }));
        assert.throws(() => coordinator.reconstructAndVerify({ ...replay, records: [{
            ...replay.records[0], operation: { kind: 'ticks', count: 1, padding: 'x'.repeat(V9_REPLAY_LIMITS.operationBytes) }
        }] }));
        assert.throws(() => coordinator.reconstructAndVerify({ ...replay, loomkeeperPolicyId: V9_LOOMKEEPER_POLICY_ID,
            loomkeeperProfileId: V9_LOOMKEEPER_PROFILE_ID, records: [{ ...replay.records[0], index: 1 }] }));
    } finally { coordinator.dispose(); }
});

test('injected V9 Practice and reward callers receive the same authoritative core', () => {
    const registry = new SessionRegistry({ simulationTickIntervalMs: false, v9TestOnly: { nowUs: () => 0 } });
    try {
        registry.create('v9_test_socket');
        const session = registry.getBound('v9_test_socket')!;
        const practice = registry.createV9TestChallenge(session, 'practice', 'wizard', 42, 'v9_practice_challenge');
        const reward = registry.createV9TestChallenge(session, 'reward', 'wizard', 42, 'v9_reward_challenge__');
        assert.equal(practice.stateHash, reward.stateHash);
        const updated = registry.applyV9Test(practice.challengeId, 'player', { type: 'face', direction: -1 }, 0, 'action', 0);
        assert.equal(updated.transition.accepted, true);
        assert.equal(registry.replayV9Test(practice.challengeId)!.rulesetId, V9_RULESET_ID);
        assert.equal(registry.snapshotV9Test(reward.challengeId)!.state.rulesetId, V9_RULESET_ID);
    } finally { registry.dispose(); }
});

test('injected V9 Practice and reward creation parity covers every frozen seed and Calling', () => {
    const registry = new SessionRegistry({ simulationTickIntervalMs: false, v9TestOnly: { nowUs: () => 0 } });
    const seeds = [1, 2, 3, 4, 17, 42, 1337, 65535, 2147483648, 4294967295];
    const callings = ['wizard', 'thief', 'warrior'] as const;
    try {
        registry.create('v9_matrix_socket');
        const session = registry.getBound('v9_matrix_socket')!;
        for (const seed of seeds) for (const calling of callings) {
            const suffix = `${seed}_${calling}`;
            const practice = registry.createV9TestChallenge(session, 'practice', calling, seed, `v9_practice_${suffix}`);
            const reward = registry.createV9TestChallenge(session, 'reward', calling, seed, `v9_reward_${suffix}`);
            assert.equal(practice.stateHash, reward.stateHash, suffix);
            assert.deepEqual(practice.state.units.map(unit => [unit.thread, unit.lastCreditedTurn]), [[3, 0], [0, -1]], suffix);
            for (const challengeId of [practice.challengeId, reward.challengeId]) {
                let snapshot = registry.snapshotV9Test(challengeId)!;
                snapshot = registry.applyV9Test(challengeId, 'player', { type: 'face', direction: -1 }, snapshot.state.turn, snapshot.state.phase, snapshot.state.inputEpoch);
                snapshot = registry.applyV9Test(challengeId, 'player', { type: 'aim', angleMilliDegrees: 0, powerPermille: 0 }, snapshot.state.turn, snapshot.state.phase, snapshot.state.inputEpoch);
                snapshot = registry.applyV9Test(challengeId, 'player', { type: 'fire', aimId: snapshot.state.aimId }, snapshot.state.turn, snapshot.state.phase, snapshot.state.inputEpoch);
                registry.advanceV9Test(challengeId, 3);
            }
            assert.equal(registry.snapshotV9Test(practice.challengeId)!.stateHash, registry.snapshotV9Test(reward.challengeId)!.stateHash, `${suffix} history`);
            assert.deepEqual(registry.replayV9Test(practice.challengeId)!.records.map(record => record.operation), registry.replayV9Test(reward.challengeId)!.records.map(record => record.operation), `${suffix} history`);
        }
    } finally { registry.dispose(); }
});

test('V9 dispatch is exact while the public selector remains V7 and rejects normal creation', () => {
    assert.equal(CURRENT_COMBAT_RULESET_ID, 'nimble-knots-artillery-v7');
    const versions = new VersionedSimulationCoordinator({ v9: { nowUs: () => 0 } });
    const registry = new SessionRegistry({ simulationRulesetId: V9_RULESET_ID, v9TestOnly: { nowUs: () => 0 } });
    try {
        const created = versions.create('v9_dispatch_challenge', 'v9_dispatch_session', 1, 'wizard', V9_RULESET_ID);
        assert.equal(versions.reconstructAndVerify(versions.replay(created.challengeId)!).stateHash, created.stateHash);
        registry.create('v9_selector_socket');
        const rejected = registry.createSelectedChallenge(registry.getBound('v9_selector_socket')!, 'practice', 'wizard');
        assert.equal('code' in rejected && rejected.code, 'FEATURE_UNAVAILABLE');
    } finally { versions.dispose(); registry.dispose(); }
});
