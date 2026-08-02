import { createHash, randomBytes } from 'crypto';

import type {
    ChallengeResult,
    ChallengeSnapshot,
    ProtocolAck,
    ProtocolError,
    SessionOpenData,
    WalletIdentity
} from '../../../shared/protocol';
import { PROTOCOL_VERSION } from '../../../shared/protocol';
import { failure, success } from '../protocol/errors';
import {
    SimulationCoordinator,
    type CoordinatorReplay,
    type CoordinatorUpdate
} from '../simulation/coordinator';
import { LEGACY_RULESET_ID, type SimulationCommand } from '../../../shared/simulation';
import {
    decideLoomkeeperTurn,
    LOOMKEEPER_MAX_COMMANDS,
    type LoomkeeperDifficulty
} from '../../../shared/loomkeeper';
import { issueToken, opaqueId, tokenDigest } from './token';

const DEFAULT_SESSION_TTL_MS = 30 * 60_000;
const DEFAULT_RECONNECT_GRACE_MS = 2 * 60_000;
const DEFAULT_TOKEN_RECOVERY_MS = 30_000;
const DEFAULT_CHALLENGE_TTL_MS = 30 * 60_000;
const REPLAY_LIMIT = 256;
const MAXIMUM_PLAYER_COMMANDS_PER_TURN = 16;
const MINIMUM_AUTOMATED_REPLAY_RECORDS = 512;

type LegacyChallengeSnapshot = Extract<
    ChallengeSnapshot,
    { loomkeeperPolicyId: 'nimble-knots-loomkeeper-v1' }
>;
type CurrentChallengeSnapshot = Extract<
    ChallengeSnapshot,
    { loomkeeperPolicyId: 'nimble-knots-loomkeeper-v2' }
>;

type CachedRequest = {
    hash: string;
    ack: ProtocolAck<unknown>;
};

export type Challenge = {
    id: string;
    mode: 'practice' | 'reward';
    calling: 'wizard' | 'thief' | 'warrior';
    loomkeeperDifficulty: LoomkeeperDifficulty;
    status: 'active' | 'left' | 'expired' | 'completed';
    paused: boolean;
    revision: number;
    simulationRevision: number;
    simulationStateHash: string;
    expiresAt: number;
    resultEmitted: boolean;
    playerCommandTurn: number;
    playerCommandCount: number;
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
    practiceSeedIndex: number;
    replay: Map<string, CachedRequest>;
    challenges: Map<string, Challenge>;
    identity?: WalletIdentity;
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
    onChallengeSnapshot?: (snapshot: ChallengeSnapshot, socketId?: string) => void;
    onChallengeCompleted?: (result: ChallengeResult, socketId?: string) => void;
    simulationTickIntervalMs?: number | false;
    simulationTicksPerInterval?: number;
    simulationMaxReplayRecords?: number;
    seedSource?: (sessionId: string, practiceIndex: number) => number;
    loomkeeperEnabled?: boolean;
    loomkeeperDifficulty?: LoomkeeperDifficulty;
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
    private readonly onChallengeSnapshot?: (snapshot: ChallengeSnapshot, socketId?: string) => void;
    private readonly onChallengeCompleted?: (result: ChallengeResult, socketId?: string) => void;
    private readonly coordinator: SimulationCoordinator;
    private readonly seedSource: (sessionId: string, practiceIndex: number) => number;
    private readonly loomkeeperEnabled: boolean;
    private readonly loomkeeperDifficulty: LoomkeeperDifficulty;
    private readonly pendingLoomkeeperTurns = new Set<string>();
    private readonly runningLoomkeeperTurns = new Set<string>();
    private readonly sequenceLocks = new Map<string, Promise<void>>();
    private inOrderedSimulation = false;

    public constructor(options: SessionRegistryOptions = {}) {
        this.now = options.now || Date.now;
        this.sessionTtlMs = options.sessionTtlMs || DEFAULT_SESSION_TTL_MS;
        this.reconnectGraceMs = options.reconnectGraceMs || DEFAULT_RECONNECT_GRACE_MS;
        this.tokenRecoveryMs = options.tokenRecoveryMs || DEFAULT_TOKEN_RECOVERY_MS;
        this.challengeTtlMs = options.challengeTtlMs || DEFAULT_CHALLENGE_TTL_MS;
        this.maxSessions = options.maxSessions || 10_000;
        this.onSessionClosed = options.onSessionClosed;
        this.onChallengeExpired = options.onChallengeExpired;
        this.onChallengeSnapshot = options.onChallengeSnapshot;
        this.onChallengeCompleted = options.onChallengeCompleted;
        this.seedSource = options.seedSource || (() => randomBytes(4).readUInt32BE(0));
        this.loomkeeperEnabled = options.loomkeeperEnabled ?? true;
        this.loomkeeperDifficulty = options.loomkeeperDifficulty ?? 'standard';
        if (this.loomkeeperEnabled && options.simulationMaxReplayRecords !== undefined &&
            options.simulationMaxReplayRecords < MINIMUM_AUTOMATED_REPLAY_RECORDS) {
            throw new RangeError(
                `simulationMaxReplayRecords must be at least ${MINIMUM_AUTOMATED_REPLAY_RECORDS} ` +
                'while automated Loomkeeper turns are enabled.'
            );
        }
        this.coordinator = new SimulationCoordinator({
            maxReplayRecords: options.simulationMaxReplayRecords,
            tickIntervalMs: options.simulationTickIntervalMs === false
                ? undefined
                : options.simulationTickIntervalMs ?? 1_000,
            ticksPerInterval: options.simulationTicksPerInterval ?? 30,
            onTransition: (update) => this.onSimulationTransition(update)
        });
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
            practiceSeedIndex: 0,
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

    public authorize(session: Session, identity: WalletIdentity): SessionOpenData | ProtocolError {
        this.sweep();
        if (this.sessions.get(session.id) !== session || this.isExpired(session) ||
            !session.socketId) {
            return {
                code: 'UNAUTHORIZED',
                message: 'Identity authorization failed. Start a new authorization attempt.',
                retryable: false
            };
        }

        const previousDigest = session.tokenDigest;
        const replacement = issueToken();
        const replacementDigest = tokenDigest(replacement);
        if (session.previousTokenDigest) {
            this.sessionsByDigest.delete(session.previousTokenDigest);
        }
        session.previousTokenDigest = previousDigest;
        session.previousTokenExpiresAt = this.now() + this.tokenRecoveryMs;
        session.tokenDigest = replacementDigest;
        session.identity = { ...identity };
        this.sessionsByDigest.set(previousDigest, session.id);
        this.sessionsByDigest.set(replacementDigest, session.id);
        return this.openData(session, replacement, false);
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
        calling: 'wizard' | 'thief' | 'warrior',
        reward?: { challengeId: string; seed: number }
    ): ChallengeSnapshot | ProtocolError {
        if (mode === 'reward' && !reward) {
            return {
                code: 'FEATURE_UNAVAILABLE',
                message: 'A durable reward reservation is required.',
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
            const removedId = closedIds.shift()!;
            session.challenges.delete(removedId);
            this.coordinator.delete(removedId);
        }
        const challengeId = reward?.challengeId ?? opaqueId();
        const seed = reward?.seed ?? this.seedSource(
            session.id,
            session.practiceSeedIndex++
        ) >>> 0;
        const simulation = this.coordinator.create(
            challengeId,
            session.id,
            seed,
            calling
        );
        const challenge: Challenge = {
            id: challengeId,
            mode,
            calling,
            loomkeeperDifficulty: this.loomkeeperDifficulty,
            status: 'active',
            paused: false,
            revision: 0,
            simulationRevision: 0,
            simulationStateHash: simulation.stateHash,
            expiresAt: this.now() + this.challengeTtlMs,
            resultEmitted: false,
            playerCommandTurn: 0,
            playerCommandCount: 0
        };
        challenge.expiresAt = Math.min(challenge.expiresAt, session.expiresAt);
        session.challenges.set(challenge.id, challenge);
        return this.snapshot(session, challenge);
    }

    public submitCommand(
        session: Session,
        challengeId: string,
        command: SimulationCommand,
        expectedTurn: number
    ): ChallengeSnapshot | ProtocolError {
        const challenge = this.activeChallenge(session, challengeId);
        if (isProtocolError(challenge)) {
            return challenge;
        }
        if (challenge.paused) {
            return {
                code: 'COMMAND_REJECTED',
                message: 'Resume the Practice Clash before submitting gameplay commands.',
                retryable: false
            };
        }
        const authoritativeTurn = this.coordinator.get(challengeId)!.state.turn;
        if (challenge.playerCommandTurn !== authoritativeTurn) {
            challenge.playerCommandTurn = authoritativeTurn;
            challenge.playerCommandCount = 0;
        }
        if (challenge.playerCommandCount >= MAXIMUM_PLAYER_COMMANDS_PER_TURN) {
            return {
                code: 'COMMAND_REJECTED',
                message: 'The accepted command budget for this turn has been reached.',
                retryable: false
            };
        }
        if (command.type === 'fire' && !this.coordinator.canAppendReplayRecords(
            challengeId,
            LOOMKEEPER_MAX_COMMANDS + 1
        )) {
            return {
                code: 'COMMAND_REJECTED',
                message: 'The replay budget cannot reserve a complete Loomkeeper reply.',
                retryable: false
            };
        }
        this.inOrderedSimulation = true;
        let update: ReturnType<SimulationCoordinator['apply']>;
        try {
            update = this.coordinator.apply(challengeId, 'player', command, expectedTurn);
        } finally {
            this.inOrderedSimulation = false;
        }
        if (!update.transition.accepted) {
            return {
                code: update.transition.error!.code,
                message: update.transition.error!.message,
                retryable: false
            };
        }
        challenge.playerCommandCount += 1;
        this.syncSimulationState(challenge, update);
        if (update.state.phase === 'finished') challenge.status = 'completed';
        return this.snapshot(session, challenge);
    }

    /**
     * Commits at most one already-earned Loomkeeper turn. It is safe to call
     * after duplicate transport acknowledgements because authority is checked
     * again against the current authoritative snapshot.
     */
    public driveLoomkeeperTurn(
        session: Session,
        challengeId: string
    ): ChallengeSnapshot | ProtocolError | undefined {
        if (!this.loomkeeperEnabled || this.runningLoomkeeperTurns.has(challengeId)) return undefined;
        const challenge = session.challenges.get(challengeId);
        const basis = this.coordinator.get(challengeId);
        if (!challenge || challenge.status !== 'active' || challenge.paused || !basis ||
            basis.state.phase !== 'awaiting_command' || basis.state.activeActor !== 'loomkeeper') {
            return undefined;
        }
        const decision = decideLoomkeeperTurn(basis.state, challenge.loomkeeperDifficulty);
        if (!decision) return undefined;
        if (!this.coordinator.canAppendReplayRecords(challengeId, decision.commands.length)) {
            return {
                code: 'COMMAND_REJECTED',
                message: 'The replay budget cannot commit the complete Loomkeeper plan.',
                retryable: false
            };
        }
        const current = this.coordinator.get(challengeId);
        if (!current || current.stateHash !== basis.stateHash ||
            current.state.revision !== decision.basisRevision ||
            current.state.turn !== decision.expectedTurn ||
            current.state.activeActor !== 'loomkeeper') {
            return undefined;
        }

        this.runningLoomkeeperTurns.add(challengeId);
        this.inOrderedSimulation = true;
        try {
            for (const command of decision.commands) {
                const live = this.coordinator.get(challengeId);
                if (!live || live.state.phase !== 'awaiting_command' ||
                    live.state.activeActor !== 'loomkeeper' ||
                    live.state.turn !== decision.expectedTurn) break;
                const update = this.coordinator.apply(
                    challengeId,
                    'loomkeeper',
                    command,
                    decision.expectedTurn
                );
                if (!update.transition.accepted) break;
            }
        } finally {
            this.inOrderedSimulation = false;
            this.runningLoomkeeperTurns.delete(challengeId);
        }
        const final = this.coordinator.get(challengeId);
        if (!final) return undefined;
        this.syncSimulationState(challenge, final);
        if (final.state.phase === 'finished') challenge.status = 'completed';
        return this.snapshot(session, challenge, session.nextSequence);
    }

    public activeSnapshot(session: Session): ChallengeSnapshot | undefined {
        const challenges = [...session.challenges.values()];
        const challenge = challenges.find((candidate) => candidate.status === 'active') ||
            challenges.reverse().find((candidate) => candidate.status === 'completed');
        return challenge && this.coordinator.get(challenge.id)
            ? this.snapshot(session, challenge, session.nextSequence)
            : undefined;
    }

    public replayForChallenge(session: Session, challengeId: string): CoordinatorReplay | undefined {
        const challenge = session.challenges.get(challengeId);
        return challenge ? this.coordinator.replay(challenge.id) : undefined;
    }

    public replayForSessionChallenge(
        sessionId: string,
        challengeId: string
    ): CoordinatorReplay | undefined {
        const session = this.sessions.get(sessionId);
        return session ? this.replayForChallenge(session, challengeId) : undefined;
    }

    public challengeMode(
        sessionId: string,
        challengeId: string
    ): Challenge['mode'] | undefined {
        return this.sessions.get(sessionId)?.challenges.get(challengeId)?.mode;
    }

    public socketIdsForWallet(address: string): string[] {
        const socketIds: string[] = [];
        for (const session of this.sessions.values()) {
            if (session.identity?.address === address && session.socketId && !this.isExpired(session)) {
                socketIds.push(session.socketId);
            }
        }
        return socketIds;
    }

    public takeChallengeResult(
        session: Session,
        challengeId: string,
        nextSequence: number
    ): ChallengeResult | undefined {
        const challenge = session.challenges.get(challengeId);
        const terminal = this.coordinator.takePendingTerminalResult(challengeId);
        if (!challenge || !terminal || challenge.resultEmitted) return undefined;
        challenge.resultEmitted = true;
        return this.completedResult(
            session.id,
            challenge,
            terminal.winner,
            terminal.tick,
            terminal.stateHash,
            nextSequence
        );
    }

    public advanceChallengeTicks(
        session: Session,
        challengeId: string,
        count: number
    ): ChallengeSnapshot | ProtocolError {
        const challenge = this.activeChallenge(session, challengeId);
        if (isProtocolError(challenge)) return challenge;
        if (challenge.paused) {
            return {
                code: 'COMMAND_REJECTED',
                message: 'Paused Practice Clashes do not advance simulation ticks.',
                retryable: false
            };
        }
        const update = this.coordinator.advance(challengeId, count);
        this.syncSimulationState(challenge, update);
        if (update.state.phase === 'finished') challenge.status = 'completed';
        return this.snapshot(session, challenge, session.nextSequence);
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
            nextSequence: session.nextSequence + 1,
            finalTick: this.coordinator.get(challenge.id)?.state.tick ?? null,
            finalStateHash: this.coordinator.get(challenge.id)?.stateHash ?? null
        };
        this.coordinator.delete(challenge.id);
        return result;
    }

    public setChallengePaused(
        session: Session,
        challengeId: string,
        paused: boolean
    ): ChallengeSnapshot | ProtocolError {
        const challenge = this.activeChallenge(session, challengeId);
        if (isProtocolError(challenge)) return challenge;
        if (challenge.mode !== 'practice') {
            return {
                code: 'COMMAND_REJECTED',
                message: 'Only Practice Clashes can be paused.',
                retryable: false
            };
        }
        if (challenge.paused === paused) {
            return this.snapshot(session, challenge);
        }
        const simulation = this.coordinator.get(challengeId);
        if (!simulation || simulation.state.phase !== 'awaiting_command' ||
            simulation.state.activeActor !== 'player') {
            return {
                code: 'COMMAND_REJECTED',
                message: 'Practice can pause only while awaiting your command.',
                retryable: false
            };
        }
        challenge.paused = paused;
        challenge.revision += 1;
        this.coordinator.setPaused(challengeId, paused);
        return this.snapshot(session, challenge);
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

    public async sequenceAsync<T>(
        session: Session,
        requestId: string,
        sequence: number,
        payload: unknown,
        operation: () => Promise<ProtocolAck<T>>
    ): Promise<ProtocolAck<T>> {
        const previous = this.sequenceLocks.get(session.id) ?? Promise.resolve();
        let release!: () => void;
        const current = new Promise<void>((resolve) => {
            release = resolve;
        });
        const queued = previous.then(() => current);
        this.sequenceLocks.set(session.id, queued);
        await previous;
        try {
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
                return failure(
                    requestId,
                    'SEQUENCE_GAP',
                    'The command sequence has a gap.',
                    true
                );
            }
            const ack = await operation();
            session.nextSequence += 1;
            session.replay.set(requestId, { hash, ack: ack as ProtocolAck<unknown> });
            while (session.replay.size > REPLAY_LIMIT) {
                const oldest = session.replay.keys().next().value;
                if (oldest === undefined) break;
                session.replay.delete(oldest);
            }
            return ack;
        } finally {
            release();
            if (this.sequenceLocks.get(session.id) === queued) {
                this.sequenceLocks.delete(session.id);
            }
        }
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
        this.sequenceLocks.delete(sessionId);
        this.coordinator.deleteForSession(sessionId);
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
        this.coordinator.dispose();
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
        const final = this.coordinator.get(challenge.id);
        this.onChallengeExpired?.({
            protocolVersion: PROTOCOL_VERSION,
            serverTimeMs: this.now(),
            sessionId: session.id,
            challengeId: challenge.id,
            outcome: 'expired',
            revision: challenge.revision,
            nextSequence,
            finalTick: final?.state.tick ?? null,
            finalStateHash: final?.stateHash ?? null
        }, session.socketId);
        this.coordinator.delete(challenge.id);
    }

    private snapshot(
        session: Session,
        challenge: Challenge,
        nextSequence = session.nextSequence + 1
    ): ChallengeSnapshot {
        const simulation = this.coordinator.get(challenge.id);
        if (!simulation) throw new Error(`Challenge ${challenge.id} has no simulation state.`);
        const fields = {
            protocolVersion: PROTOCOL_VERSION,
            serverTimeMs: this.now(),
            sessionId: session.id,
            challengeId: challenge.id,
            mode: challenge.mode,
            calling: challenge.calling,
            loomkeeperDifficulty: challenge.loomkeeperDifficulty,
            status: challenge.status,
            paused: challenge.paused,
            revision: challenge.revision,
            nextSequence,
            expiresAt: new Date(challenge.expiresAt).toISOString(),
            stateHash: simulation.stateHash
        };
        return simulation.state.rulesetId === LEGACY_RULESET_ID
            ? {
                ...fields,
                loomkeeperPolicyId: 'nimble-knots-loomkeeper-v1',
                simulation: simulation.state as LegacyChallengeSnapshot['simulation']
            }
            : {
                ...fields,
                loomkeeperPolicyId: 'nimble-knots-loomkeeper-v2',
                simulation: simulation.state as CurrentChallengeSnapshot['simulation']
            };
    }

    private onSimulationTransition(update: CoordinatorUpdate): void {
        const session = this.sessions.get(update.sessionId);
        const challenge = session?.challenges.get(update.challengeId);
        if (!session || !challenge) return;
        this.syncSimulationState(challenge, update);
        if (update.state.phase === 'finished') challenge.status = 'completed';
        if (this.inOrderedSimulation || update.transition.events.length === 0) return;
        const snapshot = this.snapshot(session, challenge, session.nextSequence);
        this.onChallengeSnapshot?.(snapshot, session.socketId);
        if (session.socketId) {
            const terminal = this.takeChallengeResult(
                session,
                challenge.id,
                session.nextSequence
            );
            if (terminal) this.onChallengeCompleted?.(terminal, session.socketId);
        }
        if (!challenge.paused && update.state.phase === 'awaiting_command' &&
            update.state.activeActor === 'loomkeeper') {
            this.queueLoomkeeperTurn(update.sessionId, update.challengeId);
        }
    }

    private queueLoomkeeperTurn(sessionId: string, challengeId: string): void {
        if (!this.loomkeeperEnabled || this.pendingLoomkeeperTurns.has(challengeId) ||
            this.runningLoomkeeperTurns.has(challengeId)) return;
        this.pendingLoomkeeperTurns.add(challengeId);
        queueMicrotask(() => {
            this.pendingLoomkeeperTurns.delete(challengeId);
            const session = this.sessions.get(sessionId);
            if (!session) return;
            const snapshot = this.driveLoomkeeperTurn(session, challengeId);
            if (!snapshot || 'code' in snapshot) return;
            this.onChallengeSnapshot?.(snapshot, session.socketId);
            if (session.socketId) {
                const terminal = this.takeChallengeResult(session, challengeId, session.nextSequence);
                if (terminal) this.onChallengeCompleted?.(terminal, session.socketId);
            }
        });
    }

    private completedResult(
        sessionId: string,
        challenge: Challenge,
        winner: 'player' | 'loomkeeper' | 'draw' | null,
        tick: number,
        stateHash: string,
        nextSequence: number
    ): ChallengeResult {
        return {
            protocolVersion: PROTOCOL_VERSION,
            serverTimeMs: this.now(),
            sessionId,
            challengeId: challenge.id,
            outcome: winner === 'player'
                ? 'player_win'
                : winner === 'loomkeeper'
                    ? 'loomkeeper_win'
                    : 'draw',
            revision: challenge.revision,
            nextSequence,
            finalTick: tick,
            finalStateHash: stateHash
        };
    }

    private syncSimulationState(
        challenge: Challenge,
        update: Pick<CoordinatorUpdate, 'state' | 'stateHash'>
    ): void {
        if (update.state.revision < challenge.simulationRevision) {
            throw new Error('Simulation revision cannot move backward.');
        }
        if (update.stateHash !== challenge.simulationStateHash) {
            challenge.revision += 1;
            challenge.simulationStateHash = update.stateHash;
        }
        challenge.simulationRevision = update.state.revision;
    }

    private openData(session: Session, token: string, resumed: boolean): SessionOpenData {
        return {
            protocolVersion: PROTOCOL_VERSION,
            serverTimeMs: this.now(),
            sessionId: session.id,
            token,
            resumed,
            expiresAt: new Date(session.expiresAt).toISOString(),
            ...(session.identity ? { identity: { ...session.identity } } : {})
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
