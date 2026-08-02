import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
    PayoutAdapterError,
    RewardPayoutWorker,
    type ChainTransactionStatus,
    type RewardPayoutAdapter
} from '../../server/src/reward/payout';
import { MemoryRewardStore } from '../../server/src/reward/memory-store';
import type { RewardConfig, RewardEntitlement } from '../../server/src/reward/types';

const NOW = new Date('2026-07-29T12:00:00.000Z');
const WALLET = 'NQ46 KLJE 5TMF 4Y1A 1255 CJHJ YG1S H0NU T604';

test('ambiguous submission reuses exact signed bytes and finalizes by stored hash', async () => {
    const store = new MemoryRewardStore();
    const entitlement = await queuedEntitlement(store);
    const adapter = new FakeAdapter();
    const worker = new RewardPayoutWorker(store, adapter, config());

    await worker.runOnce();
    assert.equal((await store.status(entitlement.id, WALLET))?.state, 'broadcast_unknown');
    assert.ok(adapter.broadcasts.length >= 1);
    assert.equal(new Set(adapter.broadcasts).size, 1);

    adapter.chainStatus = {
        state: 'included',
        headHeight: 120,
        includedHeight: 60,
        finalized: true
    };
    await worker.runOnce();
    const finalized = await store.status(entitlement.id, WALLET);
    assert.equal(finalized?.state, 'finalized');
    assert.equal(finalized?.transactionHash, 'a'.repeat(64));
    await worker.close();
});

test('the pause switch does not perform a first broadcast of persisted signed intent', async () => {
    const store = new MemoryRewardStore();
    const queued = await queuedEntitlement(store);
    await store.markSigned({
        entitlementId: queued.id,
        serializedTransaction: 'cafe',
        transactionHash: 'a'.repeat(64),
        validityStartHeight: 10,
        now: NOW
    });
    const adapter = new FakeAdapter();
    const worker = new RewardPayoutWorker(store, adapter, {
        ...config(),
        paused: true
    });
    await worker.runOnce();
    assert.equal(adapter.broadcasts.length, 0);
    assert.equal((await store.status(queued.id, WALLET))?.state, 'signed');
    await worker.close();
});

test('fake signer and RPC preparation faults enter manual review with sanitized reasons', async () => {
    for (const reason of [
        'insufficient_funds',
        'fee_reserve',
        'wrong_signer',
        'wrong_network',
        'stale_head',
        'rpc_outage',
        'rpc_shape_error'
    ]) {
        const store = new MemoryRewardStore();
        const queued = await queuedEntitlement(store);
        const adapter = new FakeAdapter();
        adapter.prepareError = new PayoutAdapterError(reason, `synthetic ${reason}`);
        const worker = new RewardPayoutWorker(store, adapter, config());

        await worker.runOnce();

        const reviewed = await store.status(queued.id, WALLET);
        assert.equal(reviewed?.state, 'manual_review');
        assert.equal(reviewed?.reasonCode, reason);
        assert.equal(adapter.prepareCalls, 1);
        assert.equal(adapter.broadcasts.length, 0);
        await worker.close();
    }
});

test('delayed inclusion survives worker replacement and finalizes without signing again', async () => {
    const store = new MemoryRewardStore();
    const queued = await queuedEntitlement(store);
    const firstAdapter = new FakeAdapter();
    const firstWorker = new RewardPayoutWorker(store, firstAdapter, config());
    await firstWorker.runOnce();
    assert.equal((await store.status(queued.id, WALLET))?.state, 'broadcast_unknown');
    assert.equal(firstAdapter.prepareCalls, 1);
    await firstWorker.close();

    const inclusionAdapter = new FakeAdapter();
    inclusionAdapter.chainStatus = {
        state: 'included',
        headHeight: 80,
        includedHeight: 60,
        finalized: false
    };
    const inclusionWorker = new RewardPayoutWorker(store, inclusionAdapter, config());
    await inclusionWorker.runOnce();
    assert.equal((await store.status(queued.id, WALLET))?.state, 'included');
    assert.equal(inclusionAdapter.prepareCalls, 0);
    await inclusionWorker.close();

    const finalityAdapter = new FakeAdapter();
    finalityAdapter.chainStatus = {
        state: 'included',
        headHeight: 120,
        includedHeight: 60,
        finalized: true
    };
    const finalityWorker = new RewardPayoutWorker(store, finalityAdapter, config());
    await finalityWorker.runOnce();
    assert.equal((await store.status(queued.id, WALLET))?.state, 'finalized');
    assert.equal(finalityAdapter.prepareCalls, 0);
    await finalityWorker.close();
});

test('expired absence and invalid status never construct a replacement transaction', async () => {
    const expiredStore = new MemoryRewardStore();
    const expired = await queuedEntitlement(expiredStore);
    const expiredAdapter = new FakeAdapter();
    expiredAdapter.chainStatus = { state: 'absent', headHeight: 111 };
    const expiredWorker = new RewardPayoutWorker(expiredStore, expiredAdapter, config());
    await expiredWorker.runOnce();
    assert.equal((await expiredStore.status(expired.id, WALLET))?.state, 'manual_review');
    assert.equal((await expiredStore.status(expired.id, WALLET))?.reasonCode, 'expired_absent');
    await expiredWorker.runOnce();
    assert.equal(expiredAdapter.prepareCalls, 1);
    assert.equal(new Set(expiredAdapter.broadcasts).size, 1);
    await expiredWorker.close();

    const invalidStore = new MemoryRewardStore();
    const ambiguous = await queuedEntitlement(invalidStore);
    const invalidAdapter = new FakeAdapter();
    invalidAdapter.statusError = new PayoutAdapterError(
        'rpc_shape_error',
        'synthetic invalid response'
    );
    const invalidWorker = new RewardPayoutWorker(invalidStore, invalidAdapter, config());
    await invalidWorker.runOnce();
    await invalidWorker.runOnce();
    assert.equal((await invalidStore.status(ambiguous.id, WALLET))?.state, 'broadcast_unknown');
    assert.equal(invalidAdapter.prepareCalls, 1);
    assert.equal(new Set(invalidAdapter.broadcasts).size, 1);
    await invalidWorker.close();
});

class FakeAdapter implements RewardPayoutAdapter {
    public broadcasts: string[] = [];
    public prepareCalls = 0;
    public prepareError?: Error;
    public statusError?: Error;
    public chainStatus: ChainTransactionStatus = { state: 'absent', headHeight: 50 };

    public async prepare(_entitlement: RewardEntitlement) {
        this.prepareCalls += 1;
        if (this.prepareError) throw this.prepareError;
        return {
            serializedTransaction: 'cafe',
            transactionHash: 'a'.repeat(64),
            validityStartHeight: 10
        };
    }

    public async broadcast(serializedTransaction: string): Promise<void> {
        this.broadcasts.push(serializedTransaction);
    }

    public async status(_transactionHash: string): Promise<ChainTransactionStatus> {
        if (this.statusError) throw this.statusError;
        return this.chainStatus;
    }

    public validityWindowBlocks(): number {
        return 100;
    }
}

async function queuedEntitlement(store: MemoryRewardStore) {
    const input = {
        id: 'entitlement_record_01',
        challengeId: 'reward_challenge_01',
        challengeDay: '2026-07-29',
        walletAddress: WALLET,
        calling: 'wizard' as const,
        seed: 7,
        rewardLuna: 100_000n,
        dailyBudgetLuna: 100_000n,
        dailyAttemptLimit: 1,
        paused: false,
        eligibilityTokenDigest: digest('eligibility'),
        reservationExpiresAt: new Date(NOW.getTime() + 60_000),
        now: NOW
    };
    await store.reserve(input);
    await store.start(input.challengeId, WALLET, input.eligibilityTokenDigest, NOW);
    await store.completeMatch({
        challengeId: input.challengeId,
        outcome: 'player_win',
        finalTick: 42,
        finalStateHash: 'b'.repeat(64),
        claimNonceDigest: digest('nonce'),
        claimNonceExpiresAt: new Date(NOW.getTime() + 60_000),
        now: NOW
    });
    return store.claim({
        entitlementId: input.id,
        walletAddress: WALLET,
        claimNonceDigest: digest('nonce'),
        idempotencyKey: 'idempotency_key_01',
        requestDigest: digest('request'),
        now: NOW
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

function digest(value: string): string {
    return createHash('sha256').update(value).digest('base64url');
}
