import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChallengeResult } from '../../shared/protocol';
import { decideLoomkeeperTurn } from '../../shared/loomkeeper';
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
    while (coordinator.get(reservation.challengeId)!.state.phase === 'awaiting_command') {
        let state = coordinator.get(reservation.challengeId)!.state;
        if (state.activeActor === 'player') {
            coordinator.apply(
                reservation.challengeId,
                'player',
                { type: 'aim', angleMilliDegrees: 40_000, powerPermille: 1_000 },
                state.turn
            );
            state = coordinator.get(reservation.challengeId)!.state;
            coordinator.apply(
                reservation.challengeId,
                'player',
                { type: 'fire' },
                state.turn
            );
        } else {
            const decision = decideLoomkeeperTurn(state, 'standard')!;
            for (const command of decision.commands) {
                const live = coordinator.get(reservation.challengeId)!.state;
                if (live.phase === 'finished') break;
                coordinator.apply(
                    reservation.challengeId,
                    'loomkeeper',
                    command,
                    live.turn
                );
            }
        }
    }
    const terminal = coordinator.get(reservation.challengeId)!;
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
        network: 'test-albatross'
    };
}
