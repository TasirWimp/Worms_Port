import type { SimulationCommand } from '../../../shared/simulation';
import type { Point, Rect } from './contracts';
import type { ChallengeSnapshotV8Family as ChallengeSnapshotV8 } from '../../../shared/protocol-v8';
import type { SimulationIntentV8R1 } from '../../../shared/simulation-v8';
import type { SimulationIntentV10 } from '../../../shared/simulation-v10';

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
    return [snapshot.rulesetId, snapshot.challengeId, state.turn, state.activeActor, state.phase,
        state.inputEpoch, snapshot.paused, snapshot.status].join(':');
}

export type MovementFactsR1 = {
    grounded: boolean; facing: -1 | 1; heldDirection: -1 | 0 | 1;
    lane: 'ready' | 'locomotion' | 'blocked';
    /** Current R6 button input may change direction during a committed jump. */
    airControl?: boolean;
};

export type R6MovementButton = 'left' | 'right' | 'jump';

/**
 * Current R6 movement maps one captured thumb to three fixed buttons. Sliding
 * between them retains the last horizontal direction, so the thumb can roll
 * through Jump and then choose either aftertouch direction without an origin
 * that drifts across the screen.
 */
export class R6MovementButtonController {
    private pointer?: { id: number; button: R6MovementButton | null; direction: -1 | 0 | 1 };
    private jumpDeadline?: number;
    private jumpDirection?: -1 | 0 | 1;

    public begin(id: number, button: R6MovementButton, now: number): boolean {
        if (this.pointer) return false;
        this.pointer = { id, button: null, direction: 0 };
        this.apply(button, now);
        return true;
    }

    public move(id: number, button: R6MovementButton | null, now: number): boolean {
        if (this.pointer?.id !== id) return false;
        if (button === this.pointer.button) return true;
        this.pointer.button = null;
        if (button) this.apply(button, now);
        return true;
    }

    public movementIntent(facts: MovementFactsR1, now: number): SimulationIntentV10 | null {
        if (this.jumpDeadline !== undefined && now > this.jumpDeadline) {
            this.jumpDeadline = undefined; this.jumpDirection = undefined;
        }
        if (facts.lane !== 'ready') return null;
        const direction = this.pointer?.direction ?? 0;
        if (facts.grounded && this.jumpDeadline !== undefined) {
            const jumpDirection = this.jumpDirection ?? 0;
            this.jumpDeadline = undefined; this.jumpDirection = undefined;
            return { type: 'jump', direction: jumpDirection };
        }
        if (!facts.grounded && facts.airControl !== true) return null;
        if (direction === facts.heldDirection) return null;
        return direction ? { type: 'walk_start', direction }
            : facts.heldDirection ? { type: 'walk_stop' } : null;
    }

    public finish(id: number): { release: boolean } | null {
        if (this.pointer?.id !== id) return null;
        const release = this.pointer.direction !== 0;
        this.pointer = undefined;
        return { release };
    }

    public interrupt(): void { this.pointer = undefined; this.jumpDeadline = undefined; this.jumpDirection = undefined; }
    public hasDirectionHold(): boolean { return Boolean(this.pointer?.direction); }

    private apply(button: R6MovementButton, now: number): void {
        if (!this.pointer) return;
        this.pointer.button = button;
        if (button === 'jump') {
            this.jumpDeadline = now + 250;
            this.jumpDirection = this.pointer.direction;
        }
        else this.pointer.direction = button === 'left' ? -1 : 1;
    }
}

/** Current pointer geometry only. No command queue, simulation or movement timer. */
export class UnifiedMovementInputController extends ActionTurnsInputController {
    private gesture?: { side: -1 | 0 | 1; maximumDistance: number; locomotion: boolean;
        hop: 'unseen' | 'eligible' | 'discarded' | 'submitted'; deadline: number; motionEligible: boolean;
    };

    public beginMovement(id: number, point: Point, pad: Rect): boolean {
        if (!this.begin('movement', id, point, 48)) return false;
        const side = point.x - (pad.x + pad.width / 2);
        this.gesture = { side: side < -8 ? -1 : side > 8 ? 1 : 0,
            maximumDistance: 0, locomotion: false, hop: 'unseen', deadline: 0, motionEligible: true };
        return true;
    }

    public moveMovement(id: number, point: Point, facts: MovementFactsR1, now: number): boolean {
        if (!this.gesture || this.ownedPointer()?.kind !== 'movement' || !this.move(id, point)) return false;
        const owner = this.ownedPointer()!; const gesture = this.gesture;
        const dx = point.x - owner.origin.x; const dy = point.y - owner.origin.y;
        gesture.maximumDistance = Math.max(gesture.maximumDistance, Math.hypot(dx, dy));
        gesture.motionEligible = facts.grounded || facts.airControl === true;
        const jumping = this.jumpGesture(dx, dy, facts);
        if (jumping && gesture.hop === 'unseen') {
            gesture.hop = facts.grounded && facts.lane !== 'blocked' ? 'eligible' : 'discarded';
            gesture.deadline = now + 250;
        }
        if (!jumping && gesture.hop === 'eligible') gesture.hop = 'discarded';
        this.observeGrounded(facts.grounded, facts.airControl === true);
        this.expire(now);
        return true;
    }

    public movementIntent(facts: MovementFactsR1, now: number): SimulationIntentV8R1 | null {
        const owner = this.ownedPointer(); const gesture = this.gesture;
        if (!gesture || owner?.kind !== 'movement') return null;
        this.observeGrounded(facts.grounded, facts.airControl === true); this.expire(now);
        if (facts.lane === 'blocked' && gesture.hop === 'eligible') gesture.hop = 'discarded';
        if (facts.lane !== 'ready') return null;
        const dx = owner.current.x - owner.origin.x; const dy = owner.current.y - owner.origin.y;
        const direction = Math.abs(dx) >= 10 ? (dx < 0 ? -1 : 1) : 0;
        if (facts.grounded && this.jumpGesture(dx, dy, facts)) {
            return gesture.hop === 'eligible' && facts.grounded
                ? { type: 'jump', direction: direction || facts.facing } : null;
        }
        if (!direction) return facts.heldDirection ? { type: 'walk_stop' } : null;
        return (facts.grounded || facts.airControl === true) && gesture.motionEligible && direction !== facts.heldDirection
            ? { type: 'walk_start', direction } : null;
    }

    public submittedMovementIntent(intent: SimulationIntentV8R1): void {
        if (!this.gesture) return;
        this.gesture.locomotion = true;
        if (intent.type === 'jump') {
            this.gesture.hop = 'submitted'; this.gesture.motionEligible = false;
        }
    }

    public observeGrounded(grounded: boolean, airControl = false): void {
        if (grounded || airControl || !this.gesture) return;
        this.gesture.motionEligible = false;
        if (this.gesture.hop === 'eligible') this.gesture.hop = 'discarded';
    }

    public finishMovement(id: number): { face: -1 | 1 | null; release: boolean } | null {
        if (!this.gesture || this.ownedPointer()?.id !== id || this.ownedPointer()?.kind !== 'movement') return null;
        const gesture = this.gesture;
        const face = !gesture.locomotion && gesture.hop === 'unseen' && gesture.maximumDistance < 10
            ? gesture.side || null : null;
        this.interrupt();
        return { face, release: face === null };
    }

    public override interrupt(): void { this.gesture = undefined; super.interrupt(); }
    private jumpGesture(_dx: number, dy: number, _facts: MovementFactsR1): boolean { return dy <= -24; }
    private expire(now: number): void {
        if (this.gesture?.hop === 'eligible' && now >= this.gesture.deadline) this.gesture.hop = 'discarded';
    }
}
