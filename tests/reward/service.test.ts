import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChallengeResult } from '../../shared/protocol';
import { SIM_RULES } from '../../shared/simulation';
import { MemoryRewardStore } from '../../server/src/reward/memory-store';
import { RewardService } from '../../server/src/reward/service';
import { RewardStoreError, type RewardConfig } from '../../server/src/reward/types';
import { SimulationCoordinator } from '../../server/src/simulation/coordinator';
import { SimulationCoordinatorV9 } from '../../server/src/simulation/coordinator-v9';
import { candidateAt, LoomkeeperExecutionV9, type LoomkeeperSelectionV9 } from '../../shared/loomkeeper-v9';

test('a client-reported win without a reconstructable server replay creates no claim', async () => {
    const store = new MemoryRewardStore();
    const service = new RewardService(config(), store, {
        now: () => new Date('2026-07-29T12:00:00.000Z'),
        idSource: (() => {
            const ids = ['reward_challenge_01', 'entitlement_record_01'];
            return () => ids.shift()!;
        })(),
        tokenSource: () => 't'.repeat(43),
        seedSource: () => 7
    });
    const identity = {
        address: 'NQ46 KLJE 5TMF 4Y1A 1255 CJHJ YG1S H0NU T604',
        authorizedAt: '2026-07-29T12:00:00.000Z'
    };
    const reservation = await service.reserve(identity, 'wizard');
    await service.start(identity, reservation.challengeId, reservation.eligibilityToken);
    const forged: ChallengeResult = {
        protocolVersion: 1,
        serverTimeMs: Date.now(),
        sessionId: 'reward_session_001',
        challengeId: reservation.challengeId,
        outcome: 'player_win',
        revision: 1,
        nextSequence: 2,
        finalTick: 42,
        finalStateHash: 'a'.repeat(64)
    };
    await assert.rejects(
        service.completeMatch(forged),
        (error: unknown) => error instanceof RewardStoreError &&
            error.code === 'unavailable'
    );
    assert.equal(
        (await store.status(reservation.reservationId, identity.address))?.state,
        'in_progress'
    );
});

test('a reconstructed authoritative win becomes one wallet-bound queued claim', async () => {
    const store = new MemoryRewardStore();
    const service = serviceFor(store);
    const identity = {
        address: 'NQ46 KLJE 5TMF 4Y1A 1255 CJHJ YG1S H0NU T604',
        authorizedAt: '2026-07-29T12:00:00.000Z'
    };
    const reservation = await service.reserve(identity, 'wizard');
    await service.start(identity, reservation.challengeId, reservation.eligibilityToken);
    const coordinator = new SimulationCoordinator();
    coordinator.create(
        reservation.challengeId,
        'reward_session_001',
        1,
        'wizard'
    );
    for (let shot = 1; shot <= 5; shot += 1) {
        const playerTurn = coordinator.get(reservation.challengeId)!.state;
        assert.equal(playerTurn.activeActor, 'player');
        assert.equal(playerTurn.turn, (shot - 1) * 2);
        coordinator.apply(
            reservation.challengeId,
            'player',
            { type: 'aim', angleMilliDegrees: 35_000, powerPermille: 1_000 },
            playerTurn.turn
        );
        coordinator.apply(
            reservation.challengeId,
            'player',
            { type: 'fire' },
            playerTurn.turn
        );
        if (shot < 5) {
            coordinator.advance(reservation.challengeId, SIM_RULES.turnTicks);
        }
    }
    const terminal = coordinator.get(reservation.challengeId)!;
    assert.equal(terminal.state.phase, 'finished');
    assert.equal(terminal.state.winner, 'player');
    const update = await service.completeMatch({
        protocolVersion: 1,
        serverTimeMs: Date.now(),
        sessionId: 'reward_session_001',
        challengeId: reservation.challengeId,
        outcome: 'player_win',
        revision: terminal.state.revision,
        nextSequence: 2,
        finalTick: terminal.state.tick,
        finalStateHash: terminal.stateHash
    }, coordinator.replay(reservation.challengeId));
    assert.equal(update?.state, 'claimable');
    assert.ok(update?.claimNonce);
    assert.equal((await service.claim(
        identity,
        update!.entitlementId,
        update!.claimNonce!,
        'idempotency_key_01'
    )).state, 'queued');
    assert.equal((await service.claim(
        identity,
        update!.entitlementId,
        update!.claimNonce!,
        'idempotency_key_01'
    )).state, 'queued');
    assert.equal((await service.status(identity)).state, 'queued');
});

test('forged V9 automation evidence never changes an in-progress entitlement', async () => {
    const store = new MemoryRewardStore();
    const service = new RewardService(config(), store, {
        now: () => new Date('2026-07-29T12:00:00.000Z'),
        idSource: (() => { const ids = ['v9_forged_challenge_01', 'v9_forged_entitlement_01']; return () => ids.shift()!; })(),
        tokenSource: () => 't'.repeat(43), seedSource: () => 1
    });
    const identity = { address: 'NQ46 KLJE 5TMF 4Y1A 1255 CJHJ YG1S H0NU T604', authorizedAt: '2026-07-29T12:00:00.000Z' };
    const reservation = await service.reserve(identity, 'wizard');
    await service.start(identity, reservation.challengeId, reservation.eligibilityToken);
    const coordinator = new SimulationCoordinatorV9({ nowUs: () => 0 });
    try {
        coordinator.createAutomated(reservation.challengeId, 'v9_forged_session_01', 1, 'wizard');
        coordinator.advance(reservation.challengeId, 1);
        const replay = coordinator.replay(reservation.challengeId)!;
        const result = {
            protocolVersion: 9 as const, serverTimeMs: Date.now(), sessionId: 'v9_forged_session_01', challengeId: reservation.challengeId,
            rulesetId: replay.rulesetId, automationId: 'wp-015d3b-v9d-v1' as const,
            loomkeeperPolicyId: replay.loomkeeperPolicyId, loomkeeperProfileId: replay.loomkeeperProfileId,
            nextSequence: 1, nextInputSequence: 0, outcome: 'player_win' as const, finalTick: 0, finalStateHash: replay.initialStateHash
        };
        const forgeries: unknown[] = [
            { result: { ...result, automationId: 'stripped' }, replay },
            { result, replay: { ...replay, initialStateHash: 'f'.repeat(64) } },
            { result, replay: { ...replay, chosenPlans: [{ turn: 0, prefix: 'none', status: 'selected', ordinal: 0 }] } },
            { result, replay: { ...replay, records: replay.records.map((record, index) => index === 0
                ? { ...record, operation: { kind: 'ticks' as const, count: 2 } } : record) } },
            { result, replay: { ...replay, sessionId: 'v9_foreign_session_01' } },
            { result, replay: { ...replay, records: Array(32_769).fill(replay.records[0] ?? { index: 0, operation: { kind: 'ticks', count: 1 }, stateHash: replay.initialStateHash }) } },
            { result, replay: { ...replay, chosenPlans: [{ turn: 0, prefix: 'none', status: 'work_failure', ordinal: null }] } }
        ];
        for (const forged of forgeries) {
            const candidate = forged as { result: any; replay: any };
            await assert.rejects(service.completeMatch(candidate.result, candidate.replay),
                (error: unknown) => error instanceof RewardStoreError && error.code === 'unavailable');
            assert.equal((await store.status(reservation.reservationId, identity.address))?.state, 'in_progress');
        }
    } finally { coordinator.dispose(); }
});

test('a genuine automated V9 player win produces one recoverable record-only claim', async () => {
    const store = new MemoryRewardStore();
    const service = serviceFor(store);
    const identity = {
        address: 'NQ46 KLJE 5TMF 4Y1A 1255 CJHJ YG1S H0NU T604',
        authorizedAt: '2026-07-29T12:00:00.000Z'
    };
    const reservation = await service.reserve(identity, 'wizard');
    await service.start(identity, reservation.challengeId, reservation.eligibilityToken);
    const coordinator = new SimulationCoordinatorV9({ nowUs: () => 0 });
    try {
        coordinator.createAutomated(reservation.challengeId, 'reward_v9_session_001', 1, 'wizard');
        const selections: readonly LoomkeeperSelectionV9[] = [
            { prefix: 'none', status: 'selected', ordinal: 15 },
            { prefix: 'none', status: 'selected', ordinal: 135 },
            { prefix: 'none', status: 'selected', ordinal: 125 }
        ];
        let plannedTurn = -1;
        let execution: LoomkeeperExecutionV9 | undefined;
        while (coordinator.get(reservation.challengeId)!.state.phase !== 'finished') {
            let current = coordinator.get(reservation.challengeId)!;
            if (current.state.activeActor === 'player' && current.state.phase === 'action' && current.state.turn !== plannedTurn) {
                plannedTurn = current.state.turn;
                const selection = selections[plannedTurn / 2];
                assert.ok(selection?.status === 'selected' && selection.ordinal !== null);
                coordinator.advance(reservation.challengeId, 30);
                execution = new LoomkeeperExecutionV9(candidateAt(selection.ordinal), selection.prefix,
                    coordinator.get(reservation.challengeId)!.state);
            }
            if (coordinator.get(reservation.challengeId)!.state.activeActor === 'player' && execution) {
                for (let slot = 0; slot < 8; slot += 1) {
                    current = coordinator.get(reservation.challengeId)!;
                    const operation = execution.next(current.state);
                    if (!operation) break;
                    const update = operation.kind === 'intent'
                        ? coordinator.apply(reservation.challengeId, 'player', operation.intent,
                            current.state.turn, current.state.phase, current.state.inputEpoch)
                        : coordinator.barrier(reservation.challengeId, operation.barrier);
                    assert.equal(update.transition.accepted, true);
                }
            }
            coordinator.advance(reservation.challengeId, 1);
            assert.ok(coordinator.get(reservation.challengeId)!.state.tick <= 16_800);
        }
        const terminal = coordinator.get(reservation.challengeId)!;
        assert.equal(terminal.state.phase, 'finished');
        assert.equal(terminal.state.winner, 'player');
        const result = {
            protocolVersion: 9 as const, serverTimeMs: Date.now(), sessionId: 'reward_v9_session_001',
            challengeId: reservation.challengeId, rulesetId: terminal.state.rulesetId,
            automationId: 'wp-015d3b-v9d-v1' as const, loomkeeperPolicyId: 'nimble-knots-loomkeeper-v4' as const,
            loomkeeperProfileId: 'standard-v9-0' as const, nextSequence: 1, nextInputSequence: 0,
            outcome: 'player_win' as const, finalTick: terminal.state.tick, finalStateHash: terminal.stateHash
        };
        const update = await service.completeMatch(result, coordinator.replay(reservation.challengeId));
        assert.equal(update?.state, 'claimable');
        assert.ok(update?.claimNonce);
        const repeated = await service.completeMatch(result, coordinator.replay(reservation.challengeId));
        assert.equal(repeated?.state, 'claimable');
    } finally { coordinator.dispose(); }
});

test('the configured test wallet can use its bounded second attempt without masking liabilities', async () => {
    const store = new MemoryRewardStore();
    const identity = {
        address: 'NQ46 KLJE 5TMF 4Y1A 1255 CJHJ YG1S H0NU T604',
        authorizedAt: '2026-07-29T12:00:00.000Z'
    };
    const service = new RewardService({
        ...config(),
        testWalletAddress: identity.address,
        testDailyAttemptLimit: 2
    }, store, {
        now: () => new Date('2026-07-29T12:00:00.000Z'),
        idSource: (() => {
            const ids = [
                'reward_challenge_01', 'entitlement_record_01',
                'reward_challenge_02', 'entitlement_record_02'
            ];
            return () => ids.shift()!;
        })(),
        tokenSource: () => 't'.repeat(43),
        seedSource: () => 7
    });
    const first = await service.reserve(identity, 'wizard');
    await service.start(identity, first.challengeId, first.eligibilityToken);
    await service.completeMatch(lossResult(first.challengeId));
    await assert.rejects(
        service.status(identity),
        (error: unknown) => error instanceof RewardStoreError && error.code === 'not_found'
    );

    const second = await service.reserve(identity, 'wizard');
    const started = await service.start(identity, second.challengeId, second.eligibilityToken);
    assert.equal(started.attemptNumber, 2);
});

function serviceFor(store: MemoryRewardStore): RewardService {
    return new RewardService(config(), store, {
        now: () => new Date('2026-07-29T12:00:00.000Z'),
        idSource: (() => {
            const ids = ['reward_challenge_01', 'entitlement_record_01'];
            return () => ids.shift()!;
        })(),
        tokenSource: () => 't'.repeat(43),
        seedSource: () => 1
    });
}

function config(): RewardConfig {
    return {
        mode: 'record-only',
        rewardLuna: 100_000n,
        feeLuna: 0n,
        dailyBudgetLuna: 100_000n,
        reservationTtlMs: 60_000,
        claimTtlMs: 60_000,
        turnLimit: 16,
        paused: false,
        network: 'test-albatross',
        testDailyAttemptLimit: 1
    };
}

function lossResult(challengeId: string): ChallengeResult {
    return {
        protocolVersion: 1,
        serverTimeMs: Date.now(),
        sessionId: 'reward_session_001',
        challengeId,
        outcome: 'loomkeeper_win',
        revision: 1,
        nextSequence: 2,
        finalTick: 20,
        finalStateHash: 'a'.repeat(64)
    };
}
