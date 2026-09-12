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

export interface PeiProxyTransferOperationsV0 {
    get(commitment: string): Promise<PeiProxyTransferV0 | undefined>;
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

    public async saveSigned(
        transfer: Omit<PeiProxyTransferV0, 'state'>,
        _now: Date
    ): Promise<PeiProxyTransferV0> {
        const existing = this.transfers.get(transfer.requestCommitment);
        if (existing) return structuredClone(existing);
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
            `INSERT INTO pei_proxy_transfers_v0 (
                request_commitment, signed_transaction, transaction_hash,
                validity_start_height, state, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, 'signed', $5, $5)
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
        if (!existing) throw new Error('The signed PEI transfer could not be persisted.');
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
