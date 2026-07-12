import type { ProtocolAck, ProtocolError } from '../../../shared/protocol';
import { PROTOCOL_VERSION } from '../../../shared/protocol';

export type ProtocolErrorCode = ProtocolError['code'];

export function protocolError(
    code: ProtocolErrorCode,
    message: string,
    retryable = false
): ProtocolError {
    return { code, message, retryable };
}

export function failure(
    requestId: string,
    code: ProtocolErrorCode,
    message: string,
    retryable = false
): ProtocolAck<never> {
    return {
        protocolVersion: PROTOCOL_VERSION,
        serverTimeMs: Date.now(),
        ok: false,
        requestId,
        error: protocolError(code, message, retryable)
    };
}

export function success<T>(requestId: string, data: T): ProtocolAck<T> {
    return {
        protocolVersion: PROTOCOL_VERSION,
        serverTimeMs: Date.now(),
        ok: true,
        requestId,
        data
    };
}
