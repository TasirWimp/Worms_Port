import assert from 'node:assert/strict';
import test from 'node:test';

import { LiveSimulationCoordinatorV10 } from '../../server/src/simulation/coordinator-v10-live';
import { MemoryRewardStore } from '../../server/src/reward/memory-store';
import { RewardService } from '../../server/src/reward/service';
import { RewardStoreError, type RewardConfig } from '../../server/src/reward/types';

const WALLET = 'NQ46 KLJE 5TMF 4Y1A 1255 CJHJ YG1S H0NU T604';

test('genuine V10 Daily evidence settles once while forged volcanic replay evidence is refused', async () => {
    const store = new MemoryRewardStore();
    const service = serviceFor(store);
    const identity = {
        address: WALLET,
        authorizedAt: '2026-07-29T12:00:00.000Z'
    };
    const reservation = await service.reserve(identity, 'wizard');
    await service.start(identity, reservation.challengeId, reservation.eligibilityToken);
    const coordinator = new LiveSimulationCoordinatorV10({ nowUs: () => 0 });
    try {
        coordinator.createAutomated(reservation.challengeId, 'reward_v10_session_001', 1, 'wizard');
        for (let turn = 0;
            turn < 20 && coordinator.get(reservation.challengeId)!.state.phase !== 'finished';
            turn += 1) {
            coordinator.advance(reservation.challengeId, 900);
        }
        const terminal = coordinator.get(reservation.challengeId)!;
        assert.equal(terminal.state.phase, 'finished');
        assert.notEqual(terminal.state.winner, 'player');
        const result = {
            protocolVersion: 10 as const,
            serverTimeMs: Date.now(),
            sessionId: 'reward_v10_session_001',
            challengeId: reservation.challengeId,
            rulesetId: terminal.state.rulesetId,
            automationId: 'wp-015d4h-v10-live-v1' as const,
            loomkeeperPolicyId: 'nimble-knots-loomkeeper-v5' as const,
            loomkeeperProfileId: 'standard-v10-0' as const,
            nextSequence: 1,
            nextInputSequence: 0,
            outcome: terminal.state.winner === 'loomkeeper'
                ? 'loomkeeper_win' as const
                : 'draw' as const,
            finalTick: terminal.state.tick,
            finalStateHash: terminal.stateHash
        };
        const replay = coordinator.replay(reservation.challengeId)!;
        await assert.rejects(
            service.completeMatch(result, { ...replay, initialStateHash: 'f'.repeat(64) }),
            (error: unknown) => error instanceof RewardStoreError && error.code === 'unavailable'
        );
        assert.equal(
            (await store.status(reservation.reservationId, identity.address))?.state,
            'in_progress'
        );
        const update = await service.completeMatch(result, replay);
        assert.equal(update?.state, terminal.state.winner === 'loomkeeper' ? 'lost' : 'draw');
        assert.equal((await service.completeMatch(result, replay))?.state, update?.state);
    } finally {
        coordinator.dispose();
    }
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
