import { createHash, randomBytes } from 'crypto';

import type {
    ChallengeResult,
    ChallengeSnapshot,
    ProtocolAck,
    ProtocolError,
    SessionOpenData,
    WalletIdentity
} from '../../../shared/protocol';
import { PROTOCOL_VERSION, RequestIdSchema } from '../../../shared/protocol';
import { failure, success } from '../protocol/errors';
import {
    SimulationCoordinator,
    type CoordinatorReplay,
    type CoordinatorUpdate
} from '../simulation/coordinator';
import {
    LEGACY_RULESET_ID,
    LATEST_RULESET_ID,
    type SimulationCommand,
    type SimulationRulesetId
} from '../../../shared/simulation';
import {
    decideLoomkeeperTurn,
    LOOMKEEPER_MAX_COMMANDS,
    type LoomkeeperDifficulty
} from '../../../shared/loomkeeper';
import { issueToken, opaqueId, tokenDigest } from './token';
import { CURRENT_COMBAT_RULESET_ID, V8_LOOMKEEPER_POLICY_ID, V8_LOOMKEEPER_PROFILE_ID } from '../../../shared/combat-version';
import { V8_RULESET_ID, V8_R1_RULESET_ID, isV8RulesetId, type V8RulesetId, type SimulationIntentV8Family as SimulationIntentV8 } from '../../../shared/simulation-v8';
import { InputRequestV8FamilySchema as InputRequestV8Schema, InputCancelV8FamilySchema as InputCancelV8Schema,
    InputReleaseV8R1Schema, V8_INPUT_BYTES, jsonBytesV8,
    type ChallengeSnapshotV8Family as ChallengeSnapshotV8, type ChallengeResultV8Family as ChallengeResultV8, type InputAckV8Family as InputAckV8 } from '../../../shared/protocol-v8';
import { VersionedSimulationCoordinator } from '../simulation/versioned-coordinator';
import type { CoordinatorUpdateV8Family as CoordinatorUpdateV8, CoordinatorReplayV8Family as CoordinatorReplayV8, SimulationCoordinatorV8Options } from '../simulation/coordinator-v8';

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
    /** Absent on historical in-memory entries; V8 never enters a legacy snapshot. */
    rulesetId?: SimulationRulesetId | V8RulesetId;
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
    /**
     * Internal deterministic-test seam. Production challenges always use the
     * current ruleset when this is omitted.
     */
    simulationRulesetId?: SimulationRulesetId;
    seedSource?: (sessionId: string, practiceIndex: number) => number;
    loomkeeperEnabled?: boolean;
    loomkeeperDifficulty?: LoomkeeperDifficulty;
    /** Explicit dependency-injection fixture only. No environment/client activation. */
    v8TestOnly?: Pick<SimulationCoordinatorV8Options, 'nowUs' | 'yieldBatch' | 'tickIntervalMs' | 'maxReplayRecords' | 'maxReplayBytes'>;
    onChallengeSnapshotV8?: (snapshot: ChallengeSnapshotV8, socketId?: string) => void;
    onChallengeCompletedV8?: (result: ChallengeResultV8, socketId?: string) => void;
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
    private readonly simulationRulesetId: SimulationRulesetId;
    private readonly seedSource: (sessionId: string, practiceIndex: number) => number;
    private readonly loomkeeperEnabled: boolean;
    private readonly loomkeeperDifficulty: LoomkeeperDifficulty;
    private readonly pendingLoomkeeperTurns = new Set<string>();
    private readonly runningLoomkeeperTurns = new Set<string>();
    private readonly sequenceLocks = new Map<string, Promise<void>>();
    private inOrderedSimulation = false;
    private readonly versions: VersionedSimulationCoordinator;
    private readonly v8Enabled: boolean;
    private readonly onChallengeSnapshotV8?: SessionRegistryOptions['onChallengeSnapshotV8'];
    private readonly onChallengeCompletedV8?: SessionRegistryOptions['onChallengeCompletedV8'];
    private readonly v8Inputs = new Map<string, { next: number; admission: object;
        cache: Map<string, { hash: string; ack: InputAckV8 }>; cancels: Map<string,string>; releases: Map<string,string> }>();
    private readonly v8Locks = new Map<string, Promise<void>>();
    private readonly v8InInput = new Set<string>();

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
        this.simulationRulesetId = options.simulationRulesetId ?? CURRENT_COMBAT_RULESET_ID;
        this.v8Enabled = options.v8TestOnly !== undefined;
        this.onChallengeSnapshotV8 = options.onChallengeSnapshotV8;
        this.onChallengeCompletedV8 = options.onChallengeCompletedV8;
        this.loomkeeperEnabled = options.loomkeeperEnabled ?? true;
        this.loomkeeperDifficulty = options.loomkeeperDifficulty ?? 'standard';
        if (this.loomkeeperEnabled && options.simulationMaxReplayRecords !== undefined &&
            options.simulationMaxReplayRecords < MINIMUM_AUTOMATED_REPLAY_RECORDS) {
            throw new RangeError(
                `simulationMaxReplayRecords must be at least ${MINIMUM_AUTOMATED_REPLAY_RECORDS} ` +
                'while automated Loomkeeper turns are enabled.'
            );
        }
        this.versions = new VersionedSimulationCoordinator({ legacy: {
            maxReplayRecords: options.simulationMaxReplayRecords,
            tickIntervalMs: options.simulationTickIntervalMs === false
                ? undefined
                : options.simulationTickIntervalMs ?? 1_000,
            ticksPerInterval: options.simulationTicksPerInterval ?? 30,
            onTransition: (update) => this.onSimulationTransition(update)
        }, v8: { ...options.v8TestOnly,
            tickIntervalMs: options.v8TestOnly ? options.v8TestOnly.tickIntervalMs ?? 10 : undefined,
            onTransition: update => this.onSimulationTransitionV8(update) } });
        this.coordinator = this.versions.legacy;
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
        this.connectionBarrierV8(session, 'reconnect');
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
        this.connectionBarrierV8(session, 'disconnect');
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
                if (isV8RulesetId(existing.rulesetId)) return v8Error('COMMAND_REJECTED', 'An internal V8 fixture is already active.');
                return this.snapshot(session, existing);
            }
        }
        const closedIds = [...session.challenges]
            .filter(([, existing]) => existing.status !== 'active')
            .map(([id]) => id);
        while (closedIds.length > 1) {
            const removedId = closedIds.shift()!;
            session.challenges.delete(removedId);
            this.versions.delete(removedId);
            this.v8Inputs.delete(removedId);
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
            calling,
            this.simulationRulesetId
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
        if (isV8RulesetId(challenge.rulesetId)) return v8Error('COMMAND_REJECTED', 'V8 requires its dedicated input protocol.');
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
        const challenges = [...session.challenges.values()].filter(challenge => !isV8RulesetId(challenge.rulesetId));
        const challenge = challenges.find((candidate) => candidate.status === 'active') ||
            challenges.reverse().find((candidate) => candidate.status === 'completed');
        return challenge && this.coordinator.get(challenge.id)
            ? this.snapshot(session, challenge, session.nextSequence)
            : undefined;
    }

    public replayForChallenge(session: Session, challengeId: string): CoordinatorReplay | undefined {
        const challenge = session.challenges.get(challengeId);
        return challenge && !isV8RulesetId(challenge.rulesetId) ? this.coordinator.replay(challenge.id) : undefined;
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
        if (isV8RulesetId(challenge.rulesetId)) return v8Error('COMMAND_REJECTED', 'V8 requires its dedicated authority.');
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
        if (isV8RulesetId(challenge.rulesetId)) return v8Error('COMMAND_REJECTED', 'V8 requires its dedicated lifecycle.');
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
        if (isV8RulesetId(challenge.rulesetId)) return v8Error('COMMAND_REJECTED', 'V8 requires its dedicated lifecycle.');
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
        this.versions.deleteForSession(sessionId);
        for (const id of session.challenges.keys()) { this.v8Inputs.delete(id); this.v8Locks.delete(id); }
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
        this.versions.dispose();
        this.v8Inputs.clear(); this.v8Locks.clear();
    }

    public get size(): number {
        return this.sessions.size;
    }

    /** Internal B fixture: one injected configuration for BOTH modes; never called by public creation. */
    public createChallengeV8ForTest(session: Session, mode: Challenge['mode'], calling: Challenge['calling'],
        rulesetId: V8RulesetId = V8_RULESET_ID): ChallengeSnapshotV8 | ProtocolError {
        if (!isV8RulesetId(rulesetId)) return v8Error('BAD_REQUEST', 'Unknown V8 ruleset.');
        if (!this.v8Enabled) return v8Error('FEATURE_UNAVAILABLE', 'V8 test injection is disabled.');
        if (!this.boundSessionV8(session)) return v8Error('UNAUTHORIZED', 'The session is not bound.');
        this.sweep();
        for (const challenge of session.challenges.values()) {
            if (challenge.status === 'active') return v8Error('COMMAND_REJECTED', 'Finish or leave the current match first.');
        }
        const closed = [...session.challenges.keys()];
        while (closed.length > 1) {
            const id = closed.shift()!;
            session.challenges.delete(id); this.versions.delete(id); this.v8Inputs.delete(id);
        }
        const id = opaqueId();
        const snapshot = this.versions.create(id, session.id, this.seedSource(session.id,session.practiceSeedIndex++) >>> 0, calling, rulesetId);
        const challenge: Challenge = { id, rulesetId, mode, calling,
            loomkeeperDifficulty: 'standard', status: 'active', paused: false,
            revision: 0, simulationRevision: 0, simulationStateHash: snapshot.stateHash,
            expiresAt: Math.min(this.now()+this.challengeTtlMs,session.expiresAt), resultEmitted: false,
            playerCommandTurn: 0, playerCommandCount: 0 };
        session.challenges.set(id,challenge);
        this.v8Inputs.set(id,{next:0,admission:{},cache:new Map(),cancels:new Map(),releases:new Map()});
        return this.snapshotV8(session,challenge);
    }

    public hasChallengeV8(session: Session, id: string, rulesetId?: V8RulesetId): boolean {
        const stored = session.challenges.get(id)?.rulesetId;
        return isV8RulesetId(stored) && (rulesetId === undefined || stored === rulesetId);
    }
    public inputCursorV8(session: Session,id: string): number {
        return this.boundSessionV8(session) && this.hasChallengeV8(session,id) ? this.v8Inputs.get(id)?.next ?? 0 : 0;
    }
    public activeSnapshotV8(session: Session): ChallengeSnapshotV8 | undefined {
        const candidates = [...session.challenges.values()].filter(challenge => isV8RulesetId(challenge.rulesetId));
        const challenge = candidates.find(candidate => candidate.status === 'active') ?? candidates.at(-1);
        return challenge && this.versions.v8.get(challenge.id) ? this.snapshotV8(session,challenge) : undefined;
    }
    public deliverCurrentV8(session: Session): void {
        if (!this.boundSessionV8(session)) return;
        const current = this.activeSnapshotV8(session);
        if (current) this.publishV8(session,session.challenges.get(current.challengeId)!);
    }
    public replayForChallengeV8(session: Session, id: string): CoordinatorReplayV8 | undefined {
        return this.hasChallengeV8(session,id) ? this.versions.v8.replay(id) : undefined;
    }

    public async submitInputV8(session: Session, payload: unknown): Promise<InputAckV8> {
        const raw = payload as Record<string, unknown> | undefined;
        const requestId = safeRequestIdV8(raw?.requestId);
        const id = typeof raw?.challengeId === 'string' ? raw.challengeId : '';
        const failure = (code: ProtocolError['code'], message: string): InputAckV8 =>
            this.inputFailureV8(requestId,id,code,message);
        if (jsonBytesV8(payload) > V8_INPUT_BYTES) return failure('PAYLOAD_TOO_LARGE','V8 input exceeds 1024 bytes.');
        const parsed = InputRequestV8Schema.safeParse(payload);
        if (!parsed.success) return failure('BAD_REQUEST','Invalid V8 intent envelope.');
        if (!this.boundSessionV8(session) || !this.hasChallengeV8(session,id) || session.challenges.get(id)!.rulesetId !== parsed.data.rulesetId)
            return failure('UNAUTHORIZED','The exact V8 challenge is not owned by this session.');
        const socketId = session.socketId;
        const admission = this.v8Inputs.get(id)!.admission;
        return this.serialV8(id,async () => {
            if (!this.boundSessionV8(session) || session.socketId !== socketId || !this.hasChallengeV8(session,id)) return failure('UNAUTHORIZED','The V8 session is no longer bound.');
            const cursor = this.v8Inputs.get(id)!;
            const packet = parsed.data;
            const hash = requestHash(packet);
            const cached = cursor.cache.get(requestId);
            if (cached) return cached.hash === hash ? structuredClone(cached.ack) : failure('REPLAY_CONFLICT','The request ID has different content.');
            const fenced = () => packet.rulesetId === V8_R1_RULESET_ID &&
                (cursor.admission !== admission || this.versions.v8.get(id)!.state.inputEpoch !== packet.inputEpoch);
            if (fenced()) return failure('COMMAND_REJECTED','Input belongs to a released epoch.');
            if (packet.inputSequence !== cursor.next) return failure(packet.inputSequence < cursor.next ? 'STALE_SEQUENCE' : 'SEQUENCE_GAP','V8 input sequence is not the next cursor.');
            if (cursor.next === 0xFFFFFFFF) {
                this.versions.v8.safety(id,'sequence_limit');
                return failure('CHALLENGE_CLOSED','The V8 input sequence is exhausted.');
            }
            // Catch up real elapsed time BEFORE legality checks. Packets cannot supply clock credit.
            try { await this.versions.v8.catchUp(id); }
            catch { return failure('CHALLENGE_CLOSED','The V8 match is no longer available.'); }
            if (!this.boundSessionV8(session) || session.socketId !== socketId)
                return failure('UNAUTHORIZED','The input belongs to a disconnected transport.');
            // A release ack is the authoritative cursor fence. A not-yet-applied old request
            // cannot consume that cursor after the soft barrier, even if catch-up yielded.
            if (fenced()) return failure('COMMAND_REJECTED','Pending input was released.');
            let response: InputAckV8;
            this.v8InInput.add(id);
            try {
                const challenge = this.activeChallenge(session,id);
                cursor.next += 1;
                if (cursor.admission !== admission) response = failure('COMMAND_REJECTED','Pending input was cancelled.');
                else if (isProtocolError(challenge)) response = failure(challenge.code,challenge.message);
                else {
                    const update = this.versions.v8.apply(id,'player',packet.intent as SimulationIntentV8,packet.expectedTurn,packet.expectedPhase,packet.inputEpoch);
                    response = update.transition.accepted
                        ? { protocolVersion:8, requestId, nextInputSequence:cursor.next, ok:true, data:this.snapshotV8(session,challenge) }
                        : failure('COMMAND_REJECTED',update.transition.error?.message ?? 'V8 intent rejected.');
                }
            } finally { this.v8InInput.delete(id); }
            cursor.cache.set(requestId,{hash,ack:structuredClone(response)});
            while (cursor.cache.size > 256) cursor.cache.delete(cursor.cache.keys().next().value!);
            const challenge = session.challenges.get(id);
            if (challenge) this.publishV8(session,challenge);
            return response;
        });
    }

    /** Independent neutral-only lane. It never waits for a cursor, a normal request, or timer catch-up. */
    public cancelInputV8(session: Session, payload: unknown): InputAckV8 {
        const raw = payload as Record<string, unknown> | undefined;
        const requestId = safeRequestIdV8(raw?.requestId);
        const id = typeof raw?.challengeId === 'string' ? raw.challengeId : '';
        if (jsonBytesV8(payload) > V8_INPUT_BYTES) return this.inputFailureV8(requestId,id,'PAYLOAD_TOO_LARGE','V8 cancel exceeds 1024 bytes.');
        const parsed = InputCancelV8Schema.safeParse(payload);
        if (!parsed.success) return this.inputFailureV8(requestId,id,'BAD_REQUEST','Invalid V8 cancel envelope.');
        if (!this.boundSessionV8(session) || !this.hasChallengeV8(session,id) || session.challenges.get(id)!.rulesetId !== parsed.data.rulesetId)
            return this.inputFailureV8(requestId,id,'UNAUTHORIZED','The exact V8 challenge is not owned by this session.');
        const challenge = session.challenges.get(id)!;
        const cursor = this.v8Inputs.get(id)!;
        const hash = requestHash(parsed.data);
        const cached = cursor.cancels.get(requestId);
        if (cached && cached !== hash) return this.inputFailureV8(requestId,id,'REPLAY_CONFLICT','Cancel request ID has different content.');
        const state = this.versions.v8.get(id)!.state;
        if (!cached && state.activeActor === 'player' && (state.phase === 'action' || state.phase === 'retreat') &&
            state.turn === parsed.data.expectedTurn && state.inputEpoch === parsed.data.inputEpoch) {
            // Transport-only admission marker cancels even a not-yet-applied Jump while keeping
            // an already-neutral combat state/replay inert. Exact/stale cancels never change it.
            cursor.admission = {};
            cursor.cancels.set(requestId,hash);
            while (cursor.cancels.size > 256) cursor.cancels.delete(cursor.cancels.keys().next().value!);
            this.versions.v8.barrier(id,{reason:'cancel',actor:'player',expectedTurn:parsed.data.expectedTurn,expectedEpoch:parsed.data.inputEpoch});
        }
        return { protocolVersion:8,requestId,nextInputSequence:this.v8Inputs.get(id)!.next,ok:true,data:this.snapshotV8(session,challenge) };
    }

    /** Independent ordinary-release fence. Never truncates an already accepted hop. */
    public releaseInputV8(session: Session, payload: unknown): InputAckV8 {
        const raw = payload as Record<string, unknown> | undefined;
        const requestId = safeRequestIdV8(raw?.requestId);
        const id = typeof raw?.challengeId === 'string' ? raw.challengeId : '';
        if (jsonBytesV8(payload) > V8_INPUT_BYTES) return this.inputFailureV8(requestId,id,'PAYLOAD_TOO_LARGE','V8 release exceeds 1024 bytes.');
        const parsed = InputReleaseV8R1Schema.safeParse(payload);
        if (!parsed.success) return this.inputFailureV8(requestId,id,'BAD_REQUEST','Invalid V8 R1 release envelope.');
        if (!this.boundSessionV8(session) || session.challenges.get(id)?.rulesetId !== V8_R1_RULESET_ID)
            return this.inputFailureV8(requestId,id,'UNAUTHORIZED','The R1 challenge is not owned by this session.');
        const challenge = session.challenges.get(id)!;
        const cursor = this.v8Inputs.get(id)!;
        const hash = requestHash(parsed.data);
        const cached = cursor.releases.get(requestId);
        if (cached && cached !== hash) return this.inputFailureV8(requestId,id,'REPLAY_CONFLICT','Release request ID has different content.');
        const state = this.versions.v8.get(id)!.state;
        if (!cached && state.activeActor === 'player' && (state.phase === 'action' || state.phase === 'retreat') &&
            state.turn === parsed.data.expectedTurn && state.inputEpoch === parsed.data.inputEpoch) {
            cursor.admission = {};
            cursor.releases.set(requestId,hash);
            while (cursor.releases.size > 256) cursor.releases.delete(cursor.releases.keys().next().value!);
            this.versions.v8.barrier(id,{reason:'walk_stop',actor:'player',expectedTurn:parsed.data.expectedTurn,expectedEpoch:parsed.data.inputEpoch});
        }
        return { protocolVersion:8,requestId,nextInputSequence:cursor.next,ok:true,data:this.snapshotV8(session,challenge) };
    }

    public async setChallengePausedV8(session: Session,id: string,paused: boolean): Promise<ChallengeSnapshotV8 | ProtocolError> {
        if (!this.boundSessionV8(session) || !this.hasChallengeV8(session,id)) return v8Error('UNAUTHORIZED','V8 ownership required.');
        const socketId = session.socketId;
        return this.serialV8(id,async () => {
            const challenge = this.activeChallenge(session,id);
            if (isProtocolError(challenge)) return challenge;
            if (challenge.mode !== 'practice') return v8Error('COMMAND_REJECTED','Rewarded V8 matches cannot pause.');
            try {
                await this.versions.v8.catchUp(id);
                if (!this.boundSessionV8(session) || session.socketId !== socketId) return v8Error('UNAUTHORIZED','The pause transport disconnected.');
                const current = this.versions.v8.get(id)!;
                if (current.paused !== paused) {
                    const update = this.versions.v8.barrier(id,{reason:paused ? 'pause' : 'resume',actor:'player',
                        expectedTurn:current.state.turn,expectedEpoch:current.state.inputEpoch});
                    if (!update.transition.accepted) return v8Error('COMMAND_REJECTED','Pause needs grounded player action with no timer debt.');
                }
                return this.snapshotV8(session,challenge);
            } catch { return v8Error('COMMAND_REJECTED','Pause needs grounded player action with no timer debt.'); }
        });
    }

    public leaveChallengeV8(session: Session,id: string): ChallengeResultV8 | ProtocolError {
        if (!this.boundSessionV8(session) || !this.hasChallengeV8(session,id)) return v8Error('UNAUTHORIZED','V8 ownership required.');
        const challenge = this.activeChallenge(session,id);
        if (isProtocolError(challenge)) return challenge;
        this.v8InInput.add(id);
        try { this.versions.v8.safety(id,'left'); challenge.status = 'left'; }
        finally { this.v8InInput.delete(id); }
        this.publishV8(session,challenge);
        return this.resultV8(session,challenge,'left');
    }

    public advanceChallengeTicksV8ForTest(session: Session,id: string,count: number): ChallengeSnapshotV8 {
        if (!this.v8Enabled || !this.hasChallengeV8(session,id)) throw new Error('V8 test fixture required.');
        this.versions.v8.advance(id,count);
        return this.snapshotV8(session,session.challenges.get(id)!);
    }
    public applyIntentV8ForTest(session: Session,id: string,intent: SimulationIntentV8): ChallengeSnapshotV8 {
        if (!this.v8Enabled || !this.hasChallengeV8(session,id)) throw new Error('V8 test fixture required.');
        const state = this.versions.v8.get(id)!.state;
        const update = this.versions.v8.apply(id,state.activeActor,intent,state.turn,state.phase,state.inputEpoch);
        if (!update.transition.accepted) throw new Error(update.transition.error?.message);
        return this.snapshotV8(session,session.challenges.get(id)!);
    }
    private snapshotV8(session: Session,challenge: Challenge): ChallengeSnapshotV8 {
        const current = this.versions.v8.get(challenge.id)!;
        return { protocolVersion:8,serverTimeMs:this.now(),sessionId:session.id,challengeId:challenge.id,
            rulesetId:current.state.rulesetId,loomkeeperPolicyId:V8_LOOMKEEPER_POLICY_ID,loomkeeperProfileId:V8_LOOMKEEPER_PROFILE_ID,
            nextInputSequence:this.v8Inputs.get(challenge.id)!.next,nextSequence:session.nextSequence,
            mode:challenge.mode,calling:challenge.calling,status:challenge.status,paused:current.paused,
            expiresAt:new Date(challenge.expiresAt).toISOString(),simulation:current.state as ChallengeSnapshotV8['simulation'],stateHash:current.stateHash } as ChallengeSnapshotV8;
    }
    private resultV8(session: Session,challenge: Challenge,outcome: ChallengeResultV8['outcome']): ChallengeResultV8 {
        const snapshot = this.snapshotV8(session,challenge);
        return { protocolVersion:8,serverTimeMs:this.now(),sessionId:session.id,challengeId:challenge.id,
            rulesetId:snapshot.rulesetId,loomkeeperPolicyId:V8_LOOMKEEPER_POLICY_ID,loomkeeperProfileId:V8_LOOMKEEPER_PROFILE_ID,
            nextInputSequence:snapshot.nextInputSequence,outcome,finalTick:snapshot.simulation.tick,finalStateHash:snapshot.stateHash };
    }
    private inputFailureV8(requestId: string,id: string,code: ProtocolError['code'],message: string): InputAckV8 {
        return { protocolVersion:8,requestId,nextInputSequence:this.v8Inputs.get(id)?.next ?? 0,ok:false,error:v8Error(code,message) };
    }
    private boundSessionV8(session: Session): boolean {
        return Boolean(session.socketId && this.getBound(session.socketId) === session);
    }
    private connectionBarrierV8(session: Session,reason: 'disconnect' | 'reconnect'): void {
        for (const challenge of session.challenges.values()) {
            if (!isV8RulesetId(challenge.rulesetId) || challenge.status !== 'active') continue;
            const state = this.versions.v8.get(challenge.id)!.state;
            this.versions.v8.barrier(challenge.id,{reason,actor:'player',expectedTurn:state.turn,expectedEpoch:state.inputEpoch});
        }
    }
    private onSimulationTransitionV8(update: CoordinatorUpdateV8): void {
        const session = this.sessions.get(update.sessionId);
        const challenge = session?.challenges.get(update.challengeId);
        if (!session || !challenge) return;
        challenge.simulationStateHash = update.stateHash; challenge.simulationRevision = update.state.revision;
        challenge.paused = update.paused;
        if (update.state.phase === 'finished') challenge.status = update.unavailable ? 'expired' : 'completed';
        if (!this.v8InInput.has(challenge.id)) this.publishV8(session,challenge);
    }
    private publishV8(session: Session,challenge: Challenge): void {
        if (this.v8InInput.has(challenge.id)) return;
        const snapshot = this.snapshotV8(session,challenge);
        this.onChallengeSnapshotV8?.(snapshot,session.socketId);
        if (snapshot.simulation.phase !== 'finished' || challenge.resultEmitted || !this.boundSessionV8(session)) return;
        challenge.resultEmitted = true;
        const outcome = challenge.status === 'expired' ? 'expired' : challenge.status === 'left' ? 'left'
            : snapshot.simulation.winner === 'player' ? 'player_win' : snapshot.simulation.winner === 'loomkeeper' ? 'loomkeeper_win' : 'draw';
        this.onChallengeCompletedV8?.(this.resultV8(session,challenge,outcome),session.socketId);
    }
    private async serialV8<T>(id: string,operation: () => Promise<T>): Promise<T> {
        const previous = this.v8Locks.get(id) ?? Promise.resolve();
        let release!: () => void;
        const current = new Promise<void>(resolve => { release = resolve; });
        const queued = previous.then(() => current);
        this.v8Locks.set(id,queued);
        await previous;
        try { return await operation(); }
        finally { release(); if (this.v8Locks.get(id) === queued) this.v8Locks.delete(id); }
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
        if (isV8RulesetId(challenge.rulesetId)) {
            this.versions.v8.safety(challenge.id, 'expiry');
            challenge.status = 'expired';
            this.publishV8(session, challenge);
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

function v8Error(code: ProtocolError['code'],message: string): ProtocolError {
    return { code,message,retryable:false };
}
function safeRequestIdV8(value: unknown): string {
    const parsed = RequestIdSchema.safeParse(value);
    return parsed.success ? parsed.data : 'invalid-request';
}
