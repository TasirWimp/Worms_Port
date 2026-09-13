import type { Socket } from 'socket.io-client';
import type { SessionOpenData, ChallengeSnapshot, ChallengeResult, RewardInfoData, RewardReservationData, RewardUpdateData, ProtocolError } from '../../../shared/protocol';
import { protocolEvents, ChallengeLeaveAckSchema, RewardInfoAckSchema, RewardReserveAckSchema, RewardClaimAckSchema, RewardStatusAckSchema } from '../../../shared/protocol';
import type { ChallengeSnapshotV8Runtime as ChallengeSnapshotV8, ChallengeResultV8Runtime as ChallengeResultV8 } from '../../../shared/protocol-v8';
import type { ChallengeSnapshotV8Automated, ChallengeResultV8Automated } from '../../../shared/protocol-v8';
import type { PlayerCalling } from '../../../shared/simulation';
import type { LiveCombatSnapshot, LiveCombatResult } from './client';
import type { SimulationIntentV8Family as SimulationIntentV8, V8RulesetId } from '../../../shared/simulation-v8';
import type { CombatSceneArgsV8 } from '../combat/contracts';
import { reconnectSession, takeActionTurnsV8SessionEvents, whenSessionReady } from '../lib/session';

const ACK_TIMEOUT_MS = 5_000;
export type PracticeConnectionState = 'connected' | 'reconnecting';
export type Unsubscribe = () => void;
export type ActionTurnsSessionCursor = { sessionId: string; nextSequence: number };
class PracticeProtocolError extends Error {
    public constructor(public readonly protocolError: { code: string; message: string; retryable: boolean }) { super(protocolError.message); }
}
function createRequestId(): string { return crypto.randomUUID().replaceAll('-', ''); }

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
    private localSequence = 0;
    private get nextSequence(): number { return this.sessionCursor?.nextSequence ?? this.localSequence; }
    private set nextSequence(value: number) {
        if (this.sessionCursor) this.sessionCursor.nextSequence = value;
        else this.localSequence = value;
    }
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
    private readonly suppressedResults = new Set<string>();
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

    public static async attachAutomated(socket: Socket, session: SessionOpenData,
        initialSnapshots: readonly unknown[] = [], initialResults: readonly unknown[] = [],
        clock: ActionTurnsV8Clock = actionTurnsClock,
        sessionCursor?: ActionTurnsSessionCursor): Promise<ActionTurnsV8Client<'nimble-knots-artillery-v8-r1'>> {
        if (sessionCursor && sessionCursor.sessionId !== session.sessionId) throw new Error('V8 session cursor ownership mismatch.');
        const wire = await import('../../../shared/protocol-v8');
        const client = new ActionTurnsV8Client(socket, session.sessionId, wire, clock,
            'nimble-knots-artillery-v8-r1', wire.V8_AUTOMATION_ID, sessionCursor);
        const buffered = takeActionTurnsV8SessionEvents(socket);
        for (const value of [...initialSnapshots, ...buffered.snapshots]) client.onSnapshotEvent(value);
        for (const value of [...initialResults, ...buffered.results]) client.onResultEvent(value);
        return client;
    }

    private constructor(private readonly socket: Socket, private readonly sessionId: string,
        private readonly wire: V8Wire, private readonly clock: ActionTurnsV8Clock, private readonly rulesetId: R,
        private readonly automationId?: typeof import('../../../shared/combat-version').V8_AUTOMATION_ID,
        private readonly sessionCursor?: ActionTurnsSessionCursor) {
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
    public nextSessionSequence(): number { return this.nextSequence; }
    public suppressResult(): void {
        if (this.snapshot) this.suppressedResults.add(this.snapshot.challengeId);
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
        const request = (this.automationId ? this.wire.InputRequestV8AutomatedSchema
            : this.wire.InputRequestV8FamilySchema).parse({ ...this.ownership(),
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
                const parsed = (this.automationId ? this.wire.InputAckV8AutomatedSchema()
                    : this.wire.InputAckV8FamilySchema()).safeParse(raw);
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
            ...(this.automationId ? { automationId: this.automationId } : {}),
            expectedTurn: snapshot.simulation.turn, inputEpoch: snapshot.simulation.inputEpoch };
    }

    private sendNeutral(): Promise<ChallengeSnapshotV8 | void> {
        if (this.neutral) return this.neutral;
        const request = (this.automationId ? this.wire.InputCancelV8AutomatedSchema
            : this.wire.InputCancelV8FamilySchema).parse(this.ownership());
        const promise = new Promise<ChallengeSnapshotV8>((resolve, reject) => {
            const pending: PendingV8 = { valid: true, reject };
            this.neutralRequest = pending;
            const complete = (error?: Error, raw?: unknown) => {
                if (this.neutralRequest !== pending) return;
                this.clock.clearTimeout(pending.timer);
                this.neutralRequest = undefined;
                if (!pending.valid || this.disposed) return;
                const parsed = (this.automationId ? this.wire.InputAckV8AutomatedSchema()
                    : this.wire.InputAckV8FamilySchema()).safeParse(raw);
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
        const request = (this.automationId ? this.wire.InputReleaseV8AutomatedSchema
            : this.wire.InputReleaseV8R1Schema).parse(this.ownership());
        this.softFence = { challengeId: request.challengeId, turn: request.expectedTurn, epoch: request.inputEpoch };
        const promise = new Promise<ChallengeSnapshotV8 | void>((resolve, reject) => {
            const pending: PendingV8 = { valid: true, reject }; this.releaseRequest = pending;
            const complete = (error?: Error, raw?: unknown) => {
                if (this.releaseRequest !== pending) return;
                this.clock.clearTimeout(pending.timer); this.releaseRequest = undefined;
                if (!pending.valid || this.disposed) return;
                const parsed = (this.automationId ? this.wire.InputAckV8AutomatedSchema()
                    : this.wire.InputAckV8FamilySchema()).safeParse(raw);
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
        const schema = event === this.wire.protocolEventsV8.pause
            ? (this.automationId ? this.wire.ChallengePauseV8AutomatedSchema : this.wire.ChallengePauseV8FamilySchema)
            : (this.automationId ? this.wire.ChallengeLeaveV8AutomatedSchema : this.wire.ChallengeLeaveV8FamilySchema);
        const request = schema.parse({ requestId: createRequestId(), challengeId: this.snapshot.challengeId,
            rulesetId: this.snapshot.rulesetId,
            ...(this.automationId ? { automationId: this.automationId } : {}),
            sequence: this.nextSequence, ...body });
        return new Promise((resolve, reject) => {
            const pending: PendingV8 = { valid: true, reject }; this.lifecycle = pending;
            const complete = (error?: Error, raw?: unknown) => {
                if (this.lifecycle !== pending) return;
                this.clock.clearTimeout(pending.timer); this.lifecycle = undefined;
                if (!pending.valid || this.disposed) return;
                const parsed = (this.automationId ? this.wire.LifecycleAckV8AutomatedSchema
                    : this.wire.LifecycleAckV8FamilySchema).safeParse(raw);
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
        if (candidate.rulesetId !== this.rulesetId || this.automation(candidate) !== this.automationId ||
            this.disposed || this.terminal || candidate.sessionId !== this.sessionId ||
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
            this.automation(candidate) === this.automationId &&
            candidate.rulesetId === current.rulesetId && candidate.mode === current.mode && candidate.calling === current.calling &&
            candidate.simulation.seed === current.simulation.seed && candidate.simulation.revision < current.simulation.revision &&
            candidate.simulation.tick <= current.simulation.tick && candidate.simulation.inputEpoch <= current.simulation.inputEpoch &&
            candidate.nextInputSequence <= this.nextInputSequence;
    }

    private acceptResult(candidate: ChallengeResultV8): boolean {
        if (candidate.rulesetId !== this.rulesetId || this.automation(candidate) !== this.automationId ||
            candidate.sessionId !== this.sessionId || (this.challengeId && candidate.challengeId !== this.challengeId)) return false;
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
        if (this.suppressedResults.delete(candidate.challengeId)) return true;
        if (!this.resultListeners.size) this.pendingTerminal = true;
        else for (const listener of this.resultListeners) listener(structuredClone(candidate));
        return true;
    }

    private onSnapshotEvent = (raw: unknown): void => {
        if (!this.connected) { this.buffer(this.bufferedSnapshots, raw); return; }
        const parsed = (this.automationId ? this.wire.ChallengeSnapshotV8AutomatedSchema
            : this.wire.ChallengeSnapshotV8FamilySchema).safeParse(raw);
        if (!parsed.success) this.notifyError('The server sent an invalid V8 snapshot.');
        else this.acceptSnapshot(parsed.data);
    };
    private onResultEvent = (raw: unknown): void => {
        if (!this.connected) { this.buffer(this.bufferedResults, raw); return; }
        const parsed = (this.automationId ? this.wire.ChallengeResultV8AutomatedSchema
            : this.wire.ChallengeResultV8FamilySchema).safeParse(raw);
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
                    const parsed = (this.automationId ? this.wire.ChallengeSnapshotV8AutomatedSchema
                        : this.wire.ChallengeSnapshotV8FamilySchema).safeParse(value);
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
    private automation(value: object): unknown { return 'automationId' in value ? value.automationId : undefined; }
    private buffer(values: unknown[], value: unknown): void { values.push(value); if (values.length > 8) values.shift(); }
}

export function liveActionTurnsV8Args<R extends V8RulesetId>(client: ActionTurnsV8Client<R>, snapshot: SnapshotForV8<R>,
    restart?: () => Promise<CombatSceneArgsV8>): CombatSceneArgsV8 {
    return { kind: 'v8', snapshot,
        submitIntent: intent => client.submitIntent(intent), cancelInput: () => client.cancelInput(),
        releaseMovement: () => client.releaseMovement(), inputReady: () => client.inputReady(),
        inputFlight: () => client.inputFlight(), onInputReady: listener => client.onInputReady(listener),
        setPaused: paused => client.setPaused(paused), restart,
        onSnapshot: listener => client.onSnapshot(listener), onResult: listener => client.onResult(listener),
        onConnection: listener => client.onConnection(listener), onUnavailable: listener => client.onUnavailable(listener),
        onError: listener => client.onError(listener) };
}

type PracticeLifecycleHost = {
    readonly socket: Socket;
    readonly session: SessionOpenData;
    readonly cursor: ActionTurnsSessionCursor;
    readonly legacySnapshot: ChallengeSnapshot | undefined;
    readonly listeners: Set<(result: LiveCombatResult) => void>;
    busy: boolean;
    acceptLegacy(snapshot: ChallengeSnapshot): void;
    acceptLegacyResult(result: ChallengeResult): void;
    clearLegacy(id: string): void;
    suppressLegacy(id: string): void;
    acceptReward(update: RewardUpdateData): void;
    rejectSequence(sequence: number, error: ProtocolError): void;
    emit(event: string, request: unknown): Promise<unknown>;
    error(error: ProtocolError): Error;
};

/** Lazy versioned lifecycle. Its bridge always reads the current parent session and cursor. */
export class ActionTurnsLifecycle {
    private client?: ActionTurnsV8Client<'nimble-knots-artillery-v8-r1'>;
    private pendingResult?: ChallengeResultV8Automated;
    private unsubscribeResult?: Unsubscribe;

    public constructor(private readonly host: PracticeLifecycleHost) {}

    public async attach(snapshots: readonly unknown[], results: readonly unknown[] = []): Promise<void> {
        this.adopt(await ActionTurnsV8Client.attachAutomated(this.host.socket, this.host.session,
            snapshots, results, undefined, this.host.cursor));
    }

    public currentSnapshot(): LiveCombatSnapshot | undefined {
        return (this.client?.currentSnapshot() as ChallengeSnapshotV8Automated | undefined) ?? this.host.legacySnapshot;
    }

    public async start(calling: PlayerCalling): Promise<LiveCombatSnapshot> {
        const current = this.currentSnapshot();
        if (current?.sessionId === this.host.session.sessionId && current.status === 'active') return current;
        return this.create({ mode: 'practice', calling });
    }

    public async startReward(calling: PlayerCalling): Promise<LiveCombatSnapshot> {
        if (this.currentSnapshot()?.status === 'active')
            throw new Error('Finish or leave the active Clash before starting a reward match.');
        const reservation = await this.reserve(calling);
        return this.create({ mode: 'reward', calling, eligibility: {
            challengeId: reservation.challengeId, token: reservation.eligibilityToken
        } });
    }

    public async retry(calling: PlayerCalling): Promise<LiveCombatSnapshot> {
        if (this.client) {
            this.client.suppressResult();
            const current = this.client.currentSnapshot();
            if (current?.sessionId === this.host.session.sessionId && current.status === 'active') await this.client.leave();
            this.client.dispose(); this.client = undefined;
        } else {
            const current = this.host.legacySnapshot;
            if (current?.status === 'active') {
                this.host.suppressLegacy(current.challengeId); await this.leaveLegacy(current.challengeId);
            }
        }
        return this.start(calling);
    }

    public combatArgs(snapshot: ChallengeSnapshotV8Automated): CombatSceneArgsV8 {
        if (!this.client) throw new Error('Automated combat transport is unavailable.');
        const args = liveActionTurnsV8Args(this.client, snapshot, async () => {
            const next = await this.retry(snapshot.calling);
            if (next.protocolVersion !== 8) throw new Error('Combat version changed during retry.');
            return this.combatArgs(next);
        });
        return { ...args, onResult: listener => {
            const receive = (result: LiveCombatResult) => { if (result.protocolVersion === 8) listener(result); };
            this.host.listeners.add(receive); this.flushResult(receive);
            return () => this.host.listeners.delete(receive);
        } };
    }

    public flushResult(listener: (result: LiveCombatResult) => void): void {
        if (!this.pendingResult) return;
        const result = this.pendingResult; this.pendingResult = undefined;
        queueMicrotask(() => { if (this.host.listeners.has(listener)) listener(structuredClone(result)); });
    }

    public dispose(): void { this.unsubscribeResult?.(); this.client?.dispose(); }

    public async leaveLegacy(challengeId: string): Promise<ChallengeResult> {
        if (this.host.busy) throw new Error('Another practice action is still pending.');
        this.host.busy = true;
        const requestId = createRequestId();
        const sequence = this.host.cursor.nextSequence;
        const request = { requestId, sequence, challengeId };
        try {
            const raw = await this.host.emit(protocolEvents.challengeLeave, request);
            const parsed = ChallengeLeaveAckSchema.safeParse(raw);
            if (!parsed.success || parsed.data.requestId !== requestId) {
                throw new Error('Server returned an invalid leave acknowledgement.');
            }
            if (parsed.data.ok === false) {
                this.host.rejectSequence(sequence, parsed.data.error);
                throw this.host.error(parsed.data.error);
            }
            this.host.cursor.nextSequence = Math.max(this.host.cursor.nextSequence, parsed.data.data.nextSequence);
            this.host.acceptLegacyResult(parsed.data.data);
            this.host.clearLegacy(challengeId);
            return structuredClone(parsed.data.data);
        } finally {
            this.host.busy = false;
        }
    }

    public async rewardInfo(): Promise<RewardInfoData> {
        await whenSessionReady(this.host.socket);
        const requestId = createRequestId();
        const raw = await this.host.emit(protocolEvents.rewardInfo, { requestId });
        const parsed = RewardInfoAckSchema.safeParse(raw);
        if (!parsed.success || parsed.data.requestId !== requestId) {
            throw new Error('Server returned invalid Daily Challenge availability.');
        }
        if (parsed.data.ok === false) throw this.host.error(parsed.data.error);
        return structuredClone(parsed.data.data);
    }

    public async reserve(calling: PlayerCalling): Promise<RewardReservationData> {
        if (this.host.busy) throw new Error('Another Clash action is still pending.');
        if (!this.host.socket.connected) throw new Error('Reconnecting to the Clash server.');
        this.host.busy = true;
        const requestId = createRequestId();
        const sequence = this.host.cursor.nextSequence;
        try {
            const raw = await this.host.emit(protocolEvents.rewardReserve, {
                requestId,
                sequence,
                calling
            });
            const parsed = RewardReserveAckSchema.safeParse(raw);
            if (!parsed.success || parsed.data.requestId !== requestId) {
                throw new Error('Server returned an invalid reward reservation.');
            }
            if (parsed.data.ok === false) {
                this.host.rejectSequence(sequence, parsed.data.error);
                throw this.host.error(parsed.data.error);
            }
            this.host.cursor.nextSequence = Math.max(this.host.cursor.nextSequence, sequence + 1);
            return structuredClone(parsed.data.data);
        } finally { this.host.busy = false; }
    }

    public async claimReward(update: RewardUpdateData): Promise<RewardUpdateData> {
        if (!update.claimNonce) throw new Error('Refresh reward status before claiming.');
        await whenSessionReady(this.host.socket);
        const requestId = createRequestId();
        const raw = await this.host.emit(protocolEvents.rewardClaim, {
            requestId, entitlementId: update.entitlementId, claimNonce: update.claimNonce,
            idempotencyKey: createRequestId()
        });
        const parsed = RewardClaimAckSchema.safeParse(raw);
        if (!parsed.success || parsed.data.requestId !== requestId) {
            throw new Error('Server returned an invalid reward claim.');
        }
        if (parsed.data.ok === false) throw this.host.error(parsed.data.error);
        this.host.acceptReward(parsed.data.data);
        return structuredClone(parsed.data.data);
    }

    public async rewardStatus(entitlementId?: string): Promise<RewardUpdateData> {
        await whenSessionReady(this.host.socket);
        const requestId = createRequestId();
        const raw = await this.host.emit(protocolEvents.rewardStatus, {
            requestId, ...(entitlementId ? { entitlementId } : {})
        });
        const parsed = RewardStatusAckSchema.safeParse(raw);
        if (!parsed.success || parsed.data.requestId !== requestId) {
            throw new Error('Server returned an invalid reward status.');
        }
        if (parsed.data.ok === false) throw this.host.error(parsed.data.error);
        this.host.acceptReward(parsed.data.data);
        return structuredClone(parsed.data.data);
    }

    private async create(body: Record<string, unknown>): Promise<LiveCombatSnapshot> {
        if (this.host.busy) throw new Error('Another Clash action is still pending.');
        await whenSessionReady(this.host.socket);
        if (this.host.busy) throw new Error('Another Clash action is still pending.');
        this.host.busy = true;
        const requestId = createRequestId();
        const cursor = this.host.cursor;
        const sequence = cursor.nextSequence;
        try {
            const wire = await import('../../../shared/protocol-v8');
            if (cursor !== this.host.cursor) throw new Error('Creation belongs to the previous session.');
            const request = wire.ChallengeCreateV8Schema.parse({ requestId, sequence, ...body });
            const raw = await this.host.emit(wire.protocolEventsV8.create, request);
            if (cursor !== this.host.cursor) throw new Error('Creation belongs to the previous session.');
            const parsed = wire.ChallengeCreateAckV8Schema.safeParse(raw);
            if (!parsed.success || parsed.data.requestId !== requestId) throw new Error('Invalid versioned creation acknowledgement.');
            if (parsed.data.ok === false) {
                cursor.nextSequence = Math.max(cursor.nextSequence, parsed.data.nextSequence);
                throw this.host.error(parsed.data.error);
            }
            if (parsed.data.nextSequence !== sequence + 1) throw new Error('Invalid versioned creation sequence.');
            const created = parsed.data.data.snapshot;
            if (created.sessionId !== this.host.session.sessionId || created.nextSequence !== parsed.data.nextSequence ||
                created.mode !== body.mode || created.calling !== body.calling ||
                (request.mode === 'reward' && created.challengeId !== request.eligibility.challengeId))
                throw new Error('Invalid versioned creation identity.');
            cursor.nextSequence = parsed.data.nextSequence;
            if (parsed.data.data.kind === 'legacy') {
                this.host.acceptLegacy(parsed.data.data.snapshot);
                return structuredClone(parsed.data.data.snapshot);
            }
            this.client?.dispose();
            await this.attach([parsed.data.data.snapshot]);
            return structuredClone(parsed.data.data.snapshot);
        } finally { this.host.busy = false; }
    }

    private adopt(client: ActionTurnsV8Client<'nimble-knots-artillery-v8-r1'>): void {
        this.unsubscribeResult?.(); this.client = client;
        this.unsubscribeResult = client.onResult(result => {
            if (!this.host.listeners.size) {
                this.pendingResult = structuredClone(result) as ChallengeResultV8Automated; return;
            }
            for (const listener of this.host.listeners) listener(structuredClone(result) as ChallengeResultV8Automated);
        });
    }
}
