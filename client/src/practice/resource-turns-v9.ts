import type { z } from 'zod';
import { ChallengeSnapshotV9Schema } from '../../../shared/protocol-v9';
import type { SimulationStateV9 } from '../../../shared/simulation-v9';

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
