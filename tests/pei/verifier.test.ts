import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryRewardStore } from '../../server/src/reward/memory-store';
import { RewardService } from '../../server/src/reward/service';
import type { RewardConfig } from '../../server/src/reward/types';
import { peiProofHashV0, peiRequestCommitmentV0 } from '../../shared/pei-v0';
import {
    verifyPeiJourneyV0,
    type PeiVerificationV0
} from '../../server/src/pei/verifier';
import {
    PEI_CONFIG,
    PEI_EARN_TX,
    PEI_NOW_SECONDS,
    PEI_OTHER_WALLET,
    PEI_PROXY_ADDRESS,
    PEI_SPEND_TX,
    PEI_WALLET,
    peiFixture
} from './fixtures';

test('a fresh verifier reconstructs the complete journey and feeds durable admission', async () => {
    const fixture = await peiFixture();
    const serialized = JSON.stringify(fixture.journey);
    const freshJourney = JSON.parse(serialized);
    const result = await verifyPeiJourneyV0(freshJourney, {
        adapter: fixture.chain,
        config: PEI_CONFIG,
        nowSeconds: PEI_NOW_SECONDS,
        expectedSubject: PEI_WALLET,
        expectedEarnCommitment: fixture.earnCommitment
    });
    assert.equal(result.status, 'valid');
    if (result.status !== 'valid') return;
    assert.equal(result.qualification.walletAddress, PEI_WALLET);
    assert.match(result.qualification.qualificationDigest, /^[A-Za-z0-9_-]{43}$/);
    assert.deepEqual(result.requestCommitments, [fixture.earnCommitment, fixture.spendCommitment]);

    const rewardConfig: RewardConfig = {
        mode: 'record-only', paused: false,
        network: 'main-albatross', rewardLuna: 100_000n, feeLuna: 0n,
        dailyBudgetLuna: 1_000_000n, reservationTtlMs: 300_000,
        claimTtlMs: 300_000, turnLimit: 16,
        testDailyAttemptLimit: 1, peiRequired: true
    };
    const rewards = new RewardService(rewardConfig, new MemoryRewardStore(), {
        now: () => new Date(PEI_NOW_SECONDS * 1_000),
        peiGrantIdSource: () => 'pei_admission_grant_fresh_01',
        peiGrantTokenSource: () => 'T'.repeat(43)
    });
    const admission = await rewards.issuePeiQualification(result.qualification);
    assert.equal(admission.grantId, 'pei_admission_grant_fresh_01');
    assert.equal(admission.challengeDay, new Date(PEI_NOW_SECONDS * 1_000).toISOString().slice(0, 10));
});

test('request policy mismatches and replay against a fresh expected request are invalid', async () => {
    const base = await peiFixture();
    const cases: Array<[string, (fixture: Awaited<ReturnType<typeof peiFixture>>) => Promise<void> | void]> = [
        ['unexpected_subject', ({ journey }) => { journey.proofs[0].request.subject = PEI_OTHER_WALLET; journey.proofs[1].request.subject = PEI_OTHER_WALLET; }],
        ['request_network_mismatch', ({ journey }) => { journey.proofs[0].request.network = 'test-albatross'; }],
        ['requester_origin_mismatch', ({ journey }) => { journey.proofs[0].request.requesterOrigin = 'https://evil.example'; }],
        ['return_uri_not_allowed', ({ journey }) => { journey.proofs[0].request.returnUri = 'https://evil.example/return'; }],
        ['request_amount_mismatch', ({ journey }) => { journey.proofs[0].request.minAmountLuna = '1'; }],
        ['request_ttl_too_long', ({ journey }) => { journey.proofs[0].request.expiresAt += 1; }],
        ['request_issued_in_future', ({ journey }) => {
            journey.proofs[0].request.issuedAt = PEI_NOW_SECONDS + 31;
            journey.proofs[0].request.expiresAt = PEI_NOW_SECONDS + 800;
            journey.proofs[1].request.issuedAt = PEI_NOW_SECONDS + 32;
        }],
        ['request_expired', ({ journey }) => { journey.proofs[0].request.issuedAt = PEI_NOW_SECONDS - 900; journey.proofs[0].request.expiresAt = PEI_NOW_SECONDS; }],
        ['unexpected_earn_request', () => undefined]
    ];
    for (const [expected, mutate] of cases) {
        const fixture = await peiFixture();
        await mutate(fixture);
        const result = await verifyPeiJourneyV0(fixture.journey, {
            adapter: fixture.chain, config: PEI_CONFIG, nowSeconds: PEI_NOW_SECONDS,
            expectedSubject: PEI_WALLET,
            expectedEarnCommitment: expected === 'unexpected_earn_request'
                ? 'Z'.repeat(43)
                : await peiRequestCommitmentV0(fixture.journey.proofs[0].request)
        });
        assertInvalid(result, expected);
    }
    assert.equal(base.earnCommitment.length, 43);
});

test('journey order, ancestry, wallet continuity and transaction reuse are invalid', async () => {
    for (const [expected, mutate] of [
        ['wrong_edge_order', (fixture) => { fixture.journey.proofs.reverse(); }],
        ['subject_changed', (fixture) => { fixture.journey.proofs[1].request.subject = PEI_OTHER_WALLET; }],
        ['transaction_reused', (fixture) => { fixture.journey.proofs[1].txHash = PEI_EARN_TX; }],
        ['nonce_reused', (fixture) => { fixture.journey.proofs[1].request.nonce = fixture.journey.proofs[0].request.nonce; }],
        ['request_time_reversed', (fixture) => { fixture.journey.proofs[1].request.issuedAt = fixture.journey.proofs[0].request.issuedAt - 1; }],
        ['parent_proof_mismatch', (fixture) => { fixture.journey.proofs[1].request.parentProofHash = 'Z'.repeat(43); }],
        ['parent_proof_mismatch', (fixture) => { fixture.journey.proofs[0].request.nonce = 'B'.repeat(43); }]
    ] as Array<[string, (fixture: Awaited<ReturnType<typeof peiFixture>>) => void]>) {
        const fixture = await peiFixture();
        mutate(fixture);
        const result = await verifyPeiJourneyV0(fixture.journey, {
            adapter: fixture.chain, config: PEI_CONFIG, nowSeconds: PEI_NOW_SECONDS,
            expectedSubject: PEI_WALLET
        });
        assertInvalid(result, expected);
    }
});

test('both earn and spend transactions are bound to direction, value, data and network', async () => {
    const mutations: Array<[string, 'earn' | 'spend', (transaction: Record<string, unknown>) => void]> = [
        ['transaction_hash_mismatch', 'earn', (tx) => { tx.hash = '3'.repeat(64); }],
        ['transaction_network_mismatch', 'earn', (tx) => { tx.network = 'test-albatross'; }],
        ['transaction_sender_mismatch', 'earn', (tx) => { tx.sender = PEI_WALLET; }],
        ['transaction_recipient_mismatch', 'earn', (tx) => { tx.recipient = PEI_PROXY_ADDRESS; }],
        ['transaction_value_too_small', 'earn', (tx) => { tx.valueLuna = '99999'; }],
        ['transaction_commitment_mismatch', 'earn', (tx) => { tx.data = 'Z'.repeat(43); }],
        ['transaction_sender_mismatch', 'spend', (tx) => { tx.sender = PEI_PROXY_ADDRESS; }],
        ['transaction_recipient_mismatch', 'spend', (tx) => { tx.recipient = PEI_WALLET; }]
    ];
    for (const [expected, edge, mutate] of mutations) {
        const fixture = await peiFixture();
        const hash = edge === 'earn' ? PEI_EARN_TX : PEI_SPEND_TX;
        mutate(fixture.chain.transactions.get(hash) as unknown as Record<string, unknown>);
        const result = await verifyPeiJourneyV0(fixture.journey, {
            adapter: fixture.chain, config: PEI_CONFIG, nowSeconds: PEI_NOW_SECONDS
        });
        assertInvalid(result, expected, edge);
    }
});

test('failed chain truth is invalid while absence, pending, unfinalized and outage are inconclusive', async () => {
    for (const [expectedStatus, expectedReason, mutate] of [
        ['invalid', 'transaction_failed', (fixture) => { fixture.chain.transactions.get(PEI_EARN_TX)!.executionState = 'failed'; }],
        ['inconclusive', 'transaction_not_found', (fixture) => { fixture.chain.transactions.delete(PEI_EARN_TX); }],
        ['inconclusive', 'transaction_pending', (fixture) => { fixture.chain.transactions.get(PEI_EARN_TX)!.executionState = 'pending'; }],
        ['inconclusive', 'transaction_not_final', (fixture) => { fixture.chain.transactions.get(PEI_EARN_TX)!.finalized = false; }],
        ['inconclusive', 'chain_adapter_unavailable', (fixture) => { fixture.chain.failure = new Error('offline'); }]
    ] as Array<[PeiVerificationV0['status'], string, (fixture: Awaited<ReturnType<typeof peiFixture>>) => void]>) {
        const fixture = await peiFixture();
        mutate(fixture);
        const result = await verifyPeiJourneyV0(fixture.journey, {
            adapter: fixture.chain, config: PEI_CONFIG, nowSeconds: PEI_NOW_SECONDS
        });
        assert.equal(result.status, expectedStatus);
        if (result.status !== 'valid') assert.equal(result.reason, expectedReason);
    }
});

test('mutating the accepted parent after child creation breaks the spend link', async () => {
    const fixture = await peiFixture();
    const original = await peiProofHashV0(fixture.earnProof);
    fixture.earnProof.txHash = '3'.repeat(64);
    assert.notEqual(await peiProofHashV0(fixture.earnProof), original);
    const result = await verifyPeiJourneyV0(fixture.journey, {
        adapter: fixture.chain, config: PEI_CONFIG, nowSeconds: PEI_NOW_SECONDS
    });
    assertInvalid(result, 'parent_proof_mismatch', 'spend');
});

function assertInvalid(result: PeiVerificationV0, reason: string, edge?: 'earn' | 'spend'): void {
    assert.equal(result.status, 'invalid');
    if (result.status === 'valid') return;
    assert.equal(result.reason, reason);
    if (edge) assert.equal(result.edge, edge);
}
