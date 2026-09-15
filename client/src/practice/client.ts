import type { Socket } from 'socket.io-client';

import type { ChallengeResultV10, ChallengeSnapshotV10 } from '../../../shared/protocol-v10-live';
import {
    RewardUpdateDataSchema,
    protocolEvents,
    type ProtocolError,
    type RewardInfoData,
    type RewardUpdateData,
    type SessionOpenData,
    type WalletIdentity
} from '../../../shared/protocol';
import type { PlayerCalling } from '../../../shared/simulation';
import type { CombatSceneArgsV10 } from '../combat/contracts';
import { takeTerrainV10SessionEvents, whenSessionReady } from '../lib/session';
import type { PracticeConnectionState, PracticeSessionCursor, Unsubscribe } from './contracts';
import { clearActivePractice, readActivePractice } from './storage';

const ACK_TIMEOUT_MS = 5_000;
export const PRACTICE_CLIENT_REGISTRY_KEY = 'practice-client';

export type { PracticeConnectionState, Unsubscribe } from './contracts';
export class PracticeProtocolError extends Error {
    public constructor(public readonly protocolError: ProtocolError) {
        super(protocolError.message);
        this.name = 'PracticeProtocolError';
    }
}

/**
 * Current product facade. Practice and Daily always enter the V10 volcanic
 * authority; identity, rewards and PEI retain their independent protocols.
 */
export class PracticeClient {
    private sessionId: string;
    private identity?: WalletIdentity;
    private sessionCursor: PracticeSessionCursor;
    private session: SessionOpenData;
    private mutationPending = false;
    private pendingUnavailable?: string;
    private readonly connectionListeners = new Set<(state: PracticeConnectionState) => void>();
    private readonly unavailableListeners = new Set<(message: string) => void>();
    private readonly errorListeners = new Set<(message: string) => void>();
    private readonly rewardListeners = new Set<(update: RewardUpdateData) => void>();
    private readonly rewardUpdates = new Map<string, RewardUpdateData>();
    private v10?: import('./v10-client').V10PracticeClient;
    private v10Ready?: Promise<import('./v10-client').V10PracticeClient>;
    private rewards?: import('./rewards').RewardProtocolClient;
    private rewardsReady?: Promise<import('./rewards').RewardProtocolClient>;
    private pei?: import('../pei/client').PeiProtocolClientV0;
    private peiReady?: Promise<import('../pei/client').PeiProtocolClientV0>;

    public constructor(private readonly socket: Socket, session: SessionOpenData) {
        this.session = structuredClone(session);
        this.sessionId = session.sessionId;
        this.sessionCursor = {
            sessionId: session.sessionId,
            nextSequence: session.nextSequence ?? 0
        };
        this.identity = session.identity ? structuredClone(session.identity) : undefined;
        const stored = readActivePractice();
        if (stored && stored.sessionId !== session.sessionId) {
            this.pendingUnavailable =
                'The previous in-memory Practice Clash cannot be resumed. Start a fresh Clash.';
            clearActivePractice();
        }
        this.onDisconnect = this.onDisconnect.bind(this);
        this.onConnect = this.onConnect.bind(this);
        this.onRewardUpdateEvent = this.onRewardUpdateEvent.bind(this);
        socket.on(protocolEvents.rewardUpdate, this.onRewardUpdateEvent);
        socket.on('disconnect', this.onDisconnect);
        socket.on('connect', this.onConnect);
    }

    public static async connect(socket: Socket, session: SessionOpenData): Promise<PracticeClient> {
        const client = new PracticeClient(socket, session);
        if (typeof window !== 'undefined' && window.location?.origin && typeof fetch === 'function') {
            const response = await fetch('/api/practice-profile');
            if (!response.ok) throw new Error('Practice configuration is unavailable. Reload to retry.');
            const profile = await response.json();
            if (!profile || profile.ruleset !== 'volcanic-v10') {
                throw new Error('This client requires the current volcanic V10 Practice profile.');
            }
        }
        const v10 = await client.getV10();
        const buffered = takeTerrainV10SessionEvents(socket);
        v10.restore(buffered.snapshots, buffered.results);
        return client;
    }

    public currentCombatSnapshot(): ChallengeSnapshotV10 | undefined {
        return this.v10?.currentSnapshot();
    }

    public async startCombat(calling: PlayerCalling): Promise<ChallengeSnapshotV10> {
        const v10 = await this.getV10();
        const current = v10.currentSnapshot();
        if (current?.status === 'active') return current;
        return v10.start('practice', calling);
    }

    public currentIdentity(): WalletIdentity | undefined {
        return this.identity ? structuredClone(this.identity) : undefined;
    }

    public noteAuthorizedIdentity(identity: WalletIdentity): void {
        this.identity = structuredClone(identity);
    }

    public async beginPei(): Promise<import('../../../shared/pei-wire-v0').PeiLaunchData> {
        return (await this.getPei()).begin();
    }

    public async returnPei(
        kind: import('../../../shared/pei-wire-v0').PeiReturnKind,
        carrier: string
    ): Promise<
        import('../../../shared/pei-wire-v0').PeiLaunchData |
        import('../../../shared/pei-wire-v0').PeiQualifiedData
    > {
        return (await this.getPei()).returned(kind, carrier);
    }

    public async rewardInfo(): Promise<RewardInfoData> {
        return (await this.getRewards()).info();
    }

    public async startRewardCombat(calling: PlayerCalling): Promise<ChallengeSnapshotV10> {
        const reservation = await (await this.getRewards()).reserve(calling);
        return (await this.getV10()).start('reward', calling, {
            challengeId: reservation.challengeId,
            eligibilityToken: reservation.eligibilityToken
        });
    }

    public async retryCombat(calling: PlayerCalling): Promise<ChallengeSnapshotV10> {
        const v10 = await this.getV10();
        if (v10.currentSnapshot()?.status === 'active') await v10.leave();
        return v10.start('practice', calling);
    }

    public async combatArgs(snapshot: ChallengeSnapshotV10): Promise<CombatSceneArgsV10> {
        if (snapshot.protocolVersion !== 10) throw new Error('Current combat requires V10 authority.');
        return (await this.getV10()).combatArgs(snapshot);
    }

    public onCombatResult(listener: (result: ChallengeResultV10) => void): Unsubscribe {
        if (!this.v10) throw new Error('Current V10 combat is not initialized.');
        return this.v10.onResult(listener);
    }

    public dismissCompletedCombat(): void {
        this.v10?.dismissCompletedCombat();
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
        return (await this.getRewards()).claim(update);
    }

    public async rewardStatus(entitlementId?: string): Promise<RewardUpdateData> {
        return (await this.getRewards()).status(entitlementId);
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
        this.socket.off(protocolEvents.rewardUpdate, this.onRewardUpdateEvent);
        this.socket.off('disconnect', this.onDisconnect);
        this.socket.off('connect', this.onConnect);
        this.connectionListeners.clear();
        this.unavailableListeners.clear();
        this.errorListeners.clear();
        this.rewardListeners.clear();
        this.v10?.dispose();
    }

    private getV10(): Promise<import('./v10-client').V10PracticeClient> {
        return this.v10Ready ??= import('./v10-client').then((module) =>
            this.v10 = new module.V10PracticeClient(
                this.socket,
                () => this.session,
                this.sessionCursor
            )
        );
    }

    private getRewards(): Promise<import('./rewards').RewardProtocolClient> {
        const owner = this;
        return this.rewardsReady ??= import('./rewards').then((module) =>
            this.rewards = new module.RewardProtocolClient({
                socket: owner.socket,
                get cursor() { return owner.sessionCursor; },
                get busy() { return owner.mutationPending; },
                set busy(value) { owner.mutationPending = value; },
                emit: (event, request) => owner.emitWithRetry(event, request),
                rejectSequence: (sequence, error) => owner.consumeRejectedSequence(sequence, error),
                error: (error) => new PracticeProtocolError(error),
                accept: (update) => owner.acceptRewardUpdate(update)
            })
        );
    }

    private getPei(): Promise<import('../pei/client').PeiProtocolClientV0> {
        const owner = this;
        return this.peiReady ??= import('../pei/client').then((module) =>
            this.pei = new module.PeiProtocolClientV0({
                socket: this.socket,
                cursor: this.sessionCursor,
                get busy() { return owner.mutationPending; },
                set busy(value) { owner.mutationPending = value; },
                rejectSequence: (sequence, error) => this.consumeRejectedSequence(sequence, error)
            })
        );
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
                (timeoutError: Error | null, acknowledgement: unknown) => {
                    if (timeoutError) reject(new Error(`${event} acknowledgement timed out.`));
                    else resolve(acknowledgement);
                }
            );
        });
    }

    private consumeRejectedSequence(sequence: number, error: ProtocolError): void {
        if (!['STALE_SEQUENCE', 'SEQUENCE_GAP', 'UNAUTHORIZED', 'SESSION_EXPIRED'].includes(error.code)) {
            this.sessionCursor.nextSequence = Math.max(this.sessionCursor.nextSequence, sequence + 1);
        }
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
        for (const listener of this.rewardListeners) listener(structuredClone(update));
    }

    private onDisconnect(): void {
        for (const listener of this.connectionListeners) listener('reconnecting');
    }

    private onConnect(): void {
        queueMicrotask(() => {
            void whenSessionReady(this.socket).then((session) => {
                if (session.sessionId !== this.sessionId) {
                    this.v10?.sessionExpired();
                    this.v10 = undefined;
                    this.v10Ready = undefined;
                    this.rewards = undefined;
                    this.rewardsReady = undefined;
                    this.pei = undefined;
                    this.peiReady = undefined;
                    this.sessionId = session.sessionId;
                    this.sessionCursor = {
                        sessionId: session.sessionId,
                        nextSequence: session.nextSequence ?? 0
                    };
                    this.identity = session.identity ? structuredClone(session.identity) : undefined;
                    clearActivePractice();
                    for (const listener of this.unavailableListeners) {
                        listener('The previous in-memory Practice Clash cannot be resumed. Start a fresh Clash.');
                    }
                }
                this.session = structuredClone(session);
                this.sessionCursor.nextSequence = Math.max(
                    this.sessionCursor.nextSequence,
                    session.nextSequence ?? 0
                );
                for (const listener of this.connectionListeners) listener('connected');
            }).catch(() => {
                for (const listener of this.connectionListeners) listener('reconnecting');
            });
        });
    }

    private notifyError(message: string): void {
        for (const listener of this.errorListeners) listener(message);
    }
}
