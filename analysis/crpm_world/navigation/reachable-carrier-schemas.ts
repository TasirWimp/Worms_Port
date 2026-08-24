import { z } from 'zod';

import { canonicalJson, sha256Digest, type JsonValue } from '../canonical';
import { ProjectionTransportAssessmentV2Schema } from '../schemas';

export const D2H_RAW_SCHEMA_VERSION = 1 as const;
export const D2H_RESULT_SCHEMA_VERSION = 1 as const;
export const D2H_EXPORT_ID = 'wp-015d2h-production-spawn-reachable-carriers' as const;
export const D2H_RESULT_ID = 'wp-015d2h-production-spawn-reachable-carrier-assessment' as const;
export const D2H_SOURCE_COMMIT = 'd683515a6229d14b807d2bac06a3fe95481f4321' as const;
export const D2H_CRPM_METHOD_COMMIT = '053c6fc0a90ed48d8667016b18a1d10106a7a2bc' as const;
export const D2H_D2F_AUDIT_DIGEST = '476735407135b11f1d3805a7b7a4b22c5d7c8a46a1f6ac972f2d134fb3ff1657' as const;
export const D2H_SEED = 3237998097 as const;
export const D2H_PRODUCTION_SPAWN = 640 as const;

const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const CommitSchema = z.string().regex(/^[0-9a-f]{40}$/);
const TrimmedStringSchema = z.string().min(1).max(4_096).refine(
    (value) => value.trim() === value,
    'String values must be trimmed.'
);
const IdentifierSchema = z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const SourcePathSchema = z.string().min(1).max(512).refine(
    (value) => value.trim() === value && !value.includes('\\') &&
        !value.startsWith('/') && !value.split('/').includes('..'),
    'Source paths must be repository-relative POSIX paths.'
);
const SafeIntegerSchema = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)
    .refine((value) => !Object.is(value, -0));
const NonNegativeSafeIntegerSchema = SafeIntegerSchema.min(0);
const ActorSchema = z.enum(['player', 'loomkeeper']);
const WinnerSchema = z.union([ActorSchema, z.literal('draw'), z.null()]);
const FinishReasonSchema = z.union([z.enum(['unravelled', 'turn_limit']), z.null()]);
const PolicySchema = z.enum([
    'range_pressure',
    'medium_hold',
    'short_approach',
    'retreat_kite',
    'best_response'
]);
const ActionKindSchema = z.enum([
    'cast', 'relocate', 'brace', 'prepare_spoolburst', 'unweave_spoolburst', 'wait'
]);

const DeterministicJsonSchema = z.custom<JsonValue>((value) => {
    try {
        canonicalJson(value);
        return true;
    } catch {
        return false;
    }
}, 'Value must be deterministic JSON.');

export const D2HActorStateSchema = z.strictObject({
    x: NonNegativeSafeIntegerSchema,
    stitching: NonNegativeSafeIntegerSchema,
    seamPinSource: z.union([ActorSchema, z.null()]),
    seamPinTurns: NonNegativeSafeIntegerSchema,
    seamPinCooldown: NonNegativeSafeIntegerSchema,
    escapeSlack: NonNegativeSafeIntegerSchema,
    braceTurns: NonNegativeSafeIntegerSchema,
    braceUses: NonNegativeSafeIntegerSchema,
    spoolburstPreparationTurns: NonNegativeSafeIntegerSchema,
    spoolburstCocoonHits: NonNegativeSafeIntegerSchema,
    openingWeaveHits: NonNegativeSafeIntegerSchema,
    seamPinMaximumSeparationIncrease: z.union([NonNegativeSafeIntegerSchema, z.null()]),
    frayedSeamSource: z.union([ActorSchema, z.null()]),
    frayedSeamTurns: NonNegativeSafeIntegerSchema
});

export const D2HCarrierSchema = z.strictObject({
    schemaVersion: z.literal(1),
    completedTurns: NonNegativeSafeIntegerSchema,
    activeActor: ActorSchema,
    player: D2HActorStateSchema,
    loomkeeper: D2HActorStateSchema,
    distance: NonNegativeSafeIntegerSchema,
    winner: WinnerSchema,
    finishReason: FinishReasonSchema
});

export const D2HSelectedActionSchema = z.strictObject({
    kind: ActionKindSchema,
    direction: SafeIntegerSchema,
    relicId: z.union([IdentifierSchema, z.null()]),
    actionKey: TrimmedStringSchema
});

const D2HAnalyticalTraceStepSchema = z.strictObject({
    turn: NonNegativeSafeIntegerSchema,
    actor: ActorSchema,
    policy: PolicySchema,
    distanceBefore: NonNegativeSafeIntegerSchema,
    action: TrimmedStringSchema,
    distanceAfter: NonNegativeSafeIntegerSchema,
    damage: NonNegativeSafeIntegerSchema,
    actorBacklashDamage: NonNegativeSafeIntegerSchema,
    playerStitching: NonNegativeSafeIntegerSchema,
    loomkeeperStitching: NonNegativeSafeIntegerSchema,
    actorWasSeamPinned: z.boolean(),
    seamPinAppliedTo: z.union([ActorSchema, z.null()]),
    playerSeamPinTurns: NonNegativeSafeIntegerSchema,
    loomkeeperSeamPinTurns: NonNegativeSafeIntegerSchema,
    playerSeamPinCooldown: NonNegativeSafeIntegerSchema,
    loomkeeperSeamPinCooldown: NonNegativeSafeIntegerSchema,
    playerEscapeSlack: NonNegativeSafeIntegerSchema,
    loomkeeperEscapeSlack: NonNegativeSafeIntegerSchema,
    playerBraceTurns: NonNegativeSafeIntegerSchema,
    loomkeeperBraceTurns: NonNegativeSafeIntegerSchema,
    playerBraceUses: NonNegativeSafeIntegerSchema,
    loomkeeperBraceUses: NonNegativeSafeIntegerSchema,
    playerSpoolburstPreparationTurns: NonNegativeSafeIntegerSchema,
    loomkeeperSpoolburstPreparationTurns: NonNegativeSafeIntegerSchema,
    playerSpoolburstCocoonHits: NonNegativeSafeIntegerSchema,
    loomkeeperSpoolburstCocoonHits: NonNegativeSafeIntegerSchema,
    playerOpeningWeaveHits: NonNegativeSafeIntegerSchema,
    loomkeeperOpeningWeaveHits: NonNegativeSafeIntegerSchema,
    playerFrayedSeamTurns: NonNegativeSafeIntegerSchema,
    loomkeeperFrayedSeamTurns: NonNegativeSafeIntegerSchema,
    spoolburstPreparationStartedBy: z.union([ActorSchema, z.null()]),
    spoolburstPreparationDisruptedFor: z.union([ActorSchema, z.null()]),
    spoolburstUnwovenFor: z.union([ActorSchema, z.null()]),
    spoolburstThreadbackAppliedFor: z.union([ActorSchema, z.null()]),
    threadbackSeparationIncrease: SafeIntegerSchema,
    castThreadstepAppliedFor: z.union([ActorSchema, z.null()]),
    castThreadstepEvadedFor: z.union([ActorSchema, z.null()]),
    spoolburstCocoonAbsorbedFor: z.union([ActorSchema, z.null()]),
    openingWeaveAbsorbedFor: z.union([ActorSchema, z.null()]),
    openingWeaveEscapeSlackCost: NonNegativeSafeIntegerSchema,
    openingWeaveDamageReductionPercent: NonNegativeSafeIntegerSchema,
    frayedSeamAppliedTo: z.union([ActorSchema, z.null()]),
    frayedSeamBoundFor: z.union([ActorSchema, z.null()]),
    entrySeamPinSuppression: z.union([
        z.strictObject({ target: ActorSchema, relicId: IdentifierSchema }),
        z.null()
    ]).optional()
});

const D2HItemDomainSchema = z.strictObject({
    startingDistance: z.literal(D2H_PRODUCTION_SPAWN),
    seed: z.literal(D2H_SEED),
    maximumTurns: z.literal(16),
    firstActor: ActorSchema,
    mirrored: z.boolean(),
    playerPolicy: PolicySchema,
    loomkeeperPolicy: PolicySchema
});

export const D2HCarrierItemSchema = z.strictObject({
    schemaVersion: z.literal(1),
    itemRef: IdentifierSchema,
    caseId: z.enum(['F4', 'I2']),
    configId: IdentifierSchema,
    configSchemaVersion: z.union([z.literal(11), z.literal(16)]),
    configPath: SourcePathSchema,
    reportDigest: DigestSchema,
    matchRef: IdentifierSchema,
    transitionIndex: NonNegativeSafeIntegerSchema,
    domain: D2HItemDomainSchema,
    pathPrefixActions: z.array(TrimmedStringSchema).max(16),
    pathPrefixDigest: DigestSchema,
    sourceCarrier: D2HCarrierSchema,
    sourceCarrierDigest: DigestSchema,
    sourceRecurrenceKey: DeterministicJsonSchema,
    legalActionKeys: z.array(TrimmedStringSchema).min(1).max(32),
    actingPolicy: PolicySchema,
    targetReactionPolicy: PolicySchema,
    selectedAction: D2HSelectedActionSchema,
    analyticalTraceStep: D2HAnalyticalTraceStepSchema,
    analyticalTraceStepDigest: DigestSchema,
    targetCarrier: D2HCarrierSchema,
    targetCarrierDigest: DigestSchema,
    targetRecurrenceKey: DeterministicJsonSchema,
    terminalRelation: z.strictObject({
        postStateFinished: z.boolean(),
        winner: WinnerSchema,
        finishReason: FinishReasonSchema,
        matchHasNonterminalRecurrence: z.boolean()
    })
}).superRefine((item, context) => {
    const digests: readonly [keyof typeof item, unknown][] = [
        ['pathPrefixDigest', item.pathPrefixActions],
        ['sourceCarrierDigest', item.sourceCarrier],
        ['analyticalTraceStepDigest', item.analyticalTraceStep],
        ['targetCarrierDigest', item.targetCarrier]
    ];
    for (const [field, value] of digests) {
        if (item[field] !== sha256Digest(value)) {
            context.addIssue({ code: 'custom', path: [field], message: `${field} does not match its canonical content.` });
        }
    }
    if (item.transitionIndex !== item.pathPrefixActions.length) {
        context.addIssue({ code: 'custom', path: ['transitionIndex'], message: 'Transition index must equal path-prefix length.' });
    }
    if (!item.legalActionKeys.includes(item.selectedAction.actionKey)) {
        context.addIssue({ code: 'custom', path: ['selectedAction'], message: 'Selected action is absent from legal-action support.' });
    }
    if (new Set(item.legalActionKeys).size !== item.legalActionKeys.length ||
        canonicalJson(item.legalActionKeys) !== canonicalJson([...item.legalActionKeys].sort())) {
        context.addIssue({ code: 'custom', path: ['legalActionKeys'], message: 'Legal-action keys must be unique and sorted.' });
    }
});

export const D2HSourceBindingsSchema = z.strictObject({
    repositoryId: z.literal('worms-port'),
    sourceCommit: z.literal(D2H_SOURCE_COMMIT),
    crpmMethodCommit: z.literal(D2H_CRPM_METHOD_COMMIT),
    d2fAuditDigest: z.literal(D2H_D2F_AUDIT_DIGEST),
    modelPath: z.literal('analysis/tactical_model/model.py'),
    quotientTransportPath: z.literal('analysis/crpm_world/kernel/assess-quotient-transport.ts')
});

export const D2HDomainSchema = z.strictObject({
    startingDistances: z.tuple([z.literal(D2H_PRODUCTION_SPAWN)]),
    caseIds: z.tuple([z.literal('F4'), z.literal('I2')]),
    firstActors: z.tuple([z.literal('player'), z.literal('loomkeeper')]),
    mirrored: z.tuple([z.literal(false), z.literal(true)]),
    policyNames: z.tuple([
        z.literal('range_pressure'),
        z.literal('medium_hold'),
        z.literal('short_approach'),
        z.literal('retreat_kite'),
        z.literal('best_response')
    ]),
    orderedPolicyPairCount: z.literal(25),
    seed: z.literal(D2H_SEED),
    maximumTurns: z.literal(16),
    constraints: z.array(TrimmedStringSchema).min(1).max(16)
});

export const D2HReportBindingSchema = z.strictObject({
    caseId: z.enum(['F4', 'I2']),
    configId: IdentifierSchema,
    configPath: SourcePathSchema,
    configSchemaVersion: z.union([z.literal(11), z.literal(16)]),
    reportDigest: DigestSchema,
    historicalDisposition: z.enum(['structural_reference', 'residualized_policy_fragile']),
    fullReportMatchCount: z.literal(1200),
    spawnMatchCount: z.literal(100),
    transitionItemCount: NonNegativeSafeIntegerSchema,
    spawnResult: z.strictObject({
        firstActorWins: NonNegativeSafeIntegerSchema,
        firstActorWinRateNumerator: NonNegativeSafeIntegerSchema,
        firstActorWinRateDenominator: z.literal(100),
        terminalReasons: z.strictObject({
            unravelled: NonNegativeSafeIntegerSchema.optional(),
            turn_limit: NonNegativeSafeIntegerSchema.optional()
        }),
        nonterminalRecurrenceMatchCount: NonNegativeSafeIntegerSchema
    })
});

const D2HRawExportBaseSchema = z.strictObject({
    schemaVersion: z.literal(D2H_RAW_SCHEMA_VERSION),
    exportId: z.literal(D2H_EXPORT_ID),
    sourceBindings: D2HSourceBindingsSchema,
    domain: D2HDomainSchema,
    reportBindings: z.tuple([D2HReportBindingSchema, D2HReportBindingSchema]),
    items: z.array(D2HCarrierItemSchema).min(1).max(3_200),
    blockedClaims: z.array(TrimmedStringSchema).min(1).max(32),
    productAuthority: z.literal('none')
});

export const D2HRawExportSchema = z.strictObject({
    ...D2HRawExportBaseSchema.shape,
    exportDigest: DigestSchema
}).superRefine((value, context) => {
    const { exportDigest, ...payload } = value;
    if (exportDigest !== sha256Digest(payload)) {
        context.addIssue({ code: 'custom', path: ['exportDigest'], message: 'Raw export digest does not match canonical content.' });
    }
    if (value.reportBindings[0].caseId !== 'F4' || value.reportBindings[1].caseId !== 'I2') {
        context.addIssue({ code: 'custom', path: ['reportBindings'], message: 'Report bindings must retain F4 then I2 order.' });
    }
    const itemRefs = value.items.map((item) => item.itemRef);
    if (new Set(itemRefs).size !== itemRefs.length) {
        context.addIssue({ code: 'custom', path: ['items'], message: 'Carrier item references must be unique.' });
    }
    for (const binding of value.reportBindings) {
        const count = value.items.filter((item) => item.caseId === binding.caseId).length;
        if (count !== binding.transitionItemCount) {
            context.addIssue({ code: 'custom', path: ['items'], message: `${binding.caseId} transition count does not match its binding.` });
        }
    }
});

export const D2HCutIdSchema = z.enum([
    'spawn640_visible_pressure_v0',
    'spawn640_policy_visible_pressure_v1',
    'spawn640_bounded_tactical_support_v1',
    'spawn640_route_provenance_v0'
]);

export const D2HCutDefinitionSchema = z.strictObject({
    schemaVersion: z.literal(1),
    cutId: D2HCutIdSchema,
    cutVersion: z.literal(1),
    projectionDescription: TrimmedStringSchema,
    includedSupport: z.array(IdentifierSchema).min(1).max(32),
    intentionallyForgotten: z.array(IdentifierSchema).max(32),
    excludedClaims: z.array(TrimmedStringSchema).min(1).max(16),
    deterministicContinuationClaim: z.enum(['bounded', 'relational', 'none'])
});

export const D2HClassCoverageSchema = z.strictObject({
    sourceClassCount: NonNegativeSafeIntegerSchema,
    repeatedSourceClassCount: NonNegativeSafeIntegerSchema,
    singletonSourceClassCount: NonNegativeSafeIntegerSchema,
    maximumSourceClassSize: NonNegativeSafeIntegerSchema,
    aliasingSourceClassCount: NonNegativeSafeIntegerSchema,
    multiRouteAliasingClassCount: NonNegativeSafeIntegerSchema,
    status: z.enum(['aliased', 'bounded_consistent_with_twins', 'unexercised_no_twins'])
});

export const D2HWitnessRouteSchema = z.strictObject({
    sourceClassKey: IdentifierSchema,
    left: z.strictObject({
        itemRef: IdentifierSchema,
        matchRef: IdentifierSchema,
        pathPrefixDigest: DigestSchema,
        sourceCarrierDigest: DigestSchema,
        targetCarrierDigest: DigestSchema,
        selectedActionKey: TrimmedStringSchema
    }),
    right: z.strictObject({
        itemRef: IdentifierSchema,
        matchRef: IdentifierSchema,
        pathPrefixDigest: DigestSchema,
        sourceCarrierDigest: DigestSchema,
        targetCarrierDigest: DigestSchema,
        selectedActionKey: TrimmedStringSchema
    })
});

export const D2HAssessmentSchema = z.strictObject({
    schemaVersion: z.literal(1),
    caseScope: z.enum(['F4', 'I2', 'combined']),
    activeActorScope: z.enum(['all', 'player', 'loomkeeper']),
    cutId: D2HCutIdSchema.exclude(['spawn640_route_provenance_v0']),
    assessment: ProjectionTransportAssessmentV2Schema,
    coverage: D2HClassCoverageSchema,
    witnessRoutes: z.array(D2HWitnessRouteSchema).max(3_200)
});

export const D2HNavigationWakeSchema = z.strictObject({
    classification: z.enum(['advance', 'retain_and_refine', 'return', 'escalate_authority_cut']),
    reasons: z.array(TrimmedStringSchema).min(1).max(16),
    witnessRefs: z.array(IdentifierSchema).max(256),
    nextPermittedAction: TrimmedStringSchema
});

export const D2HSupportDifferenceSummarySchema = z.strictObject({
    schemaVersion: z.literal(1),
    caseScope: z.enum(['F4', 'I2']),
    witnessPairCount: NonNegativeSafeIntegerSchema,
    sameSelectedActionPairCount: NonNegativeSafeIntegerSchema,
    differentSelectedActionPairCount: NonNegativeSafeIntegerSchema,
    completedTurnOnlyPairCount: NonNegativeSafeIntegerSchema,
    additionalSupportDifferencePairCount: NonNegativeSafeIntegerSchema,
    fieldDifferences: z.array(z.strictObject({
        field: IdentifierSchema,
        witnessPairCount: NonNegativeSafeIntegerSchema,
        differentSelectedActionPairCount: NonNegativeSafeIntegerSchema,
        example: z.strictObject({
            leftItemRef: IdentifierSchema,
            rightItemRef: IdentifierSchema,
            leftValue: DeterministicJsonSchema,
            rightValue: DeterministicJsonSchema,
            leftActionKey: TrimmedStringSchema,
            rightActionKey: TrimmedStringSchema
        })
    })).min(1).max(64)
});

const D2HResultBaseSchema = z.strictObject({
    schemaVersion: z.literal(D2H_RESULT_SCHEMA_VERSION),
    resultId: z.literal(D2H_RESULT_ID),
    rawExportDigest: DigestSchema,
    sourceBindings: D2HSourceBindingsSchema,
    domain: D2HDomainSchema,
    reportBindings: z.tuple([D2HReportBindingSchema, D2HReportBindingSchema]),
    cutDefinitions: z.tuple([
        D2HCutDefinitionSchema,
        D2HCutDefinitionSchema,
        D2HCutDefinitionSchema,
        D2HCutDefinitionSchema
    ]),
    assessments: z.array(D2HAssessmentSchema).length(9),
    supportDifferenceSummaries: z.tuple([
        D2HSupportDifferenceSummarySchema,
        D2HSupportDifferenceSummarySchema
    ]),
    accumulatedResidue: z.array(IdentifierSchema).min(1).max(32),
    navigationWake: D2HNavigationWakeSchema,
    blockedClaims: z.array(TrimmedStringSchema).min(1).max(64),
    productAuthority: z.literal('none')
});

export const D2HResultSchema = z.strictObject({
    ...D2HResultBaseSchema.shape,
    resultDigest: DigestSchema
}).superRefine((value, context) => {
    const { resultDigest, ...payload } = value;
    if (resultDigest !== sha256Digest(payload)) {
        context.addIssue({ code: 'custom', path: ['resultDigest'], message: 'Result digest does not match canonical content.' });
    }
});

export type D2HRawExport = z.infer<typeof D2HRawExportSchema>;
export type D2HCarrierItem = z.infer<typeof D2HCarrierItemSchema>;
export type D2HCutDefinition = z.infer<typeof D2HCutDefinitionSchema>;
export type D2HAssessment = z.infer<typeof D2HAssessmentSchema>;
export type D2HResult = z.infer<typeof D2HResultSchema>;
