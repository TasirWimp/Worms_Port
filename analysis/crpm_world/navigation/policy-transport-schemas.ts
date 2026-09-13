import { z } from 'zod';

import { canonicalJson, sha256Digest } from '../canonical';
import { D2HCarrierSchema, D2HSelectedActionSchema } from './reachable-carrier-schemas';
import { D2KPolicySchema } from './policy-choice-schemas';

export const D2L_SCHEMA_VERSION = 1 as const;
export const D2L_EXPORT_ID = 'wp-015d2l-policy-transport-falsifier' as const;
export const D2L_RESULT_ID = 'wp-015d2l-policy-transport-assessment' as const;
export const D2L_SOURCE_COMMIT = '3812456bc8de5859588818276e4c1fff930f678c' as const;
export const D2L_CRPM_COMMIT = '053c6fc0a90ed48d8667016b18a1d10106a7a2bc' as const;
export const D2L_D2K_RAW_DIGEST = '47ef25b6557edaa1f477f0bdde80b0b1d8b041399adb844a22c8746f1314e769' as const;
export const D2L_D2K_RESULT_DIGEST = '5c544f6822744ac63a595ca4458bb2dfb72696836468a47bf494c628b5573832' as const;
export const D2L_MODEL_SHA256 = 'af0b0ec8d9893e992bdc95123a915e24a2305ee2b9fff32bce95d27cdb4c8c08' as const;
export const D2L_CONFIG_SHA256 = '5e519b09ea5e5684185bcd527600705825ba75df8f01e310adb027d09d4f54e0' as const;

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
const ActorRoleSchema = z.enum(['first', 'second']);
const WinnerSchema = z.union([ActorSchema, z.literal('draw'), z.null()]);
const WinnerRoleSchema = z.enum(['first', 'second', 'draw']);
const DirectionRoleSchema = z.enum(['toward', 'away', 'stay']);
export const D2LFrameSchema = z.enum(['f4_cross_band_v0', 'd2k_boundary_v0']);
export const D2LVariantSchema = z.enum([
    'baseline_v0',
    'terminal_tie_residue_v0',
    'preparation_response_lethal_guard_v0',
    'global_lethal_guard_v0'
]);
const TriggerSchema = z.enum([
    'terminal_tie_residue',
    'preparation_response_lethal_guard',
    'global_lethal_guard'
]);

export const D2LSourceBindingsSchema = z.strictObject({
    repositoryId: z.literal('worms-port'),
    sourceCommit: z.literal(D2L_SOURCE_COMMIT),
    crpmMethodCommit: z.literal(D2L_CRPM_COMMIT),
    d2kRawDigest: z.literal(D2L_D2K_RAW_DIGEST),
    d2kResultDigest: z.literal(D2L_D2K_RESULT_DIGEST),
    modelPath: z.literal('analysis/tactical_model/model.py'),
    modelSha256: z.literal(D2L_MODEL_SHA256),
    configPath: z.literal(
        'analysis/tactical_model/configs/v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4.json'
    ),
    configSha256: z.literal(D2L_CONFIG_SHA256),
    configId: z.literal(
        'v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4'
    ),
    configSchemaVersion: z.literal(11)
});

const D2LDomainSchema = z.strictObject({
    frames: z.tuple([
        z.strictObject({
            frameId: z.literal('f4_cross_band_v0'),
            startingDistances: z.tuple([
                z.literal(448), z.literal(512), z.literal(576), z.literal(640), z.literal(704)
            ]),
            orientationCountPerDistance: z.literal(2),
            matchesPerVariant: z.literal(250)
        }),
        z.strictObject({
            frameId: z.literal('d2k_boundary_v0'),
            startingDistances: z.tuple([z.literal(639), z.literal(640), z.literal(641)]),
            orientationCountPerDistance: z.literal(4),
            matchesPerVariant: z.literal(300)
        })
    ]),
    variants: z.tuple([
        z.literal('baseline_v0'),
        z.literal('terminal_tie_residue_v0'),
        z.literal('preparation_response_lethal_guard_v0'),
        z.literal('global_lethal_guard_v0')
    ]),
    policyNames: z.tuple([
        z.literal('range_pressure'),
        z.literal('medium_hold'),
        z.literal('short_approach'),
        z.literal('retreat_kite'),
        z.literal('best_response')
    ]),
    orderedPolicyPairCount: z.literal(25),
    seed: z.literal(3237998097),
    maximumTurns: z.literal(16)
});

const D2LPathStepSchema = z.strictObject({
    turn: NonNegativeSafeIntegerSchema,
    actor: ActorSchema,
    actionKey: TrimmedStringSchema,
    baseActionKey: TrimmedStringSchema,
    substituted: z.boolean(),
    responseCarrierIndex: z.union([NonNegativeSafeIntegerSchema.min(1), z.null()]),
    actorRole: ActorRoleSchema,
    policy: D2KPolicySchema,
    kind: z.enum(['relocate', 'cast', 'brace', 'prepare_spoolburst', 'unweave_spoolburst']),
    relicId: z.union([TrimmedStringSchema, z.null()]),
    directionRole: DirectionRoleSchema
});

const D2LImmediateWinSchema = z.strictObject({
    action: D2HSelectedActionSchema,
    targetCarrierDigest: DigestSchema,
    escapeSlackSpend: NonNegativeSafeIntegerSchema,
    displacement: NonNegativeSafeIntegerSchema,
    directionRole: DirectionRoleSchema
});

const D2LSubstitutionBaseSchema = z.strictObject({
    schemaVersion: z.literal(D2L_SCHEMA_VERSION),
    turn: NonNegativeSafeIntegerSchema,
    actor: ActorSchema,
    actorRole: ActorRoleSchema,
    policy: D2KPolicySchema,
    trigger: TriggerSchema,
    responseCarrier: z.boolean(),
    responseCarrierIndex: z.union([NonNegativeSafeIntegerSchema.min(1), z.null()]),
    sourceCarrier: D2HCarrierSchema,
    sourceCarrierDigest: DigestSchema,
    baseAction: D2HSelectedActionSchema,
    selectedAction: D2HSelectedActionSchema,
    selectedDirectionRole: DirectionRoleSchema,
    selectedTargetCarrier: D2HCarrierSchema,
    selectedTargetCarrierDigest: DigestSchema,
    immediateWins: z.array(D2LImmediateWinSchema).min(1).max(32),
    escapeSlackSpend: NonNegativeSafeIntegerSchema,
    displacement: NonNegativeSafeIntegerSchema,
    preparerStitching: NonNegativeSafeIntegerSchema,
    preparerPreparationTurns: NonNegativeSafeIntegerSchema,
    responderPreparationTurns: NonNegativeSafeIntegerSchema
});

export const D2LSubstitutionSchema = z.strictObject({
    ...D2LSubstitutionBaseSchema.shape,
    substitutionDigest: DigestSchema
}).superRefine((value, context) => {
    const { substitutionDigest, ...payload } = value;
    if (substitutionDigest !== sha256Digest(payload)) {
        context.addIssue({ code: 'custom', path: ['substitutionDigest'], message: 'Substitution digest mismatch.' });
    }
    if (value.sourceCarrierDigest !== sha256Digest(value.sourceCarrier)) {
        context.addIssue({ code: 'custom', path: ['sourceCarrierDigest'], message: 'Source carrier digest mismatch.' });
    }
    if (value.selectedTargetCarrierDigest !== sha256Digest(value.selectedTargetCarrier)) {
        context.addIssue({ code: 'custom', path: ['selectedTargetCarrierDigest'], message: 'Target carrier digest mismatch.' });
    }
    const first = value.immediateWins[0];
    if (!first || first.action.actionKey !== value.selectedAction.actionKey ||
        first.escapeSlackSpend !== value.escapeSlackSpend ||
        first.displacement !== value.displacement) {
        context.addIssue({ code: 'custom', path: ['immediateWins'], message: 'Selected action is not the first residue-stable immediate win.' });
    }
    if (value.responseCarrier !== (value.responseCarrierIndex !== null)) {
        context.addIssue({ code: 'custom', path: ['responseCarrierIndex'], message: 'Response-carrier index mismatch.' });
    }
});

const D2LRecurrenceSchema = z.strictObject({
    firstSeenAfterCompletedTurns: NonNegativeSafeIntegerSchema,
    repeatedAfterCompletedTurns: NonNegativeSafeIntegerSchema,
    cycleTurns: NonNegativeSafeIntegerSchema,
    stateDigest: DigestSchema
});

const D2LMatchBaseSchema = z.strictObject({
    schemaVersion: z.literal(D2L_SCHEMA_VERSION),
    frameId: D2LFrameSchema,
    variant: D2LVariantSchema,
    startingDistance: z.union([
        z.literal(448), z.literal(512), z.literal(576), z.literal(639),
        z.literal(640), z.literal(641), z.literal(704)
    ]),
    firstActor: ActorSchema,
    mirrored: z.boolean(),
    playerPolicy: D2KPolicySchema,
    loomkeeperPolicy: D2KPolicySchema,
    firstPolicy: D2KPolicySchema,
    secondPolicy: D2KPolicySchema,
    pathSteps: z.array(D2LPathStepSchema).min(1).max(16),
    pathDigest: DigestSchema,
    normalizedPathDigest: DigestSchema,
    substitutions: z.array(D2LSubstitutionSchema).max(16),
    winner: WinnerSchema,
    winnerRole: WinnerRoleSchema,
    finishReason: z.union([z.enum(['unravelled', 'turn_limit']), z.null()]),
    completedTurns: NonNegativeSafeIntegerSchema,
    nonterminalRecurrence: z.union([D2LRecurrenceSchema, z.null()]),
    finalCarrier: D2HCarrierSchema,
    finalCarrierDigest: DigestSchema
});

export const D2LMatchSchema = z.strictObject({
    matchRef: IdentifierSchema,
    ...D2LMatchBaseSchema.shape,
    matchDigest: DigestSchema
}).superRefine((value, context) => {
    const { matchRef, matchDigest, ...payload } = value;
    if (matchDigest !== sha256Digest(payload)) {
        context.addIssue({ code: 'custom', path: ['matchDigest'], message: 'Match digest mismatch.' });
    }
    if (matchRef !== `d2l-match-${matchDigest.slice(0, 24)}`) {
        context.addIssue({ code: 'custom', path: ['matchRef'], message: 'Match reference mismatch.' });
    }
    if (value.pathDigest !== sha256Digest(value.pathSteps)) {
        context.addIssue({ code: 'custom', path: ['pathDigest'], message: 'Path digest mismatch.' });
    }
    const normalized = value.pathSteps.map((item) => ({
        actorRole: item.actorRole,
        policy: item.policy,
        kind: item.kind,
        relicId: item.relicId,
        directionRole: item.directionRole
    }));
    if (value.normalizedPathDigest !== sha256Digest(normalized)) {
        context.addIssue({ code: 'custom', path: ['normalizedPathDigest'], message: 'Normalized path digest mismatch.' });
    }
    if (value.finalCarrierDigest !== sha256Digest(value.finalCarrier)) {
        context.addIssue({ code: 'custom', path: ['finalCarrierDigest'], message: 'Final carrier digest mismatch.' });
    }
    if (value.firstPolicy !== (value.firstActor === 'player' ? value.playerPolicy : value.loomkeeperPolicy) ||
        value.secondPolicy !== (value.firstActor === 'player' ? value.loomkeeperPolicy : value.playerPolicy)) {
        context.addIssue({ code: 'custom', path: ['firstPolicy'], message: 'Actor-relative policy binding mismatch.' });
    }
});

const D2LRawBaseSchema = z.strictObject({
    schemaVersion: z.literal(D2L_SCHEMA_VERSION),
    exportId: z.literal(D2L_EXPORT_ID),
    sourceBindings: D2LSourceBindingsSchema,
    domain: D2LDomainSchema,
    matches: z.array(D2LMatchSchema).length(2_200),
    blockedClaims: z.array(TrimmedStringSchema).length(5),
    productAuthority: z.literal('none')
});

export const D2LRawExportSchema = z.strictObject({
    ...D2LRawBaseSchema.shape,
    exportDigest: DigestSchema
}).superRefine((value, context) => {
    const { exportDigest, ...payload } = value;
    if (exportDigest !== sha256Digest(payload)) {
        context.addIssue({ code: 'custom', path: ['exportDigest'], message: 'Export digest mismatch.' });
    }
});

const PolicyCountSchema = z.strictObject({
    range_pressure: NonNegativeSafeIntegerSchema,
    medium_hold: NonNegativeSafeIntegerSchema,
    short_approach: NonNegativeSafeIntegerSchema,
    retreat_kite: NonNegativeSafeIntegerSchema,
    best_response: NonNegativeSafeIntegerSchema
});

const DistanceSummarySchema = z.strictObject({
    startingDistance: NonNegativeSafeIntegerSchema,
    matchCount: NonNegativeSafeIntegerSchema,
    firstActorWins: NonNegativeSafeIntegerSchema,
    secondActorWins: NonNegativeSafeIntegerSchema,
    draws: NonNegativeSafeIntegerSchema,
    outcomeChangesFromBaseline: NonNegativeSafeIntegerSchema,
    firstActorGainCount: NonNegativeSafeIntegerSchema,
    secondActorGainCount: NonNegativeSafeIntegerSchema
});

export const D2LVariantSummarySchema = z.strictObject({
    frameId: D2LFrameSchema,
    variant: D2LVariantSchema,
    matchCount: NonNegativeSafeIntegerSchema,
    firstActorWins: NonNegativeSafeIntegerSchema,
    secondActorWins: NonNegativeSafeIntegerSchema,
    draws: NonNegativeSafeIntegerSchema,
    totalTurns: NonNegativeSafeIntegerSchema,
    recurrenceCount: NonNegativeSafeIntegerSchema,
    turnLimitCount: NonNegativeSafeIntegerSchema,
    outcomeChangesFromBaseline: NonNegativeSafeIntegerSchema,
    firstActorGainCount: NonNegativeSafeIntegerSchema,
    secondActorGainCount: NonNegativeSafeIntegerSchema,
    substitutionCount: NonNegativeSafeIntegerSchema,
    substitutionsByPolicy: PolicyCountSchema,
    firstActorSubstitutionCount: NonNegativeSafeIntegerSchema,
    secondActorSubstitutionCount: NonNegativeSafeIntegerSchema,
    responseCarrierSubstitutionCount: NonNegativeSafeIntegerSchema,
    escapeSlackSpend: NonNegativeSafeIntegerSchema,
    displacement: NonNegativeSafeIntegerSchema,
    orientationClassCount: NonNegativeSafeIntegerSchema,
    orientationMismatchCount: NonNegativeSafeIntegerSchema,
    distances: z.array(DistanceSummarySchema).min(3).max(5)
});

const GateSchema = z.strictObject({
    baselineReproduced: z.boolean(),
    tieOutcomeInvariant: z.boolean(),
    firstCycleCocoonBranchPreserved: z.boolean(),
    secondCycleImmediateOmissionsRepaired: z.boolean(),
    boundarySelectionEquivariant: z.boolean(),
    noRecurrenceOrTurnLimitDrift: z.boolean()
});

const PhaseWitnessSchema = z.strictObject({
    matchRef: IdentifierSchema,
    startingDistance: NonNegativeSafeIntegerSchema,
    firstPolicy: D2KPolicySchema,
    secondPolicy: D2KPolicySchema,
    baselineWinnerRole: WinnerRoleSchema,
    guardedWinnerRole: WinnerRoleSchema,
    substitutionActorRole: ActorRoleSchema,
    substitutionRef: DigestSchema
});

const OrientationMismatchWitnessSchema = z.strictObject({
    variant: D2LVariantSchema,
    startingDistance: NonNegativeSafeIntegerSchema,
    firstPolicy: D2KPolicySchema,
    secondPolicy: D2KPolicySchema,
    matchRefs: z.array(IdentifierSchema).min(2).max(4),
    normalizedRouteSignatures: z.array(DigestSchema).min(2).max(4)
});

const D2LResultBaseSchema = z.strictObject({
    schemaVersion: z.literal(D2L_SCHEMA_VERSION),
    resultId: z.literal(D2L_RESULT_ID),
    sourceBindings: D2LSourceBindingsSchema,
    rawExportDigest: DigestSchema,
    variantSummaries: z.array(D2LVariantSummarySchema).length(8),
    gates: GateSchema,
    phaseTransportWitnesses: z.array(PhaseWitnessSchema).min(1).max(256),
    orientationMismatchWitnesses: z.array(OrientationMismatchWitnessSchema).min(1).max(32),
    diagnosticProfile: z.strictObject({
        pathPressure: z.array(TrimmedStringSchema).min(1).max(12),
        residueVisibility: z.array(TrimmedStringSchema).min(1).max(12),
        localReorganization: z.array(TrimmedStringSchema).min(1).max(12),
        cutFidelity: z.array(TrimmedStringSchema).min(1).max(12),
        returnStrength: z.array(TrimmedStringSchema).min(1).max(12),
        closureRisk: z.array(TrimmedStringSchema).min(1).max(12)
    }),
    disposition: z.strictObject({
        classification: z.enum(['rejected', 'residualized', 'structural_reference', 'accepted_for_analysis']),
        reasons: z.array(TrimmedStringSchema).min(1).max(16),
        witnessRefs: z.array(IdentifierSchema).min(1).max(256),
        nextPermittedAction: TrimmedStringSchema
    }),
    accumulatedResidue: z.array(IdentifierSchema).min(1).max(32),
    blockedClaims: z.array(TrimmedStringSchema).min(1).max(24),
    productAuthority: z.literal('none')
});

export const D2LResultSchema = z.strictObject({
    ...D2LResultBaseSchema.shape,
    resultDigest: DigestSchema
}).superRefine((value, context) => {
    const { resultDigest, ...payload } = value;
    if (resultDigest !== sha256Digest(payload)) {
        context.addIssue({ code: 'custom', path: ['resultDigest'], message: 'Result digest mismatch.' });
    }
});

export type D2LRawExport = z.infer<typeof D2LRawExportSchema>;
export type D2LMatch = z.infer<typeof D2LMatchSchema>;
export type D2LVariantSummary = z.infer<typeof D2LVariantSummarySchema>;
export type D2LResult = z.infer<typeof D2LResultSchema>;

export function canonicalD2LRaw(value: D2LRawExport): string {
    return canonicalJson(D2LRawExportSchema.parse(value));
}
