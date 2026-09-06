import type { Socket } from 'socket.io-client';
import type { z } from 'zod';
import type { PlayerCalling } from '../../../shared/simulation';
import type { SessionOpenData } from '../../../shared/protocol';
import {
    CandidateAckV9Schema, ChallengeCreateAckV9Schema, ChallengeResultV9Schema,
    ChallengeSnapshotV9Schema, protocolEventsV9,
    type ChallengeResultV9
} from '../../../shared/protocol-v9';
import { V9_AUTOMATION_ID } from '../../../shared/combat-version';
import { V9_RULESET_ID, type SimulationIntentV9, type SimulationStateV9 } from '../../../shared/simulation-v9';
import type { CombatSceneArgsV9 } from '../combat/contracts';

export type CandidateSnapshotV9 = z.infer<typeof ChallengeSnapshotV9Schema>;

/**
 * Client-side ownership projection for the candidate transport. It deliberately
 * projects only acknowledged authority facts: scenes retire their old control
 * generation whenever connection or challenge ownership changes.
 */
export class ResourceTurnsV9Lifecycle {
    private snapshot?: CandidateSnapshotV9;
    private connected = true;
    private resyncRequired = false;
    private currentGeneration = 0;
    public get generation(): number { return this.currentGeneration; }
    public get current(): CandidateSnapshotV9 | undefined { return this.snapshot && structuredClone(this.snapshot); }
    public get ready(): boolean { return this.connected && !this.resyncRequired && !!this.snapshot; }
    public disconnect(): void { if (this.connected) { this.connected = false; this.resyncRequired = true; this.currentGeneration += 1; } }
    public acceptSnapshot(value: unknown, ownedSessionId: string, resync = false): CandidateSnapshotV9 | undefined {
        const parsed = ChallengeSnapshotV9Schema.safeParse(value);
        if (!parsed.success || parsed.data.sessionId !== ownedSessionId) return undefined;
        const next = parsed.data;
        if (this.snapshot && (this.snapshot.challengeId !== next.challengeId || this.snapshot.sessionId !== next.sessionId)) return undefined;
        if (this.resyncRequired && !resync) return undefined;
        if (this.snapshot) {
            if (next.simulation.revision < this.snapshot.simulation.revision || next.nextInputSequence < this.snapshot.nextInputSequence || next.nextSequence < this.snapshot.nextSequence) return undefined;
            if (next.simulation.revision === this.snapshot.simulation.revision &&
                (next.stateHash !== this.snapshot.stateHash || next.status !== this.snapshot.status || next.paused !== this.snapshot.paused ||
                next.nextInputSequence !== this.snapshot.nextInputSequence || next.nextSequence !== this.snapshot.nextSequence)) return undefined;
        }
        if (!this.connected) this.currentGeneration += 1;
        this.connected = true; this.resyncRequired = false; this.snapshot = structuredClone(next); return this.current;
    }
    public canPause(): boolean { const state = this.snapshot?.simulation as SimulationStateV9 | undefined; return Boolean(this.connected && !this.resyncRequired && this.snapshot?.mode === 'practice' &&
        this.snapshot.status === 'active' && !this.snapshot.paused && state?.activeActor === 'player' && state.phase === 'action' &&
        state.units.every(unit => unit.alive && unit.grounded && unit.vxFp === 0 && unit.vyFp === 0)); }
    public pauseUnavailableReason(): string | undefined {
        if (!this.connected) return 'Reconnect and wait for a fresh authoritative snapshot.';
        if (!this.snapshot) return 'Waiting for a fresh authoritative snapshot.';
        return this.snapshot.mode === 'reward' ? 'Rewarded candidate matches cannot pause.' : undefined;
    }
}

export type V9CandidateConnection = 'connected' | 'reconnecting';
export type V9CandidateCursor = { sessionId: string; nextSequence: number };
export type V9CandidateReservation = { challengeId: string; eligibilityToken: string };

/**
 * The V9 route is deliberately injected by the caller.  It owns only V9
 * envelopes and never falls through to the ordinary V7 Practice transport.
 */
export class ResourceTurnsV9Client {
    private readonly lifecycle = new ResourceTurnsV9Lifecycle();
    private snapshot?: CandidateSnapshotV9;
    private terminal?: ChallengeResultV9;
    private disposed = false;
    private mutation?: Promise<unknown>;
    private readonly snapshots = new Set<(value: CandidateSnapshotV9) => void>();
    private readonly results = new Set<(value: ChallengeResultV9) => void>();
    private readonly connections = new Set<(value: V9CandidateConnection) => void>();
    private readonly errors = new Set<(value: string) => void>();
    private readonly unavailable = new Set<(value: string) => void>();

    private readonly initialSessionId: string;
    public constructor(private readonly socket: Socket, private readonly session: () => SessionOpenData,
        private readonly cursor: V9CandidateCursor) {
        this.initialSessionId = session().sessionId;
        socket.on(protocolEventsV9.snapshot, this.onSnapshotEvent);
        socket.on(protocolEventsV9.result, this.onResultEvent);
        socket.on('disconnect', this.onDisconnect);
        socket.on('connect', this.onConnect);
    }

    public currentSnapshot(): CandidateSnapshotV9 | undefined { return this.snapshot && structuredClone(this.snapshot); }
    public inputReady(): boolean {
        const value = this.snapshot;
        return Boolean(value && this.lifecycle.ready && this.socket.connected && !this.mutation && value.status === 'active' && !value.paused &&
            value.sessionId === this.session().sessionId && value.simulation.activeActor === 'player' &&
            (value.simulation.phase === 'action' || value.simulation.phase === 'retreat'));
    }
    public pauseAllowed(): boolean { return this.lifecycle.canPause() && !this.mutation; }
    public pauseReason(): string | undefined { return this.lifecycle.pauseUnavailableReason(); }
    public combatArgs(snapshot: CandidateSnapshotV9): CombatSceneArgsV9 {
        if (snapshot.challengeId !== this.snapshot?.challengeId) throw new Error('V9 candidate ownership changed.');
        const mode = snapshot.mode;
        return {
            kind: 'v9', snapshot: snapshot.simulation as SimulationStateV9, previewLabel: 'V9 candidate · server-authoritative', rewarded: mode === 'reward', calling: snapshot.calling,
            submit: intent => this.submit(intent).then(value => value.simulation as SimulationStateV9),
            setPaused: paused => this.setPaused(paused).then(value => value.simulation as SimulationStateV9),
            cancelInput: () => this.cancelInput().then(value => value.simulation as SimulationStateV9),
            releaseMovement: () => this.releaseMovement().then(value => value.simulation as SimulationStateV9),
            paused: () => this.snapshot?.paused ?? false,
            pauseAllowed: () => this.pauseAllowed(), pauseReason: () => this.pauseReason(),
            inputReady: () => this.inputReady(),
            onSnapshot: listener => this.onSnapshot(value => listener(value.simulation as SimulationStateV9, [])),
            onResult: listener => this.onResult(listener),
            onConnection: listener => this.onConnection(listener),
            onUnavailable: listener => this.onUnavailable(listener), onError: listener => this.onError(listener),
            restart: async () => {
                if (this.snapshot?.status === 'active') await this.leave();
                const next = await this.start(mode === 'reward' ? 'practice' : mode, snapshot.calling);
                return this.combatArgs(next);
            },
            destroy: () => undefined
        };
    }

    public async start(mode: 'practice' | 'reward', calling: PlayerCalling,
        reservation?: V9CandidateReservation): Promise<CandidateSnapshotV9> {
        const sequence = this.cursor.nextSequence;
        const request = mode === 'practice'
            ? { requestId: requestId(), sequence, mode, calling, rulesetId: V9_RULESET_ID, automationId: V9_AUTOMATION_ID }
            : { requestId: requestId(), sequence, mode, calling, challengeId: reservation?.challengeId,
                eligibilityToken: reservation?.eligibilityToken, rulesetId: V9_RULESET_ID, automationId: V9_AUTOMATION_ID };
        const ack: any = await this.mutate<z.infer<typeof ChallengeCreateAckV9Schema>>(protocolEventsV9.create, request, ChallengeCreateAckV9Schema);
        if (!ack.data || !('simulation' in ack.data)) throw new Error('V9 creation did not return an authoritative snapshot.');
        return this.acceptAckSnapshot(ack.data, ack.nextSequence, ack.nextInputSequence, false);
    }

    public async submit(intent: SimulationIntentV9): Promise<CandidateSnapshotV9> {
        const value = this.requireInput();
        const request = { requestId: requestId(), challengeId: value.challengeId, rulesetId: V9_RULESET_ID,
            automationId: V9_AUTOMATION_ID, inputSequence: value.nextInputSequence,
            expectedTurn: value.simulation.turn, expectedPhase: value.simulation.phase,
            inputEpoch: value.simulation.inputEpoch, intent };
        const ack: any = await this.mutate<z.infer<typeof CandidateAckV9Schema>>(protocolEventsV9.input, request, CandidateAckV9Schema);
        if (!ack.data || !('simulation' in ack.data)) throw new Error('V9 input did not return an authoritative snapshot.');
        return this.acceptAckSnapshot(ack.data, ack.nextSequence, ack.nextInputSequence, false);
    }

    public cancelInput(): Promise<CandidateSnapshotV9> { return this.neutral(protocolEventsV9.cancel); }
    public releaseMovement(): Promise<CandidateSnapshotV9> { return this.neutral(protocolEventsV9.release); }
    private async neutral(event: string): Promise<CandidateSnapshotV9> {
        const value = this.requireSnapshot();
        const request = { requestId: requestId(), challengeId: value.challengeId, rulesetId: V9_RULESET_ID,
            automationId: V9_AUTOMATION_ID, expectedTurn: value.simulation.turn, inputEpoch: value.simulation.inputEpoch };
        const ack: any = await this.mutate<z.infer<typeof CandidateAckV9Schema>>(event, request, CandidateAckV9Schema);
        if (!ack.data || !('simulation' in ack.data)) throw new Error('V9 neutral fence did not return an authoritative snapshot.');
        return this.acceptAckSnapshot(ack.data, ack.nextSequence, ack.nextInputSequence, false);
    }

    public async setPaused(paused: boolean): Promise<CandidateSnapshotV9> {
        if (paused && !this.pauseAllowed()) throw new Error(this.pauseReason() ?? 'Pause is unavailable in this authority state.');
        const value = this.requireSnapshot();
        const request = { requestId: requestId(), challengeId: value.challengeId, rulesetId: V9_RULESET_ID,
            automationId: V9_AUTOMATION_ID, sequence: this.cursor.nextSequence, paused };
        const ack: any = await this.mutate<z.infer<typeof CandidateAckV9Schema>>(protocolEventsV9.pause, request, CandidateAckV9Schema);
        if (!ack.data || !('simulation' in ack.data)) throw new Error('V9 pause did not return an authoritative snapshot.');
        return this.acceptAckSnapshot(ack.data, ack.nextSequence, ack.nextInputSequence, false);
    }

    public async leave(): Promise<ChallengeResultV9> {
        const value = this.requireSnapshot();
        const request = { requestId: requestId(), challengeId: value.challengeId, rulesetId: V9_RULESET_ID,
            automationId: V9_AUTOMATION_ID, sequence: this.cursor.nextSequence };
        const ack: any = await this.mutate<z.infer<typeof CandidateAckV9Schema>>(protocolEventsV9.leave, request, CandidateAckV9Schema);
        if (!ack.data || !('outcome' in ack.data)) throw new Error('V9 leave did not return an authoritative result.');
        return this.acceptResult(ack.data, ack.nextSequence, ack.nextInputSequence);
    }

    public onSnapshot(listener: (value: CandidateSnapshotV9) => void): () => void { this.snapshots.add(listener); return () => this.snapshots.delete(listener); }
    public onResult(listener: (value: ChallengeResultV9) => void): () => void {
        this.results.add(listener); if (this.terminal) queueMicrotask(() => listener(structuredClone(this.terminal!)));
        return () => this.results.delete(listener);
    }
    public onConnection(listener: (value: V9CandidateConnection) => void): () => void { this.connections.add(listener); return () => this.connections.delete(listener); }
    public onError(listener: (value: string) => void): () => void { this.errors.add(listener); return () => this.errors.delete(listener); }
    public onUnavailable(listener: (value: string) => void): () => void { this.unavailable.add(listener); return () => this.unavailable.delete(listener); }
    public dispose(): void {
        if (this.disposed) return; this.disposed = true;
        this.socket.off(protocolEventsV9.snapshot, this.onSnapshotEvent); this.socket.off(protocolEventsV9.result, this.onResultEvent);
        this.socket.off('disconnect', this.onDisconnect); this.socket.off('connect', this.onConnect);
        this.snapshots.clear(); this.results.clear(); this.connections.clear(); this.errors.clear(); this.unavailable.clear();
    }

    private readonly onSnapshotEvent = (raw: unknown): void => {
        const parsed = ChallengeSnapshotV9Schema.safeParse(raw);
        if (!parsed.success) return this.report('The server sent an invalid V9 candidate snapshot.');
        const accepted = this.lifecycle.acceptSnapshot(parsed.data, this.session().sessionId, true);
        if (!accepted) return;
        this.snapshot = accepted; this.cursor.nextSequence = Math.max(this.cursor.nextSequence, accepted.nextSequence);
        for (const listener of this.snapshots) listener(structuredClone(accepted));
    };
    private readonly onResultEvent = (raw: unknown): void => {
        const parsed = ChallengeResultV9Schema.safeParse(raw);
        if (!parsed.success || parsed.data.sessionId !== this.session().sessionId) return;
        this.acceptResult(parsed.data, parsed.data.nextSequence, parsed.data.nextInputSequence);
    };
    private readonly onDisconnect = (): void => {
        this.lifecycle.disconnect();
        for (const listener of this.connections) listener('reconnecting');
    };
    private readonly onConnect = (): void => {
        // Socket session resume delivers a tagged V9 snapshot.  No old local
        // controls re-enable until onSnapshot accepts that exact owned resync.
        queueMicrotask(() => {
            if (this.disposed) return;
            if (this.session().sessionId !== this.initialSessionId) {
                for (const listener of this.unavailable) listener('The previous in-memory V9 candidate Clash cannot be resumed. Start a fresh Clash.');
                return;
            }
            for (const listener of this.connections) listener('connected');
        });
    };
    private async mutate<T>(event: string, request: { requestId: string }, schema: { safeParse: (value: unknown) => any }): Promise<T> {
        if (this.disposed || !this.socket.connected) throw new Error('V9 candidate transport is reconnecting.');
        if (this.mutation) throw new Error('A V9 candidate acknowledgement is still pending.');
        const operation = new Promise<T>((resolve, reject) => this.socket.timeout(5_000).emit(event, request,
            (error: Error | null, raw: unknown) => {
                const parsed = schema.safeParse(raw);
                if (error || !parsed.success || parsed.data.requestId !== request.requestId) return reject(error ?? new Error('Invalid V9 candidate acknowledgement.'));
                if (parsed.data.ok === false) { this.cursor.nextSequence = Math.max(this.cursor.nextSequence, parsed.data.nextSequence); return reject(new Error(parsed.data.error.message)); }
                resolve(parsed.data);
            }));
        this.mutation = operation;
        try { return await operation; } finally { if (this.mutation === operation) this.mutation = undefined; }
    }
    private acceptAckSnapshot(value: CandidateSnapshotV9, sequence: number, inputSequence: number, resync: boolean): CandidateSnapshotV9 {
        const accepted = this.lifecycle.acceptSnapshot(value, this.session().sessionId, resync) ?? (() => {
            const current = this.lifecycle.current;
            return current && current.sessionId === value.sessionId && current.challengeId === value.challengeId &&
                current.simulation.revision >= value.simulation.revision && current.nextInputSequence >= inputSequence ? current : undefined;
        })();
        // Lifecycle sequence advances at the outer session boundary. Input
        // cursor ownership belongs to the snapshot and is the fence for live
        // controls; a tagged snapshot event can legitimately arrive before its
        // lifecycle acknowledgement carries the advanced outer sequence.
        if (!accepted || inputSequence !== accepted.nextInputSequence) throw new Error('Stale V9 candidate acknowledgement.');
        this.snapshot = accepted; this.cursor.nextSequence = Math.max(this.cursor.nextSequence, sequence);
        for (const listener of this.snapshots) listener(structuredClone(accepted));
        return structuredClone(accepted);
    }
    private acceptResult(value: ChallengeResultV9, sequence: number, inputSequence: number): ChallengeResultV9 {
        if (this.terminal) return structuredClone(this.terminal);
        this.cursor.nextSequence = Math.max(this.cursor.nextSequence, sequence);
        this.terminal = structuredClone(value);
        for (const listener of this.results) listener(structuredClone(value));
        return structuredClone(value);
    }
    private requireSnapshot(): CandidateSnapshotV9 { if (!this.snapshot || this.terminal) throw new Error('No active V9 candidate Clash is available.'); return this.snapshot; }
    private requireInput(): CandidateSnapshotV9 { const value = this.requireSnapshot(); if (!this.inputReady()) throw new Error('Wait for a fresh authoritative V9 snapshot.'); return value; }
    private report(message: string): void { for (const listener of this.errors) listener(message); }
}

function requestId(): string { return crypto.randomUUID().replaceAll('-', ''); }
