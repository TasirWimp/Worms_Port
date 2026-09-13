import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { Client } from 'pg';

import {
    RewardPayoutWorker,
    type ChainTransactionStatus,
    type RewardPayoutAdapter
} from '../../server/src/reward/payout';
import { PostgresRewardStore } from '../../server/src/reward/postgres-store';
import {
    RewardStoreError,
    type RewardConfig,
    type RewardEntitlement,
    type RewardReservationInput
} from '../../server/src/reward/types';
import type { CoordinatorReplay } from '../../server/src/simulation/coordinator';
import { createTestSigner, privateKeyForProject } from '../support/nimiq-signer';

const ADMIN_URL = requiredAdminUrl();
const DAY = '2026-08-02';
const NEXT_DAY = '2026-08-03';
const NOW = new Date(`${DAY}T12:00:00.000Z`);
const WALLET = 'NQ46 KLJE 5TMF 4Y1A 1255 CJHJ YG1S H0NU T604';
const OTHER_WALLET = syntheticWalletAddress('postgres-integration');
let databaseSequence = 0;

test('concurrent initialization migrates a zero database exactly once', async () => {
    await withDatabase('migration', async (databaseUrl) => {
        const first = new PostgresRewardStore(databaseUrl, 2);
        const second = new PostgresRewardStore(databaseUrl, 2);
        try {
            await Promise.all([first.initialize(), second.initialize()]);
            await first.initialize();
            const client = await connectedClient(databaseUrl);
            try {
                const tables = await client.query<{ table_name: string }>(
                    `SELECT table_name FROM information_schema.tables
                      WHERE table_schema = 'public'
                      ORDER BY table_name`
                );
                assert.deepEqual(tables.rows.map((row) => row.table_name), [
                    'pei_admission_grants',
                    'reward_claims',
                    'reward_days',
                    'reward_entitlements',
                    'reward_events'
                ]);
                const indexes = await client.query<{ indexname: string }>(
                    `SELECT indexname FROM pg_indexes
                      WHERE schemaname = 'public' AND indexname LIKE 'reward_one_%'
                      ORDER BY indexname`
                );
                assert.deepEqual(indexes.rows.map((row) => row.indexname), [
                    'reward_one_active_reservation',
                    'reward_one_consumed_attempt'
                ]);
            } finally {
                await client.end();
            }
        } finally {
            await Promise.allSettled([first.close(), second.close()]);
        }
    });
});

test('durable PEI receipts are wallet-bound, reusable after cancellation, and consumed at start', async () => {
    await withDatabase('pei_admission', async (databaseUrl) => {
        const store = new PostgresRewardStore(databaseUrl, 3);
        try {
            await store.initialize();
            const receipt = await store.issuePeiReceipt({
                id: 'pei_receipt_record_01',
                walletAddress: WALLET,
                qualificationDigest: digest('verified-pei-journey'),
                issuedAt: NOW
            });
            const retried = await store.issuePeiReceipt({
                id: 'pei_receipt_record_retry_01',
                walletAddress: WALLET,
                qualificationDigest: digest('verified-pei-journey'),
                issuedAt: new Date(NOW.getTime() + 1_000)
            });
            assert.equal(retried.id, receipt.id);
            await store.issuePeiReceipt({
                id: 'pei_receipt_record_02',
                walletAddress: WALLET,
                qualificationDigest: digest('second-verified-pei-journey'),
                issuedAt: new Date(NOW.getTime() + 2_000)
            });
            assert.equal((await store.info(DAY, {
                ...config(), peiRequired: true
            }, WALLET)).availablePeiReceipts, 2);
            await assert.rejects(
                store.reserve(reservation(
                    'pei_wrong_wallet_entitlement',
                    'pei_wrong_wallet_challenge',
                    OTHER_WALLET,
                    DAY,
                    { peiReceiptRequired: true }
                )),
                rewardError('ineligible')
            );

            const cancelled = reservation(
                'pei_cancel_entitlement_01',
                'pei_cancel_challenge_01',
                WALLET,
                DAY,
                { peiReceiptRequired: true }
            );
            await store.reserve(cancelled);
            await store.cancelReserved(cancelled.challengeId, WALLET, NOW);
            assert.equal((await store.peiReceiptStatus(receipt.id, WALLET))?.consumedAt, undefined);

            const startedInput = reservation(
                'pei_start_entitlement_01',
                'pei_start_challenge_01',
                WALLET,
                DAY,
                { peiReceiptRequired: true }
            );
            const reserved = await store.reserve(startedInput);
            assert.equal(reserved.peiReceiptId, receipt.id);
            const started = await store.start(
                startedInput.challengeId,
                WALLET,
                startedInput.eligibilityTokenDigest,
                NOW
            );
            assert.equal(started.state, 'in_progress');
            const consumed = await store.peiReceiptStatus(receipt.id, WALLET);
            assert.equal(consumed?.entitlementId, started.id);
            assert.equal(consumed?.consumedAt?.toISOString(), NOW.toISOString());
            assert.equal((await store.info(DAY, {
                ...config(), peiRequired: true
            }, WALLET)).availablePeiReceipts, 1);
        } finally {
            await store.close();
        }
    });
});

test('an expired historical-shaped grant remains usable as a non-expiring receipt', async () => {
    await withDatabase('pei_legacy_receipt', async (databaseUrl) => {
        const store = new PostgresRewardStore(databaseUrl, 2);
        try {
            await store.initialize();
            const client = await connectedClient(databaseUrl);
            try {
                await client.query(
                    `INSERT INTO pei_admission_grants (
                        id, wallet_address, challenge_day, qualification_digest,
                        token_digest, issued_at, expires_at
                     ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                    [
                        'pei_legacy_grant_01', WALLET, '2026-07-01',
                        digest('legacy-verified-journey'), digest('legacy-browser-token'),
                        new Date('2026-07-01T10:00:00.000Z'),
                        new Date('2026-07-01T10:10:00.000Z')
                    ]
                );
            } finally {
                await client.end();
            }
            const input = reservation(
                'pei_migrated_entitlement_01',
                'pei_migrated_challenge_01',
                WALLET,
                DAY,
                { peiReceiptRequired: true }
            );
            const reserved = await store.reserve(input);
            assert.equal(reserved.peiReceiptId, 'pei_legacy_grant_01');
            assert.equal((await store.start(
                input.challengeId, WALLET, input.eligibilityTokenDigest, NOW
            )).state, 'in_progress');
        } finally {
            await store.close();
        }
    });
});

test('the PostgreSQL canary wallet can consume all twelve attempt slots', async () => {
    await withDatabase('twelve_attempt_slots', async (databaseUrl) => {
        const store = new PostgresRewardStore(databaseUrl, 3);
        try {
            await store.initialize();
            for (let index = 1; index <= 12; index += 1) {
                const suffix = String(index).padStart(2, '0');
                const input = reservation(
                    `postgres_canary_entitlement_${suffix}`,
                    `postgres_canary_challenge_${suffix}`,
                    WALLET,
                    DAY,
                    { dailyAttemptLimit: 12 }
                );
                await store.reserve(input);
                assert.equal((await store.start(
                    input.challengeId,
                    WALLET,
                    input.eligibilityTokenDigest,
                    NOW
                )).attemptNumber, index);
                await store.completeMatch({
                    challengeId: input.challengeId,
                    outcome: 'loomkeeper_win',
                    finalTick: 20,
                    finalStateHash: index.toString(16).padStart(64, '0'),
                    now: NOW
                });
            }

            await assert.rejects(
                store.reserve(reservation(
                    'postgres_canary_entitlement_13',
                    'postgres_canary_challenge_13',
                    WALLET,
                    DAY,
                    { dailyAttemptLimit: 12 }
                )),
                rewardError('ineligible')
            );

        } finally {
            await store.close();
        }
    });
});

test('two connections allocate one final budget slot and one active wallet authority', async () => {
    await withDatabase('contention', async (databaseUrl) => {
        const first = new PostgresRewardStore(databaseUrl, 3);
        const second = new PostgresRewardStore(databaseUrl, 3);
        try {
            await first.initialize();
            const finalSlot = await Promise.allSettled([
                first.reserve(reservation(
                    'entitlement_final_01',
                    'reward_challenge_final_01',
                    WALLET
                )),
                second.reserve(reservation(
                    'entitlement_final_02',
                    'reward_challenge_final_02',
                    OTHER_WALLET
                ))
            ]);
            assert.equal(finalSlot.filter((result) => result.status === 'fulfilled').length, 1);
            assert.equal(finalSlot.filter((result) => result.status === 'rejected').length, 1);
            const rejected = finalSlot.find((result) => result.status === 'rejected');
            assert.ok(rejected && rejected.status === 'rejected');
            assert.ok(rejected.reason instanceof RewardStoreError);
            assert.equal(rejected.reason.code, 'exhausted');

            const activeDay = '2026-08-04';
            const sameWallet = await Promise.allSettled([
                first.reserve(reservation(
                    'entitlement_active_01',
                    'reward_challenge_active_01',
                    WALLET,
                    activeDay,
                    { dailyBudgetLuna: 200_000n }
                )),
                second.reserve(reservation(
                    'entitlement_active_02',
                    'reward_challenge_active_02',
                    WALLET,
                    activeDay,
                    { dailyBudgetLuna: 200_000n }
                ))
            ]);
            assert.equal(sameWallet.filter((result) => result.status === 'fulfilled').length, 1);
            const active = sameWallet.find((result) => result.status === 'fulfilled');
            assert.ok(active && active.status === 'fulfilled');
            const input = active.value.challengeId.endsWith('01')
                ? reservation(
                    'entitlement_active_01',
                    'reward_challenge_active_01',
                    WALLET,
                    activeDay,
                    { dailyBudgetLuna: 200_000n }
                )
                : reservation(
                    'entitlement_active_02',
                    'reward_challenge_active_02',
                    WALLET,
                    activeDay,
                    { dailyBudgetLuna: 200_000n }
                );
            const started = await Promise.allSettled([
                first.start(input.challengeId, WALLET, input.eligibilityTokenDigest, NOW),
                second.start(input.challengeId, WALLET, input.eligibilityTokenDigest, NOW)
            ]);
            assert.equal(started.filter((result) => result.status === 'fulfilled').length, 1);
            assert.equal(started.filter((result) => result.status === 'rejected').length, 1);
            const startedEntitlement = started.find((result) => result.status === 'fulfilled');
            assert.ok(startedEntitlement && startedEntitlement.status === 'fulfilled');
            assert.equal(startedEntitlement.value.id, active.value.id);
            assert.equal(startedEntitlement.value.attemptConsumed, true);
            const rejectedStart = started.find((result) => result.status === 'rejected');
            assert.ok(rejectedStart && rejectedStart.status === 'rejected');
            assert.ok(rejectedStart.reason instanceof RewardStoreError);
            assert.equal(rejectedStart.reason.code, 'ineligible');
            await assert.rejects(
                first.reserve(reservation(
                    'entitlement_active_03',
                    'reward_challenge_active_03',
                    WALLET,
                    activeDay,
                    { dailyBudgetLuna: 200_000n }
                )),
                rewardError('ineligible')
            );

            const client = await connectedClient(databaseUrl);
            try {
                const finalDay = await client.query<{
                    committed_luna: string;
                    entitlements: string;
                }>(
                    `SELECT d.committed_luna,
                            COUNT(e.id)::text AS entitlements
                       FROM reward_days d
                       LEFT JOIN reward_entitlements e
                         ON e.challenge_day = d.challenge_day
                      WHERE d.challenge_day = $1
                      GROUP BY d.challenge_day, d.committed_luna`,
                    [DAY]
                );
                assert.equal(finalDay.rows[0].committed_luna, '100000');
                assert.equal(finalDay.rows[0].entitlements, '1');
            } finally {
                await client.end();
            }
        } finally {
            await Promise.allSettled([first.close(), second.close()]);
        }
    });
});

test('reservation expiry, cancellation, and UTC rollover preserve solvency and eligibility', async () => {
    await withDatabase('reservation', async (databaseUrl) => {
        const first = new PostgresRewardStore(databaseUrl, 3);
        const second = new PostgresRewardStore(databaseUrl, 3);
        try {
            await first.initialize();
            const cancelled = reservation(
                'entitlement_cancel_01',
                'reward_challenge_cancel_01',
                WALLET
            );
            await first.reserve(cancelled);
            await Promise.all([
                first.cancelReserved(cancelled.challengeId, WALLET, NOW),
                second.cancelReserved(cancelled.challengeId, WALLET, NOW)
            ]);
            assert.equal((await first.status(cancelled.id, WALLET))?.state, 'cancelled');

            const expiring = reservation(
                'entitlement_expire_01',
                'reward_challenge_expire_01',
                WALLET,
                DAY,
                { reservationExpiresAt: new Date(NOW.getTime() + 1) }
            );
            await first.reserve(expiring);
            await Promise.all([
                first.expireReservations(new Date(NOW.getTime() + 2)),
                second.expireReservations(new Date(NOW.getTime() + 2))
            ]);
            assert.equal((await first.status(expiring.id, WALLET))?.state, 'expired');
            assert.equal((await first.info(DAY, config())).status, 'available');

            const rollover = await second.reserve(reservation(
                'entitlement_rollover_01',
                'reward_challenge_rollover_01',
                WALLET,
                NEXT_DAY
            ));
            assert.equal(rollover.challengeDay, NEXT_DAY);
            assert.equal(rollover.attemptConsumed, false);
        } finally {
            await Promise.allSettled([first.close(), second.close()]);
        }
    });
});

test('claim nonce replay and idempotency conflict create one durable queue transition', async () => {
    await withDatabase('claim', async (databaseUrl) => {
        const first = new PostgresRewardStore(databaseUrl, 3);
        const second = new PostgresRewardStore(databaseUrl, 3);
        try {
            await first.initialize();
            const entitlement = await claimableEntitlement(first);
            const claim = {
                entitlementId: entitlement.id,
                walletAddress: WALLET,
                claimNonceDigest: digest('claim-nonce'),
                idempotencyKey: 'idempotency_postgres_01',
                requestDigest: digest('canonical-request'),
                now: NOW
            };
            const claimed = await Promise.all([first.claim(claim), second.claim(claim)]);
            assert.equal(claimed[0].state, 'queued');
            assert.equal(claimed[1].state, 'queued');
            await assert.rejects(
                first.claim({ ...claim, requestDigest: digest('conflicting-request') }),
                rewardError('conflict')
            );
            await assert.rejects(
                second.claim({ ...claim, idempotencyKey: 'idempotency_postgres_02' }),
                rewardError('invalid_state')
            );

            const client = await connectedClient(databaseUrl);
            try {
                const counts = await client.query<{ claims: string; queue_events: string }>(
                    `SELECT
                        (SELECT COUNT(*)::text FROM reward_claims) AS claims,
                        (SELECT COUNT(*)::text FROM reward_events
                          WHERE entitlement_id = $1 AND next_state = 'queued') AS queue_events`,
                    [entitlement.id]
                );
                assert.deepEqual(counts.rows[0], { claims: '1', queue_events: '1' });
            } finally {
                await client.end();
            }
        } finally {
            await Promise.allSettled([first.close(), second.close()]);
        }
    });
});

test('the PostgreSQL advisory signer lease admits one logical worker', async () => {
    await withDatabase('lease', async (databaseUrl) => {
        const first = new PostgresRewardStore(databaseUrl, 2);
        const second = new PostgresRewardStore(databaseUrl, 2);
        try {
            await first.initialize();
            let releaseLease!: () => void;
            let enteredLease!: () => void;
            const release = new Promise<void>((resolve) => { releaseLease = resolve; });
            const entered = new Promise<void>((resolve) => { enteredLease = resolve; });
            const owner = first.withPayoutLease(async () => {
                enteredLease();
                await release;
                return 'owner';
            });
            await entered;
            const contender = await second.withPayoutLease(async () => 'contender');
            assert.equal(contender, undefined);
            releaseLease();
            assert.equal(await owner, 'owner');
        } finally {
            await Promise.allSettled([first.close(), second.close()]);
        }
    });
});

test('restart recovery preserves consumed attempts and reconciles stored payout bytes', async () => {
    await withDatabase('restart', async (databaseUrl) => {
        const initial = new PostgresRewardStore(databaseUrl, 3);
        await initial.initialize();
        const inProgressInput = reservation(
            'entitlement_restart_01',
            'reward_challenge_restart_01',
            WALLET
        );
        await initial.reserve(inProgressInput);
        await initial.close();

        const startedStore = new PostgresRewardStore(databaseUrl, 3);
        await startedStore.initialize();
        assert.equal(
            (await startedStore.status(inProgressInput.id, WALLET))?.state,
            'reserved'
        );
        await startedStore.start(
            inProgressInput.challengeId,
            WALLET,
            inProgressInput.eligibilityTokenDigest,
            NOW
        );
        await startedStore.close();

        const recovered = new PostgresRewardStore(databaseUrl, 3);
        await recovered.initialize();
        assert.equal(
            await recovered.forfeitInProgressOnStartup(new Date(NOW.getTime() + 1)),
            1
        );
        assert.equal((await recovered.status(inProgressInput.id, WALLET))?.state, 'forfeited');
        await assert.rejects(
            recovered.reserve(reservation(
                'entitlement_restart_02',
                'reward_challenge_restart_02',
                WALLET
            )),
            rewardError('ineligible')
        );

        const claimable = await claimableEntitlement(
            recovered,
            reservation(
                'entitlement_payout_01',
                'reward_challenge_payout_01',
                OTHER_WALLET,
                NEXT_DAY
            )
        );
        await recovered.close();

        const claimStore = new PostgresRewardStore(databaseUrl, 3);
        await claimStore.initialize();
        assert.equal(
            (await claimStore.status(claimable.id, OTHER_WALLET))?.state,
            'claimable'
        );
        await claimStore.claim({
            entitlementId: claimable.id,
            walletAddress: OTHER_WALLET,
            claimNonceDigest: digest('claim-nonce'),
            idempotencyKey: 'idempotency_payout_01',
            requestDigest: digest('payout-request'),
            now: NOW
        });
        await claimStore.close();

        const signedStore = new PostgresRewardStore(databaseUrl, 3);
        await signedStore.initialize();
        assert.equal(
            (await signedStore.status(claimable.id, OTHER_WALLET))?.state,
            'queued'
        );
        await signedStore.markSigned({
            entitlementId: claimable.id,
            serializedTransaction: 'cafe',
            transactionHash: 'a'.repeat(64),
            validityStartHeight: 10,
            now: NOW
        });
        await signedStore.close();

        const ambiguousStore = new PostgresRewardStore(databaseUrl, 3);
        await ambiguousStore.initialize();
        assert.equal(
            (await ambiguousStore.status(claimable.id, OTHER_WALLET))?.state,
            'signed'
        );
        const firstAdapter = new DurableFakeAdapter();
        const firstWorker = new RewardPayoutWorker(ambiguousStore, firstAdapter, config());
        await firstWorker.runOnce();
        const ambiguous = await ambiguousStore.status(claimable.id, OTHER_WALLET);
        assert.equal(ambiguous?.state, 'broadcast_unknown');
        assert.equal(ambiguous?.signedTransaction, 'cafe');
        assert.equal(firstAdapter.prepareCalls, 0);
        assert.equal(new Set(firstAdapter.broadcasts).size, 1);
        await firstWorker.close();
        await ambiguousStore.close();

        const includedStore = new PostgresRewardStore(databaseUrl, 3);
        await includedStore.initialize();
        const includedAdapter = new DurableFakeAdapter();
        includedAdapter.chainStatus = {
            state: 'included',
            headHeight: 120,
            includedHeight: 60,
            finalized: false
        };
        const includedWorker = new RewardPayoutWorker(
            includedStore,
            includedAdapter,
            config()
        );
        await includedWorker.runOnce();
        assert.equal(
            (await includedStore.status(claimable.id, OTHER_WALLET))?.state,
            'included'
        );
        assert.equal(includedAdapter.prepareCalls, 0);
        assert.equal(includedAdapter.broadcasts.length, 0);
        await includedWorker.close();
        await includedStore.close();

        const finalStore = new PostgresRewardStore(databaseUrl, 3);
        await finalStore.initialize();
        assert.equal(
            (await finalStore.status(claimable.id, OTHER_WALLET))?.state,
            'included'
        );
        const finalAdapter = new DurableFakeAdapter();
        finalAdapter.chainStatus = {
            state: 'included',
            headHeight: 130,
            includedHeight: 60,
            finalized: true
        };
        const finalWorker = new RewardPayoutWorker(finalStore, finalAdapter, config());
        await finalWorker.runOnce();
        const finalized = await finalStore.status(claimable.id, OTHER_WALLET);
        assert.equal(finalized?.state, 'finalized');
        assert.equal(finalized?.signedTransaction, 'cafe');
        assert.equal(finalized?.transactionHash, 'a'.repeat(64));
        assert.equal(finalAdapter.prepareCalls, 0);
        assert.equal(finalAdapter.broadcasts.length, 0);
        await finalWorker.close();
        await finalStore.close();
    });
});

class DurableFakeAdapter implements RewardPayoutAdapter {
    public prepareCalls = 0;
    public broadcasts: string[] = [];
    public chainStatus: ChainTransactionStatus = { state: 'absent', headHeight: 50 };

    public async prepare(_entitlement: RewardEntitlement) {
        this.prepareCalls += 1;
        return {
            serializedTransaction: 'cafe',
            transactionHash: 'a'.repeat(64),
            validityStartHeight: 10
        };
    }

    public async broadcast(serializedTransaction: string): Promise<void> {
        this.broadcasts.push(serializedTransaction);
        throw new Error('synthetic ambiguous broadcast');
    }

    public async status(_transactionHash: string): Promise<ChainTransactionStatus> {
        return this.chainStatus;
    }

    public validityWindowBlocks(): number {
        return 100;
    }
}

async function claimableEntitlement(
    store: PostgresRewardStore,
    input = reservation(
        'entitlement_claim_01',
        'reward_challenge_claim_01',
        WALLET
    )
): Promise<RewardEntitlement> {
    await store.reserve(input);
    await store.start(
        input.challengeId,
        input.walletAddress,
        input.eligibilityTokenDigest,
        NOW
    );
    return store.completeMatch({
        challengeId: input.challengeId,
        outcome: 'player_win',
        finalTick: 42,
        finalStateHash: 'b'.repeat(64),
        replay: {
            challengeId: input.challengeId,
            sessionId: 'reward_session_postgres_01',
            seed: input.seed,
            calling: input.calling
        } as unknown as CoordinatorReplay,
        claimNonceDigest: digest('claim-nonce'),
        claimNonceExpiresAt: new Date(NOW.getTime() + 60_000),
        now: NOW
    });
}

function reservation(
    id: string,
    challengeId: string,
    walletAddress: string,
    challengeDay = DAY,
    overrides: Partial<RewardReservationInput> = {}
): RewardReservationInput {
    return {
        id,
        challengeId,
        challengeDay,
        walletAddress,
        calling: 'wizard',
        seed: 7,
        rewardLuna: 100_000n,
        dailyBudgetLuna: 100_000n,
        dailyAttemptLimit: 1,
        paused: false,
        eligibilityTokenDigest: digest(`${id}-eligibility`),
        reservationExpiresAt: new Date(NOW.getTime() + 60_000),
        now: NOW,
        ...overrides
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

function rewardError(code: RewardStoreError['code']) {
    return (error: unknown) => error instanceof RewardStoreError && error.code === code;
}

function digest(value: string): string {
    return createHash('sha256').update(value).digest('base64url');
}

function syntheticWalletAddress(projectName: string): string {
    const signer = createTestSigner(privateKeyForProject(projectName));
    try {
        return signer.address;
    } finally {
        signer.dispose();
    }
}

async function withDatabase(
    purpose: string,
    operation: (databaseUrl: string) => Promise<void>
): Promise<void> {
    databaseSequence += 1;
    const databaseName = `nimble_knots_wp014_${purpose}_${process.pid}_${databaseSequence}`;
    const admin = await connectedClient(ADMIN_URL);
    try {
        await admin.query(`CREATE DATABASE ${quotedIdentifier(databaseName)}`);
        const databaseUrl = databaseUrlFor(ADMIN_URL, databaseName);
        try {
            await operation(databaseUrl);
        } finally {
            await admin.query(
                `SELECT pg_terminate_backend(pid)
                   FROM pg_stat_activity
                  WHERE datname = $1 AND pid <> pg_backend_pid()`,
                [databaseName]
            );
            await admin.query(`DROP DATABASE IF EXISTS ${quotedIdentifier(databaseName)}`);
        }
    } finally {
        await admin.end();
    }
}

async function connectedClient(connectionString: string): Promise<Client> {
    const client = new Client({
        connectionString,
        application_name: 'nimble-knots-wp014d-tests'
    });
    await client.connect();
    return client;
}

function databaseUrlFor(adminUrl: string, databaseName: string): string {
    const url = new URL(adminUrl);
    url.pathname = `/${databaseName}`;
    return url.toString();
}

function quotedIdentifier(value: string): string {
    if (!/^nimble_knots_wp014_[a-z0-9_]+$/.test(value)) {
        throw new Error('Generated PostgreSQL database name is unsafe.');
    }
    return `"${value}"`;
}

function requiredAdminUrl(): string {
    const value = process.env.WP014_TEST_DATABASE_URL?.trim();
    if (!value) {
        throw new Error(
            'WP014_TEST_DATABASE_URL is required; run this suite only against a disposable loopback PostgreSQL service.'
        );
    }
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
        !['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
        throw new Error('WP014_TEST_DATABASE_URL must target disposable loopback PostgreSQL.');
    }
    return value;
}
