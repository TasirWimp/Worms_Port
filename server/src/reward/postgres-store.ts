import { readFile } from 'fs/promises';
import path from 'path';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';

import type { RewardInfoData, RewardPayoutState } from '../../../shared/protocol';
import {
    RewardStoreError,
    type RewardClaimInput,
    type RewardConfig,
    type RewardEntitlement,
    type RewardMatchEvidence,
    type RewardReservationInput,
    type RewardStore,
    type SignedPayout
} from './types';

const SERIALIZATION_FAILURE = '40001';
const UNIQUE_VIOLATION = '23505';
const MAX_DAILY_RESERVATIONS_PER_WALLET = 5;

type EntitlementRow = QueryResultRow & {
    id: string;
    challenge_id: string;
    challenge_day: string | Date;
    wallet_address: string;
    calling: RewardEntitlement['calling'];
    seed: string;
    reward_luna: string;
    state: RewardPayoutState;
    attempt_consumed: boolean;
    attempt_number: number;
    daily_attempt_limit: number;
    reservation_expires_at: Date;
    final_tick: string | null;
    final_state_hash: string | null;
    replay: RewardEntitlement['replay'] | null;
    signed_transaction: string | null;
    transaction_hash: string | null;
    validity_start_height: string | null;
    included_height: string | null;
    finalized_at: Date | null;
    reason_code: string | null;
};

export class PostgresRewardStore implements RewardStore {
    private readonly pool: Pool;

    public constructor(connectionString: string, maximumConnections = 5) {
        if (!connectionString.trim()) {
            throw new Error('A non-empty PostgreSQL connection string is required.');
        }
        this.pool = new Pool({
            connectionString,
            max: maximumConnections,
            application_name: 'nimble-knots-rewards'
        });
    }

    public async initialize(): Promise<void> {
        const client = await this.pool.connect();
        try {
            await client.query('SELECT pg_advisory_lock(1313, 0)');
            try {
                for (const migration of await readRewardMigrations()) {
                    await client.query(migration);
                }
            } finally {
                await client.query('SELECT pg_advisory_unlock(1313, 0)');
            }
        } finally {
            client.release();
        }
    }

    public async close(): Promise<void> {
        await this.pool.end();
    }

    public async forfeitInProgressOnStartup(now: Date): Promise<number> {
        return this.serializable(async (client) => {
            const selected = await client.query<EntitlementRow>(
                `SELECT * FROM reward_entitlements
                  WHERE state = 'in_progress'
                  FOR UPDATE`
            );
            for (const row of selected.rows) {
                const updated = await client.query(
                    `UPDATE reward_entitlements
                        SET state = 'forfeited', updated_at = $2
                      WHERE id = $1 AND state = 'in_progress'`,
                    [row.id, now]
                );
                if (!updated.rowCount) continue;
                await client.query(
                    `UPDATE reward_days
                        SET committed_luna = committed_luna - $2, updated_at = $3
                      WHERE challenge_day = $1`,
                    [dayString(row.challenge_day), row.reward_luna, now]
                );
                await appendEvent(
                    client,
                    row.id,
                    'in_progress',
                    'forfeited',
                    'process_restart',
                    now
                );
            }
            return selected.rows.length;
        });
    }

    public async withPayoutLease<T>(operation: () => Promise<T>): Promise<T | undefined> {
        const client = await this.pool.connect();
        try {
            const locked = await client.query<{ acquired: boolean }>(
                'SELECT pg_try_advisory_lock(1313, 1) AS acquired'
            );
            if (!locked.rows[0]?.acquired) return undefined;
            try {
                return await operation();
            } finally {
                await client.query('SELECT pg_advisory_unlock(1313, 1)');
            }
        } finally {
            client.release();
        }
    }

    public async info(day: string, config: RewardConfig): Promise<RewardInfoData> {
        const row = await this.ensureDay(this.pool, day, config);
        const committed = BigInt(row.committed_luna);
        return {
            status: config.mode === 'disabled'
                ? 'disabled'
                : row.paused
                    ? 'paused'
                    : committed + config.rewardLuna > config.dailyBudgetLuna
                        ? 'exhausted'
                        : 'available',
            challengeDay: day,
            rewardLuna: config.rewardLuna.toString(),
            reservationSeconds: Math.floor(config.reservationTtlMs / 1000),
            turnLimit: config.turnLimit
        };
    }

    public async reserve(input: RewardReservationInput): Promise<RewardEntitlement> {
        return this.serializable(async (client) => {
            const dailyAttemptLimit = input.dailyAttemptLimit ?? 1;
            await this.expireReservationsInTransaction(client, input.now);
            const day = await this.ensureDay(client, input.challengeDay, {
                mode: 'record-only',
                rewardLuna: input.rewardLuna,
                feeLuna: 0n,
                dailyBudgetLuna: input.dailyBudgetLuna,
                reservationTtlMs: 1,
                claimTtlMs: 1,
                turnLimit: 1,
                paused: input.paused,
                network: 'test-albatross',
                testDailyAttemptLimit: 1
            });
            const locked = await client.query<{
                committed_luna: string;
                daily_budget_luna: string;
                paused: boolean;
            }>(
                `SELECT committed_luna, daily_budget_luna, paused
                   FROM reward_days
                  WHERE challenge_day = $1
                  FOR UPDATE`,
                [input.challengeDay]
            );
            const budget = locked.rows[0];
            if (!budget || budget.paused || day.paused) {
                throw new RewardStoreError('paused', 'Sponsor rewards are paused.');
            }
            const consumed = await client.query<{ count: string }>(
                `SELECT COUNT(*)::text AS count FROM reward_entitlements
                  WHERE challenge_day = $1 AND wallet_address = $2
                    AND attempt_consumed`,
                [input.challengeDay, input.walletAddress]
            );
            const consumedAttempts = Number(consumed.rows[0]?.count ?? 0);
            if (consumedAttempts >= dailyAttemptLimit) {
                throw new RewardStoreError(
                    'ineligible',
                    'This wallet already used today’s rewarded attempt.'
                );
            }
            const inProgress = await client.query(
                `SELECT 1 FROM reward_entitlements
                  WHERE challenge_day = $1 AND wallet_address = $2
                    AND state = 'in_progress'
                  LIMIT 1`,
                [input.challengeDay, input.walletAddress]
            );
            if (inProgress.rowCount) {
                throw new RewardStoreError(
                    'conflict',
                    'A rewarded challenge is already in progress for this wallet.'
                );
            }
            const reservationCount = await client.query<{ count: string }>(
                `SELECT COUNT(*)::text AS count
                   FROM reward_entitlements
                  WHERE challenge_day = $1 AND wallet_address = $2`,
                [input.challengeDay, input.walletAddress]
            );
            if (Number(reservationCount.rows[0]?.count ?? 0) >=
                MAX_DAILY_RESERVATIONS_PER_WALLET) {
                throw new RewardStoreError(
                    'ineligible',
                    'This wallet reached today\'s reservation-attempt limit.'
                );
            }
            const committed = BigInt(budget.committed_luna);
            if (committed + input.rewardLuna > BigInt(budget.daily_budget_luna)) {
                throw new RewardStoreError('exhausted', 'Today’s Prize Loom is exhausted.');
            }
            try {
                const inserted = await client.query<EntitlementRow>(
                    `INSERT INTO reward_entitlements (
                        id, challenge_id, challenge_day, wallet_address, calling,
                        seed, reward_luna, state, attempt_number,
                        daily_attempt_limit, eligibility_token_digest,
                        reservation_expires_at, created_at, updated_at
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,'reserved',$8,$9,$10,$11,$12,$12)
                    RETURNING *`,
                    [
                        input.id,
                        input.challengeId,
                        input.challengeDay,
                        input.walletAddress,
                        input.calling,
                        input.seed,
                        input.rewardLuna.toString(),
                        consumedAttempts + 1,
                        dailyAttemptLimit,
                        input.eligibilityTokenDigest,
                        input.reservationExpiresAt,
                        input.now
                    ]
                );
                await client.query(
                    `UPDATE reward_days
                        SET committed_luna = committed_luna + $2, updated_at = $3
                      WHERE challenge_day = $1`,
                    [input.challengeDay, input.rewardLuna.toString(), input.now]
                );
                await appendEvent(client, input.id, null, 'reserved', null, input.now);
                return entitlementFromRow(inserted.rows[0]);
            } catch (error) {
                if (databaseCode(error) === UNIQUE_VIOLATION) {
                    throw new RewardStoreError(
                        'conflict',
                        'An active reward reservation already exists for this wallet.'
                    );
                }
                throw error;
            }
        });
    }

    public async start(
        challengeId: string,
        walletAddress: string,
        eligibilityTokenDigest: string,
        now: Date
    ): Promise<RewardEntitlement> {
        return this.serializable(async (client) => {
            const result = await client.query<EntitlementRow & {
                eligibility_token_digest: string | null;
            }>(
                `SELECT * FROM reward_entitlements WHERE challenge_id = $1 FOR UPDATE`,
                [challengeId]
            );
            const row = result.rows[0];
            if (!row || row.wallet_address !== walletAddress ||
                row.eligibility_token_digest !== eligibilityTokenDigest) {
                throw new RewardStoreError('ineligible', 'The reward reservation is invalid.');
            }
            if (row.state === 'in_progress') return entitlementFromRow(row);
            if (row.state !== 'reserved') {
                throw new RewardStoreError('invalid_state', 'The reward reservation is closed.');
            }
            if (row.reservation_expires_at.getTime() <= now.getTime()) {
                await this.releaseReservation(client, row, 'expired', now);
                throw new RewardStoreError('expired', 'The reward reservation expired.');
            }
            const consumed = await client.query<{ count: string }>(
                `SELECT COUNT(*)::text AS count FROM reward_entitlements
                  WHERE challenge_day = $1 AND wallet_address = $2
                    AND attempt_consumed AND id <> $3`,
                [dayString(row.challenge_day), row.wallet_address, row.id]
            );
            if (Number(consumed.rows[0]?.count ?? 0) >= row.daily_attempt_limit) {
                throw new RewardStoreError(
                    'ineligible',
                    'This wallet already used today’s rewarded attempt.'
                );
            }
            try {
                const updated = await client.query<EntitlementRow>(
                    `UPDATE reward_entitlements
                        SET state = 'in_progress', attempt_consumed = true,
                            eligibility_token_digest = NULL, updated_at = $2
                      WHERE id = $1 AND state = 'reserved'
                    RETURNING *`,
                    [row.id, now]
                );
                if (!updated.rows[0]) {
                    throw new RewardStoreError('conflict', 'The reward reservation changed.');
                }
                await appendEvent(client, row.id, 'reserved', 'in_progress', null, now);
                return entitlementFromRow(updated.rows[0]);
            } catch (error) {
                if (databaseCode(error) === UNIQUE_VIOLATION) {
                    throw new RewardStoreError(
                        'ineligible',
                        'This wallet already used today’s rewarded attempt.'
                    );
                }
                throw error;
            }
        });
    }

    public async cancelReserved(
        challengeId: string,
        walletAddress: string,
        now: Date
    ): Promise<void> {
        await this.serializable(async (client) => {
            const result = await client.query<EntitlementRow>(
                `SELECT * FROM reward_entitlements WHERE challenge_id = $1 FOR UPDATE`,
                [challengeId]
            );
            const row = result.rows[0];
            if (!row || row.wallet_address !== walletAddress || row.state !== 'reserved') return;
            await this.releaseReservation(client, row, 'cancelled', now);
        });
    }

    public async expireReservations(now: Date): Promise<number> {
        return this.serializable((client) => this.expireReservationsInTransaction(client, now));
    }

    public async completeMatch(input: RewardMatchEvidence): Promise<RewardEntitlement> {
        return this.serializable(async (client) => {
            const selected = await client.query<EntitlementRow>(
                `SELECT * FROM reward_entitlements WHERE challenge_id = $1 FOR UPDATE`,
                [input.challengeId]
            );
            const row = selected.rows[0];
            if (!row) throw new RewardStoreError('not_found', 'Reward entitlement not found.');
            if (row.state !== 'in_progress') {
                if (['lost', 'forfeited', 'expired', 'claimable', 'queued', 'signed',
                    'broadcast_unknown', 'included', 'finalized', 'manual_review'].includes(row.state)) {
                    return entitlementFromRow(row);
                }
                throw new RewardStoreError('invalid_state', 'Reward match is not in progress.');
            }
            if (input.replay && (
                input.replay.challengeId !== row.challenge_id ||
                input.replay.seed !== Number(row.seed) ||
                input.replay.calling !== row.calling
            )) {
                throw new RewardStoreError(
                    'conflict',
                    'Reward replay does not match the reserved challenge policy.'
                );
            }
            const nextState: RewardPayoutState = input.outcome === 'player_win'
                ? 'claimable'
                : input.outcome === 'left'
                    ? 'forfeited'
                    : input.outcome === 'expired'
                        ? 'expired'
                        : 'lost';
            const updated = await client.query<EntitlementRow>(
                `UPDATE reward_entitlements
                    SET state = $2, final_tick = $3, final_state_hash = $4,
                        replay = $5::jsonb, claim_nonce_digest = $6,
                        claim_nonce_expires_at = $7, updated_at = $8
                  WHERE id = $1 AND state = 'in_progress'
                RETURNING *`,
                [
                    row.id,
                    nextState,
                    input.finalTick,
                    input.finalStateHash,
                    input.replay ? JSON.stringify(input.replay) : null,
                    nextState === 'claimable' ? input.claimNonceDigest : null,
                    nextState === 'claimable' ? input.claimNonceExpiresAt : null,
                    input.now
                ]
            );
            await appendEvent(client, row.id, 'in_progress', nextState, null, input.now);
            if (nextState !== 'claimable') {
                await client.query(
                    `UPDATE reward_days
                        SET committed_luna = committed_luna - $2, updated_at = $3
                      WHERE challenge_day = $1`,
                    [dayString(row.challenge_day), row.reward_luna, input.now]
                );
            }
            return entitlementFromRow(updated.rows[0]);
        });
    }

    public async rotateClaimNonce(
        entitlementId: string,
        walletAddress: string,
        nonceDigest: string,
        expiresAt: Date,
        now: Date
    ): Promise<RewardEntitlement> {
        const updated = await this.pool.query<EntitlementRow>(
            `UPDATE reward_entitlements
                SET claim_nonce_digest = $3, claim_nonce_expires_at = $4, updated_at = $5
              WHERE id = $1 AND wallet_address = $2 AND state = 'claimable'
            RETURNING *`,
            [entitlementId, walletAddress, nonceDigest, expiresAt, now]
        );
        if (!updated.rows[0]) {
            throw new RewardStoreError('invalid_state', 'The reward is not claimable.');
        }
        return entitlementFromRow(updated.rows[0]);
    }

    public async claim(input: RewardClaimInput): Promise<RewardEntitlement> {
        return this.serializable(async (client) => {
            const previous = await client.query<{
                entitlement_id: string;
                request_digest: string;
            }>(
                `SELECT entitlement_id, request_digest
                   FROM reward_claims WHERE idempotency_key = $1`,
                [input.idempotencyKey]
            );
            if (previous.rows[0]) {
                if (previous.rows[0].request_digest !== input.requestDigest ||
                    previous.rows[0].entitlement_id !== input.entitlementId) {
                    throw new RewardStoreError(
                        'conflict',
                        'The idempotency key was already used for different claim data.'
                    );
                }
                return this.entitlementById(client, input.entitlementId);
            }
            const selected = await client.query<EntitlementRow & {
                claim_nonce_digest: string | null;
                claim_nonce_expires_at: Date | null;
            }>(
                `SELECT * FROM reward_entitlements WHERE id = $1 FOR UPDATE`,
                [input.entitlementId]
            );
            const row = selected.rows[0];
            if (!row || row.wallet_address !== input.walletAddress) {
                throw new RewardStoreError('not_found', 'Reward entitlement not found.');
            }
            if (row.state !== 'claimable') {
                throw new RewardStoreError('invalid_state', 'The reward is not claimable.');
            }
            if (!row.claim_nonce_digest ||
                row.claim_nonce_digest !== input.claimNonceDigest ||
                !row.claim_nonce_expires_at ||
                row.claim_nonce_expires_at.getTime() <= input.now.getTime()) {
                throw new RewardStoreError('expired', 'The claim authorization expired.');
            }
            try {
                await client.query(
                    `INSERT INTO reward_claims (
                        idempotency_key, entitlement_id, request_digest, created_at
                    ) VALUES ($1,$2,$3,$4)`,
                    [
                        input.idempotencyKey,
                        input.entitlementId,
                        input.requestDigest,
                        input.now
                    ]
                );
            } catch (error) {
                if (databaseCode(error) === UNIQUE_VIOLATION) {
                    throw new RewardStoreError('conflict', 'This reward already has a claim.');
                }
                throw error;
            }
            const updated = await client.query<EntitlementRow>(
                `UPDATE reward_entitlements
                    SET state = 'queued', claim_nonce_digest = NULL,
                        claim_nonce_expires_at = NULL, updated_at = $2
                  WHERE id = $1 AND state = 'claimable'
                RETURNING *`,
                [input.entitlementId, input.now]
            );
            await appendEvent(
                client,
                input.entitlementId,
                'claimable',
                'queued',
                null,
                input.now
            );
            return entitlementFromRow(updated.rows[0]);
        });
    }

    public async status(
        entitlementId: string,
        walletAddress: string
    ): Promise<RewardEntitlement | undefined> {
        const selected = await this.pool.query<EntitlementRow>(
            `SELECT * FROM reward_entitlements WHERE id = $1 AND wallet_address = $2`,
            [entitlementId, walletAddress]
        );
        return selected.rows[0] ? entitlementFromRow(selected.rows[0]) : undefined;
    }

    public async recoverable(
        walletAddress: string,
        challengeDay: string
    ): Promise<RewardEntitlement | undefined> {
        const selected = await this.pool.query<EntitlementRow>(
            `SELECT * FROM reward_entitlements
              WHERE wallet_address = $1 AND challenge_day = $2
                AND (
                    attempt_consumed OR state IN (
                        'claimable', 'queued', 'signed', 'broadcast_unknown',
                        'included', 'finalized', 'manual_review'
                    )
                )
              ORDER BY updated_at DESC, id DESC
              LIMIT 1`,
            [walletAddress, challengeDay]
        );
        return selected.rows[0] ? entitlementFromRow(selected.rows[0]) : undefined;
    }

    public async listQueued(limit: number): Promise<RewardEntitlement[]> {
        const selected = await this.pool.query<EntitlementRow>(
            `SELECT * FROM reward_entitlements
              WHERE state = 'queued'
              ORDER BY updated_at, id
              LIMIT $1`,
            [limit]
        );
        return selected.rows.map(entitlementFromRow);
    }

    public async listReconcilable(limit: number): Promise<RewardEntitlement[]> {
        const selected = await this.pool.query<EntitlementRow>(
            `SELECT * FROM reward_entitlements
              WHERE state IN ('signed', 'broadcast_unknown', 'included')
              ORDER BY updated_at, id
              LIMIT $1`,
            [limit]
        );
        return selected.rows.map(entitlementFromRow);
    }

    public async markSigned(input: SignedPayout): Promise<RewardEntitlement> {
        return this.transition(
            input.entitlementId,
            ['queued'],
            'signed',
            input.now,
            `signed_transaction = $4, transaction_hash = $5,
             validity_start_height = $6`,
            [
                input.serializedTransaction,
                input.transactionHash,
                input.validityStartHeight
            ]
        );
    }

    public async markBroadcastUnknown(
        entitlementId: string,
        now: Date
    ): Promise<RewardEntitlement> {
        return this.transition(entitlementId, ['signed'], 'broadcast_unknown', now);
    }

    public async markIncluded(
        entitlementId: string,
        transactionHash: string,
        includedHeight: number,
        now: Date
    ): Promise<RewardEntitlement> {
        return this.transition(
            entitlementId,
            ['signed', 'broadcast_unknown'],
            'included',
            now,
            'transaction_hash = $4, included_height = $5',
            [transactionHash, includedHeight]
        );
    }

    public async markFinalized(
        entitlementId: string,
        now: Date
    ): Promise<RewardEntitlement> {
        return this.serializable(async (client) => {
            const row = await this.transitionWithClient(
                client,
                entitlementId,
                ['included'],
                'finalized',
                now,
                'finalized_at = $4',
                [now]
            );
            await client.query(
                `UPDATE reward_days
                    SET paid_luna = paid_luna + $2, updated_at = $3
                  WHERE challenge_day = $1`,
                [row.challengeDay, row.rewardLuna.toString(), now]
            );
            return row;
        });
    }

    public async markManualReview(
        entitlementId: string,
        reasonCode: string,
        now: Date
    ): Promise<RewardEntitlement> {
        if (!/^[a-z0-9_-]{1,64}$/.test(reasonCode)) {
            throw new Error('Manual-review reason code is invalid.');
        }
        return this.transition(
            entitlementId,
            ['queued', 'signed', 'broadcast_unknown'],
            'manual_review',
            now,
            'reason_code = $4',
            [reasonCode],
            reasonCode
        );
    }

    private async transition(
        entitlementId: string,
        previous: RewardPayoutState[],
        next: RewardPayoutState,
        now: Date,
        assignment?: string,
        values: unknown[] = [],
        reasonCode?: string
    ): Promise<RewardEntitlement> {
        return this.serializable((client) => this.transitionWithClient(
            client,
            entitlementId,
            previous,
            next,
            now,
            assignment,
            values,
            reasonCode
        ));
    }

    private async transitionWithClient(
        client: PoolClient,
        entitlementId: string,
        previous: RewardPayoutState[],
        next: RewardPayoutState,
        now: Date,
        assignment?: string,
        values: unknown[] = [],
        reasonCode?: string
    ): Promise<RewardEntitlement> {
        const selected = await client.query<Pick<EntitlementRow, 'state'>>(
            'SELECT state FROM reward_entitlements WHERE id = $1 FOR UPDATE',
            [entitlementId]
        );
        const actualPrevious = selected.rows[0]?.state;
        if (!actualPrevious) {
            throw new RewardStoreError('not_found', 'Reward entitlement not found.');
        }
        if (actualPrevious === next) {
            return this.entitlementById(client, entitlementId);
        }
        if (!previous.includes(actualPrevious)) {
            throw new RewardStoreError(
                'invalid_state',
                `Cannot move reward from ${actualPrevious} to ${next}.`
            );
        }
        const assignments = assignment ? `, ${assignment}` : '';
        const updated = await client.query<EntitlementRow>(
            `UPDATE reward_entitlements
                SET state = $2, updated_at = $3${assignments}
              WHERE id = $1 AND state = ANY($${values.length + 4}::text[])
            RETURNING *`,
            [entitlementId, next, now, ...values, previous]
        );
        if (!updated.rows[0]) {
            throw new RewardStoreError('conflict', 'The reward state changed concurrently.');
        }
        await appendEvent(
            client,
            entitlementId,
            actualPrevious,
            next,
            reasonCode ?? null,
            now
        );
        return entitlementFromRow(updated.rows[0]);
    }

    private async entitlementById(
        client: PoolClient,
        entitlementId: string
    ): Promise<RewardEntitlement> {
        const selected = await client.query<EntitlementRow>(
            `SELECT * FROM reward_entitlements WHERE id = $1`,
            [entitlementId]
        );
        if (!selected.rows[0]) {
            throw new RewardStoreError('not_found', 'Reward entitlement not found.');
        }
        return entitlementFromRow(selected.rows[0]);
    }

    private async expireReservationsInTransaction(
        client: PoolClient,
        now: Date
    ): Promise<number> {
        const selected = await client.query<EntitlementRow>(
            `SELECT * FROM reward_entitlements
              WHERE state = 'reserved' AND reservation_expires_at <= $1
              FOR UPDATE`,
            [now]
        );
        for (const row of selected.rows) {
            await this.releaseReservation(client, row, 'expired', now);
        }
        return selected.rows.length;
    }

    private async releaseReservation(
        client: PoolClient,
        row: EntitlementRow,
        next: 'expired' | 'cancelled',
        now: Date
    ): Promise<void> {
        const updated = await client.query(
            `UPDATE reward_entitlements
                SET state = $2, eligibility_token_digest = NULL, updated_at = $3
              WHERE id = $1 AND state = 'reserved'`,
            [row.id, next, now]
        );
        if (!updated.rowCount) return;
        await client.query(
            `UPDATE reward_days
                SET committed_luna = committed_luna - $2, updated_at = $3
              WHERE challenge_day = $1`,
            [dayString(row.challenge_day), row.reward_luna, now]
        );
        await appendEvent(client, row.id, 'reserved', next, null, now);
    }

    private async ensureDay(
        executor: Pick<Pool, 'query'> | PoolClient,
        day: string,
        config: RewardConfig
    ): Promise<{
        committed_luna: string;
        daily_budget_luna: string;
        paused: boolean;
    }> {
        const result = await executor.query<{
            committed_luna: string;
            daily_budget_luna: string;
            paused: boolean;
            reward_luna: string;
        }>(
            `INSERT INTO reward_days (
                challenge_day, reward_luna, daily_budget_luna, paused
             ) VALUES ($1,$2,$3,$4)
             ON CONFLICT (challenge_day) DO UPDATE
                 SET paused = EXCLUDED.paused, updated_at = now()
             RETURNING committed_luna, daily_budget_luna, paused, reward_luna`,
            [
                day,
                config.rewardLuna.toString(),
                config.dailyBudgetLuna.toString(),
                config.paused
            ]
        );
        const row = result.rows[0];
        if (BigInt(row.reward_luna) !== config.rewardLuna ||
            BigInt(row.daily_budget_luna) !== config.dailyBudgetLuna) {
            throw new RewardStoreError(
                'conflict',
                'Reward amount or daily budget changed after this challenge day opened.'
            );
        }
        return row;
    }

    private async serializable<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
        for (let attempt = 0; attempt < 4; attempt += 1) {
            const client = await this.pool.connect();
            try {
                await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
                const result = await operation(client);
                await client.query('COMMIT');
                return result;
            } catch (error) {
                await client.query('ROLLBACK').catch(() => undefined);
                if (databaseCode(error) === SERIALIZATION_FAILURE && attempt < 3) continue;
                throw error;
            } finally {
                client.release();
            }
        }
        throw new RewardStoreError('unavailable', 'Reward storage retry budget was exhausted.');
    }
}

async function appendEvent(
    client: PoolClient,
    entitlementId: string,
    previous: string | null,
    next: string,
    reasonCode: string | null,
    now: Date
): Promise<void> {
    await client.query(
        `INSERT INTO reward_events (
            entitlement_id, previous_state, next_state, reason_code, created_at
        ) VALUES ($1,$2,$3,$4,$5)`,
        [entitlementId, previous, next, reasonCode, now]
    );
}

function entitlementFromRow(row: EntitlementRow): RewardEntitlement {
    return {
        id: row.id,
        challengeId: row.challenge_id,
        challengeDay: dayString(row.challenge_day),
        walletAddress: row.wallet_address,
        calling: row.calling,
        seed: Number(row.seed),
        rewardLuna: BigInt(row.reward_luna),
        state: row.state,
        attemptConsumed: row.attempt_consumed,
        attemptNumber: row.attempt_number,
        dailyAttemptLimit: row.daily_attempt_limit,
        reservationExpiresAt: new Date(row.reservation_expires_at),
        ...(row.final_tick !== null ? { finalTick: Number(row.final_tick) } : {}),
        ...(row.final_state_hash ? { finalStateHash: row.final_state_hash } : {}),
        ...(row.replay ? { replay: row.replay } : {}),
        ...(row.signed_transaction ? { signedTransaction: row.signed_transaction } : {}),
        ...(row.transaction_hash ? { transactionHash: row.transaction_hash } : {}),
        ...(row.validity_start_height !== null
            ? { validityStartHeight: Number(row.validity_start_height) }
            : {}),
        ...(row.included_height !== null
            ? { includedHeight: Number(row.included_height) }
            : {}),
        ...(row.finalized_at ? { finalizedAt: new Date(row.finalized_at) } : {}),
        ...(row.reason_code ? { reasonCode: row.reason_code } : {})
    };
}

async function readRewardMigrations(): Promise<string[]> {
    const migrations: string[] = [];
    for (const filename of [
        '001_reward_ledger.sql',
        '002_reward_test_attempt_slots.sql'
    ]) {
        const candidates = [
            path.join(__dirname, '../migrations', filename),
            path.join(__dirname, '../../migrations', filename)
        ];
        let migration: string | undefined;
        for (const candidate of candidates) {
            try {
                migration = await readFile(candidate, 'utf8');
                break;
            } catch {
                // Try the source or built-server layout.
            }
        }
        if (!migration) {
            throw new Error(`Reward ledger migration ${filename} could not be located.`);
        }
        migrations.push(migration);
    }
    return migrations;
}

function dayString(value: string | Date): string {
    if (typeof value === 'string') return value.slice(0, 10);
    return value.toISOString().slice(0, 10);
}

function databaseCode(error: unknown): string | undefined {
    return error && typeof error === 'object' && 'code' in error
        ? String((error as { code: unknown }).code)
        : undefined;
}
