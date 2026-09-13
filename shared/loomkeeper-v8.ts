import {
    advanceSimulationTicksV8, applySimulationBarrierV8, applySimulationIntentV8,
    cloneSimulationV8, V8_R1_RULESET_ID, type SimulationBarrierV8Family,
    type SimulationIntentV8Family, type SimulationStateV8Family
} from './simulation-v8';
import type { RelicId, SimulationActor } from './simulation';

export const V8_AI_PLANS = 180 as const;
export const V8_AI_PLANNING_TICKS = 30 as const;
export const V8_AI_PLANS_PER_TICK = 6 as const;
export const V8_AI_MAX_ROLLOUT_TICKS = 1_050 as const;
export const V8_AI_MAX_TOTAL_ROLLOUT_TICKS = 189_000 as const;

const RELICS: readonly RelicId[] = ['threadball', 'needlepoint', 'spoolburst'];
const ANGLES = [15_000, 30_000, 45_000, 60_000, 75_000] as const;
const POWERS = [700, 1_000] as const;
const SCRIPTS = [
    { direction: 'stay', ticks: 0, jump: false },
    { direction: 'toward', ticks: 90, jump: false },
    { direction: 'toward', ticks: 180, jump: false },
    { direction: 'away', ticks: 90, jump: false },
    { direction: 'toward', ticks: 90, jump: true },
    { direction: 'away', ticks: 90, jump: true }
] as const;

export type LoomkeeperSelectionV8 =
    | { status: 'selected'; ordinal: number }
    | { status: 'no_legal_plan' | 'work_failure'; ordinal: null };
export type LoomkeeperCandidateV8 = {
    ordinal: number; scriptIndex: number; movementTicks: number; jump: boolean;
    direction: 'stay' | 'toward' | 'away'; relicId: RelicId;
    angleMilliDegrees: number; powerPermille: number;
};
type Evaluation = {
    candidate: LoomkeeperCandidateV8; state: SimulationStateV8Family;
    logicalTicks: number; intents: number; barriers: number;
    rank: readonly [number, number, number, number, number];
};

export class LoomkeeperPlannerV8 {
    public planningTicks = 0;
    public evaluatedCandidates = 0;
    public rolloutTicks = 0;
    private best?: Evaluation;
    private complete = false;
    private readonly ordinals: number[];
    private readonly perTick: number;
    public constructor(private readonly source: SimulationStateV8Family, options: {scriptIndex?:0|1|4} = {}) {
        if (source.rulesetId !== V8_R1_RULESET_ID || source.phase !== 'action')
            throw new Error('V8 automation requires an r1 action state.');
        this.ordinals=options.scriptIndex===undefined?Array.from({length:180},(_,index)=>index)
            :Array.from({length:30},(_,index)=>options.scriptIndex!*30+index);
        this.perTick=options.scriptIndex===undefined?6:1;
    }
    public step(): void {
        if (this.complete) throw new Error('The V8 planning pass is already complete.');
        const start = this.evaluatedCandidates;
        for (let index = start; index < start + this.perTick; index++) {
            const evaluation = evaluateCandidate(this.source, candidateAt(this.ordinals[index]));
            this.evaluatedCandidates += 1;
            this.rolloutTicks += evaluation?.logicalTicks ?? V8_AI_MAX_ROLLOUT_TICKS;
            if (this.rolloutTicks > V8_AI_MAX_TOTAL_ROLLOUT_TICKS)
                throw new Error('V8 planning exceeded its frozen rollout budget.');
            if (evaluation && (!this.best || compareRank(evaluation.rank, this.best.rank) > 0)) this.best = evaluation;
        }
        this.planningTicks += 1;
        if (this.planningTicks === V8_AI_PLANNING_TICKS) {
            this.complete = true;
            if (this.evaluatedCandidates !== this.ordinals.length) throw new Error('Incomplete V8 planning lattice.');
        }
    }
    public get selection(): LoomkeeperSelectionV8 {
        if (!this.complete) throw new Error('V8 planning is incomplete.');
        return this.best ? { status: 'selected', ordinal: this.best.candidate.ordinal }
            : { status: 'no_legal_plan', ordinal: null };
    }
    public selectedCandidate(): LoomkeeperCandidateV8 | undefined {
        return this.selection.status === 'selected' ? candidateAt(this.selection.ordinal) : undefined;
    }
}

export type LoomkeeperOperationV8 =
    | { kind: 'intent'; intent: SimulationIntentV8Family }
    | { kind: 'barrier'; barrier: SimulationBarrierV8Family };

/** A stateful schedule cursor. The coordinator still validates every returned operation. */
export class LoomkeeperExecutionV8 {
    private readonly turn: number;
    private readonly actor: SimulationActor;
    private stage: 'start' | 'motion' | 'ground' | 'aim' | 'dwell' | 'resolution' = 'start';
    private queue: LoomkeeperOperationV8[] = [];
    private movementStart = 0;
    private movementEnd = 0;
    private lastMotionRefresh = -1;
    private aimedAt = -1;
    private retreatStart = -1;
    private lastRetreatRefresh = -1;
    public constructor(private readonly candidate: LoomkeeperCandidateV8,
        source: SimulationStateV8Family) {
        this.turn = source.turn; this.actor = source.activeActor;
    }
    public next(state: SimulationStateV8Family): LoomkeeperOperationV8 | undefined {
        if (state.turn !== this.turn || state.activeActor !== this.actor || state.phase === 'finished') return undefined;
        if (this.queue.length) return this.queue.shift();
        if (state.phase === 'retreat') return this.retreat(state);
        if (state.phase !== 'action') return undefined;
        if (this.stage === 'start') {
            this.movementStart = state.tick;
            this.movementEnd = state.tick + this.candidate.movementTicks;
            if (this.candidate.direction === 'stay') this.stage = 'ground';
            else {
                const direction = scriptDirection(state, this.candidate.direction);
                this.queue.push(intent({ type: 'face', direction }), intent({ type: 'walk_start', direction }));
                if (this.candidate.jump) this.queue.push(intent({ type: 'jump', direction }));
                this.stage = 'motion';
                return this.queue.shift();
            }
        }
        if (this.stage === 'motion') {
            if (state.tick >= this.movementEnd) {
                this.stage = 'ground';
                return { kind: 'barrier', barrier: {
                    reason: 'cancel', actor: this.actor, expectedTurn: state.turn, expectedEpoch: state.inputEpoch
                } };
            }
            const elapsed = state.tick - this.movementStart;
            if (elapsed > 0 && elapsed % 3 === 0 && state.heldDirection !== 0 && this.lastMotionRefresh !== state.tick) {
                this.lastMotionRefresh = state.tick; return intent({ type: 'walk_refresh' });
            }
            return undefined;
        }
        if (this.stage === 'ground') {
            if (!offenseReady(state)) return undefined;
            const direction = toward(state);
            const adjusted = appliedAim(state, this.candidate);
            this.queue.push(intent({ type: 'face', direction }),
                intent({ type: 'select_relic', relicId: this.candidate.relicId }),
                intent({ type: 'aim', ...adjusted }));
            this.stage = 'aim';
            return this.queue.shift();
        }
        if (this.stage === 'aim') {
            this.aimedAt = state.tick; this.stage = 'dwell';
        }
        if (this.stage === 'dwell' && state.tick >= this.aimedAt + 15) {
            this.stage = 'resolution';
            return intent({ type: 'fire', aimId: state.aimId });
        }
        return undefined;
    }
    private retreat(state: SimulationStateV8Family): LoomkeeperOperationV8 | undefined {
        if (this.retreatStart < 0) {
            this.retreatStart = state.tick;
            const direction = -toward(state) as -1 | 1;
            this.queue.push(intent({ type: 'face', direction }), intent({ type: 'walk_start', direction }));
            return this.queue.shift();
        }
        const elapsed = state.tick - this.retreatStart;
        if (elapsed > 0 && elapsed < 60 && elapsed % 3 === 0 && state.heldDirection !== 0 &&
            this.lastRetreatRefresh !== state.tick) {
            this.lastRetreatRefresh = state.tick; return intent({ type: 'walk_refresh' });
        }
        return undefined;
    }
}

export function candidateAt(ordinal: number): LoomkeeperCandidateV8 {
    if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= V8_AI_PLANS)
        throw new RangeError('Unknown V8 plan ordinal.');
    let cursor = ordinal;
    const powerPermille = POWERS[cursor % POWERS.length]; cursor = Math.trunc(cursor / POWERS.length);
    const angleMilliDegrees = ANGLES[cursor % ANGLES.length]; cursor = Math.trunc(cursor / ANGLES.length);
    const relicId = RELICS[cursor % RELICS.length]; cursor = Math.trunc(cursor / RELICS.length);
    const script = SCRIPTS[cursor];
    return { ordinal, scriptIndex: cursor, movementTicks: script.ticks, jump: script.jump,
        direction: script.direction, relicId, angleMilliDegrees, powerPermille };
}

function evaluateCandidate(source: SimulationStateV8Family, candidate: LoomkeeperCandidateV8): Evaluation | undefined {
    const initial = cloneSimulationV8(source); const initialActor = initial.activeActor;
    let state = advanceSimulationTicksV8(initial, 30).state;
    let logicalTicks = 30, intents = 0, barriers = 0;
    const execution = new LoomkeeperExecutionV8(candidate, state);
    while (state.phase !== 'finished' && state.turn === initial.turn && logicalTicks < V8_AI_MAX_ROLLOUT_TICKS) {
        for (let operations = 0; operations < 8; operations++) {
            const operation = execution.next(state); if (!operation) break;
            const transition = operation.kind === 'intent'
                ? applySimulationIntentV8(state, initialActor, operation.intent, state.turn, state.phase, state.inputEpoch)
                : applySimulationBarrierV8(state, operation.barrier);
            if (!transition.accepted) {
                if (operation.kind === 'intent' && ['select_relic', 'aim', 'fire'].includes(operation.intent.type)) return undefined;
                throw new Error(`Illegal V8 policy operation: ${transition.error?.message ?? 'unknown'}`);
            }
            if (transition.mutated) operation.kind === 'intent' ? intents += 1 : barriers += 1;
            state = transition.state;
        }
        if (state.phase === 'finished' || state.turn !== initial.turn) break;
        state = advanceSimulationTicksV8(state, 1).state; logicalTicks += 1;
    }
    assertLoomkeeperRolloutBoundsV8(state,initial.turn,logicalTicks,intents);
    const own = state.units[initialActor === 'player' ? 0 : 1];
    const target = state.units[initialActor === 'player' ? 1 : 0];
    const initialOwn = initial.units[initialActor === 'player' ? 0 : 1];
    const initialTarget = initial.units[initialActor === 'player' ? 1 : 0];
    const outcome = state.phase !== 'finished' ? 2 : state.winner === initialActor ? 3 : state.winner === 'draw' ? 1 : 0;
    const damage = (initialTarget.stitching-target.stitching)-2*(initialOwn.stitching-own.stitching);
    const separation = Math.min(640*256, Math.abs(state.units[0].xFp-state.units[1].xFp));
    return { candidate, state, logicalTicks, intents, barriers,
        rank: [outcome, damage, separation, -candidate.movementTicks, -candidate.ordinal] };
}
/** Fail closed at the work boundary; never score an incomplete same-turn rollout. */
export function assertLoomkeeperRolloutBoundsV8(state:SimulationStateV8Family,initialTurn:number,logicalTicks:number,intents:number):void{
    if(logicalTicks>V8_AI_MAX_ROLLOUT_TICKS||intents>512||
        (logicalTicks===V8_AI_MAX_ROLLOUT_TICKS&&state.phase!=='finished'&&state.turn===initialTurn))
        throw new Error('V8 candidate exceeded its frozen work bound.');
}
function compareRank(left: readonly number[], right: readonly number[]): number {
    for (let index=0; index<left.length; index++) if (left[index] !== right[index]) return left[index]-right[index];
    return 0;
}
function offenseReady(state: SimulationStateV8Family): boolean {
    return state.phase === 'action' && state.heldDirection === 0 &&
        state.units.every(unit => unit.alive && unit.grounded && unit.vxFp === 0 && unit.vyFp === 0);
}
function activeIndex(state: SimulationStateV8Family): 0 | 1 { return state.activeActor === 'player' ? 0 : 1; }
function toward(state: SimulationStateV8Family): -1 | 1 {
    const own = state.units[activeIndex(state)], other = state.units[activeIndex(state) === 0 ? 1 : 0];
    return (Math.sign(other.xFp-own.xFp) || own.facing) as -1 | 1;
}
function scriptDirection(state: SimulationStateV8Family, direction: 'toward' | 'away'): -1 | 1 {
    const result = toward(state); return direction === 'toward' ? result : -result as -1 | 1;
}
function appliedAim(state: SimulationStateV8Family, candidate: LoomkeeperCandidateV8) {
    const angleError = ((state.seed + 97 * state.turn) % 5001) - 2500;
    const powerError = ((state.seed + 53 * state.turn) % 101) - 50;
    return { angleMilliDegrees: clamp(candidate.angleMilliDegrees+angleError,-90_000,90_000),
        powerPermille: clamp(candidate.powerPermille+powerError,0,1_000) };
}
function clamp(value:number,minimum:number,maximum:number):number{return Math.max(minimum,Math.min(maximum,value));}
function intent(value: SimulationIntentV8Family): LoomkeeperOperationV8 { return { kind: 'intent', intent: value }; }
