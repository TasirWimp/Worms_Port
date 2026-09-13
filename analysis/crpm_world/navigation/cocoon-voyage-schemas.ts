import { z } from 'zod';

import { sha256Digest } from '../canonical';

export const D2I_SCHEMA_VERSION = 1 as const;
export const D2I_RESULT_ID = 'wp-015d2i-cocoon-formation-ordered-transport-audit' as const;
export const D2I_SOURCE_COMMIT = '38f432fb59a37eb37d19b3aa7de1ccde9598388d' as const;
export const D2I_CRPM_COMMIT = '053c6fc0a90ed48d8667016b18a1d10106a7a2bc' as const;
export const D2I_D2H_RAW_DIGEST = '5ff3ed7d77acf29a55da422f9f7e02f8ad875349a8104f08076890179746f60f' as const;
export const D2I_D2H_RESULT_DIGEST = 'cd83a46c68f2d5968fa0d3e7af5e73bcefbe5acb18df110d1a686f9e5d8f9658' as const;

const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const IdentifierSchema = z.string().min(1).max(240).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const TrimmedStringSchema = z.string().min(1).max(4_096).refine(
    (value) => value.trim() === value,
    'String values must be trimmed.'
);
const SafeIntegerSchema = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)
    .refine((value) => !Object.is(value, -0));
const NonNegativeSafeIntegerSchema = SafeIntegerSchema.min(0);
const ActorSchema = z.enum(['player', 'loomkeeper']);
const CaseSchema = z.enum(['F4', 'I2']);
const PolicySchema = z.enum([
    'range_pressure', 'medium_hold', 'short_approach', 'retreat_kite', 'best_response'
]);
const WinnerSchema = z.union([ActorSchema, z.literal('draw'), z.null()]);
const FinishReasonSchema = z.union([z.enum(['unravelled', 'turn_limit']), z.null()]);
const RelationSchema = z.enum(['same', 'different']);

export const D2ISourceBindingsSchema = z.strictObject({
    repositoryId: z.literal('worms-port'),
    sourceCommit: z.literal(D2I_SOURCE_COMMIT),
    crpmReferenceCommit: z.literal(D2I_CRPM_COMMIT),
    d2hRawExportDigest: z.literal(D2I_D2H_RAW_DIGEST),
    d2hResultDigest: z.literal(D2I_D2H_RESULT_DIGEST),
    tacticalModelPath: z.literal('analysis/tactical_model/model.py'),
    d2hExporterPath: z.literal('analysis/tactical_model/reachable_carrier_probe.py')
});

const TargetRelationsSchema = z.strictObject({
    selectedAction: RelationSchema,
    visibleSuccessor: RelationSchema,
    tacticalRecurrenceSuccessor: RelationSchema,
    exactCarrierSuccessor: RelationSchema,
    terminalRelation: RelationSchema
});

const VisibleDefectSchema = z.strictObject({
    cause: z.literal('cocoon_absorption'),
    absorbedFor: ActorSchema,
    relicId: z.enum(['needlepoint', 'spoolburst']),
    left: z.strictObject({
        itemRef: IdentifierSchema,
        damage: NonNegativeSafeIntegerSchema,
        targetStitching: NonNegativeSafeIntegerSchema,
        cocoonBefore: NonNegativeSafeIntegerSchema,
        cocoonAfter: NonNegativeSafeIntegerSchema
    }),
    right: z.strictObject({
        itemRef: IdentifierSchema,
        damage: NonNegativeSafeIntegerSchema,
        targetStitching: NonNegativeSafeIntegerSchema,
        cocoonBefore: NonNegativeSafeIntegerSchema,
        cocoonAfter: NonNegativeSafeIntegerSchema
    })
});

export const D2ITargetWitnessSchema = z.strictObject({
    schemaVersion: z.literal(D2I_SCHEMA_VERSION),
    caseScope: CaseSchema,
    sourceClassKey: IdentifierSchema,
    leftItemRef: IdentifierSchema,
    rightItemRef: IdentifierSchema,
    leftActionKey: TrimmedStringSchema,
    rightActionKey: TrimmedStringSchema,
    sourceDifferenceFields: z.array(IdentifierSchema).min(1).max(64),
    relations: TargetRelationsSchema,
    classification: z.enum([
        'policy_selection_split',
        'matched_action_visible_descent_defect',
        'matched_action_recurrence_support_split',
        'matched_action_exact_time_residue'
    ]),
    visibleDefect: z.union([VisibleDefectSchema, z.null()])
});

const ActionCountSchema = z.strictObject({
    actionKey: TrimmedStringSchema,
    witnessCount: NonNegativeSafeIntegerSchema
});

export const D2ITargetSummarySchema = z.strictObject({
    schemaVersion: z.literal(D2I_SCHEMA_VERSION),
    caseScope: CaseSchema,
    witnessPairCount: NonNegativeSafeIntegerSchema,
    policySelectionSplitCount: NonNegativeSafeIntegerSchema,
    matchedActionPairCount: NonNegativeSafeIntegerSchema,
    visibleDescentDefectCount: NonNegativeSafeIntegerSchema,
    recurrenceSupportSplitCount: NonNegativeSafeIntegerSchema,
    exactTimeResidueCount: NonNegativeSafeIntegerSchema,
    matchedActionTerminalSplitCount: NonNegativeSafeIntegerSchema,
    visibleDefectActions: z.array(ActionCountSchema).max(16)
});

const EdgeReferenceSchema = z.strictObject({
    itemRef: IdentifierSchema,
    transitionIndex: NonNegativeSafeIntegerSchema,
    actor: ActorSchema,
    actionKey: TrimmedStringSchema,
    sourceCarrierDigest: DigestSchema,
    targetCarrierDigest: DigestSchema,
    damage: NonNegativeSafeIntegerSchema
});

const SupportDeltaSchema = z.strictObject({
    completedTurns: SafeIntegerSchema,
    playerX: SafeIntegerSchema,
    loomkeeperX: SafeIntegerSchema,
    playerStitching: SafeIntegerSchema,
    loomkeeperStitching: SafeIntegerSchema,
    playerEscapeSlack: SafeIntegerSchema,
    loomkeeperEscapeSlack: SafeIntegerSchema,
    playerPreparation: SafeIntegerSchema,
    loomkeeperPreparation: SafeIntegerSchema,
    playerCocoon: SafeIntegerSchema,
    loomkeeperCocoon: SafeIntegerSchema
});

const CocoonVoyageBaseSchema = z.strictObject({
    schemaVersion: z.literal(D2I_SCHEMA_VERSION),
    caseScope: CaseSchema,
    configId: IdentifierSchema,
    matchRef: IdentifierSchema,
    playerPolicy: PolicySchema,
    loomkeeperPolicy: PolicySchema,
    firstActor: ActorSchema,
    mirrored: z.boolean(),
    preparer: ActorSchema,
    preparerPhase: z.enum(['first', 'second']),
    formation: EdgeReferenceSchema,
    response: EdgeReferenceSchema.extend({
        relation: z.enum([
            'needlepoint_absorbed',
            'spoolburst_absorbed',
            'threadball_bypassed',
            'unweave_cleared',
            'counter_preparation',
            'other'
        ])
    }),
    followingPreparerEdge: z.union([EdgeReferenceSchema, z.null()]),
    lifecycleEndEdge: z.enum(['response', 'following_preparer']),
    cocoonDisposition: z.enum([
        'consumed_by_needlepoint',
        'consumed_by_spoolburst',
        'cleared_by_unweave',
        'expired_on_release',
        'terminal_or_unresolved'
    ]),
    resolutionDisposition: z.enum([
        'released_spoolburst', 'unwoven', 'terminal_before_resolution', 'unresolved'
    ]),
    supportDelta: SupportDeltaSchema,
    recurrenceReturn: z.boolean(),
    terminalRelation: z.strictObject({
        postStateFinished: z.boolean(),
        winner: WinnerSchema,
        finishReason: FinishReasonSchema,
        matchHasNonterminalRecurrence: z.boolean()
    }),
    reentryItemRefs: z.array(IdentifierSchema).min(2).max(3)
});

export const D2ICocoonVoyageSchema = z.strictObject({
    voyageRef: IdentifierSchema,
    ...CocoonVoyageBaseSchema.shape,
    voyageDigest: DigestSchema
}).superRefine((value, context) => {
    const { voyageRef, voyageDigest, ...payload } = value;
    const expectedDigest = sha256Digest(payload);
    if (voyageDigest !== expectedDigest) {
        context.addIssue({ code: 'custom', path: ['voyageDigest'], message: 'Voyage digest does not match canonical content.' });
    }
    if (voyageRef !== `d2i-voyage-${expectedDigest.slice(0, 24)}`) {
        context.addIssue({ code: 'custom', path: ['voyageRef'], message: 'Voyage reference does not match its content digest.' });
    }
});

const ResponseCountsSchema = z.strictObject({
    needlepointAbsorbed: NonNegativeSafeIntegerSchema,
    spoolburstAbsorbed: NonNegativeSafeIntegerSchema,
    threadballBypassed: NonNegativeSafeIntegerSchema,
    unweaveCleared: NonNegativeSafeIntegerSchema,
    counterPreparation: NonNegativeSafeIntegerSchema,
    other: NonNegativeSafeIntegerSchema
});

const CocoonDispositionCountsSchema = z.strictObject({
    consumedByNeedlepoint: NonNegativeSafeIntegerSchema,
    consumedBySpoolburst: NonNegativeSafeIntegerSchema,
    clearedByUnweave: NonNegativeSafeIntegerSchema,
    expiredOnRelease: NonNegativeSafeIntegerSchema,
    terminalOrUnresolved: NonNegativeSafeIntegerSchema
});

const ResolutionCountsSchema = z.strictObject({
    releasedSpoolburst: NonNegativeSafeIntegerSchema,
    unwoven: NonNegativeSafeIntegerSchema,
    terminalBeforeResolution: NonNegativeSafeIntegerSchema,
    unresolved: NonNegativeSafeIntegerSchema
});

export const D2IVoyageSummarySchema = z.strictObject({
    schemaVersion: z.literal(D2I_SCHEMA_VERSION),
    caseScope: CaseSchema,
    preparerPhase: z.enum(['first', 'second']),
    formationCount: NonNegativeSafeIntegerSchema,
    uniqueMatchCount: NonNegativeSafeIntegerSchema,
    responseCounts: ResponseCountsSchema,
    cocoonDispositionCounts: CocoonDispositionCountsSchema,
    resolutionCounts: ResolutionCountsSchema,
    recurrenceReturnCount: NonNegativeSafeIntegerSchema,
    terminalVoyageCount: NonNegativeSafeIntegerSchema,
    aggregateResponseDamage: NonNegativeSafeIntegerSchema
});

const OrderedRouteWitnessBaseSchema = z.strictObject({
    schemaVersion: z.literal(D2I_SCHEMA_VERSION),
    caseScope: CaseSchema,
    matchRef: IdentifierSchema,
    playerPolicy: z.literal('short_approach'),
    loomkeeperPolicy: z.literal('short_approach'),
    firstActor: ActorSchema,
    mirrored: z.boolean(),
    secondPhaseVoyageRef: IdentifierSchema,
    firstPhaseVoyageRef: IdentifierSchema,
    actionSequence: z.tuple([
        TrimmedStringSchema, TrimmedStringSchema, TrimmedStringSchema, TrimmedStringSchema
    ]),
    secondActorReleaseDamage: NonNegativeSafeIntegerSchema,
    firstActorReleaseDamage: NonNegativeSafeIntegerSchema,
    laterCocoonAbsorbsEarlierRelease: z.literal(true),
    earlierCocoonExpiresOnRelease: z.literal(true),
    finalWinner: ActorSchema,
    finalCompletedTurns: NonNegativeSafeIntegerSchema,
    firstActorWins: z.literal(true),
    reentryItemRefs: z.tuple([
        IdentifierSchema, IdentifierSchema, IdentifierSchema, IdentifierSchema
    ])
});

export const D2IOrderedRouteWitnessSchema = z.strictObject({
    witnessRef: IdentifierSchema,
    ...OrderedRouteWitnessBaseSchema.shape,
    witnessDigest: DigestSchema
}).superRefine((value, context) => {
    const { witnessRef, witnessDigest, ...payload } = value;
    const expectedDigest = sha256Digest(payload);
    if (witnessDigest !== expectedDigest) {
        context.addIssue({ code: 'custom', path: ['witnessDigest'], message: 'Ordered-route witness digest does not match canonical content.' });
    }
    if (witnessRef !== `d2i-order-${expectedDigest.slice(0, 24)}`) {
        context.addIssue({ code: 'custom', path: ['witnessRef'], message: 'Ordered-route witness reference does not match its content digest.' });
    }
});

export const D2IOrderedRouteSummarySchema = z.strictObject({
    schemaVersion: z.literal(D2I_SCHEMA_VERSION),
    caseScope: CaseSchema,
    formationCountsEqual: z.boolean(),
    releaseUnweaveDispositionEqual: z.boolean(),
    firstPhaseSpoolburstResponseCount: NonNegativeSafeIntegerSchema,
    secondPhaseCounterPreparationResponseCount: NonNegativeSafeIntegerSchema,
    orderedWitnessCount: NonNegativeSafeIntegerSchema,
    uniqueWitnessMatchCount: NonNegativeSafeIntegerSchema,
    firstActorWinMatchCount: NonNegativeSafeIntegerSchema,
    classification: z.enum(['ordered_response_split', 'aggregate_residue_only', 'no_split'])
});

export const D2INavigationWakeSchema = z.strictObject({
    classification: z.enum(['return', 'retain_and_refine', 'advance_to_candidate_question']),
    reasons: z.array(TrimmedStringSchema).min(1).max(16),
    witnessRefs: z.array(IdentifierSchema).min(1).max(64),
    nextPermittedAction: TrimmedStringSchema
});

const D2IResultBaseSchema = z.strictObject({
    schemaVersion: z.literal(D2I_SCHEMA_VERSION),
    resultId: z.literal(D2I_RESULT_ID),
    sourceBindings: D2ISourceBindingsSchema,
    targetWitnesses: z.array(D2ITargetWitnessSchema).length(136),
    targetSummaries: z.tuple([D2ITargetSummarySchema, D2ITargetSummarySchema]),
    voyages: z.array(D2ICocoonVoyageSchema).length(160),
    voyageSummaries: z.tuple([
        D2IVoyageSummarySchema,
        D2IVoyageSummarySchema,
        D2IVoyageSummarySchema,
        D2IVoyageSummarySchema
    ]),
    orderedRouteWitnesses: z.array(D2IOrderedRouteWitnessSchema).max(64),
    orderedRouteSummaries: z.tuple([
        D2IOrderedRouteSummarySchema,
        D2IOrderedRouteSummarySchema
    ]),
    navigationWake: D2INavigationWakeSchema,
    accumulatedResidue: z.array(IdentifierSchema).min(1).max(32),
    blockedClaims: z.array(TrimmedStringSchema).min(1).max(64),
    productAuthority: z.literal('none')
});

export const D2IResultSchema = z.strictObject({
    ...D2IResultBaseSchema.shape,
    resultDigest: DigestSchema
}).superRefine((value, context) => {
    const { resultDigest, ...payload } = value;
    if (resultDigest !== sha256Digest(payload)) {
        context.addIssue({ code: 'custom', path: ['resultDigest'], message: 'D2I result digest does not match canonical content.' });
    }
    if (new Set(value.voyages.map((item) => item.voyageRef)).size !== value.voyages.length) {
        context.addIssue({ code: 'custom', path: ['voyages'], message: 'Voyage references must be unique.' });
    }
    if (new Set(value.orderedRouteWitnesses.map((item) => item.witnessRef)).size !== value.orderedRouteWitnesses.length) {
        context.addIssue({ code: 'custom', path: ['orderedRouteWitnesses'], message: 'Ordered-route witness references must be unique.' });
    }
});

export type D2ITargetWitness = z.infer<typeof D2ITargetWitnessSchema>;
export type D2ITargetSummary = z.infer<typeof D2ITargetSummarySchema>;
export type D2ICocoonVoyage = z.infer<typeof D2ICocoonVoyageSchema>;
export type D2IVoyageSummary = z.infer<typeof D2IVoyageSummarySchema>;
export type D2IOrderedRouteWitness = z.infer<typeof D2IOrderedRouteWitnessSchema>;
export type D2IOrderedRouteSummary = z.infer<typeof D2IOrderedRouteSummarySchema>;
export type D2IResult = z.infer<typeof D2IResultSchema>;
