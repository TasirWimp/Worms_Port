import type { Socket } from 'socket.io-client';

import type { ProtocolError } from '../../../shared/protocol';
import {
    PeiBeginAckSchema,
    PeiReturnAckSchema,
    peiProtocolEventsV0,
    type PeiLaunchData,
    type PeiQualifiedData,
    type PeiReturnKind
} from '../../../shared/pei-wire-v0';
import { whenSessionReady } from '../lib/session';

const ACK_TIMEOUT_MS = 15_000;

type PeiClientHost = {
    socket: Socket;
    cursor: { nextSequence: number };
    busy: boolean;
    rejectSequence(sequence: number, error: ProtocolError): void;
};

export class PeiProtocolClientV0 {
    public constructor(private readonly host: PeiClientHost) {}

    public async begin(): Promise<PeiLaunchData> {
        return this.send(peiProtocolEventsV0.begin, {}, PeiBeginAckSchema);
    }

    public async returned(
        kind: PeiReturnKind,
        carrier: string
    ): Promise<PeiLaunchData | PeiQualifiedData> {
        return this.send(
            peiProtocolEventsV0.returned,
            { kind, carrier },
            PeiReturnAckSchema
        );
    }

    private async send<T>(
        event: string,
        body: Record<string, unknown>,
        schema: typeof PeiBeginAckSchema | typeof PeiReturnAckSchema
    ): Promise<T> {
        await whenSessionReady(this.host.socket);
        if (this.host.busy) throw new Error('Another Clash action is still pending.');
        if (!this.host.socket.connected) throw new Error('Reconnecting to the Clash server.');
        this.host.busy = true;
        const requestId = crypto.randomUUID().replaceAll('-', '');
        const sequence = this.host.cursor.nextSequence;
        const request = { requestId, sequence, ...body };
        try {
            const raw = await this.emitWithRetry(event, request);
            const parsed = schema.safeParse(raw);
            if (!parsed.success || parsed.data.requestId !== requestId) {
                throw new Error('The server returned an invalid PEI response.');
            }
            if (parsed.data.ok === false) {
                this.host.rejectSequence(sequence, parsed.data.error as ProtocolError);
                throw new PeiProtocolError(parsed.data.error.message, parsed.data.error.code,
                    parsed.data.error.retryable);
            }
            this.host.cursor.nextSequence = Math.max(this.host.cursor.nextSequence, sequence + 1);
            return structuredClone(parsed.data.data) as T;
        } finally {
            this.host.busy = false;
        }
    }

    private emitWithRetry(event: string, request: unknown): Promise<unknown> {
        return this.emitOnce(event, request).catch((firstError) => {
            if (!this.host.socket.connected) throw firstError;
            return this.emitOnce(event, request);
        });
    }

    private emitOnce(event: string, request: unknown): Promise<unknown> {
        return new Promise((resolve, reject) => {
            this.host.socket.timeout(ACK_TIMEOUT_MS).emit(
                event,
                request,
                (timeoutError: Error | null, acknowledgement: unknown) => {
                    if (timeoutError) reject(new Error(`${event} acknowledgement timed out.`));
                    else resolve(acknowledgement);
                }
            );
        });
    }
}

export class PeiProtocolError extends Error {
    public constructor(
        message: string,
        public readonly code: string,
        public readonly retryable: boolean
    ) {
        super(message);
        this.name = 'PeiProtocolError';
    }
}
