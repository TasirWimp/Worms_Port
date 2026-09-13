import { z } from 'zod';

import { canonicalJson, sha256Digest, type JsonValue } from '../canonical';
import { D2HCarrierSchema } from './reachable-carrier-schemas';

export const D2O_SCHEMA_VERSION = 1 as const;
export const D2O_EXPORT_ID = 'wp-015d2o-f4-natural-matched-twin-reachability' as const;
export const D2O_RESULT_ID = 'wp-015d2o-f4-natural-matched-twin-assessment' as const;
export const D2O_SOURCE_COMMIT = '3a1d844fce9be09ed8ec51e39fe0f94632f43fe5' as const;
export const D2O_CRPM_COMMIT = '053c6fc0a90ed48d8667016b18a1d10106a7a2bc' as const;
export const D2O_D2N_RESULT_DIGEST = '5c554344271e2543cc6811fa579b28d85054da19b067acb8d12e7c60bed03dc8' as const;
export const D2O_MODEL_SHA256 = 'af0b0ec8d9893e992bdc95123a915e24a2305ee2b9fff32bce95d27cdb4c8c08' as const;
export const D2O_CONFIG_SHA256 = '5e519b09ea5e5684185bcd527600705825ba75df8f01e310adb027d09d4f54e0' as const;

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
const RoleSchema = z.union([z.enum(['responder', 'preparer']), z.null()]);
const FinishReasonSchema = z.enum(['unravelled', 'turn_limit']);
const PolicySchema = z.enum([
    'range_pressure', 'medium_hold', 'short_approach', 'retreat_kite', 'best_response'
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

export const D2OSourceBindingsSchema = z.strictObject({
    repositoryId: z.literal('worms-port'),
    sourceCommit: z.literal(D2O_SOURCE_COMMIT),
    crpmMethodCommit: z.literal(D2O_CRPM_COMMIT),
    d2nResultDigest: z.literal(D2O_D2N_RESULT_DIGEST),
    modelPath: z.literal('analysis/tactical_model/model.py'),
    modelSha256: z.literal(D2O_MODEL_SHA256),
    configPath: z.literal(
        'analysis/tactical_model/configs/v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4.json'
    ),
    configSha256: z.literal(D2O_CONFIG_SHA256),
    configId: z.literal(
        'v5-range-damage-forward-seam-pin-escape-slack-spoolburst-preparation-spun-cocoon-threadback-unweave-candidate-f4'
    ),
    configSchemaVersion: z.literal(11),
    publicFunctions: z.tuple([
        z.literal('initial_state'),
        z.literal('legal_actions'),
        z.literal('apply_action'),
        z.literal('choose_action'),
        z.literal('tactical_state_key'),
        z.literal('tactical_state_snapshot')
    ])
});

const D2ODomainSchema = z.strictObject({
    startingDistances: z.tuple([z.literal(639), z.literal(640), z.literal(641)]),
    firstActors: z.tuple([z.literal('player'), z.literal('loomkeeper')]),
    mirrored: z.tuple([z.literal(false), z.literal(true)]),
    initialScenarioCount: z.literal(12),
    maximumPrefixActions: z.literal(4),
    collectionGate: z.literal('first_preparation_response_carrier'),
    terminalBranchRule: z.literal('stop'),
    responseCarrierBranchRule: z.literal('stop'),
    pathGeneration: z.literal('all_legal_actions'),
    transitionFunction: z.literal('apply_action'),
    policyNames: z.tuple([
        z.literal('range_pressure'),
        z.literal('medium_hold'),
        z.literal('short_approach'),
        z.literal('retreat_kite'),
        z.literal('best_response')
    ]),
    orderedContinuationPolicyPairCount: z.literal(25),
    seed: z.literal(3237998097),
    maximumTurns: z.literal(16),
    constraints: z.array(TrimmedStringSchema).length(4)
});

const D2OCensusSchema = z.strictObject({
    generatedTransitionCount: NonNegativeSafeIntegerSchema,
    terminalBranchCount: NonNegativeSafeIntegerSchema,
    openFrontierBranchCount: NonNegativeSafeIntegerSchema,
    responseCarrierOccurrenceCount: z.literal(2100),
    distinctFullStateCount: z.literal(1520),
    normalizedCarrierClassCount: z.literal(319),
    continuationTargetClassCount: z.literal(122)
});

export const D2OActorSupportSchema = z.strictObject({
    stitching: NonNegativeSafeIntegerSchema,
    seamPinSourceRole: RoleSchema,
    seamPinTurns: NonNegativeSafeIntegerSchema,
    seamPinCooldown: NonNegativeSafeIntegerSchema,
    escapeSlack: NonNegativeSafeIntegerSchema,
    braceTurns: NonNegativeSafeIntegerSchema,
    braceUses: NonNegativeSafeIntegerSchema,
    spoolburstPreparationTurns: NonNegativeSafeIntegerSchema,
    spoolburstCocoonHits: NonNegativeSafeIntegerSchema,
    openingWeaveHits: NonNegativeSafeIntegerSchema,
    seamPinMaximumSeparationIncrease: z.union([NonNegativeSafeIntegerSchema, z.null()]),
    frayedSeamSourceRole: RoleSchema,
    frayedSeamTurns: NonNegativeSafeIntegerSchema
});

const ImmediateSignatureSchema = z.strictObject({
    responseKind: z.enum([
        'needlepoint', 'threadball', 'spoolburst', 'counter_preparation',
        'paid_unweave', 'relocate', 'wait', 'brace'
    ]),
    actionKind: z.enum([
        'cast', 'relocate', 'brace', 'prepare_spoolburst', 'unweave_spoolburst', 'wait'
    ]),
    relicId: z.union([z.enum(['threadball', 'needlepoint', 'spoolburst']), z.null()]),
    completedTurnsDelta: SafeIntegerSchema,
    distanceDelta: SafeIntegerSchema,
    damageToResponder: SafeIntegerSchema,
    damageToPreparer: SafeIntegerSchema,
    responderEscapeSlackDelta: SafeIntegerSchema,
    preparerEscapeSlackDelta: SafeIntegerSchema,
    responderPreparationDelta: SafeIntegerSchema,
    preparerPreparationDelta: SafeIntegerSchema,
    responderCocoonDelta: SafeIntegerSchema,
    preparerCocoonDelta: SafeIntegerSchema
});

const OutcomeSchema = z.strictObject({
    responderPolicy: PolicySchema,
    preparerPolicy: PolicySchema,
    responderResult: ResponderResultSchema,
    finishReason: FinishReasonSchema,
    nonterminalRecurrence: z.boolean()
});

const OutcomeRowSchema = z.strictObject({
    immediateSignature: ImmediateSignatureSchema,
    outcomes: z.array(OutcomeSchema).length(25)
}).superRefine((value, context) => {
    const policies = new Set(value.outcomes.map(
        (item) => `${item.responderPolicy}/${item.preparerPolicy}`
    ));
    if (policies.size !== 25) {
        context.addIssue({ code: 'custom', path: ['outcomes'], message: 'Outcome policy pairs must be unique.' });
    }
});

export const D2OOutcomeRelationSchema = z.strictObject({
    relationRef: IdentifierSchema,
    outcomeRelationDigest: DigestSchema,
    outcomeProjection: z.array(OutcomeRowSchema).min(1).max(32),
    responseCount: NonNegativeSafeIntegerSchema,
    continuationCount: NonNegativeSafeIntegerSchema,
    responderWinCount: NonNegativeSafeIntegerSchema,
    preparerWinCount: NonNegativeSafeIntegerSchema,
    drawCount: NonNegativeSafeIntegerSchema,
    turnLimitCount: NonNegativeSafeIntegerSchema,
    recurrenceCount: NonNegativeSafeIntegerSchema
}).superRefine((value, context) => {
    const expected = sha256Digest(value.outcomeProjection);
    if (value.outcomeRelationDigest !== expected) {
        context.addIssue({ code: 'custom', path: ['outcomeRelationDigest'], message: 'Outcome relation digest mismatch.' });
    }
    if (value.relationRef !== `d2o-relation-${expected.slice(0, 24)}`) {
        context.addIssue({ code: 'custom', path: ['relationRef'], message: 'Outcome relation reference mismatch.' });
    }
    if (value.responseCount !== value.outcomeProjection.length ||
        value.continuationCount !== value.responseCount * 25 ||
        value.responderWinCount + value.preparerWinCount + value.drawCount !== value.continuationCount) {
        context.addIssue({ code: 'custom', path: ['continuationCount'], message: 'Outcome relation counts do not close.' });
    }
    const outcomes = value.outcomeProjection.flatMap((item) => item.outcomes);
    const expectedCounts = {
        responderWinCount: outcomes.filter((item) => item.responderResult === 'responder_win').length,
        preparerWinCount: outcomes.filter((item) => item.responderResult === 'preparer_win').length,
        drawCount: outcomes.filter((item) => item.responderResult === 'draw').length,
        turnLimitCount: outcomes.filter((item) => item.finishReason === 'turn_limit').length,
        recurrenceCount: outcomes.filter((item) => item.nonterminalRecurrence).length
    };
    for (const [key, expectedCount] of Object.entries(expectedCounts)) {
        if (value[key as keyof typeof expectedCounts] !== expectedCount) {
            context.addIssue({ code: 'custom', path: [key], message: 'Outcome relation summary count mismatch.' });
        }
    }
    const signatures = value.outcomeProjection.map((item) => canonicalJson(item.immediateSignature));
    if (new Set(signatures).size !== signatures.length) {
        context.addIssue({ code: 'custom', path: ['outcomeProjection'], message: 'Immediate signatures must be unique.' });
    }
});

export const D2OFullStateSchema = z.strictObject({
    stateRef: IdentifierSchema,
    stateDigest: DigestSchema,
    state: D2HCarrierSchema,
    normalizedCarrierRef: IdentifierSchema,
    outcomeRelationRef: IdentifierSchema,
    outcomeRelationDigest: DigestSchema,
    timedRelationDigest: DigestSchema,
    responseCount: NonNegativeSafeIntegerSchema,
    continuationCount: NonNegativeSafeIntegerSchema,
    responderWinCount: NonNegativeSafeIntegerSchema,
    preparerWinCount: NonNegativeSafeIntegerSchema,
    drawCount: NonNegativeSafeIntegerSchema,
    turnLimitCount: NonNegativeSafeIntegerSchema,
    recurrenceCount: NonNegativeSafeIntegerSchema
}).superRefine((value, context) => {
    if (value.stateDigest !== sha256Digest(value.state) ||
        value.stateRef !== `d2o-state-${value.stateDigest.slice(0, 24)}`) {
        context.addIssue({ code: 'custom', path: ['stateDigest'], message: 'Full-state digest or reference mismatch.' });
    }
    if (value.outcomeRelationRef !== `d2o-relation-${value.outcomeRelationDigest.slice(0, 24)}`) {
        context.addIssue({ code: 'custom', path: ['outcomeRelationRef'], message: 'Full-state relation reference mismatch.' });
    }
});

export const D2OCarrierClassSchema = z.strictObject({
    carrierRef: IdentifierSchema,
    carrierDigest: DigestSchema,
    completedTurns: z.union([z.literal(2), z.literal(3), z.literal(4)]),
    remainingTurns: z.union([z.literal(14), z.literal(13), z.literal(12)]),
    separation: NonNegativeSafeIntegerSchema,
    responderSupport: D2OActorSupportSchema,
    preparerSupport: D2OActorSupportSchema,
    fullStateRefs: z.array(IdentifierSchema).min(1).max(16),
    occurrenceRefs: z.array(IdentifierSchema).min(1).max(2100),
    outcomeRelationRefs: z.array(IdentifierSchema).length(1),
    deterministicMapEligible: z.literal(true)
}).superRefine((value, context) => {
    const payload = {
        completedTurns: value.completedTurns,
        remainingTurns: value.remainingTurns,
        separation: value.separation,
        responderSupport: value.responderSupport,
        preparerSupport: value.preparerSupport
    };
    const expected = sha256Digest(payload);
    if (value.carrierDigest !== expected || value.carrierRef !== `d2o-carrier-${expected.slice(0, 24)}`) {
        context.addIssue({ code: 'custom', path: ['carrierDigest'], message: 'Carrier class digest or reference mismatch.' });
    }
    if (value.remainingTurns !== 16 - value.completedTurns ||
        new Set(value.fullStateRefs).size !== value.fullStateRefs.length ||
        new Set(value.occurrenceRefs).size !== value.occurrenceRefs.length) {
        context.addIssue({ code: 'custom', path: [], message: 'Carrier class horizon or membership mismatch.' });
    }
});

export const D2OOccurrenceSchema = z.strictObject({
    occurrenceRef: IdentifierSchema,
    occurrenceDigest: DigestSchema,
    startingDistance: z.union([z.literal(639), z.literal(640), z.literal(641)]),
    firstActor: ActorSchema,
    mirrored: z.boolean(),
    pathActions: z.array(TrimmedStringSchema).min(2).max(4),
    fullStateDigest: DigestSchema,
    normalizedCarrierRef: IdentifierSchema,
    completedTurns: z.union([z.literal(2), z.literal(3), z.literal(4)]),
    responder: ActorSchema,
    responderPhase: z.enum(['first', 'second']),
    pathKindPrefix: z.array(z.enum([
        'cast', 'relocate', 'brace', 'prepare_spoolburst', 'unweave_spoolburst', 'wait'
    ])).min(2).max(4),
    pathDigest: DigestSchema,
    fullStateRef: IdentifierSchema
}).superRefine((value, context) => {
    const identity = {
        startingDistance: value.startingDistance,
        firstActor: value.firstActor,
        mirrored: value.mirrored,
        pathActions: value.pathActions,
        fullStateDigest: value.fullStateDigest,
        normalizedCarrierRef: value.normalizedCarrierRef
    };
    const expected = sha256Digest(identity);
    if (value.occurrenceDigest !== expected ||
        value.occurrenceRef !== `d2o-occurrence-${expected.slice(0, 24)}`) {
        context.addIssue({ code: 'custom', path: ['occurrenceDigest'], message: 'Occurrence digest or reference mismatch.' });
    }
    if (value.pathDigest !== sha256Digest(value.pathActions) ||
        value.pathKindPrefix.length !== value.pathActions.length ||
        value.completedTurns !== value.pathActions.length ||
        value.fullStateRef !== `d2o-state-${value.fullStateDigest.slice(0, 24)}`) {
        context.addIssue({ code: 'custom', path: ['pathDigest'], message: 'Occurrence path or state linkage mismatch.' });
    }
});

const D2ORawBaseSchema = z.strictObject({
    schemaVersion: z.literal(D2O_SCHEMA_VERSION),
    exportId: z.literal(D2O_EXPORT_ID),
    sourceBindings: D2OSourceBindingsSchema,
    domain: D2ODomainSchema,
    census: D2OCensusSchema,
    occurrences: z.array(D2OOccurrenceSchema).length(2100),
    fullStates: z.array(D2OFullStateSchema).length(1520),
    carrierClasses: z.array(D2OCarrierClassSchema).length(319),
    outcomeRelations: z.array(D2OOutcomeRelationSchema).length(122),
    blockedClaims: z.array(TrimmedStringSchema).length(3),
    productAuthority: z.literal('none')
});

export const D2ORawExportSchema = z.strictObject({
    ...D2ORawBaseSchema.shape,
    exportDigest: DigestSchema
}).superRefine((value, context) => {
    const { exportDigest, ...payload } = value;
    if (exportDigest !== sha256Digest(payload)) {
        context.addIssue({ code: 'custom', path: ['exportDigest'], message: 'D2O raw export digest mismatch.' });
    }
    const occurrenceRefs = new Set(value.occurrences.map((item) => item.occurrenceRef));
    const stateByRef = new Map(value.fullStates.map((item) => [item.stateRef, item]));
    const carrierByRef = new Map(value.carrierClasses.map((item) => [item.carrierRef, item]));
    const relationByRef = new Map(value.outcomeRelations.map((item) => [item.relationRef, item]));
    if (occurrenceRefs.size !== 2100 || stateByRef.size !== 1520 ||
        carrierByRef.size !== 319 || relationByRef.size !== 122) {
        context.addIssue({ code: 'custom', path: [], message: 'D2O raw references must be unique.' });
        return;
    }
    for (const occurrence of value.occurrences) {
        const state = stateByRef.get(occurrence.fullStateRef);
        const carrier = carrierByRef.get(occurrence.normalizedCarrierRef);
        if (!state || !carrier || state.stateDigest !== occurrence.fullStateDigest ||
            state.normalizedCarrierRef !== carrier.carrierRef ||
            state.state.activeActor !== occurrence.responder ||
            occurrence.responderPhase !==
                (occurrence.responder === occurrence.firstActor ? 'first' : 'second') ||
            !carrier.occurrenceRefs.includes(occurrence.occurrenceRef)) {
            context.addIssue({ code: 'custom', path: ['occurrences'], message: 'Occurrence linkage is not closed.' });
            break;
        }
    }
    for (const state of value.fullStates) {
        const carrier = carrierByRef.get(state.normalizedCarrierRef);
        const relation = relationByRef.get(state.outcomeRelationRef);
        if (!carrier || !relation || !carrier.fullStateRefs.includes(state.stateRef) ||
            relation.outcomeRelationDigest !== state.outcomeRelationDigest ||
            relation.responseCount !== state.responseCount ||
            relation.continuationCount !== state.continuationCount ||
            relation.responderWinCount !== state.responderWinCount ||
            relation.preparerWinCount !== state.preparerWinCount ||
            relation.drawCount !== state.drawCount ||
            relation.turnLimitCount !== state.turnLimitCount ||
            relation.recurrenceCount !== state.recurrenceCount ||
            !carrier.outcomeRelationRefs.includes(state.outcomeRelationRef)) {
            context.addIssue({ code: 'custom', path: ['fullStates'], message: 'State/carrier/relation linkage is not closed.' });
            break;
        }
    }
});

export const D2OTwinFamilySchema = z.enum([
    'geometry_control',
    'route_order_control',
    'phase_horizon_control',
    'completed_turn_control'
]);

const D2OTwinWitnessBaseSchema = z.strictObject({
    schemaVersion: z.literal(D2O_SCHEMA_VERSION),
    family: D2OTwinFamilySchema,
    leftOccurrenceRef: IdentifierSchema,
    rightOccurrenceRef: IdentifierSchema,
    leftStateRef: IdentifierSchema,
    rightStateRef: IdentifierSchema,
    leftCarrierRef: IdentifierSchema,
    rightCarrierRef: IdentifierSchema,
    leftRelationRef: IdentifierSchema,
    rightRelationRef: IdentifierSchema,
    leftStartingDistance: z.union([z.literal(639), z.literal(640), z.literal(641)]),
    rightStartingDistance: z.union([z.literal(639), z.literal(640), z.literal(641)]),
    leftCompletedTurns: z.union([z.literal(2), z.literal(3), z.literal(4)]),
    rightCompletedTurns: z.union([z.literal(2), z.literal(3), z.literal(4)]),
    leftResponderPhase: z.enum(['first', 'second']),
    rightResponderPhase: z.enum(['first', 'second']),
    leftSeparation: NonNegativeSafeIntegerSchema,
    rightSeparation: NonNegativeSafeIntegerSchema,
    leftPathKinds: z.array(TrimmedStringSchema).min(2).max(4),
    rightPathKinds: z.array(TrimmedStringSchema).min(2).max(4),
    continuationEqual: z.boolean(),
    differenceClassification: z.enum(['none', 'turn_limit_horizon_only', 'tactical_continuation']),
    differingOutcomeCount: NonNegativeSafeIntegerSchema,
    turnLimitInvolvedDifferenceCount: NonNegativeSafeIntegerSchema,
    reasons: z.array(TrimmedStringSchema).min(1).max(8)
});

export const D2OTwinWitnessSchema = z.strictObject({
    witnessRef: IdentifierSchema,
    ...D2OTwinWitnessBaseSchema.shape,
    witnessDigest: DigestSchema
}).superRefine((value, context) => {
    const { witnessRef, witnessDigest, ...payload } = value;
    const expected = sha256Digest(payload);
    if (witnessDigest !== expected || witnessRef !== `d2o-twin-${expected.slice(0, 24)}`) {
        context.addIssue({ code: 'custom', path: ['witnessDigest'], message: 'Twin witness digest or reference mismatch.' });
    }
});

export const D2OFamilyAssessmentSchema = z.strictObject({
    family: D2OTwinFamilySchema,
    pairCount: NonNegativeSafeIntegerSchema,
    continuationEqualPairCount: NonNegativeSafeIntegerSchema,
    continuationSplitPairCount: NonNegativeSafeIntegerSchema,
    turnLimitOnlySplitPairCount: NonNegativeSafeIntegerSchema,
    tacticalSplitPairCount: NonNegativeSafeIntegerSchema,
    targetRelevance: z.enum([
        'trace_only_bounded',
        'conditional',
        'analytical_horizon_parity',
        'overfine_in_declared_controls'
    ]),
    recursiveCarrierRole: z.enum([
        'not_required_bounded',
        'required_conditionally',
        'excluded_gameplay_axis',
        'not_required_at_same_phase'
    ]),
    publicSupport: z.array(IdentifierSchema).min(1).max(12),
    witnessRefs: z.array(IdentifierSchema).min(1).max(4),
    reasons: z.array(TrimmedStringSchema).min(1).max(12)
});

const D2OResultBaseSchema = z.strictObject({
    schemaVersion: z.literal(D2O_SCHEMA_VERSION),
    resultId: z.literal(D2O_RESULT_ID),
    sourceBindings: z.strictObject({
        ...D2OSourceBindingsSchema.shape,
        rawExportDigest: DigestSchema,
        crpmSourceBlobs: z.strictObject({
            candidateSpineCalibration: z.literal('8abf4a12442ab656c3a70b0b387da43eec99b03b'),
            nullSpaceSearch: z.literal('15c431dda12688c1368809345d6080dab510ca8a'),
            witnessProbeCarrier: z.literal('d89b9741162f12af77b92f762f52676cc14db245'),
            compatibilityFibre: z.literal('4584b57499cbd90948d8d07557e5b01ede894906')
        })
    }),
    domain: D2ODomainSchema,
    census: D2OCensusSchema,
    familyAssessments: z.array(D2OFamilyAssessmentSchema).length(4),
    twinWitnesses: z.array(D2OTwinWitnessSchema).length(6),
    quotientCongruence: z.strictObject({
        normalizedCarrierClassCount: z.literal(319),
        congruentCarrierClassCount: z.literal(319),
        aliasedCarrierClassCount: z.literal(0),
        outcomeRelationClassCount: z.literal(122),
        deterministicMapEligible: z.literal(true),
        boundedStatement: TrimmedStringSchema
    }),
    globalDisposition: z.strictObject({
        classification: z.enum([
            'd2a_axes_calibrated_authority_horizon_review_required',
            'f4_natural_domain_retains_unresolved_covariance',
            'unexpected_non_horizon_phase_split',
            'no_natural_matched_twins_found',
            'source_or_topology_drift'
        ]),
        routeHistoryRole: z.literal('trace_and_reentry_not_recursive_state_bounded'),
        geometryRole: z.literal('conditionally_target_relevant'),
        phaseRole: z.literal('analytical_turn_horizon_parity_not_gameplay_status'),
        completedTurnRole: z.literal('exact_count_overfine_same_phase_bounded'),
        expandedD2AChartAllowed: z.boolean(),
        gameplayChartRequiresAuthorityReview: z.literal(true),
        nextPermittedAction: TrimmedStringSchema,
        reasons: z.array(TrimmedStringSchema).min(1).max(16)
    }),
    accumulatedResidue: z.array(IdentifierSchema).min(1).max(40),
    blockedClaims: z.array(TrimmedStringSchema).min(1).max(40),
    reentryInstructions: z.array(TrimmedStringSchema).min(1).max(16),
    productAuthority: z.literal('none')
});

export const D2OResultSchema = z.strictObject({
    ...D2OResultBaseSchema.shape,
    resultDigest: DigestSchema
}).superRefine((value, context) => {
    const { resultDigest, ...payload } = value;
    if (resultDigest !== sha256Digest(payload)) {
        context.addIssue({ code: 'custom', path: ['resultDigest'], message: 'D2O result digest mismatch.' });
    }
    if (new Set(value.familyAssessments.map((item) => item.family)).size !== 4 ||
        new Set(value.twinWitnesses.map((item) => item.witnessRef)).size !== 6) {
        context.addIssue({ code: 'custom', path: [], message: 'D2O families and witnesses must be unique.' });
    }
    const witnessRefs = new Set(value.twinWitnesses.map((item) => item.witnessRef));
    if (value.familyAssessments.some((item) =>
        item.witnessRefs.some((reference) => !witnessRefs.has(reference)))) {
        context.addIssue({ code: 'custom', path: ['familyAssessments'], message: 'D2O family witness linkage is not closed.' });
    }
});

export type D2ORawExport = z.infer<typeof D2ORawExportSchema>;
export type D2OOccurrence = z.infer<typeof D2OOccurrenceSchema>;
export type D2OFullState = z.infer<typeof D2OFullStateSchema>;
export type D2OCarrierClass = z.infer<typeof D2OCarrierClassSchema>;
export type D2OOutcomeRelation = z.infer<typeof D2OOutcomeRelationSchema>;
export type D2OTwinFamily = z.infer<typeof D2OTwinFamilySchema>;
export type D2OTwinWitness = z.infer<typeof D2OTwinWitnessSchema>;
export type D2OResult = z.infer<typeof D2OResultSchema>;
