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
import { RewardStoreError } from '../reward/types';
import type { CoordinatorReplay } from '../simulation/coordinator';
import { ackFor, SessionRegistry } from '../session/registry';
import { eventFits, TokenBucket } from './guards';
import { failure } from './errors';

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
        const invalidLimiter = new TokenBucket(5, 5 / 10_000);
        const rewardInfoLimiter = new TokenBucket(8, 8 / 60_000);
        const rewardReserveLimiter = new TokenBucket(3, 3 / 60_000);
        const rewardClaimLimiter = new TokenBucket(5, 5 / 60_000);
        const rewardStatusLimiter = new TokenBucket(12, 12 / 60_000);
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

        socket.use((packet, next) => {
            const event = packet[0];
            const payload = packet[1];
            const ack = typeof packet[packet.length - 1] === 'function'
                ? packet[packet.length - 1] as Ack
                : undefined;
            if (!ALLOWED_CLIENT_EVENTS.has(event)) {
                ack?.(failure('invalid-request', 'BAD_REQUEST', 'Unknown protocol event.'));
                if (!invalidLimiter.take()) {
                    socket.disconnect(true);
                }
                next(new Error('Unknown protocol event.'));
                return;
            }
            if (!eventLimiter.take()) {
                ack?.(failure(
                    requestIdOf(payload),
                    'RATE_LIMITED',
                    'Too many protocol events were submitted.',
                    true
                ));
                next(new Error('Event rate limit exceeded.'));
                return;
            }
            if (!eventFits(payload)) {
                ack?.(failure(
                    requestIdOf(payload),
                    'PAYLOAD_TOO_LARGE',
                    'The event payload exceeds the 8 KiB limit.'
                ));
                if (!invalidLimiter.take()) {
                    socket.disconnect(true);
                }
                next(new Error('Event payload is too large.'));
                return;
            }
            next();
        });

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
                if (registry.activeSnapshot(session)?.status === 'active') {
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
                if (registry.activeSnapshot(session)?.status === 'active') {
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
            withSessionAsync(socket, registry, parsed.data.requestId, ack, async () => {
                if (!options.rewards) {
                    ack(failure(
                        parsed.data.requestId,
                        'REWARD_UNAVAILABLE',
                        'Sponsor rewards are unavailable.'
                    ));
                    return;
                }
                try {
                    ack(ackFor(parsed.data.requestId, await options.rewards.info()));
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
                const active = registry.activeSnapshot(session);
                if (active?.status === 'active') {
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
    protocolEvents.sessionOpen,
    protocolEvents.identityBegin,
    protocolEvents.identityComplete,
    protocolEvents.identityCancel,
    protocolEvents.rewardInfo,
    protocolEvents.rewardReserve,
    protocolEvents.rewardClaim,
    protocolEvents.rewardStatus,
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
