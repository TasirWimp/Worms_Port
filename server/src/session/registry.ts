import { createHash } from 'crypto';

import type {
    ChallengeResult,
    ChallengeSnapshot,
    ProtocolAck,
    ProtocolError,
    SessionOpenData
} from '../../../shared/protocol';
import { PROTOCOL_VERSION } from '../../../shared/protocol';
import { failure, success } from '../protocol/errors';
import { issueToken, opaqueId, tokenDigest } from './token';

const DEFAULT_SESSION_TTL_MS = 30 * 60_000;
const DEFAULT_RECONNECT_GRACE_MS = 2 * 60_000;
const DEFAULT_TOKEN_RECOVERY_MS = 30_000;
const DEFAULT_CHALLENGE_TTL_MS = 30 * 60_000;
const REPLAY_LIMIT = 256;

type CachedRequest = {
    hash: string;
    ack: ProtocolAck<unknown>;
};

export type Challenge = {
    id: string;
    mode: 'practice' | 'reward';
    calling: 'wizard' | 'thief' | 'warrior';
    status: 'active' | 'left' | 'expired';
    revision: number;
    expiresAt: number;
};

export type Session = {
    id: string;
    tokenDigest: string;
    previousTokenDigest?: string;
    previousTokenExpiresAt?: number;
    socketId?: string;
    expiresAt: number;
    disconnectedDeadline?: number;
    nextSequence: number;
    replay: Map<string, CachedRequest>;
    challenges: Map<string, Challenge>;
};

export type SessionRegistryOptions = {
    now?: () => number;
    sessionTtlMs?: number;
    reconnectGraceMs?: number;
    tokenRecoveryMs?: number;
    challengeTtlMs?: number;
    maxSessions?: number;
    sweepIntervalMs?: number;
    onSessionClosed?: (sessionId: string, socketId?: string) => void;
    onChallengeExpired?: (result: ChallengeResult, socketId?: string) => void;
};

export class SessionRegistry {
    private readonly sessions = new Map<string, Session>();
    private readonly sessionsByDigest = new Map<string, string>();
    private readonly sessionsBySocket = new Map<string, string>();
    private readonly now: () => number;
    private readonly sessionTtlMs: number;
    private readonly reconnectGraceMs: number;
    private readonly tokenRecoveryMs: number;
    private readonly challengeTtlMs: number;
    private readonly maxSessions: number;
    private readonly sweepTimer: NodeJS.Timeout;
    private readonly onSessionClosed?: (sessionId: string, socketId?: string) => void;
    private readonly onChallengeExpired?: (result: ChallengeResult, socketId?: string) => void;

    public constructor(options: SessionRegistryOptions = {}) {
        this.now = options.now || Date.now;
        this.sessionTtlMs = options.sessionTtlMs || DEFAULT_SESSION_TTL_MS;
        this.reconnectGraceMs = options.reconnectGraceMs || DEFAULT_RECONNECT_GRACE_MS;
        this.tokenRecoveryMs = options.tokenRecoveryMs || DEFAULT_TOKEN_RECOVERY_MS;
        this.challengeTtlMs = options.challengeTtlMs || DEFAULT_CHALLENGE_TTL_MS;
        this.maxSessions = options.maxSessions || 10_000;
        this.onSessionClosed = options.onSessionClosed;
        this.onChallengeExpired = options.onChallengeExpired;
        this.sweepTimer = setInterval(
            () => this.sweep(),
            options.sweepIntervalMs || 15_000
        );
        this.sweepTimer.unref();
    }

    public create(socketId: string): SessionOpenData | ProtocolError {
        this.sweep();
        if (this.sessions.size >= this.maxSessions) {
            return {
                code: 'RATE_LIMITED',
                message: 'The server has reached its active session limit.',
                retryable: true
            };
        }
        const token = issueToken();
        const digest = tokenDigest(token);
        const session: Session = {
            id: opaqueId(),
            tokenDigest: digest,
            socketId,
            expiresAt: this.now() + this.sessionTtlMs,
            nextSequence: 0,
            replay: new Map(),
            challenges: new Map()
        };
        this.sessions.set(session.id, session);
        this.sessionsByDigest.set(digest, session.id);
        this.sessionsBySocket.set(socketId, session.id);
        return this.openData(session, token, false);
    }

    public resume(token: string, socketId: string): {
        data?: SessionOpenData;
        error?: ProtocolError;
        previousSocketId?: string;
    } {
        this.sweep();
        const digest = tokenDigest(token);
        const sessionId = this.sessionsByDigest.get(digest);
        const session = sessionId ? this.sessions.get(sessionId) : undefined;
        const now = this.now();
        const isCurrentToken = session?.tokenDigest === digest;
        const isRecoverablePreviousToken = session?.previousTokenDigest === digest &&
            session.previousTokenExpiresAt !== undefined &&
            session.previousTokenExpiresAt > now &&
            !session.socketId;
        if (!session || (!isCurrentToken && !isRecoverablePreviousToken) || this.isExpired(session)) {
            return {
                error: {
                    code: 'SESSION_EXPIRED',
                    message: 'The session token is invalid or expired.',
                    retryable: false
                }
            };
        }

        const previousSocketId = session.socketId;
        const replacement = issueToken();
        const replacementDigest = tokenDigest(replacement);
        this.sessionsByDigest.delete(session.tokenDigest);
        if (session.previousTokenDigest) {
            this.sessionsByDigest.delete(session.previousTokenDigest);
        }
        session.previousTokenDigest = digest;
        session.previousTokenExpiresAt = isRecoverablePreviousToken
            ? session.previousTokenExpiresAt
            : now + this.tokenRecoveryMs;
        session.tokenDigest = replacementDigest;
        session.socketId = socketId;
        session.disconnectedDeadline = undefined;
        this.sessionsByDigest.set(replacementDigest, session.id);
        this.sessionsByDigest.set(digest, session.id);
        if (previousSocketId) {
            this.sessionsBySocket.delete(previousSocketId);
        }
        this.sessionsBySocket.set(socketId, session.id);
        return {
            data: this.openData(session, replacement, true),
            previousSocketId: previousSocketId === socketId ? undefined : previousSocketId
        };
    }

    public getBound(socketId: string): Session | undefined {
        const sessionId = this.sessionsBySocket.get(socketId);
        const session = sessionId ? this.sessions.get(sessionId) : undefined;
        return session && !this.isExpired(session) ? session : undefined;
    }

    public socketIdForSession(sessionId: string): string | undefined {
        return this.sessions.get(sessionId)?.socketId;
    }

    public isConnected(sessionId: string): boolean {
        const session = this.sessions.get(sessionId);
        return Boolean(session?.socketId && !this.isExpired(session));
    }

    public disconnect(socketId: string): void {
        const session = this.getBound(socketId);
        if (!session) {
            return;
        }
        session.socketId = undefined;
        this.sessionsBySocket.delete(socketId);
        session.disconnectedDeadline = this.now() + this.reconnectGraceMs;
    }

    public createChallenge(
        session: Session,
        mode: 'practice' | 'reward',
        calling: 'wizard' | 'thief' | 'warrior'
    ): ChallengeSnapshot | ProtocolError {
        if (mode === 'reward') {
            return {
                code: 'FEATURE_UNAVAILABLE',
                message: 'Reward challenges are not enabled in this release slice.',
                retryable: false
            };
        }
        for (const existing of session.challenges.values()) {
            if (existing.status === 'active' && existing.expiresAt <= this.now()) {
                this.expireChallenge(session, existing, session.nextSequence + 1);
            }
            if (existing.status === 'active' && existing.expiresAt > this.now()) {
                return this.snapshot(session, existing);
            }
        }
        const closedIds = [...session.challenges]
            .filter(([, existing]) => existing.status !== 'active')
            .map(([id]) => id);
        while (closedIds.length > 1) {
            session.challenges.delete(closedIds.shift()!);
        }
        const challenge: Challenge = {
            id: opaqueId(),
            mode,
            calling,
            status: 'active',
            revision: 0,
            expiresAt: this.now() + this.challengeTtlMs
        };
        challenge.expiresAt = Math.min(challenge.expiresAt, session.expiresAt);
        session.challenges.set(challenge.id, challenge);
        return this.snapshot(session, challenge);
    }

    public submitCommand(session: Session, challengeId: string): ChallengeSnapshot | ProtocolError {
        const challenge = this.activeChallenge(session, challengeId);
        if (isProtocolError(challenge)) {
            return challenge;
        }
        challenge.revision += 1;
        return this.snapshot(session, challenge);
    }

    public leaveChallenge(session: Session, challengeId: string): ChallengeResult | ProtocolError {
        const challenge = this.activeChallenge(session, challengeId);
        if (isProtocolError(challenge)) {
            return challenge;
        }
        challenge.status = 'left';
        challenge.revision += 1;
        const result: ChallengeResult = {
            protocolVersion: PROTOCOL_VERSION,
            serverTimeMs: this.now(),
            sessionId: session.id,
            challengeId: challenge.id,
            outcome: 'left',
            revision: challenge.revision,
            nextSequence: session.nextSequence + 1
        };
        return result;
    }

    public sequence<T>(
        session: Session,
        requestId: string,
        sequence: number,
        payload: unknown,
        operation: () => ProtocolAck<T>
    ): ProtocolAck<T> {
        const hash = requestHash(payload);
        const cached = session.replay.get(requestId);
        if (cached) {
            if (cached.hash !== hash) {
                return failure(
                    requestId,
                    'REPLAY_CONFLICT',
                    'The request id was already used for different content.'
                );
            }
            return cached.ack as ProtocolAck<T>;
        }
        if (sequence < session.nextSequence) {
            return failure(requestId, 'STALE_SEQUENCE', 'The command sequence is stale.');
        }
        if (sequence > session.nextSequence) {
            return failure(requestId, 'SEQUENCE_GAP', 'The command sequence has a gap.', true);
        }

        const ack = operation();
        session.nextSequence += 1;
        session.replay.set(requestId, { hash, ack: ack as ProtocolAck<unknown> });
        while (session.replay.size > REPLAY_LIMIT) {
            const oldest = session.replay.keys().next().value;
            if (oldest === undefined) {
                break;
            }
            session.replay.delete(oldest);
        }
        return ack;
    }

    public close(sessionId: string): void {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return;
        }
        this.sessionsByDigest.delete(session.tokenDigest);
        if (session.previousTokenDigest) {
            this.sessionsByDigest.delete(session.previousTokenDigest);
        }
        if (session.socketId) {
            this.sessionsBySocket.delete(session.socketId);
        }
        this.sessions.delete(sessionId);
        this.onSessionClosed?.(session.id, session.socketId);
    }

    public sweep(): void {
        const now = this.now();
        for (const session of this.sessions.values()) {
            for (const challenge of [...session.challenges.values()]) {
                if (challenge.status === 'active' && challenge.expiresAt <= now) {
                    this.expireChallenge(session, challenge);
                }
            }
            if (session.previousTokenDigest &&
                session.previousTokenExpiresAt !== undefined &&
                session.previousTokenExpiresAt <= now) {
                this.sessionsByDigest.delete(session.previousTokenDigest);
                session.previousTokenDigest = undefined;
                session.previousTokenExpiresAt = undefined;
            }
            if (this.isExpired(session)) {
                this.close(session.id);
            }
        }
    }

    public dispose(): void {
        clearInterval(this.sweepTimer);
        this.sessions.clear();
        this.sessionsByDigest.clear();
        this.sessionsBySocket.clear();
    }

    public get size(): number {
        return this.sessions.size;
    }

    private activeChallenge(session: Session, id: string): Challenge | ProtocolError {
        const challenge = session.challenges.get(id);
        if (!challenge) {
            return {
                code: 'CHALLENGE_NOT_FOUND',
                message: 'The challenge does not exist for this session.',
                retryable: false
            };
        }
        if (challenge.status === 'active' && challenge.expiresAt <= this.now()) {
            this.expireChallenge(session, challenge, session.nextSequence + 1);
        }
        if (challenge.status !== 'active') {
            return {
                code: 'CHALLENGE_CLOSED',
                message: 'The challenge is no longer active.',
                retryable: false
            };
        }
        return challenge;
    }

    private expireChallenge(
        session: Session,
        challenge: Challenge,
        nextSequence = session.nextSequence
    ): void {
        if (challenge.status !== 'active') {
            return;
        }
        challenge.status = 'expired';
        challenge.revision += 1;
        this.onChallengeExpired?.({
            protocolVersion: PROTOCOL_VERSION,
            serverTimeMs: this.now(),
            sessionId: session.id,
            challengeId: challenge.id,
            outcome: 'expired',
            revision: challenge.revision,
            nextSequence
        }, session.socketId);
    }

    private snapshot(session: Session, challenge: Challenge): ChallengeSnapshot {
        return {
            protocolVersion: PROTOCOL_VERSION,
            serverTimeMs: this.now(),
            sessionId: session.id,
            challengeId: challenge.id,
            mode: challenge.mode,
            calling: challenge.calling,
            status: challenge.status,
            revision: challenge.revision,
            nextSequence: session.nextSequence + 1,
            expiresAt: new Date(challenge.expiresAt).toISOString()
        };
    }

    private openData(session: Session, token: string, resumed: boolean): SessionOpenData {
        return {
            protocolVersion: PROTOCOL_VERSION,
            serverTimeMs: this.now(),
            sessionId: session.id,
            token,
            resumed,
            expiresAt: new Date(session.expiresAt).toISOString()
        };
    }

    private isExpired(session: Session): boolean {
        const now = this.now();
        return session.expiresAt <= now ||
            (session.disconnectedDeadline !== undefined && session.disconnectedDeadline <= now);
    }
}

function requestHash(payload: unknown): string {
    return createHash('sha256').update(canonicalJson(payload)).digest('base64url');
}

function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record).sort().map(
            (key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`
        ).join(',')}}`;
    }
    return JSON.stringify(value);
}

function isProtocolError(value: Challenge | ProtocolError): value is ProtocolError {
    return 'code' in value;
}

export function ackFor<T>(requestId: string, value: T | ProtocolError): ProtocolAck<T> {
    return isErrorValue(value)
        ? failure(requestId, value.code, value.message, value.retryable)
        : success(requestId, value);
}

function isErrorValue(value: unknown): value is ProtocolError {
    return Boolean(value && typeof value === 'object' && 'code' in value);
}
