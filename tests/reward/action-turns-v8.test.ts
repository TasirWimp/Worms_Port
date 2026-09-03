import assert from 'node:assert/strict';
import test from 'node:test';

import { V8_AUTOMATION_ID, V8_LOOMKEEPER_POLICY_ID, V8_LOOMKEEPER_PROFILE_ID } from '../../shared/combat-version';
import { V8_R1_RULESET_ID } from '../../shared/simulation-v8';
import { MemoryRewardStore } from '../../server/src/reward/memory-store';
import { RewardService } from '../../server/src/reward/service';
import { RewardStoreError, type RewardConfig } from '../../server/src/reward/types';
import { VersionedSimulationCoordinator } from '../../server/src/simulation/versioned-coordinator';
import { LoomkeeperExecutionV8, LoomkeeperPlannerV8 } from '../../shared/loomkeeper-v8';

const identity = { address: 'NQ46 KLJE 5TMF 4Y1A 1255 CJHJ YG1S H0NU T604',
    authorizedAt: '2026-09-03T12:00:00.000Z' };

test('automated r1 non-win settles only after exact replay reconstruction', async () => {
    const { service, store, challengeId } = await startedService();
    const coordinator = new VersionedSimulationCoordinator();
    coordinator.createAutomated(challengeId, 'automated_reward_session', 1, 'wizard');
    coordinator.v8.safety(challengeId, 'left');
    const terminal = coordinator.get(challengeId)!;
    const update = await service.completeMatch(result(challengeId, terminal.state.tick,
        terminal.stateHash, 'left'), coordinator.replay(challengeId));
    assert.equal(update?.state, 'forfeited');
    assert.equal((await store.status(update!.entitlementId, identity.address))?.replay?.challengeId, challengeId);
});

test('reserved foundation labels and stripped automation cannot prove a reward', async () => {
    const { service, store, challengeId, reservationId } = await startedService();
    const coordinator = new VersionedSimulationCoordinator();
    coordinator.create(challengeId, 'automated_reward_session', 1, 'wizard', V8_R1_RULESET_ID);
    coordinator.v8.safety(challengeId, 'left');
    const terminal = coordinator.get(challengeId)!;
    await assert.rejects(service.completeMatch(result(challengeId, terminal.state.tick,
        terminal.stateHash, 'left'), coordinator.replay(challengeId) as any),
    (error: unknown) => error instanceof RewardStoreError && error.code === 'unavailable');
    assert.equal((await store.status(reservationId, identity.address))?.state, 'in_progress');
});

test('automated evidence rejects stripped, cross-version, foreign and oversized operation envelopes', async () => {
    const { service, store, challengeId, reservationId } = await startedService();
    const coordinator = new VersionedSimulationCoordinator();
    coordinator.createAutomated(challengeId, 'automated_reward_session', 1, 'wizard');
    coordinator.v8.safety(challengeId, 'left');
    const terminal = coordinator.get(challengeId)!;
    const validResult = result(challengeId, terminal.state.tick, terminal.stateHash, 'left');
    const validReplay = coordinator.replay(challengeId) as any;
    const strippedResult = { ...validResult } as any; delete strippedResult.automationId;
    const strippedReplay = { ...validReplay }; delete strippedReplay.automationId; delete strippedReplay.chosenPlans;
    const oversized = structuredClone(validReplay); oversized.records[0].padding = 'x'.repeat(2048);
    for (const [candidateResult, candidateReplay] of [
        [strippedResult, validReplay], [validResult, strippedReplay], [strippedResult, strippedReplay],
        [{ ...validResult, protocolVersion: 1 }, validReplay],
        [{ ...validResult, sessionId: 'foreign_reward_session' }, validReplay],
        [validResult, { ...validReplay, rulesetId: 'nimble-knots-artillery-v8' }],
        [validResult, { ...validReplay, loomkeeperProfileId: 'other-profile' }],
        [validResult, oversized]
    ]) await assert.rejects(service.completeMatch(candidateResult as any, candidateReplay),
        (error: unknown) => error instanceof RewardStoreError && error.code === 'unavailable');
    assert.equal((await store.status(reservationId, identity.address))?.state, 'in_progress');
    coordinator.dispose();
});

test('a genuine automated r1 player win reconstructs and recovers one record-only claim', { timeout: 120_000 }, async () => {
    const { service, store, challengeId } = await startedService();
    const coordinator = new VersionedSimulationCoordinator();
    coordinator.createAutomated(challengeId, 'automated_reward_session', 1, 'wizard');
    try {
        let plannedTurn = -1;
        let execution: LoomkeeperExecutionV8 | undefined;
        while (coordinator.v8.get(challengeId)!.state.phase !== 'finished') {
            let state = coordinator.v8.get(challengeId)!.state;
            if (state.activeActor === 'player' && state.phase === 'action' && state.turn !== plannedTurn) {
                plannedTurn = state.turn;
                const planner = new LoomkeeperPlannerV8(state);
                for (let tick = 0; tick < 30; tick++) planner.step();
                coordinator.v8.advance(challengeId, 30);
                state = coordinator.v8.get(challengeId)!.state;
                const selected = planner.selectedCandidate();
                execution = selected ? new LoomkeeperExecutionV8(selected, state) : undefined;
            }
            if (state.activeActor === 'player' && execution) for (let count = 0; count < 8; count++) {
                state = coordinator.v8.get(challengeId)!.state;
                const operation = execution.next(state); if (!operation) break;
                const update = operation.kind === 'intent'
                    ? coordinator.v8.apply(challengeId, 'player', operation.intent, state.turn, state.phase, state.inputEpoch)
                    : coordinator.v8.barrier(challengeId, operation.barrier);
                assert.equal(update.transition.accepted, true);
            }
            coordinator.v8.advance(challengeId, 1);
            assert.ok(coordinator.v8.get(challengeId)!.state.tick <= 16800);
        }
        const terminal = coordinator.v8.get(challengeId)!;
        assert.equal(terminal.state.winner, 'player');
        const proof = coordinator.replay(challengeId) as any;
        const win = result(challengeId, terminal.state.tick, terminal.stateHash, 'player_win');
        assert.ok(proof.chosenPlans.length > 0);
        const changedPlan = structuredClone(proof);
        changedPlan.chosenPlans[0].ordinal = (changedPlan.chosenPlans[0].ordinal + 1) % 180;
        const changedOperation = structuredClone(proof);
        const aiRecord = changedOperation.records.find((record: any) => record.operation.kind === 'intent' && record.operation.actor === 'loomkeeper');
        assert.ok(aiRecord); aiRecord.stateHash = '0'.repeat(64);
        for (const changed of [changedPlan, changedOperation]) await assert.rejects(service.completeMatch(win, changed),
            (error: unknown) => error instanceof RewardStoreError && error.code === 'unavailable');
        const update = await service.completeMatch(win, proof);
        assert.equal(update?.state, 'claimable');
        assert.ok(update?.claimNonce);
        assert.equal((await service.completeMatch(win, proof))?.entitlementId, update!.entitlementId);
        const recovered = new RewardService(config(), store, { now: () => new Date('2026-09-03T12:00:00.000Z'),
            tokenSource: () => 'u'.repeat(43) });
        const status = await recovered.status(identity, update!.entitlementId);
        assert.equal(status.state, 'claimable');
        const queued = await recovered.claim(identity, status.entitlementId, status.claimNonce!, 'automated_claim_idempotency');
        assert.equal(queued.state, 'queued');
        assert.equal((await recovered.claim(identity, status.entitlementId, status.claimNonce!, 'automated_claim_idempotency')).state, 'queued');
        assert.equal((await store.status(status.entitlementId, identity.address))?.replay &&
            'automationId' in (await store.status(status.entitlementId, identity.address))!.replay!, true);
    } finally { coordinator.dispose(); }
});

function result(challengeId: string, finalTick: number, finalStateHash: string,
    outcome: 'left' | 'expired' | 'player_win' | 'loomkeeper_win' | 'draw') {
    return { protocolVersion: 8 as const, serverTimeMs: Date.now(), sessionId: 'automated_reward_session',
        challengeId, rulesetId: V8_R1_RULESET_ID, automationId: V8_AUTOMATION_ID,
        loomkeeperPolicyId: V8_LOOMKEEPER_POLICY_ID, loomkeeperProfileId: V8_LOOMKEEPER_PROFILE_ID,
        nextInputSequence: 0, outcome, finalTick, finalStateHash };
}

async function startedService() {
    const store = new MemoryRewardStore();
    const ids = ['automated_reward_challenge', 'automated_reward_entitlement'];
    const service = new RewardService(config(), store, { now: () => new Date('2026-09-03T12:00:00.000Z'),
        idSource: () => ids.shift()!, tokenSource: () => 't'.repeat(43), seedSource: () => 1 });
    const reserved = await service.reserve(identity, 'wizard');
    await service.start(identity, reserved.challengeId, reserved.eligibilityToken);
    return { service, store, challengeId: reserved.challengeId, reservationId: reserved.reservationId };
}

function config(): RewardConfig {
    return { mode: 'record-only', rewardLuna: 100000n, feeLuna: 0n, dailyBudgetLuna: 400000n,
        paused: false, reservationTtlMs: 60_000, claimTtlMs: 60_000, turnLimit: 16,
        network: 'test-albatross', testDailyAttemptLimit: 1 };
}
