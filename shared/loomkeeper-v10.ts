import {
    candidateAt,
    LoomkeeperExecutionV9,
    LoomkeeperPlannerV9,
    V9_AI_MAX_ROLLOUT_TICKS,
    V9_AI_MAX_TOTAL_ROLLOUT_TICKS,
    V9_AI_PLANNING_TICKS,
    V9_AI_PLANS,
    V9_AI_PLANS_PER_TICK,
    type LoomkeeperCandidateV9,
    type LoomkeeperOperationV9,
    type LoomkeeperPlannerOptionsV9,
    type LoomkeeperSelectionV9,
    type V9Prefix
} from './loomkeeper-v9';
import {
    dynamicsForV10, mechanicsForV10, simulationV9ViewOfV10, simulationV9ViewOfValidatedV10,
    usesV10GTactics, type SimulationStateV10
} from './simulation-v10';

/** V10 deliberately inherits the complete frozen V9 search budget. */
export const V10_AI_PLANS = V9_AI_PLANS;
export const V10_AI_PLANNING_TICKS = V9_AI_PLANNING_TICKS;
export const V10_AI_PLANS_PER_TICK = V9_AI_PLANS_PER_TICK;
export const V10_AI_MAX_ROLLOUT_TICKS = V9_AI_MAX_ROLLOUT_TICKS;
export const V10_AI_MAX_TOTAL_ROLLOUT_TICKS = V9_AI_MAX_TOTAL_ROLLOUT_TICKS;

export type LoomkeeperSelectionV10 = LoomkeeperSelectionV9;
export type LoomkeeperCandidateV10 = LoomkeeperCandidateV9;
export type LoomkeeperOperationV10 = LoomkeeperOperationV9;

/** Legacy identity adapter; R3/R4 also bind explicit mechanics and candidate timing. */
export class LoomkeeperPlannerV10 {
    private readonly planner: LoomkeeperPlannerV9;

    public constructor(source: SimulationStateV10, options: LoomkeeperPlannerOptionsV9 = {}) {
        this.planner = new LoomkeeperPlannerV9(simulationV9ViewOfV10(source), {
            ...options,
            mechanics: mechanicsForV10(source.rulesetId),
            dynamics: dynamicsForV10(source.rulesetId),
            candidateAt: usesV10GTactics(source.rulesetId) ? v10gCandidateAt : undefined,
            rankCandidate: options.rankCandidate
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

/** Same 180-slot budget; precision angles and jump approach belong to R3/R4 only. */
export function v10gCandidateAt(ordinal: number): LoomkeeperCandidateV10 {
    const candidate = candidateAt(ordinal);
    return { ...candidate,
        ...(candidate.relicId === 'needlepoint' ? { angleMilliDegrees: (candidate.angleMilliDegrees / 15000 - 3) * 5000 } : {}),
        ...(candidate.jump ? { jumpDelayTicks: 40 } : {}) };
}

/** V9's cursor chooses operations; V10 validates and applies them itself. */
export class LoomkeeperExecutionV10 {
    private readonly execution: LoomkeeperExecutionV9;

    public constructor(
        candidate: LoomkeeperCandidateV10,
        prefix: V9Prefix,
        source: SimulationStateV10,
        startAtGround = false
    ) {
        this.execution = new LoomkeeperExecutionV9(
            candidate,
            prefix,
            simulationV9ViewOfV10(source),
            startAtGround
        );
    }

    public readyForAim(): boolean { return this.execution.readyForAim(); }
    public next(state: SimulationStateV10): LoomkeeperOperationV10 | undefined {
        return this.execution.next(simulationV9ViewOfV10(state));
    }
    /** Internal replay verifier seam; the cursor reads but never mutates this view. */
    public nextValidated(state: SimulationStateV10): LoomkeeperOperationV10 | undefined {
        return this.execution.next(simulationV9ViewOfValidatedV10(state));
    }
}
