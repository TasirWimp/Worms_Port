import { z } from 'zod';

import { sha256Digest } from '../canonical';
import { D2IResultSchema } from './cocoon-voyage-schemas';
import {
    D2KRawExportSchema,
    D2KResponseKindSchema,
    D2KResultSchema
} from './policy-choice-schemas';
import { D2LResultSchema } from './policy-transport-schemas';

export const D2M_SCHEMA_VERSION = 1 as const;
export const D2M_RESULT_ID = 'wp-015d2m-target-indexed-tactical-order-atlas' as const;
export const D2M_SOURCE_COMMIT = '502c2fdb2fca5be6a821f40561251033963e1024' as const;
export const D2M_CRPM_COMMIT = '053c6fc0a90ed48d8667016b18a1d10106a7a2bc' as const;
export const D2M_D2I_RESULT_DIGEST = 'ff29c8a1d18a201ca9047e72f458e919151ec53cd581567219b307e393a4b7b0' as const;
export const D2M_D2K_RAW_DIGEST = '47ef25b6557edaa1f477f0bdde80b0b1d8b041399adb844a22c8746f1314e769' as const;
export const D2M_D2K_RESULT_DIGEST = '5c544f6822744ac63a595ca4458bb2dfb72696836468a47bf494c628b5573832' as const;
export const D2M_D2L_RAW_DIGEST = '49a7effcf241fa3b7db519cb498ed54e83705030c365dc4986eeceaa1e018eac' as const;
export const D2M_D2L_RESULT_DIGEST = '24b24c7595a1902b2a38070fc97cbf4e0ff4a41e381ca5338b70c51f85eff8bd' as const;
export const D2M_MODEL_SHA256 = 'af0b0ec8d9893e992bdc95123a915e24a2305ee2b9fff32bce95d27cdb4c8c08' as const;
export const D2M_CONFIG_SHA256 = '5e519b09ea5e5684185bcd527600705825ba75df8f01e310adb027d09d4f54e0' as const;

const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const IdentifierSchema = z.string().min(1).max(300).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const TrimmedStringSchema = z.string().min(1).max(4_096).refine(
    (value) => value.trim() === value,
    'String values must be trimmed.'
);
const SafeIntegerSchema = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)
    .refine((value) => !Object.is(value, -0));
const NonNegativeSafeIntegerSchema = SafeIntegerSchema.min(0);
const ActorRoleSchema = z.enum(['first', 'second']);
const DistanceSchema = z.union([z.literal(639), z.literal(640), z.literal(641)]);

export const D2MProtectedTargetSchema = z.enum([
    'local_answerability',
    'local_reorganization',
    'ordered_composition',
    'recursive_terminal_closure',
    'actor_role_transport',
    'authority_reentry'
]);

export const D2MInputBundleSchema = z.strictObject({
    d2iResult: D2IResultSchema,
    d2kRaw: D2KRawExportSchema,
    d2kResult: D2KResultSchema,
    d2lResult: D2LResultSchema
});

export const D2MSourceBindingsSchema = z.strictObject({
    repositoryId: z.literal('worms-port'),
    sourceCommit: z.literal(D2M_SOURCE_COMMIT),
    crpmMethodCommit: z.literal(D2M_CRPM_COMMIT),
    d2iResultDigest: z.literal(D2M_D2I_RESULT_DIGEST),
    d2kRawDigest: z.literal(D2M_D2K_RAW_DIGEST),
    d2kResultDigest: z.literal(D2M_D2K_RESULT_DIGEST),
    d2lRawDigest: z.literal(D2M_D2L_RAW_DIGEST),
    d2lResultDigest: z.literal(D2M_D2L_RESULT_DIGEST),
    modelPath: z.literal('analysis/tactical_model/model.py'),
    modelSha256: z.literal(D2M_MODEL_SHA256),
    configPath: z.literal(
        'analysis/tactical_model/configs/v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4.json'
    ),
    configSha256: z.literal(D2M_CONFIG_SHA256),
    configId: z.literal(
        'v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4'
    ),
    configSchemaVersion: z.literal(11),
    crpmSourceBlobs: z.strictObject({
        candidateSpineGoal: z.literal('b6c39c262a6abdee235dbb754bbb0168e21a79f1'),
        candidateSpineCalibration: z.literal('8abf4a12442ab656c3a70b0b387da43eec99b03b'),
        voyageRecursiveDynamics: z.literal('25a5ad5c3c0ed32409e425419d0b152948af2290'),
        m9FormationCalibration: z.literal('499522e4d4d763ad633aef016a0fcf64fbc1f532'),
        insightLog: z.literal('7b935dd881781dc2524b833ca01792c6d1c4ae86')
    })
});

const D2MDomainSchema = z.strictObject({
    localCover: z.strictObject({
        startingDistances: z.tuple([z.literal(639), z.literal(640), z.literal(641)]),
        cycleIndices: z.tuple([z.literal(1), z.literal(2)]),
        orientationReplicasPerChart: z.literal(4),
        routeCount: z.literal(12),
        chartCount: z.literal(6),
        carrierCount: z.literal(24),
        legalResponseCount: z.literal(240),
        forcedContinuationVoyageCount: z.literal(6000),
        baselinePlayerPolicy: z.literal('short_approach'),
        baselineLoomkeeperPolicy: z.literal('short_approach')
    }),
    formationCarrier: z.strictObject({
        startingDistance: z.literal(640),
        caseScope: z.literal('F4'),
        formationVoyageCount: z.literal(80),
        orderedWitnessCount: z.literal(8),
        uniqueOrderedMatchCount: z.literal(4)
    }),
    widerTransport: z.strictObject({
        startingDistances: z.tuple([
            z.literal(448), z.literal(512), z.literal(576), z.literal(640), z.literal(704)
        ]),
        orientationCountPerDistance: z.literal(2),
        orderedPolicyPairCount: z.literal(25),
        variants: z.tuple([
            z.literal('baseline_v0'),
            z.literal('preparation_response_lethal_guard_v0')
        ]),
        comparedMatchCount: z.literal(500)
    }),
    protectedTargets: z.tuple([
        z.literal('local_answerability'),
        z.literal('local_reorganization'),
        z.literal('ordered_composition'),
        z.literal('recursive_terminal_closure'),
        z.literal('actor_role_transport'),
        z.literal('authority_reentry')
    ]),
    seed: z.literal(3237998097),
    maximumTurns: z.literal(16),
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

const D2MLocalChartBaseSchema = z.strictObject({
    schemaVersion: z.literal(D2M_SCHEMA_VERSION),
    startingDistance: DistanceSchema,
    cycleIndex: z.union([z.literal(1), z.literal(2)]),
    responderPhase: ActorRoleSchema,
    orientationReplicaCount: z.literal(4),
    representativeCarrierRef: IdentifierSchema,
    representativeSourceCarrierDigest: DigestSchema,
    representativeImmediateRelationDigest: DigestSchema,
    representativePolicySelectionDigest: DigestSchema,
    representativeContinuationRelationDigest: DigestSchema,
    carrierRefs: z.array(IdentifierSchema).length(4),
    sourceCarrierDigests: z.array(DigestSchema).length(4),
    carrierAssessmentDigests: z.array(DigestSchema).length(4),
    exactCarrierClassCount: NonNegativeSafeIntegerSchema,
    legalActionCountPerCarrier: z.literal(10),
    selectedResponseKindCountPerCarrier: z.literal(5),
    selectedResponseKinds: z.array(D2KResponseKindSchema).length(5),
    immediateRelationDigests: z.array(DigestSchema).min(1).max(4),
    policySelectionDigests: z.array(DigestSchema).min(1).max(4),
    continuationRelationDigests: z.array(DigestSchema).min(1).max(4),
    legalResponseOrientationCompatible: z.boolean(),
    policySelectionOrientationCompatible: z.boolean(),
    continuationOrientationCompatible: z.boolean(),
    allContinuationsTerminal: z.boolean(),
    recurrenceCount: NonNegativeSafeIntegerSchema,
    localSectionStatus: z.enum([
        'compatible_relation',
        'selection_split',
        'continuation_split',
        'underdeclared'
    ]),
    residue: z.array(IdentifierSchema).min(1).max(24)
});

export const D2MLocalChartSchema = z.strictObject({
    chartRef: IdentifierSchema,
    ...D2MLocalChartBaseSchema.shape,
    chartDigest: DigestSchema
}).superRefine((value, context) => {
    const { chartRef, chartDigest, ...payload } = value;
    const expected = sha256Digest(payload);
    if (chartDigest !== expected) {
        context.addIssue({ code: 'custom', path: ['chartDigest'], message: 'Chart digest mismatch.' });
    }
    if (chartRef !== `d2m-chart-${expected.slice(0, 24)}`) {
        context.addIssue({ code: 'custom', path: ['chartRef'], message: 'Chart reference mismatch.' });
    }
});

const D2MOverlapBaseSchema = z.strictObject({
    schemaVersion: z.literal(D2M_SCHEMA_VERSION),
    cycleIndex: z.union([z.literal(1), z.literal(2)]),
    leftDistance: DistanceSchema,
    rightDistance: DistanceSchema,
    leftChartRef: IdentifierSchema,
    rightChartRef: IdentifierSchema,
    exactCarrierEqual: z.boolean(),
    immediateRelationEqual: z.boolean(),
    policySelectionEqual: z.boolean(),
    continuationRelationEqual: z.boolean(),
    responderPhaseEqual: z.boolean(),
    deterministicContinuationMapEligible: z.boolean(),
    recommendedShape: z.enum(['map', 'relation_or_kernel']),
    classification: z.enum([
        'compatible_with_exact_residue',
        'continuation_split_after_local_compatibility',
        'selection_and_continuation_split_after_local_compatibility',
        'local_relation_split',
        'underdeclared'
    ]),
    witnessCarrierRefs: z.array(IdentifierSchema).length(8),
    reasons: z.array(TrimmedStringSchema).min(1).max(12)
});

export const D2MOverlapSchema = z.strictObject({
    overlapRef: IdentifierSchema,
    ...D2MOverlapBaseSchema.shape,
    overlapDigest: DigestSchema
}).superRefine((value, context) => {
    const { overlapRef, overlapDigest, ...payload } = value;
    const expected = sha256Digest(payload);
    if (overlapDigest !== expected) {
        context.addIssue({ code: 'custom', path: ['overlapDigest'], message: 'Overlap digest mismatch.' });
    }
    if (overlapRef !== `d2m-overlap-${expected.slice(0, 24)}`) {
        context.addIssue({ code: 'custom', path: ['overlapRef'], message: 'Overlap reference mismatch.' });
    }
});

const D2MAliasingWitnessBaseSchema = z.strictObject({
    schemaVersion: z.literal(D2M_SCHEMA_VERSION),
    cycleIndex: z.union([z.literal(1), z.literal(2)]),
    sourceProjection: z.literal('normalized_immediate_response_relation'),
    targetProjection: z.literal('complete_fixed_policy_continuation_relation'),
    leftChartRef: IdentifierSchema,
    rightChartRef: IdentifierSchema,
    sourceClassDigest: DigestSchema,
    leftTargetClassDigest: DigestSchema,
    rightTargetClassDigest: DigestSchema,
    deterministicMapEligible: z.literal(false),
    recommendedShape: z.literal('relation_or_kernel'),
    finiteSampleScope: TrimmedStringSchema,
    witnessCarrierRefs: z.array(IdentifierSchema).length(8),
    reasons: z.array(TrimmedStringSchema).min(1).max(8)
});

export const D2MAliasingWitnessSchema = z.strictObject({
    witnessRef: IdentifierSchema,
    ...D2MAliasingWitnessBaseSchema.shape,
    witnessDigest: DigestSchema
}).superRefine((value, context) => {
    const { witnessRef, witnessDigest, ...payload } = value;
    const expected = sha256Digest(payload);
    if (witnessDigest !== expected) {
        context.addIssue({ code: 'custom', path: ['witnessDigest'], message: 'Aliasing witness digest mismatch.' });
    }
    if (witnessRef !== `d2m-alias-${expected.slice(0, 24)}`) {
        context.addIssue({ code: 'custom', path: ['witnessRef'], message: 'Aliasing witness reference mismatch.' });
    }
    if (value.leftTargetClassDigest === value.rightTargetClassDigest) {
        context.addIssue({ code: 'custom', path: ['rightTargetClassDigest'], message: 'Aliasing targets must split.' });
    }
});

const CountRecordSchema = z.strictObject({
    needlepointAbsorbed: NonNegativeSafeIntegerSchema,
    spoolburstAbsorbed: NonNegativeSafeIntegerSchema,
    threadballBypassed: NonNegativeSafeIntegerSchema,
    unweaveCleared: NonNegativeSafeIntegerSchema,
    counterPreparation: NonNegativeSafeIntegerSchema
});

const D2MFormationLifecycleSchema = z.strictObject({
    classification: z.literal('phase_symmetric_counts_order_sensitive_composition'),
    formationCount: z.literal(80),
    firstPhaseFormationCount: z.literal(40),
    secondPhaseFormationCount: z.literal(40),
    responseCounts: CountRecordSchema,
    cocoonDispositionCounts: z.strictObject({
        consumedByNeedlepoint: NonNegativeSafeIntegerSchema,
        consumedBySpoolburst: NonNegativeSafeIntegerSchema,
        clearedByUnweave: NonNegativeSafeIntegerSchema,
        expiredOnRelease: NonNegativeSafeIntegerSchema
    }),
    resolutionCounts: z.strictObject({
        releasedSpoolburst: NonNegativeSafeIntegerSchema,
        unwoven: NonNegativeSafeIntegerSchema
    }),
    recurrenceReturnCount: z.literal(0),
    orderedWitnessCount: z.literal(8),
    uniqueOrderedMatchCount: z.literal(4),
    firstActorWinMatchCount: z.literal(4),
    finalCompletedTurns: z.literal(9),
    witnessRefs: z.array(IdentifierSchema).length(8),
    reasons: z.array(TrimmedStringSchema).min(1).max(12)
});

const D2MWiderDistanceSchema = z.strictObject({
    startingDistance: z.union([
        z.literal(448), z.literal(512), z.literal(576), z.literal(640), z.literal(704)
    ]),
    baselineFirstActorWins: NonNegativeSafeIntegerSchema,
    guardedFirstActorWins: NonNegativeSafeIntegerSchema,
    changedOutcomeCount: NonNegativeSafeIntegerSchema,
    firstActorGainCount: NonNegativeSafeIntegerSchema,
    secondActorGainCount: NonNegativeSafeIntegerSchema
});

const D2MWiderTransportSchema = z.strictObject({
    classification: z.literal('role_conditioned_transport_with_coarse_cancellation'),
    baselineFirstActorWins: z.literal(158),
    guardedFirstActorWins: z.literal(166),
    changedOutcomeCount: z.literal(24),
    firstActorGainCount: z.literal(16),
    secondActorGainCount: z.literal(8),
    distances: z.array(D2MWiderDistanceSchema).length(5),
    productionSpawnCancellation: z.strictObject({
        startingDistance: z.literal(640),
        baselineFirstActorWins: z.literal(30),
        guardedFirstActorWins: z.literal(30),
        changedOutcomeCount: z.literal(8),
        firstActorGainCount: z.literal(4),
        secondActorGainCount: z.literal(4),
        coarseReadoutEqual: z.literal(true),
        routeFamilyEqual: z.literal(false)
    }),
    phaseWitnessRefs: z.array(IdentifierSchema).length(24),
    reasons: z.array(TrimmedStringSchema).min(1).max(12)
});

const D2MTargetJudgmentSchema = z.strictObject({
    target: D2MProtectedTargetSchema,
    status: z.enum([
        'passed_bounded',
        'passed_with_residue',
        'relational',
        'failed_descent',
        'underdeclared'
    ]),
    assemblyShape: z.enum(['map', 'relation', 'relation_or_kernel', 'obstructed', 'not_applicable']),
    reasons: z.array(TrimmedStringSchema).min(1).max(12),
    witnessRefs: z.array(IdentifierSchema).min(1).max(128)
});

const D2MGlobalAssemblySchema = z.strictObject({
    classification: z.enum([
        'role_neutral_global_order_assembled_bounded',
        'local_relations_survive_global_order_relational',
        'role_neutral_global_order_not_assembled',
        'underdeclared_due_to_excluded_ports'
    ]),
    localCompatibility: z.boolean(),
    roleNeutralDescent: z.boolean(),
    realizedClosedRouteWitness: z.literal(false),
    routeActionStatus: z.enum([
        'candidate_nontrivial_route_action_not_closed_cycle',
        'trivial_on_declared_routes',
        'underdeclared'
    ]),
    strongestFinding: TrimmedStringSchema,
    reasons: z.array(TrimmedStringSchema).min(1).max(16),
    nextPermittedAction: TrimmedStringSchema
});

const D2MResultBaseSchema = z.strictObject({
    schemaVersion: z.literal(D2M_SCHEMA_VERSION),
    resultId: z.literal(D2M_RESULT_ID),
    sourceBindings: D2MSourceBindingsSchema,
    domain: D2MDomainSchema,
    localCharts: z.array(D2MLocalChartSchema).length(6),
    overlapJudgments: z.array(D2MOverlapSchema).length(4),
    transportAliasingWitnesses: z.array(D2MAliasingWitnessSchema).length(2),
    formationLifecycle: D2MFormationLifecycleSchema,
    widerTransport: D2MWiderTransportSchema,
    targetJudgments: z.array(D2MTargetJudgmentSchema).length(6),
    globalAssembly: D2MGlobalAssemblySchema,
    accumulatedResidue: z.array(IdentifierSchema).min(1).max(40),
    blockedClaims: z.array(TrimmedStringSchema).min(1).max(40),
    reentryInstructions: z.array(TrimmedStringSchema).min(1).max(16),
    productAuthority: z.literal('none')
});

export const D2MResultSchema = z.strictObject({
    ...D2MResultBaseSchema.shape,
    resultDigest: DigestSchema
}).superRefine((value, context) => {
    const { resultDigest, ...payload } = value;
    if (resultDigest !== sha256Digest(payload)) {
        context.addIssue({ code: 'custom', path: ['resultDigest'], message: 'Result digest mismatch.' });
    }
    if (new Set(value.localCharts.map((item) => item.chartRef)).size !== 6) {
        context.addIssue({ code: 'custom', path: ['localCharts'], message: 'Chart references must be unique.' });
    }
    if (new Set(value.overlapJudgments.map((item) => item.overlapRef)).size !== 4) {
        context.addIssue({ code: 'custom', path: ['overlapJudgments'], message: 'Overlap references must be unique.' });
    }
    if (new Set(value.targetJudgments.map((item) => item.target)).size !== 6) {
        context.addIssue({ code: 'custom', path: ['targetJudgments'], message: 'Protected targets must be unique.' });
    }
});

export type D2MInputBundle = z.infer<typeof D2MInputBundleSchema>;
export type D2MLocalChart = z.infer<typeof D2MLocalChartSchema>;
export type D2MOverlap = z.infer<typeof D2MOverlapSchema>;
export type D2MAliasingWitness = z.infer<typeof D2MAliasingWitnessSchema>;
export type D2MResult = z.infer<typeof D2MResultSchema>;
