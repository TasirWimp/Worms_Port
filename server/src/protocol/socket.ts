import { CandidateAckV10Schema, ChallengeCreateAckV10Schema, ChallengeCreateV10Schema,
    ChallengeLeaveV10Schema, ChallengePauseV10Schema, InputCancelV10Schema, InputReleaseV10Schema, InputRequestV10Schema,
    V10_INPUT_BYTES, jsonBytesV10, protocolEventsV10, type CandidateAckV10 } from '../../../shared/protocol-v10-live';
import type { Server, Socket } from 'socket.io';

import {
    ChallengeCreateRequestSchema,
    ChallengeLeaveRequestSchema,
    ChallengePauseRequestSchema,
    CommandSubmitRequestSchema,
    IdentityBeginRequestSchema,
    IdentityCancelRequestSchema,
    IdentityCompleteRequestSchema,
    protocolEvents,
    RequestIdSchema,
    RewardClaimRequestSchema,
    RewardInfoRequestSchema,
    RewardReserveRequestSchema,
    RewardStatusRequestSchema,
    SessionOpenRequestSchema
} from '../../../shared/protocol';
import type {
    ChallengeResult,
    ProtocolAck,
    ProtocolError
} from '../../../shared/protocol';
import type { SimulationCommand } from '../../../shared/simulation';
import type { IdentityAuthorizationRegistry } from '../identity/registry';
import type { RewardService } from '../reward/service';
import { PeiCoordinatorError, type PeiCoordinatorV0 } from '../pei/coordinator';
import {
    PeiBeginRequestSchema,
    PeiReturnRequestSchema,
    peiProtocolEventsV0
} from '../../../shared/pei-wire-v0';
import { RewardStoreError } from '../reward/types';
import type { CoordinatorReplay } from '../simulation/coordinator';
import { ackFor, SessionRegistry } from '../session/registry';
import { eventFits, TokenBucket } from './guards';
import { failure } from './errors';
import { protocolEventsV8, V8_AUTOMATION_ID, V8_INPUT_BYTES, jsonBytesV8,
    InputRequestV8RuntimeSchema as InputRequestV8Schema, InputCancelV8RuntimeSchema as InputCancelV8Schema,
    InputReleaseV8AutomatedSchema, InputReleaseV8R1Schema,
    ChallengePauseV8RuntimeSchema as ChallengePauseV8Schema, ChallengeLeaveV8RuntimeSchema as ChallengeLeaveV8Schema,
    ChallengeCreateV8Schema, type ChallengeCreateAckV8, type InputAckV8Runtime as InputAckV8 } from '../../../shared/protocol-v8';
import { CandidateAckV9Schema, ChallengeCreateAckV9Schema, ChallengeCreateV9Schema,
    ChallengeLeaveV9Schema, ChallengePauseV9Schema, InputCancelV9Schema, InputReleaseV9Schema, InputRequestV9Schema,
    V9_INPUT_BYTES, jsonBytesV9, protocolEventsV9, type CandidateAckV9 } from '../../../shared/protocol-v9';

type Ack = (response: ProtocolAck<unknown>) => void;

export function setupProtocol(
    io: Server,
    registry: SessionRegistry,
    options: {
        sessionOpenTimeoutMs?: number;
        maxPendingConnections?: number;
        sessionOpenRateCapacity?: number;
        identity?: IdentityAuthorizationRegistry;
        rewards?: RewardService;
        pei?: PeiCoordinatorV0;
    } = {}
): void {
    const openLimiters = new Map<string, TokenBucket>();
    const rewardReserveIpLimiters = new Map<string, TokenBucket>();
    let pendingConnections = 0;

    io.on('connection', (socket) => {
        let pending = true;
        pendingConnections += 1;
        const clearPending = () => {
            if (pending) {
                pending = false;
                pendingConnections -= 1;
            }
        };
        socket.once('disconnect', clearPending);
        if (pendingConnections > (options.maxPendingConnections ?? 1_000)) {
            socket.disconnect(true);
            return;
        }
        const authenticationTimer = setTimeout(() => {
            if (!registry.getBound(socket.id)) {
                socket.disconnect(true);
            }
        }, options.sessionOpenTimeoutMs ?? 5_000);
        authenticationTimer.unref();
        const eventLimiter = new TokenBucket(30, 20 / 1000);
        const inputLimiterV8 = new TokenBucket(20, 20 / 1000);
        const cancelLimiterV8 = new TokenBucket(2, 4 / 1000);
        const releaseLimiterV8 = new TokenBucket(2, 4 / 1000);
        const cancelLimiterV10 = new TokenBucket(2, 4 / 1000);
        const releaseLimiterV10 = new TokenBucket(2, 4 / 1000);
        const inputLimiterV10 = new TokenBucket(30, 30 / 1000);
        const eventLimiterV10 = new TokenBucket(30, 30 / 1000);
        const cancelLimiterV9 = new TokenBucket(2, 4 / 1000);
        const releaseLimiterV9 = new TokenBucket(2, 4 / 1000);
        const invalidLimiter = new TokenBucket(5, 5 / 10_000);
        const rewardInfoLimiter = new TokenBucket(8, 8 / 60_000);
        const rewardReserveLimiter = new TokenBucket(3, 3 / 60_000);
        const rewardClaimLimiter = new TokenBucket(5, 5 / 60_000);
        const rewardStatusLimiter = new TokenBucket(12, 12 / 60_000);
        const peiLimiter = new TokenBucket(8, 8 / 60_000);
        const ip = socket.handshake.address || 'unknown';
        const openCapacity = options.sessionOpenRateCapacity ?? 30;
        const openLimiter = openLimiters.get(ip) || new TokenBucket(
            openCapacity,
            openCapacity * 2 / 60_000
        );
        openLimiters.set(ip, openLimiter);
        while (openLimiters.size > 4096) {
            const oldest = openLimiters.keys().next().value;
            if (oldest === undefined) {
                break;
            }
            openLimiters.delete(oldest);
        }
        const rewardReserveIpLimiter = rewardReserveIpLimiters.get(ip) ||
            new TokenBucket(60, 60 / (60 * 60_000));
        rewardReserveIpLimiters.set(ip, rewardReserveIpLimiter);
        while (rewardReserveIpLimiters.size > 4096) {
            const oldest = rewardReserveIpLimiters.keys().next().value;
            if (oldest === undefined) break;
            rewardReserveIpLimiters.delete(oldest);
        }
        const ownedInputCursor = (payload: unknown): number => {
            const session=registry.getBound(socket.id);
            const challengeId=(payload && typeof payload==='object') ? (payload as {challengeId?:unknown}).challengeId : undefined;
            return session && typeof challengeId==='string' ? registry.inputCursorV8(session,challengeId) : 0;
        };
        const inputFailure = (payload: unknown,code: ProtocolError['code'],message: string): InputAckV8 =>
            failureV8(payload,code,message,ownedInputCursor(payload));
        const ownedV9InputCursor = (payload: unknown): number => {
            const session = registry.getBound(socket.id);
            const challengeId = (payload && typeof payload === 'object') ? (payload as { challengeId?: unknown }).challengeId : undefined;
            return session && typeof challengeId === 'string' ? registry.inputCursorV9(session, challengeId) : 0;
        };
        const candidateFailure = (payload: unknown, code: ProtocolError['code'], message: string): CandidateAckV9 =>
            CandidateAckV9Schema.parse({ protocolVersion: 9,
                requestId: RequestIdSchema.safeParse(requestIdOf(payload)).success ? requestIdOf(payload) : 'invalid-request-0',
                nextSequence: registry.getBound(socket.id)?.nextSequence ?? 0,
                nextInputSequence: ownedV9InputCursor(payload), ok: false,
                error: { code, message, retryable: code === 'RATE_LIMITED' } });

        const ownedV10InputCursor = (payload: unknown): number => {
            const session = registry.getBound(socket.id);
            const challengeId = (payload && typeof payload === 'object') ? (payload as { challengeId?: unknown }).challengeId : undefined;
            return session && typeof challengeId === 'string' ? registry.inputCursorV10(session, challengeId) : 0;
        };
        const candidateFailureV10 = (payload: unknown, code: ProtocolError['code'], message: string): CandidateAckV10 =>
            CandidateAckV10Schema.parse({ protocolVersion: 10,
                requestId: RequestIdSchema.safeParse(requestIdOf(payload)).success ? requestIdOf(payload) : 'invalid-request-0',
                nextSequence: registry.getBound(socket.id)?.nextSequence ?? 0,
                nextInputSequence: ownedV10InputCursor(payload), ok: false,
                error: { code, message, retryable: code === 'RATE_LIMITED' } });

        socket.use((packet, next) => {
            const event = packet[0];
            const payload = packet[1];
            const ack = typeof packet[packet.length - 1] === 'function'
                ? packet[packet.length - 1] as (response: unknown) => void
                : undefined;
            if (!ALLOWED_CLIENT_EVENTS.has(event)) {
                ack?.(failure('invalid-request', 'BAD_REQUEST', 'Unknown protocol event.'));
                if (!invalidLimiter.take()) {
                    socket.disconnect(true);
                }
                next(new Error('Unknown protocol event.'));
                return;
            }
            if ((Object.values(protocolEventsV10) as string[]).includes(event)) {
                const neutral = event === protocolEventsV10.cancel || event === protocolEventsV10.release;
                const limiter = event === protocolEventsV10.cancel ? cancelLimiterV10 : event === protocolEventsV10.release ? releaseLimiterV10 : eventLimiterV10;
                if (jsonBytesV10(payload) > V10_INPUT_BYTES) {
                    ack?.(candidateFailureV10(payload, 'PAYLOAD_TOO_LARGE', 'V10 payload exceeds 1024 bytes.'));
                    if (!invalidLimiter.take()) socket.disconnect(true);
                    next(new Error('V10 payload is too large.')); return;
                }
                if (!limiter.take() || (!neutral && event === protocolEventsV10.input && !inputLimiterV10.take())) {
                    ack?.(candidateFailureV10(payload, 'RATE_LIMITED', 'V10 request rate exceeded.'));
                    next(new Error('V10 rate limit exceeded.')); return;
                }
                next(); return;
            }
            const v8 = event === protocolEventsV8.create || event === protocolEventsV8.input || event === protocolEventsV8.cancel || event === protocolEventsV8.release ||
                event === protocolEventsV8.pause || event === protocolEventsV8.leave;
            const v9 = event === protocolEventsV9.create || event === protocolEventsV9.input || event === protocolEventsV9.cancel || event === protocolEventsV9.release ||
                event === protocolEventsV9.pause || event === protocolEventsV9.leave;
            if (v8 && jsonBytesV8(payload) > V8_INPUT_BYTES) {
                ack?.(wireFailureV8(event,payload,'PAYLOAD_TOO_LARGE','V8 payload exceeds 1024 bytes.',registry.getBound(socket.id)?.nextSequence ?? 0,ownedInputCursor(payload)));
                if (!invalidLimiter.take()) socket.disconnect(true);
                next(new Error('V8 payload is too large.')); return;
            }
            if (v9 && jsonBytesV9(payload) > V9_INPUT_BYTES) {
                ack?.(candidateFailure(payload, 'PAYLOAD_TOO_LARGE', 'V9 payload exceeds 1024 bytes.'));
                if (!invalidLimiter.take()) socket.disconnect(true);
                next(new Error('V9 payload is too large.')); return;
            }
            // Neutral cancellation has its own small lane: normal flooding cannot spend its tokens.
            if (event === protocolEventsV8.cancel || event === protocolEventsV8.release || event === protocolEventsV9.cancel || event === protocolEventsV9.release) {
                const limiter = event === protocolEventsV8.cancel ? cancelLimiterV8
                    : event === protocolEventsV8.release ? releaseLimiterV8
                        : event === protocolEventsV9.cancel ? cancelLimiterV9 : releaseLimiterV9;
                if (!limiter.take()) {
                    ack?.(event === protocolEventsV9.cancel || event === protocolEventsV9.release
                        ? candidateFailure(payload, 'RATE_LIMITED', 'V9 neutral lane is rate limited.')
                        : inputFailure(payload,'RATE_LIMITED','V8 neutral lane is rate limited.'));
                    next(new Error('Neutral rate limit exceeded.')); return;
                }
            } else if (!eventLimiter.take()) {
                if (v8) {
                    ack?.(wireFailureV8(event,payload,'RATE_LIMITED','Too many protocol events.',registry.getBound(socket.id)?.nextSequence ?? 0,ownedInputCursor(payload)));
                    next(new Error('Event rate limit exceeded.')); return;
                }
                ack?.(failure(
                    requestIdOf(payload),
                    'RATE_LIMITED',
                    'Too many protocol events were submitted.',
                    true
                ));
                next(new Error('Event rate limit exceeded.'));
                return;
            }
            if (event === protocolEventsV8.input && !inputLimiterV8.take()) {
                ack?.(inputFailure(payload,'RATE_LIMITED','V8 normal input is rate limited.'));
                next(new Error('V8 input rate limit exceeded.')); return;
            }
            if (event === protocolEventsV9.input && !inputLimiterV8.take()) {
                ack?.(candidateFailure(payload, 'RATE_LIMITED', 'V9 input is rate limited.'));
                next(new Error('V9 input rate limit exceeded.')); return;
            }
            if (!eventFits(payload)) {
                ack?.(failure(
                    requestIdOf(payload),
                    'PAYLOAD_TOO_LARGE',
                    'The event payload exceeds the 12 KiB limit.'
                ));
                if (!invalidLimiter.take()) {
                    socket.disconnect(true);
                }
                next(new Error('Event payload is too large.'));
                return;
            }
            next();
        });

        for (const event of [protocolEventsV8.input,protocolEventsV8.cancel,protocolEventsV8.release]) {
            socket.on(event,(payload: unknown,ack?: (response: InputAckV8) => void) => {
                if (typeof ack !== 'function') { guard(socket,payload,undefined,invalidLimiter); return; }
                const session = registry.getBound(socket.id);
                if (!session) { ack(inputFailure(payload,'UNAUTHORIZED','Open or resume a session first.')); return; }
                const schema = event === protocolEventsV8.cancel ? InputCancelV8Schema
                    : event === protocolEventsV8.release
                        ? ((payload as { automationId?: unknown })?.automationId === V8_AUTOMATION_ID
                            ? InputReleaseV8AutomatedSchema : InputReleaseV8R1Schema)
                        : InputRequestV8Schema;
                if (!schema.safeParse(payload).success) {
                    ack(inputFailure(payload,'BAD_REQUEST','Invalid V8 input envelope.'));
                    if (!invalidLimiter.take()) socket.disconnect(true);
                    return;
                }
                if (event === protocolEventsV8.cancel) {
                    ack(registry.cancelInputV8(session,payload)); return;
                }
                if (event === protocolEventsV8.release) {
                    ack(registry.releaseInputV8(session,payload)); return;
                }
                void registry.submitInputV8(session,payload).then(ack).catch(() => {
                    ack(inputFailure(payload,'INTERNAL_ERROR','V8 input could not be completed.'));
                });
            });
        }

        for (const event of [protocolEventsV8.pause,protocolEventsV8.leave]) {
            socket.on(event,(payload: unknown,ack?: (response: unknown) => void) => {
                if (typeof ack !== 'function') { guard(socket,payload,undefined,invalidLimiter); return; }
                const session = registry.getBound(socket.id);
                const parsed = (event === protocolEventsV8.pause ? ChallengePauseV8Schema : ChallengeLeaveV8Schema).safeParse(payload);
                if (!parsed.success || !session) {
                    ack({protocolVersion:8,requestId:requestIdOf(payload),nextSequence:session?.nextSequence ?? 0,ok:false,
                        error:{code:session ? 'BAD_REQUEST' : 'UNAUTHORIZED',message:'A valid owned V8 lifecycle request is required.',retryable:false}});
                    if (session && !invalidLimiter.take()) socket.disconnect(true);
                    return;
                }
                const packet = parsed.data;
                // Reuse only the existing internal ordered session cursor/cache, not a V1 wire response.
                void registry.sequenceAsync(session,packet.requestId,packet.sequence,{event,...packet},async () => {
                    if (registry.getBound(socket.id) !== session || !registry.ownsChallengePacketV8(session,packet.challengeId,packet))
                        return failure(packet.requestId,'UNAUTHORIZED','The exact lifecycle match/transport is not owned.');
                    const result = event === protocolEventsV8.pause
                        ? await registry.setChallengePausedV8(session,packet.challengeId,ChallengePauseV8Schema.parse(payload).paused)
                        : registry.leaveChallengeV8(session,packet.challengeId);
                    return ackFor(packet.requestId,result);
                }).then(response => {
                    ack({protocolVersion:8,requestId:packet.requestId,nextSequence:response.ok ? packet.sequence+1 : session.nextSequence,
                        ok:response.ok,...('data' in response ? {data:response.data} : {error:response.error})});
                    if (response.ok && event === protocolEventsV8.pause) socket.emit(protocolEventsV8.snapshot,response.data);
                }).catch(() => ack({protocolVersion:8,requestId:packet.requestId,nextSequence:session.nextSequence,ok:false,
                    error:{code:'INTERNAL_ERROR',message:'V8 lifecycle operation failed.',retryable:false}}));
            });
        }

        socket.on(protocolEventsV10.input, (payload: unknown, ack?: (response: CandidateAckV10) => void) => {
            if (typeof ack !== 'function') { guard(socket, payload, undefined, invalidLimiter); return; }
            const session = registry.getBound(socket.id);
            if (!session) { ack(candidateFailureV10(payload, 'UNAUTHORIZED', 'Open or resume a session first.')); return; }
            if (!InputRequestV10Schema.safeParse(payload).success) {
                ack(candidateFailureV10(payload, 'BAD_REQUEST', 'Invalid V10 input envelope.'));
                if (!invalidLimiter.take()) socket.disconnect(true);
                return;
            }
            void registry.submitInputV10(session, payload).then(ack).catch(() => {
                ack(candidateFailureV10(payload, 'INTERNAL_ERROR', 'V10 input could not be completed.'));
            });
        });

        for (const event of [protocolEventsV10.cancel, protocolEventsV10.release]) {
            socket.on(event, (payload: unknown, ack?: (response: CandidateAckV10) => void) => {
                if (typeof ack !== 'function') { guard(socket, payload, undefined, invalidLimiter); return; }
                const session = registry.getBound(socket.id);
                const schema = event === protocolEventsV10.cancel ? InputCancelV10Schema : InputReleaseV10Schema;
                if (!session) { ack(candidateFailureV10(payload, 'UNAUTHORIZED', 'Open or resume a session first.')); return; }
                if (!schema.safeParse(payload).success) {
                    ack(candidateFailureV10(payload, 'BAD_REQUEST', 'Invalid V10 neutral input envelope.'));
                    if (!invalidLimiter.take()) socket.disconnect(true);
                    return;
                }
                void (event === protocolEventsV10.cancel
                    ? registry.cancelInputV10(session, payload)
                    : registry.releaseInputV10(session, payload)).then(ack).catch(() => {
                    ack(candidateFailureV10(payload, 'INTERNAL_ERROR', 'V10 neutral input could not be completed.'));
                });
            });
        }

        for (const event of [protocolEventsV10.pause, protocolEventsV10.leave]) {
            socket.on(event, (payload: unknown, ack?: (response: CandidateAckV10) => void) => {
                if (typeof ack !== 'function') { guard(socket, payload, undefined, invalidLimiter); return; }
                const session = registry.getBound(socket.id);
                const schema = event === protocolEventsV10.pause ? ChallengePauseV10Schema : ChallengeLeaveV10Schema;
                const parsed = schema.safeParse(payload);
                if (!parsed.success || !session) {
                    ack(candidateFailureV10(payload, session ? 'BAD_REQUEST' : 'UNAUTHORIZED', 'A valid owned V10 lifecycle request is required.'));
                    if (session && !invalidLimiter.take()) socket.disconnect(true);
                    return;
                }
                const packet = parsed.data;
                void registry.sequenceAsync(session, packet.requestId, packet.sequence, { event, ...packet }, async () => {
                    if (registry.getBound(socket.id) !== session || !registry.ownsChallengePacketV10(session, packet.challengeId, packet))
                        return failure(packet.requestId, 'UNAUTHORIZED', 'The exact lifecycle match/transport is not owned.');
                    const value = event === protocolEventsV10.pause
                        ? await registry.setChallengePausedV10(session, packet.challengeId, ChallengePauseV10Schema.parse(payload).paused)
                        : registry.leaveChallengeV10(session, packet.challengeId);
                    return ackFor(packet.requestId, value);
                }).then(response => {
                    const current = registry.activeSnapshotV10(session);
                    const data = response.ok ? response.data as any : undefined;
                    const wire = CandidateAckV10Schema.parse(response.ok && data
                        ? { protocolVersion: 10, requestId: packet.requestId, nextSequence: session.nextSequence,
                            nextInputSequence: data.nextInputSequence, ok: true,
                            data: { ...data, nextSequence: session.nextSequence } }
                        : { protocolVersion: 10, requestId: packet.requestId, nextSequence: session.nextSequence,
                            nextInputSequence: current?.nextInputSequence ?? ownedV10InputCursor(packet), ok: false,
                            error: response.ok === false ? response.error : { code: 'CHALLENGE_NOT_FOUND', message: 'V10 match closed.', retryable: false } });
                    ack(wire);
                    if (wire.ok) registry.deliverCurrentV10(session);
                }).catch(() => ack(candidateFailureV10(payload, 'INTERNAL_ERROR', 'V10 lifecycle operation failed.')));
            });
        }

        socket.on(protocolEventsV9.input, (payload: unknown, ack?: (response: CandidateAckV9) => void) => {
            if (typeof ack !== 'function') { guard(socket, payload, undefined, invalidLimiter); return; }
            const session = registry.getBound(socket.id);
            if (!session) { ack(candidateFailure(payload, 'UNAUTHORIZED', 'Open or resume a session first.')); return; }
            if (!InputRequestV9Schema.safeParse(payload).success) {
                ack(candidateFailure(payload, 'BAD_REQUEST', 'Invalid V9 input envelope.'));
                if (!invalidLimiter.take()) socket.disconnect(true);
                return;
            }
            void registry.submitInputV9(session, payload).then(ack).catch(() => {
                ack(candidateFailure(payload, 'INTERNAL_ERROR', 'V9 input could not be completed.'));
            });
        });

        for (const event of [protocolEventsV9.cancel, protocolEventsV9.release]) {
            socket.on(event, (payload: unknown, ack?: (response: CandidateAckV9) => void) => {
                if (typeof ack !== 'function') { guard(socket, payload, undefined, invalidLimiter); return; }
                const session = registry.getBound(socket.id);
                const schema = event === protocolEventsV9.cancel ? InputCancelV9Schema : InputReleaseV9Schema;
                if (!session) { ack(candidateFailure(payload, 'UNAUTHORIZED', 'Open or resume a session first.')); return; }
                if (!schema.safeParse(payload).success) {
                    ack(candidateFailure(payload, 'BAD_REQUEST', 'Invalid V9 neutral input envelope.'));
                    if (!invalidLimiter.take()) socket.disconnect(true);
                    return;
                }
                void (event === protocolEventsV9.cancel
                    ? registry.cancelInputV9(session, payload)
                    : registry.releaseInputV9(session, payload)).then(ack).catch(() => {
                    ack(candidateFailure(payload, 'INTERNAL_ERROR', 'V9 neutral input could not be completed.'));
                });
            });
        }

        for (const event of [protocolEventsV9.pause, protocolEventsV9.leave]) {
            socket.on(event, (payload: unknown, ack?: (response: CandidateAckV9) => void) => {
                if (typeof ack !== 'function') { guard(socket, payload, undefined, invalidLimiter); return; }
                const session = registry.getBound(socket.id);
                const schema = event === protocolEventsV9.pause ? ChallengePauseV9Schema : ChallengeLeaveV9Schema;
                const parsed = schema.safeParse(payload);
                if (!parsed.success || !session) {
                    ack(candidateFailure(payload, session ? 'BAD_REQUEST' : 'UNAUTHORIZED', 'A valid owned V9 lifecycle request is required.'));
                    if (session && !invalidLimiter.take()) socket.disconnect(true);
                    return;
                }
                const packet = parsed.data;
                void registry.sequenceAsync(session, packet.requestId, packet.sequence, { event, ...packet }, async () => {
                    if (registry.getBound(socket.id) !== session || !registry.ownsChallengePacketV9(session, packet.challengeId, packet))
                        return failure(packet.requestId, 'UNAUTHORIZED', 'The exact lifecycle match/transport is not owned.');
                    const value = event === protocolEventsV9.pause
                        ? await registry.setChallengePausedV9(session, packet.challengeId, ChallengePauseV9Schema.parse(payload).paused)
                        : registry.leaveChallengeV9(session, packet.challengeId);
                    return ackFor(packet.requestId, value);
                }).then(response => {
                    const current = registry.activeSnapshotV9(session);
                    const data = response.ok ? response.data as any : undefined;
                    const wire = CandidateAckV9Schema.parse(response.ok && data
                        ? { protocolVersion: 9, requestId: packet.requestId, nextSequence: session.nextSequence,
                            nextInputSequence: data.nextInputSequence, ok: true,
                            data: { ...data, nextSequence: session.nextSequence } }
                        : { protocolVersion: 9, requestId: packet.requestId, nextSequence: session.nextSequence,
                            nextInputSequence: current?.nextInputSequence ?? ownedV9InputCursor(packet), ok: false,
                            error: response.ok === false ? response.error : { code: 'CHALLENGE_NOT_FOUND', message: 'V9 match closed.', retryable: false } });
                    ack(wire);
                    if (wire.ok) registry.deliverCurrentV9(session);
                }).catch(() => ack(candidateFailure(payload, 'INTERNAL_ERROR', 'V9 lifecycle operation failed.')));
            });
        }

        socket.on(protocolEvents.sessionOpen, (payload: unknown, ack?: Ack) => {
            if (!guard(socket, payload, ack, invalidLimiter)) {
                return;
            }
            if (!openLimiter.take()) {
                ack(failure(
                    requestIdOf(payload),
                    'RATE_LIMITED',
                    'Too many session-open attempts were submitted.',
                    true
                ));
                return;
            }
            const parsed = SessionOpenRequestSchema.safeParse(payload);
            if (!parsed.success) {
                invalid(socket, ack, requestIdOf(payload), invalidLimiter);
                return;
            }
            if (registry.getBound(socket.id)) {
                ack(failure(
                    parsed.data.requestId,
                    'BAD_REQUEST',
                    'This connection already has a session.'
                ));
                return;
            }

            if (parsed.data.action === 'create') {
                const result = registry.create(socket.id);
                if ('code' in result) {
                    ack(failure(
                        parsed.data.requestId,
                        result.code,
                        result.message,
                        result.retryable
                    ));
                } else {
                    clearTimeout(authenticationTimer);
                    clearPending();
                    ack({
                        protocolVersion: 1,
                        serverTimeMs: Date.now(),
                        ok: true,
                        requestId: parsed.data.requestId,
                        data: result
                    });
                }
                return;
            }

            const resumed = registry.resume(parsed.data.token, socket.id);
            if (resumed.error) {
                ack(failure(
                    parsed.data.requestId,
                    resumed.error.code,
                    resumed.error.message,
                    resumed.error.retryable
                ));
                return;
            }
            ack({
                protocolVersion: 1,
                serverTimeMs: Date.now(),
                ok: true,
                requestId: parsed.data.requestId,
                data: resumed.data
            });
            clearTimeout(authenticationTimer);
            clearPending();
            if (resumed.previousSocketId) {
                io.sockets.sockets.get(resumed.previousSocketId)?.disconnect(true);
            }
            const reboundSession = registry.getBound(socket.id);
            if (reboundSession) {
                registry.deliverCurrentV8(reboundSession);
                registry.deliverCurrentV9(reboundSession);
                registry.deliverCurrentV10(reboundSession);
                const activeSnapshot = registry.activeSnapshot(reboundSession);
                if (activeSnapshot) {
                    socket.emit(protocolEvents.snapshot, activeSnapshot);
                    const terminal = registry.takeChallengeResult(
                        reboundSession,
                        activeSnapshot.challengeId,
                        activeSnapshot.nextSequence
                    );
                    if (terminal) socket.emit(protocolEvents.result, terminal);
                }
            }
        });

        socket.on(protocolEvents.identityBegin, (payload: unknown, ack?: Ack) => {
            if (!guard(socket, payload, ack, invalidLimiter)) return;
            const parsed = IdentityBeginRequestSchema.safeParse(payload);
            if (!parsed.success) {
                invalid(socket, ack, requestIdOf(payload), invalidLimiter);
                return;
            }
            withSession(socket, registry, parsed.data.requestId, ack, (session) => {
                if (!options.identity) {
                    ack(failure(
                        parsed.data.requestId,
                        'FEATURE_UNAVAILABLE',
                        'Nimiq identity is not configured on this server.'
                    ));
                    return;
                }
                if (registry.hasActiveCombat(session)) {
                    ack(failure(
                        parsed.data.requestId,
                        'BAD_REQUEST',
                        'Identity authorization is unavailable during an active Clash.'
                    ));
                    return;
                }
                ack(ackFor(
                    parsed.data.requestId,
                    options.identity.begin(
                        session.id,
                        socket.id,
                        socket.handshake.address || 'unknown',
                        parsed.data.address
                    )
                ));
            });
        });

        socket.on(protocolEvents.identityComplete, (payload: unknown, ack?: Ack) => {
            if (!guard(socket, payload, ack, invalidLimiter)) return;
            const parsed = IdentityCompleteRequestSchema.safeParse(payload);
            if (!parsed.success) {
                const session = registry.getBound(socket.id);
                const authorizationId = authorizationIdOf(payload);
                if (session && authorizationId) {
                    options.identity?.consumeMalformedAttempt(
                        session.id,
                        socket.id,
                        authorizationId
                    );
                }
                invalid(socket, ack, requestIdOf(payload), invalidLimiter);
                return;
            }
            withSession(socket, registry, parsed.data.requestId, ack, (session) => {
                if (!options.identity) {
                    ack(failure(
                        parsed.data.requestId,
                        'FEATURE_UNAVAILABLE',
                        'Nimiq identity is not configured on this server.'
                    ));
                    return;
                }
                if (registry.hasActiveCombat(session)) {
                    options.identity.cancelSession(session.id);
                    ack(failure(
                        parsed.data.requestId,
                        'UNAUTHORIZED',
                        'Identity authorization failed. Start a new authorization attempt.'
                    ));
                    return;
                }
                const completed = options.identity.complete(
                    session.id,
                    socket.id,
                    socket.handshake.address || 'unknown',
                    parsed.data.authorizationId,
                    parsed.data.address,
                    parsed.data.publicKey,
                    parsed.data.signature
                );
                if ('code' in completed) {
                    ack(failure(
                        parsed.data.requestId,
                        completed.code,
                        completed.message,
                        completed.retryable
                    ));
                    return;
                }
                const opened = registry.authorize(session, {
                    address: completed.address,
                    authorizedAt: completed.authorizedAt
                });
                if ('code' in opened || !opened.identity) {
                    ack(failure(
                        parsed.data.requestId,
                        'UNAUTHORIZED',
                        'Identity authorization failed. Start a new authorization attempt.'
                    ));
                    return;
                }
                options.identity.cancelSession(session.id);
                ack({
                    protocolVersion: 1,
                    serverTimeMs: Date.now(),
                    ok: true,
                    requestId: parsed.data.requestId,
                    data: opened
                });
            });
        });

        socket.on(protocolEvents.identityCancel, (payload: unknown, ack?: Ack) => {
            if (!guard(socket, payload, ack, invalidLimiter)) return;
            const parsed = IdentityCancelRequestSchema.safeParse(payload);
            if (!parsed.success) {
                invalid(socket, ack, requestIdOf(payload), invalidLimiter);
                return;
            }
            withSession(socket, registry, parsed.data.requestId, ack, (session) => {
                if (!options.identity) {
                    ack(failure(
                        parsed.data.requestId,
                        'FEATURE_UNAVAILABLE',
                        'Nimiq identity is not configured on this server.'
                    ));
                    return;
                }
                options.identity.cancelAttempt(
                    session.id,
                    socket.id,
                    parsed.data.authorizationId
                );
                ack(ackFor(parsed.data.requestId, { cancelled: true as const }));
            });
        });

        socket.on(protocolEvents.rewardInfo, (payload: unknown, ack?: Ack) => {
            if (!guard(socket, payload, ack, invalidLimiter)) return;
            const parsed = RewardInfoRequestSchema.safeParse(payload);
            if (!parsed.success) {
                invalid(socket, ack, requestIdOf(payload), invalidLimiter);
                return;
            }
            if (!rewardInfoLimiter.take()) {
                ack?.(failure(
                    parsed.data.requestId,
                    'RATE_LIMITED',
                    'Wait before checking Daily Challenge availability again.',
                    true
                ));
                return;
            }
            withSessionAsync(socket, registry, parsed.data.requestId, ack, async (session) => {
                if (!options.rewards) {
                    ack(failure(
                        parsed.data.requestId,
                        'REWARD_UNAVAILABLE',
                        'Sponsor rewards are unavailable.'
                    ));
                    return;
                }
                try {
                    ack(ackFor(parsed.data.requestId, await options.rewards.info(session.identity)));
                } catch (error) {
                    ack(rewardFailure(parsed.data.requestId, error));
                }
            });
        });

        socket.on(protocolEvents.rewardReserve, (payload: unknown, ack?: Ack) => {
            if (!guard(socket, payload, ack, invalidLimiter)) return;
            const parsed = RewardReserveRequestSchema.safeParse(payload);
            if (!parsed.success) {
                invalid(socket, ack, requestIdOf(payload), invalidLimiter);
                return;
            }
            if (!rewardReserveLimiter.take() || !rewardReserveIpLimiter.take()) {
                ack?.(failure(
                    parsed.data.requestId,
                    'RATE_LIMITED',
                    'Wait before reserving another Daily Challenge.',
                    true
                ));
                return;
            }
            withSessionAsync(socket, registry, parsed.data.requestId, ack, async (session) => {
                if (!options.rewards) {
                    ack(failure(
                        parsed.data.requestId,
                        'REWARD_UNAVAILABLE',
                        'Sponsor rewards are unavailable.'
                    ));
                    return;
                }
                if (registry.hasActiveCombat(session)) {
                    ack(failure(
                        parsed.data.requestId,
                        'BAD_REQUEST',
                        'Finish or leave the active Clash before reserving a reward.'
                    ));
                    return;
                }
                const response = await registry.sequenceAsync(
                    session,
                    parsed.data.requestId,
                    parsed.data.sequence,
                    parsed.data,
                    async () => {
                        try {
                            return ackFor(
                                parsed.data.requestId,
                                await options.rewards!.reserve(
                                    session.identity,
                                    parsed.data.calling
                                )
                            );
                        } catch (error) {
                            return rewardFailure(parsed.data.requestId, error);
                        }
                    }
                );
                ack(response);
            });
        });

        socket.on(protocolEvents.rewardClaim, (payload: unknown, ack?: Ack) => {
            if (!guard(socket, payload, ack, invalidLimiter)) return;
            const parsed = RewardClaimRequestSchema.safeParse(payload);
            if (!parsed.success) {
                invalid(socket, ack, requestIdOf(payload), invalidLimiter);
                return;
            }
            if (!rewardClaimLimiter.take()) {
                ack?.(failure(
                    parsed.data.requestId,
                    'RATE_LIMITED',
                    'Wait before submitting the reward claim again.',
                    true
                ));
                return;
            }
            withSessionAsync(socket, registry, parsed.data.requestId, ack, async (session) => {
                if (!options.rewards) {
                    ack(failure(
                        parsed.data.requestId,
                        'REWARD_UNAVAILABLE',
                        'Sponsor rewards are unavailable.'
                    ));
                    return;
                }
                try {
                    const update = await options.rewards.claim(
                        session.identity,
                        parsed.data.entitlementId,
                        parsed.data.claimNonce,
                        parsed.data.idempotencyKey
                    );
                    ack(ackFor(parsed.data.requestId, update));
                    socket.emit(protocolEvents.rewardUpdate, update);
                } catch (error) {
                    ack(rewardFailure(parsed.data.requestId, error));
                }
            });
        });

        socket.on(protocolEvents.rewardStatus, (payload: unknown, ack?: Ack) => {
            if (!guard(socket, payload, ack, invalidLimiter)) return;
            const parsed = RewardStatusRequestSchema.safeParse(payload);
            if (!parsed.success) {
                invalid(socket, ack, requestIdOf(payload), invalidLimiter);
                return;
            }
            if (!rewardStatusLimiter.take()) {
                ack?.(failure(
                    parsed.data.requestId,
                    'RATE_LIMITED',
                    'Wait before refreshing payout status again.',
                    true
                ));
                return;
            }
            withSessionAsync(socket, registry, parsed.data.requestId, ack, async (session) => {
                if (!options.rewards) {
                    ack(failure(
                        parsed.data.requestId,
                        'REWARD_UNAVAILABLE',
                        'Sponsor rewards are unavailable.'
                    ));
                    return;
                }
                try {
                    ack(ackFor(
                        parsed.data.requestId,
                        await options.rewards.status(
                            session.identity,
                            parsed.data.entitlementId
                        )
                    ));
                } catch (error) {
                    ack(rewardFailure(parsed.data.requestId, error));
                }
            });
        });

        socket.on(protocolEventsV10.create, (payload: unknown, ack?: (response: CandidateAckV10) => void) => {
            if (typeof ack !== 'function') return;
            const parsed = ChallengeCreateV10Schema.safeParse(payload);
            const session = registry.getBound(socket.id);
            if (!parsed.success || !session) {
                ack(candidateFailureV10(payload, session ? 'BAD_REQUEST' : 'UNAUTHORIZED', 'Valid volcanic challenge request required.'));
                if (!parsed.success && !invalidLimiter.take()) socket.disconnect(true);
                return;
            }
            const request = parsed.data;
            void registry.sequenceAsync(session, request.requestId, request.sequence, { event: protocolEventsV10.create, ...request }, async () => {
                if (registry.getBound(socket.id) !== session) return failure(request.requestId, 'UNAUTHORIZED', 'Creation transport disconnected.');
                const admission = registry.admitChallengeAutomatedV10(session, request.mode,
                    request.mode === 'reward' ? request.challengeId : undefined);
                if (admission) return failure(request.requestId, admission.code, admission.message, admission.retryable);
                let entitlement: Awaited<ReturnType<RewardService['start']>> | undefined;
                try {
                    if (request.mode === 'reward') {
                        if (registry.hasActiveCombat(session)) return failure(request.requestId, 'BAD_REQUEST', 'Finish or leave the active Clash before starting a reward match.');
                        if (!options.rewards) return failure(request.requestId, 'REWARD_UNAVAILABLE', 'Sponsor rewards are unavailable.');
                        entitlement = await options.rewards.start(session.identity, request.challengeId, request.eligibilityToken);
                        if (registry.getBound(socket.id) !== session) {
                            await options.rewards.completeMatch({ protocolVersion: 1, serverTimeMs: Date.now(), sessionId: session.id,
                                challengeId: entitlement.challengeId, outcome: 'left', revision: 0, nextSequence: session.nextSequence,
                                finalTick: null, finalStateHash: null }).catch(() => undefined);
                            return failure(request.requestId, 'UNAUTHORIZED', 'The creation transport disconnected.');
                        }
                        const rechecked = registry.admitChallengeAutomatedV10(session, request.mode, entitlement.challengeId);
                        if (rechecked) {
                            await options.rewards.completeMatch({ protocolVersion: 1, serverTimeMs: Date.now(), sessionId: session.id,
                                challengeId: entitlement.challengeId, outcome: 'left', revision: 0, nextSequence: session.nextSequence,
                                finalTick: null, finalStateHash: null }).catch(() => undefined);
                            return failure(request.requestId, rechecked.code, rechecked.message, rechecked.retryable);
                        }
                    }
                    const created = registry.createChallengeAutomatedV10(session, request.mode, request.calling,
                        entitlement ? { challengeId: entitlement.challengeId, seed: entitlement.seed } : undefined);
                    if ('code' in created && entitlement) {
                        await options.rewards!.completeMatch({ protocolVersion: 1, serverTimeMs: Date.now(), sessionId: session.id,
                            challengeId: entitlement.challengeId, outcome: 'left', revision: 0, nextSequence: session.nextSequence,
                            finalTick: null, finalStateHash: null });
                    }
                    return ackFor(request.requestId, created);
                } catch (error) {
                    if (entitlement) await options.rewards!.completeMatch({ protocolVersion: 1, serverTimeMs: Date.now(), sessionId: session.id,
                        challengeId: entitlement.challengeId, outcome: 'left', revision: 0, nextSequence: session.nextSequence,
                        finalTick: null, finalStateHash: null }).catch(() => undefined);
                    return rewardFailure(request.requestId, error);
                }
            }).then(response => {
                const data = response.ok ? response.data as any : undefined;
                const wire = ChallengeCreateAckV10Schema.parse(response.ok && data
                    ? { protocolVersion: 10, requestId: request.requestId, nextSequence: session.nextSequence, nextInputSequence: data.nextInputSequence, ok: true, data: { ...data, nextSequence: session.nextSequence } }
                    : { protocolVersion: 10, requestId: request.requestId, nextSequence: session.nextSequence, nextInputSequence: 0, ok: false, error: response.ok === false ? response.error : { code: 'INTERNAL_ERROR', message: 'Creation failed.', retryable: false } });
                ack(wire);
                if (wire.ok) registry.deliverCurrentV10(session);
            }).catch(() => ack(candidateFailureV10(payload, 'INTERNAL_ERROR', 'Volcanic challenge creation failed.')));
        });

        socket.on(peiProtocolEventsV0.begin, (payload: unknown, ack?: Ack) => {
            if (!guard(socket, payload, ack, invalidLimiter)) return;
            const parsed = PeiBeginRequestSchema.safeParse(payload);
            if (!parsed.success) {
                invalid(socket, ack, requestIdOf(payload), invalidLimiter);
                return;
            }
            if (!peiLimiter.take()) {
                ack?.(failure(parsed.data.requestId, 'RATE_LIMITED', 'Wait before starting another PEI journey.', true));
                return;
            }
            withSessionAsync(socket, registry, parsed.data.requestId, ack, async (session) => {
                const response = await registry.sequenceAsync(
                    session,
                    parsed.data.requestId,
                    parsed.data.sequence,
                    parsed.data,
                    async () => {
                        if (!options.pei || !session.identity) {
                            return failure(
                                parsed.data.requestId,
                                'PEI_UNAVAILABLE',
                                session.identity
                                    ? 'PEI is unavailable on this server.'
                                    : 'Authorize the Daily Challenge wallet before starting PEI.'
                            );
                        }
                        try {
                            return ackFor(
                                parsed.data.requestId,
                                await options.pei.begin(session.id, session.identity.address)
                            );
                        } catch (error) {
                            return peiFailure(parsed.data.requestId, error);
                        }
                    }
                );
                ack(response);
            });
        });

        socket.on(peiProtocolEventsV0.returned, (payload: unknown, ack?: Ack) => {
            if (!guard(socket, payload, ack, invalidLimiter)) return;
            const parsed = PeiReturnRequestSchema.safeParse(payload);
            if (!parsed.success) {
                invalid(socket, ack, requestIdOf(payload), invalidLimiter);
                return;
            }
            if (!peiLimiter.take()) {
                ack?.(failure(parsed.data.requestId, 'RATE_LIMITED', 'Wait before verifying the PEI return.', true));
                return;
            }
            withSessionAsync(socket, registry, parsed.data.requestId, ack, async (session) => {
                const response = await registry.sequenceAsync(
                    session,
                    parsed.data.requestId,
                    parsed.data.sequence,
                    parsed.data,
                    async () => {
                        if (!options.pei || !session.identity) {
                            return failure(parsed.data.requestId, 'PEI_UNAVAILABLE', 'PEI and an authorized wallet are required.');
                        }
                        try {
                            const data = parsed.data.kind === 'earn'
                                ? await options.pei.acceptEarn(
                                    session.id,
                                    session.identity.address,
                                    parsed.data.carrier
                                )
                                : await options.pei.complete(
                                    session.id,
                                    session.identity.address,
                                    parsed.data.carrier
                                );
                            return ackFor(parsed.data.requestId, data);
                        } catch (error) {
                            return peiFailure(parsed.data.requestId, error);
                        }
                    }
                );
                ack(response);
            });
        });

        socket.on(protocolEventsV9.create, (payload: unknown, ack?: (response: CandidateAckV9) => void) => {
            if (typeof ack !== 'function') { guard(socket, payload, undefined, invalidLimiter); return; }
            const parsed = ChallengeCreateV9Schema.safeParse(payload);
            const session = registry.getBound(socket.id);
            if (!parsed.success || !session) {
                ack(candidateFailure(payload, session ? 'BAD_REQUEST' : 'UNAUTHORIZED', 'A valid V9 candidate creation request is required.'));
                if (!parsed.success && !invalidLimiter.take()) socket.disconnect(true);
                return;
            }
            const request = parsed.data;
            void registry.sequenceAsync(session, request.requestId, request.sequence, { event: protocolEventsV9.create, ...request }, async () => {
                if (registry.getBound(socket.id) !== session)
                    return failure(request.requestId, 'UNAUTHORIZED', 'The creation transport is no longer bound.');
                const admission = registry.admitChallengeAutomatedV9(session, request.mode,
                    request.mode === 'reward' ? request.challengeId : undefined);
                if (admission) return failure(request.requestId, admission.code, admission.message, admission.retryable);
                let entitlement: Awaited<ReturnType<RewardService['start']>> | undefined;
                try {
                    if (request.mode === 'reward') {
                        if (registry.hasActiveCombat(session)) return failure(request.requestId, 'BAD_REQUEST', 'Finish or leave the active Clash before starting a reward match.');
                        if (!options.rewards) return failure(request.requestId, 'REWARD_UNAVAILABLE', 'Sponsor rewards are unavailable.');
                        entitlement = await options.rewards.start(session.identity, request.challengeId, request.eligibilityToken);
                        if (registry.getBound(socket.id) !== session) {
                            await options.rewards.completeMatch({ protocolVersion: 1, serverTimeMs: Date.now(), sessionId: session.id,
                                challengeId: entitlement.challengeId, outcome: 'left', revision: 0, nextSequence: session.nextSequence,
                                finalTick: null, finalStateHash: null }).catch(() => undefined);
                            return failure(request.requestId, 'UNAUTHORIZED', 'The creation transport disconnected.');
                        }
                        const rechecked = registry.admitChallengeAutomatedV9(session, request.mode, entitlement.challengeId);
                        if (rechecked) {
                            await options.rewards.completeMatch({ protocolVersion: 1, serverTimeMs: Date.now(), sessionId: session.id,
                                challengeId: entitlement.challengeId, outcome: 'left', revision: 0, nextSequence: session.nextSequence,
                                finalTick: null, finalStateHash: null }).catch(() => undefined);
                            return failure(request.requestId, rechecked.code, rechecked.message, rechecked.retryable);
                        }
                    }
                    const created = registry.createChallengeAutomatedV9(session, request.mode, request.calling,
                        entitlement ? { challengeId: entitlement.challengeId, seed: entitlement.seed } : undefined);
                    if ('code' in created && entitlement) {
                        await options.rewards!.completeMatch({ protocolVersion: 1, serverTimeMs: Date.now(), sessionId: session.id,
                            challengeId: entitlement.challengeId, outcome: 'left', revision: 0, nextSequence: session.nextSequence,
                            finalTick: null, finalStateHash: null });
                    }
                    return ackFor(request.requestId, created);
                } catch (error) {
                    if (entitlement) await options.rewards!.completeMatch({ protocolVersion: 1, serverTimeMs: Date.now(), sessionId: session.id,
                        challengeId: entitlement.challengeId, outcome: 'left', revision: 0, nextSequence: session.nextSequence,
                        finalTick: null, finalStateHash: null }).catch(() => undefined);
                    return rewardFailure(request.requestId, error);
                }
            }).then(response => {
                const data = response.ok ? response.data as any : undefined;
                const wire = ChallengeCreateAckV9Schema.parse(response.ok && data
                    ? { protocolVersion: 9, requestId: request.requestId, nextSequence: session.nextSequence,
                        nextInputSequence: data.nextInputSequence, ok: true,
                        data: { ...data, nextSequence: session.nextSequence } }
                    : { protocolVersion: 9, requestId: request.requestId, nextSequence: session.nextSequence,
                        nextInputSequence: ownedV9InputCursor(request), ok: false,
                        error: response.ok === false ? response.error : { code: 'CHALLENGE_NOT_FOUND', message: 'V9 match closed.', retryable: false } });
                ack(wire);
                if (wire.ok) registry.deliverCurrentV9(session);
            }).catch(() => ack(candidateFailure(payload, 'INTERNAL_ERROR', 'V9 candidate creation failed.')));
        });

        socket.on(protocolEventsV8.create, (payload: unknown, ack?: (response: ChallengeCreateAckV8) => void) => {
            if (typeof ack !== 'function') { guard(socket, payload, undefined, invalidLimiter); return; }
            const parsed = ChallengeCreateV8Schema.safeParse(payload);
            const session = registry.getBound(socket.id);
            const reject = (code: ProtocolError['code'], message: string): ChallengeCreateAckV8 => ({
                protocolVersion: 8, requestId: requestIdOf(payload), nextSequence: session?.nextSequence ?? 0,
                ok: false, error: { code, message, retryable: false }
            });
            if (!parsed.success || !session) {
                ack(reject(session ? 'BAD_REQUEST' : 'UNAUTHORIZED', 'A valid versioned creation request is required.'));
                if (!parsed.success && !invalidLimiter.take()) socket.disconnect(true);
                return;
            }
            const request = parsed.data;
            void registry.sequenceAsync(session, request.requestId, request.sequence,
                { event: protocolEventsV8.create, ...request }, async () => {
                    if (registry.getBound(socket.id) !== session)
                        return failure(request.requestId, 'UNAUTHORIZED', 'The creation transport is no longer bound.');
                    let entitlement: Awaited<ReturnType<RewardService['start']>> | undefined;
                    try {
                        if (request.mode === 'reward') {
                            if (registry.hasActiveCombat(session)) return failure(request.requestId,
                                'BAD_REQUEST', 'Finish or leave the active Clash before starting a reward match.');
                            if (!options.rewards) return failure(request.requestId, 'REWARD_UNAVAILABLE', 'Sponsor rewards are unavailable.');
                            entitlement = await options.rewards.start(session.identity,
                                request.eligibility.challengeId, request.eligibility.token);
                        }
                        const selected = registry.createSelectedChallenge(session, request.mode, request.calling,
                            entitlement ? { challengeId: entitlement.challengeId, seed: entitlement.seed } : undefined);
                        if ('code' in selected && entitlement) {
                            await options.rewards!.completeMatch({ protocolVersion: 1, serverTimeMs: Date.now(),
                                sessionId: session.id, challengeId: entitlement.challengeId, outcome: 'left', revision: 0,
                                nextSequence: session.nextSequence + 1, finalTick: null, finalStateHash: null });
                        }
                        return ackFor(request.requestId, selected);
                    } catch (error) {
                        if (entitlement) {
                            await options.rewards!.completeMatch({ protocolVersion: 1, serverTimeMs: Date.now(),
                                sessionId: session.id, challengeId: entitlement.challengeId, outcome: 'left', revision: 0,
                                nextSequence: session.nextSequence + 1, finalTick: null, finalStateHash: null }).catch(() => undefined);
                        }
                        return rewardFailure(request.requestId, error);
                    }
                }).then(response => {
                    let wire: ChallengeCreateAckV8;
                    if (response.ok === false) wire = { protocolVersion:8, requestId:request.requestId,
                        nextSequence:session.nextSequence, ok:false, error:response.error };
                    else wire = { protocolVersion:8, requestId:request.requestId, nextSequence:request.sequence+1,
                        ok:true, data:response.data as any };
                    ack(wire);
                    if (wire.ok) {
                        const snapshot = wire.data.snapshot;
                        socket.emit(wire.data.kind === 'v8' ? protocolEventsV8.snapshot : protocolEvents.snapshot, snapshot);
                    }
                }).catch(() => ack(reject('INTERNAL_ERROR', 'Versioned creation failed.')));
        });

        socket.on(protocolEvents.challengeCreate, (payload: unknown, ack?: Ack) => {
            if (!guard(socket, payload, ack, invalidLimiter)) {
                return;
            }
            const parsed = ChallengeCreateRequestSchema.safeParse(payload);
            if (!parsed.success) {
                invalid(socket, ack, requestIdOf(payload), invalidLimiter);
                return;
            }
            withSessionAsync(socket, registry, parsed.data.requestId, ack, async (session) => {
                if (!registry.legacyCreationAvailable()) {
                    ack(failure(parsed.data.requestId, 'FEATURE_UNAVAILABLE',
                        'Use the versioned creation protocol for this combat candidate.'));
                    return;
                }
                if (parsed.data.mode === 'reward') {
                    const rewardRequest = parsed.data;
                    if (!options.rewards) {
                        ack(failure(
                            parsed.data.requestId,
                            'REWARD_UNAVAILABLE',
                            'Sponsor rewards are unavailable.'
                        ));
                        return;
                    }
                    if (registry.activeSnapshot(session)?.status === 'active') {
                        ack(failure(
                            parsed.data.requestId,
                            'BAD_REQUEST',
                            'Finish or leave the active Clash before starting a reward match.'
                        ));
                        return;
                    }
                    const response = await registry.sequenceAsync(
                        session,
                        parsed.data.requestId,
                        parsed.data.sequence,
                        parsed.data,
                        async () => {
                            let entitlement: Awaited<ReturnType<RewardService['start']>> |
                                undefined;
                            try {
                                entitlement = await options.rewards!.start(
                                    session.identity,
                                    rewardRequest.eligibility.challengeId,
                                    rewardRequest.eligibility.token
                                );
                                const created = registry.createChallenge(
                                    session,
                                    'reward',
                                    rewardRequest.calling,
                                    {
                                        challengeId: entitlement.challengeId,
                                        seed: entitlement.seed
                                    }
                                );
                                if ('code' in created) {
                                    await options.rewards!.completeMatch({
                                        protocolVersion: 1,
                                        serverTimeMs: Date.now(),
                                        sessionId: session.id,
                                        challengeId: entitlement.challengeId,
                                        outcome: 'left',
                                        revision: 0,
                                        nextSequence: session.nextSequence + 1,
                                        finalTick: null,
                                        finalStateHash: null
                                    });
                                }
                                return ackFor(parsed.data.requestId, created);
                            } catch (error) {
                                if (entitlement) {
                                    await options.rewards!.completeMatch({
                                        protocolVersion: 1,
                                        serverTimeMs: Date.now(),
                                        sessionId: session.id,
                                        challengeId: entitlement.challengeId,
                                        outcome: 'left',
                                        revision: 0,
                                        nextSequence: session.nextSequence + 1,
                                        finalTick: null,
                                        finalStateHash: null
                                    }).catch(() => undefined);
                                }
                                return rewardFailure(parsed.data.requestId, error);
                            }
                        }
                    );
                    ack(response);
                    if (response.ok) socket.emit(protocolEvents.snapshot, response.data);
                    return;
                }
                const response = registry.sequence(
                    session,
                    parsed.data.requestId,
                    parsed.data.sequence,
                    parsed.data,
                    () => ackFor(
                        parsed.data.requestId,
                        registry.createChallenge(
                            session,
                            parsed.data.mode,
                            parsed.data.calling
                        )
                    )
                );
                ack(response);
                if (response.ok) {
                    socket.emit(protocolEvents.snapshot, response.data);
                }
            });
        });

        socket.on(protocolEvents.commandSubmit, (payload: unknown, ack?: Ack) => {
            if (!guard(socket, payload, ack, invalidLimiter)) {
                return;
            }
            const parsed = CommandSubmitRequestSchema.safeParse(payload);
            if (!parsed.success) {
                invalid(socket, ack, requestIdOf(payload), invalidLimiter);
                return;
            }
            withSession(socket, registry, parsed.data.requestId, ack, (session) => {
                const response = registry.sequence(
                    session,
                    parsed.data.requestId,
                    parsed.data.sequence,
                    parsed.data,
                    () => ackFor(
                        parsed.data.requestId,
                        registry.submitCommand(
                            session,
                            parsed.data.challengeId,
                            parsed.data.command as SimulationCommand,
                            parsed.data.expectedTurn
                        )
                    )
                );
                ack(response);
                if (response.ok) {
                    const current = registry.activeSnapshot(session);
                    const emitted = current ?? response.data;
                    socket.emit(protocolEvents.snapshot, emitted);
                    const result = registry.takeChallengeResult(
                        session,
                        parsed.data.challengeId,
                        emitted.nextSequence
                    );
                    if (result) {
                        socket.emit(protocolEvents.result, result);
                        settleRewardResult(
                            result,
                            registry.challengeMode(session.id, result.challengeId) === 'reward'
                                ? registry.replayForChallenge(session, result.challengeId)
                                : undefined
                        );
                    }
                    const loomkeeper = registry.driveLoomkeeperTurn(
                        session,
                        parsed.data.challengeId
                    );
                    if (loomkeeper && !('code' in loomkeeper)) {
                        socket.emit(protocolEvents.snapshot, loomkeeper);
                        const loomkeeperResult = registry.takeChallengeResult(
                            session,
                            parsed.data.challengeId,
                            loomkeeper.nextSequence
                        );
                        if (loomkeeperResult) {
                            socket.emit(protocolEvents.result, loomkeeperResult);
                            settleRewardResult(
                                loomkeeperResult,
                                registry.challengeMode(
                                    session.id,
                                    loomkeeperResult.challengeId
                                ) === 'reward'
                                    ? registry.replayForChallenge(
                                        session,
                                        loomkeeperResult.challengeId
                                    )
                                    : undefined
                            );
                        }
                    }
                }
            });
        });

        socket.on(protocolEvents.challengePause, (payload: unknown, ack?: Ack) => {
            if (!guard(socket, payload, ack, invalidLimiter)) {
                return;
            }
            const parsed = ChallengePauseRequestSchema.safeParse(payload);
            if (!parsed.success) {
                invalid(socket, ack, requestIdOf(payload), invalidLimiter);
                return;
            }
            withSession(socket, registry, parsed.data.requestId, ack, (session) => {
                const response = registry.sequence(
                    session,
                    parsed.data.requestId,
                    parsed.data.sequence,
                    parsed.data,
                    () => ackFor(
                        parsed.data.requestId,
                        registry.setChallengePaused(
                            session,
                            parsed.data.challengeId,
                            parsed.data.paused
                        )
                    )
                );
                ack(response);
                if (response.ok) {
                    socket.emit(protocolEvents.snapshot, response.data);
                }
            });
        });

        socket.on(protocolEvents.challengeLeave, (payload: unknown, ack?: Ack) => {
            if (!guard(socket, payload, ack, invalidLimiter)) {
                return;
            }
            const parsed = ChallengeLeaveRequestSchema.safeParse(payload);
            if (!parsed.success) {
                invalid(socket, ack, requestIdOf(payload), invalidLimiter);
                return;
            }
            withSession(socket, registry, parsed.data.requestId, ack, (session) => {
                const rewardMode = registry.challengeMode(
                    session.id,
                    parsed.data.challengeId
                ) === 'reward';
                const rewardReplay = rewardMode
                    ? registry.replayForChallenge(session, parsed.data.challengeId)
                    : undefined;
                const response = registry.sequence(
                    session,
                    parsed.data.requestId,
                    parsed.data.sequence,
                    parsed.data,
                    () => ackFor(
                        parsed.data.requestId,
                        registry.leaveChallenge(session, parsed.data.challengeId)
                    )
                );
                ack(response);
                if (response.ok) {
                    socket.emit(protocolEvents.result, response.data);
                    if (rewardMode && options.rewards) {
                        settleRewardResult(response.data, rewardReplay);
                    }
                }
            });
        });

        const settleRewardResult = (
            result: ChallengeResult,
            replay: CoordinatorReplay | undefined
        ) => {
            if (!replay || !options.rewards) return;
            void options.rewards.completeMatch(result, replay).then((update) => {
                if (update) socket.emit(protocolEvents.rewardUpdate, update);
            }).catch(() => undefined);
        };

        socket.on('disconnect', () => {
            clearTimeout(authenticationTimer);
            options.identity?.cancelSocket(socket.id);
            registry.disconnect(socket.id);
        });
    });
}

function guard(
    socket: Socket,
    payload: unknown,
    ack: Ack | undefined,
    invalidLimiter: TokenBucket
): ack is Ack {
    if (typeof ack !== 'function') {
        socket.emit(protocolEvents.error, {
            protocolVersion: 1,
            serverTimeMs: Date.now(),
            error: {
                code: 'BAD_REQUEST',
                message: 'A Socket.IO acknowledgement callback is required.',
                retryable: false
            } satisfies ProtocolError
        });
        if (!invalidLimiter.take()) {
            socket.disconnect(true);
        }
        return false;
    }
    return true;
}

function invalid(
    socket: Socket,
    ack: Ack,
    requestId: string,
    invalidLimiter: TokenBucket
): void {
    ack(failure(requestId, 'BAD_REQUEST', 'The event payload is invalid.'));
    if (!invalidLimiter.take()) {
        socket.disconnect(true);
    }
}

function withSession(
    socket: Socket,
    registry: SessionRegistry,
    requestId: string,
    ack: Ack,
    operation: (session: ReturnType<SessionRegistry['getBound']> & {}) => void
): void {
    const session = registry.getBound(socket.id);
    if (!session) {
        ack(failure(requestId, 'UNAUTHORIZED', 'Open or resume a session first.'));
        return;
    }
    operation(session);
}

function withSessionAsync(
    socket: Socket,
    registry: SessionRegistry,
    requestId: string,
    ack: Ack,
    operation: (session: ReturnType<SessionRegistry['getBound']> & {}) => Promise<void>
): void {
    const session = registry.getBound(socket.id);
    if (!session) {
        ack(failure(requestId, 'UNAUTHORIZED', 'Open or resume a session first.'));
        return;
    }
    void operation(session).catch(() => {
        ack(failure(
            requestId,
            'INTERNAL_ERROR',
            'The request could not be completed.',
            true
        ));
    });
}

function rewardFailure(requestId: string, error: unknown): ProtocolAck<never> {
    if (!(error instanceof RewardStoreError)) {
        return failure(
            requestId,
            'INTERNAL_ERROR',
            'The reward request could not be completed.',
            true
        );
    }
    switch (error.code) {
        case 'disabled':
        case 'exhausted':
            return failure(requestId, 'REWARD_UNAVAILABLE', error.message);
        case 'unavailable':
            return failure(requestId, 'REWARD_UNAVAILABLE', error.message, true);
        case 'paused':
            return failure(requestId, 'REWARD_PAUSED', error.message, true);
        case 'ineligible':
        case 'not_found':
            return failure(requestId, 'REWARD_INELIGIBLE', error.message);
        case 'conflict':
        case 'expired':
        case 'invalid_state':
            return failure(requestId, 'REWARD_CONFLICT', error.message);
    }
}

function requestIdOf(payload: unknown): string {
    if (
        payload &&
        typeof payload === 'object' &&
        typeof (payload as { requestId?: unknown }).requestId === 'string'
    ) {
        const parsed = RequestIdSchema.safeParse(
            (payload as { requestId: string }).requestId
        );
        if (parsed.success) {
            return parsed.data;
        }
    }
    return 'invalid-request';
}

function authorizationIdOf(payload: unknown): string | undefined {
    if (!payload || typeof payload !== 'object') return undefined;
    const value = (payload as { authorizationId?: unknown }).authorizationId;
    return typeof value === 'string' && /^[A-Za-z0-9_-]{32}$/.test(value)
        ? value
        : undefined;
}

const ALLOWED_CLIENT_EVENTS = new Set([
    protocolEventsV10.create,
    protocolEventsV10.input,
    protocolEventsV10.cancel,
    protocolEventsV10.release,
    protocolEventsV10.pause,
    protocolEventsV10.leave,
    protocolEventsV9.create,
    protocolEventsV9.input,
    protocolEventsV9.cancel,
    protocolEventsV9.release,
    protocolEventsV9.pause,
    protocolEventsV9.leave,
    protocolEventsV8.create,
    protocolEventsV8.input,
    protocolEventsV8.cancel,
    protocolEventsV8.release,
    protocolEventsV8.pause,
    protocolEventsV8.leave,
    protocolEvents.sessionOpen,
    protocolEvents.identityBegin,
    protocolEvents.identityComplete,
    protocolEvents.identityCancel,
    protocolEvents.rewardInfo,
    protocolEvents.rewardReserve,
    protocolEvents.rewardClaim,
    protocolEvents.rewardStatus,
    peiProtocolEventsV0.begin,
    peiProtocolEventsV0.returned,
    protocolEvents.challengeCreate,
    protocolEvents.commandSubmit,
    protocolEvents.challengePause,
    protocolEvents.challengeLeave,
    'client:room#join',
    'client:room#ready',
    'client:room#leave',
    'client:room#start',
    'client:game#join',
    'client:game#ready'
]);

function peiFailure(requestId: string, error: unknown): ProtocolAck<never> {
    if (error instanceof PeiCoordinatorError) {
        return failure(
            requestId,
            error.kind === 'invalid'
                ? 'PEI_INVALID'
                : error.kind === 'inconclusive'
                    ? 'PEI_INCONCLUSIVE'
                    : 'PEI_UNAVAILABLE',
            error.message,
            error.retryable
        );
    }
    return failure(requestId, 'PEI_INVALID', 'The PEI return could not be processed.');
}

function failureV8(payload: unknown,code: ProtocolError['code'],message: string,nextInputSequence=0): InputAckV8 {
    return { protocolVersion:8,requestId:requestIdOf(payload),nextInputSequence,ok:false,
        error:{code,message,retryable:code === 'RATE_LIMITED'} };
}
function wireFailureV8(event: string,payload: unknown,code: ProtocolError['code'],message: string,nextSequence: number,nextInputSequence: number): unknown {
    const response=failureV8(payload,code,message,nextInputSequence);
    if(event!==protocolEventsV8.create && event!==protocolEventsV8.pause && event!==protocolEventsV8.leave) return response;
    return {protocolVersion:8,requestId:requestIdOf(payload),nextSequence,ok:false,
        error:{code,message,retryable:code==='RATE_LIMITED'}};
}
