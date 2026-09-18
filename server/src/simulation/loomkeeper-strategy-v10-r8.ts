import { z } from 'zod';

import {
    LoomkeeperExecutionV9,
    prefixFor,
    type LoomkeeperCandidateV9,
    type V9Prefix
} from '../../../shared/loomkeeper-v9';
import {
    v10gCandidateAt
} from '../../../shared/loomkeeper-v10';
import {
    V10_R8_OBJECT_DIMENSIONS,
    advanceObjectivePhysicsV10R8,
    assertSimulationInvariantsV10R8,
    hashSimulationStateV10R8,
    simulationV10R7ViewOfR8,
    type SimulationStateV10R8,
    type V10R8ObjectiveObject,
    type V10R8ObjectiveState
} from '../../../shared/simulation-v10-r8';
import {
    V10_R7_RULESET_ID,
    dynamicsForV10,
    hashCanonicalV10Value,
    mechanicsForV10,
    simulationV9ViewOfV10
} from '../../../shared/simulation-v10';
import {
    DetachedSimulationRolloutV9,
    advanceSimulationTicksV9DetachedRollout,
    applySimulationBarrierV9,
    applySimulationIntentV9,
    completeDetachedSimulationRolloutV9,
    type SimulationStateV9
} from '../../../shared/simulation-v9';
import { terrainSolid, type SimulationActor } from '../../../shared/simulation';

const FP = 256;
const BRIEF_WIDTH = 64;
const BRIEF_HEIGHT = 36;
const SOURCE_WIDTH = 256;
const SOURCE_HEIGHT = 72;
const SOURCE_CELLS_PER_BRIEF_CELL_X = SOURCE_WIDTH / BRIEF_WIDTH;
const SOURCE_CELLS_PER_BRIEF_CELL_Y = SOURCE_HEIGHT / BRIEF_HEIGHT;
const MAX_PROPOSALS = 12;
const MIN_ATLAS_CANDIDATES = 8;
const MAX_ATLAS_CANDIDATES = 12;
const MAX_ROLLOUT_TICKS = 1_050;
const PLANNING_TICKS = 30;
const MAX_OPERATIONS_PER_TICK = 8;

export const V10_R8_STRATEGY_POLICY_ID = 'nimble-knots-strategy-v1' as const;
export const V10_R8_BRIEF_REVISION = 'v10-r8-strategic-brief-r1' as const;
export const V10_R8_CANDIDATE_CAPS = Object.freeze({
    sourcePlans: 180,
    proposals: MAX_PROPOSALS,
    atlasMinimum: MIN_ATLAS_CANDIDATES,
    atlasMaximum: MAX_ATLAS_CANDIDATES,
    planningTicks: PLANNING_TICKS,
    rolloutTicks: MAX_ROLLOUT_TICKS,
    operationsPerTick: MAX_OPERATIONS_PER_TICK,
    battlefieldWidth: BRIEF_WIDTH,
    battlefieldHeight: BRIEF_HEIGHT,
    briefBytes: 16_384,
    responseBytes: 1_024
});

const boundedText = z.string().trim().min(1).max(160);
const boundedTextList = z.array(boundedText).max(4).readonly();
const optionalId = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/).nullable();

export const CommittedStrategicVoyageV10R8Schema = z.object({
    targetId: optionalId,
    milestoneId: optionalId,
    originalDueOwnTurn: z.number().int().min(1).max(8).nullable(),
    acceptedTemporaryCost: z.string().max(160).nullable(),
    invalidationConditions: boundedTextList,
    unresolvedConcerns: boundedTextList
}).strict().readonly();
export type CommittedStrategicVoyageV10R8 = z.infer<typeof CommittedStrategicVoyageV10R8Schema>;

export const EMPTY_COMMITTED_VOYAGE_V10_R8: CommittedStrategicVoyageV10R8 = CommittedStrategicVoyageV10R8Schema.parse({
    targetId: null,
    milestoneId: null,
    originalDueOwnTurn: null,
    acceptedTemporaryCost: null,
    invalidationConditions: [],
    unresolvedConcerns: []
});

export const RecentStrategicChangesV10R8Schema = z.object({
    previousAction: z.string().max(160).nullable(),
    observedResult: z.string().max(160).nullable(),
    playerChanges: boundedTextList,
    systemChanges: boundedTextList,
    unresolvedConcerns: boundedTextList
}).strict().readonly();
export type RecentStrategicChangesV10R8 = z.infer<typeof RecentStrategicChangesV10R8Schema>;

export const EMPTY_RECENT_CHANGES_V10_R8: RecentStrategicChangesV10R8 = RecentStrategicChangesV10R8Schema.parse({
    previousAction: null,
    observedResult: null,
    playerChanges: [],
    systemChanges: [],
    unresolvedConcerns: []
});

const selectedDecision = z.object({
    candidateId: z.string().regex(/^c(?:0[1-9]|1[0-2])$/),
    strategy: z.enum(['continue', 'refine', 'repair', 'switch', 'complete']),
    targetId: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
    milestoneId: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
    horizonOwnTurns: z.number().int().min(1).max(8),
    reason: boundedText,
    watchFor: boundedText
}).strict().readonly();
const abstainedDecision = z.object({
    candidateId: z.null(),
    strategy: z.null(),
    targetId: z.null(),
    milestoneId: z.null(),
    horizonOwnTurns: z.null(),
    reason: boundedText,
    watchFor: z.null()
}).strict().readonly();

export const StrategicDecisionV10R8Schema = z.union([selectedDecision, abstainedDecision]);
export type StrategicDecisionV10R8 = z.infer<typeof StrategicDecisionV10R8Schema>;

export function parseStrategicDecisionV10R8(input: unknown): StrategicDecisionV10R8 {
    let serialized: string | undefined;
    try {
        serialized = JSON.stringify(input);
    } catch {
        throw new Error('Strategic decision is not serializable.');
    }
    if (serialized === undefined) throw new Error('Strategic decision is not serializable.');
    const bytes = Buffer.byteLength(serialized, 'utf8');
    if (bytes > V10_R8_CANDIDATE_CAPS.responseBytes) throw new Error('Strategic decision exceeds its byte cap.');
    return StrategicDecisionV10R8Schema.parse(input);
}

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const candidateId = z.string().regex(/^c(?:0[1-9]|1[0-2])$/);
export const StrategicTurnRecordV10R8Schema = z.object({
    revision: z.literal(V10_R8_BRIEF_REVISION),
    policyId: z.literal(V10_R8_STRATEGY_POLICY_ID),
    turn: z.number().int().min(0).max(16),
    basisId: hash,
    stateHash: hash,
    briefHash: hash,
    candidateAtlasHash: hash,
    selectedCandidateId: candidateId,
    decisionSource: z.enum(['gemini', 'deterministic_fallback']),
    providerDecision: StrategicDecisionV10R8Schema.nullable(),
    status: z.enum(['pending', 'executing', 'committed']),
    proposedVoyage: CommittedStrategicVoyageV10R8Schema.nullable(),
    committedVoyage: CommittedStrategicVoyageV10R8Schema.nullable(),
    immediatePredictionHash: hash,
    observedStateHash: hash.nullable()
}).strict().superRefine((record, context) => {
    const committed = record.status === 'committed';
    if ((committed && (record.observedStateHash === null || record.committedVoyage === null)) ||
        (!committed && (record.observedStateHash !== null || record.committedVoyage !== null))) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['status'],
            message: 'Only committed strategic turns carry observed state and committed voyage.' });
    }
    if (record.providerDecision?.candidateId && record.decisionSource === 'gemini' &&
        record.providerDecision.candidateId !== record.selectedCandidateId) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['selectedCandidateId'],
            message: 'A Gemini-selected capability must match its validated provider decision.' });
    }
});
export type StrategicTurnRecordV10R8 = z.infer<typeof StrategicTurnRecordV10R8Schema>;

export type StrategicCandidateFamilyV10R8 =
    | 'objective_progress'
    | 'defence'
    | 'terrain'
    | 'survival'
    | 'combat';

export type StrategicCandidateSummaryV10R8 = Readonly<{
    candidateId: string;
    deterministicFallback: boolean;
    families: readonly StrategicCandidateFamilyV10R8[];
    action: Readonly<{
        movement: 'stay' | 'toward' | 'away';
        movementTicks: number;
        jump: boolean;
        relicId: LoomkeeperCandidateV9['relicId'];
        angleMilliDegrees: number;
        powerPermille: number;
        utilityPrefix: V9Prefix;
        shotFired: boolean;
    }>;
    immediate: Readonly<{
        ownStitchingDelta: number;
        opponentStitchingDelta: number;
        ownXDelta: number;
        ownYDelta: number;
        terrainCellsRemoved: number;
        objectiveScoreDelta: number;
        objectiveDistanceDelta: number | null;
        resolvedObjectiveIds: readonly string[];
        terminalWinner: 'player' | 'loomkeeper' | 'draw' | null;
    }>;
    opportunities: readonly string[];
    risks: readonly string[];
    uncertainty: readonly string[];
}>;

export type StrategicDecisionBriefV10R8 = Readonly<{
    revision: typeof V10_R8_BRIEF_REVISION;
    policyId: typeof V10_R8_STRATEGY_POLICY_ID;
    basisId: string;
    stateHash: string;
    objective: Readonly<{
        mode: SimulationStateV10R8['objective']['objectiveMode'];
        winningCondition: string;
        scores: Readonly<Record<SimulationActor, number>>;
        ownThread: number;
        remainingTurns: number;
    }>;
    battlefield: Readonly<{
        width: typeof BRIEF_WIDTH;
        height: typeof BRIEF_HEIGHT;
        ascii: string;
        legend: Readonly<Record<string, string>>;
        actors: readonly Readonly<{
            id: SimulationActor;
            x: number;
            y: number;
            stitching: number;
            alive: boolean;
            grounded: boolean;
            support: string;
        }>[];
        objects: readonly Readonly<{
            id: string;
            kind: V10R8ObjectiveObject['kind'];
            owner: SimulationActor | null;
            x: number;
            y: number;
            status: V10R8ObjectiveObject['status'];
            support: string;
        }>[];
        relationships: readonly string[];
    }>;
    currentStrategy: CommittedStrategicVoyageV10R8;
    recentChanges: RecentStrategicChangesV10R8;
    legalCandidates: readonly StrategicCandidateSummaryV10R8[];
}>;

type CandidateSummaryCoreV10R8 = Omit<
    StrategicCandidateSummaryV10R8,
    'candidateId' | 'deterministicFallback'
>;

type SimulatedCandidate = Readonly<{
    candidate: LoomkeeperCandidateV9;
    prefix: V9Prefix;
    completed: CandidateOutcomeV10R8;
    summary: Omit<StrategicCandidateSummaryV10R8, 'candidateId'>;
}>;

type CandidateObjectiveProjectionV10R8 = {
    state: V10R8ObjectiveState;
    scores: Record<SimulationActor, number>;
    resolved: Set<string>;
    newlyResolved: string[];
    terminalWinner: 'player' | 'loomkeeper' | 'draw' | null;
};

type CandidateOutcomeV10R8 = Readonly<{
    combat: SimulationStateV9;
    objective: Readonly<{
        state: V10R8ObjectiveState;
        scores: Readonly<Record<SimulationActor, number>>;
        resolved: ReadonlySet<string>;
        newlyResolved: readonly string[];
        terminalWinner: 'player' | 'loomkeeper' | 'draw' | null;
    }>;
    shotFired: boolean;
}>;

const capabilityToken = Symbol('V10R8CandidateCapability');
const boundaryToken = Symbol('V10R8StrategicDecisionBoundary');
const issuedCapabilities = new WeakSet<object>();
const consumedCapabilities = new WeakSet<object>();

/** Opaque, one-use authority minted only by a current decision boundary. */
export class CandidateCapabilityV10R8 {
    readonly #token: symbol;
    readonly #basisId: string;
    readonly #candidateId: string;

    constructor(token: symbol, basisId: string, candidateId: string) {
        if (token !== capabilityToken) throw new Error('Candidate capabilities are server-owned.');
        this.#token = token;
        this.#basisId = basisId;
        this.#candidateId = candidateId;
        issuedCapabilities.add(this);
        Object.freeze(this);
    }

    matches(basisId: string, candidateId: string): boolean {
        return this.#token === capabilityToken && this.#basisId === basisId && this.#candidateId === candidateId;
    }
}

export type ResolvedCandidateV10R8 = Readonly<{
    candidate: LoomkeeperCandidateV9;
    prefix: V9Prefix;
}>;

export class StrategicDecisionBoundaryV10R8 {
    readonly brief: StrategicDecisionBriefV10R8;
    readonly #candidates: ReadonlyMap<string, SimulatedCandidate>;

    constructor(token: symbol, brief: StrategicDecisionBriefV10R8, candidates: ReadonlyMap<string, SimulatedCandidate>) {
        if (token !== boundaryToken) throw new Error('Strategic decision boundaries are server-owned.');
        this.brief = brief;
        this.#candidates = candidates;
    }

    resolve(candidateId: string): CandidateCapabilityV10R8 {
        if (!this.#candidates.has(candidateId)) throw new Error('Unknown candidate for this decision basis.');
        return new CandidateCapabilityV10R8(capabilityToken, this.brief.basisId, candidateId);
    }

    consume(capability: CandidateCapabilityV10R8): ResolvedCandidateV10R8 {
        if (!issuedCapabilities.has(capability) || consumedCapabilities.has(capability)) {
            throw new Error('Candidate capability is invalid or already consumed.');
        }
        const entry = [...this.#candidates.entries()].find(([candidateId]) =>
            capability.matches(this.brief.basisId, candidateId));
        if (!entry) throw new Error('Candidate capability belongs to another decision basis.');
        consumedCapabilities.add(capability);
        return Object.freeze({ candidate: Object.freeze({ ...entry[1].candidate }), prefix: entry[1].prefix });
    }

    evidence(): Readonly<{
        basisId: string;
        stateHash: string;
        briefHash: string;
        candidateAtlasHash: string;
    }> {
        return Object.freeze({
            basisId: this.brief.basisId,
            stateHash: this.brief.stateHash,
            briefHash: hashCanonicalV10Value(this.brief),
            candidateAtlasHash: hashCanonicalV10Value(this.brief.legalCandidates)
        });
    }
}

export type BuildStrategicDecisionBoundaryV10R8 = Readonly<{
    challengeId: string;
    state: SimulationStateV10R8;
    deterministicFallback: ResolvedCandidateV10R8;
    currentStrategy?: CommittedStrategicVoyageV10R8;
    recentChanges?: RecentStrategicChangesV10R8;
}>;

export function buildStrategicDecisionBoundaryV10R8(
    input: BuildStrategicDecisionBoundaryV10R8
): StrategicDecisionBoundaryV10R8 {
    const { state } = input;
    assertSimulationInvariantsV10R8(state);
    if (state.phase !== 'action' || state.activeActor !== 'loomkeeper' || state.winner !== null) {
        throw new Error('A strategic boundary requires a live Loomkeeper action state.');
    }
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(input.challengeId)) throw new Error('Invalid strategic challenge identity.');
    const currentStrategy = CommittedStrategicVoyageV10R8Schema.parse(
        input.currentStrategy ?? EMPTY_COMMITTED_VOYAGE_V10_R8
    );
    const recentChanges = RecentStrategicChangesV10R8Schema.parse(
        input.recentChanges ?? EMPTY_RECENT_CHANGES_V10_R8
    );
    const deterministicFallback = validateFallback(state, input.deterministicFallback);
    const basisId = strategicBasisIdFromValidatedInput(
        input.challengeId, state, currentStrategy, recentChanges, deterministicFallback
    );
    const stateHash = hashSimulationStateV10R8(state);
    const simulations = buildCandidateAtlas(state, deterministicFallback);
    const candidates = new Map<string, SimulatedCandidate>();
    const legalCandidates = simulations.map((simulation, index) => {
        const candidateId = `c${String(index + 1).padStart(2, '0')}`;
        candidates.set(candidateId, simulation);
        return Object.freeze({ candidateId, ...simulation.summary });
    });
    const own = unit(state, 'loomkeeper');
    const brief: StrategicDecisionBriefV10R8 = Object.freeze({
        revision: V10_R8_BRIEF_REVISION,
        policyId: V10_R8_STRATEGY_POLICY_ID,
        basisId,
        stateHash,
        objective: Object.freeze({
            mode: state.objective.objectiveMode,
            winningCondition: winningCondition(state),
            scores: Object.freeze({ ...state.objective.scores }),
            ownThread: own.thread,
            remainingTurns: Math.max(0, 16 - state.turn)
        }),
        battlefield: projectWorldSurfaceV10R8(state),
        currentStrategy,
        recentChanges,
        legalCandidates: Object.freeze(legalCandidates)
    });
    if (Buffer.byteLength(JSON.stringify(brief), 'utf8') > V10_R8_CANDIDATE_CAPS.briefBytes) {
        throw new Error('Strategic decision brief exceeds its byte cap.');
    }
    return new StrategicDecisionBoundaryV10R8(boundaryToken, brief, candidates);
}

export function strategicBasisIdV10R8(input: BuildStrategicDecisionBoundaryV10R8): string {
    const { state } = input;
    assertSimulationInvariantsV10R8(state);
    if (state.phase !== 'action' || state.activeActor !== 'loomkeeper' || state.winner !== null) {
        throw new Error('A strategic basis requires a live Loomkeeper action state.');
    }
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(input.challengeId)) throw new Error('Invalid strategic challenge identity.');
    const currentStrategy = CommittedStrategicVoyageV10R8Schema.parse(
        input.currentStrategy ?? EMPTY_COMMITTED_VOYAGE_V10_R8
    );
    const recentChanges = RecentStrategicChangesV10R8Schema.parse(
        input.recentChanges ?? EMPTY_RECENT_CHANGES_V10_R8
    );
    return strategicBasisIdFromValidatedInput(
        input.challengeId,
        state,
        currentStrategy,
        recentChanges,
        validateFallback(state, input.deterministicFallback)
    );
}

function strategicBasisIdFromValidatedInput(
    challengeId: string,
    state: SimulationStateV10R8,
    currentStrategy: CommittedStrategicVoyageV10R8,
    recentChanges: RecentStrategicChangesV10R8,
    deterministicFallback: ResolvedCandidateV10R8
): string {
    return hashCanonicalV10Value({
        challengeId,
        stateHash: hashSimulationStateV10R8(state),
        turn: state.turn,
        policyId: V10_R8_STRATEGY_POLICY_ID,
        revision: V10_R8_BRIEF_REVISION,
        deterministicFallback,
        currentStrategy,
        recentChanges
    });
}

function buildCandidateAtlas(
    source: SimulationStateV10R8,
    deterministicFallback: ResolvedCandidateV10R8
): readonly SimulatedCandidate[] {
    const fallback = simulateCandidate(source, deterministicFallback.candidate, true);
    if (!fallback) throw new Error('The deterministic fallback is not a legal complete-turn candidate.');
    const proposalOrdinals = proposedOrdinals();
    const simulated = proposalOrdinals
        .filter(ordinal => ordinal !== deterministicFallback.candidate.ordinal)
        .map(ordinal => simulateCandidate(source, v10gCandidateAt(ordinal), false))
        .filter((candidate): candidate is SimulatedCandidate => candidate !== undefined);
    const distinct = deduplicateSimulations([fallback, ...simulated]);
    const selected: SimulatedCandidate[] = [fallback];
    for (const family of ['objective_progress', 'defence', 'terrain', 'survival', 'combat'] as const) {
        const candidate = distinct.find(item => item.summary.families.includes(family) && !selected.includes(item));
        if (candidate) selected.push(candidate);
    }
    for (const candidate of distinct) {
        if (selected.length >= MAX_ATLAS_CANDIDATES) break;
        if (!selected.includes(candidate)) selected.push(candidate);
    }
    if (selected.length < Math.min(MIN_ATLAS_CANDIDATES, distinct.length)) {
        throw new Error('Strategic atlas selection lost legal candidate diversity.');
    }
    return Object.freeze(selected);
}

function proposedOrdinals(): readonly number[] {
    const ordinal = (script: number, relic: number, angle: number, power: number) =>
        (((script * 3 + relic) * 5 + angle) * 2) + power;
    return Object.freeze([
        ordinal(0, 0, 2, 1), ordinal(0, 2, 1, 1),
        ordinal(1, 0, 2, 1), ordinal(1, 1, 2, 1),
        ordinal(2, 2, 1, 1), ordinal(3, 0, 2, 1),
        ordinal(4, 0, 2, 1), ordinal(5, 1, 2, 0),
        ordinal(2, 0, 1, 1), ordinal(3, 1, 3, 0),
        ordinal(4, 1, 1, 0), ordinal(5, 0, 3, 1)
    ] satisfies number[]);
}

function validateFallback(
    state: SimulationStateV10R8,
    fallback: ResolvedCandidateV10R8
): ResolvedCandidateV10R8 {
    const expected = v10gCandidateAt(fallback.candidate.ordinal);
    const expectedPrefix = prefixFor(simulationV9ViewOfV10(simulationV10R7ViewOfR8(state)));
    if (JSON.stringify(expected) !== JSON.stringify(fallback.candidate) || fallback.prefix !== expectedPrefix) {
        throw new Error('Deterministic fallback does not belong to this R8 action state.');
    }
    return Object.freeze({ candidate: Object.freeze({ ...fallback.candidate }), prefix: fallback.prefix });
}

function simulateCandidate(
    source: SimulationStateV10R8,
    candidate: LoomkeeperCandidateV9,
    deterministicFallback: boolean
): SimulatedCandidate | undefined {
    const mechanics = mechanicsForV10(V10_R7_RULESET_ID);
    const dynamics = dynamicsForV10(V10_R7_RULESET_ID);
    const sourceCombat = simulationV9ViewOfV10(simulationV10R7ViewOfR8(source));
    const rollout = DetachedSimulationRolloutV9.fromTrustedSource(sourceCombat, dynamics);
    const objective = createObjectiveProjection(source.objective);
    for (let index = 0; index < PLANNING_TICKS; index += 1) {
        const before = rollout.state;
        const transition = advanceSimulationTicksV9DetachedRollout(rollout, 1, mechanics);
        if (!transition.mutated) return undefined;
        advanceObjectiveProjection(objective, before, rollout.state);
        if (objective.terminalWinner) break;
    }
    const prefix = prefixFor(sourceCombat);
    const execution = new LoomkeeperExecutionV9(candidate, prefix, rollout.state);
    let fired = false;
    let ticks = PLANNING_TICKS;
    while (!objective.terminalWinner && rollout.state.phase !== 'finished' &&
        rollout.state.turn === source.turn && ticks < MAX_ROLLOUT_TICKS) {
        for (let count = 0; count < MAX_OPERATIONS_PER_TICK; count += 1) {
            const state = rollout.state;
            const operation = execution.next(state);
            if (!operation) break;
            const transition = operation.kind === 'intent'
                ? applySimulationIntentV9(
                    state,
                    'loomkeeper',
                    operation.intent,
                    state.turn,
                    state.phase,
                    state.inputEpoch,
                    mechanics,
                    dynamics
                )
                : applySimulationBarrierV9(state, operation.barrier, dynamics);
            if (!transition.accepted) return undefined;
            if (operation.kind === 'intent' && operation.intent.type === 'fire') fired = true;
            if (transition.mutated) rollout.replace(transition.state);
        }
        if (objective.terminalWinner || rollout.state.turn !== source.turn) break;
        const before = rollout.state;
        const transition = advanceSimulationTicksV9DetachedRollout(rollout, 1, mechanics);
        if (!transition.mutated) break;
        advanceObjectiveProjection(objective, before, rollout.state);
        ticks += 1;
    }
    if ((!fired && !objective.terminalWinner) ||
        (!objective.terminalWinner && rollout.state.phase !== 'finished' && rollout.state.turn === source.turn)) return undefined;
    const completed = Object.freeze({
        combat: completeDetachedSimulationRolloutV9(rollout),
        objective: Object.freeze({
            state: objective.state,
            scores: Object.freeze({ ...objective.scores }),
            resolved: new Set(objective.resolved) as ReadonlySet<string>,
            newlyResolved: Object.freeze([...objective.newlyResolved]),
            terminalWinner: objective.terminalWinner
        }),
        shotFired: fired
    });
    return Object.freeze({
        candidate: Object.freeze({ ...candidate }),
        prefix,
        completed,
        summary: Object.freeze({ deterministicFallback, ...summarizeCandidate(source, completed, candidate, prefix) })
    });
}

function summarizeCandidate(
    source: SimulationStateV10R8,
    completed: CandidateOutcomeV10R8,
    candidate: LoomkeeperCandidateV9,
    prefix: V9Prefix
): CandidateSummaryCoreV10R8 {
    const ownBefore = unit(source, 'loomkeeper');
    const ownAfter = unit(completed.combat, 'loomkeeper');
    const opponentBefore = unit(source, 'player');
    const opponentAfter = unit(completed.combat, 'player');
    const targetBefore = targetFor(source, ownBefore.xFp, ownBefore.yFp);
    const targetAfter = targetBefore && completed.objective.state.objects.find(object => object.id === targetBefore.id);
    const beforeDistance = targetBefore ? distanceTo(targetBefore, ownBefore.xFp, ownBefore.yFp) : null;
    const afterDistance = targetAfter && targetAfter.status === 'active' && !completed.objective.resolved.has(targetAfter.id)
        ? distanceTo(targetAfter, ownAfter.xFp, ownAfter.yFp)
        : null;
    const terrainCellsRemoved = removedTerrainCells(source, completed.combat);
    const objectiveScoreDelta = completed.objective.scores.loomkeeper - source.objective.scores.loomkeeper;
    const resolvedObjectiveIds = [...completed.objective.newlyResolved];
    const objectiveDistanceDelta = beforeDistance === null || afterDistance === null
        ? null
        : beforeDistance - afterDistance;
    const families = candidateFamilies(source, candidate, terrainCellsRemoved, objectiveDistanceDelta, objectiveScoreDelta);
    const opportunities: string[] = [];
    if (objectiveScoreDelta > 0 || resolvedObjectiveIds.length > 0) opportunities.push('Resolves immediate objective progress.');
    if ((objectiveDistanceDelta ?? 0) > 0) opportunities.push('Ends closer to the active objective.');
    if (terrainCellsRemoved > 0) opportunities.push('Changes terrain and may open or close future routes.');
    if (opponentAfter.stitching < opponentBefore.stitching) opportunities.push('Reduces the player stitching total.');
    if ((completed.objective.terminalWinner ?? completed.combat.winner) === 'loomkeeper') {
        opportunities.push('Can complete the match now.');
    }
    if (!opportunities.length) opportunities.push('Preserves a legal complete-turn continuation.');
    const risks: string[] = [];
    if ((objectiveDistanceDelta ?? 0) < 0) risks.push('Ends farther from the active objective.');
    if (terrainCellsRemoved > 0) risks.push('Destroyed support may also remove a Loomkeeper route or landing.');
    if (candidate.direction === 'toward') risks.push('Moves into a more exposed player-response range.');
    if (!risks.length) risks.push('The player can reshape terrain before the next Loomkeeper turn.');
    return Object.freeze({
        families: Object.freeze(families),
        action: Object.freeze({
            movement: candidate.direction,
            movementTicks: candidate.movementTicks,
            jump: candidate.jump,
            relicId: candidate.relicId,
            angleMilliDegrees: candidate.angleMilliDegrees,
            powerPermille: candidate.powerPermille,
            utilityPrefix: prefix,
            shotFired: completed.shotFired
        }),
        immediate: Object.freeze({
            ownStitchingDelta: ownAfter.stitching - ownBefore.stitching,
            opponentStitchingDelta: opponentAfter.stitching - opponentBefore.stitching,
            ownXDelta: worldUnits(ownAfter.xFp - ownBefore.xFp),
            ownYDelta: worldUnits(ownAfter.yFp - ownBefore.yFp),
            terrainCellsRemoved,
            objectiveScoreDelta,
            objectiveDistanceDelta: objectiveDistanceDelta === null ? null : worldUnits(objectiveDistanceDelta),
            resolvedObjectiveIds: Object.freeze(resolvedObjectiveIds),
            terminalWinner: completed.objective.terminalWinner ?? completed.combat.winner
        }),
        opportunities: Object.freeze(opportunities),
        risks: Object.freeze(risks),
        uncertainty: Object.freeze([
            'Later objective access depends on the player response and future terrain state.'
        ])
    });
}

function candidateFamilies(
    state: SimulationStateV10R8,
    candidate: LoomkeeperCandidateV9,
    terrainCellsRemoved: number,
    objectiveDistanceDelta: number | null,
    objectiveScoreDelta: number
): StrategicCandidateFamilyV10R8[] {
    const families: StrategicCandidateFamilyV10R8[] = ['combat'];
    if (objectiveScoreDelta > 0 || (objectiveDistanceDelta ?? 0) > 0 || candidate.direction === 'toward') {
        families.push('objective_progress');
    }
    if (state.objective.objectiveMode === 'claim' || candidate.direction === 'stay') families.push('defence');
    if (terrainCellsRemoved > 0 || candidate.relicId === 'spoolburst') families.push('terrain');
    if (candidate.direction === 'away' || candidate.jump) families.push('survival');
    return families;
}

function deduplicateSimulations(simulations: readonly SimulatedCandidate[]): SimulatedCandidate[] {
    const seen = new Set<string>();
    const distinct: SimulatedCandidate[] = [];
    for (const simulation of simulations) {
        const signature = hashCanonicalV10Value({
            families: simulation.summary.families,
            action: simulation.summary.action,
            immediate: simulation.summary.immediate,
            combat: simulation.completed.combat,
            objective: {
                state: simulation.completed.objective.state,
                scores: simulation.completed.objective.scores,
                resolved: [...simulation.completed.objective.resolved]
            }
        });
        if (seen.has(signature)) continue;
        seen.add(signature);
        distinct.push(simulation);
    }
    return distinct;
}

function createObjectiveProjection(source: V10R8ObjectiveState): CandidateObjectiveProjectionV10R8 {
    return {
        state: source,
        scores: { ...source.scores },
        resolved: new Set(source.objects.filter(object => object.status !== 'active').map(object => object.id)),
        newlyResolved: [],
        terminalWinner: source.result?.winner ?? null
    };
}

function advanceObjectiveProjection(
    projection: CandidateObjectiveProjectionV10R8,
    before: SimulationStateV9,
    after: SimulationStateV9
): void {
    if (projection.terminalWinner) return;
    const needsMotion = projection.state.objects.some(object =>
        object.status === 'active' && !projection.resolved.has(object.id) && !object.grounded);
    if (needsMotion || terrainChanged(before, after)) {
        projection.state = advanceObjectivePhysicsV10R8(projection.state, after.terrain);
    }
    for (const object of projection.state.objects) {
        if (projection.resolved.has(object.id) || object.status === 'active') continue;
        projection.resolved.add(object.id);
        projection.newlyResolved.push(object.id);
    }
    if (projection.state.objectiveMode === 'collect') {
        for (const object of projection.state.objects) {
            if (object.status !== 'active' || projection.resolved.has(object.id)) continue;
            const contenders = (['player', 'loomkeeper'] as const).filter(actor =>
                projectedObjectiveOverlapsActor(object, after, actor));
            if (!contenders.length) continue;
            let collector: SimulationActor | undefined = contenders[0];
            if (contenders.length === 2) {
                const playerDistance = projectedObjectiveDistanceSquared(object, after, 'player');
                const loomkeeperDistance = projectedObjectiveDistanceSquared(object, after, 'loomkeeper');
                collector = playerDistance === loomkeeperDistance ? undefined
                    : playerDistance < loomkeeperDistance ? 'player' : 'loomkeeper';
            }
            if (!collector) continue;
            projection.resolved.add(object.id);
            projection.newlyResolved.push(object.id);
            projection.scores[collector] += 1;
        }
    } else {
        const attacker: SimulationActor = projection.state.objectiveMode === 'defend' ? 'loomkeeper' : 'player';
        const chest = projection.state.objects[0];
        if (chest.status === 'active' && !projection.resolved.has(chest.id) &&
            projectedObjectiveOverlapsActor(chest, after, attacker)) {
            projection.resolved.add(chest.id);
            projection.newlyResolved.push(chest.id);
        }
    }
    projection.terminalWinner = projectedTerminalWinner(projection, after);
}

function projectedTerminalWinner(
    projection: CandidateObjectiveProjectionV10R8,
    combat: SimulationStateV9
): 'player' | 'loomkeeper' | 'draw' | null {
    const playerAlive = combat.units[0].alive;
    const loomkeeperAlive = combat.units[1].alive;
    const elimination = playerAlive && loomkeeperAlive ? null
        : playerAlive ? 'player' as const : loomkeeperAlive ? 'loomkeeper' as const : 'draw' as const;
    let objective: 'player' | 'loomkeeper' | 'draw' | null = null;
    const active = projection.state.objects.filter(object =>
        object.status === 'active' && !projection.resolved.has(object.id)).length;
    if (projection.state.objectiveMode === 'collect') {
        if (projection.scores.player > projection.scores.loomkeeper + active) objective = 'player';
        else if (projection.scores.loomkeeper > projection.scores.player + active) objective = 'loomkeeper';
        else if (active === 0) objective = projection.scores.player === projection.scores.loomkeeper ? 'draw'
            : projection.scores.player > projection.scores.loomkeeper ? 'player' : 'loomkeeper';
    } else if (active === 0) {
        objective = projection.state.objectiveMode === 'defend' ? 'loomkeeper' : 'player';
    }
    if (elimination && objective) return elimination === objective && elimination !== 'draw' ? objective : 'draw';
    if (objective) return objective;
    if (elimination) return elimination;
    if (combat.phase !== 'finished' || combat.finishReason !== 'turn_limit') return null;
    if (projection.state.objectiveMode === 'defend') return 'player';
    if (projection.state.objectiveMode === 'claim') return 'loomkeeper';
    return projection.scores.player === projection.scores.loomkeeper ? 'draw'
        : projection.scores.player > projection.scores.loomkeeper ? 'player' : 'loomkeeper';
}

function projectedObjectiveOverlapsActor(
    object: V10R8ObjectiveObject,
    combat: SimulationStateV9,
    actor: SimulationActor
): boolean {
    const actorUnit = unit(combat, actor);
    if (!actorUnit.alive) return false;
    const dimensions = V10_R8_OBJECT_DIMENSIONS[object.kind];
    const actorRadiusFp = 12 * FP;
    return Math.abs(actorUnit.xFp - object.xFp) <= dimensions.halfWidth * FP + actorRadiusFp &&
        Math.abs(actorUnit.yFp - object.yFp) <= dimensions.halfHeight * FP + actorRadiusFp;
}

function projectedObjectiveDistanceSquared(
    object: V10R8ObjectiveObject,
    combat: SimulationStateV9,
    actor: SimulationActor
): number {
    const actorUnit = unit(combat, actor);
    const dx = actorUnit.xFp - object.xFp;
    const dy = actorUnit.yFp - object.yFp;
    return dx * dx + dy * dy;
}

function terrainChanged(before: SimulationStateV9, after: SimulationStateV9): boolean {
    return before.terrain.words.some((word, index) => word !== after.terrain.words[index]);
}

export function projectWorldSurfaceV10R8(
    state: SimulationStateV10R8
): StrategicDecisionBriefV10R8['battlefield'] {
    assertSimulationInvariantsV10R8(state);
    const rows: string[][] = Array.from({ length: BRIEF_HEIGHT }, (_, briefY) =>
        Array.from({ length: BRIEF_WIDTH }, (_, briefX) => {
            let solids = 0;
            for (let dy = 0; dy < SOURCE_CELLS_PER_BRIEF_CELL_Y; dy += 1) {
                for (let dx = 0; dx < SOURCE_CELLS_PER_BRIEF_CELL_X; dx += 1) {
                    if (terrainSolid(
                        state.terrain,
                        briefX * SOURCE_CELLS_PER_BRIEF_CELL_X + dx,
                        briefY * SOURCE_CELLS_PER_BRIEF_CELL_Y + dy
                    )) solids += 1;
                }
            }
            if (solids === SOURCE_CELLS_PER_BRIEF_CELL_X * SOURCE_CELLS_PER_BRIEF_CELL_Y) return '#';
            return solids > 0 ? '+' : '.';
        })
    );
    const overlays: ReadonlyArray<readonly [number, number, string]> = [
        ...state.objective.objects.filter(object => object.status === 'active')
            .map(object => [object.xFp, object.yFp, object.kind === 'coin' ? 'o' : 'C'] as const),
        ...state.units.filter(candidate => candidate.alive)
            .map(candidate => [candidate.xFp, candidate.yFp, candidate.id === 'player' ? 'P' : 'L'] as const)
    ];
    for (const [xFp, yFp, marker] of overlays) {
        const x = Math.max(0, Math.min(BRIEF_WIDTH - 1, Math.floor(worldUnits(xFp) / 32)));
        const y = Math.max(0, Math.min(BRIEF_HEIGHT - 1, Math.floor(worldUnits(yFp) / 16)));
        rows[y][x] = '.#+'.includes(rows[y][x]) ? marker : '*';
    }
    const actors = state.units.map(candidate => Object.freeze({
        id: candidate.id,
        x: worldUnits(candidate.xFp),
        y: worldUnits(candidate.yFp),
        stitching: candidate.stitching,
        alive: candidate.alive,
        grounded: candidate.grounded,
        support: supportLabel(candidate.support, state.terrain.width)
    }));
    const objects = state.objective.objects.map(object => Object.freeze({
        id: object.id,
        kind: object.kind,
        owner: object.owner,
        x: worldUnits(object.xFp),
        y: worldUnits(object.yFp),
        status: object.status,
        support: supportLabel(object.support, state.terrain.width)
    }));
    const own = unit(state, 'loomkeeper');
    const player = unit(state, 'player');
    const activeTarget = targetFor(state, own.xFp, own.yFp);
    const relationships = [
        `player is ${horizontalRelation(player.xFp, own.xFp)} of loomkeeper`,
        `actors are ${worldUnits(Math.abs(player.xFp - own.xFp))} horizontal world units apart`,
        activeTarget
            ? `${activeTarget.id} is ${horizontalRelation(activeTarget.xFp, own.xFp)} of loomkeeper at Manhattan distance ${worldUnits(distanceTo(activeTarget, own.xFp, own.yFp))}`
            : 'no active objective target remains',
        ...state.objective.objects.filter(object => object.status === 'active')
            .map(object => `${object.id} support is ${supportLabel(object.support, state.terrain.width)}`)
    ];
    return Object.freeze({
        width: BRIEF_WIDTH,
        height: BRIEF_HEIGHT,
        ascii: rows.map(row => row.join('')).join('\n'),
        legend: Object.freeze({
            '.': 'empty', '#': 'solid terrain', '+': 'partially destroyed terrain',
            P: 'player', L: 'loomkeeper', o: 'coin', C: 'chest', '*': 'coarse-cell overlap; use structured positions'
        }),
        actors: Object.freeze(actors),
        objects: Object.freeze(objects),
        relationships: Object.freeze(relationships)
    });
}

function winningCondition(state: SimulationStateV10R8): string {
    if (state.objective.objectiveMode === 'collect') return 'Collect more coins than the player before all coins resolve or the turn limit.';
    if (state.objective.objectiveMode === 'defend') return 'Prevent the player chest from being captured while pursuing the player.';
    return 'Prevent the player from capturing the Loomkeeper chest.';
}

function targetFor(state: SimulationStateV10R8, xFp: number, yFp: number): V10R8ObjectiveObject | undefined {
    const active = state.objective.objects.filter(object => object.status === 'active');
    if (state.objective.objectiveMode !== 'collect') return active[0];
    return [...active].sort((left, right) =>
        distanceTo(left, xFp, yFp) - distanceTo(right, xFp, yFp) || left.id.localeCompare(right.id)
    )[0];
}

function distanceTo(object: V10R8ObjectiveObject, xFp: number, yFp: number): number {
    return Math.abs(object.xFp - xFp) + Math.abs(object.yFp - yFp);
}

function removedTerrainCells(
    before: Pick<SimulationStateV10R8, 'terrain'>,
    after: Pick<SimulationStateV9, 'terrain'>
): number {
    let removed = 0;
    for (let index = 0; index < before.terrain.words.length; index += 1) {
        const removedWord = (before.terrain.words[index] & ~after.terrain.words[index]) >>> 0;
        removed += popcount32(removedWord);
    }
    return removed;
}

function popcount32(value: number): number {
    let remaining = value >>> 0;
    remaining -= (remaining >>> 1) & 0x55555555;
    remaining = (remaining & 0x33333333) + ((remaining >>> 2) & 0x33333333);
    return (((remaining + (remaining >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function supportLabel(support: number | SimulationActor | null, terrainWidth: number): string {
    if (support === null) return 'airborne';
    if (typeof support === 'string') return `actor:${support}`;
    return `terrain:${support % terrainWidth},${Math.trunc(support / terrainWidth)}`;
}

function horizontalRelation(targetXFp: number, originXFp: number): 'left' | 'right' | 'aligned' {
    if (targetXFp < originXFp) return 'left';
    if (targetXFp > originXFp) return 'right';
    return 'aligned';
}

function unit<T extends { units: SimulationStateV9['units'] }>(state: T, actor: SimulationActor) {
    return state.units[actor === 'player' ? 0 : 1];
}

function worldUnits(valueFp: number): number {
    return Math.round(valueFp / FP);
}
