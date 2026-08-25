import { canonicalJson, sha256Digest } from '../canonical';
import {
    D2KCarrierAssessmentSchema,
    D2KRawExportSchema,
    D2KResultSchema,
    type D2KCarrier,
    type D2KCarrierAssessment,
    type D2KRawExport,
    type D2KResult,
    type D2KVoyage
} from './policy-choice-schemas';

const POLICIES = [
    'range_pressure', 'medium_hold', 'short_approach', 'retreat_kite', 'best_response'
] as const;
const DISTANCES = [639, 640, 641] as const;
const RESULT_RANK = { preparer_win: 0, draw: 1, responder_win: 2 } as const;

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function actorState(carrier: D2KCarrier['sourceCarrier'], actor: 'player' | 'loomkeeper') {
    return actor === 'player' ? carrier.player : carrier.loomkeeper;
}

function contextKey(voyage: D2KVoyage): string {
    return `${voyage.playerContinuationPolicy}/${voyage.loomkeeperContinuationPolicy}`;
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
    const result = new Map<string, T[]>();
    for (const item of items) {
        const value = key(item);
        const prior = result.get(value) ?? [];
        prior.push(item);
        result.set(value, prior);
    }
    return result;
}

function responseSignature(summary: D2KCarrierAssessment['responseSummaries'][number]) {
    const { responderXDelta: _responderX, preparerXDelta: _preparerX, ...relativeResidue } =
        summary.immediateResidue;
    return {
        responseKind: summary.responseKind,
        immediateResidue: relativeResidue
    };
}

function assessCarrier(
    carrier: D2KCarrier,
    voyages: readonly D2KVoyage[]
): D2KCarrierAssessment {
    const local = voyages.filter((item) => item.carrierRef === carrier.carrierRef);
    if (local.length !== carrier.legalActions.length * 25) {
        throw new Error(`${carrier.carrierRef} does not contain 25 continuations per legal response.`);
    }
    const legalKeys = new Set(carrier.legalActions.map((item) => item.actionKey));
    const policyNames = carrier.policySelections.map((item) => item.policy);
    if (new Set(policyNames).size !== POLICIES.length ||
        POLICIES.some((policy) => !policyNames.includes(policy))) {
        throw new Error(`${carrier.carrierRef} does not evaluate every registered policy exactly once.`);
    }
    for (const selection of carrier.policySelections) {
        if (!legalKeys.has(selection.selectedActionKey)) {
            throw new Error(`${carrier.carrierRef} contains a policy selection outside legal support.`);
        }
    }

    const responseGroups = groupBy(local, (item) => item.responseRef);
    if (responseGroups.size !== carrier.legalActions.length) {
        throw new Error(`${carrier.carrierRef} response references do not cover its legal action set.`);
    }
    const responseVectors = new Map<string, Map<string, number>>();
    const responseSummaries = [...responseGroups.entries()].map(([responseRef, items]) => {
        const first = items[0];
        if (!first) throw new Error('Empty response voyage group.');
        const contexts = new Map<string, number>();
        for (const item of items) {
            if (item.responseAction.actionKey !== first.responseAction.actionKey ||
                item.responseKind !== first.responseKind ||
                canonicalJson(item.immediateResidue) !== canonicalJson(first.immediateResidue)) {
                throw new Error(`${responseRef} changes response meaning across continuation contexts.`);
            }
            const key = contextKey(item);
            if (contexts.has(key)) throw new Error(`${responseRef} duplicates continuation context ${key}.`);
            contexts.set(key, RESULT_RANK[item.responderResult]);
        }
        if (contexts.size !== 25) throw new Error(`${responseRef} does not cover all 25 continuation contexts.`);
        responseVectors.set(responseRef, contexts);
        const terminalVector = [...items]
            .sort((left, right) => compareText(contextKey(left), contextKey(right)))
            .map((item) => ({ context: contextKey(item), result: item.responderResult }));
        return {
            responseRef,
            responseKind: first.responseKind,
            actionKey: first.responseAction.actionKey,
            immediateResidue: first.immediateResidue,
            continuationCount: 25 as const,
            responderWinCount: items.filter((item) => item.responderResult === 'responder_win').length,
            preparerWinCount: items.filter((item) => item.responderResult === 'preparer_win').length,
            drawCount: items.filter((item) => item.responderResult === 'draw').length,
            recurrenceCount: items.filter((item) => item.nonterminalRecurrence !== null).length,
            distinctFinalCarrierCount: new Set(items.map((item) => item.finalCarrierDigest)).size,
            distinctContinuationPathCount: new Set(items.map((item) => item.continuationPathDigest)).size,
            terminalVectorDigest: sha256Digest(terminalVector),
            selectedByPolicies: carrier.policySelections
                .filter((item) => item.selectedActionKey === first.responseAction.actionKey)
                .map((item) => item.policy)
        };
    }).sort((left, right) => compareText(left.actionKey, right.actionKey));

    const dominanceWitnesses: Array<{
        carrierRef: string;
        dominantResponseRef: string;
        dominantActionKey: string;
        dominatedResponseRef: string;
        dominatedActionKey: string;
        improvedContextCount: number;
        equalContextCount: number;
        dominatedSelectedByPolicies: Array<typeof POLICIES[number]>;
        relation: 'terminal_outcome_componentwise';
        excludedResidue: readonly [
            'turn_count', 'path', 'position', 'escape_slack', 'status_support', 'excluded_authority_ports'
        ];
    }> = [];
    for (const dominant of responseSummaries) {
        const dominantVector = responseVectors.get(dominant.responseRef);
        if (!dominantVector) throw new Error('Detached dominant response vector.');
        for (const dominated of responseSummaries) {
            if (dominant.responseRef === dominated.responseRef) continue;
            const dominatedVector = responseVectors.get(dominated.responseRef);
            if (!dominatedVector) throw new Error('Detached dominated response vector.');
            let improved = 0;
            let equal = 0;
            let worse = false;
            for (const [context, dominantRank] of dominantVector) {
                const dominatedRank = dominatedVector.get(context);
                if (dominatedRank === undefined) throw new Error('Dominance vectors use different contexts.');
                if (dominantRank < dominatedRank) worse = true;
                else if (dominantRank > dominatedRank) improved += 1;
                else equal += 1;
            }
            if (!worse && improved > 0) {
                dominanceWitnesses.push({
                    carrierRef: carrier.carrierRef,
                    dominantResponseRef: dominant.responseRef,
                    dominantActionKey: dominant.actionKey,
                    dominatedResponseRef: dominated.responseRef,
                    dominatedActionKey: dominated.actionKey,
                    improvedContextCount: improved,
                    equalContextCount: equal,
                    dominatedSelectedByPolicies: dominated.selectedByPolicies,
                    relation: 'terminal_outcome_componentwise',
                    excludedResidue: [
                        'turn_count', 'path', 'position', 'escape_slack',
                        'status_support', 'excluded_authority_ports'
                    ]
                });
            }
        }
    }
    dominanceWitnesses.sort((left, right) =>
        compareText(left.dominatedActionKey, right.dominatedActionKey) ||
        compareText(left.dominantActionKey, right.dominantActionKey)
    );

    const responseByAction = new Map(responseSummaries.map((item) => [item.actionKey, item]));
    const policyRegretWitnesses = carrier.policySelections.flatMap((selection) => {
        const selected = responseByAction.get(selection.selectedActionKey);
        if (!selected) throw new Error('Policy selection has no response summary.');
        const dominantRefs = dominanceWitnesses
            .filter((item) => item.dominatedResponseRef === selected.responseRef)
            .map((item) => item.dominantResponseRef);
        return dominantRefs.length === 0 ? [] : [{
            policy: selection.policy,
            selectedResponseRef: selected.responseRef,
            selectedActionKey: selected.actionKey,
            dominantResponseRefs: [...new Set(dominantRefs)].sort(compareText)
        }];
    });

    const selectedResponseKinds = new Set(carrier.policySelections.map((selection) => {
        const selected = responseByAction.get(selection.selectedActionKey);
        if (!selected) throw new Error('Policy selection has no response relation.');
        return selected.responseKind;
    }));
    const responderState = actorState(carrier.sourceCarrier, carrier.responder);
    const preparerState = actorState(carrier.sourceCarrier, carrier.preparer);
    const payload = {
        schemaVersion: 1 as const,
        carrierRef: carrier.carrierRef,
        matchRef: carrier.matchRef,
        startingDistance: carrier.startingDistance,
        firstActor: carrier.firstActor,
        mirrored: carrier.mirrored,
        cycleIndex: carrier.cycleIndex as 1 | 2,
        responder: carrier.responder,
        responderPhase: carrier.responderPhase,
        completedTurns: carrier.completedTurns,
        responderStitching: responderState.stitching,
        preparerStitching: preparerState.stitching,
        legalActionCount: carrier.legalActions.length,
        selectedActionCount: new Set(carrier.policySelections.map((item) => item.selectedActionKey)).size,
        selectedResponseKindCount: selectedResponseKinds.size,
        responseSummaries,
        dominanceWitnesses,
        policyRegretWitnesses
    };
    return D2KCarrierAssessmentSchema.parse({
        ...payload,
        carrierAssessmentDigest: sha256Digest(payload)
    });
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
            compareText(canonicalJson(left), canonicalJson(right))
        )
    };
    const policySelections = carrier.policySelections.map((selection) => {
            const response = responseByAction.get(selection.selectedActionKey);
            if (!response) throw new Error('Detached normalized policy selection.');
            return { policy: selection.policy, response: responseSignature(response) };
        });
    return {
        support,
        policySelections
    };
}

function normalizedContinuationRelation(
    carrier: D2KCarrier,
    assessment: D2KCarrierAssessment,
    voyages: readonly D2KVoyage[]
) {
    return assessment.responseSummaries.map((item) => ({
        ...responseSignature(item),
        responderWinCount: item.responderWinCount,
        preparerWinCount: item.preparerWinCount,
        drawCount: item.drawCount,
        recurrenceCount: item.recurrenceCount,
        actorRelativeTerminalVector: voyages
            .filter((voyage) =>
                voyage.carrierRef === carrier.carrierRef && voyage.responseRef === item.responseRef
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
                compareText(left.responderPolicy, right.responderPolicy) ||
                compareText(left.preparerPolicy, right.preparerPolicy)
            )
    })).sort((left, right) => compareText(canonicalJson(left), canonicalJson(right)));
}

function boundarySummaries(
    carriers: readonly D2KCarrier[],
    assessments: readonly D2KCarrierAssessment[],
    voyages: readonly D2KVoyage[]
) {
    const byCarrier = new Map(assessments.map((item) => [item.carrierRef, item]));
    return ([1, 2] as const).map((cycleIndex) => {
        const local = carriers.filter((item) => item.cycleIndex === cycleIndex);
        const groups = new Map<number, D2KCarrier[]>();
        for (const distance of DISTANCES) {
            groups.set(distance, local.filter((item) => item.startingDistance === distance));
        }
        const representative = (distance: typeof DISTANCES[number]) => {
            const items = groups.get(distance) ?? [];
            if (items.length !== 4) throw new Error(`Cycle ${cycleIndex} start ${distance} lacks four orientations.`);
            return items[0];
        };
        const relationFor = (carrier: D2KCarrier) => {
            const assessment = byCarrier.get(carrier.carrierRef);
            if (!assessment) throw new Error('Boundary carrier lacks assessment.');
            return {
                immediate: normalizedImmediateRelation(carrier, assessment),
                continuation: normalizedContinuationRelation(carrier, assessment, voyages)
            };
        };
        const legalResponseOrientationReplicasConsistent = DISTANCES.every((distance) => {
            const items = groups.get(distance) ?? [];
            const digests = items.map((item) => sha256Digest(relationFor(item).immediate.support));
            return new Set(digests).size === 1;
        });
        const policySelectionOrientationReplicasConsistent = DISTANCES.every((distance) => {
            const items = groups.get(distance) ?? [];
            const digests = items.map((item) => sha256Digest(relationFor(item).immediate.policySelections));
            return new Set(digests).size === 1;
        });
        const continuationOrientationReplicasConsistent = DISTANCES.every((distance) => {
            const items = groups.get(distance) ?? [];
            const digests = items.map((item) => sha256Digest(relationFor(item).continuation));
            return new Set(digests).size === 1;
        });
        const orientationReplicasConsistent = legalResponseOrientationReplicasConsistent &&
            continuationOrientationReplicasConsistent;
        const start639 = representative(639);
        const start640 = representative(640);
        const start641 = representative(641);
        const relation639 = relationFor(start639);
        const relation640 = relationFor(start640);
        const relation641 = relationFor(start641);
        const exact639Equals640 = start639.sourceCarrierDigest === start640.sourceCarrierDigest;
        const exact640Equals641 = start640.sourceCarrierDigest === start641.sourceCarrierDigest;
        const immediate639Equals640 = canonicalJson(relation639.immediate.support) === canonicalJson(relation640.immediate.support);
        const immediate640Equals641 = canonicalJson(relation640.immediate.support) === canonicalJson(relation641.immediate.support);
        const policySelection639Equals640 = canonicalJson(relation639.immediate.policySelections) ===
            canonicalJson(relation640.immediate.policySelections);
        const policySelection640Equals641 = canonicalJson(relation640.immediate.policySelections) ===
            canonicalJson(relation641.immediate.policySelections);
        const continuation639Equals640 = canonicalJson(relation639.continuation) === canonicalJson(relation640.continuation);
        const continuation640Equals641 = canonicalJson(relation640.continuation) === canonicalJson(relation641.continuation);
        return {
            schemaVersion: 1 as const,
            cycleIndex,
            carrierCountByDistance: { start639: 4 as const, start640: 4 as const, start641: 4 as const },
            responderPhaseByDistance: {
                start639: start639.responderPhase,
                start640: start640.responderPhase,
                start641: start641.responderPhase
            },
            legalResponseOrientationReplicasConsistent,
            policySelectionOrientationReplicasConsistent,
            continuationOrientationReplicasConsistent,
            orientationReplicasConsistent,
            exactCarrier639Equals640: exact639Equals640,
            exactCarrier640Equals641: exact640Equals641,
            normalizedImmediateRelation639Equals640: immediate639Equals640,
            normalizedImmediateRelation640Equals641: immediate640Equals641,
            policySelection639Equals640,
            policySelection640Equals641,
            continuation639Equals640,
            continuation640Equals641,
            reasons: [
                'Four actor/mirror orientations are covariance replicas of each distance/cycle relation, not independent strategy evidence.',
                exact639Equals640
                    ? 'The 639 and 640 exact source carriers match.'
                    : 'The 639 and 640 exact carriers retain their one-unit/path distinction even when response relations are compared.',
                immediate640Equals641
                    ? 'After actor/phase and absolute-position normalization, the immediate legal response relation survives the 640/641 boundary.'
                    : 'The immediate response relation changes across 640/641 after normalization.',
                policySelectionOrientationReplicasConsistent
                    ? 'Policy selections are actor/mirror equivariant in this cycle.'
                    : 'At least one fixed policy selects a different actor-relative response after mirroring otherwise equivalent support.',
                continuation640Equals641
                    ? 'The complete fixed-policy continuation vectors survive 640/641.'
                    : 'Continuation vectors change across 640/641 because phase, completed-turn horizon, or downstream policy paths remain relevant.'
            ],
            witnessCarrierRefs: local.map((item) => item.carrierRef).sort(compareText)
        };
    });
}

function validateRawTopology(raw: D2KRawExport): void {
    if (raw.carriers.length !== 24 || raw.voyages.length !== 6000) {
        throw new Error('D2K raw topology does not match 24 carriers and 6,000 voyages.');
    }
    const routeRefs = new Set(raw.routes.map((item) => item.matchRef));
    if (routeRefs.size !== 12 || raw.routes.some((item) => item.responseCarrierCount !== 2)) {
        throw new Error('D2K must retain exactly two response carriers on each of 12 routes.');
    }
    for (const carrier of raw.carriers) {
        if (!routeRefs.has(carrier.matchRef) || carrier.legalActions.length !== 10 ||
            carrier.policySelections.length !== 5) {
            throw new Error(`${carrier.carrierRef} violates the fixed carrier/action/selection topology.`);
        }
    }
    const carrierRefs = new Set(raw.carriers.map((item) => item.carrierRef));
    if (carrierRefs.size !== 24 || raw.voyages.some((item) => !carrierRefs.has(item.carrierRef))) {
        throw new Error('D2K voyage or carrier references are detached.');
    }
}

export function assessPolicyChoices(value: unknown): D2KResult {
    const raw = D2KRawExportSchema.parse(value);
    validateRawTopology(raw);
    const carrierAssessments = raw.carriers.map((carrier) => assessCarrier(carrier, raw.voyages))
        .sort((left, right) =>
            left.startingDistance - right.startingDistance ||
            left.cycleIndex - right.cycleIndex ||
            compareText(left.carrierRef, right.carrierRef)
        );
    const boundaries = boundarySummaries(raw.carriers, carrierAssessments, raw.voyages);
    const responderWinVoyageCount = raw.voyages.filter((item) => item.responderResult === 'responder_win').length;
    const preparerWinVoyageCount = raw.voyages.filter((item) => item.responderResult === 'preparer_win').length;
    const drawVoyageCount = raw.voyages.filter((item) => item.responderResult === 'draw').length;
    const recurrenceVoyageCount = raw.voyages.filter((item) => item.nonterminalRecurrence !== null).length;
    const dominanceWitnessCount = carrierAssessments.reduce(
        (total, item) => total + item.dominanceWitnesses.length,
        0
    );
    const regretWitnesses = carrierAssessments.flatMap((item) => item.policyRegretWitnesses);
    const policiesWithRegretWitnesses = [...new Set(regretWitnesses.map((item) => item.policy))]
        .sort(compareText);
    const assessmentByCarrier = new Map(carrierAssessments.map((item) => [item.carrierRef, item]));
    let mirrorSensitivePolicySelectionCount = 0;
    const mirrorSensitivePolicySet = new Set<typeof POLICIES[number]>();
    for (const distance of DISTANCES) {
        for (const cycleIndex of [1, 2] as const) {
            const motifCarriers = raw.carriers.filter((item) =>
                item.startingDistance === distance && item.cycleIndex === cycleIndex
            );
            for (const policy of POLICIES) {
                const signatures = motifCarriers.map((carrier) => {
                    const assessment = assessmentByCarrier.get(carrier.carrierRef);
                    const selection = carrier.policySelections.find((item) => item.policy === policy);
                    const response = assessment?.responseSummaries.find((item) =>
                        item.actionKey === selection?.selectedActionKey
                    );
                    if (!assessment || !selection || !response) {
                        throw new Error('Mirror-sensitivity audit found a detached policy selection.');
                    }
                    return canonicalJson(responseSignature(response));
                });
                if (new Set(signatures).size > 1) {
                    mirrorSensitivePolicySelectionCount += motifCarriers.length;
                    mirrorSensitivePolicySet.add(policy);
                }
            }
        }
    }
    const mirrorSensitivePolicies = [...mirrorSensitivePolicySet].sort(compareText);
    const allFiveKinds = carrierAssessments.every((item) => item.selectedResponseKindCount === 5);
    const allTerminal = raw.voyages.every((item) => item.finalCarrier.finishReason !== null);
    const orientationStable = boundaries.every((item) => item.orientationReplicasConsistent);
    const globalSummary = {
        routeCount: 12 as const,
        carrierCount: 24 as const,
        normalizedCarrierMotifCount: 6 as const,
        legalResponseCount: 240 as const,
        policySelectionCount: 120 as const,
        voyageCount: 6000 as const,
        responderWinVoyageCount,
        preparerWinVoyageCount,
        drawVoyageCount,
        recurrenceVoyageCount,
        dominanceWitnessCount,
        dominatedPolicySelectionCount: regretWitnesses.length,
        policiesWithRegretWitnesses,
        mirrorSensitivePolicySelectionCount,
        mirrorSensitivePolicies,
        allCarriersExposeFiveSelectedResponseKinds: allFiveKinds,
        allVoyagesTerminal: allTerminal
    };

    const navigationWake = allFiveKinds && dominanceWitnessCount > 0 && regretWitnesses.length > 0 &&
        allTerminal && orientationStable
        ? {
            classification: 'retain_mechanics_refine_policy_question' as const,
            reasons: [
                'Every response carrier already exposes five distinct policy-selected response families: Needlepoint, Threadball, counter-preparation, paid Unweave, and relocation.',
                `${regretWitnesses.length} carrier/policy selections have at least one strictly better responder terminal vector across the same complete 25-context continuation domain.`,
                'The surviving comparisons retain turn, path, position, Escape-Slack, status, and excluded authority residue, so terminal dominance is not promoted to gameplay dominance.',
                'Legal response support and forced continuation relations reproduce across all four actor/mirror orientations; these are covariance replicas rather than independent evidence.',
                mirrorSensitivePolicySelectionCount > 0
                    ? `${mirrorSensitivePolicySelectionCount} fixed selections from ${mirrorSensitivePolicies.join(', ')} are not actor/mirror equivariant even though the underlying response relation is.`
                    : 'Every fixed selection is actor/mirror equivariant in the declared motifs.'
            ],
            witnessRefs: [
                ...carrierAssessments.flatMap((item) => item.policyRegretWitnesses.map((witness) => witness.selectedResponseRef)),
                ...boundaries.flatMap((item) => item.witnessCarrierRefs.slice(0, 2))
            ].filter((item, index, values) => values.indexOf(item) === index).slice(0, 128),
            nextPermittedAction: 'Owner review may open a separate Lane 1 analytical policy-probe contract over the existing F4 response relation; no gameplay mechanic, live Loomkeeper policy, or production change is authorized.'
        }
            : allFiveKinds && allTerminal && orientationStable
            ? {
                classification: 'retain_mechanics_no_policy_defect' as const,
                reasons: ['The fixed policies select distinct response families, but no selected terminal vector is componentwise dominated over the complete continuation domain.'],
                witnessRefs: carrierAssessments.slice(0, 4).map((item) => item.carrierRef),
                nextPermittedAction: 'Return to the D2G navigation chart; do not add a policy or mechanic.'
            }
            : !allTerminal
                ? {
                    classification: 'escalate_authority_playtest_cut' as const,
                    reasons: ['The declared D2A continuation horizon cannot close the response relation.'],
                    witnessRefs: raw.voyages.filter((item) => item.finalCarrier.finishReason === null).slice(0, 8).map((item) => item.voyageRef),
                    nextPermittedAction: 'Name the missing horizon or authority port before another D2A candidate.'
                }
                : {
                    classification: 'return_to_navigation_chart' as const,
                    reasons: [orientationStable
                        ? 'No stable mechanics-fixed policy-choice relation survived the fixed domain.'
                        : 'Actor-relative orientation normalization did not produce a stable policy-choice relation.'],
                    witnessRefs: carrierAssessments.slice(0, 4).map((item) => item.carrierRef),
                    nextPermittedAction: 'Return to D2G without changing gameplay or policy.'
                };

    const payload = {
        schemaVersion: 1 as const,
        resultId: 'wp-015d2k-policy-choice-relation-assessment' as const,
        sourceBindings: raw.sourceBindings,
        rawExportDigest: raw.exportDigest,
        carrierAssessments,
        boundarySummaries: boundaries,
        globalSummary,
        navigationWake,
        accumulatedResidue: [
            'fixed-policy-family',
            'forced-response-counterfactual',
            'continuation-policy-covariance',
            'turn-horizon',
            'path-order',
            'position',
            'escape-slack',
            'preparation-cocoon',
            'terminal-only-dominance',
            'orientation-covariance',
            'excluded-production-ports'
        ],
        blockedClaims: [
            ...raw.blockedClaims,
            'A policy regret witness is bounded to the registered continuation contexts and does not establish an optimal response.',
            'Five selected response families do not prove that a human player perceives five meaningful choices.',
            'Equal orientation-normalized relations do not multiply evidence across actor labels or mirrors.',
            'A terminally dominated selection does not authorize changing a policy, Loomkeeper, gameplay mechanic, or production rule.',
            'D2K does not establish initiative balance, fun, strategic depth, or a solved tactical game.'
        ],
        productAuthority: 'none' as const
    };
    return D2KResultSchema.parse({ ...payload, resultDigest: sha256Digest(payload) });
}

export function canonicalD2KResult(result: D2KResult): string {
    return canonicalJson(D2KResultSchema.parse(result));
}
