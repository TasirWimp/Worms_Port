import {
    LoomkeeperExecutionV10,
    LoomkeeperPlannerV10,
    type LoomkeeperCandidateV10,
    type LoomkeeperOperationV10,
    type LoomkeeperSelectionV10
} from './loomkeeper-v10';
import type { SimulationActor } from './simulation';
import type { SimulationStateV9 } from './simulation-v9';
import {
    V10_R8_OBJECT_DIMENSIONS,
    simulationV10R7ViewOfR8,
    simulationV10R7ViewOfValidatedR8,
    type SimulationStateV10R8,
    type V10R8ObjectiveObject
} from './simulation-v10-r8';

const FP = 256;
const ACTOR_RADIUS_FP = 12 * FP;

/**
 * R8 retains the frozen 180-plan combat lattice and adds objective facts to
 * its deterministic rank. Every candidate still completes the same bounded
 * movement, cast, terrain and retreat rollout before objective progress is
 * compared.
 */
export class LoomkeeperPlannerV10R8 {
    private readonly planner: LoomkeeperPlannerV10;

    public constructor(private readonly source: SimulationStateV10R8) {
        this.planner = new LoomkeeperPlannerV10(simulationV10R7ViewOfR8(source), {
            rankCandidate: context => objectiveRank(source, context.completed, context.actor, context.baseRank)
        });
    }

    public get planningTicks(): number { return this.planner.planningTicks; }
    public get evaluatedCandidates(): number { return this.planner.evaluatedCandidates; }
    public get rolloutTicks(): number { return this.planner.rolloutTicks; }
    public get maximumRolloutTicks(): number { return this.planner.maximumRolloutTicks; }
    public get unaffordableCandidates(): number { return this.planner.unaffordableCandidates; }
    public step(): void { this.planner.step(); }
    public get selection(): LoomkeeperSelectionV10 { return this.planner.selection; }
    public selectedCandidate(): LoomkeeperCandidateV10 | undefined { return this.planner.selectedCandidate(); }
}

/** The selected R8 plan executes only through ordinary authoritative intents. */
export class LoomkeeperExecutionV10R8 {
    private readonly execution: LoomkeeperExecutionV10;

    public constructor(
        candidate: LoomkeeperCandidateV10,
        prefix: LoomkeeperSelectionV10['prefix'],
        source: SimulationStateV10R8
    ) {
        this.execution = new LoomkeeperExecutionV10(
            candidate,
            prefix,
            simulationV10R7ViewOfR8(source)
        );
    }

    public next(state: SimulationStateV10R8): LoomkeeperOperationV10 | undefined {
        return this.execution.next(simulationV10R7ViewOfR8(state));
    }

    public nextValidated(state: SimulationStateV10R8): LoomkeeperOperationV10 | undefined {
        return this.execution.nextValidated(simulationV10R7ViewOfValidatedR8(state));
    }
}

function objectiveRank(
    source: SimulationStateV10R8,
    completed: SimulationStateV9,
    actor: SimulationActor,
    baseRank: readonly number[]
): readonly number[] {
    const own = completed.units[actor === 'player' ? 0 : 1];
    const opponent = completed.units[actor === 'player' ? 1 : 0];
    const active = source.objective.objects.filter(object => object.status === 'active');
    const target = targetFor(source, active, own.xFp, own.yFp);
    const objectiveContact = target && overlaps(target, own.xFp, own.yFp) ? 1 : 0;
    const objectiveDistance = target ? boundedDistance(target, own.xFp, own.yFp) : 0;
    const guardsChest = source.objective.objectiveMode === 'claim' && target
        ? -Math.abs(own.xFp - target.xFp)
        : 0;
    const interceptsPlayer = source.objective.objectiveMode === 'claim' && target
        ? -Math.abs(own.xFp - midpoint(target.xFp, opponent.xFp))
        : 0;

    return [
        baseRank[0],
        objectiveContact,
        source.objective.objectiveMode === 'claim' ? guardsChest : -objectiveDistance,
        source.objective.objectiveMode === 'claim' ? interceptsPlayer : 0,
        baseRank[1],
        ...baseRank.slice(2)
    ];
}

function targetFor(
    source: SimulationStateV10R8,
    active: readonly V10R8ObjectiveObject[],
    xFp: number,
    yFp: number
): V10R8ObjectiveObject | undefined {
    if (source.objective.objectiveMode !== 'collect') return active[0];
    return [...active].sort((left, right) =>
        boundedDistance(left, xFp, yFp) - boundedDistance(right, xFp, yFp) ||
        left.id.localeCompare(right.id)
    )[0];
}

function overlaps(object: V10R8ObjectiveObject, xFp: number, yFp: number): boolean {
    const dimensions = V10_R8_OBJECT_DIMENSIONS[object.kind];
    return Math.abs(xFp - object.xFp) <= dimensions.halfWidth * FP + ACTOR_RADIUS_FP &&
        Math.abs(yFp - object.yFp) <= dimensions.halfHeight * FP + ACTOR_RADIUS_FP;
}

function boundedDistance(object: V10R8ObjectiveObject, xFp: number, yFp: number): number {
    return Math.min(2_048 * FP, Math.abs(xFp - object.xFp) + Math.abs(yFp - object.yFp));
}

function midpoint(left: number, right: number): number {
    return Math.trunc((left + right) / 2);
}
