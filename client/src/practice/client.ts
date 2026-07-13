import type { Socket } from 'socket.io-client';

import {
    ChallengeCreateAckSchema,
    ChallengeLeaveAckSchema,
    ChallengePauseAckSchema,
    ChallengeResultSchema,
    ChallengeSnapshotSchema,
    CommandSubmitAckSchema,
    protocolEvents,
    type ChallengeResult,
    type ChallengeSnapshot,
    type ProtocolError,
    type SessionOpenData
} from '../../../shared/protocol';
import type { PlayerCalling, SimulationCommand } from '../../../shared/simulation';
import type { CombatSceneArgs } from '../combat/contracts';
import { whenSessionReady } from '../lib/session';

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

    public constructor(
        private readonly socket: Socket,
        session: SessionOpenData,
        initialSnapshots: readonly unknown[] = [],
        initialResults: readonly unknown[] = []
    ) {
        this.sessionId = session.sessionId;
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
        socket.on(protocolEvents.snapshot, this.onSnapshotEvent);
        socket.on(protocolEvents.result, this.onResultEvent);
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
        this.socket.off('disconnect', this.onDisconnect);
        this.socket.off('connect', this.onConnect);
        this.snapshotListeners.clear();
        this.resultListeners.clear();
        this.connectionListeners.clear();
        this.unavailableListeners.clear();
        this.errorListeners.clear();
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
