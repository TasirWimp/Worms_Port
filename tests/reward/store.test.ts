import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { MemoryRewardStore } from '../../server/src/reward/memory-store';
import { RewardStoreError, type RewardConfig } from '../../server/src/reward/types';

const DAY = '2026-07-29';
const WALLET = 'NQ46 KLJE 5TMF 4Y1A 1255 CJHJ YG1S H0NU T604';
const OTHER_WALLET = 'NQ57 WZKS E7RF G7SV 8F7F YG5E E2L3 1X3G RKXA';
const NOW = new Date(`${DAY}T12:00:00.000Z`);

test('concurrent reservations cannot exceed the daily Luna ceiling', async () => {
    const store = new MemoryRewardStore();
    const settled = await Promise.allSettled([
        store.reserve(reservation('entitlement_record_01', 'reward_challenge_01', WALLET)),
        store.reserve(reservation('entitlement_record_02', 'reward_challenge_02', OTHER_WALLET))
    ]);
    assert.equal(settled.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = settled.find((result) => result.status === 'rejected');
    assert.ok(rejected && rejected.status === 'rejected');
    assert.ok(rejected.reason instanceof RewardStoreError);
    assert.equal(rejected.reason.code, 'exhausted');
});

test('an expired reservation releases capacity without consuming the attempt', async () => {
    const store = new MemoryRewardStore();
    await store.reserve({
        ...reservation('entitlement_record_01', 'reward_challenge_01', WALLET),
        reservationExpiresAt: new Date(NOW.getTime() + 1)
    });
    assert.equal(await store.expireReservations(new Date(NOW.getTime() + 2)), 1);
    const replacement = await store.reserve(
        reservation('entitlement_record_02', 'reward_challenge_02', WALLET)
    );
    assert.equal(replacement.state, 'reserved');
});

test('a started attempt is wallet-bound and a loss releases sponsor capacity', async () => {
    const store = new MemoryRewardStore();
    const input = reservation('entitlement_record_01', 'reward_challenge_01', WALLET);
    await store.reserve(input);
    await assert.rejects(
        store.start(input.challengeId, OTHER_WALLET, input.eligibilityTokenDigest, NOW),
        (error: unknown) => error instanceof RewardStoreError && error.code === 'ineligible'
    );
    const started = await store.start(
        input.challengeId,
        WALLET,
        input.eligibilityTokenDigest,
        NOW
    );
    assert.equal(started.attemptConsumed, true);
    await store.completeMatch({
        challengeId: input.challengeId,
        outcome: 'loomkeeper_win',
        finalTick: 20,
        finalStateHash: 'a'.repeat(64),
        now: NOW
    });
    assert.equal((await store.info(DAY, config())).status, 'available');
    await assert.rejects(
        store.reserve(reservation(
            'entitlement_record_02',
            'reward_challenge_02',
            WALLET
        )),
        (error: unknown) => error instanceof RewardStoreError && error.code === 'ineligible'
    );
});

test('claim nonce and idempotency rules create only one queued payout intent', async () => {
    const store = new MemoryRewardStore();
    const input = reservation('entitlement_record_01', 'reward_challenge_01', WALLET);
    await store.reserve(input);
    await store.start(input.challengeId, WALLET, input.eligibilityTokenDigest, NOW);
    await store.completeMatch({
        challengeId: input.challengeId,
        outcome: 'player_win',
        finalTick: 42,
        finalStateHash: 'b'.repeat(64),
        claimNonceDigest: digest('claim-nonce'),
        claimNonceExpiresAt: new Date(NOW.getTime() + 60_000),
        now: NOW
    });
    const claim = {
        entitlementId: input.id,
        walletAddress: WALLET,
        claimNonceDigest: digest('claim-nonce'),
        idempotencyKey: 'idempotency_key_01',
        requestDigest: digest('canonical-request'),
        now: NOW
    };
    assert.equal((await store.claim(claim)).state, 'queued');
    assert.equal((await store.claim(claim)).state, 'queued');
    await assert.rejects(
        store.claim({ ...claim, requestDigest: digest('different-request') }),
        (error: unknown) => error instanceof RewardStoreError && error.code === 'conflict'
    );
});

test('startup forfeits orphaned in-progress matches without losing attempt history', async () => {
    const store = new MemoryRewardStore();
    const input = reservation('entitlement_record_01', 'reward_challenge_01', WALLET);
    await store.reserve(input);
    await store.start(input.challengeId, WALLET, input.eligibilityTokenDigest, NOW);
    assert.equal(await store.forfeitInProgressOnStartup(new Date(NOW.getTime() + 1)), 1);
    assert.equal((await store.status(input.id, WALLET))?.state, 'forfeited');
    assert.equal((await store.info(DAY, config())).status, 'available');
    await assert.rejects(
        store.reserve(reservation(
            'entitlement_record_02',
            'reward_challenge_02',
            WALLET
        )),
        (error: unknown) => error instanceof RewardStoreError && error.code === 'ineligible'
    );
});

test('a bounded test-wallet limit permits sequential attempt slots only', async () => {
    const store = new MemoryRewardStore();
    const first = {
        ...reservation('entitlement_record_01', 'reward_challenge_01', WALLET),
        dailyAttemptLimit: 2
    };
    await store.reserve(first);
    assert.equal((await store.start(
        first.challengeId,
        WALLET,
        first.eligibilityTokenDigest,
        NOW
    )).attemptNumber, 1);
    await store.completeMatch({
        challengeId: first.challengeId,
        outcome: 'loomkeeper_win',
        finalTick: 20,
        finalStateHash: 'a'.repeat(64),
        now: NOW
    });

    const second = {
        ...reservation('entitlement_record_02', 'reward_challenge_02', WALLET),
        dailyAttemptLimit: 2
    };
    await store.reserve(second);
    assert.equal((await store.start(
        second.challengeId,
        WALLET,
        second.eligibilityTokenDigest,
        NOW
    )).attemptNumber, 2);
    await store.completeMatch({
        challengeId: second.challengeId,
        outcome: 'loomkeeper_win',
        finalTick: 20,
        finalStateHash: 'b'.repeat(64),
        now: NOW
    });

    await assert.rejects(
        store.reserve({
            ...reservation('entitlement_record_03', 'reward_challenge_03', WALLET),
            dailyAttemptLimit: 2
        }),
        (error: unknown) => error instanceof RewardStoreError && error.code === 'ineligible'
    );
});

test('cancelled reservation churn is bounded per wallet and UTC day', async () => {
    const store = new MemoryRewardStore();
    for (let index = 0; index < 5; index += 1) {
        const input = reservation(
            `entitlement_record_${index}`,
            `reward_challenge_${index}`,
            WALLET
        );
        await store.reserve(input);
        await store.cancelReserved(input.challengeId, WALLET, NOW);
    }
    await assert.rejects(
        store.reserve(reservation(
            'entitlement_record_06',
            'reward_challenge_06',
            WALLET
        )),
        (error: unknown) => error instanceof RewardStoreError && error.code === 'ineligible'
    );
});

function reservation(id: string, challengeId: string, walletAddress: string) {
    return {
        id,
        challengeId,
        challengeDay: DAY,
        walletAddress,
        calling: 'wizard' as const,
        seed: 7,
        rewardLuna: 100_000n,
        dailyBudgetLuna: 100_000n,
        dailyAttemptLimit: 1,
        paused: false,
        eligibilityTokenDigest: digest(`${id}-token`),
        reservationExpiresAt: new Date(NOW.getTime() + 60_000),
        now: NOW
    };
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

function digest(value: string): string {
    return createHash('sha256').update(value).digest('base64url');
}
