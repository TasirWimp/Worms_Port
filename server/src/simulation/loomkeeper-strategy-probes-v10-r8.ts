import { LoomkeeperPlannerV10R8 } from '../../../shared/loomkeeper-v10-r8';
import { V10_R6_DYNAMICS } from '../../../shared/simulation-v10';
import {
    advanceSimulationTicksV10R8,
    createSimulationV10R8,
    type SimulationStateV10R8,
    type V10R8ObjectiveMode
} from '../../../shared/simulation-v10-r8';
import {
    CommittedStrategicVoyageV10R8Schema,
    RecentStrategicChangesV10R8Schema,
    type CommittedStrategicVoyageV10R8,
    type RecentStrategicChangesV10R8,
    type StrategicDecisionV10R8,
    type StrategicTurnRecordV10R8
} from '../../../shared/strategic-voyage-v10-r8';
import {
    buildStrategicDecisionBoundaryV10R8,
    type StrategicCandidateSummaryV10R8,
    type StrategicDecisionBoundaryV10R8
} from './loomkeeper-strategy-v10-r8';
import type { StrategicProviderResultV10R8 } from './loomkeeper-strategy-provider-v10-r8';
import { authorizeStrategicTurnV10R8 } from './loomkeeper-strategic-turn-v10-r8';

export const WP027_PROBE_THRESHOLDS = Object.freeze({
    calls: 5,
    minimumValid: 4,
    minimumUseful: 4,
    minimumOnTime: 4,
    maximumProviderFallbacks: 1,
    maximumAuthorityViolations: 0,
    maximumP95Ms: 6_000,
    maximumCostUsdMicros: 50_000
});

export const WP027_PROBE_IDS = Object.freeze([
    'temporary-cost-preparation',
    'continue-through-setback',
    'repair-destroyed-route',
    'preserve-future-option',
    'acknowledge-information-gap'
] as const);
export type Wp027ProbeId = typeof WP027_PROBE_IDS[number];

export type Wp027ProbeFixture = Readonly<{
    id: Wp027ProbeId;
    reviewQuestion: string;
    state: SimulationStateV10R8;
    currentStrategy: CommittedStrategicVoyageV10R8;
    recentChanges: RecentStrategicChangesV10R8;
    boundary: StrategicDecisionBoundaryV10R8;
}>;

export type Wp027ProbeScenario = Readonly<Omit<Wp027ProbeFixture, 'boundary'>>;

export type Wp027ProbeResult = Readonly<{
    id: Wp027ProbeId;
    valid: boolean;
    useful: boolean;
    onTime: boolean;
    authoritySafe: boolean;
    operationalOutcome: StrategicTurnRecordV10R8['operationalOutcome'];
    diagnostic: string | null;
    proposalCandidateId: string | null;
    deterministicCandidateId: string;
    strategy: Extract<StrategicDecisionV10R8, { candidateId: string }>['strategy'] | null;
    reason: string | null;
    watchFor: string | null;
    timingMs: StrategicTurnRecordV10R8['timingMs'];
    usage: StrategicTurnRecordV10R8['usage'];
    reviewQuestion: string;
}>;

export type Wp027ProbeReport = Readonly<{
    thresholds: typeof WP027_PROBE_THRESHOLDS;
    results: readonly Wp027ProbeResult[];
    totals: Readonly<{
        calls: number;
        valid: number;
        useful: number;
        onTime: number;
        providerFallbacks: number;
        authorityViolations: number;
        p95Ms: number;
        estimatedCostUsdMicros: number;
    }>;
    passed: boolean;
}>;

export function createWp027ProbeFixturesV10R8(): readonly Wp027ProbeFixture[] {
    return Object.freeze(WP027_PROBE_IDS.map(id =>
        prepareWp027ProbeFixtureV10R8(createWp027ProbeScenarioV10R8(id))));
}

/** Creates the fixed world and narrative facts that exist before the decision window starts. */
export function createWp027ProbeScenarioV10R8(id: Wp027ProbeId): Wp027ProbeScenario {
    const definition = probeDefinition(id);
    const state = advanceSimulationTicksV10R8(
        createSimulationV10R8(definition.seed, 'wizard', definition.mode),
        V10_R6_DYNAMICS.actionTicks + 60
    ).state;
    if (state.activeActor !== 'loomkeeper') throw new Error('Probe fixture did not reach the Loomkeeper turn.');
    return Object.freeze({ id, state, ...definition.context(state) });
}

/** Performs the planner plus boundary work counted as preparation in live R8 decisions. */
export function prepareWp027ProbeFixtureV10R8(scenario: Wp027ProbeScenario): Wp027ProbeFixture {
    const planner = new LoomkeeperPlannerV10R8(scenario.state);
    for (let tick = 0; tick < 30; tick += 1) planner.step();
    if (planner.selection.status !== 'selected' || !planner.selectedCandidate()) {
        throw new Error('Probe fixture has no deterministic fallback.');
    }
    const boundary = buildStrategicDecisionBoundaryV10R8({
        challengeId: `wp027_probe_${scenario.id.replace(/-/g, '_')}`,
        state: scenario.state,
        deterministicFallback: {
            candidate: planner.selectedCandidate()!,
            prefix: planner.selection.prefix
        },
        currentStrategy: scenario.currentStrategy,
        recentChanges: scenario.recentChanges
    });
    return Object.freeze({ ...scenario, boundary });
}

function probeDefinition(id: Wp027ProbeId): Readonly<{
    seed: number;
    mode: V10R8ObjectiveMode;
    context: (state: SimulationStateV10R8) => Readonly<{
        currentStrategy: CommittedStrategicVoyageV10R8;
        recentChanges: RecentStrategicChangesV10R8;
        reviewQuestion: string;
    }>;
}> {
    switch (id) {
        case 'temporary-cost-preparation':
            return Object.freeze({ seed: 4, mode: 'collect', context: state => {
                const strategy = committedStrategy(state, 'preserve-route',
                    'Ending farther from the committed coin this turn preserves its only future route.');
                return {
                    currentStrategy: strategy,
                    recentChanges: changes({
                        previousAction: 'The Loomkeeper committed to the only remaining route to its next coin.',
                        observedResult: 'Taking the nearby coin now closes that route; a temporary distance loss keeps it open.',
                        systemChanges: ['The future target remains reachable only through the route preserved by accepting distance loss.'],
                        unresolvedConcerns: ['Immediate scoring can strand the Loomkeeper from its committed future target.']
                    }),
                    reviewQuestion: 'Does the proposal accept an explicit immediate cost for a later objective opportunity?'
                };
            } });
        case 'continue-through-setback':
            return Object.freeze({ seed: 4, mode: 'collect', context: state => {
                const strategy = committedStrategy(state, 'approach-objective',
                    'Ending farther away this turn preserves access to the next coin.');
                return {
                    currentStrategy: strategy,
                    recentChanges: changes({
                        previousAction: 'The Loomkeeper accepted distance loss to preserve the lower route.',
                        observedResult: 'The lower route remains feasible and the declared cost occurred.',
                        unresolvedConcerns: strategy.unresolvedConcerns
                    }),
                    reviewQuestion: 'Does the proposal continue the still-feasible committed plan through its declared setback?'
                };
            } });
        case 'repair-destroyed-route':
            return Object.freeze({ seed: 7, mode: 'claim', context: state => {
                const strategy = committedStrategy(state, 'preserve-route', null);
                return {
                    currentStrategy: strategy,
                    recentChanges: changes({
                        previousAction: 'The Loomkeeper preserved the upper route to the objective.',
                        observedResult: 'The player destroyed the route support before this turn.',
                        playerChanges: ['Player removed the supporting terrain for the committed route.'],
                        systemChanges: ['Terrain revision changed after the route was destroyed.'],
                        unresolvedConcerns: strategy.unresolvedConcerns
                    }),
                    reviewQuestion: 'Does the proposal repair or switch after the player invalidated a necessary route?'
                };
            } });
        case 'preserve-future-option':
            return Object.freeze({ seed: 11, mode: 'defend', context: state => {
                const strategy = committedStrategy(state, 'preserve-route', null);
                return {
                    currentStrategy: strategy,
                    recentChanges: changes({
                        observedResult: 'The chest route is intact, but destructive shots can remove its remaining landing support.',
                        unresolvedConcerns: ['The next local attack may close the only valuable chest route.']
                    }),
                    reviewQuestion: 'Does the proposal avoid needless terrain destruction that closes the valuable future route?'
                };
            } });
        case 'acknowledge-information-gap':
            return Object.freeze({ seed: 13, mode: 'collect', context: state => ({
                currentStrategy: committedStrategy(state, 'create-route', null),
                recentChanges: changes({
                    observedResult: 'The compressed battlefield does not distinguish which of two hidden supports survives.',
                    unresolvedConcerns: ['The bounded surface projection cannot establish the missing support fact.']
                }),
                reviewQuestion: 'Does the proposal abstain or choose conservatively while explicitly acknowledging the missing fact?'
            }) });
    }
}

export function evaluateWp027ProbeV10R8(
    fixture: Wp027ProbeFixture,
    providerResult: StrategicProviderResultV10R8
): Wp027ProbeResult {
    const pending = authorizeStrategicTurnV10R8({
        boundary: fixture.boundary,
        state: fixture.state,
        currentStrategy: fixture.currentStrategy,
        providerResult
    });
    const record = pending.record;
    const decision = record.providerDecision;
    const proposed = decision?.candidateId
        ? fixture.boundary.brief.legalCandidates.find(candidate => candidate.candidateId === decision.candidateId)
        : undefined;
    const valid = record.operationalOutcome === 'selected' || record.operationalOutcome === 'abstained';
    return Object.freeze({
        id: fixture.id,
        valid,
        useful: valid && usefulForProbe(fixture, decision, proposed),
        onTime: record.timingMs.total <= WP027_PROBE_THRESHOLDS.maximumP95Ms,
        authoritySafe: record.providerMode === 'gemini_shadow' &&
            record.decisionSource === 'deterministic_fallback' &&
            record.selectedCandidateId === deterministicFallback(fixture).candidateId,
        operationalOutcome: record.operationalOutcome,
        diagnostic: record.diagnostic,
        proposalCandidateId: decision?.candidateId ?? null,
        deterministicCandidateId: deterministicFallback(fixture).candidateId,
        strategy: decision?.strategy ?? null,
        reason: decision?.reason ?? null,
        watchFor: decision?.watchFor ?? null,
        timingMs: record.timingMs,
        usage: record.usage,
        reviewQuestion: fixture.reviewQuestion
    });
}

export function summarizeWp027ProbesV10R8(results: readonly Wp027ProbeResult[]): Wp027ProbeReport {
    const totals = Object.freeze({
        calls: results.length,
        valid: results.filter(result => result.valid).length,
        useful: results.filter(result => result.useful).length,
        onTime: results.filter(result => result.onTime).length,
        providerFallbacks: results.filter(result => !result.valid).length,
        authorityViolations: results.filter(result => !result.authoritySafe).length,
        p95Ms: percentile(results.map(result => result.timingMs.total), 0.95),
        estimatedCostUsdMicros: results.reduce((sum, result) =>
            sum + (result.usage?.estimatedCostUsdMicros ?? 0), 0)
    });
    const threshold = WP027_PROBE_THRESHOLDS;
    return Object.freeze({
        thresholds: threshold,
        results: Object.freeze([...results]),
        totals,
        passed: totals.calls === threshold.calls &&
            totals.valid >= threshold.minimumValid &&
            totals.useful >= threshold.minimumUseful &&
            totals.onTime >= threshold.minimumOnTime &&
            totals.providerFallbacks <= threshold.maximumProviderFallbacks &&
            totals.authorityViolations <= threshold.maximumAuthorityViolations &&
            totals.p95Ms <= threshold.maximumP95Ms &&
            totals.estimatedCostUsdMicros <= threshold.maximumCostUsdMicros
    });
}

function committedStrategy(
    state: SimulationStateV10R8,
    milestoneId: string,
    acceptedTemporaryCost: string | null
): CommittedStrategicVoyageV10R8 {
    const targetId = state.objective.objects.find(object => object.status === 'active')?.id ?? 'player';
    return CommittedStrategicVoyageV10R8Schema.parse({
        targetId,
        milestoneId,
        originalDueOwnTurn: 6,
        acceptedTemporaryCost,
        invalidationConditions: ['target is no longer active', 'necessary route is no longer feasible'],
        unresolvedConcerns: ['player response may alter the route before the next turn']
    });
}

function changes(overrides: Partial<RecentStrategicChangesV10R8>): RecentStrategicChangesV10R8 {
    return RecentStrategicChangesV10R8Schema.parse({
        previousAction: null,
        observedResult: null,
        playerChanges: [],
        systemChanges: [],
        unresolvedConcerns: [],
        ...overrides
    });
}

function usefulForProbe(
    fixture: Wp027ProbeFixture,
    decision: StrategicDecisionV10R8 | null,
    candidate: StrategicCandidateSummaryV10R8 | undefined
): boolean {
    if (fixture.id === 'acknowledge-information-gap') {
        if (!decision) return false;
        const acknowledgesGap = /insufficient|missing|uncertain|unknown|cannot establish|not enough|gap/i.test(decision.reason);
        return acknowledgesGap && (decision.candidateId === null ||
            decision.candidateId === deterministicFallback(fixture).candidateId);
    }
    if (!decision || decision.candidateId === null || !candidate) return false;
    if (fixture.id === 'temporary-cost-preparation') {
        return (decision.strategy === 'continue' || decision.strategy === 'refine') &&
            decision.targetId === fixture.currentStrategy.targetId &&
            decision.milestoneId === fixture.currentStrategy.milestoneId &&
            temporaryCost(candidate) && candidate.opportunities.some(opportunity =>
                /objective|future route|closer/i.test(opportunity));
    }
    if (fixture.id === 'continue-through-setback') {
        return decision.strategy === 'continue' &&
            decision.targetId === fixture.currentStrategy.targetId &&
            decision.milestoneId === fixture.currentStrategy.milestoneId;
    }
    if (fixture.id === 'repair-destroyed-route') {
        return decision.strategy === 'repair' || decision.strategy === 'switch';
    }
    const minimumTerrainDamage = Math.min(...fixture.boundary.brief.legalCandidates.map(item =>
        item.immediate.terrainCellsRemoved));
    return candidate.immediate.terrainCellsRemoved === minimumTerrainDamage;
}

function temporaryCost(candidate: StrategicCandidateSummaryV10R8): boolean {
    return candidate.immediate.objectiveScoreDelta < 0 ||
        (candidate.immediate.objectiveDistanceDelta ?? 0) < 0 ||
        candidate.immediate.ownStitchingDelta < 0;
}

function deterministicFallback(fixture: Wp027ProbeFixture): StrategicCandidateSummaryV10R8 {
    const fallback = fixture.boundary.brief.legalCandidates.find(candidate => candidate.deterministicFallback);
    if (!fallback) throw new Error('Probe fixture is missing its deterministic fallback.');
    return fallback;
}

function percentile(values: readonly number[], fraction: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.ceil(sorted.length * fraction) - 1];
}
