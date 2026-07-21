import type { Socket } from 'socket.io-client';

import {
    IdentityBeginAckSchema,
    IdentityCompleteAckSchema,
    IdentityCompleteDataSchema,
    protocolEvents,
    type IdentityBeginData,
    type IdentityCompleteData
} from '../../../shared/protocol';
import { adoptSession, reconnectSession, whenSessionReady } from '../lib/session';
import type { IdentitySignature } from './adapter';

const ACK_TIMEOUT_MS = 8_000;

export class IdentityProtocolError extends Error {
    public constructor(
        message: string,
        public readonly code: string
    ) {
        super(message);
        this.name = 'IdentityProtocolError';
    }
}

export class IdentityProtocolClient {
    public constructor(private readonly socket: Socket) {}

    public async begin(address: string): Promise<IdentityBeginData> {
        await whenSessionReady(this.socket);
        const requestId = createRequestId();
        const raw = await this.emit(protocolEvents.identityBegin, { requestId, address });
        const parsed = IdentityBeginAckSchema.safeParse(raw);
        if (!parsed.success || parsed.data.requestId !== requestId) {
            throw new IdentityProtocolError(
                'The server returned an invalid identity response.',
                'INVALID_RESPONSE'
            );
        }
        if (parsed.data.ok === false) {
            throw new IdentityProtocolError(parsed.data.error.message, parsed.data.error.code);
        }
        return structuredClone(parsed.data.data);
    }

    public async complete(
        authorization: IdentityBeginData,
        signature: IdentitySignature
    ): Promise<IdentityCompleteData> {
        const requestId = createRequestId();
        let raw: unknown;
        try {
            raw = await this.emit(protocolEvents.identityComplete, {
                requestId,
                authorizationId: authorization.authorizationId,
                address: authorization.address,
                publicKey: signature.publicKey,
                signature: signature.signature
            });
        } catch (error) {
            if (!(error instanceof IdentityAckTimeout)) throw error;
            const recovered = await reconnectSession(this.socket);
            const parsedRecovery = IdentityCompleteDataSchema.safeParse(recovered);
            if (parsedRecovery.success &&
                parsedRecovery.data.identity.address === authorization.address) {
                return structuredClone(parsedRecovery.data);
            }
            throw new IdentityProtocolError(
                'Identity confirmation timed out. Start a new authorization attempt.',
                'ACK_TIMEOUT'
            );
        }

        const parsed = IdentityCompleteAckSchema.safeParse(raw);
        if (!parsed.success || parsed.data.requestId !== requestId) {
            throw new IdentityProtocolError(
                'The server returned an invalid identity response.',
                'INVALID_RESPONSE'
            );
        }
        if (parsed.data.ok === false) {
            throw new IdentityProtocolError(parsed.data.error.message, parsed.data.error.code);
        }
        return adoptSession(this.socket, parsed.data.data) as IdentityCompleteData;
    }

    private emit(event: string, request: unknown): Promise<unknown> {
        return new Promise((resolve, reject) => {
            this.socket.timeout(ACK_TIMEOUT_MS).emit(
                event,
                request,
                (timeoutError: Error | null, ack: unknown) => {
                    if (timeoutError) reject(new IdentityAckTimeout());
                    else resolve(ack);
                }
            );
        });
    }
}

class IdentityAckTimeout extends Error {}

function createRequestId(): string {
    return crypto.randomUUID().replaceAll('-', '');
}
