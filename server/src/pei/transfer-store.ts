import { Pool, type PoolClient, type QueryResultRow } from 'pg';

import { readPeiOperationsMigration } from './store';

export type PeiProxyTransferStateV0 = 'signed' | 'broadcast_unknown';

export type PeiProxyTransferV0 = {
    requestCommitment: string;
    signedTransaction: string;
    transactionHash: string;
    validityStartHeight: number;
    state: PeiProxyTransferStateV0;
};

export type PeiProxyIssuanceReservationV0 = {
    requestCommitment: string;
    walletAddress: string;
    issuanceDay: string;
    amountLuna: bigint;
    expiresAt: Date;
    dailyBudgetLuna: bigint;
    dailyWalletLimit: number;
};

type PeiProxyIssuanceV0 = Omit<
    PeiProxyIssuanceReservationV0,
    'dailyBudgetLuna' | 'dailyWalletLimit'
> & { state: 'reserved' | 'committed' };

export interface PeiProxyTransferOperationsV0 {
    get(commitment: string): Promise<PeiProxyTransferV0 | undefined>;
    reserveIssuance(reservation: PeiProxyIssuanceReservationV0, now: Date): Promise<void>;
    saveSigned(transfer: Omit<PeiProxyTransferV0, 'state'>, now: Date): Promise<PeiProxyTransferV0>;
    markBroadcastUnknown(commitment: string, now: Date): Promise<PeiProxyTransferV0>;
}

export interface PeiProxyTransferStoreV0 extends PeiProxyTransferOperationsV0 {
    initialize(): Promise<void>;
    withRequestLock<T>(
        commitment: string,
        operation: (locked: PeiProxyTransferOperationsV0) => Promise<T>
    ): Promise<T>;
    close(): Promise<void>;
}

export class MemoryPeiProxyTransferStoreV0 implements PeiProxyTransferStoreV0 {
    private readonly transfers = new Map<string, PeiProxyTransferV0>();
    private readonly issuances = new Map<string, PeiProxyIssuanceV0>();
    private readonly tails = new Map<string, Promise<void>>();

    public async initialize(): Promise<void> {}

    public async withRequestLock<T>(
        commitment: string,
        operation: (locked: PeiProxyTransferOperationsV0) => Promise<T>
    ): Promise<T> {
        const previous = this.tails.get(commitment) ?? Promise.resolve();
        let release!: () => void;
        const tail = new Promise<void>((resolve) => { release = resolve; });
        const queued = previous.then(() => tail);
        this.tails.set(commitment, queued);
        await previous;
        try {
            return await operation(this);
        } finally {
            release();
            if (this.tails.get(commitment) === queued) this.tails.delete(commitment);
        }
    }

    public async get(commitment: string): Promise<PeiProxyTransferV0 | undefined> {
        const transfer = this.transfers.get(commitment);
        return transfer ? structuredClone(transfer) : undefined;
    }

    public async reserveIssuance(
        reservation: PeiProxyIssuanceReservationV0,
        now: Date
    ): Promise<void> {
        assertReservation(reservation, now);
        const existing = this.issuances.get(reservation.requestCommitment);
        if (existing) {
            assertSameReservation(existing, reservation);
            return;
        }
        const active = [...this.issuances.values()].filter((issuance) =>
            issuance.issuanceDay === reservation.issuanceDay &&
            (issuance.state === 'committed' || issuance.expiresAt > now)
        );
        const spent = active.reduce((total, issuance) => total + issuance.amountLuna, 0n);
        if (active.filter((issuance) =>
            issuance.walletAddress === reservation.walletAddress
        ).length >= reservation.dailyWalletLimit) {
            throw new Error('This wallet has already received today\'s PEI helper transfer.');
        }
        if (spent + reservation.amountLuna > reservation.dailyBudgetLuna) {
            throw new Error('The PEI helper daily sponsor budget is exhausted.');
        }
        this.issuances.set(reservation.requestCommitment, {
            requestCommitment: reservation.requestCommitment,
            walletAddress: reservation.walletAddress,
            issuanceDay: reservation.issuanceDay,
            amountLuna: reservation.amountLuna,
            expiresAt: new Date(reservation.expiresAt),
            state: 'reserved'
        });
    }

    public async saveSigned(
        transfer: Omit<PeiProxyTransferV0, 'state'>,
        _now: Date
    ): Promise<PeiProxyTransferV0> {
        const existing = this.transfers.get(transfer.requestCommitment);
        if (existing) return structuredClone(existing);
        const issuance = this.issuances.get(transfer.requestCommitment);
        if (!issuance) throw new Error('The PEI helper issuance reservation is missing.');
        issuance.state = 'committed';
        const stored: PeiProxyTransferV0 = { ...structuredClone(transfer), state: 'signed' };
        this.transfers.set(transfer.requestCommitment, stored);
        return structuredClone(stored);
    }

    public async markBroadcastUnknown(
        commitment: string,
        _now: Date
    ): Promise<PeiProxyTransferV0> {
        const transfer = this.transfers.get(commitment);
        if (!transfer) throw new Error('The signed PEI transfer is missing.');
        transfer.state = 'broadcast_unknown';
        return structuredClone(transfer);
    }

    public async close(): Promise<void> {}
}

type TransferRow = QueryResultRow & {
    request_commitment: string;
    signed_transaction: string;
    transaction_hash: string;
    validity_start_height: string;
    state: PeiProxyTransferStateV0;
};

export class PostgresPeiProxyTransferStoreV0 implements PeiProxyTransferStoreV0 {
    private readonly pool: Pool;

    public constructor(connectionString: string) {
        if (!connectionString.trim()) throw new Error('PEI proxy storage requires DATABASE_URL.');
        this.pool = new Pool({
            connectionString,
            max: 3,
            application_name: 'nimble-knots-pei-proxy'
        });
        this.pool.on('error', () => console.error('PEI proxy database idle connection was lost.'));
    }

    public async initialize(): Promise<void> {
        await this.pool.query(await readPeiOperationsMigration());
    }

    public async withRequestLock<T>(
        commitment: string,
        operation: (locked: PeiProxyTransferOperationsV0) => Promise<T>
    ): Promise<T> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            try {
                await client.query(
                    'SELECT pg_advisory_xact_lock(hashtextextended($1, 22022))',
                    [commitment]
                );
                const result = await operation({
                    get: (value) => this.getUsing(client, value),
                    reserveIssuance: (reservation, now) =>
                        this.reserveIssuanceUsing(client, reservation, now),
                    saveSigned: (transfer, now) => this.saveSignedUsing(client, transfer, now),
                    markBroadcastUnknown: (value, now) =>
                        this.markBroadcastUnknownUsing(client, value, now)
                });
                await client.query('COMMIT');
                return result;
            } catch (error) {
                await client.query('ROLLBACK').catch(() => undefined);
                throw error;
            }
        } finally {
            client.release();
        }
    }

    public async get(commitment: string): Promise<PeiProxyTransferV0 | undefined> {
        return this.getUsing(this.pool, commitment);
    }

    public async reserveIssuance(
        reservation: PeiProxyIssuanceReservationV0,
        now: Date
    ): Promise<void> {
        await this.withRequestLock(reservation.requestCommitment, (locked) =>
            locked.reserveIssuance(reservation, now)
        );
    }

    private async reserveIssuanceUsing(
        database: PoolClient,
        reservation: PeiProxyIssuanceReservationV0,
        now: Date
    ): Promise<void> {
        assertReservation(reservation, now);
        await database.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 22023))',
            [`pei-helper-issuance:${reservation.issuanceDay}`]
        );
        const existing = await database.query<IssuanceRow>(
            'SELECT * FROM pei_proxy_issuances_v0 WHERE request_commitment = $1',
            [reservation.requestCommitment]
        );
        if (existing.rows[0]) {
            assertSameReservation(issuanceFromRow(existing.rows[0]), reservation);
            return;
        }
        const usage = await database.query<IssuanceUsageRow>(
            `SELECT COALESCE(SUM(amount_luna), 0)::text AS amount_luna,
                    COUNT(*) FILTER (WHERE wallet_address = $2)::text AS wallet_count
               FROM pei_proxy_issuances_v0
              WHERE issuance_day = $1::date
                AND (state = 'committed' OR expires_at > $3)`,
            [reservation.issuanceDay, reservation.walletAddress, now]
        );
        const spent = BigInt(usage.rows[0]?.amount_luna ?? '0');
        const walletCount = Number(usage.rows[0]?.wallet_count ?? '0');
        if (walletCount >= reservation.dailyWalletLimit) {
            throw new Error('This wallet has already received today\'s PEI helper transfer.');
        }
        if (spent + reservation.amountLuna > reservation.dailyBudgetLuna) {
            throw new Error('The PEI helper daily sponsor budget is exhausted.');
        }
        await database.query(
            `INSERT INTO pei_proxy_issuances_v0 (
                request_commitment, wallet_address, issuance_day, amount_luna,
                expires_at, state, created_at, updated_at
             ) VALUES ($1, $2, $3::date, $4, $5, 'reserved', $6, $6)`,
            [
                reservation.requestCommitment,
                reservation.walletAddress,
                reservation.issuanceDay,
                reservation.amountLuna.toString(),
                reservation.expiresAt,
                now
            ]
        );
    }

    private async getUsing(
        database: Pool | PoolClient,
        commitment: string
    ): Promise<PeiProxyTransferV0 | undefined> {
        const result = await database.query<TransferRow>(
            'SELECT * FROM pei_proxy_transfers_v0 WHERE request_commitment = $1',
            [commitment]
        );
        return result.rows[0] ? transferFromRow(result.rows[0]) : undefined;
    }

    public async saveSigned(
        transfer: Omit<PeiProxyTransferV0, 'state'>,
        now: Date
    ): Promise<PeiProxyTransferV0> {
        return this.saveSignedUsing(this.pool, transfer, now);
    }

    private async saveSignedUsing(
        database: Pool | PoolClient,
        transfer: Omit<PeiProxyTransferV0, 'state'>,
        now: Date
    ): Promise<PeiProxyTransferV0> {
        const result = await database.query<TransferRow>(
            `WITH committed_issuance AS (
                UPDATE pei_proxy_issuances_v0
                   SET state = 'committed', updated_at = $5
                 WHERE request_commitment = $1
                 RETURNING request_commitment
             )
             INSERT INTO pei_proxy_transfers_v0 (
                request_commitment, signed_transaction, transaction_hash,
                validity_start_height, state, created_at, updated_at
             ) SELECT $1, $2, $3, $4, 'signed', $5, $5
                 FROM committed_issuance
             ON CONFLICT (request_commitment) DO NOTHING
             RETURNING *`,
            [
                transfer.requestCommitment,
                transfer.signedTransaction,
                transfer.transactionHash,
                transfer.validityStartHeight,
                now
            ]
        );
        if (result.rows[0]) return transferFromRow(result.rows[0]);
        const existing = await this.getUsing(database, transfer.requestCommitment);
        if (!existing) throw new Error('The PEI helper issuance reservation is missing.');
        return existing;
    }

    public async markBroadcastUnknown(
        commitment: string,
        now: Date
    ): Promise<PeiProxyTransferV0> {
        return this.markBroadcastUnknownUsing(this.pool, commitment, now);
    }

    private async markBroadcastUnknownUsing(
        database: Pool | PoolClient,
        commitment: string,
        now: Date
    ): Promise<PeiProxyTransferV0> {
        const result = await database.query<TransferRow>(
            `UPDATE pei_proxy_transfers_v0
                SET state = 'broadcast_unknown', updated_at = $2
              WHERE request_commitment = $1
              RETURNING *`,
            [commitment, now]
        );
        if (!result.rows[0]) throw new Error('The signed PEI transfer is missing.');
        return transferFromRow(result.rows[0]);
    }

    public async close(): Promise<void> {
        await this.pool.end();
    }
}

type IssuanceRow = QueryResultRow & {
    request_commitment: string;
    wallet_address: string;
    issuance_day: Date | string;
    amount_luna: string;
    expires_at: Date;
    state: 'reserved' | 'committed';
};

type IssuanceUsageRow = QueryResultRow & {
    amount_luna: string;
    wallet_count: string;
};

function issuanceFromRow(row: IssuanceRow): PeiProxyIssuanceV0 {
    const issuanceDay = row.issuance_day instanceof Date
        ? row.issuance_day.toISOString().slice(0, 10)
        : String(row.issuance_day).slice(0, 10);
    const expiresAt = row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at);
    const amountLuna = BigInt(row.amount_luna);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(issuanceDay) || !Number.isFinite(expiresAt.getTime()) ||
        amountLuna <= 0n || !['reserved', 'committed'].includes(row.state)) {
        throw new Error('Stored PEI helper issuance state is invalid.');
    }
    return {
        requestCommitment: row.request_commitment,
        walletAddress: row.wallet_address,
        issuanceDay,
        amountLuna,
        expiresAt,
        state: row.state
    };
}

function assertReservation(reservation: PeiProxyIssuanceReservationV0, now: Date): void {
    if (!Number.isFinite(now.getTime())) {
        throw new Error('The PEI helper issuance reservation is invalid.');
    }
    if (!/^[A-Za-z0-9_-]{43}$/.test(reservation.requestCommitment) ||
        !/^NQ[0-9]{2}(?: [0-9A-HJ-NP-VXY]{4}){8}$/.test(reservation.walletAddress) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(reservation.issuanceDay) ||
        reservation.issuanceDay !== now.toISOString().slice(0, 10) ||
        reservation.amountLuna <= 0n || reservation.dailyBudgetLuna < 0n ||
        !Number.isSafeInteger(reservation.dailyWalletLimit) || reservation.dailyWalletLimit < 1 ||
        reservation.dailyWalletLimit > 100 || !Number.isFinite(reservation.expiresAt.getTime()) ||
        reservation.expiresAt <= now) {
        throw new Error('The PEI helper issuance reservation is invalid.');
    }
}

function assertSameReservation(
    existing: PeiProxyIssuanceV0,
    reservation: PeiProxyIssuanceReservationV0
): void {
    if (existing.walletAddress !== reservation.walletAddress ||
        existing.issuanceDay !== reservation.issuanceDay ||
        existing.amountLuna !== reservation.amountLuna ||
        existing.expiresAt.getTime() !== reservation.expiresAt.getTime()) {
        throw new Error('The PEI helper issuance commitment was reused with different terms.');
    }
}

function transferFromRow(row: TransferRow): PeiProxyTransferV0 {
    const validityStartHeight = Number(row.validity_start_height);
    if (!Number.isSafeInteger(validityStartHeight) || validityStartHeight < 0 ||
        !['signed', 'broadcast_unknown'].includes(row.state)) {
        throw new Error('Stored PEI proxy transfer state is invalid.');
    }
    return {
        requestCommitment: row.request_commitment,
        signedTransaction: row.signed_transaction,
        transactionHash: row.transaction_hash,
        validityStartHeight,
        state: row.state
    };
}
