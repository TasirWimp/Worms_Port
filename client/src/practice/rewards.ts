import type { Socket } from 'socket.io-client';

import {
    RewardClaimAckSchema,
    RewardInfoAckSchema,
    RewardReserveAckSchema,
    RewardStatusAckSchema,
    protocolEvents,
    type ProtocolError,
    type RewardInfoData,
    type RewardReservationData,
    type RewardUpdateData
} from '../../../shared/protocol';
import type { PlayerCalling } from '../../../shared/simulation';
import { whenSessionReady } from '../lib/session';
import type { PracticeSessionCursor } from './contracts';

type RewardProtocolHost = {
    readonly socket: Socket;
    readonly cursor: PracticeSessionCursor;
    busy: boolean;
    emit(event: string, request: unknown): Promise<unknown>;
    rejectSequence(sequence: number, error: ProtocolError): void;
    error(error: ProtocolError): Error;
    accept(update: RewardUpdateData): void;
};

export class RewardProtocolClient {
    public constructor(private readonly host: RewardProtocolHost) {}

    public async info(): Promise<RewardInfoData> {
        await whenSessionReady(this.host.socket);
        const requestId = createRequestId();
        const raw = await this.host.emit(protocolEvents.rewardInfo, { requestId });
        const parsed = RewardInfoAckSchema.safeParse(raw);
        if (!parsed.success || parsed.data.requestId !== requestId) {
            throw new Error('Server returned invalid Daily Challenge availability.');
        }
        if (parsed.data.ok === false) throw this.host.error(parsed.data.error);
        return structuredClone(parsed.data.data);
    }

    public async reserve(calling: PlayerCalling): Promise<RewardReservationData> {
        if (this.host.busy) throw new Error('Another Clash action is still pending.');
        if (!this.host.socket.connected) throw new Error('Reconnecting to the Clash server.');
        this.host.busy = true;
        const requestId = createRequestId();
        const sequence = this.host.cursor.nextSequence;
        try {
            const raw = await this.host.emit(protocolEvents.rewardReserve, {
                requestId,
                sequence,
                calling
            });
            const parsed = RewardReserveAckSchema.safeParse(raw);
            if (!parsed.success || parsed.data.requestId !== requestId) {
                throw new Error('Server returned an invalid reward reservation.');
            }
            if (parsed.data.ok === false) {
                this.host.rejectSequence(sequence, parsed.data.error);
                throw this.host.error(parsed.data.error);
            }
            this.host.cursor.nextSequence = Math.max(this.host.cursor.nextSequence, sequence + 1);
            return structuredClone(parsed.data.data);
        } finally {
            this.host.busy = false;
        }
    }

    public async claim(update: RewardUpdateData): Promise<RewardUpdateData> {
        if (!update.claimNonce) throw new Error('Refresh reward status before claiming.');
        await whenSessionReady(this.host.socket);
        const requestId = createRequestId();
        const raw = await this.host.emit(protocolEvents.rewardClaim, {
            requestId,
            entitlementId: update.entitlementId,
            claimNonce: update.claimNonce,
            idempotencyKey: createRequestId()
        });
        const parsed = RewardClaimAckSchema.safeParse(raw);
        if (!parsed.success || parsed.data.requestId !== requestId) {
            throw new Error('Server returned an invalid reward claim.');
        }
        if (parsed.data.ok === false) throw this.host.error(parsed.data.error);
        this.host.accept(parsed.data.data);
        return structuredClone(parsed.data.data);
    }

    public async status(entitlementId?: string): Promise<RewardUpdateData> {
        await whenSessionReady(this.host.socket);
        const requestId = createRequestId();
        const raw = await this.host.emit(protocolEvents.rewardStatus, {
            requestId,
            ...(entitlementId ? { entitlementId } : {})
        });
        const parsed = RewardStatusAckSchema.safeParse(raw);
        if (!parsed.success || parsed.data.requestId !== requestId) {
            throw new Error('Server returned an invalid reward status.');
        }
        if (parsed.data.ok === false) throw this.host.error(parsed.data.error);
        this.host.accept(parsed.data.data);
        return structuredClone(parsed.data.data);
    }
}

function createRequestId(): string {
    return crypto.randomUUID().replaceAll('-', '');
}
