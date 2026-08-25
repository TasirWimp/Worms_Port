import { z } from 'zod';

import { sha256Digest } from '../canonical';
import { D2KRawExportSchema, D2KResultSchema } from './policy-choice-schemas';
import { D2MResultSchema } from './tactical-order-atlas-schemas';

export const D2N_SCHEMA_VERSION = 1 as const;
export const D2N_RESULT_ID = 'wp-015d2n-f4-bridge-calibration' as const;
export const D2N_SOURCE_COMMIT = '99818455eb24f5d46eb965dcc3e0b07125c424e2' as const;
export const D2N_CRPM_COMMIT = '053c6fc0a90ed48d8667016b18a1d10106a7a2bc' as const;
export const D2N_D2M_RESULT_DIGEST = '882534e69ddae101d3d1e1463ddca467f2a95899be2a8e826eb14cb1dd5a55c2' as const;
export const D2N_D2K_RAW_DIGEST = '47ef25b6557edaa1f477f0bdde80b0b1d8b041399adb844a22c8746f1314e769' as const;
export const D2N_D2K_RESULT_DIGEST = '5c544f6822744ac63a595ca4458bb2dfb72696836468a47bf494c628b5573832' as const;
export const D2N_MODEL_SHA256 = 'af0b0ec8d9893e992bdc95123a915e24a2305ee2b9fff32bce95d27cdb4c8c08' as const;
export const D2N_CONFIG_SHA256 = '5e519b09ea5e5684185bcd527600705825ba75df8f01e310adb027d09d4f54e0' as const;

const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const IdentifierSchema = z.string().min(1).max(300).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const TrimmedStringSchema = z.string().min(1).max(4_096).refine(
    (value) => value.trim() === value,
    'String values must be trimmed.'
);
const SafeIntegerSchema = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)
    .refine((value) => !Object.is(value, -0));
const NonNegativeSafeIntegerSchema = SafeIntegerSchema.min(0);
const ActorSchema = z.enum(['player', 'loomkeeper']);

export const D2NRefinementIdSchema = z.enum([
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
]);

export const D2NInputBundleSchema = z.strictObject({
    d2mResult: D2MResultSchema,
    d2kRaw: D2KRawExportSchema,
    d2kResult: D2KResultSchema
});

export const D2NSourceBindingsSchema = z.strictObject({
    repositoryId: z.literal('worms-port'),
    sourceCommit: z.literal(D2N_SOURCE_COMMIT),
    crpmMethodCommit: z.literal(D2N_CRPM_COMMIT),
    d2mResultDigest: z.literal(D2N_D2M_RESULT_DIGEST),
    d2kRawDigest: z.literal(D2N_D2K_RAW_DIGEST),
    d2kResultDigest: z.literal(D2N_D2K_RESULT_DIGEST),
    modelPath: z.literal('analysis/tactical_model/model.py'),
    modelSha256: z.literal(D2N_MODEL_SHA256),
    configPath: z.literal(
        'analysis/tactical_model/configs/v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4.json'
    ),
    configSha256: z.literal(D2N_CONFIG_SHA256),
    configId: z.literal(
        'v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4'
    ),
    configSchemaVersion: z.literal(11),
    crpmSourceBlobs: z.strictObject({
        candidateSpineGoal: z.literal('b6c39c262a6abdee235dbb754bbb0168e21a79f1'),
        candidateSpineCalibration: z.literal('8abf4a12442ab656c3a70b0b387da43eec99b03b'),
        voyageRecursiveDynamics: z.literal('25a5ad5c3c0ed32409e425419d0b152948af2290'),
        compatibilityFibre: z.literal('4584b57499cbd90948d8d07557e5b01ede894906'),
        quotientObserver: z.literal('4dbcfde422b16a83eec9604fbe2d0e3df1780f03'),
        m9FormationCalibration: z.literal('499522e4d4d763ad633aef016a0fcf64fbc1f532'),
        insightLog: z.literal('7b935dd881781dc2524b833ca01792c6d1c4ae86')
    })
});

const D2NDomainSchema = z.strictObject({
    configId: z.literal(
        'v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4'
    ),
    startingDistances: z.tuple([z.literal(639), z.literal(640), z.literal(641)]),
    cycleIndices: z.tuple([z.literal(1), z.literal(2)]),
    firstActors: z.tuple([z.literal('player'), z.literal('loomkeeper')]),
    mirrored: z.tuple([z.literal(false), z.literal(true)]),
    carrierCount: z.literal(24),
    legalResponseCount: z.literal(240),
    continuationVoyageCount: z.literal(6000),
    continuationPolicyPairCount: z.literal(25),
    baseSourceClassCount: z.literal(2),
    protectedTargetClassCount: z.literal(4),
    matchedBoundaryPairCount: z.literal(8),
    seed: z.literal(3237998097),
    maximumTurns: z.literal(16),
    baseProjection: z.literal('d2m_actor_relative_immediate_response_support'),
    protectedSuccessor: z.literal('d2m_complete_actor_relative_continuation_relation'),
    exclusions: z.tuple([
        z.literal('terrain'),
        z.literal('aim'),
        z.literal('trajectory'),
        z.literal('splash'),
        z.literal('hidden-information'),
        z.literal('human-adaptation'),
        z.literal('live-loomkeeper'),
        z.literal('ui'),
        z.literal('replay'),
        z.literal('networking'),
        z.literal('rewards'),
        z.literal('assets'),
        z.literal('production-state')
    ])
});

const TargetClassSchema = z.strictObject({
    targetClassDigest: DigestSchema,
    carrierRefs: z.array(IdentifierSchema).min(1).max(24)
});

const AliasingWitnessBaseSchema = z.strictObject({
    schemaVersion: z.literal(D2N_SCHEMA_VERSION),
    refinementId: D2NRefinementIdSchema,
    sourceClassDigest: DigestSchema,
    targetClasses: z.array(TargetClassSchema).min(2).max(8),
    carrierRefs: z.array(IdentifierSchema).min(2).max(24),
    finiteDomainStatement: TrimmedStringSchema
});

export const D2NAliasingWitnessSchema = z.strictObject({
    witnessRef: IdentifierSchema,
    ...AliasingWitnessBaseSchema.shape,
    witnessDigest: DigestSchema
}).superRefine((value, context) => {
    const { witnessRef, witnessDigest, ...payload } = value;
    const expected = sha256Digest(payload);
    if (witnessDigest !== expected) {
        context.addIssue({ code: 'custom', path: ['witnessDigest'], message: 'Aliasing witness digest mismatch.' });
    }
    if (witnessRef !== `d2n-alias-${expected.slice(0, 24)}`) {
        context.addIssue({ code: 'custom', path: ['witnessRef'], message: 'Aliasing witness reference mismatch.' });
    }
});

const OverrefinementWitnessBaseSchema = z.strictObject({
    schemaVersion: z.literal(D2N_SCHEMA_VERSION),
    refinementId: D2NRefinementIdSchema,
    cycleIndex: z.union([z.literal(1), z.literal(2)]),
    firstActor: ActorSchema,
    mirrored: z.boolean(),
    leftCarrierRef: IdentifierSchema,
    rightCarrierRef: IdentifierSchema,
    leftDistance: z.literal(639),
    rightDistance: z.literal(640),
    sharedTargetClassDigest: DigestSchema,
    leftSourceClassDigest: DigestSchema,
    rightSourceClassDigest: DigestSchema,
    reason: TrimmedStringSchema
});

export const D2NOverrefinementWitnessSchema = z.strictObject({
    witnessRef: IdentifierSchema,
    ...OverrefinementWitnessBaseSchema.shape,
    witnessDigest: DigestSchema
}).superRefine((value, context) => {
    const { witnessRef, witnessDigest, ...payload } = value;
    const expected = sha256Digest(payload);
    if (witnessDigest !== expected) {
        context.addIssue({ code: 'custom', path: ['witnessDigest'], message: 'Over-refinement witness digest mismatch.' });
    }
    if (witnessRef !== `d2n-overrefinement-${expected.slice(0, 24)}`) {
        context.addIssue({ code: 'custom', path: ['witnessRef'], message: 'Over-refinement witness reference mismatch.' });
    }
    if (value.leftSourceClassDigest === value.rightSourceClassDigest) {
        context.addIssue({ code: 'custom', path: ['rightSourceClassDigest'], message: 'Over-refinement sources must split.' });
    }
});

export const D2NRefinementAssessmentSchema = z.strictObject({
    schemaVersion: z.literal(D2N_SCHEMA_VERSION),
    refinementRef: IdentifierSchema,
    refinementId: D2NRefinementIdSchema,
    declaredCoordinates: z.array(IdentifierSchema).max(8),
    sourceClassCount: NonNegativeSafeIntegerSchema,
    protectedTargetClassCount: z.literal(4),
    aliasClassCount: NonNegativeSafeIntegerSchema,
    aliasedCarrierCount: NonNegativeSafeIntegerSchema,
    deterministicMapEligible: z.boolean(),
    recommendedShape: z.enum(['map', 'relation_or_kernel']),
    partitionDigest: DigestSchema,
    partitionEquivalentRefinements: z.array(D2NRefinementIdSchema).min(1).max(12),
    matchedEqualTargetSplitCount: NonNegativeSafeIntegerSchema,
    aliasWitnessRefs: z.array(IdentifierSchema).max(24),
    overrefinementWitnessRefs: z.array(IdentifierSchema).max(24),
    publicFormationMode: z.enum([
        'none', 'current_carrier', 'trace_support', 'policy_support',
        'scenario_metadata', 'mixed'
    ]),
    declaredSupport: z.array(IdentifierSchema).max(16),
    transportability: z.enum([
        'same_type_current', 'support_augmented', 'static_context', 'not_sufficient'
    ]),
    targetRelevance: z.enum([
        'required_in_finite_domain', 'irrelevant_for_target', 'conditional', 'underdetermined'
    ]),
    classification: z.enum([
        'destructive_control',
        'congruent_covariant',
        'congruent_overrefined',
        'insufficient_alias'
    ]),
    reasons: z.array(TrimmedStringSchema).min(1).max(12)
});

const PredecessorDivergenceBaseSchema = z.strictObject({
    schemaVersion: z.literal(D2N_SCHEMA_VERSION),
    cycleIndex: z.union([z.literal(1), z.literal(2)]),
    firstActor: ActorSchema,
    mirrored: z.boolean(),
    leftCarrierRef: IdentifierSchema,
    rightCarrierRef: IdentifierSchema,
    leftChartRef: IdentifierSchema,
    rightChartRef: IdentifierSchema,
    leftDistance: z.literal(640),
    rightDistance: z.literal(641),
    divergenceLocation: z.literal('predecessor_route_before_response_carrier'),
    earliestActionKindIndex: z.literal(1),
    leftActionKind: z.literal('prepare_spoolburst'),
    rightActionKind: z.literal('relocate'),
    leftActionKey: TrimmedStringSchema,
    rightActionKey: TrimmedStringSchema,
    leftPrefixLength: z.union([z.literal(2), z.literal(6)]),
    rightPrefixLength: z.union([z.literal(3), z.literal(7)]),
    completedTurnDelta: z.literal(1),
    leftResponderPhase: z.literal('first'),
    rightResponderPhase: z.literal('second'),
    leftSeparation: z.literal(512),
    rightSeparation: z.literal(449),
    formationLifetimeSupportEqual: z.literal(true),
    resourceSupportEqual: z.literal(true),
    protectedContinuationTargetEqual: z.literal(false),
    coformedCoordinates: z.tuple([
        z.literal('path_kind_prefix'),
        z.literal('completed_turn_position'),
        z.literal('responder_phase'),
        z.literal('relative_separation')
    ]),
    residual: z.array(IdentifierSchema).min(1).max(16)
});

export const D2NPredecessorDivergenceSchema = z.strictObject({
    witnessRef: IdentifierSchema,
    ...PredecessorDivergenceBaseSchema.shape,
    witnessDigest: DigestSchema
}).superRefine((value, context) => {
    const { witnessRef, witnessDigest, ...payload } = value;
    const expected = sha256Digest(payload);
    if (witnessDigest !== expected) {
        context.addIssue({ code: 'custom', path: ['witnessDigest'], message: 'Divergence witness digest mismatch.' });
    }
    if (witnessRef !== `d2n-divergence-${expected.slice(0, 24)}`) {
        context.addIssue({ code: 'custom', path: ['witnessRef'], message: 'Divergence witness reference mismatch.' });
    }
});

export const D2NPartitionFamilySchema = z.strictObject({
    familyRef: IdentifierSchema,
    familyId: z.enum([
        'base_current_support',
        'interface_covariant',
        'geometry_fine',
        'policy_selection',
        'orientation',
        'policy_orientation'
    ]),
    memberRefinements: z.array(D2NRefinementIdSchema).min(1).max(8),
    partitionDigest: DigestSchema,
    sourceClassCount: NonNegativeSafeIntegerSchema,
    deterministicMapEligible: z.boolean(),
    matchedEqualTargetSplitCountPerRefinement: NonNegativeSafeIntegerSchema,
    semanticStatus: z.enum([
        'insufficient',
        'target_congruent_covariant',
        'target_congruent_overrefined'
    ]),
    representativeSelectionAllowed: z.literal(false),
    reasons: z.array(TrimmedStringSchema).min(1).max(12)
});

const ReadinessTargetSchema = z.enum([
    'continuation_transport',
    'ordered_composition_reentry',
    'actor_role_transport',
    'formation_support_sufficiency',
    'expanded_chart_admission'
]);

export const D2NReadinessJudgmentSchema = z.strictObject({
    target: ReadinessTargetSchema,
    status: z.enum([
        'prepared_bounded',
        'requires_trace_support',
        'requires_explicit_phase',
        'failed',
        'decorrelation_required',
        'underdeclared'
    ]),
    reasons: z.array(TrimmedStringSchema).min(1).max(12),
    witnessRefs: z.array(IdentifierSchema).min(1).max(128)
});

const D2NGlobalDispositionSchema = z.strictObject({
    classification: z.enum([
        'single_bridge_axis_supported_bounded',
        'covariant_bridge_family_requires_decorrelation',
        'current_f4_cut_underdeclared_for_bridge',
        'no_target_relevant_refinement_found'
    ]),
    selectedBridgeAxis: z.null(),
    eligibleBridgeFamilyRef: IdentifierSchema,
    strongestFinding: TrimmedStringSchema,
    matchedTwinRequirements: z.tuple([
        z.literal('same_phase_and_route_history_with_different_separation'),
        z.literal('same_separation_and_current_support_with_different_phase_or_route_history'),
        z.literal('same_current_formation_and_resources_with_decorrelated_route_phase_geometry')
    ]),
    nextPermittedAction: TrimmedStringSchema,
    reasons: z.array(TrimmedStringSchema).min(1).max(16)
});

const D2NResultBaseSchema = z.strictObject({
    schemaVersion: z.literal(D2N_SCHEMA_VERSION),
    resultId: z.literal(D2N_RESULT_ID),
    sourceBindings: D2NSourceBindingsSchema,
    domain: D2NDomainSchema,
    refinementAssessments: z.array(D2NRefinementAssessmentSchema).length(12),
    partitionFamilies: z.array(D2NPartitionFamilySchema).length(6),
    aliasingWitnesses: z.array(D2NAliasingWitnessSchema).min(1).max(24),
    overrefinementWitnesses: z.array(D2NOverrefinementWitnessSchema).length(16),
    predecessorDivergenceWitnesses: z.array(D2NPredecessorDivergenceSchema).length(8),
    readinessJudgments: z.array(D2NReadinessJudgmentSchema).length(5),
    globalDisposition: D2NGlobalDispositionSchema,
    accumulatedResidue: z.array(IdentifierSchema).min(1).max(40),
    blockedClaims: z.array(TrimmedStringSchema).min(1).max(40),
    reentryInstructions: z.array(TrimmedStringSchema).min(1).max(16),
    productAuthority: z.literal('none')
});

export const D2NResultSchema = z.strictObject({
    ...D2NResultBaseSchema.shape,
    resultDigest: DigestSchema
}).superRefine((value, context) => {
    const { resultDigest, ...payload } = value;
    if (resultDigest !== sha256Digest(payload)) {
        context.addIssue({ code: 'custom', path: ['resultDigest'], message: 'Result digest mismatch.' });
    }
    if (new Set(value.refinementAssessments.map((item) => item.refinementId)).size !== 12) {
        context.addIssue({ code: 'custom', path: ['refinementAssessments'], message: 'Refinement IDs must be unique.' });
    }
    if (new Set(value.partitionFamilies.map((item) => item.partitionDigest)).size !== 6) {
        context.addIssue({ code: 'custom', path: ['partitionFamilies'], message: 'Partition families must be unique.' });
    }
    if (new Set(value.predecessorDivergenceWitnesses.map((item) => item.witnessRef)).size !== 8) {
        context.addIssue({ code: 'custom', path: ['predecessorDivergenceWitnesses'], message: 'Divergence witnesses must be unique.' });
    }
    if (new Set(value.readinessJudgments.map((item) => item.target)).size !== 5) {
        context.addIssue({ code: 'custom', path: ['readinessJudgments'], message: 'Readiness targets must be unique.' });
    }
});

export type D2NInputBundle = z.infer<typeof D2NInputBundleSchema>;
export type D2NRefinementId = z.infer<typeof D2NRefinementIdSchema>;
export type D2NRefinementAssessment = z.infer<typeof D2NRefinementAssessmentSchema>;
export type D2NPartitionFamily = z.infer<typeof D2NPartitionFamilySchema>;
export type D2NResult = z.infer<typeof D2NResultSchema>;
