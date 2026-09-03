import type { Socket } from 'socket.io-client';

import {
    ChallengeCreateAckSchema,
    ChallengeLeaveAckSchema,
    ChallengePauseAckSchema,
    ChallengeResultSchema,
    ChallengeSnapshotSchema,
    CommandSubmitAckSchema,
    protocolEvents,
    RewardClaimAckSchema,
    RewardInfoAckSchema,
    RewardReserveAckSchema,
    RewardStatusAckSchema,
    RewardUpdateDataSchema,
    type ChallengeResult,
    type ChallengeSnapshot,
    type ProtocolError,
    type RewardInfoData,
    type RewardReservationData,
    type RewardUpdateData,
    type SessionOpenData,
    type WalletIdentity
} from '../../../shared/protocol';
import type { PlayerCalling, SimulationCommand } from '../../../shared/simulation';
import type { ChallengeSnapshotV8Family as ChallengeSnapshotV8, ChallengeResultV8Family as ChallengeResultV8 } from '../../../shared/protocol-v8';
import type { SimulationIntentV8Family as SimulationIntentV8, V8RulesetId } from '../../../shared/simulation-v8';
import type { CombatSceneArgs, CombatSceneArgsV8 } from '../combat/contracts';
import { reconnectSession, takeActionTurnsV8SessionEvents, whenSessionReady } from '../lib/session';

const ACK_TIMEOUT_MS = 5_000;
const ACTIVE_PRACTICE_KEY = 'nimble-knots.active-practice';
export const PRACTICE_CLIENT_REGISTRY_KEY = 'practice-client';

export type PracticeConnectionState = 'connected' | 'reconnecting';
export type Unsubscribe = () => void;

export class PracticeProtocolError extends Error {
    public constructor(public readonly protocolError: ProtocolError) {
        super(protocolError.message);
        this.name = 'PracticeProtocolError';
    }
}

export class PracticeClient {
    private snapshot?: ChallengeSnapshot;
    private sessionId: string;
    private identity?: WalletIdentity;
    private nextSequence = 0;
    private mutationPending = false;
    private readonly suppressedLeaveChallenges = new Set<string>();
    private pendingUnavailable?: string;
    private pendingResult?: ChallengeResult;
    private readonly deliveredResults = new Set<string>();
    private readonly snapshotListeners = new Set<(snapshot: ChallengeSnapshot) => void>();
    private readonly resultListeners = new Set<(result: ChallengeResult) => void>();
    private readonly connectionListeners = new Set<(state: PracticeConnectionState) => void>();
    private readonly unavailableListeners = new Set<(message: string) => void>();
    private readonly errorListeners = new Set<(message: string) => void>();
    private readonly rewardListeners = new Set<(update: RewardUpdateData) => void>();
    private readonly rewardUpdates = new Map<string, RewardUpdateData>();

    public constructor(
        private readonly socket: Socket,
        session: SessionOpenData,
        initialSnapshots: readonly unknown[] = [],
        initialResults: readonly unknown[] = []
    ) {
        this.sessionId = session.sessionId;
        this.identity = session.identity ? structuredClone(session.identity) : undefined;
        const stored = readActivePractice();
        if (stored && stored.sessionId !== session.sessionId) {
            this.pendingUnavailable =
                'The previous in-memory Practice Clash cannot be resumed. Start a fresh Clash.';
            clearActivePractice();
        }
        this.onSnapshotEvent = this.onSnapshotEvent.bind(this);
        this.onResultEvent = this.onResultEvent.bind(this);
        this.onDisconnect = this.onDisconnect.bind(this);
        this.onConnect = this.onConnect.bind(this);
        this.onRewardUpdateEvent = this.onRewardUpdateEvent.bind(this);
        socket.on(protocolEvents.snapshot, this.onSnapshotEvent);
        socket.on(protocolEvents.result, this.onResultEvent);
        socket.on(protocolEvents.rewardUpdate, this.onRewardUpdateEvent);
        socket.on('disconnect', this.onDisconnect);
        socket.on('connect', this.onConnect);
        for (const raw of initialSnapshots) this.onSnapshotEvent(raw);
        for (const raw of initialResults) this.onResultEvent(raw);
    }

    public currentSnapshot(): ChallengeSnapshot | undefined {
        return this.snapshot ? structuredClone(this.snapshot) : undefined;
    }

    public async start(calling: PlayerCalling): Promise<ChallengeSnapshot> {
        await whenSessionReady(this.socket);
        return this.sendSnapshotMutation(protocolEvents.challengeCreate, {
            mode: 'practice',
            calling
        }, ChallengeCreateAckSchema);
    }

    public currentIdentity(): WalletIdentity | undefined {
        return this.identity ? structuredClone(this.identity) : undefined;
    }

    public noteAuthorizedIdentity(identity: WalletIdentity): void {
        this.identity = structuredClone(identity);
    }

    public async rewardInfo(): Promise<RewardInfoData> {
        await whenSessionReady(this.socket);
        const requestId = createRequestId();
        const raw = await this.emitWithRetry(protocolEvents.rewardInfo, { requestId });
        const parsed = RewardInfoAckSchema.safeParse(raw);
        if (!parsed.success || parsed.data.requestId !== requestId) {
            throw new Error('Server returned invalid Daily Challenge availability.');
        }
        if (parsed.data.ok === false) throw new PracticeProtocolError(parsed.data.error);
        return structuredClone(parsed.data.data);
    }

    public async startReward(calling: PlayerCalling): Promise<ChallengeSnapshot> {
        const reservation = await this.reserveReward(calling);
        return this.sendSnapshotMutation(protocolEvents.challengeCreate, {
            mode: 'reward',
            calling,
            eligibility: {
                challengeId: reservation.challengeId,
                token: reservation.eligibilityToken
            }
        }, ChallengeCreateAckSchema);
    }

    public rewardForChallenge(challengeId: string): RewardUpdateData | undefined {
        const update = this.rewardUpdates.get(challengeId);
        return update ? structuredClone(update) : undefined;
    }

    public onRewardUpdate(listener: (update: RewardUpdateData) => void): Unsubscribe {
        this.rewardListeners.add(listener);
        return () => this.rewardListeners.delete(listener);
    }

    public async claimReward(update: RewardUpdateData): Promise<RewardUpdateData> {
        if (!update.claimNonce) {
            throw new Error('Refresh reward status before claiming.');
        }
        await whenSessionReady(this.socket);
        const requestId = createRequestId();
        const raw = await this.emitWithRetry(protocolEvents.rewardClaim, {
            requestId,
            entitlementId: update.entitlementId,
            claimNonce: update.claimNonce,
            idempotencyKey: createRequestId()
        });
        const parsed = RewardClaimAckSchema.safeParse(raw);
        if (!parsed.success || parsed.data.requestId !== requestId) {
            throw new Error('Server returned an invalid reward claim.');
        }
        if (parsed.data.ok === false) throw new PracticeProtocolError(parsed.data.error);
        this.acceptRewardUpdate(parsed.data.data);
        return structuredClone(parsed.data.data);
    }

    public async rewardStatus(entitlementId?: string): Promise<RewardUpdateData> {
        await whenSessionReady(this.socket);
        const requestId = createRequestId();
        const raw = await this.emitWithRetry(protocolEvents.rewardStatus, {
            requestId,
            ...(entitlementId ? { entitlementId } : {})
        });
        const parsed = RewardStatusAckSchema.safeParse(raw);
        if (!parsed.success || parsed.data.requestId !== requestId) {
            throw new Error('Server returned an invalid reward status.');
        }
        if (parsed.data.ok === false) throw new PracticeProtocolError(parsed.data.error);
        this.acceptRewardUpdate(parsed.data.data);
        return structuredClone(parsed.data.data);
    }

    public async submitCommand(
        command: SimulationCommand,
        expectedTurn: number
    ): Promise<ChallengeSnapshot> {
        const challenge = this.requireSnapshot();
        return this.sendSnapshotMutation(protocolEvents.commandSubmit, {
            challengeId: challenge.challengeId,
            expectedTurn,
            command
        }, CommandSubmitAckSchema);
    }

    public async setPaused(paused: boolean): Promise<ChallengeSnapshot> {
        const challenge = this.requireSnapshot();
        return this.sendSnapshotMutation(protocolEvents.challengePause, {
            challengeId: challenge.challengeId,
            paused
        }, ChallengePauseAckSchema);
    }

    public async retry(calling = this.snapshot?.calling ?? 'wizard'): Promise<ChallengeSnapshot> {
        const current = this.snapshot;
        if (current?.status === 'active') {
            this.suppressedLeaveChallenges.add(current.challengeId);
            while (this.suppressedLeaveChallenges.size > 16) {
                const oldest = this.suppressedLeaveChallenges.values().next().value;
                if (!oldest) break;
                this.suppressedLeaveChallenges.delete(oldest);
            }
            await this.leave(current.challengeId);
        }
        return this.start(calling);
    }

    public onSnapshot(listener: (snapshot: ChallengeSnapshot) => void): Unsubscribe {
        this.snapshotListeners.add(listener);
        return () => this.snapshotListeners.delete(listener);
    }

    public onResult(listener: (result: ChallengeResult) => void): Unsubscribe {
        this.resultListeners.add(listener);
        if (this.pendingResult) {
            const result = structuredClone(this.pendingResult);
            this.pendingResult = undefined;
            queueMicrotask(() => {
                if (this.resultListeners.has(listener)) listener(result);
            });
        }
        return () => this.resultListeners.delete(listener);
    }

    public onConnection(listener: (state: PracticeConnectionState) => void): Unsubscribe {
        this.connectionListeners.add(listener);
        return () => this.connectionListeners.delete(listener);
    }

    public onUnavailable(listener: (message: string) => void): Unsubscribe {
        this.unavailableListeners.add(listener);
        if (this.pendingUnavailable) {
            const message = this.pendingUnavailable;
            this.pendingUnavailable = undefined;
            queueMicrotask(() => {
                if (this.unavailableListeners.has(listener)) listener(message);
            });
        }
        return () => this.unavailableListeners.delete(listener);
    }

    public onError(listener: (message: string) => void): Unsubscribe {
        this.errorListeners.add(listener);
        return () => this.errorListeners.delete(listener);
    }

    public dispose(): void {
        this.socket.off(protocolEvents.snapshot, this.onSnapshotEvent);
        this.socket.off(protocolEvents.result, this.onResultEvent);
        this.socket.off(protocolEvents.rewardUpdate, this.onRewardUpdateEvent);
        this.socket.off('disconnect', this.onDisconnect);
        this.socket.off('connect', this.onConnect);
        this.snapshotListeners.clear();
        this.resultListeners.clear();
        this.connectionListeners.clear();
        this.unavailableListeners.clear();
        this.errorListeners.clear();
        this.rewardListeners.clear();
    }

    private async leave(challengeId: string): Promise<ChallengeResult> {
        if (this.mutationPending) throw new Error('Another practice action is still pending.');
        this.mutationPending = true;
        const requestId = createRequestId();
        const sequence = this.nextSequence;
        const request = { requestId, sequence, challengeId };
        try {
            const raw = await this.emitWithRetry(protocolEvents.challengeLeave, request);
            const parsed = ChallengeLeaveAckSchema.safeParse(raw);
            if (!parsed.success || parsed.data.requestId !== requestId) {
                throw new Error('Server returned an invalid leave acknowledgement.');
            }
            if (parsed.data.ok === false) {
                this.consumeRejectedSequence(sequence, parsed.data.error);
                throw new PracticeProtocolError(parsed.data.error);
            }
            this.nextSequence = Math.max(this.nextSequence, parsed.data.data.nextSequence);
            this.acceptResult(parsed.data.data);
            if (this.snapshot?.challengeId === challengeId) this.snapshot = undefined;
            return structuredClone(parsed.data.data);
        } finally {
            this.mutationPending = false;
        }
    }

    private async reserveReward(calling: PlayerCalling): Promise<RewardReservationData> {
        if (this.mutationPending) throw new Error('Another Clash action is still pending.');
        if (!this.socket.connected) throw new Error('Reconnecting to the Clash server.');
        this.mutationPending = true;
        const requestId = createRequestId();
        const sequence = this.nextSequence;
        try {
            const raw = await this.emitWithRetry(protocolEvents.rewardReserve, {
                requestId,
                sequence,
                calling
            });
            const parsed = RewardReserveAckSchema.safeParse(raw);
            if (!parsed.success || parsed.data.requestId !== requestId) {
                throw new Error('Server returned an invalid reward reservation.');
            }
            if (parsed.data.ok === false) {
                this.consumeRejectedSequence(sequence, parsed.data.error);
                throw new PracticeProtocolError(parsed.data.error);
            }
            this.nextSequence = Math.max(this.nextSequence, sequence + 1);
            return structuredClone(parsed.data.data);
        } finally {
            this.mutationPending = false;
        }
    }

    private async sendSnapshotMutation(
        event: string,
        body: Record<string, unknown>,
        schema: typeof ChallengeCreateAckSchema
    ): Promise<ChallengeSnapshot> {
        if (this.mutationPending) throw new Error('Another practice action is still pending.');
        if (!this.socket.connected) throw new Error('Reconnecting to the Practice Clash server.');
        this.mutationPending = true;
        const requestId = createRequestId();
        const sequence = this.nextSequence;
        const request = { requestId, sequence, ...body };
        try {
            const raw = await this.emitWithRetry(event, request);
            const parsed = schema.safeParse(raw);
            if (!parsed.success || parsed.data.requestId !== requestId) {
                throw new Error('Server returned an invalid practice acknowledgement.');
            }
            if (parsed.data.ok === false) {
                this.consumeRejectedSequence(sequence, parsed.data.error);
                throw new PracticeProtocolError(parsed.data.error);
            }
            this.nextSequence = Math.max(this.nextSequence, parsed.data.data.nextSequence);
            this.acceptSnapshot(parsed.data.data);
            return structuredClone(parsed.data.data);
        } finally {
            this.mutationPending = false;
        }
    }

    private emitWithRetry(event: string, request: unknown): Promise<unknown> {
        return this.emitOnce(event, request).catch((firstError) => {
            if (!this.socket.connected) throw firstError;
            return this.emitOnce(event, request);
        });
    }

    private emitOnce(event: string, request: unknown): Promise<unknown> {
        return new Promise((resolve, reject) => {
            this.socket.timeout(ACK_TIMEOUT_MS).emit(
                event,
                request,
                (timeoutError: Error | null, ack: unknown) => {
                    if (timeoutError) reject(new Error(`${event} acknowledgement timed out.`));
                    else resolve(ack);
                }
            );
        });
    }

    private consumeRejectedSequence(sequence: number, error: ProtocolError): void {
        if (!['STALE_SEQUENCE', 'SEQUENCE_GAP', 'UNAUTHORIZED', 'SESSION_EXPIRED'].includes(error.code)) {
            this.nextSequence = Math.max(this.nextSequence, sequence + 1);
        }
    }

    private acceptSnapshot(candidate: ChallengeSnapshot): void {
        if (candidate.sessionId !== this.sessionId) return;
        this.nextSequence = Math.max(this.nextSequence, candidate.nextSequence);
        const current = this.snapshot;
        if (current?.challengeId === candidate.challengeId) {
            if (candidate.revision < current.revision) return;
            if (candidate.revision === current.revision) {
                const agrees = candidate.stateHash === current.stateHash &&
                    candidate.paused === current.paused &&
                    candidate.status === current.status;
                if (!agrees) {
                    this.notifyError('Conflicting authoritative snapshots were rejected.');
                    return;
                }
                return;
            }
        }
        this.snapshot = structuredClone(candidate);
        if (candidate.status === 'active') {
            writeActivePractice(candidate.sessionId, candidate.challengeId);
        } else {
            clearActivePractice();
        }
        for (const listener of this.snapshotListeners) listener(structuredClone(candidate));
    }

    private acceptResult(candidate: ChallengeResult): void {
        if (candidate.sessionId !== this.sessionId) return;
        this.nextSequence = Math.max(this.nextSequence, candidate.nextSequence);
        clearActivePractice();
        if (candidate.outcome === 'left' && this.suppressedLeaveChallenges.has(candidate.challengeId)) {
            return;
        }
        const key = `${candidate.challengeId}:${candidate.revision}:${candidate.outcome}`;
        if (this.deliveredResults.has(key)) return;
        this.deliveredResults.add(key);
        if (this.resultListeners.size === 0) {
            this.pendingResult = structuredClone(candidate);
            return;
        }
        for (const listener of this.resultListeners) listener(structuredClone(candidate));
    }

    private onSnapshotEvent(raw: unknown): void {
        const parsed = ChallengeSnapshotSchema.safeParse(raw);
        if (!parsed.success) {
            this.notifyError('The server sent an invalid practice snapshot.');
            return;
        }
        this.acceptSnapshot(parsed.data);
    }

    private onResultEvent(raw: unknown): void {
        const parsed = ChallengeResultSchema.safeParse(raw);
        if (!parsed.success) {
            this.notifyError('The server sent an invalid practice result.');
            return;
        }
        this.acceptResult(parsed.data);
    }

    private onRewardUpdateEvent(raw: unknown): void {
        const parsed = RewardUpdateDataSchema.safeParse(raw);
        if (!parsed.success) {
            this.notifyError('The server sent an invalid reward status.');
            return;
        }
        this.acceptRewardUpdate(parsed.data);
    }

    private acceptRewardUpdate(update: RewardUpdateData): void {
        this.rewardUpdates.set(update.challengeId, structuredClone(update));
        for (const listener of this.rewardListeners) {
            listener(structuredClone(update));
        }
    }

    private onDisconnect(): void {
        for (const listener of this.connectionListeners) listener('reconnecting');
    }

    private onConnect(): void {
        queueMicrotask(() => {
            void whenSessionReady(this.socket).then((session) => {
                if (session.sessionId !== this.sessionId) {
                    this.sessionId = session.sessionId;
                    this.nextSequence = 0;
                    this.snapshot = undefined;
                    this.identity = session.identity
                        ? structuredClone(session.identity)
                        : undefined;
                    clearActivePractice();
                    for (const listener of this.unavailableListeners) {
                        listener('The previous in-memory Practice Clash cannot be resumed. Start a fresh Clash.');
                    }
                }
                for (const listener of this.connectionListeners) listener('connected');
            }).catch(() => {
                for (const listener of this.connectionListeners) listener('reconnecting');
            });
        });
    }

    private requireSnapshot(): ChallengeSnapshot {
        if (!this.snapshot) throw new Error('No active Practice Clash is available.');
        return this.snapshot;
    }

    private notifyError(message: string): void {
        for (const listener of this.errorListeners) listener(message);
    }
}

function createRequestId(): string {
    return crypto.randomUUID().replaceAll('-', '');
}

function readActivePractice(): { sessionId: string; challengeId: string } | undefined {
    if (typeof sessionStorage === 'undefined') return undefined;
    try {
        const value = JSON.parse(sessionStorage.getItem(ACTIVE_PRACTICE_KEY) || 'null');
        return value && typeof value.sessionId === 'string' && typeof value.challengeId === 'string'
            ? value
            : undefined;
    } catch {
        sessionStorage.removeItem(ACTIVE_PRACTICE_KEY);
        return undefined;
    }
}

function writeActivePractice(sessionId: string, challengeId: string): void {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(ACTIVE_PRACTICE_KEY, JSON.stringify({ sessionId, challengeId }));
}

function clearActivePractice(): void {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(ACTIVE_PRACTICE_KEY);
}

export function liveCombatArgs(
    client: PracticeClient,
    snapshot: ChallengeSnapshot
): CombatSceneArgs {
    return {
        snapshot,
        submitCommand: (command, expectedTurn) => client.submitCommand(command, expectedTurn),
        setPaused: (paused) => client.setPaused(paused),
        retry: () => client.retry(),
        onSnapshot: (listener) => client.onSnapshot(listener),
        onResult: (listener) => client.onResult(listener),
        onConnection: (listener) => client.onConnection(listener),
        onUnavailable: (listener) => client.onUnavailable(listener),
        onError: (listener) => client.onError(listener)
    };
}

export type ActionTurnsV8Clock = {
    now: () => number;
    setTimeout: (callback: () => void, delayMs: number) => unknown;
    clearTimeout: (handle: unknown) => void;
};
const actionTurnsClock: ActionTurnsV8Clock = {
    now: () => performance.now(),
    setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
    clearTimeout: handle => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)
};
type V8Wire = typeof import('../../../shared/protocol-v8');
type SnapshotForV8<R extends V8RulesetId> = Extract<ChallengeSnapshotV8, { rulesetId: R }>;
type ResultForV8<R extends V8RulesetId> = Extract<ChallengeResultV8, { rulesetId: R }>;
type PendingV8 = { valid: boolean; timer?: unknown; reject: (error: Error) => void;
    inputSequence?: number; intentType?: SimulationIntentV8['type']; turn?: number; epoch?: number; committedFire?: boolean };

/** Internal, explicitly attached V8 transport. It has no create/reward/retry path.
 * Load validators only when this candidate adapter is requested; public V7
 * PracticeClient and its 5-second idempotent mutation path remain unchanged.
 */
export class ActionTurnsV8Client<R extends V8RulesetId = 'nimble-knots-artillery-v8'> {
    private snapshot?: ChallengeSnapshotV8;
    private challengeId?: string;
    private nextInputSequence = 0;
    private nextSequence = 0;
    private connected: boolean;
    private disposed = false;
    private connectionGeneration = 0;
    private normal?: PendingV8;
    private uncertainInput?: number;
    private rebindPending = false;
    private lifecycle?: PendingV8;
    private neutral?: Promise<ChallengeSnapshotV8 | void>;
    private neutralRequest?: PendingV8;
    private releaseRequest?: PendingV8;
    private releasePromise?: Promise<ChallengeSnapshotV8 | void>;
    private releaseFenceEpoch = -1;
    private softFence?: { challengeId: string; turn: number; epoch: number };
    private softRecovery = false;
    private hardAfterRelease = false;
    private readinessScheduled = false;
    private resynchronizing = false;
    private stale = false;
    private lastAuthorityAt = 0;
    private staleTimer?: unknown;
    private refreshTimer?: unknown;
    private refreshDue = false;
    private hold?: { turn: number; epoch: number; confirmed: boolean };
    private terminal?: ChallengeResultV8;
    private pendingTerminal = false;
    private pendingUnavailable?: string;
    private bufferedSnapshots: unknown[] = [];
    private bufferedResults: unknown[] = [];
    private readonly snapshotListeners = new Set<(value: ChallengeSnapshotV8) => void>();
    private readonly inputReadyListeners = new Set<() => void>();
    private readonly resultListeners = new Set<(value: ChallengeResultV8) => void>();
    private readonly connectionListeners = new Set<(value: PracticeConnectionState) => void>();
    private readonly unavailableListeners = new Set<(value: string) => void>();
    private readonly errorListeners = new Set<(value: string) => void>();

    public static async attach<R extends V8RulesetId = 'nimble-knots-artillery-v8'>(socket: Socket, session: SessionOpenData,
        initialSnapshots: readonly unknown[] = [], initialResults: readonly unknown[] = [],
        clock: ActionTurnsV8Clock = actionTurnsClock,
        rulesetId: R = 'nimble-knots-artillery-v8' as R): Promise<ActionTurnsV8Client<R>> {
        const wire = await import('../../../shared/protocol-v8');
        const client = new ActionTurnsV8Client<R>(socket, session.sessionId, wire, clock, rulesetId);
        const buffered = takeActionTurnsV8SessionEvents(socket);
        for (const value of [...initialSnapshots, ...buffered.snapshots]) client.onSnapshotEvent(value);
        for (const value of [...initialResults, ...buffered.results]) client.onResultEvent(value);
        return client;
    }

    private constructor(private readonly socket: Socket, private readonly sessionId: string,
        private readonly wire: V8Wire, private readonly clock: ActionTurnsV8Clock, private readonly rulesetId: R) {
        this.connected = socket.connected;
        socket.on(wire.protocolEventsV8.snapshot, this.onSnapshotEvent);
        socket.on(wire.protocolEventsV8.result, this.onResultEvent);
        socket.on('disconnect', this.onDisconnect);
        socket.on('connect', this.onConnect);
    }

    public currentSnapshot(): SnapshotForV8<R> | undefined {
        // Every acceptance path checks this adapter's immutable exact identity.
        return this.snapshot ? structuredClone(this.snapshot) as SnapshotForV8<R> : undefined;
    }

    public inputReady(): boolean {
        try { this.requireInput(); } catch { return false; }
        return !this.normal && !this.lifecycle && !this.neutral && !this.releasePromise &&
            !this.resynchronizing && this.uncertainInput === undefined;
    }
    public inputFlight(): 'locomotion' | 'blocked' | null {
        if (this.lifecycle || this.neutral || this.releasePromise || this.resynchronizing || this.stale || !this.connected) return 'blocked';
        if (!this.normal) return null;
        return this.normal.valid && ['walk_start', 'walk_refresh', 'walk_stop'].includes(this.normal.intentType ?? '')
            ? 'locomotion' : 'blocked';
    }
    public onInputReady(listener: () => void): Unsubscribe {
        this.inputReadyListeners.add(listener); return () => this.inputReadyListeners.delete(listener);
    }

    public submitIntent(intent: SimulationIntentV8): Promise<SnapshotForV8<R>> {
        // Return the actual lane Promise, so consumers finish this request before
        // the readiness microtask offers the lane to a live gesture or refresh.
        try { return this.startIntent(intent); }
        catch (error) { return Promise.reject(error); }
    }

    private startIntent(intent: SimulationIntentV8): Promise<SnapshotForV8<R>> {
        const snapshot = this.requireInput();
        if (this.normal) throw new Error('A V8 input acknowledgement is still pending.');
        if (this.lifecycle || this.resynchronizing || this.neutral || this.releasePromise || this.uncertainInput !== undefined)
            throw new Error('V8 input is resynchronizing.');
        if (intent.type === 'walk_refresh' && !this.hold) throw new Error('No owned V8 walk to refresh.');
        const request = this.wire.InputRequestV8FamilySchema.parse({ ...this.ownership(),
            inputSequence: this.nextInputSequence, expectedPhase: snapshot.simulation.phase, intent });
        this.softRecovery = false;
        if (intent.type === 'walk_start') {
            this.hold = { turn: snapshot.simulation.turn, epoch: snapshot.simulation.inputEpoch, confirmed: false };
            this.scheduleRefresh();
        }
        return new Promise((resolve, reject) => {
            const pending: PendingV8 = { valid: true, reject, inputSequence: request.inputSequence,
                intentType: intent.type, turn: request.expectedTurn, epoch: request.inputEpoch };
            this.normal = pending;
            const complete = (error?: Error, raw?: unknown) => {
                if (this.normal !== pending) return;
                this.clock.clearTimeout(pending.timer);
                this.normal = undefined;
                // A missing acknowledgement does not prove server consumption.
                // Retain its floor until neutral authority proves consumption or
                // a new socket/session binding makes the old packet inert.
                const fenced = snapshot.rulesetId === 'nimble-knots-artillery-v8-r1' && this.releaseFenceEpoch > request.inputEpoch;
                if (error && !fenced && this.nextInputSequence <= request.inputSequence) this.uncertainInput = request.inputSequence;
                if (!pending.valid || this.disposed) {
                    if (fenced) { this.uncertainInput = undefined; this.resynchronizing = !!this.neutral || !!this.releasePromise; }
                    else if (this.resynchronizing && !this.neutral && !this.releasePromise) this.bestEffortNeutral();
                    this.scheduleInputReady();
                    return;
                }
                if (error) {
                    reject(error);
                    this.bestEffortCancel();
                    return;
                }
                const parsed = this.wire.InputAckV8FamilySchema().safeParse(raw);
                if (!parsed.success || parsed.data.requestId !== request.requestId) {
                    this.uncertainInput = request.inputSequence;
                    reject(new Error('Invalid V8 input acknowledgement.'));
                    this.bestEffortCancel();
                    return;
                }
                const ack = parsed.data;
                if (ack.ok === false) {
                    // A rejection is never replayed. Its cursor is read again through
                    // the neutral lane, including gap/stale/auth failures.
                    reject(new PracticeProtocolError(ack.error));
                    this.bestEffortCancel();
                    return;
                }
                if (ack.nextInputSequence !== ack.data.nextInputSequence ||
                    ack.nextInputSequence !== request.inputSequence + 1 ||
                    !(this.supersededAcknowledgement(ack.data) || this.acceptSnapshot(ack.data))) {
                    reject(new Error('Stale or conflicting V8 input acknowledgement.'));
                    this.bestEffortCancel();
                    return;
                }
                resolve(this.currentSnapshot()!);
                this.scheduleInputReady();
            };
            pending.timer = this.clock.setTimeout(() => complete(new Error('V8 input acknowledgement timed out after 250 ms.')), 250);
            this.socket.timeout(250).emit(this.wire.protocolEventsV8.input, request,
                (error: Error | null, raw: unknown) => complete(error ? new Error('V8 input acknowledgement timed out after 250 ms.') : undefined, raw));
        });
    }

    /** Independent neutral-only lane: local ownership ends before any await. */
    public cancelInput(): Promise<ChallengeSnapshotV8 | void> {
        this.softRecovery = false;
        if (this.releasePromise) this.hardAfterRelease = true;
        this.clearOwnership('V8 input cancelled.');
        if (this.disposed || !this.connected || !this.socket.connected || !this.playerOwnsInput()) {
            if (this.uncertainInput !== undefined) this.rebindUncertainInput();
            return Promise.resolve();
        }
        this.resynchronizing = true;
        return this.sendNeutral();
    }

    /** Soft release owns its own lane and proof; recovery must not hard-cancel a committed hop. */
    public releaseMovement(): Promise<ChallengeSnapshotV8 | void> {
        if (this.snapshot?.rulesetId !== 'nimble-knots-artillery-v8-r1') return this.cancelInput();
        this.softRecovery = true;
        this.clearOwnership('V8 movement released.');
        if (this.disposed || !this.connected || !this.socket.connected || !this.playerOwnsInput()) return Promise.resolve();
        this.resynchronizing = true;
        return this.sendRelease();
    }

    public async setPaused(paused: boolean): Promise<ChallengeSnapshotV8> {
        const result = await this.sendLifecycle(this.wire.protocolEventsV8.pause, { paused });
        if (!('simulation' in result)) throw new Error('Expected a V8 pause snapshot.');
        return result;
    }

    public async leave(): Promise<ChallengeResultV8> {
        const result = await this.sendLifecycle(this.wire.protocolEventsV8.leave, {});
        if (!('outcome' in result)) throw new Error('Expected a V8 leave result.');
        return result;
    }

    public onSnapshot(listener: (snapshot: SnapshotForV8<R>) => void): Unsubscribe {
        const receive = (value: ChallengeSnapshotV8) => listener(value as SnapshotForV8<R>);
        this.snapshotListeners.add(receive); return () => this.snapshotListeners.delete(receive);
    }
    public onResult(listener: (result: ResultForV8<R>) => void): Unsubscribe {
        const receive = (value: ChallengeResultV8) => listener(value as ResultForV8<R>);
        this.resultListeners.add(receive);
        if (this.pendingTerminal) {
            this.pendingTerminal = false;
            queueMicrotask(() => { if (this.resultListeners.has(receive)) receive(structuredClone(this.terminal!)); });
        }
        return () => this.resultListeners.delete(receive);
    }
    public onConnection(listener: (state: PracticeConnectionState) => void): Unsubscribe {
        this.connectionListeners.add(listener); return () => this.connectionListeners.delete(listener);
    }
    public onUnavailable(listener: (message: string) => void): Unsubscribe {
        this.unavailableListeners.add(listener);
        if (this.pendingUnavailable) {
            const message = this.pendingUnavailable; this.pendingUnavailable = undefined;
            queueMicrotask(() => { if (this.unavailableListeners.has(listener)) listener(message); });
        }
        return () => this.unavailableListeners.delete(listener);
    }
    public onError(listener: (message: string) => void): Unsubscribe {
        this.errorListeners.add(listener); return () => this.errorListeners.delete(listener);
    }

    public dispose(): void {
        if (this.disposed) return;
        this.bestEffortCancel();
        this.disposed = true;
        this.connectionGeneration++;
        this.clearPending('V8 client disposed.');
        this.clock.clearTimeout(this.staleTimer);
        this.socket.off(this.wire.protocolEventsV8.snapshot, this.onSnapshotEvent);
        this.socket.off(this.wire.protocolEventsV8.result, this.onResultEvent);
        this.socket.off('disconnect', this.onDisconnect);
        this.socket.off('connect', this.onConnect);
        this.snapshotListeners.clear(); this.inputReadyListeners.clear(); this.resultListeners.clear(); this.connectionListeners.clear();
        this.unavailableListeners.clear(); this.errorListeners.clear();
        this.bufferedSnapshots = []; this.bufferedResults = [];
    }

    private ownership() {
        const snapshot = this.snapshot!;
        return { requestId: createRequestId(), challengeId: snapshot.challengeId, rulesetId: snapshot.rulesetId,
            expectedTurn: snapshot.simulation.turn, inputEpoch: snapshot.simulation.inputEpoch };
    }

    private sendNeutral(): Promise<ChallengeSnapshotV8 | void> {
        if (this.neutral) return this.neutral;
        const request = this.wire.InputCancelV8FamilySchema.parse(this.ownership());
        const promise = new Promise<ChallengeSnapshotV8>((resolve, reject) => {
            const pending: PendingV8 = { valid: true, reject };
            this.neutralRequest = pending;
            const complete = (error?: Error, raw?: unknown) => {
                if (this.neutralRequest !== pending) return;
                this.clock.clearTimeout(pending.timer);
                this.neutralRequest = undefined;
                if (!pending.valid || this.disposed) return;
                const parsed = this.wire.InputAckV8FamilySchema().safeParse(raw);
                if (error || !parsed.success || parsed.data.requestId !== request.requestId) {
                    reject(error ?? new Error('Invalid V8 cancellation acknowledgement.')); return;
                }
                const ack = parsed.data;
                if (ack.ok === false) { reject(new PracticeProtocolError(ack.error)); return; }
                if (ack.nextInputSequence !== ack.data.nextInputSequence || !this.acceptSnapshot(ack.data)) {
                    reject(new Error('Stale V8 cancellation acknowledgement.')); return;
                }
                // If an invalidated normal packet still exists, its consumed cursor
                // may follow this cancel. Keep input blocked until a second read.
                if (this.uncertainInput !== undefined && ack.nextInputSequence > this.uncertainInput)
                    this.uncertainInput = undefined;
                this.resynchronizing = !!this.normal || this.uncertainInput !== undefined;
                resolve(structuredClone(ack.data));
            };
            pending.timer = this.clock.setTimeout(() => complete(new Error('V8 cancellation acknowledgement timed out.')), 250);
            this.socket.timeout(250).emit(this.wire.protocolEventsV8.cancel, request,
                (error: Error | null, raw: unknown) => complete(error ?? undefined, raw));
        });
        this.neutral = promise;
        const settled = () => {
            if (this.neutral === promise) this.neutral = undefined;
            if (this.uncertainInput !== undefined && !this.normal) this.rebindUncertainInput();
            this.escalateHardRelease();
            this.scheduleInputReady();
        };
        void promise.then(settled, settled);
        return promise;
    }

    private sendRelease(): Promise<ChallengeSnapshotV8 | void> {
        if (this.releasePromise) return this.releasePromise;
        const request = this.wire.InputReleaseV8R1Schema.parse(this.ownership());
        this.softFence = { challengeId: request.challengeId, turn: request.expectedTurn, epoch: request.inputEpoch };
        const promise = new Promise<ChallengeSnapshotV8 | void>((resolve, reject) => {
            const pending: PendingV8 = { valid: true, reject }; this.releaseRequest = pending;
            const complete = (error?: Error, raw?: unknown) => {
                if (this.releaseRequest !== pending) return;
                this.clock.clearTimeout(pending.timer); this.releaseRequest = undefined;
                if (!pending.valid || this.disposed) return;
                const parsed = this.wire.InputAckV8FamilySchema().safeParse(raw);
                if (error || !parsed.success || parsed.data.requestId !== request.requestId) {
                    reject(error ?? new Error('Invalid V8 release acknowledgement.')); return;
                }
                const ack = parsed.data;
                if (ack.ok === false) { reject(new PracticeProtocolError(ack.error)); return; }
                if (ack.data.rulesetId !== request.rulesetId || ack.data.challengeId !== request.challengeId ||
                    ack.data.simulation.inputEpoch <= request.inputEpoch ||
                    ack.nextInputSequence !== ack.data.nextInputSequence ||
                    !(this.supersededAcknowledgement(ack.data) || this.acceptSnapshot(ack.data))) {
                    reject(new Error('Stale V8 release acknowledgement.')); return;
                }
                this.releaseFenceEpoch = Math.max(this.releaseFenceEpoch, ack.data.simulation.inputEpoch);
                this.uncertainInput = undefined;
                resolve(this.currentSnapshot());
            };
            pending.timer = this.clock.setTimeout(() => complete(new Error('V8 release acknowledgement timed out.')), 250);
            this.socket.timeout(250).emit(this.wire.protocolEventsV8.release, request,
                (error: Error | null, raw: unknown) => complete(error ?? undefined, raw));
        });
        this.releasePromise = promise;
        const settled = () => {
            if (this.releasePromise === promise) this.releasePromise = undefined;
            if (this.releaseFenceEpoch > request.inputEpoch) {
                this.resynchronizing = !!this.normal || !!this.neutral || !!this.lifecycle;
            }
            this.scheduleInputReady();
            this.escalateHardRelease();
        };
        void promise.then(settled, settled);
        return promise;
    }

    private async sendLifecycle(event: string, body: { paused?: boolean }): Promise<ChallengeSnapshotV8 | ChallengeResultV8> {
        if (!this.snapshot || this.terminal || this.disposed) throw new Error('No active V8 Clash is available.');
        if (!this.connected || !this.socket.connected) throw new Error('V8 transport disconnected.');
        if (this.lifecycle) throw new Error('A V8 lifecycle acknowledgement is still pending.');
        const hadOwnership = !!this.hold || !!this.normal;
        this.clearOwnership('V8 lifecycle cancelled input.');
        if (hadOwnership) this.bestEffortCancel();
        const schema = event === this.wire.protocolEventsV8.pause ? this.wire.ChallengePauseV8FamilySchema : this.wire.ChallengeLeaveV8FamilySchema;
        const request = schema.parse({ requestId: createRequestId(), challengeId: this.snapshot.challengeId,
            rulesetId: this.snapshot.rulesetId, sequence: this.nextSequence, ...body });
        return new Promise((resolve, reject) => {
            const pending: PendingV8 = { valid: true, reject }; this.lifecycle = pending;
            const complete = (error?: Error, raw?: unknown) => {
                if (this.lifecycle !== pending) return;
                this.clock.clearTimeout(pending.timer); this.lifecycle = undefined;
                if (!pending.valid || this.disposed) return;
                const parsed = this.wire.LifecycleAckV8FamilySchema.safeParse(raw);
                if (error || !parsed.success || parsed.data.requestId !== request.requestId) {
                    reject(error ?? new Error('Invalid V8 lifecycle acknowledgement.'));
                    this.bestEffortCancel(); return;
                }
                const ack = parsed.data;
                if (ack.ok === false) {
                    this.nextSequence = Math.max(this.nextSequence, ack.nextSequence);
                    reject(new PracticeProtocolError(ack.error)); return;
                }
                if ((event === this.wire.protocolEventsV8.pause) !== ('simulation' in ack.data)) {
                    reject(new Error('Invalid V8 lifecycle success payload kind.')); return;
                }
                if (ack.nextSequence !== request.sequence + 1 ||
                    ('simulation' in ack.data ? !(this.supersededAcknowledgement(ack.data) || this.acceptSnapshot(ack.data))
                        : !this.acceptResult(ack.data))) {
                    reject(new Error('Stale or conflicting V8 lifecycle acknowledgement.')); return;
                }
                this.nextSequence = Math.max(this.nextSequence, ack.nextSequence);
                resolve('simulation' in ack.data ? this.currentSnapshot()! : structuredClone(ack.data));
            };
            pending.timer = this.clock.setTimeout(() => complete(new Error('V8 lifecycle acknowledgement timed out.')), ACK_TIMEOUT_MS);
            this.socket.timeout(ACK_TIMEOUT_MS).emit(event, request,
                (error: Error | null, raw: unknown) => complete(error ?? undefined, raw));
        });
    }

    private acceptSnapshot(candidate: ChallengeSnapshotV8): boolean {
        if (candidate.rulesetId !== this.rulesetId || this.disposed || this.terminal || candidate.sessionId !== this.sessionId ||
            (this.challengeId && candidate.challengeId !== this.challengeId)) return false;
        const previous = this.snapshot;
        const current = candidate.simulation;
        if (previous) {
            if (candidate.rulesetId !== previous.rulesetId) return false;
            if (candidate.mode !== previous.mode || candidate.calling !== previous.calling || current.seed !== previous.simulation.seed)
                return false;
            if (current.revision < previous.simulation.revision || current.tick < previous.simulation.tick ||
                current.inputEpoch < previous.simulation.inputEpoch) return false;
            if (current.revision === previous.simulation.revision &&
                (candidate.stateHash !== previous.stateHash || candidate.paused !== previous.paused ||
                 candidate.status !== previous.status || JSON.stringify(current) !== JSON.stringify(previous.simulation))) {
                this.notifyError('Conflicting authoritative V8 snapshots were rejected.'); return false;
            }
            if (candidate.nextInputSequence < this.nextInputSequence) return false;
        }
        const progressed = !previous || current.revision > previous.simulation.revision;
        const boundary = previous && (current.inputEpoch !== previous.simulation.inputEpoch ||
            current.turn !== previous.simulation.turn || current.phase !== previous.simulation.phase ||
            current.activeActor !== previous.simulation.activeActor || candidate.paused !== previous.paused ||
            candidate.status !== previous.status);
        // B publishes accepted Fire authority before its success ack. Preserve
        // that one already-committed request, not any queued/uncast old action.
        if (this.normal?.valid && this.normal.intentType === 'fire' && current.phase === 'projectile' &&
            current.turn === this.normal.turn && candidate.nextInputSequence === this.normal.inputSequence! + 1) {
            this.normal.committedFire = true;
        }
        this.challengeId = candidate.challengeId;
        this.snapshot = structuredClone(candidate);
        this.nextInputSequence = candidate.nextInputSequence;
        if (candidate.rulesetId === 'nimble-knots-artillery-v8-r1' && this.softFence &&
            candidate.challengeId === this.softFence.challengeId &&
            current.inputEpoch > this.softFence.epoch) {
            // New-epoch authority is itself a fence even when both wire acks are lost.
            // Exact instance/session/challenge identity and monotonicity were checked above.
            // A handover does not weaken that fence or consume the rejected old cursor.
            this.releaseFenceEpoch = Math.max(this.releaseFenceEpoch, current.inputEpoch);
            this.uncertainInput = undefined;
        }
        if (this.uncertainInput !== undefined && candidate.nextInputSequence > this.uncertainInput)
            this.uncertainInput = undefined;
        this.nextSequence = Math.max(this.nextSequence, candidate.nextSequence);
        if (!this.normal && !this.neutralRequest && !this.releaseRequest && !this.lifecycle && this.uncertainInput === undefined)
            this.resynchronizing = false;
        if (boundary) this.clearOwnership('V8 phase or input ownership changed.', this.normal?.committedFire);
        else if (this.hold) {
            if (current.heldDirection !== 0) this.hold.confirmed = true;
            else if (this.hold.confirmed) {
                if (candidate.rulesetId === 'nimble-knots-artillery-v8-r1' && this.normal?.intentType === 'walk_stop' &&
                    candidate.nextInputSequence === this.normal.inputSequence! + 1) this.clearHold();
                else this.clearOwnership('V8 walk lease ended.');
            }
        }
        if (progressed) {
            this.stale = false; this.lastAuthorityAt = this.clock.now();
            this.scheduleStaleCheck();
        }
        if (progressed || boundary) for (const listener of this.snapshotListeners) listener(structuredClone(candidate));
        this.scheduleInputReady();
        return true;
    }

    private supersededAcknowledgement(candidate: ChallengeSnapshotV8): boolean {
        const current = this.snapshot;
        return !!current && candidate.sessionId === this.sessionId && candidate.challengeId === this.challengeId &&
            candidate.rulesetId === current.rulesetId && candidate.mode === current.mode && candidate.calling === current.calling &&
            candidate.simulation.seed === current.simulation.seed && candidate.simulation.revision < current.simulation.revision &&
            candidate.simulation.tick <= current.simulation.tick && candidate.simulation.inputEpoch <= current.simulation.inputEpoch &&
            candidate.nextInputSequence <= this.nextInputSequence;
    }

    private acceptResult(candidate: ChallengeResultV8): boolean {
        if (candidate.rulesetId !== this.rulesetId || candidate.sessionId !== this.sessionId || (this.challengeId && candidate.challengeId !== this.challengeId)) return false;
        if (this.snapshot && candidate.rulesetId !== this.snapshot.rulesetId) return false;
        if (this.terminal) return candidate.outcome === this.terminal.outcome && candidate.finalTick === this.terminal.finalTick &&
            candidate.finalStateHash === this.terminal.finalStateHash;
        if (this.snapshot && (candidate.finalTick < this.snapshot.simulation.tick || candidate.nextInputSequence < this.nextInputSequence ||
            (this.snapshot.simulation.phase === 'finished' && candidate.finalStateHash !== this.snapshot.stateHash))) return false;
        this.challengeId = candidate.challengeId;
        this.terminal = structuredClone(candidate);
        this.nextInputSequence = candidate.nextInputSequence;
        this.clearOwnership('V8 Clash finished.');
        this.clock.clearTimeout(this.staleTimer);
        if (!this.resultListeners.size) this.pendingTerminal = true;
        else for (const listener of this.resultListeners) listener(structuredClone(candidate));
        return true;
    }

    private onSnapshotEvent = (raw: unknown): void => {
        if (!this.connected) { this.buffer(this.bufferedSnapshots, raw); return; }
        const parsed = this.wire.ChallengeSnapshotV8FamilySchema.safeParse(raw);
        if (!parsed.success) this.notifyError('The server sent an invalid V8 snapshot.');
        else this.acceptSnapshot(parsed.data);
    };
    private onResultEvent = (raw: unknown): void => {
        if (!this.connected) { this.buffer(this.bufferedResults, raw); return; }
        const parsed = this.wire.ChallengeResultV8FamilySchema.safeParse(raw);
        if (!parsed.success) this.notifyError('The server sent an invalid V8 result.');
        else this.acceptResult(parsed.data);
    };
    private onDisconnect = (): void => {
        this.connected = false; this.connectionGeneration++;
        this.uncertainInput = undefined;
        this.resynchronizing = true;
        this.clearPending('V8 transport disconnected.');
        this.clock.clearTimeout(this.staleTimer);
        this.bufferedSnapshots = []; this.bufferedResults = [];
        for (const listener of this.connectionListeners) listener('reconnecting');
    };
    private onConnect = (): void => {
        const generation = this.connectionGeneration;
        queueMicrotask(() => {
            if (this.disposed) return;
            void whenSessionReady(this.socket).then(session => {
                if (this.disposed || generation !== this.connectionGeneration || !this.socket.connected) return;
                if (session.sessionId !== this.sessionId) {
                    this.snapshot = undefined;
                    const message = 'The previous in-memory V8 Clash cannot be resumed. Start a fresh Clash.';
                    if (!this.unavailableListeners.size) this.pendingUnavailable = message;
                    for (const listener of this.unavailableListeners) listener(message);
                    return;
                }
                this.connected = true;
                const buffered = takeActionTurnsV8SessionEvents(this.socket);
                const snapshots = [...this.bufferedSnapshots.splice(0), ...buffered.snapshots];
                const results = [...this.bufferedResults.splice(0), ...buffered.results];
                let acceptedResume = false;
                for (const value of snapshots) {
                    const parsed = this.wire.ChallengeSnapshotV8FamilySchema.safeParse(value);
                    if (parsed.success && this.acceptSnapshot(parsed.data)) acceptedResume = true;
                }
                for (const value of results) this.onResultEvent(value);
                // Session resume already neutralized server-owned player input.
                // If no resume authority arrived, remain blocked and request a read.
                this.resynchronizing = !acceptedResume && !this.terminal;
                if (this.resynchronizing && this.playerOwnsInput()) this.bestEffortNeutral();
                for (const listener of this.connectionListeners) listener('connected');
            }).catch(error => this.notifyError(error instanceof Error ? error.message : 'V8 session resume failed.'));
        });
    };

    private requireInput(): ChallengeSnapshotV8 {
        if (!this.snapshot || this.terminal || this.disposed) throw new Error('No active V8 Clash is available.');
        if (!this.connected || !this.socket.connected) throw new Error('V8 transport disconnected.');
        if (!this.playerOwnsInput()) throw new Error('V8 input requires the active player action or retreat phase.');
        if (this.stale || this.clock.now() - this.lastAuthorityAt > 200) throw new Error('V8 authority is stale; input is resynchronizing.');
        return this.snapshot;
    }
    private playerOwnsInput(): boolean {
        const snapshot = this.snapshot;
        return !!snapshot && !this.terminal && snapshot.status === 'active' && !snapshot.paused &&
            snapshot.simulation.activeActor === 'player' &&
            (snapshot.simulation.phase === 'action' || snapshot.simulation.phase === 'retreat');
    }
    private clearOwnership(message: string, preserveCommittedFire = false): void {
        this.clearHold();
        if (this.normal?.valid && !preserveCommittedFire) { this.normal.valid = false; this.normal.reject(new Error(message)); }
    }
    private clearHold(): void {
        this.hold = undefined; this.refreshDue = false;
        this.clock.clearTimeout(this.refreshTimer); this.refreshTimer = undefined;
    }
    private clearPending(message: string): void {
        this.clearOwnership(message);
        for (const pending of [this.normal, this.lifecycle, this.neutralRequest, this.releaseRequest]) {
            if (!pending) continue;
            pending.valid = false; this.clock.clearTimeout(pending.timer); pending.reject(new Error(message));
        }
        this.normal = undefined; this.lifecycle = undefined; this.neutralRequest = undefined; this.neutral = undefined;
        this.releaseRequest = undefined; this.releasePromise = undefined;
    }
    private scheduleRefresh(): void {
        this.clock.clearTimeout(this.refreshTimer);
        if (!this.hold) return;
        this.refreshTimer = this.clock.setTimeout(() => {
            this.refreshDue = true; this.flushRefresh(); this.scheduleRefresh();
        }, 100);
    }
    private flushRefresh(): void {
        if (!this.hold || !this.refreshDue || this.normal || this.lifecycle || this.neutral || this.releasePromise || this.resynchronizing || this.stale) return;
        const state = this.snapshot?.simulation;
        if (!state || state.inputEpoch !== this.hold.epoch || state.turn !== this.hold.turn ||
            state.heldDirection === 0 || state.lastLeaseRefreshTick === null || state.tick - state.lastLeaseRefreshTick < 3) return;
        this.refreshDue = false;
        void this.submitIntent({ type: 'walk_refresh' }).catch(error => this.notifyError(error.message));
    }
    private scheduleStaleCheck(): void {
        this.clock.clearTimeout(this.staleTimer);
        if (!this.playerOwnsInput() || !this.connected) return;
        this.staleTimer = this.clock.setTimeout(() => {
            this.stale = true; this.bestEffortCancel();
            this.notifyError('V8 authority is stale; release controls and wait for a fresh snapshot.');
        }, 201);
    }
    private bestEffortCancel(): void { void this.cancelInput().catch(error => this.notifyError(error.message)); }
    private bestEffortNeutral(): void {
        if (!this.disposed && this.connected && this.socket.connected && this.playerOwnsInput())
            void (this.softRecovery ? this.sendRelease() : this.sendNeutral()).catch(error => this.notifyError(error.message));
    }
    private scheduleInputReady(): void {
        if (this.snapshot?.rulesetId !== 'nimble-knots-artillery-v8-r1') { this.flushRefresh(); return; }
        if (this.readinessScheduled) return;
        this.readinessScheduled = true;
        queueMicrotask(() => {
            // A snapshot may arrive inside complete() before its Promise resolves.
            // Let the scene clear that completed request before offering readiness.
            queueMicrotask(() => {
                this.readinessScheduled = false;
                if (this.disposed) return;
                if (this.inputReady()) for (const listener of this.inputReadyListeners) listener();
                this.flushRefresh();
            });
        });
    }
    private escalateHardRelease(): void {
        if (!this.hardAfterRelease || this.releasePromise || this.neutral || this.disposed || !this.playerOwnsInput()) return;
        this.hardAfterRelease = false;
        const state = this.snapshot!.simulation;
        if (state.heldDirection === 0 && state.units[0].vxFp === 0 && !state.aim) return;
        this.resynchronizing = true;
        void this.sendNeutral().catch(error => this.notifyError(error.message));
    }
    private rebindUncertainInput(): void {
        if (this.disposed || this.rebindPending || !this.connected || !this.socket.connected) return;
        this.rebindPending = true;
        // This is session resynchronization, never a retry of the expired action.
        void reconnectSession(this.socket).catch(error => this.notifyError(error.message))
            .finally(() => { this.rebindPending = false; });
    }
    private notifyError(message: string): void { for (const listener of this.errorListeners) listener(message); }
    private buffer(values: unknown[], value: unknown): void { values.push(value); if (values.length > 8) values.shift(); }
}

export function liveActionTurnsV8Args<R extends V8RulesetId>(client: ActionTurnsV8Client<R>, snapshot: SnapshotForV8<R>): CombatSceneArgsV8 {
    return { kind: 'v8', snapshot,
        submitIntent: intent => client.submitIntent(intent), cancelInput: () => client.cancelInput(),
        releaseMovement: () => client.releaseMovement(), inputReady: () => client.inputReady(),
        inputFlight: () => client.inputFlight(), onInputReady: listener => client.onInputReady(listener),
        setPaused: paused => client.setPaused(paused),
        onSnapshot: listener => client.onSnapshot(listener), onResult: listener => client.onResult(listener),
        onConnection: listener => client.onConnection(listener), onUnavailable: listener => client.onUnavailable(listener),
        onError: listener => client.onError(listener) };
}
