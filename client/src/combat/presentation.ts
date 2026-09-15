import type { ChallengeSnapshot } from '../../../shared/protocol';
import type { RelicId, SimulationActor } from '../../../shared/simulation';
import { WIZARD_CAST_DURATION_MS, WIZARD_UNRAVEL_DURATION_MS, WIZARD_ANIMATION_KEYS } from './approved-assets';
import type { CombatVisualPhase } from './renderer';
import type { ChallengeSnapshotV8Family as ChallengeSnapshotV8 } from '../../../shared/protocol-v8';
import type { SimulationStateV8Family as SimulationStateV8 } from '../../../shared/simulation-v8';
import type { SimulationState, SimulationUnit } from '../../../shared/simulation';
import { inputBoundaryV8 } from './input';

/** A deliberately non-authoritative, version-independent rendering surface. */
export type CombatRenderUnit = SimulationUnit & { grounded?: boolean };
export type CombatRenderState = Pick<SimulationState, 'terrain' | 'activeActor' | 'selectedRelic'> & {
    rulesetId?: string;
    terrainRevision?: number;
    terrainHash?: string;
    units: [CombatRenderUnit, CombatRenderUnit];
};

export function projectCombatV8(state: SimulationStateV8 | ChallengeSnapshotV8['simulation']): CombatRenderState {
    const unit = (body: SimulationStateV8['units'][number] | ChallengeSnapshotV8['simulation']['units'][0]): CombatRenderUnit => ({
        id: body.id, calling: body.calling, x: body.xFp / 256, y: body.yFp / 256,
        facing: body.facing, stitching: body.stitching, alive: body.alive, grounded: body.grounded
    });
    return { rulesetId: state.rulesetId, terrain: state.terrain, activeActor: state.activeActor, selectedRelic: state.selectedRelic,
        units: [unit(state.units[0]), unit(state.units[1])] };
}

/** Existing animation inventory only; V8's authoritative airborne fact wins over any pose. */
export function wizardAnimationFor(unit: CombatRenderUnit, visualPhase?: CombatVisualPhase): string {
    if (!unit.alive) return WIZARD_ANIMATION_KEYS.unravel;
    if (unit.grounded === false) return WIZARD_ANIMATION_KEYS.idle;
    if (visualPhase?.actor === unit.id) {
        if (visualPhase.kind === 'movement') return WIZARD_ANIMATION_KEYS.walk;
        if (['cast-charge', 'cast-formation', 'projectile'].includes(visualPhase.kind)) return WIZARD_ANIMATION_KEYS.cast;
    }
    return WIZARD_ANIMATION_KEYS.idle;
}

export const V8_DAMAGE_FEEDBACK_MS = 2_500;
export const V8_DEFEAT_AFTERMATH_MS = 1_000;
export const V8_DEFEAT_ANIMATION_WAIT_MS = 8_000;
export type CombatAnimationState = { key: string; frame: number; complete: boolean };

/** Receipt-time presentation only. Never buffers authority, input, or the turn clock. */
export class V8PresentationFeedback {
    private challengeId?: string;
    private hits: { actor: SimulationActor; damage: number; until: number }[] = [];
    private death?: { actors: SimulationActor[]; completed: SimulationActor[]; startedAt: number;
        minimumUntil: number; until?: number; unavailable: boolean };

    public observe(before: ChallengeSnapshotV8, next: ChallengeSnapshotV8, now: number, visible: boolean): void {
        if (before.challengeId !== next.challengeId || before.rulesetId !== next.rulesetId || !visible) {
            this.clear(); return;
        }
        if (next.simulation.revision <= before.simulation.revision) return;
        this.challengeId = next.challengeId;
        const newlyDead: SimulationActor[] = [];
        for (const index of [0, 1] as const) {
            const previous = before.simulation.units[index], unit = next.simulation.units[index];
            const damage = previous.stitching - unit.stitching;
            if (damage > 0) {
                this.hits = this.hits.filter(hit => hit.actor !== unit.id);
                this.hits.push({ actor: unit.id, damage, until: now + V8_DAMAGE_FEEDBACK_MS });
            }
            if (previous.alive && !unit.alive) newlyDead.push(unit.id);
        }
        if (newlyDead.length) this.death = {
            actors: [...new Set([...(this.death?.actors ?? []), ...newlyDead])],
            completed: this.death?.completed ?? [], startedAt: this.death?.startedAt ?? now,
            minimumUntil: now + WIZARD_UNRAVEL_DURATION_MS, unavailable: false
        };
    }

    /** Phaser's smoothed animation delta can lag wall time. Only actual renderer
     * completion starts aftermath; an unavailable/stalled animation is explicit. */
    public advanceDefeat(animations: Partial<Record<SimulationActor, CombatAnimationState>>, now: number): void {
        const death = this.death;
        if (!death || death.until !== undefined) return;
        for (const actor of death.actors) {
            const animation = animations[actor];
            if (animation?.key === WIZARD_ANIMATION_KEYS.unravel && animation.frame === 25 && animation.complete &&
                !death.completed.includes(actor)) death.completed.push(actor);
        }
        if (death.actors.every(actor => death.completed.includes(actor))) {
            death.until = Math.max(now, death.minimumUntil) + V8_DEFEAT_AFTERMATH_MS;
        } else if (death.actors.some(actor => !animations[actor] || animations[actor]?.key === 'static') ||
            now >= death.startedAt + V8_DEFEAT_ANIMATION_WAIT_MS) {
            death.unavailable = true; death.until = now + V8_DEFEAT_AFTERMATH_MS;
        }
    }

    public message(snapshot: ChallengeSnapshotV8, now: number): string {
        if (snapshot.challengeId !== this.challengeId) return '';
        return ([0, 1] as const).flatMap(index => {
            const unit = snapshot.simulation.units[index];
            const hit = this.hits.find(item => item.actor === unit.id && now < item.until);
            return hit ? [`${unit.id === 'player' ? 'You' : 'Loomkeeper'} −${hit.damage} · ${unit.stitching} Stitching`] : [];
        }).join(' | ');
    }

    public resultReadyAt(snapshot: ChallengeSnapshotV8, now: number): number {
        return snapshot.challengeId === this.challengeId && snapshot.status === 'completed' &&
            snapshot.simulation.finishReason === 'unravelled' && this.death
            ? Math.max(now, this.death.until ?? Infinity) : now;
    }

    public defeatedActors(now: number): SimulationActor[] {
        return this.death && (this.death.until === undefined || now < this.death.until) ? this.death.actors : [];
    }

    public defeatPlayback(now: number): 'none' | 'playing' | 'aftermath' | 'unavailable' {
        if (!this.defeatedActors(now).length) return 'none';
        return this.death!.unavailable ? 'unavailable' : this.death!.until === undefined ? 'playing' : 'aftermath';
    }

    public clear(): void { this.hits = []; this.death = undefined; this.challengeId = undefined; }
}

/** Latest authority wins; interpolation never integrates velocity or delays a phase. */
export class V8SnapshotBuffer {
    private samples: { snapshot: ChallengeSnapshotV8; receivedAt: number }[] = [];
    private progressAt = 0;
    public get sampleCount(): number { return this.samples.length; }

    public accept(snapshot: ChallengeSnapshotV8, now: number): { accepted: boolean; boundary: boolean } {
        const previous = this.samples.at(-1);
        const sameChallenge = previous?.snapshot.challengeId === snapshot.challengeId;
        if (sameChallenge && previous.snapshot.rulesetId !== snapshot.rulesetId) return { accepted: false, boundary: false };
        if (sameChallenge && snapshot.simulation.revision <= previous.snapshot.simulation.revision) {
            return { accepted: false, boundary: false };
        }
        const boundary = !previous || inputBoundaryV8(previous.snapshot) !== inputBoundaryV8(snapshot);
        if (boundary || snapshot.simulation.tick > previous.snapshot.simulation.tick) this.progressAt = now;
        const next = { snapshot: structuredClone(snapshot), receivedAt: now };
        if (boundary || snapshot.simulation.tick - previous.snapshot.simulation.tick > 3) {
            this.samples = [next];
        } else if (snapshot.simulation.tick === previous.snapshot.simulation.tick) {
            // Revision-only acknowledgements must not restart interpolation or freshness.
            next.receivedAt = previous.receivedAt;
            this.samples[this.samples.length - 1] = next;
        } else {
            this.samples = [previous, next];
        }
        return { accepted: true, boundary };
    }

    public flush(): void { this.samples = this.samples.slice(-1); }

    public frame(now: number): { state: CombatRenderState; stale: boolean } {
        const latest = this.samples.at(-1);
        if (!latest) throw new Error('V8 rendering needs an authoritative snapshot.');
        const state = projectCombatV8(latest.snapshot.simulation);
        const previous = this.samples.length === 2 ? this.samples[0] : undefined;
        if (previous) {
            const duration = (latest.snapshot.simulation.tick - previous.snapshot.simulation.tick) * 1000 / 30;
            const amount = Math.max(0, Math.min(1, (now - latest.receivedAt) / duration));
            for (const i of [0, 1] as const) {
                const from = previous.snapshot.simulation.units[i];
                const to = latest.snapshot.simulation.units[i];
                state.units[i].x = (from.xFp + (to.xFp - from.xFp) * amount) / 256;
                state.units[i].y = (from.yFp + (to.yFp - from.yFp) * amount) / 256;
            }
        }
        return { state, stale: !latest.snapshot.paused && latest.snapshot.status === 'active' &&
            now - this.progressAt > 200 };
    }
}

export type PresentationPoint = { x: number; y: number };

export type CombatPresentationStep =
    | {
        kind: 'movement';
        phase: `${SimulationActor}-movement`;
        actor: SimulationActor;
        from: PresentationPoint;
        to: PresentationPoint;
        durationMs: number;
      }
    | {
        kind: 'aim';
        phase: 'loomkeeper-aim';
        actor: 'loomkeeper';
        relicId: RelicId;
        trace: PresentationPoint[];
        durationMs: number;
      }
    | {
        kind: 'cast-charge';
        phase: `${SimulationActor}-cast-charge`;
        actor: SimulationActor;
        relicId: RelicId;
        trace: PresentationPoint[];
        durationMs: number;
      }
    | {
        kind: 'cast-formation';
        phase: `${SimulationActor}-cast-formation`;
        actor: SimulationActor;
        relicId: RelicId;
        trace: PresentationPoint[];
        durationMs: number;
      }
    | {
        kind: 'projectile';
        phase: `${SimulationActor}-projectile`;
        actor: SimulationActor;
        relicId: RelicId;
        trace: PresentationPoint[];
        durationMs: number;
      }
    | {
        kind: 'impact';
        phase: `${SimulationActor}-impact`;
        actor: SimulationActor;
        durationMs: number;
      };

export function planCombatPresentation(
    previous: ChallengeSnapshot,
    next: ChallengeSnapshot,
    reducedMotion: boolean
): CombatPresentationStep[] {
    if (previous.challengeId !== next.challengeId || next.revision <= previous.revision) return [];
    const actor = previous.simulation.activeActor;
    const actorIndex = actor === 'player' ? 0 : 1;
    const beforeUnit = previous.simulation.units[actorIndex];
    const afterUnit = next.simulation.units[actorIndex];
    const durations = reducedMotion
        ? { movement: 60, aim: 80, castCharge: 30, castFormation: 40, projectile: 120, impact: 80 }
        : {
            movement: 240,
            aim: 320,
            // The spell sheet completes before any Relic projectile launches:
            // one second of gathering followed by one second of formed spell.
            castCharge: WIZARD_CAST_DURATION_MS / 2,
            castFormation: WIZARD_CAST_DURATION_MS / 2,
            projectile: 640,
            impact: 280
        };
    const steps: CombatPresentationStep[] = [];

    if (beforeUnit.x !== afterUnit.x || beforeUnit.y !== afterUnit.y) {
        steps.push({
            kind: 'movement',
            phase: `${actor}-movement`,
            actor,
            from: { x: beforeUnit.x, y: beforeUnit.y },
            to: { x: afterUnit.x, y: afterUnit.y },
            durationMs: durations.movement
        });
    }

    const projectile = next.simulation.lastProjectile;
    if (!projectile || projectileSignature(projectile) ===
        projectileSignature(previous.simulation.lastProjectile)) return steps;
    const trace = projectile.trace.map((point) => ({ ...point }));
    const relicId = 'relicId' in projectile ? projectile.relicId : 'threadball';

    if (actor === 'loomkeeper') {
        steps.push({
            kind: 'aim',
            phase: 'loomkeeper-aim',
            actor,
            relicId,
            trace,
            durationMs: durations.aim
        });
    }
    steps.push({
        kind: 'cast-charge',
        phase: `${actor}-cast-charge`,
        actor,
        relicId,
        trace,
        durationMs: durations.castCharge
    });
    steps.push({
        kind: 'cast-formation',
        phase: `${actor}-cast-formation`,
        actor,
        relicId,
        trace,
        durationMs: durations.castFormation
    });
    steps.push({
        kind: 'projectile',
        phase: `${actor}-projectile`,
        actor,
        relicId,
        trace,
        durationMs: durations.projectile
    });
    steps.push({
        kind: 'impact',
        phase: `${actor}-impact`,
        actor,
        durationMs: durations.impact
    });
    return steps;
}

export function presentationLabel(step: CombatPresentationStep): string {
    const actor = step.actor === 'player' ? 'Your Knotkin' : 'Loomkeeper';
    if (step.kind === 'movement') return `${actor} moves`;
    if (step.kind === 'aim') return `Loomkeeper aims ${relicName(step.relicId)}`;
    if (step.kind === 'cast-charge') return `${actor} gathers Worldweave`;
    if (step.kind === 'cast-formation') return `${actor} forms ${relicName(step.relicId)} spell`;
    if (step.kind === 'projectile') return `${actor} fires ${relicName(step.relicId)}`;
    return `${actor} impact`;
}

function projectileSignature(
    projectile: ChallengeSnapshot['simulation']['lastProjectile']
): string {
    if (!projectile) return '';
    return [
        'relicId' in projectile ? projectile.relicId : 'threadball',
        projectile.startX,
        projectile.startY,
        projectile.endX,
        projectile.endY,
        projectile.flightTicks,
        projectile.impact,
        projectile.trace.length
    ].join(':');
}

function relicName(relicId: RelicId): string {
    if (relicId === 'threadball') return 'Threadball';
    if (relicId === 'needlepoint') return 'Needlepoint';
    return 'Spoolburst';
}
