import { canonicalJson, compareCanonicalText, sha256Digest } from '../canonical';
import type {
    D2KCarrier,
    D2KCarrierAssessment,
    D2KResult,
    D2KVoyage
} from './policy-choice-schemas';
import {
    D2NAliasingWitnessSchema,
    D2N_CONFIG_SHA256,
    D2N_CRPM_COMMIT,
    D2N_D2K_RAW_DIGEST,
    D2N_D2K_RESULT_DIGEST,
    D2N_D2M_RESULT_DIGEST,
    D2NInputBundleSchema,
    D2N_MODEL_SHA256,
    D2NOverrefinementWitnessSchema,
    D2NPartitionFamilySchema,
    D2NPredecessorDivergenceSchema,
    D2NRefinementAssessmentSchema,
    D2NResultSchema,
    D2NSourceBindingsSchema,
    type D2NInputBundle,
    type D2NPartitionFamily,
    type D2NRefinementAssessment,
    type D2NRefinementId,
    type D2NResult
} from './bridge-calibration-schemas';

type Actor = 'player' | 'loomkeeper';
type CycleIndex = 1 | 2;
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const REFINEMENT_IDS: readonly D2NRefinementId[] = [
    'none_control',
    'responder_phase',
    'completed_turn_position',
    'path_kind_prefix',
    'relative_separation',
    'formation_lifetime_support',
    'resource_support',
    'policy_selection_relation',
    'orientation_metadata',
    'phase_plus_separation',
    'route_plus_formation',
    'policy_plus_orientation'
];

const POLICY_ORDER = [
    'range_pressure', 'medium_hold', 'short_approach', 'retreat_kite', 'best_response'
] as const;

interface CarrierRecord {
    carrier: D2KCarrier;
    assessment: D2KCarrierAssessment;
    baseProjectionDigest: string;
    protectedTargetDigest: string;
    normalizedPolicySelection: JsonValue;
}

interface RefinementDefinition {
    id: D2NRefinementId;
    coordinates: string[];
    value: (record: CarrierRecord) => JsonValue;
    publicFormationMode: D2NRefinementAssessment['publicFormationMode'];
    declaredSupport: string[];
    transportability: D2NRefinementAssessment['transportability'];
    targetRelevance: D2NRefinementAssessment['targetRelevance'];
    semanticReason: string;
}

function uniqueSorted(values: readonly string[]): string[] {
    return [...new Set(values)].sort(compareCanonicalText);
}

function actorState(carrier: D2KCarrier['sourceCarrier'], actor: Actor) {
    return actor === 'player' ? carrier.player : carrier.loomkeeper;
}

function actionKind(actionKey: string): string {
    const [kind] = actionKey.split(':', 1);
    if (!kind) throw new Error(`D2N cannot parse action kind ${actionKey}.`);
    return kind;
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

function formationValue(record: CarrierRecord): JsonValue {
    const responder = actorState(record.carrier.sourceCarrier, record.carrier.responder);
    const preparer = actorState(record.carrier.sourceCarrier, record.carrier.preparer);
    return {
        responderPreparation: responder.spoolburstPreparationTurns,
        responderCocoon: responder.spoolburstCocoonHits,
        preparerPreparation: preparer.spoolburstPreparationTurns,
        preparerCocoon: preparer.spoolburstCocoonHits
    };
}

function resourceValue(record: CarrierRecord): JsonValue {
    const responder = actorState(record.carrier.sourceCarrier, record.carrier.responder);
    const preparer = actorState(record.carrier.sourceCarrier, record.carrier.preparer);
    return {
        responderStitching: responder.stitching,
        responderEscapeSlack: responder.escapeSlack,
        preparerStitching: preparer.stitching,
        preparerEscapeSlack: preparer.escapeSlack
    };
}

function relativeSeparation(record: CarrierRecord): number {
    const responder = actorState(record.carrier.sourceCarrier, record.carrier.responder);
    const preparer = actorState(record.carrier.sourceCarrier, record.carrier.preparer);
    return Math.abs(responder.x - preparer.x);
}

function pathKindPrefix(record: CarrierRecord): string[] {
    return record.carrier.pathPrefixActions.map(actionKind);
}

function refinementDefinitions(): RefinementDefinition[] {
    return [
        {
            id: 'none_control', coordinates: [], value: () => null,
            publicFormationMode: 'none', declaredSupport: [], transportability: 'not_sufficient',
            targetRelevance: 'underdetermined',
            semanticReason: 'The destructive control retains only D2M immediate-response support.'
        },
        {
            id: 'responder_phase', coordinates: ['responder-phase'],
            value: (record) => record.carrier.responderPhase,
            publicFormationMode: 'current_carrier', declaredSupport: ['first-actor', 'active-actor'],
            transportability: 'same_type_current', targetRelevance: 'required_in_finite_domain',
            semanticReason: 'Responder phase is public carrier metadata and updates with turn order.'
        },
        {
            id: 'completed_turn_position', coordinates: ['completed-turns'],
            value: (record) => record.carrier.completedTurns,
            publicFormationMode: 'current_carrier', declaredSupport: ['turn-counter'],
            transportability: 'same_type_current', targetRelevance: 'required_in_finite_domain',
            semanticReason: 'Completed-turn position is current analytical support but is not tactical progress by itself.'
        },
        {
            id: 'path_kind_prefix', coordinates: ['path-kind-prefix'],
            value: pathKindPrefix,
            publicFormationMode: 'trace_support', declaredSupport: ['path-prefix', 'action-kind-decoder'],
            transportability: 'support_augmented', targetRelevance: 'required_in_finite_domain',
            semanticReason: 'Action-kind history is publicly formable only from retained route trace support.'
        },
        {
            id: 'relative_separation', coordinates: ['relative-separation'],
            value: relativeSeparation,
            publicFormationMode: 'current_carrier', declaredSupport: ['unit-positions'],
            transportability: 'same_type_current', targetRelevance: 'conditional',
            semanticReason: 'Separation is current-state geometry but may retain distinctions irrelevant to this target.'
        },
        {
            id: 'formation_lifetime_support', coordinates: ['preparation', 'cocoon'],
            value: formationValue,
            publicFormationMode: 'current_carrier', declaredSupport: ['preparation', 'cocoon'],
            transportability: 'same_type_current', targetRelevance: 'irrelevant_for_target',
            semanticReason: 'Current formation/lifetime support is a required negative control because it is equal across the split.'
        },
        {
            id: 'resource_support', coordinates: ['stitching', 'escape-slack'],
            value: resourceValue,
            publicFormationMode: 'current_carrier', declaredSupport: ['stitching', 'escape-slack'],
            transportability: 'same_type_current', targetRelevance: 'irrelevant_for_target',
            semanticReason: 'Current Stitching and Escape Slack are equal inside each aliased cycle class.'
        },
        {
            id: 'policy_selection_relation', coordinates: ['policy-selection'],
            value: (record) => record.normalizedPolicySelection,
            publicFormationMode: 'policy_support', declaredSupport: ['policy-family', 'legal-response-relation'],
            transportability: 'support_augmented', targetRelevance: 'conditional',
            semanticReason: 'Fixed selector output requires policy support and is not a state coordinate.'
        },
        {
            id: 'orientation_metadata', coordinates: ['first-actor', 'mirror'],
            value: (record) => ({ firstActor: record.carrier.firstActor, mirrored: record.carrier.mirrored }),
            publicFormationMode: 'scenario_metadata', declaredSupport: ['first-actor', 'mirror'],
            transportability: 'static_context', targetRelevance: 'conditional',
            semanticReason: 'Orientation is static scenario context and cannot reconstruct route order.'
        },
        {
            id: 'phase_plus_separation', coordinates: ['responder-phase', 'relative-separation'],
            value: (record) => ({ phase: record.carrier.responderPhase, separation: relativeSeparation(record) }),
            publicFormationMode: 'current_carrier', declaredSupport: ['first-actor', 'active-actor', 'unit-positions'],
            transportability: 'same_type_current', targetRelevance: 'conditional',
            semanticReason: 'The combined current-state control tests whether geometry adds only finer residue.'
        },
        {
            id: 'route_plus_formation', coordinates: ['path-kind-prefix', 'preparation', 'cocoon'],
            value: (record) => ({ path: pathKindPrefix(record), formation: formationValue(record) }),
            publicFormationMode: 'mixed', declaredSupport: ['path-prefix', 'action-kind-decoder', 'preparation', 'cocoon'],
            transportability: 'support_augmented', targetRelevance: 'required_in_finite_domain',
            semanticReason: 'Route plus formation tests whether current lifetime support adds a new partition to trace history.'
        },
        {
            id: 'policy_plus_orientation', coordinates: ['policy-selection', 'first-actor', 'mirror'],
            value: (record) => ({
                policy: record.normalizedPolicySelection,
                firstActor: record.carrier.firstActor,
                mirrored: record.carrier.mirrored
            }),
            publicFormationMode: 'mixed', declaredSupport: ['policy-family', 'legal-response-relation', 'first-actor', 'mirror'],
            transportability: 'support_augmented', targetRelevance: 'conditional',
            semanticReason: 'The combined control tests whether policy and orientation jointly remove the alias.'
        }
    ];
}

function assertParentBindings(bundle: D2NInputBundle): void {
    if (bundle.d2mResult.resultDigest !== D2N_D2M_RESULT_DIGEST ||
        bundle.d2kRaw.exportDigest !== D2N_D2K_RAW_DIGEST ||
        bundle.d2kResult.resultDigest !== D2N_D2K_RESULT_DIGEST ||
        bundle.d2kResult.rawExportDigest !== bundle.d2kRaw.exportDigest ||
        bundle.d2mResult.sourceBindings.d2kRawDigest !== bundle.d2kRaw.exportDigest ||
        bundle.d2mResult.sourceBindings.d2kResultDigest !== bundle.d2kResult.resultDigest) {
        throw new Error('D2N parent result or raw-export digest drifted.');
    }
    if (bundle.d2kRaw.sourceBindings.crpmMethodCommit !== D2N_CRPM_COMMIT ||
        bundle.d2kRaw.sourceBindings.modelSha256 !== D2N_MODEL_SHA256 ||
        bundle.d2kRaw.sourceBindings.configSha256 !== D2N_CONFIG_SHA256) {
        throw new Error('D2N model, config, or CRPM method binding drifted.');
    }
    if (bundle.d2kRaw.carriers.length !== 24 || bundle.d2kRaw.voyages.length !== 6000 ||
        bundle.d2mResult.localCharts.length !== 6 ||
        bundle.d2mResult.transportAliasingWitnesses.length !== 2) {
        throw new Error('D2N fixed carrier or atlas topology drifted.');
    }
}

function buildCarrierRecords(bundle: D2NInputBundle): CarrierRecord[] {
    const assessmentByRef = new Map(bundle.d2kResult.carrierAssessments.map((item) => [item.carrierRef, item]));
    return [...bundle.d2kRaw.carriers]
        .sort((left, right) => compareCanonicalText(left.carrierRef, right.carrierRef))
        .map((carrier) => {
            const assessment = assessmentByRef.get(carrier.carrierRef);
            if (!assessment) throw new Error(`${carrier.carrierRef} lacks its D2K carrier assessment.`);
            const immediate = normalizedImmediateRelation(carrier, assessment);
            return {
                carrier,
                assessment,
                baseProjectionDigest: sha256Digest(immediate.support),
                protectedTargetDigest: sha256Digest(
                    normalizedContinuationRelation(carrier, assessment, bundle.d2kRaw.voyages)
                ),
                normalizedPolicySelection: immediate.policySelections as JsonValue
            };
        });
}

function partitionDigest(sourceByCarrier: ReadonlyMap<string, string>): string {
    const blocks = new Map<string, string[]>();
    for (const [carrierRef, sourceClass] of sourceByCarrier) {
        blocks.set(sourceClass, [...(blocks.get(sourceClass) ?? []), carrierRef]);
    }
    const normalized = [...blocks.values()]
        .map((items) => items.sort(compareCanonicalText))
        .sort((left, right) => compareCanonicalText(canonicalJson(left), canonicalJson(right)));
    return sha256Digest(normalized);
}

function carrierAt(
    records: readonly CarrierRecord[],
    distance: 639 | 640 | 641,
    cycleIndex: CycleIndex,
    firstActor: Actor,
    mirrored: boolean
): CarrierRecord {
    const record = records.find((item) =>
        item.carrier.startingDistance === distance && item.carrier.cycleIndex === cycleIndex &&
        item.carrier.firstActor === firstActor && item.carrier.mirrored === mirrored
    );
    if (!record) throw new Error(`Missing D2N carrier ${distance}/${cycleIndex}/${firstActor}/${mirrored}.`);
    return record;
}

function assessRefinements(records: readonly CarrierRecord[]) {
    const definitions = refinementDefinitions();
    const drafts: Array<{
        definition: RefinementDefinition;
        sourceByCarrier: Map<string, string>;
        partitionDigest: string;
        sourceClassCount: number;
        aliasWitnesses: ReturnType<typeof D2NAliasingWitnessSchema.parse>[];
        overrefinementWitnesses: ReturnType<typeof D2NOverrefinementWitnessSchema.parse>[];
    }> = [];

    for (const definition of definitions) {
        const sourceByCarrier = new Map<string, string>();
        const groups = new Map<string, CarrierRecord[]>();
        for (const record of records) {
            const sourceClass = sha256Digest({
                baseProjectionDigest: record.baseProjectionDigest,
                refinement: definition.value(record)
            });
            sourceByCarrier.set(record.carrier.carrierRef, sourceClass);
            groups.set(sourceClass, [...(groups.get(sourceClass) ?? []), record]);
        }

        const aliasWitnesses = [...groups.entries()].flatMap(([sourceClassDigest, items]) => {
            const targetGroups = new Map<string, string[]>();
            for (const item of items) {
                targetGroups.set(item.protectedTargetDigest, [
                    ...(targetGroups.get(item.protectedTargetDigest) ?? []),
                    item.carrier.carrierRef
                ]);
            }
            if (targetGroups.size <= 1) return [];
            const payload = {
                schemaVersion: 1 as const,
                refinementId: definition.id,
                sourceClassDigest,
                targetClasses: [...targetGroups.entries()]
                    .map(([targetClassDigest, carrierRefs]) => ({
                        targetClassDigest,
                        carrierRefs: carrierRefs.sort(compareCanonicalText)
                    }))
                    .sort((left, right) => compareCanonicalText(left.targetClassDigest, right.targetClassDigest)),
                carrierRefs: items.map((item) => item.carrier.carrierRef).sort(compareCanonicalText),
                finiteDomainStatement: 'This source-class split is finite F4 evidence over the exact 24 D2K carriers and does not prove global insufficiency or a causal coordinate.'
            };
            const witnessDigest = sha256Digest(payload);
            return [D2NAliasingWitnessSchema.parse({
                witnessRef: `d2n-alias-${witnessDigest.slice(0, 24)}`,
                ...payload,
                witnessDigest
            })];
        });

        const overrefinementWitnesses = ([1, 2] as const).flatMap((cycleIndex) =>
            (['player', 'loomkeeper'] as const).flatMap((firstActor) =>
                ([false, true] as const).flatMap((mirrored) => {
                    const left = carrierAt(records, 639, cycleIndex, firstActor, mirrored);
                    const right = carrierAt(records, 640, cycleIndex, firstActor, mirrored);
                    const leftSourceClassDigest = sourceByCarrier.get(left.carrier.carrierRef);
                    const rightSourceClassDigest = sourceByCarrier.get(right.carrier.carrierRef);
                    if (!leftSourceClassDigest || !rightSourceClassDigest) {
                        throw new Error('D2N lost a matched 639/640 source class.');
                    }
                    if (left.protectedTargetDigest !== right.protectedTargetDigest ||
                        leftSourceClassDigest === rightSourceClassDigest) return [];
                    const payload = {
                        schemaVersion: 1 as const,
                        refinementId: definition.id,
                        cycleIndex,
                        firstActor,
                        mirrored,
                        leftCarrierRef: left.carrier.carrierRef,
                        rightCarrierRef: right.carrier.carrierRef,
                        leftDistance: 639 as const,
                        rightDistance: 640 as const,
                        sharedTargetClassDigest: left.protectedTargetDigest,
                        leftSourceClassDigest,
                        rightSourceClassDigest,
                        reason: 'The refinement separates a matched 639/640 pair whose protected continuation relation remains equal.'
                    };
                    const witnessDigest = sha256Digest(payload);
                    return [D2NOverrefinementWitnessSchema.parse({
                        witnessRef: `d2n-overrefinement-${witnessDigest.slice(0, 24)}`,
                        ...payload,
                        witnessDigest
                    })];
                })
            )
        );

        drafts.push({
            definition,
            sourceByCarrier,
            partitionDigest: partitionDigest(sourceByCarrier),
            sourceClassCount: groups.size,
            aliasWitnesses,
            overrefinementWitnesses
        });
    }

    const assessments = drafts.map((draft): D2NRefinementAssessment => {
        const aliasedCarrierCount = draft.aliasWitnesses.reduce(
            (total, witness) => total + witness.carrierRefs.length,
            0
        );
        const deterministicMapEligible = draft.aliasWitnesses.length === 0;
        const equivalent = drafts
            .filter((item) => item.partitionDigest === draft.partitionDigest)
            .map((item) => item.definition.id);
        const classification = draft.definition.id === 'none_control'
            ? 'destructive_control' as const
            : !deterministicMapEligible
                ? 'insufficient_alias' as const
                : draft.overrefinementWitnesses.length > 0
                    ? 'congruent_overrefined' as const
                    : 'congruent_covariant' as const;
        return D2NRefinementAssessmentSchema.parse({
            schemaVersion: 1,
            refinementRef: `d2n-refinement-${draft.definition.id.replaceAll('_', '-')}`,
            refinementId: draft.definition.id,
            declaredCoordinates: draft.definition.coordinates,
            sourceClassCount: draft.sourceClassCount,
            protectedTargetClassCount: 4,
            aliasClassCount: draft.aliasWitnesses.length,
            aliasedCarrierCount,
            deterministicMapEligible,
            recommendedShape: deterministicMapEligible ? 'map' : 'relation_or_kernel',
            partitionDigest: draft.partitionDigest,
            partitionEquivalentRefinements: equivalent,
            matchedEqualTargetSplitCount: draft.overrefinementWitnesses.length,
            aliasWitnessRefs: draft.aliasWitnesses.map((item) => item.witnessRef),
            overrefinementWitnessRefs: draft.overrefinementWitnesses.map((item) => item.witnessRef),
            publicFormationMode: draft.definition.publicFormationMode,
            declaredSupport: draft.definition.declaredSupport,
            transportability: draft.definition.transportability,
            targetRelevance: draft.definition.targetRelevance,
            classification,
            reasons: [
                draft.definition.semanticReason,
                deterministicMapEligible
                    ? `All ${records.length} carriers have one protected target per refined source class in the declared domain.`
                    : `${draft.aliasWitnesses.length} refined source classes still split across protected continuation targets.`,
                draft.overrefinementWitnesses.length > 0
                    ? `${draft.overrefinementWitnesses.length} matched 639/640 equal-target pairs are unnecessarily separated.`
                    : 'The refinement does not split any of the eight matched 639/640 equal-target controls.',
                equivalent.length > 1
                    ? `This carrier partition is shared by ${equivalent.join(', ')}; partition equality does not choose a semantic representative.`
                    : 'This partition is not shared by another declared refinement candidate.'
            ]
        });
    });

    return {
        assessments,
        aliasingWitnesses: drafts.flatMap((item) => item.aliasWitnesses),
        overrefinementWitnesses: drafts.flatMap((item) => item.overrefinementWitnesses)
    };
}

function assertExpectedRefinementWake(assessments: readonly D2NRefinementAssessment[]): void {
    const expected: Record<D2NRefinementId, [number, number, number, number]> = {
        none_control: [2, 2, 24, 0],
        responder_phase: [4, 0, 0, 0],
        completed_turn_position: [4, 0, 0, 0],
        path_kind_prefix: [4, 0, 0, 0],
        relative_separation: [6, 0, 0, 8],
        formation_lifetime_support: [2, 2, 24, 0],
        resource_support: [2, 2, 24, 0],
        policy_selection_relation: [3, 3, 24, 0],
        orientation_metadata: [8, 8, 24, 0],
        phase_plus_separation: [6, 0, 0, 8],
        route_plus_formation: [4, 0, 0, 0],
        policy_plus_orientation: [12, 4, 12, 0]
    };
    for (const item of assessments) {
        const actual = [
            item.sourceClassCount,
            item.aliasClassCount,
            item.aliasedCarrierCount,
            item.matchedEqualTargetSplitCount
        ];
        if (canonicalJson(actual) !== canonicalJson(expected[item.refinementId])) {
            throw new Error(`D2N refinement wake drifted for ${item.refinementId}.`);
        }
    }
}

function assessmentById(
    assessments: readonly D2NRefinementAssessment[],
    id: D2NRefinementId
): D2NRefinementAssessment {
    const assessment = assessments.find((item) => item.refinementId === id);
    if (!assessment) throw new Error(`Missing D2N refinement ${id}.`);
    return assessment;
}

function buildPartitionFamilies(
    assessments: readonly D2NRefinementAssessment[]
): D2NPartitionFamily[] {
    const definitions: Array<{
        id: D2NPartitionFamily['familyId'];
        members: D2NRefinementId[];
        status: D2NPartitionFamily['semanticStatus'];
        reasons: string[];
    }> = [
        {
            id: 'base_current_support',
            members: ['none_control', 'formation_lifetime_support', 'resource_support'],
            status: 'insufficient',
            reasons: [
                'Current preparation/Cocoon, Stitching, and Escape Slack add no carrier partition beyond the base response support.',
                'The family leaves both twelve-carrier cycle classes aliased and is a negative refinement control.'
            ]
        },
        {
            id: 'interface_covariant',
            members: ['responder_phase', 'completed_turn_position', 'path_kind_prefix', 'route_plus_formation'],
            status: 'target_congruent_covariant',
            reasons: [
                'All four candidates induce the same four-class partition and make the finite continuation target congruent.',
                'They are co-formed at the 640/641 predecessor seam, so the present domain cannot choose one semantic axis.',
                'Path history requires trace support even though it shares a partition with current phase and completed turns.'
            ]
        },
        {
            id: 'geometry_fine',
            members: ['relative_separation', 'phase_plus_separation'],
            status: 'target_congruent_overrefined',
            reasons: [
                'Both candidates remove target aliasing but produce six source classes instead of the four protected target classes.',
                'They split all eight matched 639/640 controls over a one-unit separation that does not change the protected continuation relation.'
            ]
        },
        {
            id: 'policy_selection',
            members: ['policy_selection_relation'],
            status: 'insufficient',
            reasons: [
                'Policy selection leaves three source classes aliased and all 24 carriers inside an alias.',
                'A selector relation cannot replace missing route or phase support.'
            ]
        },
        {
            id: 'orientation',
            members: ['orientation_metadata'],
            status: 'insufficient',
            reasons: [
                'First-actor and mirror metadata create eight classes but every class still crosses the 640/641 continuation split.',
                'Scenario orientation is a covariance index, not a bridge repair.'
            ]
        },
        {
            id: 'policy_orientation',
            members: ['policy_plus_orientation'],
            status: 'insufficient',
            reasons: [
                'The combined support reduces but does not remove aliasing: four classes containing twelve carriers still split.',
                'More labels do not restore ordered composition when the predecessor seam remains forgotten.'
            ]
        }
    ];

    return definitions.map((definition) => {
        const members = definition.members.map((id) => assessmentById(assessments, id));
        const digests = uniqueSorted(members.map((item) => item.partitionDigest));
        const classCounts = uniqueSorted(members.map((item) => String(item.sourceClassCount)));
        const eligibility = new Set(members.map((item) => item.deterministicMapEligible));
        const splitCounts = uniqueSorted(members.map((item) => String(item.matchedEqualTargetSplitCount)));
        if (digests.length !== 1 || classCounts.length !== 1 || eligibility.size !== 1 || splitCounts.length !== 1) {
            throw new Error(`D2N partition family ${definition.id} is not internally equivalent.`);
        }
        return D2NPartitionFamilySchema.parse({
            familyRef: `d2n-family-${definition.id.replaceAll('_', '-')}`,
            familyId: definition.id,
            memberRefinements: definition.members,
            partitionDigest: digests[0],
            sourceClassCount: members[0]?.sourceClassCount,
            deterministicMapEligible: members[0]?.deterministicMapEligible,
            matchedEqualTargetSplitCountPerRefinement: members[0]?.matchedEqualTargetSplitCount,
            semanticStatus: definition.status,
            representativeSelectionAllowed: false,
            reasons: definition.reasons
        });
    });
}

function chartRef(bundle: D2NInputBundle, distance: 640 | 641, cycleIndex: CycleIndex): string {
    const chart = bundle.d2mResult.localCharts.find((item) =>
        item.startingDistance === distance && item.cycleIndex === cycleIndex
    );
    if (!chart) throw new Error(`D2N cannot re-enter D2M chart ${distance}/${cycleIndex}.`);
    return chart.chartRef;
}

function buildPredecessorDivergences(
    bundle: D2NInputBundle,
    records: readonly CarrierRecord[]
) {
    return ([1, 2] as const).flatMap((cycleIndex) =>
        (['player', 'loomkeeper'] as const).flatMap((firstActor) =>
            ([false, true] as const).map((mirrored) => {
                const left = carrierAt(records, 640, cycleIndex, firstActor, mirrored);
                const right = carrierAt(records, 641, cycleIndex, firstActor, mirrored);
                const leftKinds = pathKindPrefix(left);
                const rightKinds = pathKindPrefix(right);
                const comparisonLength = Math.min(leftKinds.length, rightKinds.length);
                let earliestActionKindIndex = -1;
                for (let index = 0; index < comparisonLength; index += 1) {
                    if (leftKinds[index] !== rightKinds[index]) {
                        earliestActionKindIndex = index;
                        break;
                    }
                }
                const leftActionKey = left.carrier.pathPrefixActions[earliestActionKindIndex];
                const rightActionKey = right.carrier.pathPrefixActions[earliestActionKindIndex];
                if (earliestActionKindIndex !== 1 || !leftActionKey || !rightActionKey ||
                    actionKind(leftActionKey) !== 'prepare_spoolburst' || actionKind(rightActionKey) !== 'relocate' ||
                    right.carrier.completedTurns - left.carrier.completedTurns !== 1 ||
                    left.carrier.responderPhase !== 'first' || right.carrier.responderPhase !== 'second' ||
                    relativeSeparation(left) !== 512 || relativeSeparation(right) !== 449 ||
                    canonicalJson(formationValue(left)) !== canonicalJson(formationValue(right)) ||
                    canonicalJson(resourceValue(left)) !== canonicalJson(resourceValue(right)) ||
                    left.protectedTargetDigest === right.protectedTargetDigest) {
                    throw new Error(`D2N predecessor seam drifted for ${cycleIndex}/${firstActor}/${mirrored}.`);
                }
                const payload = {
                    schemaVersion: 1 as const,
                    cycleIndex,
                    firstActor,
                    mirrored,
                    leftCarrierRef: left.carrier.carrierRef,
                    rightCarrierRef: right.carrier.carrierRef,
                    leftChartRef: chartRef(bundle, 640, cycleIndex),
                    rightChartRef: chartRef(bundle, 641, cycleIndex),
                    leftDistance: 640 as const,
                    rightDistance: 641 as const,
                    divergenceLocation: 'predecessor_route_before_response_carrier' as const,
                    earliestActionKindIndex: 1 as const,
                    leftActionKind: 'prepare_spoolburst' as const,
                    rightActionKind: 'relocate' as const,
                    leftActionKey,
                    rightActionKey,
                    leftPrefixLength: leftKinds.length as 2 | 6,
                    rightPrefixLength: rightKinds.length as 3 | 7,
                    completedTurnDelta: 1 as const,
                    leftResponderPhase: 'first' as const,
                    rightResponderPhase: 'second' as const,
                    leftSeparation: 512 as const,
                    rightSeparation: 449 as const,
                    formationLifetimeSupportEqual: true as const,
                    resourceSupportEqual: true as const,
                    protectedContinuationTargetEqual: false as const,
                    coformedCoordinates: [
                        'path_kind_prefix',
                        'completed_turn_position',
                        'responder_phase',
                        'relative_separation'
                    ] as const,
                    residual: [
                        'absolute-direction', 'action-target', 'path-prefix',
                        'completed-turns', 'responder-phase', 'relative-separation',
                        'continuation-relation', 'excluded-authority-ports'
                    ]
                };
                const witnessDigest = sha256Digest(payload);
                return D2NPredecessorDivergenceSchema.parse({
                    witnessRef: `d2n-divergence-${witnessDigest.slice(0, 24)}`,
                    ...payload,
                    witnessDigest
                });
            })
        )
    );
}

export function assessF4BridgeCalibration(value: unknown): D2NResult {
    const bundle = D2NInputBundleSchema.parse(value);
    assertParentBindings(bundle);
    const records = buildCarrierRecords(bundle);
    const targetClassCount = new Set(records.map((item) => item.protectedTargetDigest)).size;
    if (targetClassCount !== 4) throw new Error(`D2N expected four protected target classes, found ${targetClassCount}.`);

    const {
        assessments,
        aliasingWitnesses,
        overrefinementWitnesses
    } = assessRefinements(records);
    assertExpectedRefinementWake(assessments);
    if (aliasingWitnesses.length !== 21 || overrefinementWitnesses.length !== 16) {
        throw new Error('D2N alias or over-refinement witness topology drifted.');
    }
    const partitionFamilies = buildPartitionFamilies(assessments);
    const predecessorDivergenceWitnesses = buildPredecessorDivergences(bundle, records);
    const divergenceRefs = predecessorDivergenceWitnesses.map((item) => item.witnessRef);
    const interfaceFamily = partitionFamilies.find((item) => item.familyId === 'interface_covariant');
    const geometryFamily = partitionFamilies.find((item) => item.familyId === 'geometry_fine');
    if (!interfaceFamily || !geometryFamily) throw new Error('D2N lacks its bridge partition families.');

    const refinementRef = (id: D2NRefinementId) => assessmentById(assessments, id).refinementRef;
    const formationAliases = [
        ...assessmentById(assessments, 'formation_lifetime_support').aliasWitnessRefs,
        ...assessmentById(assessments, 'resource_support').aliasWitnessRefs
    ];
    const readinessJudgments = [
        {
            target: 'continuation_transport' as const,
            status: 'prepared_bounded' as const,
            reasons: [
                'The interface-covariant family induces exactly four source classes for four protected continuation classes with no alias.',
                'Phase, completed turns, and path-kind history remain semantically unresolved despite their equal finite partition.'
            ],
            witnessRefs: [interfaceFamily.familyRef, ...divergenceRefs]
        },
        {
            target: 'ordered_composition_reentry' as const,
            status: 'requires_trace_support' as const,
            reasons: [
                'The earliest stable divergence is an extra predecessor relocation before response-carrier formation.',
                'Current phase or completed turns correlate with that route but cannot reconstruct its action order without retained path support.'
            ],
            witnessRefs: [refinementRef('path_kind_prefix'), refinementRef('route_plus_formation'), ...divergenceRefs]
        },
        {
            target: 'actor_role_transport' as const,
            status: 'requires_explicit_phase' as const,
            reasons: [
                'Every matched 640/641 pair changes the responder from first to second phase at the predecessor seam.',
                'Path length, completed turns, and separation cannot silently stand in for the protected actor-role claim.'
            ],
            witnessRefs: [refinementRef('responder_phase'), ...divergenceRefs]
        },
        {
            target: 'formation_support_sufficiency' as const,
            status: 'failed' as const,
            reasons: [
                'Current preparation/Cocoon lifetime and Stitching/Escape-Slack resource support add no partition beyond the aliased base.',
                'All eight boundary pairs have equal current formation and resource support while their protected continuations differ.'
            ],
            witnessRefs: [
                refinementRef('formation_lifetime_support'),
                refinementRef('resource_support'),
                ...formationAliases,
                ...divergenceRefs
            ]
        },
        {
            target: 'expanded_chart_admission' as const,
            status: 'decorrelation_required' as const,
            reasons: [
                'One finite target-congruent partition exists, but four refinement labels share it and no semantic representative is licensed.',
                'Exact separation is sufficient only by over-refining all eight known-equal 639/640 controls.',
                'A later chart must find reachable matched twins that separate route history, responder phase, completed turns, and geometry before choosing axes.'
            ],
            witnessRefs: [interfaceFamily.familyRef, geometryFamily.familyRef, ...divergenceRefs]
        }
    ];

    const sourceBindings = D2NSourceBindingsSchema.parse({
        repositoryId: 'worms-port',
        sourceCommit: '99818455eb24f5d46eb965dcc3e0b07125c424e2',
        crpmMethodCommit: D2N_CRPM_COMMIT,
        d2mResultDigest: bundle.d2mResult.resultDigest,
        d2kRawDigest: bundle.d2kRaw.exportDigest,
        d2kResultDigest: bundle.d2kResult.resultDigest,
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
            compatibilityFibre: '4584b57499cbd90948d8d07557e5b01ede894906',
            quotientObserver: '4dbcfde422b16a83eec9604fbe2d0e3df1780f03',
            m9FormationCalibration: '499522e4d4d763ad633aef016a0fcf64fbc1f532',
            insightLog: '7b935dd881781dc2524b833ca01792c6d1c4ae86'
        }
    });

    const payload = {
        schemaVersion: 1 as const,
        resultId: 'wp-015d2n-f4-bridge-calibration' as const,
        sourceBindings,
        domain: {
            configId: bundle.d2kRaw.sourceBindings.configId,
            startingDistances: [639, 640, 641] as const,
            cycleIndices: [1, 2] as const,
            firstActors: ['player', 'loomkeeper'] as const,
            mirrored: [false, true] as const,
            carrierCount: 24 as const,
            legalResponseCount: 240 as const,
            continuationVoyageCount: 6000 as const,
            continuationPolicyPairCount: 25 as const,
            baseSourceClassCount: 2 as const,
            protectedTargetClassCount: 4 as const,
            matchedBoundaryPairCount: 8 as const,
            seed: 3237998097 as const,
            maximumTurns: 16 as const,
            baseProjection: 'd2m_actor_relative_immediate_response_support' as const,
            protectedSuccessor: 'd2m_complete_actor_relative_continuation_relation' as const,
            exclusions: [
                'terrain', 'aim', 'trajectory', 'splash', 'hidden-information',
                'human-adaptation', 'live-loomkeeper', 'ui', 'replay',
                'networking', 'rewards', 'assets', 'production-state'
            ] as const
        },
        refinementAssessments: assessments,
        partitionFamilies,
        aliasingWitnesses,
        overrefinementWitnesses,
        predecessorDivergenceWitnesses,
        readinessJudgments,
        globalDisposition: {
            classification: 'covariant_bridge_family_requires_decorrelation' as const,
            selectedBridgeAxis: null,
            eligibleBridgeFamilyRef: interfaceFamily.familyRef,
            strongestFinding: 'The F4 split is formed before the response carrier: one additional 641 relocation co-forms route history, completed-turn position, responder-phase reversal, and separation. Phase, turns, and path history induce one exact finite target partition, so F4 cannot select among them; exact separation is sufficient only by over-refining known-equal 639/640 continuations.',
            matchedTwinRequirements: [
                'same_phase_and_route_history_with_different_separation',
                'same_separation_and_current_support_with_different_phase_or_route_history',
                'same_current_formation_and_resources_with_decorrelated_route_phase_geometry'
            ] as const,
            nextPermittedAction: 'Contract a mechanics-fixed reachability search for natural F4 matched twins that decorrelate route history, responder phase, completed turns, and separation. Do not construct synthetic states or select a gameplay axis inside D2N; if reachable twins do not exist, review a V4/playtest-backed cut.',
            reasons: [
                'The base, current formation, and current resource cuts each leave two twelve-carrier source classes split across four continuation targets.',
                'Responder phase, completed turns, path-kind prefix, and route-plus-formation all produce the same four-class target-congruent partition.',
                'Equal partitions make the family operationally useful but cannot distinguish causal or representational meaning.',
                'Separation produces six classes and splits all eight matched 639/640 pairs despite equal continuation targets.',
                'Policy selection, orientation, and their combination retain explicit aliases.',
                'No new transition, matched-twin intervention, or excluded authority port was executed.'
            ]
        },
        accumulatedResidue: [
            'route-history', 'completed-turns', 'responder-phase', 'relative-separation',
            'absolute-direction', 'action-target', 'formation-lifetime', 'stitching',
            'escape-slack', 'policy-selection', 'first-actor', 'mirror',
            'continuation-relation', 'partition-covariance', 'overrefinement',
            'trace-support', 'excluded-authority-ports', 'source-history'
        ],
        blockedClaims: [
            'A finite target-congruent refinement is not automatically causal, minimal, globally sufficient, or suitable gameplay state.',
            'Equal carrier partitions do not make responder phase, completed turns, and path history semantically interchangeable.',
            'A chosen representative cannot repair or explain a split fibre.',
            'Exact separation is not preferred merely because it removes aliasing; it retains target-irrelevant 639/640 residue.',
            'Current preparation/Cocoon and resources being insufficient does not make them irrelevant to every tactical target.',
            'Policy or orientation metadata cannot reconstruct the forgotten predecessor route.',
            'The extra 641 relocation is a route-formation landmark, not a sole-cause proof or candidate mechanic.',
            'D2N does not establish a closed route, fibre action, holonomy, global geometry, or source-history recovery.',
            'Correlated D2K and D2M reuse strengthens re-entry but supplies no independent empirical weight.',
            'No D2N result authorizes a policy, Loomkeeper, mechanic, V5, client, server, protocol, replay, reward, wallet, UI, asset, or production change.'
        ],
        reentryInstructions: [
            'Verify the D2M base commit, clean CRPM method commit, D2M/D2K digests, model/config hashes, seed, and horizon.',
            'Regenerate D2M and D2K through their fixed modules before assessing D2N.',
            'Read partition families before individual refinement labels and preserve equal partitions as covariance.',
            'Re-enter every 640/641 seam through its two carrier refs, two D2M chart refs, and path-prefix actions.',
            'Treat geometry over-refinement and current-support aliases as required negative controls.',
            'Do not select one interface coordinate without later natural matched twins that decorrelate the family.',
            'If a mechanics-fixed reachability search cannot produce those twins, reopen the authority-cut question rather than synthesizing evidence.'
        ],
        productAuthority: 'none' as const
    };
    return D2NResultSchema.parse({ ...payload, resultDigest: sha256Digest(payload) });
}

export function canonicalD2NResult(result: D2NResult): string {
    return canonicalJson(D2NResultSchema.parse(result));
}
