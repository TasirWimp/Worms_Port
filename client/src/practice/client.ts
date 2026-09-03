import type { Socket } from 'socket.io-client';

import {
    ChallengeCreateAckSchema,
    ChallengePauseAckSchema,
    ChallengeResultSchema,
    ChallengeSnapshotSchema,
    CommandSubmitAckSchema,
    protocolEvents,
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
import type { ChallengeSnapshotV8Automated, ChallengeResultV8Automated } from '../../../shared/protocol-v8';
import type { CombatSceneArgs } from '../combat/contracts';
import { reconnectSession, takeActionTurnsV8SessionEvents, whenSessionReady } from '../lib/session';

const ACK_TIMEOUT_MS = 5_000;
const ACTIVE_PRACTICE_KEY = 'nimble-knots.active-practice';
export const PRACTICE_CLIENT_REGISTRY_KEY = 'practice-client';

export type PracticeConnectionState = 'connected' | 'reconnecting';
export type Unsubscribe = () => void;
export type LiveCombatSnapshot = ChallengeSnapshot | ChallengeSnapshotV8Automated;
export type LiveCombatResult = ChallengeResult | ChallengeResultV8Automated;

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
    private sessionCursor: import('./action-turns-v8').ActionTurnsSessionCursor;
    private get nextSequence(): number { return this.sessionCursor.nextSequence; }
    private set nextSequence(value: number) { this.sessionCursor.nextSequence = value; }
    private session: SessionOpenData;
    private lifecycle?: import('./action-turns-v8').ActionTurnsLifecycle;
    private lifecycleReady?: Promise<import('./action-turns-v8').ActionTurnsLifecycle>;
    private readonly combatResultListeners = new Set<(result: LiveCombatResult) => void>();
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
        this.session = structuredClone(session);
        this.sessionId = session.sessionId;
        this.sessionCursor = { sessionId: session.sessionId, nextSequence: 0 };
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

    public static async connect(socket: Socket, session: SessionOpenData,
        initialSnapshots: readonly unknown[] = [], initialResults: readonly unknown[] = []): Promise<PracticeClient> {
        const client = new PracticeClient(socket, session, initialSnapshots, initialResults);
        const buffered = takeActionTurnsV8SessionEvents(socket);
        if (buffered.snapshots.length || buffered.results.length) {
            await (await client.getLifecycle()).attach(buffered.snapshots, buffered.results);
        }
        return client;
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

    public currentCombatSnapshot(): LiveCombatSnapshot | undefined {
        return this.lifecycle?.currentSnapshot() ?? this.currentSnapshot();
    }

    public async startCombat(calling: PlayerCalling): Promise<LiveCombatSnapshot> {
        return (await this.getLifecycle()).start(calling);
    }

    public currentIdentity(): WalletIdentity | undefined {
        return this.identity ? structuredClone(this.identity) : undefined;
    }

    public noteAuthorizedIdentity(identity: WalletIdentity): void {
        this.identity = structuredClone(identity);
    }

    public async rewardInfo(): Promise<RewardInfoData> {
        return (await this.getLifecycle()).rewardInfo();
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

    public async startRewardCombat(calling: PlayerCalling): Promise<LiveCombatSnapshot> {
        return (await this.getLifecycle()).startReward(calling);
    }

    public async retryCombat(calling: PlayerCalling): Promise<LiveCombatSnapshot> {
        return (await this.getLifecycle()).retry(calling);
    }

    public async combatArgs(snapshot: LiveCombatSnapshot): Promise<CombatSceneArgs> {
        if (snapshot.protocolVersion === 1) return liveCombatArgs(this, snapshot);
        return (await this.getLifecycle()).combatArgs(snapshot);
    }

    public onCombatResult(listener: (result: LiveCombatResult) => void): Unsubscribe {
        this.combatResultListeners.add(listener);
        this.lifecycle?.flushResult(listener);
        const legacy = this.onResult(listener);
        return () => { legacy(); this.combatResultListeners.delete(listener); };
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
        return (await this.getLifecycle()).claimReward(update);
    }

    public async rewardStatus(entitlementId?: string): Promise<RewardUpdateData> {
        return (await this.getLifecycle()).rewardStatus(entitlementId);
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
        this.lifecycle?.dispose();
        this.combatResultListeners.clear();
    }

    private async leave(challengeId: string): Promise<ChallengeResult> {
        return (await this.getLifecycle()).leaveLegacy(challengeId);
    }

    private async reserveReward(calling: PlayerCalling): Promise<RewardReservationData> {
        return (await this.getLifecycle()).reserve(calling);
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

    private getLifecycle(): Promise<import('./action-turns-v8').ActionTurnsLifecycle> {
        const owner = this;
        return this.lifecycleReady ??= import('./action-turns-v8').then(module => this.lifecycle = new module.ActionTurnsLifecycle({
            socket: this.socket, listeners: this.combatResultListeners,
            get session() { return owner.session; }, get cursor() { return owner.sessionCursor; },
            get busy() { return owner.mutationPending; }, set busy(value) { owner.mutationPending = value; },
            get legacySnapshot() { return owner.currentSnapshot(); },
            acceptLegacy: snapshot => this.acceptSnapshot(snapshot),
            acceptLegacyResult: result => this.acceptResult(result),
            clearLegacy: id => { if (this.snapshot?.challengeId === id) this.snapshot = undefined; },
            suppressLegacy: id => this.suppressedLeaveChallenges.add(id),
            acceptReward: update => this.acceptRewardUpdate(update),
            rejectSequence: (sequence, error) => this.consumeRejectedSequence(sequence, error),
            emit: (event, request) => this.emitWithRetry(event, request),
            error: error => new PracticeProtocolError(error)
        }));
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
                    this.sessionCursor = { sessionId: session.sessionId, nextSequence: 0 };
                    this.snapshot = undefined;
                    this.identity = session.identity
                        ? structuredClone(session.identity)
                        : undefined;
                    clearActivePractice();
                    for (const listener of this.unavailableListeners) {
                        listener('The previous in-memory Practice Clash cannot be resumed. Start a fresh Clash.');
                    }
                }
                this.session = structuredClone(session);
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
