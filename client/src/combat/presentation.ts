import type { ChallengeSnapshot } from '../../../shared/protocol';
import type { RelicId, SimulationActor } from '../../../shared/simulation';
import { WIZARD_CAST_DURATION_MS } from './approved-assets';
import type { ChallengeSnapshotV8Family as ChallengeSnapshotV8 } from '../../../shared/protocol-v8';
import type { SimulationStateV8Family as SimulationStateV8 } from '../../../shared/simulation-v8';
import type { SimulationState, SimulationUnit } from '../../../shared/simulation';
import { inputBoundaryV8 } from './input';

/** A deliberately non-authoritative, version-independent rendering surface. */
export type CombatRenderState = Pick<SimulationState, 'terrain' | 'units' | 'activeActor' | 'selectedRelic'>;

export function projectCombatV8(state: SimulationStateV8 | ChallengeSnapshotV8['simulation']): CombatRenderState {
    const unit = (body: SimulationStateV8['units'][number] | ChallengeSnapshotV8['simulation']['units'][0]): SimulationUnit => ({
        id: body.id, calling: body.calling, x: body.xFp / 256, y: body.yFp / 256,
        facing: body.facing, stitching: body.stitching, alive: body.alive
    });
    return { terrain: state.terrain, activeActor: state.activeActor, selectedRelic: state.selectedRelic,
        units: [unit(state.units[0]), unit(state.units[1])] };
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
