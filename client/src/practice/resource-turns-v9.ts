import type { z } from 'zod';
import { ChallengeSnapshotV9Schema } from '../../../shared/protocol-v9';

export type CandidateSnapshotV9 = z.infer<typeof ChallengeSnapshotV9Schema>;

/**
 * Client-side ownership projection for the candidate transport. It deliberately
 * projects only acknowledged authority facts: scenes retire their old control
 * generation whenever connection or challenge ownership changes.
 */
export class ResourceTurnsV9Lifecycle {
    private snapshot?: CandidateSnapshotV9;
    private connected = true;
    private currentGeneration = 0;
    public get generation(): number { return this.currentGeneration; }
    public get current(): CandidateSnapshotV9 | undefined { return this.snapshot && structuredClone(this.snapshot); }
    public disconnect(): void { if (this.connected) { this.connected = false; this.currentGeneration += 1; } }
    public acceptSnapshot(value: unknown, ownedSessionId: string): CandidateSnapshotV9 | undefined {
        const parsed = ChallengeSnapshotV9Schema.safeParse(value);
        if (!parsed.success || parsed.data.sessionId !== ownedSessionId) return undefined;
        const next = parsed.data;
        if (!this.connected || (this.snapshot && (this.snapshot.challengeId !== next.challengeId || this.snapshot.sessionId !== next.sessionId)))
            this.currentGeneration += 1;
        if (this.snapshot && next.challengeId === this.snapshot.challengeId && next.nextSequence < this.snapshot.nextSequence) return undefined;
        this.connected = true; this.snapshot = structuredClone(next); return this.current;
    }
    public canPause(): boolean { return Boolean(this.connected && this.snapshot?.mode === 'practice' && this.snapshot.status === 'active'); }
    public pauseUnavailableReason(): string | undefined {
        if (!this.connected) return 'Reconnect and wait for a fresh authoritative snapshot.';
        if (!this.snapshot) return 'Waiting for a fresh authoritative snapshot.';
        return this.snapshot.mode === 'reward' ? 'Rewarded candidate matches cannot pause.' : undefined;
    }
}
