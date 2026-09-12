import { trajectoryPreviewV10 } from '../combat/terrain-starts-v10-fixture';
import { whenSessionReady } from '../lib/session';
import type { Socket } from 'socket.io-client';
import type { z } from 'zod';
import type { PlayerCalling } from '../../../shared/simulation';
import type { SessionOpenData } from '../../../shared/protocol';
import {
    CandidateAckV10Schema, ChallengeCreateAckV10Schema, ChallengeResultV10Schema,
    ChallengeSnapshotV10Schema, protocolEventsV10,
    type ChallengeResultV10
} from '../../../shared/protocol-v10-live';
import { V10_AUTOMATION_ID } from '../../../shared/combat-version';
import { V10_R5_RULESET_ID, type SimulationIntentV10, type SimulationStateV10 } from '../../../shared/simulation-v10';
import type { CombatSceneArgsV10 } from '../combat/contracts';

export type CandidateSnapshotV10 = z.infer<typeof ChallengeSnapshotV10Schema>;

/**
 * Client-side ownership projection for the candidate transport. It deliberately
 * projects only acknowledged authority facts: scenes retire their old control
 * generation whenever connection or challenge ownership changes.
 */
export class ResourceTurnsV10Lifecycle {
    private snapshot?: CandidateSnapshotV10;
    private connected = true;
    private resyncRequired = false;
    private currentGeneration = 0;
    public get generation(): number { return this.currentGeneration; }
    public get current(): CandidateSnapshotV10 | undefined { return this.snapshot && structuredClone(this.snapshot); }
    public get ready(): boolean { return this.connected && !this.resyncRequired && !!this.snapshot; }
    public disconnect(): void { if (this.connected) { this.connected = false; this.resyncRequired = true; this.currentGeneration += 1; } }
    public acceptSnapshot(value: unknown, ownedSessionId: string, resync = false): CandidateSnapshotV10 | undefined {
        const parsed = ChallengeSnapshotV10Schema.safeParse(value);
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
    public canPause(): boolean { const state = this.snapshot?.simulation as SimulationStateV10 | undefined; return Boolean(this.connected && !this.resyncRequired && this.snapshot?.mode === 'practice' &&
        this.snapshot.status === 'active' && !this.snapshot.paused && state?.activeActor === 'player' && state.phase === 'action' &&
        state.units.every(unit => unit.alive && unit.grounded && unit.vxFp === 0 && unit.vyFp === 0)); }
    public pauseUnavailableReason(): string | undefined {
        if (!this.connected) return 'Reconnect and wait for a fresh authoritative snapshot.';
        if (!this.snapshot) return 'Waiting for a fresh authoritative snapshot.';
        return this.snapshot.mode === 'reward' ? 'Rewarded Daily matches cannot pause.' : undefined;
    }
}

export type V10CandidateConnection = 'connected' | 'reconnecting';
export type V10CandidateCursor = { sessionId: string; nextSequence: number };
export type V10CandidateReservation = { challengeId: string; eligibilityToken: string };

/**
 * The V10 route is deliberately injected by the caller.  It owns only V10
 * envelopes and never falls through to the ordinary V7 Practice transport.
 */
export class ResourceTurnsV10Client {
    private lifecycle = new ResourceTurnsV10Lifecycle();
    private snapshot?: CandidateSnapshotV10;
    private terminal?: ChallengeResultV10;
    private disposed = false;
    private mutation?: Promise<unknown>;
    private readonly snapshots = new Set<(value: CandidateSnapshotV10) => void>();
    private readonly results = new Set<(value: ChallengeResultV10) => void>();
    private readonly connections = new Set<(value: V10CandidateConnection) => void>();
    private readonly errors = new Set<(value: string) => void>();
    private readonly unavailable = new Set<(value: string) => void>();

    private readonly initialSessionId: string;
    public constructor(private readonly socket: Socket, private readonly session: () => SessionOpenData,
        private readonly cursor: V10CandidateCursor) {
        this.initialSessionId = session().sessionId;
        socket.on(protocolEventsV10.snapshot, this.onSnapshotEvent);
        socket.on(protocolEventsV10.result, this.onResultEvent);
        socket.on('disconnect', this.onDisconnect);
        socket.on('connect', this.onConnect);
    }

    public restore(snapshots: readonly unknown[], results: readonly unknown[]): void {
        for (const value of snapshots) this.onSnapshotEvent(value);
        for (const value of results) this.onResultEvent(value);
    }
    public currentSnapshot(): CandidateSnapshotV10 | undefined { return this.snapshot && structuredClone(this.snapshot); }
    public inputReady(): boolean {
        const value = this.snapshot;
        return Boolean(value && this.lifecycle.ready && this.socket.connected && !this.mutation && value.status === 'active' && !value.paused &&
            value.sessionId === this.session().sessionId && value.simulation.activeActor === 'player' &&
            (value.simulation.phase === 'action' || value.simulation.phase === 'retreat'));
    }
    public pauseAllowed(): boolean { return this.lifecycle.canPause() && !this.mutation; }
    public pauseReason(): string | undefined { return this.lifecycle.pauseUnavailableReason(); }
    public combatArgs(snapshot: CandidateSnapshotV10): CombatSceneArgsV10 {
        if (snapshot.challengeId !== this.snapshot?.challengeId) throw new Error('V10 candidate ownership changed.');
        const mode = snapshot.mode;
        return {
            kind: 'v10', snapshot: snapshot.simulation as SimulationStateV10, previewLabel: 'Volcanic Ruin', live: true,
            challengeId: snapshot.challengeId,
            rewarded: mode === 'reward', trajectoryPreview: aim => trajectoryPreviewV10(this.requireSnapshot().simulation as SimulationStateV10, aim), calling: snapshot.calling,
            submit: intent => this.submit(intent).then(value => value.simulation as SimulationStateV10),
            setPaused: paused => this.setPaused(paused).then(value => value.simulation as SimulationStateV10),
            cancelInput: () => this.cancelInput().then(value => value.simulation as SimulationStateV10),
            releaseMovement: () => this.releaseMovement().then(value => value.simulation as SimulationStateV10),
            paused: () => this.snapshot?.paused ?? false,
            pauseAllowed: () => this.pauseAllowed(), pauseReason: () => this.pauseReason(),
            inputReady: () => this.inputReady(),
            onSnapshot: listener => this.onSnapshot(value => listener(value.simulation as SimulationStateV10, [])),
            onResult: listener => this.onResult(listener),
            onConnection: listener => this.onConnection(listener),
            onUnavailable: listener => this.onUnavailable(listener), onError: listener => this.onError(listener),
            restart: async () => {
                if (this.snapshot?.status === 'active') await this.leave();
                const next = await this.start('practice', snapshot.calling);
                return this.combatArgs(next);
            },
            destroy: () => undefined
        };
    }

    public async start(mode: 'practice' | 'reward', calling: PlayerCalling,
        reservation?: V10CandidateReservation): Promise<CandidateSnapshotV10> {
        await whenSessionReady(this.socket);
        const sequence = this.cursor.nextSequence;
        const request = mode === 'practice'
            ? { requestId: requestId(), sequence, mode, calling, rulesetId: V10_R5_RULESET_ID, automationId: V10_AUTOMATION_ID }
            : { requestId: requestId(), sequence, mode, calling, challengeId: reservation?.challengeId,
                eligibilityToken: reservation?.eligibilityToken, rulesetId: V10_R5_RULESET_ID, automationId: V10_AUTOMATION_ID };
        const ack: any = await this.mutate<z.infer<typeof ChallengeCreateAckV10Schema>>(protocolEventsV10.create, request, ChallengeCreateAckV10Schema);
        if (!ack.data || !('simulation' in ack.data)) throw new Error('V10 creation did not return an authoritative snapshot.');
        // Only a successful, matched creation acknowledgement may replace identity.
        if (ack.data.sessionId !== this.session().sessionId) throw new Error('Foreign V10 creation acknowledgement.');
        this.lifecycle = new ResourceTurnsV10Lifecycle();
        this.snapshot = undefined;
        this.terminal = undefined;
        return this.acceptAckSnapshot(ack.data, ack.nextSequence, ack.nextInputSequence, false);
    }

    public async submit(intent: SimulationIntentV10): Promise<CandidateSnapshotV10> {
        const value = this.requireInput();
        const request = { requestId: requestId(), challengeId: value.challengeId, rulesetId: V10_R5_RULESET_ID,
            automationId: V10_AUTOMATION_ID, inputSequence: value.nextInputSequence,
            expectedTurn: value.simulation.turn, expectedPhase: value.simulation.phase,
            inputEpoch: value.simulation.inputEpoch, intent };
        const ack: any = await this.mutate<z.infer<typeof CandidateAckV10Schema>>(protocolEventsV10.input, request, CandidateAckV10Schema);
        if (!ack.data || !('simulation' in ack.data)) throw new Error('V10 input did not return an authoritative snapshot.');
        return this.acceptAckSnapshot(ack.data, ack.nextSequence, ack.nextInputSequence, false);
    }

    public cancelInput(): Promise<CandidateSnapshotV10> { return this.neutral(protocolEventsV10.cancel); }
    public releaseMovement(): Promise<CandidateSnapshotV10> { return this.neutral(protocolEventsV10.release); }
    private async neutral(event: string): Promise<CandidateSnapshotV10> {
        const value = this.requireSnapshot();
        const request = { requestId: requestId(), challengeId: value.challengeId, rulesetId: V10_R5_RULESET_ID,
            automationId: V10_AUTOMATION_ID, expectedTurn: value.simulation.turn, inputEpoch: value.simulation.inputEpoch };
        const ack: any = await this.mutate<z.infer<typeof CandidateAckV10Schema>>(event, request, CandidateAckV10Schema);
        if (!ack.data || !('simulation' in ack.data)) throw new Error('V10 neutral fence did not return an authoritative snapshot.');
        return this.acceptAckSnapshot(ack.data, ack.nextSequence, ack.nextInputSequence, false);
    }

    public async setPaused(paused: boolean): Promise<CandidateSnapshotV10> {
        if (paused && !this.pauseAllowed()) throw new Error(this.pauseReason() ?? 'Pause is unavailable in this authority state.');
        const value = this.requireSnapshot();
        const request = { requestId: requestId(), challengeId: value.challengeId, rulesetId: V10_R5_RULESET_ID,
            automationId: V10_AUTOMATION_ID, sequence: this.cursor.nextSequence, paused };
        const ack: any = await this.mutate<z.infer<typeof CandidateAckV10Schema>>(protocolEventsV10.pause, request, CandidateAckV10Schema);
        if (!ack.data || !('simulation' in ack.data)) throw new Error('V10 pause did not return an authoritative snapshot.');
        return this.acceptAckSnapshot(ack.data, ack.nextSequence, ack.nextInputSequence, false);
    }

    public async leave(): Promise<ChallengeResultV10> {
        const value = this.requireSnapshot();
        const request = { requestId: requestId(), challengeId: value.challengeId, rulesetId: V10_R5_RULESET_ID,
            automationId: V10_AUTOMATION_ID, sequence: this.cursor.nextSequence };
        const ack: any = await this.mutate<z.infer<typeof CandidateAckV10Schema>>(protocolEventsV10.leave, request, CandidateAckV10Schema);
        if (!ack.data || !('outcome' in ack.data)) throw new Error('V10 leave did not return an authoritative result.');
        return this.acceptResult(ack.data, ack.nextSequence, ack.nextInputSequence);
    }

    public onSnapshot(listener: (value: CandidateSnapshotV10) => void): () => void { this.snapshots.add(listener); return () => this.snapshots.delete(listener); }
    public onResult(listener: (value: ChallengeResultV10) => void): () => void {
        this.results.add(listener); if (this.terminal) queueMicrotask(() => listener(structuredClone(this.terminal!)));
        return () => this.results.delete(listener);
    }
    public onConnection(listener: (value: V10CandidateConnection) => void): () => void { this.connections.add(listener); return () => this.connections.delete(listener); }
    public onError(listener: (value: string) => void): () => void { this.errors.add(listener); return () => this.errors.delete(listener); }
    public onUnavailable(listener: (value: string) => void): () => void { this.unavailable.add(listener); return () => this.unavailable.delete(listener); }
    public sessionExpired(): void {
        this.lifecycle.disconnect();
        for (const listener of this.unavailable) listener('The previous volcanic Clash cannot be resumed. Start a fresh Clash.');
        this.dispose();
    }
    public dispose(): void {
        if (this.disposed) return; this.disposed = true;
        this.socket.off(protocolEventsV10.snapshot, this.onSnapshotEvent); this.socket.off(protocolEventsV10.result, this.onResultEvent);
        this.socket.off('disconnect', this.onDisconnect); this.socket.off('connect', this.onConnect);
        this.snapshots.clear(); this.results.clear(); this.connections.clear(); this.errors.clear(); this.unavailable.clear();
    }

    private readonly onSnapshotEvent = (raw: unknown): void => {
        const parsed = ChallengeSnapshotV10Schema.safeParse(raw);
        if (!parsed.success) return this.report('The server sent an invalid V10 candidate snapshot.');
        const accepted = this.lifecycle.acceptSnapshot(parsed.data, this.session().sessionId, true);
        if (!accepted) return;
        this.snapshot = accepted; writeActivePractice(accepted.sessionId, accepted.challengeId); this.cursor.nextSequence = Math.max(this.cursor.nextSequence, accepted.nextSequence);
        for (const listener of this.snapshots) listener(structuredClone(accepted));
    };
    private readonly onResultEvent = (raw: unknown): void => {
        const parsed = ChallengeResultV10Schema.safeParse(raw);
        if (!parsed.success || parsed.data.sessionId !== this.session().sessionId ||
            parsed.data.challengeId !== this.snapshot?.challengeId) return;
        this.acceptResult(parsed.data, parsed.data.nextSequence, parsed.data.nextInputSequence);
    };
    private readonly onDisconnect = (): void => {
        this.lifecycle.disconnect();
        for (const listener of this.connections) listener('reconnecting');
    };
    private readonly onConnect = (): void => {
        // Socket session resume delivers a tagged V10 snapshot.  No old local
        // controls re-enable until onSnapshot accepts that exact owned resync.
        queueMicrotask(() => {
            if (this.disposed) return;
            if (this.session().sessionId !== this.initialSessionId) {
                for (const listener of this.unavailable) listener('The previous in-memory V10 candidate Clash cannot be resumed. Start a fresh Clash.');
                return;
            }
            for (const listener of this.connections) listener('connected');
        });
    };
    private async mutate<T>(event: string, request: { requestId: string }, schema: { safeParse: (value: unknown) => any }): Promise<T> {
        if (this.disposed || !this.socket.connected) throw new Error('V10 candidate transport is reconnecting.');
        if (this.mutation) throw new Error('A V10 candidate acknowledgement is still pending.');
        const operation = new Promise<T>((resolve, reject) => this.socket.timeout(5_000).emit(event, request,
            (error: Error | null, raw: unknown) => {
                const parsed = schema.safeParse(raw);
                if (error || !parsed.success || parsed.data.requestId !== request.requestId) return reject(error ?? new Error('Invalid V10 candidate acknowledgement.'));
                if (parsed.data.ok === false) { this.cursor.nextSequence = Math.max(this.cursor.nextSequence, parsed.data.nextSequence); return reject(new Error(parsed.data.error.message)); }
                resolve(parsed.data);
            }));
        this.mutation = operation;
        try { return await operation; } finally { if (this.mutation === operation) this.mutation = undefined; }
    }
    private acceptAckSnapshot(value: CandidateSnapshotV10, sequence: number, inputSequence: number, resync: boolean): CandidateSnapshotV10 {
        const accepted = this.lifecycle.acceptSnapshot(value, this.session().sessionId, resync) ?? (() => {
            const current = this.lifecycle.current;
            return current && current.sessionId === value.sessionId && current.challengeId === value.challengeId &&
                current.simulation.revision >= value.simulation.revision && current.nextInputSequence >= inputSequence ? current : undefined;
        })();
        // Lifecycle sequence advances at the outer session boundary. Input
        // cursor ownership belongs to the snapshot and is the fence for live
        // controls; a tagged snapshot event can legitimately arrive before its
        // lifecycle acknowledgement carries the advanced outer sequence.
        if (!accepted || inputSequence !== accepted.nextInputSequence) throw new Error('Stale V10 candidate acknowledgement.');
        this.snapshot = accepted; writeActivePractice(accepted.sessionId, accepted.challengeId); this.cursor.nextSequence = Math.max(this.cursor.nextSequence, sequence);
        for (const listener of this.snapshots) listener(structuredClone(accepted));
        return structuredClone(accepted);
    }
    private acceptResult(value: ChallengeResultV10, sequence: number, inputSequence: number): ChallengeResultV10 {
        if (value.sessionId !== this.session().sessionId || value.challengeId !== this.snapshot?.challengeId)
            throw new Error('Foreign V10 result.');
        if (this.terminal) return structuredClone(this.terminal);
        this.cursor.nextSequence = Math.max(this.cursor.nextSequence, sequence);
        this.terminal = structuredClone(value);
        for (const listener of this.results) listener(structuredClone(value));
        return structuredClone(value);
    }
    private requireSnapshot(): CandidateSnapshotV10 { if (!this.snapshot || this.terminal) throw new Error('No active V10 candidate Clash is available.'); return this.snapshot; }
    private requireInput(): CandidateSnapshotV10 { const value = this.requireSnapshot(); if (!this.inputReady()) throw new Error('Wait for a fresh authoritative V10 snapshot.'); return value; }
    private report(message: string): void { for (const listener of this.errors) listener(message); }
}

function requestId(): string { return crypto.randomUUID().replaceAll('-', ''); }

function writeActivePractice(sessionId: string, challengeId: string): void {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem('nimble-knots.active-practice', JSON.stringify({ sessionId, challengeId }));
}
