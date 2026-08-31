import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChallengeResult } from '../../shared/protocol';
import { SIM_RULES } from '../../shared/simulation';
import { MemoryRewardStore } from '../../server/src/reward/memory-store';
import { RewardService } from '../../server/src/reward/service';
import { RewardStoreError, type RewardConfig } from '../../server/src/reward/types';
import { SimulationCoordinator } from '../../server/src/simulation/coordinator';

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
    for (let shot = 1; shot <= 4; shot += 1) {
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
        if (shot < 4) {
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
