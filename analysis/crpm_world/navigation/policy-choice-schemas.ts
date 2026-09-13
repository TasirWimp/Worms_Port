import { z } from 'zod';

import { canonicalJson, sha256Digest, type JsonValue } from '../canonical';
import {
    D2HActorStateSchema,
    D2HCarrierSchema,
    D2HSelectedActionSchema
} from './reachable-carrier-schemas';

export const D2K_SCHEMA_VERSION = 1 as const;
export const D2K_EXPORT_ID = 'wp-015d2k-mechanics-fixed-policy-choice-relation' as const;
export const D2K_RESULT_ID = 'wp-015d2k-policy-choice-relation-assessment' as const;
export const D2K_SOURCE_COMMIT = '5b6233a202f3a2fa8c06515d2c8f794736c77b02' as const;
export const D2K_CRPM_COMMIT = '053c6fc0a90ed48d8667016b18a1d10106a7a2bc' as const;
export const D2K_D2I_RESULT_DIGEST = 'ff29c8a1d18a201ca9047e72f458e919151ec53cd581567219b307e393a4b7b0' as const;
export const D2K_MODEL_SHA256 = 'af0b0ec8d9893e992bdc95123a915e24a2305ee2b9fff32bce95d27cdb4c8c08' as const;
export const D2K_CONFIG_SHA256 = '5e519b09ea5e5684185bcd527600705825ba75df8f01e310adb027d09d4f54e0' as const;
export const D2K_SEED = 3237998097 as const;
export const D2K_MAXIMUM_TURNS = 16 as const;

const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const IdentifierSchema = z.string().min(1).max(260).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const TrimmedStringSchema = z.string().min(1).max(4_096).refine(
    (value) => value.trim() === value,
    'String values must be trimmed.'
);
const SafeIntegerSchema = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)
    .refine((value) => !Object.is(value, -0));
const NonNegativeSafeIntegerSchema = SafeIntegerSchema.min(0);
const ActorSchema = z.enum(['player', 'loomkeeper']);
const WinnerSchema = z.union([ActorSchema, z.literal('draw'), z.null()]);
const FinishReasonSchema = z.union([z.enum(['unravelled', 'turn_limit']), z.null()]);
export const D2KPolicySchema = z.enum([
    'range_pressure', 'medium_hold', 'short_approach', 'retreat_kite', 'best_response'
]);
export const D2KResponseKindSchema = z.enum([
    'needlepoint', 'threadball', 'spoolburst', 'counter_preparation',
    'paid_unweave', 'relocate', 'other'
]);
const ResponderResultSchema = z.enum(['responder_win', 'preparer_win', 'draw']);

const DeterministicJsonSchema = z.custom<JsonValue>((value) => {
    try {
        canonicalJson(value);
        return true;
    } catch {
        return false;
    }
}, 'Value must be deterministic JSON.');

export const D2KSourceBindingsSchema = z.strictObject({
    repositoryId: z.literal('worms-port'),
    sourceCommit: z.literal(D2K_SOURCE_COMMIT),
    crpmMethodCommit: z.literal(D2K_CRPM_COMMIT),
    d2iResultDigest: z.literal(D2K_D2I_RESULT_DIGEST),
    modelPath: z.literal('analysis/tactical_model/model.py'),
    modelSha256: z.literal(D2K_MODEL_SHA256),
    configPath: z.literal(
        'analysis/tactical_model/configs/v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4.json'
    ),
    configSha256: z.literal(D2K_CONFIG_SHA256),
    configId: z.literal(
        'v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4'
    ),
    configSchemaVersion: z.literal(11)
});

const D2KDomainSchema = z.strictObject({
    startingDistances: z.tuple([z.literal(639), z.literal(640), z.literal(641)]),
    firstActors: z.tuple([z.literal('player'), z.literal('loomkeeper')]),
    mirrored: z.tuple([z.literal(false), z.literal(true)]),
    baselinePlayerPolicy: z.literal('short_approach'),
    baselineLoomkeeperPolicy: z.literal('short_approach'),
    policyNames: z.tuple([
        z.literal('range_pressure'),
        z.literal('medium_hold'),
        z.literal('short_approach'),
        z.literal('retreat_kite'),
        z.literal('best_response')
    ]),
    orderedContinuationPolicyPairCount: z.literal(25),
    seed: z.literal(D2K_SEED),
    maximumTurns: z.literal(D2K_MAXIMUM_TURNS),
    constraints: z.array(TrimmedStringSchema).length(4)
});

export const D2KRouteSchema = z.strictObject({
    schemaVersion: z.literal(D2K_SCHEMA_VERSION),
    matchRef: IdentifierSchema,
    startingDistance: z.union([z.literal(639), z.literal(640), z.literal(641)]),
    firstActor: ActorSchema,
    mirrored: z.boolean(),
    baselineActions: z.array(TrimmedStringSchema).min(1).max(16),
    baselinePathDigest: DigestSchema,
    responseCarrierCount: NonNegativeSafeIntegerSchema,
    winner: WinnerSchema,
    finishReason: FinishReasonSchema,
    completedTurns: NonNegativeSafeIntegerSchema,
    finalCarrierDigest: DigestSchema
}).superRefine((value, context) => {
    if (value.baselinePathDigest !== sha256Digest(value.baselineActions)) {
        context.addIssue({ code: 'custom', path: ['baselinePathDigest'], message: 'Route path digest mismatch.' });
    }
});

const D2KPolicySelectionSchema = z.strictObject({
    policy: D2KPolicySchema,
    selectedActionKey: TrimmedStringSchema
});

export const D2KCarrierSchema = z.strictObject({
    schemaVersion: z.literal(D2K_SCHEMA_VERSION),
    carrierRef: IdentifierSchema,
    matchRef: IdentifierSchema,
    startingDistance: z.union([z.literal(639), z.literal(640), z.literal(641)]),
    firstActor: ActorSchema,
    mirrored: z.boolean(),
    cycleIndex: NonNegativeSafeIntegerSchema,
    responder: ActorSchema,
    responderPhase: z.enum(['first', 'second']),
    preparer: ActorSchema,
    completedTurns: NonNegativeSafeIntegerSchema,
    pathPrefixActions: z.array(TrimmedStringSchema).max(16),
    pathPrefixDigest: DigestSchema,
    sourceCarrier: D2HCarrierSchema,
    sourceCarrierDigest: DigestSchema,
    sourceRecurrenceKey: DeterministicJsonSchema,
    legalActions: z.array(D2HSelectedActionSchema).min(1).max(32),
    legalActionSetDigest: DigestSchema,
    policySelections: z.array(D2KPolicySelectionSchema).length(5)
}).superRefine((value, context) => {
    if (value.pathPrefixDigest !== sha256Digest(value.pathPrefixActions)) {
        context.addIssue({ code: 'custom', path: ['pathPrefixDigest'], message: 'Carrier path digest mismatch.' });
    }
    if (value.sourceCarrierDigest !== sha256Digest(value.sourceCarrier)) {
        context.addIssue({ code: 'custom', path: ['sourceCarrierDigest'], message: 'Source carrier digest mismatch.' });
    }
    if (value.legalActionSetDigest !== sha256Digest(value.legalActions)) {
        context.addIssue({ code: 'custom', path: ['legalActionSetDigest'], message: 'Legal action digest mismatch.' });
    }
});

export const D2KResidueSchema = z.strictObject({
    completedTurnsDelta: SafeIntegerSchema,
    distanceDelta: SafeIntegerSchema,
    damageToResponder: SafeIntegerSchema,
    damageToPreparer: SafeIntegerSchema,
    responderEscapeSlackDelta: SafeIntegerSchema,
    preparerEscapeSlackDelta: SafeIntegerSchema,
    responderPreparationDelta: SafeIntegerSchema,
    preparerPreparationDelta: SafeIntegerSchema,
    responderCocoonDelta: SafeIntegerSchema,
    preparerCocoonDelta: SafeIntegerSchema,
    responderXDelta: SafeIntegerSchema,
    preparerXDelta: SafeIntegerSchema
});

const D2KRecurrenceSchema = z.strictObject({
    firstSeenAfterCompletedTurns: NonNegativeSafeIntegerSchema,
    repeatedAfterCompletedTurns: NonNegativeSafeIntegerSchema,
    cycleTurns: NonNegativeSafeIntegerSchema,
    state: z.strictObject({
        activeActor: ActorSchema,
        player: D2HActorStateSchema,
        loomkeeper: D2HActorStateSchema
    })
});

const D2KVoyageBaseSchema = z.strictObject({
    schemaVersion: z.literal(D2K_SCHEMA_VERSION),
    carrierRef: IdentifierSchema,
    responseRef: IdentifierSchema,
    responseKind: D2KResponseKindSchema,
    responseAction: D2HSelectedActionSchema,
    immediateCarrier: D2HCarrierSchema,
    immediateCarrierDigest: DigestSchema,
    immediateResidue: D2KResidueSchema,
    playerContinuationPolicy: D2KPolicySchema,
    loomkeeperContinuationPolicy: D2KPolicySchema,
    continuationActions: z.array(TrimmedStringSchema).max(16),
    continuationPathDigest: DigestSchema,
    finalCarrier: D2HCarrierSchema,
    finalCarrierDigest: DigestSchema,
    winner: WinnerSchema,
    finishReason: FinishReasonSchema,
    completedTurns: NonNegativeSafeIntegerSchema,
    responderResult: ResponderResultSchema,
    nonterminalRecurrence: z.union([D2KRecurrenceSchema, z.null()])
});

export const D2KVoyageSchema = z.strictObject({
    voyageRef: IdentifierSchema,
    ...D2KVoyageBaseSchema.shape,
    voyageDigest: DigestSchema
}).superRefine((value, context) => {
    const { voyageRef, voyageDigest, ...payload } = value;
    const expected = sha256Digest(payload);
    if (voyageDigest !== expected) {
        context.addIssue({ code: 'custom', path: ['voyageDigest'], message: 'Voyage digest mismatch.' });
    }
    if (voyageRef !== `d2k-voyage-${expected.slice(0, 24)}`) {
        context.addIssue({ code: 'custom', path: ['voyageRef'], message: 'Voyage reference mismatch.' });
    }
    if (value.immediateCarrierDigest !== sha256Digest(value.immediateCarrier)) {
        context.addIssue({ code: 'custom', path: ['immediateCarrierDigest'], message: 'Immediate carrier digest mismatch.' });
    }
    if (value.continuationPathDigest !== sha256Digest(value.continuationActions)) {
        context.addIssue({ code: 'custom', path: ['continuationPathDigest'], message: 'Continuation path digest mismatch.' });
    }
    if (value.finalCarrierDigest !== sha256Digest(value.finalCarrier)) {
        context.addIssue({ code: 'custom', path: ['finalCarrierDigest'], message: 'Final carrier digest mismatch.' });
    }
});

const D2KRawBaseSchema = z.strictObject({
    schemaVersion: z.literal(D2K_SCHEMA_VERSION),
    exportId: z.literal(D2K_EXPORT_ID),
    sourceBindings: D2KSourceBindingsSchema,
    domain: D2KDomainSchema,
    routes: z.array(D2KRouteSchema).length(12),
    carriers: z.array(D2KCarrierSchema).min(1).max(128),
    voyages: z.array(D2KVoyageSchema).min(1).max(20_000),
    blockedClaims: z.array(TrimmedStringSchema).length(3),
    productAuthority: z.literal('none')
});

export const D2KRawExportSchema = z.strictObject({
    ...D2KRawBaseSchema.shape,
    exportDigest: DigestSchema
}).superRefine((value, context) => {
    const { exportDigest, ...payload } = value;
    if (exportDigest !== sha256Digest(payload)) {
        context.addIssue({ code: 'custom', path: ['exportDigest'], message: 'Export digest mismatch.' });
    }
});

const D2KResponseSummarySchema = z.strictObject({
    responseRef: IdentifierSchema,
    responseKind: D2KResponseKindSchema,
    actionKey: TrimmedStringSchema,
    immediateResidue: D2KResidueSchema,
    continuationCount: z.literal(25),
    responderWinCount: NonNegativeSafeIntegerSchema,
    preparerWinCount: NonNegativeSafeIntegerSchema,
    drawCount: NonNegativeSafeIntegerSchema,
    recurrenceCount: NonNegativeSafeIntegerSchema,
    distinctFinalCarrierCount: NonNegativeSafeIntegerSchema,
    distinctContinuationPathCount: NonNegativeSafeIntegerSchema,
    terminalVectorDigest: DigestSchema,
    selectedByPolicies: z.array(D2KPolicySchema).max(5)
});

const D2KDominanceWitnessSchema = z.strictObject({
    carrierRef: IdentifierSchema,
    dominantResponseRef: IdentifierSchema,
    dominantActionKey: TrimmedStringSchema,
    dominatedResponseRef: IdentifierSchema,
    dominatedActionKey: TrimmedStringSchema,
    improvedContextCount: NonNegativeSafeIntegerSchema,
    equalContextCount: NonNegativeSafeIntegerSchema,
    dominatedSelectedByPolicies: z.array(D2KPolicySchema).max(5),
    relation: z.literal('terminal_outcome_componentwise'),
    excludedResidue: z.tuple([
        z.literal('turn_count'),
        z.literal('path'),
        z.literal('position'),
        z.literal('escape_slack'),
        z.literal('status_support'),
        z.literal('excluded_authority_ports')
    ])
});

const D2KPolicyRegretSchema = z.strictObject({
    policy: D2KPolicySchema,
    selectedResponseRef: IdentifierSchema,
    selectedActionKey: TrimmedStringSchema,
    dominantResponseRefs: z.array(IdentifierSchema).min(1).max(32)
});

export const D2KCarrierAssessmentSchema = z.strictObject({
    schemaVersion: z.literal(D2K_SCHEMA_VERSION),
    carrierRef: IdentifierSchema,
    matchRef: IdentifierSchema,
    startingDistance: z.union([z.literal(639), z.literal(640), z.literal(641)]),
    firstActor: ActorSchema,
    mirrored: z.boolean(),
    cycleIndex: z.union([z.literal(1), z.literal(2)]),
    responder: ActorSchema,
    responderPhase: z.enum(['first', 'second']),
    completedTurns: NonNegativeSafeIntegerSchema,
    responderStitching: NonNegativeSafeIntegerSchema,
    preparerStitching: NonNegativeSafeIntegerSchema,
    legalActionCount: NonNegativeSafeIntegerSchema,
    selectedActionCount: NonNegativeSafeIntegerSchema,
    selectedResponseKindCount: NonNegativeSafeIntegerSchema,
    responseSummaries: z.array(D2KResponseSummarySchema).min(1).max(32),
    dominanceWitnesses: z.array(D2KDominanceWitnessSchema).max(1_024),
    policyRegretWitnesses: z.array(D2KPolicyRegretSchema).max(128),
    carrierAssessmentDigest: DigestSchema
}).superRefine((value, context) => {
    const { carrierAssessmentDigest, ...payload } = value;
    if (carrierAssessmentDigest !== sha256Digest(payload)) {
        context.addIssue({ code: 'custom', path: ['carrierAssessmentDigest'], message: 'Carrier assessment digest mismatch.' });
    }
});

const D2KBoundarySummarySchema = z.strictObject({
    schemaVersion: z.literal(D2K_SCHEMA_VERSION),
    cycleIndex: z.union([z.literal(1), z.literal(2)]),
    carrierCountByDistance: z.strictObject({
        start639: z.literal(4),
        start640: z.literal(4),
        start641: z.literal(4)
    }),
    responderPhaseByDistance: z.strictObject({
        start639: z.enum(['first', 'second']),
        start640: z.enum(['first', 'second']),
        start641: z.enum(['first', 'second'])
    }),
    legalResponseOrientationReplicasConsistent: z.boolean(),
    policySelectionOrientationReplicasConsistent: z.boolean(),
    continuationOrientationReplicasConsistent: z.boolean(),
    orientationReplicasConsistent: z.boolean(),
    exactCarrier639Equals640: z.boolean(),
    exactCarrier640Equals641: z.boolean(),
    normalizedImmediateRelation639Equals640: z.boolean(),
    normalizedImmediateRelation640Equals641: z.boolean(),
    policySelection639Equals640: z.boolean(),
    policySelection640Equals641: z.boolean(),
    continuation639Equals640: z.boolean(),
    continuation640Equals641: z.boolean(),
    reasons: z.array(TrimmedStringSchema).min(1).max(8),
    witnessCarrierRefs: z.array(IdentifierSchema).length(12)
});

const D2KGlobalSummarySchema = z.strictObject({
    routeCount: z.literal(12),
    carrierCount: z.literal(24),
    normalizedCarrierMotifCount: z.literal(6),
    legalResponseCount: z.literal(240),
    policySelectionCount: z.literal(120),
    voyageCount: z.literal(6000),
    responderWinVoyageCount: NonNegativeSafeIntegerSchema,
    preparerWinVoyageCount: NonNegativeSafeIntegerSchema,
    drawVoyageCount: NonNegativeSafeIntegerSchema,
    recurrenceVoyageCount: NonNegativeSafeIntegerSchema,
    dominanceWitnessCount: NonNegativeSafeIntegerSchema,
    dominatedPolicySelectionCount: NonNegativeSafeIntegerSchema,
    policiesWithRegretWitnesses: z.array(D2KPolicySchema).max(5),
    mirrorSensitivePolicySelectionCount: NonNegativeSafeIntegerSchema,
    mirrorSensitivePolicies: z.array(D2KPolicySchema).max(5),
    allCarriersExposeFiveSelectedResponseKinds: z.boolean(),
    allVoyagesTerminal: z.boolean()
});

const D2KNavigationWakeSchema = z.strictObject({
    classification: z.enum([
        'retain_mechanics_refine_policy_question',
        'retain_mechanics_no_policy_defect',
        'escalate_authority_playtest_cut',
        'return_to_navigation_chart'
    ]),
    reasons: z.array(TrimmedStringSchema).min(1).max(12),
    witnessRefs: z.array(IdentifierSchema).min(1).max(128),
    nextPermittedAction: TrimmedStringSchema
});

const D2KResultBaseSchema = z.strictObject({
    schemaVersion: z.literal(D2K_SCHEMA_VERSION),
    resultId: z.literal(D2K_RESULT_ID),
    sourceBindings: D2KSourceBindingsSchema,
    rawExportDigest: DigestSchema,
    carrierAssessments: z.array(D2KCarrierAssessmentSchema).length(24),
    boundarySummaries: z.array(D2KBoundarySummarySchema).length(2),
    globalSummary: D2KGlobalSummarySchema,
    navigationWake: D2KNavigationWakeSchema,
    accumulatedResidue: z.array(IdentifierSchema).min(1).max(32),
    blockedClaims: z.array(TrimmedStringSchema).min(1).max(24),
    productAuthority: z.literal('none')
});

export const D2KResultSchema = z.strictObject({
    ...D2KResultBaseSchema.shape,
    resultDigest: DigestSchema
}).superRefine((value, context) => {
    const { resultDigest, ...payload } = value;
    if (resultDigest !== sha256Digest(payload)) {
        context.addIssue({ code: 'custom', path: ['resultDigest'], message: 'Result digest mismatch.' });
    }
});

export type D2KRawExport = z.infer<typeof D2KRawExportSchema>;
export type D2KCarrier = z.infer<typeof D2KCarrierSchema>;
export type D2KVoyage = z.infer<typeof D2KVoyageSchema>;
export type D2KCarrierAssessment = z.infer<typeof D2KCarrierAssessmentSchema>;
export type D2KResult = z.infer<typeof D2KResultSchema>;
