import { canonicalJson, compareCanonicalText, sha256Digest } from '../canonical';
import type { D2IResult } from './cocoon-voyage-schemas';
import type {
    D2KCarrier,
    D2KCarrierAssessment,
    D2KRawExport,
    D2KResult,
    D2KVoyage
} from './policy-choice-schemas';
import type { D2LResult } from './policy-transport-schemas';
import {
    D2MAliasingWitnessSchema,
    D2M_CONFIG_SHA256,
    D2M_CRPM_COMMIT,
    D2M_D2I_RESULT_DIGEST,
    D2M_D2K_RAW_DIGEST,
    D2M_D2K_RESULT_DIGEST,
    D2M_D2L_RAW_DIGEST,
    D2M_D2L_RESULT_DIGEST,
    D2MInputBundleSchema,
    D2MLocalChartSchema,
    D2M_MODEL_SHA256,
    D2MOverlapSchema,
    D2MResultSchema,
    D2MSourceBindingsSchema,
    type D2MInputBundle,
    type D2MLocalChart,
    type D2MOverlap,
    type D2MResult
} from './tactical-order-atlas-schemas';

type Actor = 'player' | 'loomkeeper';
type Distance = 639 | 640 | 641;
type CycleIndex = 1 | 2;

const DISTANCES: readonly Distance[] = [639, 640, 641];
const CYCLES: readonly CycleIndex[] = [1, 2];
const EXPECTED_RESPONSE_KINDS = [
    'counter_preparation', 'needlepoint', 'paid_unweave', 'relocate', 'threadball'
] as const;

function uniqueSorted(values: readonly string[]): string[] {
    return [...new Set(values)].sort(compareCanonicalText);
}

function actorState(carrier: D2KCarrier['sourceCarrier'], actor: Actor) {
    return actor === 'player' ? carrier.player : carrier.loomkeeper;
}

function responseSignature(summary: D2KCarrierAssessment['responseSummaries'][number]) {
    const { responderXDelta: _responderX, preparerXDelta: _preparerX, ...relativeResidue } =
        summary.immediateResidue;
    return {
        responseKind: summary.responseKind,
        immediateResidue: relativeResidue
    };
}

function normalizedImmediateRelation(
    carrier: D2KCarrier,
    assessment: D2KCarrierAssessment
) {
    const responder = actorState(carrier.sourceCarrier, carrier.responder);
    const preparer = actorState(carrier.sourceCarrier, carrier.preparer);
    const responseByAction = new Map(assessment.responseSummaries.map((item) => [item.actionKey, item]));
    const support = {
        cycleIndex: carrier.cycleIndex,
        responder: {
            stitching: responder.stitching,
            escapeSlack: responder.escapeSlack,
            preparation: responder.spoolburstPreparationTurns,
            cocoon: responder.spoolburstCocoonHits,
            seamPinTurns: responder.seamPinTurns,
            seamPinCooldown: responder.seamPinCooldown
        },
        preparer: {
            stitching: preparer.stitching,
            escapeSlack: preparer.escapeSlack,
            preparation: preparer.spoolburstPreparationTurns,
            cocoon: preparer.spoolburstCocoonHits,
            seamPinTurns: preparer.seamPinTurns,
            seamPinCooldown: preparer.seamPinCooldown
        },
        responses: assessment.responseSummaries.map(responseSignature).sort((left, right) =>
            compareCanonicalText(canonicalJson(left), canonicalJson(right))
        )
    };
    const policySelections = carrier.policySelections.map((selection) => {
        const response = responseByAction.get(selection.selectedActionKey);
        if (!response) throw new Error(`${carrier.carrierRef} has a detached policy selection.`);
        return { policy: selection.policy, response: responseSignature(response) };
    }).sort((left, right) => compareCanonicalText(left.policy, right.policy));
    return { support, policySelections };
}

function normalizedContinuationRelation(
    carrier: D2KCarrier,
    assessment: D2KCarrierAssessment,
    voyages: readonly D2KVoyage[]
) {
    return assessment.responseSummaries.map((summary) => ({
        ...responseSignature(summary),
        responderWinCount: summary.responderWinCount,
        preparerWinCount: summary.preparerWinCount,
        drawCount: summary.drawCount,
        recurrenceCount: summary.recurrenceCount,
        actorRelativeTerminalVector: voyages
            .filter((voyage) =>
                voyage.carrierRef === carrier.carrierRef && voyage.responseRef === summary.responseRef
            )
            .map((voyage) => ({
                responderPolicy: carrier.responder === 'player'
                    ? voyage.playerContinuationPolicy
                    : voyage.loomkeeperContinuationPolicy,
                preparerPolicy: carrier.preparer === 'player'
                    ? voyage.playerContinuationPolicy
                    : voyage.loomkeeperContinuationPolicy,
                result: voyage.responderResult
            }))
            .sort((left, right) =>
                compareCanonicalText(left.responderPolicy, right.responderPolicy) ||
                compareCanonicalText(left.preparerPolicy, right.preparerPolicy)
            )
    })).sort((left, right) => compareCanonicalText(canonicalJson(left), canonicalJson(right)));
}

function assertParentBindings(bundle: D2MInputBundle): void {
    if (bundle.d2iResult.resultDigest !== D2M_D2I_RESULT_DIGEST ||
        bundle.d2kRaw.exportDigest !== D2M_D2K_RAW_DIGEST ||
        bundle.d2kResult.resultDigest !== D2M_D2K_RESULT_DIGEST ||
        bundle.d2kResult.rawExportDigest !== bundle.d2kRaw.exportDigest ||
        bundle.d2lResult.rawExportDigest !== D2M_D2L_RAW_DIGEST ||
        bundle.d2lResult.resultDigest !== D2M_D2L_RESULT_DIGEST) {
        throw new Error('D2M parent result or raw-export digest drifted.');
    }
    if (bundle.d2kRaw.sourceBindings.crpmMethodCommit !== D2M_CRPM_COMMIT ||
        bundle.d2kRaw.sourceBindings.modelSha256 !== D2M_MODEL_SHA256 ||
        bundle.d2kRaw.sourceBindings.configSha256 !== D2M_CONFIG_SHA256 ||
        bundle.d2lResult.sourceBindings.crpmMethodCommit !== D2M_CRPM_COMMIT ||
        bundle.d2lResult.sourceBindings.modelSha256 !== D2M_MODEL_SHA256 ||
        bundle.d2lResult.sourceBindings.configSha256 !== D2M_CONFIG_SHA256) {
        throw new Error('D2M model, config, or CRPM method binding drifted.');
    }
}

function makeChart(
    raw: D2KRawExport,
    result: D2KResult,
    startingDistance: Distance,
    cycleIndex: CycleIndex
): D2MLocalChart {
    const carriers = raw.carriers.filter((item) =>
        item.startingDistance === startingDistance && item.cycleIndex === cycleIndex
    );
    if (carriers.length !== 4) {
        throw new Error(`D2M chart ${startingDistance}/${cycleIndex} lacks four orientation replicas.`);
    }
    const assessmentByRef = new Map(result.carrierAssessments.map((item) => [item.carrierRef, item]));
    const assessments = carriers.map((carrier) => {
        const assessment = assessmentByRef.get(carrier.carrierRef);
        if (!assessment) throw new Error(`${carrier.carrierRef} lacks a D2K assessment.`);
        return assessment;
    });
    if (new Set(assessments.map((item) => item.responderPhase)).size !== 1) {
        throw new Error(`D2M chart ${startingDistance}/${cycleIndex} has mixed responder phases.`);
    }
    const immediateDigestsByCarrier = carriers.map((carrier, index) =>
        sha256Digest(normalizedImmediateRelation(carrier, assessments[index]).support)
    );
    const policyDigestsByCarrier = carriers.map((carrier, index) =>
        sha256Digest(normalizedImmediateRelation(carrier, assessments[index]).policySelections)
    );
    const continuationDigestsByCarrier = carriers.map((carrier, index) =>
        sha256Digest(normalizedContinuationRelation(carrier, assessments[index], raw.voyages))
    );
    const immediateRelationDigests = uniqueSorted(immediateDigestsByCarrier);
    const policySelectionDigests = uniqueSorted(policyDigestsByCarrier);
    const continuationRelationDigests = uniqueSorted(continuationDigestsByCarrier);
    const selectedResponseKinds = uniqueSorted(assessments.flatMap((assessment, index) => {
        const responseByAction = new Map(assessment.responseSummaries.map((item) => [item.actionKey, item]));
        return carriers[index].policySelections.map((selection) => {
            const response = responseByAction.get(selection.selectedActionKey);
            if (!response) throw new Error(`${carriers[index].carrierRef} selection lacks a response summary.`);
            return response.responseKind;
        });
    }));
    if (canonicalJson(selectedResponseKinds) !== canonicalJson(EXPECTED_RESPONSE_KINDS)) {
        throw new Error(`D2M chart ${startingDistance}/${cycleIndex} lost the five selected response families.`);
    }
    const localVoyages = raw.voyages.filter((voyage) =>
        carriers.some((carrier) => carrier.carrierRef === voyage.carrierRef)
    );
    if (localVoyages.length !== 1000) {
        throw new Error(`D2M chart ${startingDistance}/${cycleIndex} lacks 1,000 forced continuations.`);
    }
    const legalCompatible = immediateRelationDigests.length === 1;
    const policyCompatible = policySelectionDigests.length === 1;
    const continuationCompatible = continuationRelationDigests.length === 1;
    const payload = {
        schemaVersion: 1 as const,
        startingDistance,
        cycleIndex,
        responderPhase: assessments[0].responderPhase,
        orientationReplicaCount: 4 as const,
        representativeCarrierRef: carriers[0].carrierRef,
        representativeSourceCarrierDigest: carriers[0].sourceCarrierDigest,
        representativeImmediateRelationDigest: immediateDigestsByCarrier[0],
        representativePolicySelectionDigest: policyDigestsByCarrier[0],
        representativeContinuationRelationDigest: continuationDigestsByCarrier[0],
        carrierRefs: carriers.map((item) => item.carrierRef).sort(compareCanonicalText),
        sourceCarrierDigests: carriers.map((item) => item.sourceCarrierDigest).sort(compareCanonicalText),
        carrierAssessmentDigests: assessments.map((item) => item.carrierAssessmentDigest).sort(compareCanonicalText),
        exactCarrierClassCount: new Set(carriers.map((item) => item.sourceCarrierDigest)).size,
        legalActionCountPerCarrier: 10 as const,
        selectedResponseKindCountPerCarrier: 5 as const,
        selectedResponseKinds,
        immediateRelationDigests,
        policySelectionDigests,
        continuationRelationDigests,
        legalResponseOrientationCompatible: legalCompatible,
        policySelectionOrientationCompatible: policyCompatible,
        continuationOrientationCompatible: continuationCompatible,
        allContinuationsTerminal: localVoyages.every((item) => item.finishReason !== null),
        recurrenceCount: localVoyages.filter((item) => item.nonterminalRecurrence !== null).length,
        localSectionStatus: !legalCompatible
            ? 'underdeclared' as const
            : !policyCompatible
                ? 'selection_split' as const
                : !continuationCompatible
                    ? 'continuation_split' as const
                    : 'compatible_relation' as const,
        residue: [
            'actor-role', 'responder-phase', 'completed-turns', 'path-order',
            'position', 'escape-slack', 'stitching', 'preparation-cocoon',
            'policy-selection', 'excluded-authority-ports'
        ]
    };
    const chartDigest = sha256Digest(payload);
    return D2MLocalChartSchema.parse({
        chartRef: `d2m-chart-${chartDigest.slice(0, 24)}`,
        ...payload,
        chartDigest
    });
}

function makeOverlap(
    left: D2MLocalChart,
    right: D2MLocalChart
): D2MOverlap {
    if (left.cycleIndex !== right.cycleIndex || right.startingDistance - left.startingDistance > 1 ||
        !((left.startingDistance === 639 && right.startingDistance === 640) ||
            (left.startingDistance === 640 && right.startingDistance === 641))) {
        throw new Error('D2M overlap charts are not an admitted adjacent boundary pair.');
    }
    const exactCarrierEqual = left.representativeSourceCarrierDigest === right.representativeSourceCarrierDigest;
    const immediateRelationEqual = left.representativeImmediateRelationDigest ===
        right.representativeImmediateRelationDigest;
    const policySelectionEqual = left.representativePolicySelectionDigest ===
        right.representativePolicySelectionDigest;
    const continuationRelationEqual = left.representativeContinuationRelationDigest ===
        right.representativeContinuationRelationDigest;
    const responderPhaseEqual = left.responderPhase === right.responderPhase;
    const deterministicContinuationMapEligible = immediateRelationEqual && continuationRelationEqual;
    const classification = !immediateRelationEqual
        ? 'local_relation_split' as const
        : !policySelectionEqual && !continuationRelationEqual
            ? 'selection_and_continuation_split_after_local_compatibility' as const
            : !continuationRelationEqual
                ? 'continuation_split_after_local_compatibility' as const
                : 'compatible_with_exact_residue' as const;
    const payload = {
        schemaVersion: 1 as const,
        cycleIndex: left.cycleIndex,
        leftDistance: left.startingDistance,
        rightDistance: right.startingDistance,
        leftChartRef: left.chartRef,
        rightChartRef: right.chartRef,
        exactCarrierEqual,
        immediateRelationEqual,
        policySelectionEqual,
        continuationRelationEqual,
        responderPhaseEqual,
        deterministicContinuationMapEligible,
        recommendedShape: deterministicContinuationMapEligible ? 'map' as const : 'relation_or_kernel' as const,
        classification,
        witnessCarrierRefs: [...left.carrierRefs, ...right.carrierRefs].sort(compareCanonicalText),
        reasons: [
            exactCarrierEqual
                ? 'The exact authority carriers agree on this overlap.'
                : 'The exact authority carriers retain distance, path, orientation, or completed-turn residue.',
            immediateRelationEqual
                ? 'The actor-relative immediate legal response relation agrees across the overlap.'
                : 'The immediate legal response relation changes across the overlap.',
            policySelectionEqual
                ? 'The fixed policy-selection relation agrees across the overlap.'
                : 'At least one fixed policy-selection relation splits across the overlap.',
            continuationRelationEqual
                ? 'The complete forced 25-context continuation relation agrees across the overlap.'
                : 'The same local response projection reaches different complete continuation relations.',
            responderPhaseEqual
                ? 'The responder occupies the same first/second role on both charts.'
                : 'The responder role changes across the boundary and remains active route residue.'
        ]
    };
    const overlapDigest = sha256Digest(payload);
    return D2MOverlapSchema.parse({
        overlapRef: `d2m-overlap-${overlapDigest.slice(0, 24)}`,
        ...payload,
        overlapDigest
    });
}

function formationLifecycle(d2i: D2IResult) {
    const summaries = d2i.voyageSummaries.filter((item) => item.caseScope === 'F4');
    const first = summaries.find((item) => item.preparerPhase === 'first');
    const second = summaries.find((item) => item.preparerPhase === 'second');
    const ordered = d2i.orderedRouteSummaries.find((item) => item.caseScope === 'F4');
    const witnesses = d2i.orderedRouteWitnesses.filter((item) => item.caseScope === 'F4')
        .sort((left, right) => compareCanonicalText(left.witnessRef, right.witnessRef));
    if (!first || !second || !ordered || witnesses.length !== 8) {
        throw new Error('D2M cannot reconstruct the exact F4 formation lifecycle.');
    }
    const sum = (selector: (item: NonNullable<typeof first>) => number) => selector(first) + selector(second);
    const completedTurns = uniqueSorted(witnesses.map((item) => String(item.finalCompletedTurns)));
    if (canonicalJson(completedTurns) !== canonicalJson(['9'])) {
        throw new Error('D2M ordered F4 lifecycle no longer closes on turn nine.');
    }
    return {
        classification: 'phase_symmetric_counts_order_sensitive_composition' as const,
        formationCount: sum((item) => item.formationCount),
        firstPhaseFormationCount: first.formationCount,
        secondPhaseFormationCount: second.formationCount,
        responseCounts: {
            needlepointAbsorbed: sum((item) => item.responseCounts.needlepointAbsorbed),
            spoolburstAbsorbed: sum((item) => item.responseCounts.spoolburstAbsorbed),
            threadballBypassed: sum((item) => item.responseCounts.threadballBypassed),
            unweaveCleared: sum((item) => item.responseCounts.unweaveCleared),
            counterPreparation: sum((item) => item.responseCounts.counterPreparation)
        },
        cocoonDispositionCounts: {
            consumedByNeedlepoint: sum((item) => item.cocoonDispositionCounts.consumedByNeedlepoint),
            consumedBySpoolburst: sum((item) => item.cocoonDispositionCounts.consumedBySpoolburst),
            clearedByUnweave: sum((item) => item.cocoonDispositionCounts.clearedByUnweave),
            expiredOnRelease: sum((item) => item.cocoonDispositionCounts.expiredOnRelease)
        },
        resolutionCounts: {
            releasedSpoolburst: sum((item) => item.resolutionCounts.releasedSpoolburst),
            unwoven: sum((item) => item.resolutionCounts.unwoven)
        },
        recurrenceReturnCount: sum((item) => item.recurrenceReturnCount),
        orderedWitnessCount: ordered.orderedWitnessCount,
        uniqueOrderedMatchCount: ordered.uniqueWitnessMatchCount,
        firstActorWinMatchCount: ordered.firstActorWinMatchCount,
        finalCompletedTurns: 9 as const,
        witnessRefs: witnesses.map((item) => item.witnessRef),
        reasons: [
            'First- and second-phase preparers each form forty public preparation/Cocoon voyages.',
            'Needlepoint absorption, Spoolburst absorption, Threadball bypass, paid Unweave, and counter-preparation remain separate response relations.',
            'Eight ordered witnesses across four covariance-related matches show that later Cocoon formation absorbs the earlier release before the later release lands.',
            'All four unique ordered matches finish for the first actor on turn nine, so equal phase counts do not imply order-independent composition.',
            'No F4 formation voyage returns a nonterminal recurrence witness.'
        ]
    };
}

function widerTransport(d2l: D2LResult) {
    const baseline = d2l.variantSummaries.find((item) =>
        item.frameId === 'f4_cross_band_v0' && item.variant === 'baseline_v0'
    );
    const guarded = d2l.variantSummaries.find((item) =>
        item.frameId === 'f4_cross_band_v0' && item.variant === 'preparation_response_lethal_guard_v0'
    );
    if (!baseline || !guarded) throw new Error('D2M lacks the complete D2L wider transport summaries.');
    const distances = baseline.distances.map((base) => {
        const changed = guarded.distances.find((item) => item.startingDistance === base.startingDistance);
        if (!changed) throw new Error(`D2M lacks D2L distance ${base.startingDistance}.`);
        return {
            startingDistance: base.startingDistance as 448 | 512 | 576 | 640 | 704,
            baselineFirstActorWins: base.firstActorWins,
            guardedFirstActorWins: changed.firstActorWins,
            changedOutcomeCount: changed.outcomeChangesFromBaseline,
            firstActorGainCount: changed.firstActorGainCount,
            secondActorGainCount: changed.secondActorGainCount
        };
    });
    const spawn = distances.find((item) => item.startingDistance === 640);
    if (!spawn) throw new Error('D2M lacks the D2L production-spawn cancellation row.');
    const refs = d2l.phaseTransportWitnesses.map((item) => item.matchRef).sort(compareCanonicalText);
    return {
        classification: 'role_conditioned_transport_with_coarse_cancellation' as const,
        baselineFirstActorWins: baseline.firstActorWins,
        guardedFirstActorWins: guarded.firstActorWins,
        changedOutcomeCount: guarded.outcomeChangesFromBaseline,
        firstActorGainCount: guarded.firstActorGainCount,
        secondActorGainCount: guarded.secondActorGainCount,
        distances,
        productionSpawnCancellation: {
            startingDistance: 640 as const,
            baselineFirstActorWins: spawn.baselineFirstActorWins,
            guardedFirstActorWins: spawn.guardedFirstActorWins,
            changedOutcomeCount: spawn.changedOutcomeCount,
            firstActorGainCount: spawn.firstActorGainCount,
            secondActorGainCount: spawn.secondActorGainCount,
            coarseReadoutEqual: true as const,
            routeFamilyEqual: false as const
        },
        phaseWitnessRefs: refs,
        reasons: [
            'The response guard changes twenty-four wider outcomes according to the actor occupying the response phase.',
            'The guard gives four first-actor gains at each of 448, 512, and 576 and four second-actor gains at 704.',
            'At production spawn 640, four gains for each role cancel in the 30/50 first-actor scalar while eight routes change.',
            'A coarse aggregate return is therefore weaker than route-family, actor-role, or carrier return.',
            'The wider transport records are one correlated F4 policy family, not independent player evidence.'
        ]
    };
}

function chartAt(charts: readonly D2MLocalChart[], distance: Distance, cycle: CycleIndex): D2MLocalChart {
    const chart = charts.find((item) => item.startingDistance === distance && item.cycleIndex === cycle);
    if (!chart) throw new Error(`Missing D2M chart ${distance}/${cycle}.`);
    return chart;
}

export function assessTacticalOrderAtlas(value: unknown): D2MResult {
    const bundle = D2MInputBundleSchema.parse(value);
    assertParentBindings(bundle);

    const localCharts = CYCLES.flatMap((cycleIndex) => DISTANCES.map((startingDistance) =>
        makeChart(bundle.d2kRaw, bundle.d2kResult, startingDistance, cycleIndex)
    ));
    const overlapJudgments = CYCLES.flatMap((cycleIndex) => [
        makeOverlap(chartAt(localCharts, 639, cycleIndex), chartAt(localCharts, 640, cycleIndex)),
        makeOverlap(chartAt(localCharts, 640, cycleIndex), chartAt(localCharts, 641, cycleIndex))
    ]);
    const splitOverlaps = overlapJudgments.filter((item) =>
        item.immediateRelationEqual && !item.continuationRelationEqual
    );
    if (splitOverlaps.length !== 2 || splitOverlaps.some((item) =>
        item.leftDistance !== 640 || item.rightDistance !== 641
    )) {
        throw new Error('D2M did not recover the two expected 640/641 continuation aliasing witnesses.');
    }
    const transportAliasingWitnesses = splitOverlaps.map((overlap) => {
        const left = localCharts.find((item) => item.chartRef === overlap.leftChartRef);
        const right = localCharts.find((item) => item.chartRef === overlap.rightChartRef);
        if (!left || !right ||
            left.representativeImmediateRelationDigest !== right.representativeImmediateRelationDigest ||
            left.representativeContinuationRelationDigest === right.representativeContinuationRelationDigest) {
            throw new Error(`${overlap.overlapRef} is not an explicit one-source/two-target aliasing witness.`);
        }
        const payload = {
            schemaVersion: 1 as const,
            cycleIndex: overlap.cycleIndex,
            sourceProjection: 'normalized_immediate_response_relation' as const,
            targetProjection: 'complete_fixed_policy_continuation_relation' as const,
            leftChartRef: left.chartRef,
            rightChartRef: right.chartRef,
            sourceClassDigest: left.representativeImmediateRelationDigest,
            leftTargetClassDigest: left.representativeContinuationRelationDigest,
            rightTargetClassDigest: right.representativeContinuationRelationDigest,
            deterministicMapEligible: false as const,
            recommendedShape: 'relation_or_kernel' as const,
            finiteSampleScope: `F4 short_approach response cycle ${overlap.cycleIndex}, four actor/mirror replicas at starts 640 and 641, all ten legal responses and twenty-five continuation-policy contexts per response.`,
            witnessCarrierRefs: overlap.witnessCarrierRefs,
            reasons: [
                'The normalized immediate response relation is identical on the two charts.',
                'The complete actor-relative continuation relations differ after the same projected source class advances.',
                'The responder changes from first actor at 640 to second actor at 641.',
                'This finite split blocks a deterministic map for the declared continuation target and recommends relation_or_kernel.',
                'The bounded witness does not prove a universal game law outside its declared F4 domain.'
            ]
        };
        const witnessDigest = sha256Digest(payload);
        return D2MAliasingWitnessSchema.parse({
            witnessRef: `d2m-alias-${witnessDigest.slice(0, 24)}`,
            ...payload,
            witnessDigest
        });
    });

    const formation = formationLifecycle(bundle.d2iResult);
    const wider = widerTransport(bundle.d2lResult);
    const allLocalImmediateCompatible = localCharts.every((item) => item.legalResponseOrientationCompatible);
    const allTerminal = localCharts.every((item) => item.allContinuationsTerminal && item.recurrenceCount === 0);
    const aliasRefs = transportAliasingWitnesses.map((item) => item.witnessRef);
    const chartRefs = localCharts.map((item) => item.chartRef);

    const targetJudgments = [
        {
            target: 'local_answerability' as const,
            status: 'passed_bounded' as const,
            assemblyShape: 'relation' as const,
            reasons: [
                'Every declared response carrier exposes ten legal responses and five policy-selected response families.',
                'The normalized immediate response relation is orientation-compatible on all six charts and survives both adjacent distance overlaps.',
                'Answerability is relational: no unique response is selected by legal support alone.'
            ],
            witnessRefs: chartRefs
        },
        {
            target: 'local_reorganization' as const,
            status: 'passed_with_residue' as const,
            assemblyShape: 'relation' as const,
            reasons: [
                'Cocoon absorption, Threadball bypass, paid Unweave, counter-preparation, and relocation produce distinct immediate residues and continuation vectors.',
                'The formation carrier records damage, Stitching, position, Escape Slack, preparation, Cocoon, and resolution changes.',
                'Terminal-vector comparison still excludes path, timing, status, and authority residue and therefore does not rank one response globally.'
            ],
            witnessRefs: [...formation.witnessRefs, ...chartRefs].slice(0, 128)
        },
        {
            target: 'ordered_composition' as const,
            status: 'failed_descent' as const,
            assemblyShape: 'obstructed' as const,
            reasons: [
                'D2I has phase-symmetric formation and release totals but order-sensitive first-actor terminal routes.',
                'Both 640/641 response cycles identify one immediate source class with two different complete continuation classes.',
                'Local compatibility therefore does not assemble into path-independent role-neutral composition.'
            ],
            witnessRefs: [...formation.witnessRefs, ...aliasRefs]
        },
        {
            target: 'recursive_terminal_closure' as const,
            status: 'passed_bounded' as const,
            assemblyShape: 'relation' as const,
            reasons: [
                'All 6,000 D2K forced continuations terminate and none carries nonterminal recurrence.',
                'D2I formation voyages retain zero recurrence returns and D2L introduces no recurrence or turn-limit drift.',
                'Bounded convergence does not imply fun, initiative repair, or unique route closure.'
            ],
            witnessRefs: chartRefs
        },
        {
            target: 'actor_role_transport' as const,
            status: 'failed_descent' as const,
            assemblyShape: 'obstructed' as const,
            reasons: [
                'The responder occupies the first-actor role at 639/640 and the second-actor role at 641 for both response cycles.',
                'D2L response improvement changes outcomes for the actor occupying that response edge rather than preserving a role-neutral benefit.',
                'At 640 opposing gains cancel only at the coarse aggregate.'
            ],
            witnessRefs: [...aliasRefs, ...wider.phaseWitnessRefs].slice(0, 128)
        },
        {
            target: 'authority_reentry' as const,
            status: 'passed_with_residue' as const,
            assemblyShape: 'relation' as const,
            reasons: [
                'Every chart, overlap, and aliasing witness retains content digests plus exact D2I/D2K/D2L parent bindings.',
                'Carrier and response references re-enter the regenerated raw D2K relation without checking all 6,000 voyages into Git.',
                'Protected evidence re-entry is licensed; source-history recovery and production authority remain blocked.'
            ],
            witnessRefs: [...chartRefs, ...aliasRefs]
        }
    ];

    const sourceBindings = D2MSourceBindingsSchema.parse({
        repositoryId: 'worms-port',
        sourceCommit: '502c2fdb2fca5be6a821f40561251033963e1024',
        crpmMethodCommit: D2M_CRPM_COMMIT,
        d2iResultDigest: bundle.d2iResult.resultDigest,
        d2kRawDigest: bundle.d2kRaw.exportDigest,
        d2kResultDigest: bundle.d2kResult.resultDigest,
        d2lRawDigest: bundle.d2lResult.rawExportDigest,
        d2lResultDigest: bundle.d2lResult.resultDigest,
        modelPath: bundle.d2kRaw.sourceBindings.modelPath,
        modelSha256: bundle.d2kRaw.sourceBindings.modelSha256,
        configPath: bundle.d2kRaw.sourceBindings.configPath,
        configSha256: bundle.d2kRaw.sourceBindings.configSha256,
        configId: bundle.d2kRaw.sourceBindings.configId,
        configSchemaVersion: bundle.d2kRaw.sourceBindings.configSchemaVersion,
        crpmSourceBlobs: {
            candidateSpineGoal: 'b6c39c262a6abdee235dbb754bbb0168e21a79f1',
            candidateSpineCalibration: '8abf4a12442ab656c3a70b0b387da43eec99b03b',
            voyageRecursiveDynamics: '25a5ad5c3c0ed32409e425419d0b152948af2290',
            m9FormationCalibration: '499522e4d4d763ad633aef016a0fcf64fbc1f532',
            insightLog: '7b935dd881781dc2524b833ca01792c6d1c4ae86'
        }
    });

    const payload = {
        schemaVersion: 1 as const,
        resultId: 'wp-015d2m-target-indexed-tactical-order-atlas' as const,
        sourceBindings,
        domain: {
            localCover: {
                startingDistances: [639, 640, 641] as const,
                cycleIndices: [1, 2] as const,
                orientationReplicasPerChart: 4 as const,
                routeCount: 12 as const,
                chartCount: 6 as const,
                carrierCount: 24 as const,
                legalResponseCount: 240 as const,
                forcedContinuationVoyageCount: 6000 as const,
                baselinePlayerPolicy: 'short_approach' as const,
                baselineLoomkeeperPolicy: 'short_approach' as const
            },
            formationCarrier: {
                startingDistance: 640 as const,
                caseScope: 'F4' as const,
                formationVoyageCount: 80 as const,
                orderedWitnessCount: 8 as const,
                uniqueOrderedMatchCount: 4 as const
            },
            widerTransport: {
                startingDistances: [448, 512, 576, 640, 704] as const,
                orientationCountPerDistance: 2 as const,
                orderedPolicyPairCount: 25 as const,
                variants: ['baseline_v0', 'preparation_response_lethal_guard_v0'] as const,
                comparedMatchCount: 500 as const
            },
            protectedTargets: [
                'local_answerability',
                'local_reorganization',
                'ordered_composition',
                'recursive_terminal_closure',
                'actor_role_transport',
                'authority_reentry'
            ] as const,
            seed: 3237998097 as const,
            maximumTurns: 16 as const,
            exclusions: [
                'terrain', 'aim', 'trajectory', 'splash', 'hidden-information',
                'human-adaptation', 'live-loomkeeper', 'ui', 'replay',
                'networking', 'rewards', 'assets', 'production-state'
            ] as const
        },
        localCharts,
        overlapJudgments,
        transportAliasingWitnesses,
        formationLifecycle: formation,
        widerTransport: wider,
        targetJudgments,
        globalAssembly: {
            classification: 'role_neutral_global_order_not_assembled' as const,
            localCompatibility: allLocalImmediateCompatible,
            roleNeutralDescent: false,
            realizedClosedRouteWitness: false as const,
            routeActionStatus: 'candidate_nontrivial_route_action_not_closed_cycle' as const,
            strongestFinding: 'F4 retains a rich, orientation-compatible local response relation and bounded terminal closure, but that relation does not descend to role-neutral ordered composition: the 640/641 source projection aliases different continuations and wider response gains follow responder phase.',
            reasons: [
                'Local answerability and reorganization survive as target-indexed relations rather than a unique response map.',
                'The 639/640 overlaps retain compatible immediate and continuation relations despite exact carrier residue.',
                'Both 640/641 cycles preserve the immediate response projection while splitting complete continuation and responder phase.',
                'The second cycle also splits fixed policy selection across the boundary.',
                'D2I order-sensitive Cocoon transport and D2L cross-band responder gains agree on route-order pressure but reuse one correlated mechanics/policy family.',
                'The evidence supplies no paired closed loop with decoder, so route-action pressure must not be promoted to realized holonomy.'
            ],
            nextPermittedAction: 'Return the assembly obstruction to D2G and contract one mechanics-fixed interface probe that makes formation/maintenance/phase transport predict different continuations; do not strengthen response payoff or select a gameplay rule inside D2M.'
        },
        accumulatedResidue: [
            'actor-role', 'responder-phase', 'distance-boundary', 'path-order',
            'policy-selection', 'continuation-relation', 'completed-turns',
            'position', 'escape-slack', 'stitching', 'preparation-cocoon',
            'terminal-route', 'orientation-covariance', 'frame-overlap',
            'excluded-authority-ports', 'source-history'
        ],
        blockedClaims: [
            'A legal or terminally stronger local response is not automatically the globally preferred action.',
            'Response-edge actor identity is a route annotation, not a global ownership law or sole cause.',
            'Local response compatibility does not imply complete continuation descent, path independence, or role-neutral assembly.',
            'The 640 aggregate cancellation does not establish route, actor, policy, carrier, or protected-family return.',
            'Terminal closure does not establish initiative repair, fun, player adaptation, or product landfall.',
            'The target-indexed atlas does not rank all carriers or collapse its six protected targets into one score.',
            'The aliasing witnesses are finite F4 evidence and do not prove a universal gameplay or CRPM law.',
            'Route-action pressure is not a realized closed-cycle, geometry, or holonomy witness.',
            'CRPM supplies methodological review grammar, not empirical game evidence or a graph-safe schema.',
            'No D2M result authorizes a policy, Loomkeeper, mechanic, V5, client, server, protocol, replay, reward, wallet, UI, asset, or production change.'
        ],
        reentryInstructions: [
            'Verify Worms_Port base, clean CRPM method commit, model/config hashes, seed, and horizon.',
            'Regenerate and validate the exact D2I, D2K, and D2L parent digests before assessing D2M.',
            'Re-enter a chart through its four carrier refs and the bound D2K raw export rather than its scalar summary.',
            'Read target judgments separately; do not infer global assembly from a majority of passing targets.',
            'Treat the two 640/641 aliasing witnesses as bounded map failures and retain relation_or_kernel.',
            'Do not call the route action holonomy without an explicit source-locked paired closed route and decoder.',
            'Any later intervention requires a separate contract naming the obstruction, protected target, predicted wake, return condition, and excluded ports.'
        ],
        productAuthority: 'none' as const
    };
    if (!allTerminal) throw new Error('D2M terminal-closure parent unexpectedly drifted.');
    return D2MResultSchema.parse({ ...payload, resultDigest: sha256Digest(payload) });
}

export function canonicalD2MResult(result: D2MResult): string {
    return canonicalJson(D2MResultSchema.parse(result));
}
