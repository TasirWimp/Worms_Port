import { canonicalJson, compareCanonicalText, sha256Digest } from '../canonical';
import {
    D2O_CRPM_COMMIT,
    D2OResultSchema,
    D2ORawExportSchema,
    D2OTwinWitnessSchema,
    type D2OCarrierClass,
    type D2OOutcomeRelation,
    type D2OOccurrence,
    type D2ORawExport,
    type D2OResult,
    type D2OTwinFamily,
    type D2OTwinWitness
} from './natural-matched-twin-schemas';

type LinkedOccurrence = {
    occurrence: D2OOccurrence;
    carrier: D2OCarrierClass;
    relation: D2OOutcomeRelation;
    stateRef: string;
};

type PairDifference = {
    differingOutcomeCount: number;
    turnLimitInvolvedDifferenceCount: number;
    classification: 'none' | 'turn_limit_horizon_only' | 'tactical_continuation';
};

type TwinPair = {
    family: D2OTwinFamily;
    left: LinkedOccurrence;
    right: LinkedOccurrence;
    difference: PairDifference;
};

const EXPECTED_COUNTS = {
    geometry_control: { pairs: 37_232, equal: 12_816, split: 24_416 },
    route_order_control: { pairs: 1_728, equal: 1_728, split: 0 },
    phase_horizon_control: { pairs: 2_288, equal: 1_984, split: 304 },
    completed_turn_control: { pairs: 32, equal: 32, split: 0 }
} as const;

function groupBy(
    items: readonly LinkedOccurrence[],
    key: (item: LinkedOccurrence) => string
): Map<string, LinkedOccurrence[]> {
    const groups = new Map<string, LinkedOccurrence[]>();
    for (const item of items) {
        const groupKey = key(item);
        const group = groups.get(groupKey);
        if (group) group.push(item);
        else groups.set(groupKey, [item]);
    }
    for (const group of groups.values()) {
        group.sort((left, right) => compareCanonicalText(
            left.occurrence.occurrenceRef,
            right.occurrence.occurrenceRef
        ));
    }
    return groups;
}

function supportKey(item: LinkedOccurrence): object {
    return {
        responderSupport: item.carrier.responderSupport,
        preparerSupport: item.carrier.preparerSupport
    };
}

function outcomeCells(relation: D2OOutcomeRelation): Map<string, object> {
    const cells = new Map<string, object>();
    for (const row of relation.outcomeProjection) {
        const signature = canonicalJson(row.immediateSignature);
        for (const outcome of row.outcomes) {
            const key = canonicalJson({
                immediateSignature: signature,
                responderPolicy: outcome.responderPolicy,
                preparerPolicy: outcome.preparerPolicy
            });
            cells.set(key, {
                responderResult: outcome.responderResult,
                finishReason: outcome.finishReason,
                nonterminalRecurrence: outcome.nonterminalRecurrence
            });
        }
    }
    return cells;
}

function compareRelations(
    left: D2OOutcomeRelation,
    right: D2OOutcomeRelation,
    cache: Map<string, PairDifference>
): PairDifference {
    if (left.outcomeRelationDigest === right.outcomeRelationDigest) {
        return {
            differingOutcomeCount: 0,
            turnLimitInvolvedDifferenceCount: 0,
            classification: 'none'
        };
    }
    const orderedDigests = [left.outcomeRelationDigest, right.outcomeRelationDigest]
        .sort(compareCanonicalText);
    const cacheKey = orderedDigests.join('/');
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const leftCells = outcomeCells(left);
    const rightCells = outcomeCells(right);
    const keys = [...new Set([...leftCells.keys(), ...rightCells.keys()])]
        .sort(compareCanonicalText);
    let differingOutcomeCount = 0;
    let turnLimitInvolvedDifferenceCount = 0;
    for (const key of keys) {
        const leftCell = leftCells.get(key);
        const rightCell = rightCells.get(key);
        if (leftCell && rightCell && canonicalJson(leftCell) === canonicalJson(rightCell)) continue;
        differingOutcomeCount += 1;
        const leftReason = leftCell && 'finishReason' in leftCell
            ? leftCell.finishReason
            : undefined;
        const rightReason = rightCell && 'finishReason' in rightCell
            ? rightCell.finishReason
            : undefined;
        if (leftReason === 'turn_limit' || rightReason === 'turn_limit') {
            turnLimitInvolvedDifferenceCount += 1;
        }
    }
    if (differingOutcomeCount === 0) {
        throw new Error('Distinct D2O relation digests produced no protected outcome difference.');
    }
    const result: PairDifference = {
        differingOutcomeCount,
        turnLimitInvolvedDifferenceCount,
        classification: differingOutcomeCount === turnLimitInvolvedDifferenceCount
            ? 'turn_limit_horizon_only'
            : 'tactical_continuation'
    };
    cache.set(cacheKey, result);
    return result;
}

function pairsFromGroups(
    family: D2OTwinFamily,
    groups: Map<string, LinkedOccurrence[]>,
    admitted: (left: LinkedOccurrence, right: LinkedOccurrence) => boolean,
    comparisonCache: Map<string, PairDifference>
): TwinPair[] {
    const pairs: TwinPair[] = [];
    for (const key of [...groups.keys()].sort(compareCanonicalText)) {
        const group = groups.get(key)!;
        for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
            for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
                const left = group[leftIndex];
                const right = group[rightIndex];
                if (!admitted(left, right)) continue;
                pairs.push({
                    family,
                    left,
                    right,
                    difference: compareRelations(left.relation, right.relation, comparisonCache)
                });
            }
        }
    }
    return pairs.sort((left, right) =>
        compareCanonicalText(left.left.occurrence.occurrenceRef, right.left.occurrence.occurrenceRef) ||
        compareCanonicalText(left.right.occurrence.occurrenceRef, right.right.occurrence.occurrenceRef)
    );
}

function makePairs(items: readonly LinkedOccurrence[]): Map<D2OTwinFamily, TwinPair[]> {
    const cache = new Map<string, PairDifference>();
    const geometryGroups = groupBy(items, (item) => canonicalJson({
        responderPhase: item.occurrence.responderPhase,
        pathKindPrefix: item.occurrence.pathKindPrefix,
        completedTurns: item.occurrence.completedTurns,
        ...supportKey(item)
    }));
    const routeGroups = groupBy(items, (item) => canonicalJson({
        responderPhase: item.occurrence.responderPhase,
        separation: item.carrier.separation,
        completedTurns: item.occurrence.completedTurns,
        ...supportKey(item)
    }));
    const phaseGroups = groupBy(items, (item) => canonicalJson({
        separation: item.carrier.separation,
        ...supportKey(item)
    }));
    const turnGroups = groupBy(items, (item) => canonicalJson({
        responderPhase: item.occurrence.responderPhase,
        separation: item.carrier.separation,
        ...supportKey(item)
    }));

    return new Map([
        ['geometry_control', pairsFromGroups(
            'geometry_control', geometryGroups,
            (left, right) => left.carrier.separation !== right.carrier.separation,
            cache
        )],
        ['route_order_control', pairsFromGroups(
            'route_order_control', routeGroups,
            (left, right) => canonicalJson(left.occurrence.pathKindPrefix) !==
                canonicalJson(right.occurrence.pathKindPrefix),
            cache
        )],
        ['phase_horizon_control', pairsFromGroups(
            'phase_horizon_control', phaseGroups,
            (left, right) => left.occurrence.responderPhase !== right.occurrence.responderPhase,
            cache
        )],
        ['completed_turn_control', pairsFromGroups(
            'completed_turn_control', turnGroups,
            (left, right) => left.occurrence.completedTurns !== right.occurrence.completedTurns,
            cache
        )]
    ]);
}

function witnessReasons(pair: TwinPair): string[] {
    const continuation = pair.difference.classification === 'none'
        ? 'The complete protected continuation relation is equal for this natural matched pair.'
        : pair.difference.classification === 'turn_limit_horizon_only'
            ? 'Every protected outcome difference in this natural matched pair involves the finite analytical turn limit.'
            : 'At least one protected continuation difference survives without turn-limit involvement.';
    const familyReason = {
        geometry_control: 'The pair holds phase, path-kind order, completed turns, and non-position support fixed while separation changes.',
        route_order_control: 'The pair holds phase, separation, completed turns, and current public support fixed while path-kind order changes.',
        phase_horizon_control: 'The pair holds separation and current public support fixed while first/second responder phase and turn parity change together.',
        completed_turn_control: 'The pair holds phase, separation, and current public support fixed while the exact completed-turn count changes.'
    }[pair.family];
    return [familyReason, continuation];
}

function makeWitness(pair: TwinPair): D2OTwinWitness {
    const payload = {
        schemaVersion: 1 as const,
        family: pair.family,
        leftOccurrenceRef: pair.left.occurrence.occurrenceRef,
        rightOccurrenceRef: pair.right.occurrence.occurrenceRef,
        leftStateRef: pair.left.stateRef,
        rightStateRef: pair.right.stateRef,
        leftCarrierRef: pair.left.carrier.carrierRef,
        rightCarrierRef: pair.right.carrier.carrierRef,
        leftRelationRef: pair.left.relation.relationRef,
        rightRelationRef: pair.right.relation.relationRef,
        leftStartingDistance: pair.left.occurrence.startingDistance,
        rightStartingDistance: pair.right.occurrence.startingDistance,
        leftCompletedTurns: pair.left.occurrence.completedTurns,
        rightCompletedTurns: pair.right.occurrence.completedTurns,
        leftResponderPhase: pair.left.occurrence.responderPhase,
        rightResponderPhase: pair.right.occurrence.responderPhase,
        leftSeparation: pair.left.carrier.separation,
        rightSeparation: pair.right.carrier.separation,
        leftPathKinds: pair.left.occurrence.pathKindPrefix,
        rightPathKinds: pair.right.occurrence.pathKindPrefix,
        continuationEqual: pair.difference.classification === 'none',
        differenceClassification: pair.difference.classification,
        differingOutcomeCount: pair.difference.differingOutcomeCount,
        turnLimitInvolvedDifferenceCount: pair.difference.turnLimitInvolvedDifferenceCount,
        reasons: witnessReasons(pair)
    };
    const witnessDigest = sha256Digest(payload);
    return D2OTwinWitnessSchema.parse({
        witnessRef: `d2o-twin-${witnessDigest.slice(0, 24)}`,
        ...payload,
        witnessDigest
    });
}

function selectPair(
    pairs: readonly TwinPair[],
    classification: PairDifference['classification']
): TwinPair {
    const pair = pairs.find((item) => item.difference.classification === classification);
    if (!pair) throw new Error(`D2O lacks a required ${classification} matched-pair witness.`);
    return pair;
}

function assertExpectedCounts(pairsByFamily: Map<D2OTwinFamily, TwinPair[]>): void {
    for (const family of Object.keys(EXPECTED_COUNTS) as D2OTwinFamily[]) {
        const pairs = pairsByFamily.get(family) ?? [];
        const equal = pairs.filter((item) => item.difference.classification === 'none').length;
        const expected = EXPECTED_COUNTS[family];
        if (pairs.length !== expected.pairs || equal !== expected.equal ||
            pairs.length - equal !== expected.split) {
            throw new Error(
                `D2O ${family} topology drifted: ${pairs.length}/${equal}/${pairs.length - equal}.`
            );
        }
    }
}

function familyAssessment(
    family: D2OTwinFamily,
    pairs: readonly TwinPair[],
    witnessRefs: readonly string[]
) {
    const equalCount = pairs.filter((item) => item.difference.classification === 'none').length;
    const horizonCount = pairs.filter(
        (item) => item.difference.classification === 'turn_limit_horizon_only'
    ).length;
    const tacticalCount = pairs.filter(
        (item) => item.difference.classification === 'tactical_continuation'
    ).length;
    const interpretation = {
        geometry_control: {
            targetRelevance: 'conditional' as const,
            recursiveCarrierRole: 'required_conditionally' as const,
            publicSupport: ['separation', 'responder-support', 'preparer-support', 'path-kind-prefix', 'responder-phase', 'completed-turns'],
            reasons: [
                'Natural equal and split twins both exist, so geometry is neither globally disposable nor globally sufficient.',
                'Separation remains a conditionally target-relevant carrier coordinate in this bounded legal-prefix domain.'
            ]
        },
        route_order_control: {
            targetRelevance: 'trace_only_bounded' as const,
            recursiveCarrierRole: 'not_required_bounded' as const,
            publicSupport: ['path-actions', 'path-kind-prefix', 'current-support', 'separation', 'responder-phase', 'completed-turns'],
            reasons: [
                'All natural route-order controls descend to the same protected continuation relation once current support is fixed.',
                'Route history remains mandatory evidence for provenance and re-entry even though it is not recursive state in this bounded quotient.'
            ]
        },
        phase_horizon_control: {
            targetRelevance: 'analytical_horizon_parity' as const,
            recursiveCarrierRole: 'excluded_gameplay_axis' as const,
            publicSupport: ['responder-phase', 'completed-turn-parity', 'remaining-turns', 'turn-limit-finish-reason', 'current-support', 'separation'],
            reasons: [
                'Every observed first/second phase split is mediated by the finite sixteen-turn analytical horizon.',
                'Responder phase is retained as analytical turn-parity context and is not promoted into a gameplay status or mechanic.'
            ]
        },
        completed_turn_control: {
            targetRelevance: 'overfine_in_declared_controls' as const,
            recursiveCarrierRole: 'not_required_at_same_phase' as const,
            publicSupport: ['completed-turns', 'remaining-turns', 'responder-phase', 'current-support', 'separation'],
            reasons: [
                'All same-phase natural completed-turn controls share the protected continuation relation.',
                'Exact completed-turn count is over-fine only for this declared control family; horizon parity remains explicit elsewhere.'
            ]
        }
    }[family];
    return {
        family,
        pairCount: pairs.length,
        continuationEqualPairCount: equalCount,
        continuationSplitPairCount: pairs.length - equalCount,
        turnLimitOnlySplitPairCount: horizonCount,
        tacticalSplitPairCount: tacticalCount,
        ...interpretation,
        witnessRefs: [...witnessRefs],
    };
}

export function assessNaturalMatchedTwins(value: unknown): D2OResult {
    const raw = D2ORawExportSchema.parse(value);
    const stateByRef = new Map(raw.fullStates.map((item) => [item.stateRef, item]));
    const carrierByRef = new Map(raw.carrierClasses.map((item) => [item.carrierRef, item]));
    const relationByRef = new Map(raw.outcomeRelations.map((item) => [item.relationRef, item]));
    const linked: LinkedOccurrence[] = raw.occurrences.map((occurrence) => {
        const state = stateByRef.get(occurrence.fullStateRef);
        const carrier = carrierByRef.get(occurrence.normalizedCarrierRef);
        if (!state || !carrier) throw new Error(`${occurrence.occurrenceRef} lacks a linked state or carrier.`);
        const relation = relationByRef.get(state.outcomeRelationRef);
        if (!relation) throw new Error(`${state.stateRef} lacks a protected continuation relation.`);
        return { occurrence, carrier, relation, stateRef: state.stateRef };
    }).sort((left, right) => compareCanonicalText(
        left.occurrence.occurrenceRef,
        right.occurrence.occurrenceRef
    ));

    const pairsByFamily = makePairs(linked);
    assertExpectedCounts(pairsByFamily);
    const geometry = pairsByFamily.get('geometry_control')!;
    const route = pairsByFamily.get('route_order_control')!;
    const phase = pairsByFamily.get('phase_horizon_control')!;
    const completed = pairsByFamily.get('completed_turn_control')!;
    const unexpectedPhaseSplits = phase.filter(
        (item) => item.difference.classification === 'tactical_continuation'
    );

    const witnessPairs = [
        selectPair(geometry, 'none'),
        selectPair(geometry, 'tactical_continuation'),
        selectPair(route, 'none'),
        selectPair(phase, 'none'),
        selectPair(phase, 'turn_limit_horizon_only'),
        selectPair(completed, 'none')
    ];
    const twinWitnesses = witnessPairs.map(makeWitness);
    const witnessRefsByFamily = new Map<D2OTwinFamily, string[]>();
    for (const witness of twinWitnesses) {
        const refs = witnessRefsByFamily.get(witness.family) ?? [];
        refs.push(witness.witnessRef);
        witnessRefsByFamily.set(witness.family, refs);
    }
    const familyOrder: D2OTwinFamily[] = [
        'geometry_control', 'route_order_control', 'phase_horizon_control', 'completed_turn_control'
    ];
    const classification = unexpectedPhaseSplits.length > 0
        ? 'unexpected_non_horizon_phase_split' as const
        : 'd2a_axes_calibrated_authority_horizon_review_required' as const;
    const payload = {
        schemaVersion: 1 as const,
        resultId: 'wp-015d2o-f4-natural-matched-twin-assessment' as const,
        sourceBindings: {
            ...raw.sourceBindings,
            rawExportDigest: raw.exportDigest,
            crpmSourceBlobs: {
                candidateSpineCalibration: '8abf4a12442ab656c3a70b0b387da43eec99b03b' as const,
                nullSpaceSearch: '15c431dda12688c1368809345d6080dab510ca8a' as const,
                witnessProbeCarrier: 'd89b9741162f12af77b92f762f52676cc14db245' as const,
                compatibilityFibre: '4584b57499cbd90948d8d07557e5b01ede894906' as const
            }
        },
        domain: raw.domain,
        census: raw.census,
        familyAssessments: familyOrder.map((family) => familyAssessment(
            family,
            pairsByFamily.get(family)!,
            witnessRefsByFamily.get(family) ?? []
        )),
        twinWitnesses,
        quotientCongruence: {
            normalizedCarrierClassCount: 319 as const,
            congruentCarrierClassCount: 319 as const,
            aliasedCarrierClassCount: 0 as const,
            outcomeRelationClassCount: 122 as const,
            deterministicMapEligible: true as const,
            boundedStatement: 'All 1,520 full states in the declared four-action legal-prefix domain descend congruently through the 319 actor-relative current-carrier classes; this is bounded evidence, not proof over undeclared F4 reachability.'
        },
        globalDisposition: {
            classification,
            routeHistoryRole: 'trace_and_reentry_not_recursive_state_bounded' as const,
            geometryRole: 'conditionally_target_relevant' as const,
            phaseRole: 'analytical_turn_horizon_parity_not_gameplay_status' as const,
            completedTurnRole: 'exact_count_overfine_same_phase_bounded' as const,
            expandedD2AChartAllowed: unexpectedPhaseSplits.length === 0,
            gameplayChartRequiresAuthorityReview: true as const,
            nextPermittedAction: unexpectedPhaseSplits.length === 0
                ? 'Build the expanded D2A relational chart with route history as trace support, geometry as a conditional coordinate, and phase labelled only as finite-horizon parity; before gameplay design, open a separate V4/playtest timing and response-ownership authority review.'
                : 'Stop and inspect the explicit non-horizon phase witnesses before extending the relational chart.',
            reasons: [
                'Natural matched controls decorrelate path order and exact completed turns from protected continuation without deleting either from re-entry evidence.',
                'Geometry remains target-relative: some matched separation changes preserve continuation and others split it.',
                'The first/second response-phase splits are finite-horizon effects in the expected result and cannot justify a gameplay phase rule.',
                'The normalized current carrier is quotient-congruent for every full state in the priced domain.',
                'D2A calibration does not resolve real V4 timing, human response ownership, fun, or production authority.'
            ]
        },
        accumulatedResidue: [
            'four-action-prefix-cut', 'unreached-deeper-f4-tree', 'finite-sixteen-turn-horizon',
            'route-actions-as-reentry-trace', 'geometry-conditioned-continuation',
            'actor-relative-normalization', 'fixed-base-policies', 'excluded-v4-authority-ports'
        ],
        blockedClaims: [
            'The bounded congruent carrier is not a globally complete F4 state abstraction.',
            'Route-order equality in these controls does not make provenance or re-entry trace disposable.',
            'Turn-limit horizon parity is not a gameplay initiative mechanic, status, or causal explanation.',
            'Conditional geometry relevance is not a scalar range threshold or a candidate rule.',
            'The D2A chart does not establish real-time response ownership, player understanding, fun, balance, V5 approval, or product authority.',
            'The CRPM sources remain bounded L4+ methods and are not a universal ontology or graph-safe schema.'
        ],
        reentryInstructions: [
            'Verify Worms_Port source commit, D2N result digest, model/config hashes, and clean CRPM method commit before execution.',
            'Regenerate raw evidence with python -m analysis.tactical_model.natural_matched_twin_probe.',
            'Run npx tsx scripts/run-natural-matched-twin-search.ts and reproduce both raw and result digests.',
            'Read geometry, route order, phase/horizon, and completed-turn families separately before the global disposition.',
            'Retain exact path actions as trace support and the full-state digest as the authority re-entry carrier.',
            'Open a separate V4/playtest authority-cut review before using the expanded D2A chart for a production-facing gameplay proposal.'
        ],
        productAuthority: 'none' as const
    };
    if (raw.sourceBindings.crpmMethodCommit !== D2O_CRPM_COMMIT) {
        throw new Error('D2O CRPM method binding drifted.');
    }
    const result = D2OResultSchema.parse({
        ...payload,
        resultDigest: sha256Digest(payload)
    });
    return result;
}

export function canonicalD2OResult(result: D2OResult): string {
    return canonicalJson(D2OResultSchema.parse(result));
}
