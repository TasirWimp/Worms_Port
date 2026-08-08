import type { ChallengeSnapshot } from '../../../shared/protocol';
import type { RelicId, SimulationActor } from '../../../shared/simulation';
import { WIZARD_CAST_DURATION_MS } from './approved-assets';

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
