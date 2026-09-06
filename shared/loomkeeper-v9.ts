import {
    advanceSimulationTicksV9, applySimulationBarrierV9, applySimulationIntentV9, cloneSimulationV9,
    type SimulationBarrierV9, type SimulationIntentV9, type SimulationStateV9
} from './simulation-v9';
import type { RelicId, SimulationActor } from './simulation';

export const V9_AI_PLANS = 180 as const;
export const V9_AI_PLANNING_TICKS = 30 as const;
export const V9_AI_PLANS_PER_TICK = 6 as const;
export const V9_AI_MAX_ROLLOUT_TICKS = 1_050 as const;
export const V9_AI_MAX_TOTAL_ROLLOUT_TICKS = 189_000 as const;

const RELICS: readonly RelicId[] = ['threadball', 'needlepoint', 'spoolburst'];
const ANGLES = [15_000, 30_000, 45_000, 60_000, 75_000] as const;
const POWERS = [700, 1_000] as const;
const SCRIPTS = [
    { direction: 'stay', ticks: 0, jump: false }, { direction: 'toward', ticks: 90, jump: false },
    { direction: 'toward', ticks: 180, jump: false }, { direction: 'away', ticks: 90, jump: false },
    { direction: 'toward', ticks: 90, jump: true }, { direction: 'away', ticks: 90, jump: true }
] as const;

export type V9Prefix = 'threadguard' | 'threadleap' | 'none';
export type LoomkeeperSelectionV9 =
    | { prefix: V9Prefix; status: 'selected'; ordinal: number }
    | { prefix: 'none'; status: 'no_legal_plan' | 'work_failure'; ordinal: null };
export type LoomkeeperCandidateV9 = { ordinal: number; scriptIndex: number; movementTicks: number; jump: boolean;
    direction: 'stay' | 'toward' | 'away'; relicId: RelicId; angleMilliDegrees: number; powerPermille: number };
export type LoomkeeperOperationV9 = { kind: 'intent'; intent: SimulationIntentV9 } | { kind: 'barrier'; barrier: SimulationBarrierV9 };
type Evaluation = { candidate: LoomkeeperCandidateV9; logicalTicks: number; rank: readonly number[] };

/** Phaser-free bounded V9 planner. Prefix evaluation mutates clones only. */
export class LoomkeeperPlannerV9 {
    public planningTicks = 0; public evaluatedCandidates = 0; public rolloutTicks = 0;
    private best?: Evaluation; private complete = false; private readonly prefix: V9Prefix;
    public constructor(private readonly source: SimulationStateV9) {
        if (source.phase !== 'action') throw new Error('V9 automation requires an action state.');
        this.prefix = prefixFor(source);
    }
    public step(): void {
        if (this.complete) throw new Error('The V9 planning pass is already complete.');
        const start = this.evaluatedCandidates;
        for (let ordinal = start; ordinal < start + V9_AI_PLANS_PER_TICK; ordinal += 1) {
            const evaluation = evaluateCandidate(this.source, candidateAt(ordinal), this.prefix);
            this.evaluatedCandidates += 1; this.rolloutTicks += evaluation?.logicalTicks ?? V9_AI_MAX_ROLLOUT_TICKS;
            if (this.rolloutTicks > V9_AI_MAX_TOTAL_ROLLOUT_TICKS) throw new Error('V9 planning exceeded its frozen rollout budget.');
            if (evaluation && (!this.best || compareRank(evaluation.rank, this.best.rank) > 0)) this.best = evaluation;
        }
        this.planningTicks += 1;
        if (this.planningTicks === V9_AI_PLANNING_TICKS) {
            this.complete = true;
            if (this.evaluatedCandidates !== V9_AI_PLANS) throw new Error('Incomplete V9 planning lattice.');
        }
    }
    public get selection(): LoomkeeperSelectionV9 {
        if (!this.complete) throw new Error('V9 planning is incomplete.');
        return this.best ? { prefix: this.prefix, status: 'selected', ordinal: this.best.candidate.ordinal }
            : { prefix: 'none', status: 'no_legal_plan', ordinal: null };
    }
    public selectedCandidate(): LoomkeeperCandidateV9 | undefined { return this.selection.status === 'selected' ? candidateAt(this.selection.ordinal) : undefined; }
}

/** The same operation cursor serves clone rollouts and recorded authority execution. */
export class LoomkeeperExecutionV9 {
    private readonly turn: number; private readonly actor: SimulationActor; private prefixPending = true;
    private stage: 'prefix' | 'start' | 'motion' | 'ground' | 'aim' | 'dwell' | 'resolution' = 'prefix';
    private queue: LoomkeeperOperationV9[] = []; private movementStart = 0; private movementEnd = 0;
    private aimedAt = -1; private lastRefresh = -1;
    public constructor(private readonly candidate: LoomkeeperCandidateV9, private readonly prefix: V9Prefix, source: SimulationStateV9) {
        this.turn = source.turn; this.actor = source.activeActor;
    }
    public next(state: SimulationStateV9): LoomkeeperOperationV9 | undefined {
        if (state.turn !== this.turn || state.activeActor !== this.actor || state.phase === 'finished') return undefined;
        if (this.queue.length) return this.queue.shift();
        if (state.phase === 'retreat') return undefined;
        if (state.phase !== 'action') return undefined;
        if (this.prefixPending) {
            this.prefixPending = false;
            if (this.prefix === 'threadguard') return intent({ type: 'threadguard' });
            if (this.prefix === 'threadleap') return intent({ type: 'threadleap', direction: toward(state) });
            this.stage = 'start';
        }
        // Leap has a fresh epoch and must land before scripted movement/aim starts.
        if (this.stage === 'prefix') { if (!offenseReady(state)) return undefined; this.stage = 'start'; }
        if (this.stage === 'start') {
            this.movementStart = state.tick; this.movementEnd = state.tick + this.candidate.movementTicks;
            if (this.candidate.direction === 'stay') this.stage = 'ground';
            else { const direction = scriptDirection(state, this.candidate.direction);
                this.queue.push(intent({ type: 'face', direction }), intent({ type: 'walk_start', direction }));
                if (this.candidate.jump) this.queue.push(intent({ type: 'jump', direction })); this.stage = 'motion'; return this.queue.shift(); }
        }
        if (this.stage === 'motion') {
            if (state.tick >= this.movementEnd) { this.stage = 'ground'; return { kind: 'barrier', barrier: { reason: 'cancel', actor: this.actor, expectedTurn: state.turn, expectedEpoch: state.inputEpoch } }; }
            const elapsed = state.tick - this.movementStart;
            if (elapsed > 0 && elapsed % 3 === 0 && state.heldDirection !== 0 && this.lastRefresh !== state.tick) { this.lastRefresh = state.tick; return intent({ type: 'walk_refresh' }); }
            return undefined;
        }
        if (this.stage === 'ground') {
            if (!offenseReady(state)) return undefined;
            this.queue.push(intent({ type: 'face', direction: toward(state) }), intent({ type: 'select_relic', relicId: this.candidate.relicId }),
                intent({ type: 'aim', ...appliedAim(state, this.candidate) })); this.stage = 'aim'; return this.queue.shift();
        }
        if (this.stage === 'aim') { this.aimedAt = state.tick; this.stage = 'dwell'; }
        if (this.stage === 'dwell' && state.tick >= this.aimedAt + 15) { this.stage = 'resolution'; return intent({ type: 'fire', aimId: state.aimId }); }
        return undefined;
    }
}

export function candidateAt(ordinal: number): LoomkeeperCandidateV9 {
    if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= V9_AI_PLANS) throw new RangeError('Unknown V9 plan ordinal.');
    let cursor = ordinal; const powerPermille = POWERS[cursor % POWERS.length]; cursor = Math.trunc(cursor / POWERS.length);
    const angleMilliDegrees = ANGLES[cursor % ANGLES.length]; cursor = Math.trunc(cursor / ANGLES.length);
    const relicId = RELICS[cursor % RELICS.length]; cursor = Math.trunc(cursor / RELICS.length); const script = SCRIPTS[cursor];
    return { ordinal, scriptIndex: cursor, movementTicks: script.ticks, jump: script.jump, direction: script.direction, relicId, angleMilliDegrees, powerPermille };
}
export function prefixFor(state: SimulationStateV9): V9Prefix {
    const own = state.units[state.activeActor === 'player' ? 0 : 1], other = state.units[state.activeActor === 'player' ? 1 : 0];
    if (own.thread < 4) return 'none'; if (own.stitching === 45) return 'threadguard';
    return Math.abs(own.xFp - other.xFp) >= 641 * 256 ? 'threadleap' : 'none';
}
function evaluateCandidate(source: SimulationStateV9, candidate: LoomkeeperCandidateV9, prefix: V9Prefix): Evaluation | undefined {
    let state = advanceSimulationTicksV9(cloneSimulationV9(source), 30).state; let ticks = 30; const actor = source.activeActor;
    const execution = new LoomkeeperExecutionV9(candidate, prefix, state);
    while (state.phase !== 'finished' && state.turn === source.turn && ticks < V9_AI_MAX_ROLLOUT_TICKS) {
        for (let count = 0; count < 8; count += 1) { const operation = execution.next(state); if (!operation) break;
            const transition = operation.kind === 'intent' ? applySimulationIntentV9(state, actor, operation.intent, state.turn, state.phase, state.inputEpoch) : applySimulationBarrierV9(state, operation.barrier);
            if (!transition.accepted) { if (operation.kind === 'intent' && ['select_relic', 'aim', 'fire'].includes(operation.intent.type)) return undefined; throw new Error('Illegal V9 policy operation.'); }
            state = transition.state;
        }
        if (state.phase === 'finished' || state.turn !== source.turn) break;
        state = advanceSimulationTicksV9(state, 1).state; ticks += 1;
    }
    if (ticks >= V9_AI_MAX_ROLLOUT_TICKS && state.phase !== 'finished' && state.turn === source.turn) throw new Error('V9 candidate exceeded its frozen work bound.');
    const own = state.units[actor === 'player' ? 0 : 1], target = state.units[actor === 'player' ? 1 : 0];
    return { candidate, logicalTicks: ticks, rank: [state.winner === actor ? 3 : state.phase !== 'finished' ? 2 : state.winner === 'draw' ? 1 : 0,
        source.units[actor === 'player' ? 1 : 0].stitching - target.stitching - 2 * (source.units[actor === 'player' ? 0 : 1].stitching - own.stitching),
        -candidate.movementTicks, -candidate.ordinal] };
}
function offenseReady(state: SimulationStateV9): boolean { return state.phase === 'action' && state.heldDirection === 0 && state.units.every(unit => unit.alive && unit.grounded && unit.vxFp === 0 && unit.vyFp === 0); }
function toward(state: SimulationStateV9): -1 | 1 { const own = state.units[state.activeActor === 'player' ? 0 : 1], other = state.units[state.activeActor === 'player' ? 1 : 0]; return (Math.sign(other.xFp - own.xFp) || own.facing) as -1 | 1; }
function scriptDirection(state: SimulationStateV9, direction: 'toward' | 'away'): -1 | 1 { const result = toward(state); return direction === 'toward' ? result : -result as -1 | 1; }
function appliedAim(state: SimulationStateV9, candidate: LoomkeeperCandidateV9) { const angleError = ((state.seed + 97 * state.turn) % 5001) - 2500, powerError = ((state.seed + 53 * state.turn) % 101) - 50; return { angleMilliDegrees: clamp(candidate.angleMilliDegrees + angleError, -90_000, 90_000), powerPermille: clamp(candidate.powerPermille + powerError, 0, 1000) }; }
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }
function compareRank(left: readonly number[], right: readonly number[]): number { for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return left[index] - right[index]; return 0; }
function intent(intent: SimulationIntentV9): LoomkeeperOperationV9 { return { kind: 'intent', intent }; }
