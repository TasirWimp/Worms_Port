import type { SimulationCommand } from '../../../shared/simulation';
import type { Point } from './contracts';
import type { ChallengeSnapshotV8 } from '../../../shared/protocol-v8';

export type CombatInputPhase =
    | 'idle'
    | 'moving'
    | 'aiming'
    | 'aim_locked'
    | 'submitting'
    | 'suspended';

type ControlKind = 'movement' | 'aim';

type OwnedPointer = {
    id: number;
    kind: ControlKind;
    origin: Point;
    current: Point;
    radius: number;
    returnPhase: 'idle' | 'aim_locked';
};

export type AimIntent = {
    angleMilliDegrees: number;
    powerPermille: number;
};

export class CombatInputController {
    public phase: CombatInputPhase = 'idle';
    public lockedAim: AimIntent | null = null;
    private owner: OwnedPointer | null = null;

    public begin(
        kind: ControlKind,
        pointerId: number,
        point: Point,
        radius: number
    ): boolean {
        if (this.phase === 'suspended' || this.phase === 'submitting' || this.owner) return false;
        if (this.phase !== 'idle' && this.phase !== 'aim_locked') return false;
        const returnPhase = this.phase === 'aim_locked' ? 'aim_locked' : 'idle';
        this.owner = {
            id: pointerId,
            kind,
            origin: { ...point },
            current: { ...point },
            radius: Math.max(1, radius),
            returnPhase
        };
        this.phase = kind === 'movement' ? 'moving' : 'aiming';
        return true;
    }

    public move(pointerId: number, point: Point): boolean {
        if (!this.owner || this.owner.id !== pointerId) return false;
        this.owner.current = { ...point };
        return true;
    }

    public movementDirection(): -1 | 0 | 1 {
        if (!this.owner || this.owner.kind !== 'movement') return 0;
        const normalized = (this.owner.current.x - this.owner.origin.x) / this.owner.radius;
        if (Math.abs(normalized) < 0.18) return 0;
        return normalized < 0 ? -1 : 1;
    }

    public movementSteps(): number {
        if (!this.owner || this.owner.kind !== 'movement') return 0;
        const strength = Math.min(
            1,
            Math.abs(this.owner.current.x - this.owner.origin.x) / this.owner.radius
        );
        if (strength < 0.18) return 0;
        return Math.min(4, Math.max(1, Math.ceil((strength - 0.18) / 0.205)));
    }

    public aimIntent(): AimIntent | null {
        if (!this.owner || this.owner.kind !== 'aim') return this.lockedAim;
        const dx = this.owner.current.x - this.owner.origin.x;
        const dy = this.owner.current.y - this.owner.origin.y;
        const distance = Math.hypot(dx, dy);
        const powerPermille = distance < this.owner.radius * 0.18
            ? 0
            : Math.round(Math.min(1, distance / this.owner.radius) * 1000);
        const angleMilliDegrees = Math.round(
            Math.atan2(-dy, Math.max(1, Math.abs(dx))) * 180_000 / Math.PI
        );
        return {
            angleMilliDegrees: Math.max(-90_000, Math.min(90_000, angleMilliDegrees)),
            powerPermille
        };
    }

    public end(pointerId: number, releasedInside: boolean): SimulationCommand | null {
        if (!this.owner || this.owner.id !== pointerId) return null;
        const owner = this.owner;
        this.owner = null;
        if (!releasedInside) {
            this.phase = owner.returnPhase;
            return null;
        }
        if (owner.kind === 'movement') {
            this.phase = owner.returnPhase;
            return { type: 'move', direction: this.directionFrom(owner) };
        }
        this.lockedAim = this.aimFrom(owner);
        this.phase = 'aim_locked';
        return { type: 'aim', ...this.lockedAim };
    }

    public cancel(pointerId?: number): boolean {
        if (!this.owner || (pointerId !== undefined && this.owner.id !== pointerId)) return false;
        const returnPhase = this.owner.returnPhase;
        this.owner = null;
        this.phase = returnPhase;
        return true;
    }

    public suspend(): void {
        this.owner = null;
        this.phase = 'suspended';
    }

    public resume(): void {
        if (this.phase !== 'suspended') return;
        this.phase = this.lockedAim ? 'aim_locked' : 'idle';
    }

    public beginSubmission(): boolean {
        if (this.phase !== 'aim_locked' || !this.lockedAim) return false;
        this.phase = 'submitting';
        return true;
    }

    public finishSubmission(accepted: boolean, authoritativeAimLocked: boolean): void {
        if (this.phase !== 'submitting') return;
        if (accepted && !authoritativeAimLocked) this.lockedAim = null;
        this.phase = this.lockedAim ? 'aim_locked' : 'idle';
    }

    public syncAuthoritativeAim(aim: AimIntent | null): void {
        if (this.owner || this.phase === 'suspended' || this.phase === 'submitting') return;
        this.lockedAim = aim ? { ...aim } : null;
        this.phase = this.lockedAim ? 'aim_locked' : 'idle';
    }

    public clearAim(): void {
        this.lockedAim = null;
        if (!this.owner && this.phase === 'aim_locked') this.phase = 'idle';
    }

    public ownedPointer(): Readonly<OwnedPointer> | null {
        return this.owner;
    }

    private directionFrom(owner: OwnedPointer): -1 | 0 | 1 {
        const normalized = (owner.current.x - owner.origin.x) / owner.radius;
        if (Math.abs(normalized) < 0.18) return 0;
        return normalized < 0 ? -1 : 1;
    }

    private aimFrom(owner: OwnedPointer): AimIntent {
        const dx = owner.current.x - owner.origin.x;
        const dy = owner.current.y - owner.origin.y;
        const distance = Math.hypot(dx, dy);
        return {
            angleMilliDegrees: Math.max(-90_000, Math.min(90_000, Math.round(
                Math.atan2(-dy, Math.max(1, Math.abs(dx))) * 180_000 / Math.PI
            ))),
            powerPermille: distance < owner.radius * 0.18
                ? 0
                : Math.round(Math.min(1, distance / owner.radius) * 1000)
        };
    }
}

/** Gesture ownership only: neither a lease nor simulated movement lives here. */
export class ActionTurnsInputController extends CombatInputController {
    private boundary?: string;

    public synchronize(snapshot: ChallengeSnapshotV8): boolean {
        const next = inputBoundaryV8(snapshot);
        const changed = this.boundary !== undefined && next !== this.boundary;
        this.boundary = next;
        if (changed) this.interrupt();
        return changed;
    }

    public releaseMovement(pointerId: number): boolean {
        return this.ownedPointer()?.kind === 'movement' && this.cancel(pointerId);
    }

    public interrupt(): void {
        this.cancel();
        this.clearAim();
    }
}

export function inputBoundaryV8(snapshot: ChallengeSnapshotV8): string {
    const state = snapshot.simulation;
    return [snapshot.challengeId, state.turn, state.activeActor, state.phase,
        state.inputEpoch, snapshot.paused, snapshot.status].join(':');
}
