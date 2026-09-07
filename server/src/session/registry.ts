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
import { CURRENT_COMBAT_RULESET_ID, V8_AUTOMATION_ID, V8_LOOMKEEPER_POLICY_ID, V8_LOOMKEEPER_PROFILE_ID, V9_AUTOMATION_ID, type CombatRulesetId } from '../../../shared/combat-version';
import { V8_RULESET_ID, V8_R1_RULESET_ID, isV8RulesetId, type V8RulesetId, type SimulationIntentV8Family as SimulationIntentV8 } from '../../../shared/simulation-v8';
import { V9_RULESET_ID, type SimulationBarrierV9, type SimulationIntentV9, type SimulationStateV9 } from '../../../shared/simulation-v9';
import { InputRequestV8RuntimeSchema as InputRequestV8Schema, InputCancelV8RuntimeSchema as InputCancelV8Schema,
    InputReleaseV8AutomatedSchema, InputReleaseV8R1Schema, V8_INPUT_BYTES, jsonBytesV8,
    type ChallengeSnapshotV8Runtime as ChallengeSnapshotV8, type ChallengeResultV8Runtime as ChallengeResultV8,
    type CoordinatorReplayV8Runtime, type InputAckV8Runtime as InputAckV8 } from '../../../shared/protocol-v8';
import { VersionedSimulationCoordinator } from '../simulation/versioned-coordinator';
import type { CoordinatorUpdateV8Family as CoordinatorUpdateV8, SimulationCoordinatorV8Options } from '../simulation/coordinator-v8';
import { CandidateAckV9Schema, ChallengeResultV9Schema, ChallengeSnapshotV9Schema,
    InputCancelV9Schema, InputRequestV9Schema, V9_INPUT_BYTES, jsonBytesV9,
    type CandidateAckV9, type ChallengeResultV9, type ChallengeSnapshotV9,
    type CoordinatorReplayV9, type CoordinatorReplayV9Automated } from '../../../shared/protocol-v9';
import type { CoordinatorSnapshotV9, CoordinatorUpdateV9, SimulationCoordinatorV9Options } from '../simulation/coordinator-v9';

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
    rulesetId?: SimulationRulesetId | V8RulesetId | typeof V9_RULESET_ID;
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
    settlementEmitted?: boolean;
    automationId?: typeof V8_AUTOMATION_ID | typeof V9_AUTOMATION_ID;
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
    simulationRulesetId?: CombatRulesetId | typeof V9_RULESET_ID;
    /** Isolated no-wallet staging admission, never a client or fixture selector. */
    stagingPracticeV8?: 'staging-v8d-practice';
    /** Explicit deployed V9 Practice profile; real clocks, no reward/test authority. */
    practiceV9?: 'v9d-practice';
    seedSource?: (sessionId: string, practiceIndex: number) => number;
    loomkeeperEnabled?: boolean;
    loomkeeperDifficulty?: LoomkeeperDifficulty;
    /** Explicit dependency-injection fixture only. No environment/client activation. */
    v8TestOnly?: Pick<SimulationCoordinatorV8Options, 'nowUs' | 'yieldBatch' | 'tickIntervalMs' | 'maxReplayRecords' | 'maxReplayBytes'>;
    /** Explicit V9B test seam only; it creates no socket, lifecycle, reward, or selector route. */
    v9TestOnly?: Pick<SimulationCoordinatorV9Options, 'nowUs' | 'yieldBatch' | 'tickIntervalMs' | 'maxReplayRecords' | 'maxReplayBytes'>;
    onChallengeSnapshotV8?: (snapshot: ChallengeSnapshotV8, socketId?: string) => void;
    onChallengeCompletedV8?: (result: ChallengeResultV8, socketId?: string) => void;
    onChallengeSettledV8?: (result: ChallengeResultV8, replay: CoordinatorReplayV8Runtime) => void;
    onChallengeSnapshotV9?: (snapshot: ChallengeSnapshotV9, socketId?: string) => void;
    onChallengeCompletedV9?: (result: ChallengeResultV9, socketId?: string) => void;
    onChallengeSettledV9?: (result: ChallengeResultV9, replay: CoordinatorReplayV9Automated) => void;
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
    private readonly simulationRulesetId: CombatRulesetId | typeof V9_RULESET_ID;
    private readonly seedSource: (sessionId: string, practiceIndex: number) => number;
    private readonly loomkeeperEnabled: boolean;
    private readonly loomkeeperDifficulty: LoomkeeperDifficulty;
    private readonly pendingLoomkeeperTurns = new Set<string>();
    private readonly runningLoomkeeperTurns = new Set<string>();
    private readonly sequenceLocks = new Map<string, Promise<void>>();
    private inOrderedSimulation = false;
    private readonly versions: VersionedSimulationCoordinator;
    private readonly v8Enabled: boolean;
    private readonly v9Enabled: boolean;
    private readonly stagingPracticeV8: boolean;
    private readonly practiceV9: boolean;
    private readonly onChallengeSnapshotV8?: SessionRegistryOptions['onChallengeSnapshotV8'];
    private readonly onChallengeCompletedV8?: SessionRegistryOptions['onChallengeCompletedV8'];
    private readonly onChallengeSettledV8?: SessionRegistryOptions['onChallengeSettledV8'];
    private readonly onChallengeSnapshotV9?: SessionRegistryOptions['onChallengeSnapshotV9'];
    private readonly onChallengeCompletedV9?: SessionRegistryOptions['onChallengeCompletedV9'];
    private readonly onChallengeSettledV9?: SessionRegistryOptions['onChallengeSettledV9'];
    private readonly v8Inputs = new Map<string, { next: number; admission: object;
        cache: Map<string, { hash: string; ack: InputAckV8 }>; cancels: Map<string,string>; releases: Map<string,string> }>();
    private readonly v8Locks = new Map<string, Promise<void>>();
    private readonly v8InInput = new Set<string>();
    private readonly v9Inputs = new Map<string, { next: number; cache: Map<string, { hash: string; ack: CandidateAckV9 }>;
        cancels: Map<string, string>; releases: Map<string, string> }>();
    private readonly v9Locks = new Map<string, Promise<void>>();
    private readonly v9InInput = new Set<string>();

    public constructor(options: SessionRegistryOptions = {}) {
        if (options.stagingPracticeV8 !== undefined || options.practiceV9 !== undefined) {
            const overrides: (keyof SessionRegistryOptions)[] = [
                'simulationRulesetId', 'v8TestOnly', 'v9TestOnly', 'now', 'seedSource',
                'simulationTickIntervalMs', 'simulationTicksPerInterval', 'simulationMaxReplayRecords',
                'loomkeeperEnabled', 'loomkeeperDifficulty', 'sessionTtlMs', 'reconnectGraceMs',
                'tokenRecoveryMs', 'challengeTtlMs', 'sweepIntervalMs'
            ];
            if ((options.stagingPracticeV8 !== undefined && options.stagingPracticeV8 !== 'staging-v8d-practice') ||
                (options.practiceV9 !== undefined && options.practiceV9 !== 'v9d-practice') ||
                (options.stagingPracticeV8 !== undefined && options.practiceV9 !== undefined) ||
                overrides.some(name => options[name] !== undefined)) {
                throw new Error('Deployed Practice refuses conflicting simulation or fixture options.');
            }
        }
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
        this.stagingPracticeV8 = options.stagingPracticeV8 !== undefined;
        this.practiceV9 = options.practiceV9 !== undefined;
        this.simulationRulesetId = this.stagingPracticeV8
            ? V8_R1_RULESET_ID : this.practiceV9 ? V9_RULESET_ID : options.simulationRulesetId ?? CURRENT_COMBAT_RULESET_ID;
        this.v8Enabled = options.v8TestOnly !== undefined;
        this.v9Enabled = options.v9TestOnly !== undefined;
        this.onChallengeSnapshotV8 = options.onChallengeSnapshotV8;
        this.onChallengeCompletedV8 = options.onChallengeCompletedV8;
        this.onChallengeSettledV8 = options.onChallengeSettledV8;
        this.onChallengeSnapshotV9 = options.onChallengeSnapshotV9;
        this.onChallengeCompletedV9 = options.onChallengeCompletedV9;
        this.onChallengeSettledV9 = options.onChallengeSettledV9;
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
            tickIntervalMs: this.stagingPracticeV8 ? 10
                : options.v8TestOnly ? options.v8TestOnly.tickIntervalMs ?? 10 : undefined,
            onTransition: update => this.onSimulationTransitionV8(update) },
        v9: { ...options.v9TestOnly, tickIntervalMs: this.practiceV9 ? 10 : options.v9TestOnly?.tickIntervalMs,
            onSafetyStop: this.practiceV9 ? diagnostic => console.warn('[v9-practice-stop]', JSON.stringify(diagnostic)) : undefined,
            onTransition: update => this.onSimulationTransitionV9(update) } });
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
        this.connectionBarrierV9(session, 'reconnect');
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
        this.connectionBarrierV9(session, 'disconnect');
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
        if (isV8RulesetId(this.simulationRulesetId) || this.simulationRulesetId === V9_RULESET_ID) {
            return {
                code: 'FEATURE_UNAVAILABLE',
                message: 'This combat version requires the versioned creation protocol.',
                retryable: false
            };
        }
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

    public legacyCreationAvailable(): boolean {
        return !isV8RulesetId(this.simulationRulesetId) && this.simulationRulesetId !== V9_RULESET_ID;
    }

    public createSelectedChallenge(
        session: Session,
        mode: Challenge['mode'],
        calling: Challenge['calling'],
        reward?: { challengeId: string; seed: number }
    ): { kind: 'legacy'; snapshot: ChallengeSnapshot } |
       { kind: 'v8'; snapshot: ChallengeSnapshotV8 } | ProtocolError {
        if (this.stagingPracticeV8 && (mode !== 'practice' || reward !== undefined)) {
            return v8Error('FEATURE_UNAVAILABLE', 'V8D staging admits wallet-free Practice only.');
        }
        if (this.simulationRulesetId === V9_RULESET_ID) {
            return v8Error('FEATURE_UNAVAILABLE', 'The selected combat candidate is unavailable.');
        }
        if (!isV8RulesetId(this.simulationRulesetId)) {
            const snapshot = this.createChallenge(session, mode, calling, reward);
            return 'code' in snapshot ? snapshot : { kind: 'legacy', snapshot };
        }
        if (this.simulationRulesetId !== V8_R1_RULESET_ID || (!this.v8Enabled && !this.stagingPracticeV8)) {
            return v8Error('FEATURE_UNAVAILABLE', 'The selected combat candidate is unavailable.');
        }
        const snapshot = this.createChallengeAutomated(session, mode, calling, reward);
        return 'code' in snapshot ? snapshot : { kind: 'v8', snapshot: { ...snapshot, nextSequence: session.nextSequence + 1 } };
    }

    /**
     * V9B injection seam for server-only parity/replay tests. It never enters a
     * Session challenge, protocol event, normal creation selector, or settlement.
     */
    public createV9TestChallenge(session: Session, mode: 'practice' | 'reward',
        calling: Challenge['calling'], seed: number, challengeId = opaqueId()): CoordinatorSnapshotV9 {
        this.requireV9TestOnly(session);
        // Mode is intentionally accepted solely to prove both policy callers share the V9 core.
        void mode;
        return this.versions.v9.create(challengeId, session.id, seed >>> 0 || 1, calling);
    }
    public applyV9Test(challengeId: string, actor: 'player' | 'loomkeeper', intent: SimulationIntentV9,
        expectedTurn: number, expectedPhase: SimulationStateV9['phase'], expectedEpoch: number): CoordinatorUpdateV9 {
        this.requireV9TestOnly();
        return this.versions.v9.apply(challengeId, actor, intent, expectedTurn, expectedPhase, expectedEpoch);
    }
    public barrierV9Test(challengeId: string, barrier: SimulationBarrierV9): CoordinatorUpdateV9 {
        this.requireV9TestOnly(); return this.versions.v9.barrier(challengeId, barrier);
    }
    public advanceV9Test(challengeId: string, count: number): CoordinatorUpdateV9 {
        this.requireV9TestOnly(); return this.versions.v9.advance(challengeId, count);
    }
    public snapshotV9Test(challengeId: string): CoordinatorSnapshotV9 | undefined {
        this.requireV9TestOnly(); return this.versions.v9.get(challengeId);
    }
    public replayV9Test(challengeId: string): CoordinatorReplayV9 | undefined {
        this.requireV9TestOnly(); return this.versions.v9.replay(challengeId);
    }

    private createChallengeAutomated(
        session: Session,
        mode: Challenge['mode'],
        calling: Challenge['calling'],
        reward?: { challengeId: string; seed: number }
    ): ChallengeSnapshotV8 | ProtocolError {
        if (mode === 'reward' && !reward) {
            return v8Error('FEATURE_UNAVAILABLE', 'A durable reward reservation is required.');
        }
        if (!this.boundSessionV8(session)) return v8Error('UNAUTHORIZED', 'The session is not bound.');
        this.sweep();
        for (const existing of session.challenges.values()) {
            if (existing.status === 'active') {
                return v8Error('COMMAND_REJECTED', 'Finish or leave the current match first.');
            }
        }
        const closed = [...session.challenges.keys()];
        while (closed.length > 1) {
            const id = closed.shift()!;
            session.challenges.delete(id);
            this.versions.delete(id);
            this.v8Inputs.delete(id);
        }
        const id = reward?.challengeId ?? opaqueId();
        const seed = reward?.seed ?? this.seedSource(session.id, session.practiceSeedIndex++) >>> 0;
        const snapshot = this.versions.createAutomated(id, session.id, seed, calling);
        const challenge: Challenge = {
            id,
            rulesetId: V8_R1_RULESET_ID,
            automationId: V8_AUTOMATION_ID,
            mode,
            calling,
            loomkeeperDifficulty: 'standard',
            status: 'active',
            paused: false,
            revision: 0,
            simulationRevision: 0,
            simulationStateHash: snapshot.stateHash,
            expiresAt: Math.min(this.now() + this.challengeTtlMs, session.expiresAt),
            resultEmitted: false,
            settlementEmitted: false,
            playerCommandTurn: 0,
            playerCommandCount: 0
        };
        session.challenges.set(id, challenge);
        this.v8Inputs.set(id, {
            next: 0, admission: {}, cache: new Map(), cancels: new Map(), releases: new Map()
        });
        return this.snapshotV8(session, challenge);
    }

    /**
     * Candidate-only V9 creation. It is deliberately unreachable from the
     * ordinary selector: callers must hold the explicit V9 test/candidate seam
     * and use the V9 wire ownership envelope.
     */
    public createChallengeAutomatedV9(
        session: Session,
        mode: Challenge['mode'],
        calling: Challenge['calling'],
        reward?: { challengeId: string; seed: number }
    ): ChallengeSnapshotV9 | ProtocolError {
        const admission = this.admitChallengeAutomatedV9(session, mode, reward?.challengeId);
        if (admission) return admission;
        const closed = [...session.challenges.keys()];
        while (closed.length > 1) {
            const id = closed.shift()!;
            session.challenges.delete(id); this.versions.delete(id); this.v9Inputs.delete(id); this.v9Locks.delete(id);
        }
        const id = reward?.challengeId ?? opaqueId();
        const seed = reward?.seed ?? this.seedSource(session.id, session.practiceSeedIndex++) >>> 0;
        const snapshot = this.versions.createAutomatedV9(id, session.id, seed || 1, calling);
        const challenge: Challenge = {
            id, rulesetId: V9_RULESET_ID, automationId: V9_AUTOMATION_ID, mode, calling,
            loomkeeperDifficulty: 'standard', status: 'active', paused: false, revision: 0,
            simulationRevision: 0, simulationStateHash: snapshot.stateHash,
            expiresAt: Math.min(this.now() + this.challengeTtlMs, session.expiresAt),
            resultEmitted: false, settlementEmitted: false, playerCommandTurn: 0, playerCommandCount: 0
        };
        session.challenges.set(id, challenge);
        this.v9Inputs.set(id, { next: 0, cache: new Map(), cancels: new Map(), releases: new Map() });
        return this.snapshotV9(session, challenge);
    }

    /**
     * Checks every V9 creation condition before a reward reservation is moved
     * in-progress.  It has no creation, cursor, or reward side effect.
     */
    public admitChallengeAutomatedV9(session: Session, mode: Challenge['mode'], rewardChallengeId?: string): ProtocolError | undefined {
        this.sweep();
        if ((!this.v9Enabled && !this.practiceV9) || this.simulationRulesetId !== V9_RULESET_ID)
            return v8Error('FEATURE_UNAVAILABLE', 'The V9 candidate is unavailable.');
        if (this.practiceV9 && (mode !== 'practice' || rewardChallengeId !== undefined))
            return v8Error('FEATURE_UNAVAILABLE', 'Deployed V9 Practice refuses reward creation and reservation metadata.');
        if (mode === 'reward' && !rewardChallengeId)
            return v8Error('FEATURE_UNAVAILABLE', 'A durable reward reservation is required.');
        if (!this.boundSessionV9(session)) return v8Error('UNAUTHORIZED', 'The V9 session is not bound.');
        for (const current of session.challenges.values()) {
            if (current.status === 'active') return v8Error('COMMAND_REJECTED', 'Finish or leave the current match first.');
        }
        if (rewardChallengeId && session.challenges.has(rewardChallengeId))
            return v8Error('COMMAND_REJECTED', 'The reward challenge identifier is no longer available.');
        return undefined;
    }

    public hasChallengeV9(session: Session, id: string): boolean {
        const challenge = session.challenges.get(id);
        return this.boundSessionV9(session) && challenge?.rulesetId === V9_RULESET_ID &&
            challenge.automationId === V9_AUTOMATION_ID;
    }

    public ownsChallengePacketV9(session: Session, id: string, packet: { rulesetId: typeof V9_RULESET_ID; automationId: typeof V9_AUTOMATION_ID }): boolean {
        return this.hasChallengeV9(session, id) && packet.rulesetId === V9_RULESET_ID && packet.automationId === V9_AUTOMATION_ID;
    }

    public inputCursorV9(session: Session, id: string): number {
        return this.hasChallengeV9(session, id) ? this.v9Inputs.get(id)?.next ?? 0 : 0;
    }

    public activeSnapshotV9(session: Session): ChallengeSnapshotV9 | undefined {
        const candidates = [...session.challenges.values()].filter(challenge => challenge.rulesetId === V9_RULESET_ID);
        const challenge = candidates.find(candidate => candidate.status === 'active') ?? candidates.at(-1);
        return challenge && this.versions.v9.get(challenge.id) ? this.snapshotV9(session, challenge) : undefined;
    }

    public deliverCurrentV9(session: Session): void {
        if (!this.boundSessionV9(session)) return;
        const current = this.activeSnapshotV9(session);
        if (current) this.publishV9(session, session.challenges.get(current.challengeId)!);
    }

    public replayForChallengeV9(session: Session, id: string): CoordinatorReplayV9Automated | undefined {
        const replay = this.hasChallengeV9(session, id) ? this.versions.v9.replay(id) : undefined;
        return replay && 'automationId' in replay ? replay as CoordinatorReplayV9Automated : undefined;
    }

    public async submitInputV9(session: Session, payload: unknown): Promise<CandidateAckV9> {
        const raw = payload as Record<string, unknown> | undefined;
        const requestId = safeRequestIdV8(raw?.requestId);
        const id = typeof raw?.challengeId === 'string' ? raw.challengeId : '';
        const failure = (code: ProtocolError['code'], message: string): CandidateAckV9 =>
            this.inputFailureV9(requestId, id, code, message);
        if (jsonBytesV9(payload) > V9_INPUT_BYTES) return failure('PAYLOAD_TOO_LARGE', 'V9 input exceeds 1024 bytes.');
        const parsed = InputRequestV9Schema.safeParse(payload);
        if (!parsed.success) return failure('BAD_REQUEST', 'Invalid V9 intent envelope.');
        if (!this.ownsChallengePacketV9(session, id, parsed.data)) return failure('UNAUTHORIZED', 'The exact V9 challenge is not owned by this session.');
        const socketId = session.socketId;
        return this.serialV9(id, async () => {
            if (!this.boundSessionV9(session) || session.socketId !== socketId || !this.ownsChallengePacketV9(session, id, parsed.data))
                return failure('UNAUTHORIZED', 'The V9 session is no longer bound.');
            const cursor = this.v9Inputs.get(id)!;
            const packet = parsed.data;
            const hash = requestHash(packet);
            const cached = cursor.cache.get(requestId);
            if (cached) return cached.hash === hash ? structuredClone(cached.ack) : failure('REPLAY_CONFLICT', 'The request ID has different content.');
            if (packet.inputSequence !== cursor.next) return failure(packet.inputSequence < cursor.next ? 'STALE_SEQUENCE' : 'SEQUENCE_GAP', 'V9 input sequence is not the next cursor.');
            if (cursor.next === 0xFFFFFFFF) {
                this.versions.v9.safety(id, 'sequence_limit');
                return failure('CHALLENGE_CLOSED', 'The V9 input sequence is exhausted.');
            }
            try { await this.versions.v9.catchUp(id); }
            catch { return failure('CHALLENGE_CLOSED', 'The V9 match is no longer available.'); }
            // The post-await ownership check is the handoff fence: a stale socket
            // cannot spend the input cursor after a reconnect or leave.
            if (!this.boundSessionV9(session) || session.socketId !== socketId || !this.ownsChallengePacketV9(session, id, packet))
                return failure('UNAUTHORIZED', 'The V9 input belongs to a disconnected transport.');
            const challenge = this.activeChallenge(session, id);
            if (isProtocolError(challenge)) return failure(challenge.code, challenge.message);
            cursor.next += 1;
            this.v9InInput.add(id);
            let response: CandidateAckV9;
            try {
                const update = this.versions.v9.apply(id, 'player', packet.intent as SimulationIntentV9, packet.expectedTurn, packet.expectedPhase, packet.inputEpoch);
                response = update.transition.accepted
                    ? this.v9Success(requestId, session, challenge)
                    : failure('COMMAND_REJECTED', update.transition.error?.message ?? 'V9 intent rejected.');
            } finally { this.v9InInput.delete(id); }
            cursor.cache.set(requestId, { hash, ack: structuredClone(response) });
            while (cursor.cache.size > 256) cursor.cache.delete(cursor.cache.keys().next().value!);
            if (session.challenges.has(id)) this.publishV9(session, session.challenges.get(id)!);
            return response;
        });
    }

    /** Neutral V9 cancellation has its own lane and never consumes the input cursor. */
    public async cancelInputV9(session: Session, payload: unknown): Promise<CandidateAckV9> {
        return this.neutralInputV9(session, payload, 'cancel');
    }

    /** A V9 release stops ordinary held movement but preserves a committed leap. */
    public async releaseInputV9(session: Session, payload: unknown): Promise<CandidateAckV9> {
        return this.neutralInputV9(session, payload, 'walk_stop');
    }

    public async setChallengePausedV9(session: Session, id: string, paused: boolean): Promise<ChallengeSnapshotV9 | ProtocolError> {
        if (!this.hasChallengeV9(session, id)) return v8Error('UNAUTHORIZED', 'V9 ownership required.');
        const socketId = session.socketId;
        return this.serialV9(id, async () => {
            const challenge = this.activeChallenge(session, id);
            if (isProtocolError(challenge)) return challenge;
            if (challenge.mode !== 'practice') return v8Error('COMMAND_REJECTED', 'Rewarded V9 matches cannot pause.');
            try {
                await this.versions.v9.catchUp(id);
                if (!this.boundSessionV9(session) || session.socketId !== socketId || !this.hasChallengeV9(session, id))
                    return v8Error('UNAUTHORIZED', 'The pause transport disconnected.');
                await this.versions.v9.setPaused(id, paused);
                return this.snapshotV9(session, challenge);
            } catch { return v8Error('COMMAND_REJECTED', 'Pause needs a stable player action with no timer debt.'); }
        });
    }

    public leaveChallengeV9(session: Session, id: string): ChallengeResultV9 | ProtocolError {
        if (!this.hasChallengeV9(session, id)) return v8Error('UNAUTHORIZED', 'V9 ownership required.');
        const challenge = this.activeChallenge(session, id);
        if (isProtocolError(challenge)) return challenge;
        this.v9InInput.add(id);
        try { this.versions.v9.safety(id, 'left'); challenge.status = 'left'; }
        finally { this.v9InInput.delete(id); }
        const result = this.resultV9(session, challenge, 'left');
        this.settleV9(session, challenge, result);
        return result;
    }

    private async neutralInputV9(
        session: Session,
        payload: unknown,
        reason: 'cancel' | 'walk_stop'
    ): Promise<CandidateAckV9> {
        const raw = payload as Record<string, unknown> | undefined;
        const requestId = safeRequestIdV8(raw?.requestId);
        const id = typeof raw?.challengeId === 'string' ? raw.challengeId : '';
        const fail = (code: ProtocolError['code'], message: string) =>
            this.inputFailureV9(requestId, '', code, message);
        if (jsonBytesV9(payload) > V9_INPUT_BYTES)
            return fail('PAYLOAD_TOO_LARGE', 'V9 neutral input exceeds 1024 bytes.');
        const parsed = InputCancelV9Schema.safeParse(payload);
        if (!parsed.success) return fail('BAD_REQUEST', 'Invalid V9 neutral input envelope.');
        if (!this.ownsChallengePacketV9(session, id, parsed.data))
            return fail('UNAUTHORIZED', 'The exact V9 challenge is not owned by this session.');
        const socketId = session.socketId;
        return this.serialV9(id, async () => {
            if (!this.boundSessionV9(session) || session.socketId !== socketId || !this.ownsChallengePacketV9(session, id, parsed.data))
                return fail('UNAUTHORIZED', 'The V9 neutral input belongs to a disconnected transport.');
            const challenge = this.activeChallenge(session, id);
            if (isProtocolError(challenge)) return fail(challenge.code, challenge.message);
            const cursor = this.v9Inputs.get(id)!;
            const cache = reason === 'cancel' ? cursor.cancels : cursor.releases;
            const digest = requestHash(parsed.data);
            const cached = cache.get(requestId);
            if (cached && cached !== digest)
                return fail('REPLAY_CONFLICT', 'V9 neutral request ID has different content.');
            if (!cached) {
                try { await this.versions.v9.catchUp(id); }
                catch { return fail('CHALLENGE_CLOSED', 'The V9 match is no longer available.'); }
                if (!this.boundSessionV9(session) || session.socketId !== socketId || !this.ownsChallengePacketV9(session, id, parsed.data))
                    return fail('UNAUTHORIZED', 'The V9 neutral input belongs to a disconnected transport.');
                const state = this.versions.v9.get(id)?.state;
                if (state && state.activeActor === 'player' && (state.phase === 'action' || state.phase === 'retreat') &&
                    state.turn === parsed.data.expectedTurn && state.inputEpoch === parsed.data.inputEpoch) {
                    this.v9InInput.add(id);
                    try { this.versions.v9.barrier(id, { reason, actor: 'player', expectedTurn: state.turn, expectedEpoch: state.inputEpoch }); }
                    finally { this.v9InInput.delete(id); }
                }
                cache.set(requestId, digest);
                while (cache.size > 256) cache.delete(cache.keys().next().value!);
            }
            const response = this.v9Success(requestId, session, challenge);
            this.publishV9(session, challenge);
            return response;
        });
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

    public hasActiveCombat(session: Session): boolean {
        return [...session.challenges.values()].some(challenge => challenge.status === 'active');
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
        for (const challenge of session.challenges.values()) {
            if ((challenge.automationId === V8_AUTOMATION_ID || challenge.automationId === V9_AUTOMATION_ID) && challenge.status === 'active')
                this.expireChallenge(session, challenge);
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
        for (const id of session.challenges.keys()) { this.v8Inputs.delete(id); this.v8Locks.delete(id); this.v9Inputs.delete(id); this.v9Locks.delete(id); }
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
        for (const session of this.sessions.values()) for (const challenge of session.challenges.values()) {
            if ((challenge.automationId === V8_AUTOMATION_ID || challenge.automationId === V9_AUTOMATION_ID) && challenge.status === 'active')
                this.expireChallenge(session, challenge);
        }
        this.sessions.clear();
        this.sessionsByDigest.clear();
        this.sessionsBySocket.clear();
        this.versions.dispose();
        this.v8Inputs.clear(); this.v8Locks.clear(); this.v9Inputs.clear(); this.v9Locks.clear();
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
    public ownsChallengePacketV8(session: Session, id: string,
        packet: { rulesetId: V8RulesetId; automationId?: unknown }): boolean {
        const challenge = session.challenges.get(id);
        return this.boundSessionV8(session) && !!challenge && this.packetOwnsV8(challenge, packet);
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
    public replayForChallengeV8(session: Session, id: string): CoordinatorReplayV8Runtime | undefined {
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
        if (!this.boundSessionV8(session) || !this.hasChallengeV8(session,id) || !this.packetOwnsV8(session.challenges.get(id)!, parsed.data))
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
        if (!this.boundSessionV8(session) || !this.hasChallengeV8(session,id) || !this.packetOwnsV8(session.challenges.get(id)!, parsed.data))
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
        const parsed = (raw?.automationId === V8_AUTOMATION_ID
            ? InputReleaseV8AutomatedSchema : InputReleaseV8R1Schema).safeParse(payload);
        if (!parsed.success) return this.inputFailureV8(requestId,id,'BAD_REQUEST','Invalid V8 R1 release envelope.');
        if (!this.boundSessionV8(session) || !session.challenges.has(id) || !this.packetOwnsV8(session.challenges.get(id)!, parsed.data))
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
            expiresAt:new Date(challenge.expiresAt).toISOString(),simulation:current.state as ChallengeSnapshotV8['simulation'],stateHash:current.stateHash,
            ...(challenge.automationId ? { automationId: challenge.automationId } : {}) } as ChallengeSnapshotV8;
    }
    private resultV8(session: Session,challenge: Challenge,outcome: ChallengeResultV8['outcome']): ChallengeResultV8 {
        const snapshot = this.snapshotV8(session,challenge);
        return { protocolVersion:8,serverTimeMs:this.now(),sessionId:session.id,challengeId:challenge.id,
            rulesetId:snapshot.rulesetId,loomkeeperPolicyId:V8_LOOMKEEPER_POLICY_ID,loomkeeperProfileId:V8_LOOMKEEPER_PROFILE_ID,
            ...('automationId' in snapshot ? { automationId: snapshot.automationId } : {}),
            nextInputSequence:snapshot.nextInputSequence,outcome,finalTick:snapshot.simulation.tick,finalStateHash:snapshot.stateHash } as ChallengeResultV8;
    }
    private inputFailureV8(requestId: string,id: string,code: ProtocolError['code'],message: string): InputAckV8 {
        return { protocolVersion:8,requestId,nextInputSequence:this.v8Inputs.get(id)?.next ?? 0,ok:false,error:v8Error(code,message) };
    }
    private boundSessionV8(session: Session): boolean {
        return Boolean(session.socketId && this.getBound(session.socketId) === session);
    }
    private packetOwnsV8(challenge: Challenge, packet: { rulesetId: V8RulesetId; automationId?: unknown }): boolean {
        const automationId = 'automationId' in packet ? packet.automationId : undefined;
        return challenge.rulesetId === packet.rulesetId && challenge.automationId === automationId;
    }
    private connectionBarrierV8(session: Session,reason: 'disconnect' | 'reconnect'): void {
        for (const challenge of session.challenges.values()) {
            if (!isV8RulesetId(challenge.rulesetId) || challenge.status !== 'active') continue;
            const state = this.versions.v8.get(challenge.id)!.state;
            this.versions.v8.barrier(challenge.id,{reason,actor:'player',expectedTurn:state.turn,expectedEpoch:state.inputEpoch});
        }
    }
    private boundSessionV9(session: Session): boolean {
        return Boolean(session.socketId && this.getBound(session.socketId) === session);
    }
    private connectionBarrierV9(session: Session, reason: 'disconnect' | 'reconnect'): void {
        for (const challenge of session.challenges.values()) {
            if (challenge.rulesetId !== V9_RULESET_ID || challenge.status !== 'active') continue;
            const current = this.versions.v9.get(challenge.id);
            if (!current) continue;
            this.versions.v9.barrier(challenge.id, { reason, actor: 'player', expectedTurn: current.state.turn, expectedEpoch: current.state.inputEpoch });
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
        if (snapshot.simulation.phase !== 'finished') return;
        const outcome = challenge.status === 'expired' ? 'expired' : challenge.status === 'left' ? 'left'
            : snapshot.simulation.winner === 'player' ? 'player_win' : snapshot.simulation.winner === 'loomkeeper' ? 'loomkeeper_win' : 'draw';
        const result = this.resultV8(session,challenge,outcome);
        if (!challenge.settlementEmitted) {
            challenge.settlementEmitted = true;
            const replay = this.versions.v8.replay(challenge.id);
            if (replay) this.onChallengeSettledV8?.(result,replay);
        }
        if (challenge.resultEmitted || !this.boundSessionV8(session)) return;
        challenge.resultEmitted = true;
        this.onChallengeCompletedV8?.(result,session.socketId);
    }
    private snapshotV9(session: Session, challenge: Challenge): ChallengeSnapshotV9 {
        const current = this.versions.v9.get(challenge.id);
        if (!current || challenge.rulesetId !== V9_RULESET_ID || challenge.automationId !== V9_AUTOMATION_ID)
            throw new Error(`V9 challenge ${challenge.id} has no automated state.`);
        return ChallengeSnapshotV9Schema.parse({
            protocolVersion: 9, serverTimeMs: this.now(), sessionId: session.id, challengeId: challenge.id,
            rulesetId: V9_RULESET_ID, automationId: V9_AUTOMATION_ID,
            loomkeeperPolicyId: 'nimble-knots-loomkeeper-v4', loomkeeperProfileId: 'standard-v9-0',
            mode: challenge.mode, calling: challenge.calling, status: challenge.status, paused: current.paused,
            nextSequence: session.nextSequence, nextInputSequence: this.v9Inputs.get(challenge.id)?.next ?? 0,
            expiresAt: new Date(challenge.expiresAt).toISOString(), simulation: current.state, stateHash: current.stateHash
        });
    }
    private resultV9(session: Session, challenge: Challenge, outcome?: ChallengeResultV9['outcome']): ChallengeResultV9 {
        const current = this.versions.v9.get(challenge.id);
        const settledOutcome = outcome ?? (challenge.status === 'expired' ? 'expired' : challenge.status === 'left' ? 'left'
            : current?.state.winner === 'player' ? 'player_win' : current?.state.winner === 'loomkeeper' ? 'loomkeeper_win' : 'draw');
        return ChallengeResultV9Schema.parse({
            protocolVersion: 9, serverTimeMs: this.now(), sessionId: session.id, challengeId: challenge.id,
            rulesetId: V9_RULESET_ID, automationId: V9_AUTOMATION_ID,
            loomkeeperPolicyId: 'nimble-knots-loomkeeper-v4', loomkeeperProfileId: 'standard-v9-0',
            nextSequence: session.nextSequence, nextInputSequence: this.v9Inputs.get(challenge.id)?.next ?? 0,
            outcome: settledOutcome, stopReason: current?.terminalResult?.stopReason,
            finalTick: current?.state.tick ?? 0, finalStateHash: current?.stateHash ?? challenge.simulationStateHash
        });
    }
    private v9Success(requestId: string, session: Session, challenge: Challenge): CandidateAckV9 {
        return CandidateAckV9Schema.parse({ protocolVersion: 9, requestId, nextSequence: session.nextSequence,
            nextInputSequence: this.v9Inputs.get(challenge.id)?.next ?? 0, ok: true, data: this.snapshotV9(session, challenge) });
    }
    private inputFailureV9(requestId: string, id: string, code: ProtocolError['code'], message: string): CandidateAckV9 {
        return CandidateAckV9Schema.parse({ protocolVersion: 9, requestId, nextSequence: 0,
            nextInputSequence: this.v9Inputs.get(id)?.next ?? 0, ok: false,
            error: { code, message, retryable: code === 'RATE_LIMITED' } });
    }
    private onSimulationTransitionV9(update: CoordinatorUpdateV9): void {
        const session = this.sessions.get(update.sessionId);
        const challenge = session?.challenges.get(update.challengeId);
        if (!session || !challenge || challenge.rulesetId !== V9_RULESET_ID) return;
        challenge.simulationStateHash = update.stateHash; challenge.simulationRevision = update.state.revision; challenge.paused = update.paused;
        if (update.state.phase === 'finished') challenge.status = update.unavailable ? 'expired' : 'completed';
        if (!this.v9InInput.has(challenge.id)) this.publishV9(session, challenge);
    }
    private publishV9(session: Session, challenge: Challenge): void {
        if (this.v9InInput.has(challenge.id)) return;
        const snapshot = this.snapshotV9(session, challenge);
        this.onChallengeSnapshotV9?.(snapshot, session.socketId);
        if (snapshot.simulation.phase !== 'finished' && challenge.status === 'active') return;
        const result = this.resultV9(session, challenge);
        this.settleV9(session, challenge, result);
        if (challenge.resultEmitted || !this.boundSessionV9(session)) return;
        challenge.resultEmitted = true;
        this.onChallengeCompletedV9?.(result, session.socketId);
    }
    private settleV9(session: Session, challenge: Challenge, result: ChallengeResultV9): void {
        if (challenge.settlementEmitted) return;
        const replay = this.replayForSettlementV9(session, challenge);
        // Settlement owns the durable record and must run before close removes
        // the coordinator.  Only mark the once flag once evidence is present.
        if (!replay) return;
        challenge.settlementEmitted = true;
        if (replay) this.onChallengeSettledV9?.(result, replay);
    }

    private replayForSettlementV9(session: Session, challenge: Challenge): CoordinatorReplayV9Automated | undefined {
        if (this.sessions.get(session.id) !== session || challenge.rulesetId !== V9_RULESET_ID ||
            challenge.automationId !== V9_AUTOMATION_ID || session.challenges.get(challenge.id) !== challenge)
            return undefined;
        const replay = this.versions.v9.replay(challenge.id);
        return replay && 'automationId' in replay ? replay as CoordinatorReplayV9Automated : undefined;
    }
    private async serialV9<T>(id: string, operation: () => Promise<T>): Promise<T> {
        const previous = this.v9Locks.get(id) ?? Promise.resolve();
        let release!: () => void;
        const current = new Promise<void>(resolve => { release = resolve; });
        const queued = previous.then(() => current);
        this.v9Locks.set(id, queued);
        await previous;
        try { return await operation(); }
        finally { release(); if (this.v9Locks.get(id) === queued) this.v9Locks.delete(id); }
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
        if (challenge.rulesetId === V9_RULESET_ID) {
            this.versions.v9.safety(challenge.id, 'expiry');
            challenge.status = 'expired';
            this.publishV9(session, challenge);
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

    private requireV9TestOnly(session?: Session): void {
        if (!this.v9Enabled || (session && this.sessions.get(session.id) !== session))
            throw new Error('V9 test injection is unavailable.');
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
