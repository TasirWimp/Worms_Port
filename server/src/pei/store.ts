import { readFile } from 'fs/promises';
import path from 'path';
import { Pool, type QueryResultRow } from 'pg';

import {
    PeiProofV0Schema,
    PeiRequestV0Schema,
    canonicalPeiProofV0,
    canonicalPeiRequestV0,
    type PeiProofV0,
    type PeiRequestV0
} from '../../../shared/pei-v0';

export type PeiJourneyStateV0 = {
    earnRequestCommitment: string;
    walletAddress: string;
    expiresAt: Date;
    earnProof?: PeiProofV0;
    spendRequest?: PeiRequestV0;
};

export interface PeiJourneyStoreV0 {
    initialize(): Promise<void>;
    begin(state: PeiJourneyStateV0, now: Date): Promise<PeiJourneyStateV0>;
    get(earnRequestCommitment: string): Promise<PeiJourneyStateV0 | undefined>;
    acceptEarn(
        earnRequestCommitment: string,
        earnProof: PeiProofV0,
        spendRequest: PeiRequestV0,
        now: Date
    ): Promise<PeiJourneyStateV0>;
    close(): Promise<void>;
}

export class MemoryPeiJourneyStoreV0 implements PeiJourneyStoreV0 {
    private readonly journeys = new Map<string, PeiJourneyStateV0>();

    public async initialize(): Promise<void> {}

    public async begin(state: PeiJourneyStateV0, now: Date): Promise<PeiJourneyStateV0> {
        for (const [key, value] of this.journeys) {
            if (value.expiresAt.getTime() <= now.getTime()) this.journeys.delete(key);
        }
        const existing = this.journeys.get(state.earnRequestCommitment);
        if (existing) return cloneJourney(existing);
        this.journeys.set(state.earnRequestCommitment, cloneJourney(state));
        return cloneJourney(state);
    }

    public async get(commitment: string): Promise<PeiJourneyStateV0 | undefined> {
        const state = this.journeys.get(commitment);
        return state ? cloneJourney(state) : undefined;
    }

    public async acceptEarn(
        commitment: string,
        earnProof: PeiProofV0,
        spendRequest: PeiRequestV0,
        _now: Date
    ): Promise<PeiJourneyStateV0> {
        const state = this.journeys.get(commitment);
        if (!state) throw new Error('The PEI journey no longer exists.');
        if (!state.earnProof) {
            state.earnProof = structuredClone(earnProof);
            state.spendRequest = structuredClone(spendRequest);
        }
        return cloneJourney(state);
    }

    public async close(): Promise<void> {}
}

type JourneyRow = QueryResultRow & {
    earn_request_commitment: string;
    wallet_address: string;
    earn_proof: unknown | null;
    spend_request: unknown | null;
    expires_at: Date;
};

export class PostgresPeiJourneyStoreV0 implements PeiJourneyStoreV0 {
    private readonly pool: Pool;

    public constructor(connectionString: string) {
        if (!connectionString.trim()) throw new Error('PEI journey storage requires DATABASE_URL.');
        this.pool = new Pool({
            connectionString,
            max: 3,
            application_name: 'nimble-knots-pei-journeys'
        });
        this.pool.on('error', () => console.error('PEI journey database idle connection was lost.'));
    }

    public async initialize(): Promise<void> {
        await this.pool.query(await readPeiOperationsMigration());
    }

    public async begin(state: PeiJourneyStateV0, now: Date): Promise<PeiJourneyStateV0> {
        await this.pool.query('DELETE FROM pei_journeys_v0 WHERE expires_at <= $1', [now]);
        await this.pool.query(
            `INSERT INTO pei_journeys_v0 (
                earn_request_commitment, wallet_address, expires_at, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $4)
             ON CONFLICT (earn_request_commitment) DO NOTHING`,
            [state.earnRequestCommitment, state.walletAddress, state.expiresAt, now]
        );
        const stored = await this.get(state.earnRequestCommitment);
        if (!stored || stored.walletAddress !== state.walletAddress ||
            stored.expiresAt.getTime() !== state.expiresAt.getTime()) {
            throw new Error('The PEI request commitment collided with another journey.');
        }
        return stored;
    }

    public async get(commitment: string): Promise<PeiJourneyStateV0 | undefined> {
        const result = await this.pool.query<JourneyRow>(
            'SELECT * FROM pei_journeys_v0 WHERE earn_request_commitment = $1',
            [commitment]
        );
        return result.rows[0] ? journeyFromRow(result.rows[0]) : undefined;
    }

    public async acceptEarn(
        commitment: string,
        earnProof: PeiProofV0,
        spendRequest: PeiRequestV0,
        now: Date
    ): Promise<PeiJourneyStateV0> {
        const result = await this.pool.query<JourneyRow>(
            `UPDATE pei_journeys_v0
                SET earn_proof = $2::jsonb, spend_request = $3::jsonb, updated_at = $4
              WHERE earn_request_commitment = $1 AND earn_proof IS NULL
              RETURNING *`,
            [
                commitment,
                canonicalPeiProofV0(earnProof),
                canonicalPeiRequestV0(spendRequest),
                now
            ]
        );
        if (result.rows[0]) return journeyFromRow(result.rows[0]);
        const stored = await this.get(commitment);
        if (!stored) throw new Error('The PEI journey no longer exists.');
        return stored;
    }

    public async close(): Promise<void> {
        await this.pool.end();
    }
}

function journeyFromRow(row: JourneyRow): PeiJourneyStateV0 {
    const earnProof = row.earn_proof === null
        ? undefined
        : PeiProofV0Schema.parse(row.earn_proof);
    const spendRequest = row.spend_request === null
        ? undefined
        : PeiRequestV0Schema.parse(row.spend_request);
    if (!!earnProof !== !!spendRequest) throw new Error('Stored PEI journey state is incomplete.');
    return {
        earnRequestCommitment: row.earn_request_commitment,
        walletAddress: row.wallet_address,
        expiresAt: new Date(row.expires_at),
        ...(earnProof ? { earnProof } : {}),
        ...(spendRequest ? { spendRequest } : {})
    };
}

function cloneJourney(state: PeiJourneyStateV0): PeiJourneyStateV0 {
    return {
        ...structuredClone({
            ...state,
            expiresAt: state.expiresAt.toISOString()
        }),
        expiresAt: new Date(state.expiresAt)
    };
}

export async function readPeiOperationsMigration(): Promise<string> {
    for (const candidate of [
        path.join(__dirname, '../migrations/004_pei_operations.sql'),
        path.join(__dirname, '../../migrations/004_pei_operations.sql')
    ]) {
        try {
            return await readFile(candidate, 'utf8');
        } catch {
            // Try the source or built-server layout.
        }
    }
    throw new Error('PEI operations migration 004_pei_operations.sql could not be located.');
}
