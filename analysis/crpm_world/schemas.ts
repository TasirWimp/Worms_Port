import { z } from 'zod';

import { canonicalJson, sha256Digest, type JsonValue } from './canonical';

export const CRPM_WORLD_SCHEMA_VERSION = 1 as const;

const SchemaVersionSchema = z.literal(CRPM_WORLD_SCHEMA_VERSION);
const IsoWallClockValuePattern = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/;
const TrimmedStringSchema = z.string().min(1).max(4_096).refine(
    (value) => value.trim() === value,
    'String values must not contain leading or trailing whitespace.'
).refine(
    (value) => !IsoWallClockValuePattern.test(value),
    'Wall-clock timestamp values are not allowed in deterministic artifacts.'
);
const IdentifierSchema = z.string()
    .min(1)
    .max(160)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const SourcePathSchema = z.string()
    .min(1)
    .max(512)
    .refine((value) => value.trim() === value && !value.includes('\\') &&
        !value.startsWith('/') && !value.split('/').includes('..'),
        'Source paths must be trimmed repository-relative POSIX paths.');
const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const CommitShaSchema = z.string().regex(/^[0-9a-f]{40}$/);
const VersionSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
    .refine((value) => !Object.is(value, -0));
const NonNegativeSafeIntegerSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
    .refine((value) => !Object.is(value, -0));
const DeterministicNumberSchema = z.number().superRefine((value, context) => {
    if (!Number.isFinite(value)) {
        context.addIssue({ code: 'custom', message: 'Numbers must be finite.' });
    } else if (Object.is(value, -0)) {
        context.addIssue({ code: 'custom', message: 'Negative zero is not deterministic JSON.' });
    } else if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
        context.addIssue({ code: 'custom', message: 'Integer values must be safe integers.' });
    }
});

function uniqueStringArray(item: z.ZodString, minimum = 0, maximum = 256) {
    return z.array(item).min(minimum).max(maximum).superRefine((values, context) => {
        const seen = new Set<string>();
        for (let index = 0; index < values.length; index += 1) {
            if (seen.has(values[index])) {
                context.addIssue({
                    code: 'custom',
                    path: [index],
                    message: `Duplicate value ${JSON.stringify(values[index])}.`
                });
            }
            seen.add(values[index]);
        }
    });
}

const IdentifierListSchema = uniqueStringArray(IdentifierSchema, 0);
const NonEmptyIdentifierListSchema = uniqueStringArray(IdentifierSchema, 1);
const DescriptionListSchema = uniqueStringArray(TrimmedStringSchema, 0);
const NonEmptyDescriptionListSchema = uniqueStringArray(TrimmedStringSchema, 1);

export const DeterministicJsonValueSchema = z.custom<JsonValue>((value) => {
    try {
        canonicalJson(value);
        return true;
    } catch {
        return false;
    }
}, 'Value must be deterministic JSON without unstable timestamp fields.');

export const ProductAuthoritySchema = z.enum([
    'none',
    'authority-adapter-parity',
    'owner-reviewed',
    'versioned-ruleset-approved',
    'production-active'
]);

export const CarrierMaturitySchema = z.enum([
    'M0_appearance',
    'M1_declaration',
    'M2_local_use',
    'M3_bounded_design_landfall'
]);

export const SupportStatusSchema = z.enum([
    'unsupported',
    'declared',
    'witnessed',
    'verified',
    'blocked'
]);

export const EvidenceOriginSchema = z.enum([
    'authority-derived',
    'analysis-derived',
    'methodological',
    'synthetic-contract-test'
]);

export const AdapterReferenceSchema = z.strictObject({
    id: IdentifierSchema,
    version: VersionSchema
});

export const CutReferenceSchema = z.strictObject({
    id: IdentifierSchema,
    version: VersionSchema
});

export const SourceLockSchema = z.strictObject({
    repositoryId: IdentifierSchema,
    commit: CommitShaSchema,
    paths: uniqueStringArray(SourcePathSchema, 1, 128)
});

export const ScenarioDomainSchema = z.strictObject({
    schemaVersion: SchemaVersionSchema,
    scenarioIds: NonEmptyIdentifierListSchema,
    actionFamilies: NonEmptyIdentifierListSchema,
    policyFamilies: IdentifierListSchema,
    seeds: z.array(NonNegativeSafeIntegerSchema).min(1).max(1_024).superRefine((values, context) => {
        const seen = new Set<number>();
        for (let index = 0; index < values.length; index += 1) {
            if (seen.has(values[index])) {
                context.addIssue({ code: 'custom', path: [index], message: 'Seed values must be unique.' });
            }
            seen.add(values[index]);
        }
    }),
    constraints: DescriptionListSchema
});

export const WorldCarrierReferenceSchema = z.strictObject({
    schemaVersion: SchemaVersionSchema,
    profileVersion: VersionSchema,
    carrierKind: z.enum([
        'authority',
        'replay',
        'player-public',
        'presentation',
        'tactical-analysis',
        'world-design'
    ]),
    adapter: AdapterReferenceSchema,
    rulesetOrConfigId: IdentifierSchema,
    baselineDigest: DigestSchema,
    stateDigest: DigestSchema,
    revisionOrStep: NonNegativeSafeIntegerSchema,
    sourceReference: TrimmedStringSchema.optional()
});

export const WorldCutDefinitionSchema = z.strictObject({
    schemaVersion: SchemaVersionSchema,
    cutId: IdentifierSchema,
    cutVersion: VersionSchema,
    sourceCarrierKind: WorldCarrierReferenceSchema.shape.carrierKind,
    projectionDescription: TrimmedStringSchema,
    admissibleDomain: ScenarioDomainSchema,
    protectedFamily: NonEmptyDescriptionListSchema,
    includedSupport: NonEmptyIdentifierListSchema,
    intentionallyForgottenDistinctions: DescriptionListSchema,
    excludedClaims: NonEmptyDescriptionListSchema,
    deterministicContinuationClaim: z.enum(['complete', 'bounded', 'relational', 'none'])
});

export const PortDefinitionSchema = z.strictObject({
    id: IdentifierSchema,
    description: TrimmedStringSchema,
    required: z.boolean()
});

const PortListSchema = z.array(PortDefinitionSchema).min(1).max(128).superRefine((ports, context) => {
    const ids = new Set<string>();
    for (let index = 0; index < ports.length; index += 1) {
        if (ids.has(ports[index].id)) {
            context.addIssue({ code: 'custom', path: [index, 'id'], message: 'Port ids must be unique.' });
        }
        ids.add(ports[index].id);
    }
});

export const ContractCatalogsSchema = z.strictObject({
    adapters: z.array(AdapterReferenceSchema).max(128).superRefine((adapters, context) => {
        const ids = new Set<string>();
        for (let index = 0; index < adapters.length; index += 1) {
            const key = `${adapters[index].id}@${adapters[index].version}`;
            if (ids.has(key)) {
                context.addIssue({ code: 'custom', path: [index], message: 'Adapter registrations must be unique.' });
            }
            ids.add(key);
        }
    }),
    rulesetsOrConfigs: IdentifierListSchema,
    cuts: z.array(CutReferenceSchema).max(128).superRefine((cuts, context) => {
        const ids = new Set<string>();
        for (let index = 0; index < cuts.length; index += 1) {
            const key = `${cuts[index].id}@${cuts[index].version}`;
            if (ids.has(key)) {
                context.addIssue({ code: 'custom', path: [index], message: 'Cut registrations must be unique.' });
            }
            ids.add(key);
        }
    }),
    edgeKinds: IdentifierListSchema,
    domainMotifs: IdentifierListSchema
});

export const PortContractSchema = z.strictObject({
    schemaVersion: SchemaVersionSchema,
    profileVersion: VersionSchema,
    portContractId: IdentifierSchema,
    portContractVersion: VersionSchema,
    catalogs: ContractCatalogsSchema,
    contextPorts: PortListSchema,
    inputPorts: PortListSchema,
    outputPorts: PortListSchema,
    observedPorts: PortListSchema,
    actuatedPorts: PortListSchema,
    evidencePorts: PortListSchema,
    supportPorts: PortListSchema,
    returnPorts: PortListSchema,
    forbiddenPorts: PortListSchema,
    escalationTriggers: NonEmptyDescriptionListSchema
});

export const DeltaSchema = z.strictObject({
    subject: IdentifierSchema,
    before: DeterministicJsonValueSchema,
    after: DeterministicJsonValueSchema,
    description: TrimmedStringSchema
});

export const AuthorityDeltaSchema = z.strictObject({
    subject: IdentifierSchema,
    before: ProductAuthoritySchema,
    after: ProductAuthoritySchema,
    rationale: TrimmedStringSchema
});

export const ResidualLedgerSchema = z.strictObject({
    schemaVersion: SchemaVersionSchema,
    positionDeltas: z.array(DeltaSchema).max(256),
    resourceDeltas: z.array(DeltaSchema).max(256),
    healthDeltas: z.array(DeltaSchema).max(256),
    statusDeltas: z.array(DeltaSchema).max(256),
    terrainDeltas: z.array(DeltaSchema).max(256),
    authorityDeltas: z.array(AuthorityDeltaSchema).max(64),
    expiredRights: IdentifierListSchema,
    openedObligations: IdentifierListSchema,
    dischargedObligations: IdentifierListSchema,
    unresolvedObligations: IdentifierListSchema,
    excludedUnmodelledResidue: DescriptionListSchema
});

export const WitnessReferenceSchema = z.strictObject({
    witnessId: IdentifierSchema,
    digest: DigestSchema
});

export const FixedFrameSchema = z.strictObject({
    schemaVersion: SchemaVersionSchema,
    sourceLocks: z.array(SourceLockSchema).min(1).max(16),
    baselineOrConfigId: IdentifierSchema,
    adapter: AdapterReferenceSchema,
    scenarioDomain: ScenarioDomainSchema,
    sourceCutId: IdentifierSchema,
    targetCutId: IdentifierSchema,
    actorOrPolicy: IdentifierSchema,
    expectedRevisionOrStep: NonNegativeSafeIntegerSchema
});

export const EdgePortBindingsSchema = z.strictObject({
    contextPorts: NonEmptyIdentifierListSchema,
    actionPorts: NonEmptyIdentifierListSchema,
    responsePorts: NonEmptyIdentifierListSchema,
    evidencePorts: NonEmptyIdentifierListSchema,
    supportPorts: NonEmptyIdentifierListSchema,
    returnPorts: NonEmptyIdentifierListSchema
});

const WorldTransitionEdgeBaseShape = {
    edgeId: IdentifierSchema,
    edgeVersion: VersionSchema,
    edgeKind: IdentifierSchema,
    domainMotif: IdentifierSchema,
    crpmTransitionInterpretation: z.enum([
        'refine',
        'compress',
        'decompress',
        'reorganize',
        'overlap-move'
    ]).optional(),
    crpmInterpretationJustification: TrimmedStringSchema.optional(),
    sourceCarrier: WorldCarrierReferenceSchema,
    targetCarrier: WorldCarrierReferenceSchema,
    sourceCutId: IdentifierSchema,
    targetCutId: IdentifierSchema,
    fixedFrame: FixedFrameSchema,
    commandOrDeclaration: DeterministicJsonValueSchema,
    response: DeterministicJsonValueSchema.optional(),
    protectedFamily: NonEmptyDescriptionListSchema,
    sourceRefs: NonEmptyDescriptionListSchema,
    witnessReferences: z.array(WitnessReferenceSchema).min(1).max(256),
    decoderRefs: NonEmptyIdentifierListSchema,
    carrierRefs: z.array(DigestSchema).min(2).max(256),
    pathPosition: NonNegativeSafeIntegerSchema,
    preserved: NonEmptyDescriptionListSchema,
    forgotten: DescriptionListSchema,
    newlyVisible: DescriptionListSchema,
    residual: ResidualLedgerSchema,
    reversibility: z.enum(['exact', 'protected_equivalent', 'repair_dependent', 'one_way']),
    returnCondition: TrimmedStringSchema,
    reopeningCondition: TrimmedStringSchema,
    supportStatus: SupportStatusSchema,
    productAuthority: ProductAuthoritySchema,
    authorityMutationObserved: z.literal(false)
};

export const WorldTransitionEdgeV1Schema = z.strictObject({
    schemaVersion: SchemaVersionSchema,
    ...WorldTransitionEdgeBaseShape
});

export const WorldTransitionEdgeV2Schema = z.strictObject({
    schemaVersion: z.literal(2),
    ...WorldTransitionEdgeBaseShape,
    portBindings: EdgePortBindingsSchema
});

export const WorldTransitionEdgeSchema = z.discriminatedUnion('schemaVersion', [
    WorldTransitionEdgeV1Schema,
    WorldTransitionEdgeV2Schema
]).superRefine((edge, context) => {
    if (edge.crpmTransitionInterpretation && !edge.crpmInterpretationJustification) {
        context.addIssue({ code: 'custom', path: ['crpmInterpretationJustification'], message: 'A CRPM transition interpretation requires an explicit bounded justification.' });
    }
    if (!edge.crpmTransitionInterpretation && edge.crpmInterpretationJustification) {
        context.addIssue({ code: 'custom', path: ['crpmInterpretationJustification'], message: 'CRPM interpretation justification is not allowed without an interpretation.' });
    }
    if (edge.sourceCutId !== edge.fixedFrame.sourceCutId) {
        context.addIssue({ code: 'custom', path: ['fixedFrame', 'sourceCutId'], message: 'Fixed frame source cut must match the edge.' });
    }
    if (edge.targetCutId !== edge.fixedFrame.targetCutId) {
        context.addIssue({ code: 'custom', path: ['fixedFrame', 'targetCutId'], message: 'Fixed frame target cut must match the edge.' });
    }
    if (edge.sourceCarrier.adapter.id !== edge.fixedFrame.adapter.id ||
        edge.sourceCarrier.adapter.version !== edge.fixedFrame.adapter.version) {
        context.addIssue({ code: 'custom', path: ['fixedFrame', 'adapter'], message: 'Fixed frame adapter must match the source carrier.' });
    }
    if (edge.sourceCarrier.rulesetOrConfigId !== edge.fixedFrame.baselineOrConfigId) {
        context.addIssue({ code: 'custom', path: ['fixedFrame', 'baselineOrConfigId'], message: 'Fixed frame baseline/config must match the source carrier.' });
    }
    const requiredCarrierDigests = [sha256Digest(edge.sourceCarrier), sha256Digest(edge.targetCarrier)];
    for (const digest of requiredCarrierDigests) {
        if (!edge.carrierRefs.includes(digest)) {
            context.addIssue({ code: 'custom', path: ['carrierRefs'], message: 'Carrier refs must include source and target carrier digests.' });
        }
    }
});

export const TransitionWitnessSchema = z.strictObject({
    schemaVersion: SchemaVersionSchema,
    witnessId: IdentifierSchema,
    witnessVersion: VersionSchema,
    edgeId: IdentifierSchema,
    evidenceOrigin: EvidenceOriginSchema,
    covarianceGroup: IdentifierSchema,
    deduplicationIdentity: DigestSchema,
    sourceRefs: NonEmptyDescriptionListSchema,
    decoderRefs: NonEmptyIdentifierListSchema,
    inputDigest: DigestSchema,
    outputDigest: DigestSchema,
    orderedEventsDigest: DigestSchema.optional(),
    status: z.enum(['exact', 'mismatch', 'not_tested']),
    mismatchResidual: ResidualLedgerSchema.optional(),
    excludedClaims: DescriptionListSchema
}).superRefine((witness, context) => {
    if (witness.status === 'mismatch' && witness.mismatchResidual === undefined) {
        context.addIssue({ code: 'custom', path: ['mismatchResidual'], message: 'Mismatch witnesses require explicit residual.' });
    }
    if (witness.status !== 'mismatch' && witness.mismatchResidual !== undefined) {
        context.addIssue({ code: 'custom', path: ['mismatchResidual'], message: 'Only mismatch witnesses may carry mismatch residual.' });
    }
});

export const ReturnObligationSchema = z.strictObject({
    schemaVersion: SchemaVersionSchema,
    obligationId: IdentifierSchema,
    obligationVersion: VersionSchema,
    obligationKind: z.enum([
        'current_readout_equality',
        'recursive_carrier_congruence',
        'invariant_membership',
        'finite_return',
        'route_composition_return'
    ]),
    originEdgeId: IdentifierSchema,
    bearer: IdentifierSchema,
    beneficiary: IdentifierSchema,
    supportCarrier: WorldCarrierReferenceSchema,
    legalResponses: NonEmptyDescriptionListSchema,
    expiryCondition: TrimmedStringSchema,
    dischargeCondition: TrimmedStringSchema,
    currentStatus: z.enum(['open', 'discharged', 'expired', 'blocked'])
});

export const CompatibilityResultSchema = z.strictObject({
    compatible: z.boolean(),
    checkedEdgeIds: IdentifierListSchema,
    issues: DescriptionListSchema
}).superRefine((result, context) => {
    if (result.compatible && result.issues.length > 0) {
        context.addIssue({ code: 'custom', path: ['issues'], message: 'Compatible voyages cannot carry compatibility issues.' });
    }
    if (!result.compatible && result.issues.length === 0) {
        context.addIssue({ code: 'custom', path: ['issues'], message: 'Incompatible voyages require an explicit issue.' });
    }
});

export const TerminalResultSchema = z.strictObject({
    status: z.enum(['completed', 'blocked', 'nonterminal', 'failed']),
    summary: TrimmedStringSchema,
    excludedClaims: DescriptionListSchema
});

export const ReplaySupportSchema = z.strictObject({
    supported: z.boolean(),
    replayRecordRefs: IdentifierListSchema,
    stateHashRefs: z.array(DigestSchema).max(256),
    limitations: DescriptionListSchema
});

export const VoyageTraceSchema = z.strictObject({
    schemaVersion: SchemaVersionSchema,
    voyageId: IdentifierSchema,
    voyageVersion: VersionSchema,
    initialCarrier: WorldCarrierReferenceSchema,
    transitionEdges: z.array(WorldTransitionEdgeSchema).max(1_024),
    finalCarrier: WorldCarrierReferenceSchema,
    compatibilityResult: CompatibilityResultSchema,
    accumulatedResidual: ResidualLedgerSchema,
    terminalResult: TerminalResultSchema,
    recurrenceWitnesses: z.array(WitnessReferenceSchema).max(256),
    returnWitnesses: z.array(WitnessReferenceSchema).max(256),
    replaySupport: ReplaySupportSchema
}).superRefine((voyage, context) => {
    const mismatches: string[] = [];
    const digest = (carrier: z.infer<typeof WorldCarrierReferenceSchema>) => sha256Digest(carrier);
    if (voyage.transitionEdges.length === 0) {
        if (digest(voyage.initialCarrier) !== digest(voyage.finalCarrier)) {
            mismatches.push('An empty voyage must retain the initial carrier.');
        }
    } else {
        if (digest(voyage.transitionEdges[0].sourceCarrier) !== digest(voyage.initialCarrier)) {
            mismatches.push('The first edge source does not match the initial carrier.');
        }
        for (let index = 1; index < voyage.transitionEdges.length; index += 1) {
            const previous = voyage.transitionEdges[index - 1];
            const current = voyage.transitionEdges[index];
            if (digest(previous.targetCarrier) !== digest(current.sourceCarrier)) {
                mismatches.push(`Carrier mismatch before edge ${current.edgeId}.`);
            }
            if (previous.targetCutId !== current.sourceCutId) {
                mismatches.push(`Cut mismatch before edge ${current.edgeId}.`);
            }
        }
        const lastEdge = voyage.transitionEdges[voyage.transitionEdges.length - 1];
        if (digest(lastEdge.targetCarrier) !== digest(voyage.finalCarrier)) {
            mismatches.push('The last edge target does not match the final carrier.');
        }
    }
    if (voyage.compatibilityResult.compatible && mismatches.length > 0) {
        for (const message of mismatches) {
            context.addIssue({ code: 'custom', path: ['compatibilityResult'], message });
        }
    }
});

export const ProjectionClassSchema = z.strictObject({
    classKey: IdentifierSchema,
    memberRefs: NonEmptyDescriptionListSchema
});

export const AliasingWitnessSchema = z.strictObject({
    witnessRef: WitnessReferenceSchema,
    sourceClassKey: IdentifierSchema,
    targetClassKey: IdentifierSchema,
    sourceItemRef: TrimmedStringSchema,
    targetItemRef: TrimmedStringSchema
});

export const AliasingWitnessPairSchema = z.strictObject({
    left: AliasingWitnessSchema,
    right: AliasingWitnessSchema
});

export const ObservedProjectionTransitionSchema = z.strictObject({
    sourceClassKey: IdentifierSchema,
    targetClassKeys: NonEmptyIdentifierListSchema
});

const ProjectionTransportAssessmentBaseShape = {
    assessmentId: IdentifierSchema,
    assessmentVersion: VersionSchema,
    sourceClasses: z.array(ProjectionClassSchema).min(1).max(1_024),
    targetClasses: z.array(ProjectionClassSchema).min(1).max(1_024),
    deterministicMapEligibility: z.boolean(),
    aliasingKeys: IdentifierListSchema,
    recommendedShape: z.enum(['map', 'relation_or_kernel']),
    sampledDomain: ScenarioDomainSchema,
    blockedClaims: NonEmptyDescriptionListSchema
};

export const ProjectionTransportAssessmentV1Schema = z.strictObject({
    schemaVersion: SchemaVersionSchema,
    ...ProjectionTransportAssessmentBaseShape,
    leftAliasingWitness: AliasingWitnessSchema.nullable(),
    rightAliasingWitness: AliasingWitnessSchema.nullable()
});

export const ProjectionTransportAssessmentV2Schema = z.strictObject({
    schemaVersion: z.literal(2),
    ...ProjectionTransportAssessmentBaseShape,
    observedTransitions: z.array(ObservedProjectionTransitionSchema).min(1).max(1_024),
    aliasingWitnessPairs: z.array(AliasingWitnessPairSchema).max(1_024)
});

export const ProjectionTransportAssessmentSchema = z.discriminatedUnion('schemaVersion', [
    ProjectionTransportAssessmentV1Schema,
    ProjectionTransportAssessmentV2Schema
]).superRefine((assessment, context) => {
    for (const [field, classes] of [
        ['sourceClasses', assessment.sourceClasses],
        ['targetClasses', assessment.targetClasses]
    ] as const) {
        const keys = new Set<string>();
        for (let index = 0; index < classes.length; index += 1) {
            if (keys.has(classes[index].classKey)) {
                context.addIssue({ code: 'custom', path: [field, index, 'classKey'], message: 'Projection class keys must be unique.' });
            }
            keys.add(classes[index].classKey);
        }
    }

    const pairs = assessment.schemaVersion === 1
        ? assessment.leftAliasingWitness && assessment.rightAliasingWitness
            ? [{ left: assessment.leftAliasingWitness, right: assessment.rightAliasingWitness }]
            : []
        : assessment.aliasingWitnessPairs;

    if (assessment.deterministicMapEligibility) {
        if (assessment.recommendedShape !== 'map' || assessment.aliasingKeys.length > 0 || pairs.length > 0) {
            context.addIssue({ code: 'custom', message: 'Map-eligible assessments cannot contain alias witnesses.' });
        }
    } else if (assessment.recommendedShape !== 'relation_or_kernel' ||
        assessment.aliasingKeys.length === 0 || pairs.length === 0) {
        context.addIssue({ code: 'custom', message: 'Ineligible assessments require explicit left/right aliases and relation_or_kernel.' });
        return;
    }

    const sourceKeys = new Set(assessment.sourceClasses.map((item) => item.classKey));
    const targetKeys = new Set(assessment.targetClasses.map((item) => item.classKey));
    const pairedSourceKeys = new Set<string>();
    for (let index = 0; index < pairs.length; index += 1) {
        const { left, right } = pairs[index];
        if (left.sourceClassKey !== right.sourceClassKey || left.targetClassKey === right.targetClassKey) {
            context.addIssue({
                code: 'custom',
                path: [assessment.schemaVersion === 1 ? 'leftAliasingWitness' : 'aliasingWitnessPairs', index],
                message: 'Aliasing witnesses must share one source class and split into different target classes.'
            });
        }
        if (!assessment.aliasingKeys.includes(left.sourceClassKey)) {
            context.addIssue({ code: 'custom', path: ['aliasingKeys'], message: 'Aliasing keys must include every witnessed source class.' });
        }
        if (!sourceKeys.has(left.sourceClassKey) || !sourceKeys.has(right.sourceClassKey) ||
            !targetKeys.has(left.targetClassKey) || !targetKeys.has(right.targetClassKey)) {
            context.addIssue({ code: 'custom', message: 'Aliasing witnesses must reference declared source and target classes.' });
        }
        if (pairedSourceKeys.has(left.sourceClassKey)) {
            context.addIssue({ code: 'custom', message: 'Each aliased source class may have only one explicit witness pair.' });
        }
        pairedSourceKeys.add(left.sourceClassKey);
    }

    if (assessment.schemaVersion === 1) {
        if ((assessment.leftAliasingWitness === null) !== (assessment.rightAliasingWitness === null)) {
            context.addIssue({ code: 'custom', message: 'V1 alias witnesses must be both present or both null.' });
        }
        return;
    }

    const transitionSources = new Set<string>();
    for (let index = 0; index < assessment.observedTransitions.length; index += 1) {
        const transition = assessment.observedTransitions[index];
        if (!sourceKeys.has(transition.sourceClassKey) ||
            transition.targetClassKeys.some((key) => !targetKeys.has(key))) {
            context.addIssue({
                code: 'custom',
                path: ['observedTransitions', index],
                message: 'Observed transitions must reference declared source and target classes.'
            });
        }
        if (transitionSources.has(transition.sourceClassKey)) {
            context.addIssue({
                code: 'custom',
                path: ['observedTransitions', index, 'sourceClassKey'],
                message: 'Observed transitions must contain one row per source class.'
            });
        }
        transitionSources.add(transition.sourceClassKey);
        const isAliased = transition.targetClassKeys.length > 1;
        if (isAliased !== assessment.aliasingKeys.includes(transition.sourceClassKey)) {
            context.addIssue({
                code: 'custom',
                path: ['observedTransitions', index, 'targetClassKeys'],
                message: 'Aliasing keys must exactly identify source classes with multiple observed target classes.'
            });
        }
    }
    if (transitionSources.size !== sourceKeys.size ||
        [...sourceKeys].some((key) => !transitionSources.has(key))) {
        context.addIssue({ code: 'custom', path: ['observedTransitions'], message: 'Every source class requires an observed transition row.' });
    }
    if (pairedSourceKeys.size !== assessment.aliasingKeys.length ||
        assessment.aliasingKeys.some((key) => !pairedSourceKeys.has(key))) {
        context.addIssue({ code: 'custom', path: ['aliasingWitnessPairs'], message: 'Every aliased source class requires one explicit witness pair.' });
    }
});

export const DiagnosticAxisSchema = z.strictObject({
    assessment: TrimmedStringSchema,
    evidenceRefs: IdentifierListSchema,
    visibleResidue: DescriptionListSchema,
    blockedClaims: DescriptionListSchema
});

export const ScalarProbeSchema = z.strictObject({
    probeId: IdentifierSchema,
    value: DeterministicNumberSchema,
    unit: IdentifierSchema,
    scope: TrimmedStringSchema
});

export const DiagnosticProfileSchema = z.strictObject({
    schemaVersion: SchemaVersionSchema,
    diagnosticId: IdentifierSchema,
    diagnosticVersion: VersionSchema,
    evaluationObjectRef: IdentifierSchema,
    cutId: IdentifierSchema,
    protectedFamily: NonEmptyDescriptionListSchema,
    scope: TrimmedStringSchema,
    pathPressure: DiagnosticAxisSchema,
    residueVisibility: DiagnosticAxisSchema,
    localReorganization: DiagnosticAxisSchema,
    cutFidelity: DiagnosticAxisSchema,
    returnStrength: DiagnosticAxisSchema,
    closureRisk: DiagnosticAxisSchema,
    scalarProbes: z.array(ScalarProbeSchema).max(256),
    blockedClaims: NonEmptyDescriptionListSchema,
    excludedClaims: DescriptionListSchema
});

export const DesignStepSchema = z.strictObject({
    sequence: NonNegativeSafeIntegerSchema,
    kind: z.enum(['policy', 'command', 'declaration']),
    catalogId: IdentifierSchema,
    payload: DeterministicJsonValueSchema
});

export const WorldDesignRequestPayloadSchema = z.strictObject({
    schemaVersion: SchemaVersionSchema,
    requestId: IdentifierSchema,
    requestVersion: VersionSchema,
    profileVersion: VersionSchema,
    registeredAdapter: AdapterReferenceSchema,
    baselineOrConfigReference: WorldCarrierReferenceSchema,
    scenarioDomain: ScenarioDomainSchema,
    cut: WorldCutDefinitionSchema,
    protectedFamily: NonEmptyDescriptionListSchema,
    policyOrCommandSequence: z.array(DesignStepSchema).min(1).max(4_096).superRefine((steps, context) => {
        for (let index = 0; index < steps.length; index += 1) {
            if (steps[index].sequence !== index) {
                context.addIssue({ code: 'custom', path: [index, 'sequence'], message: 'Design step sequence must be contiguous from zero.' });
            }
        }
    }),
    seeds: z.array(NonNegativeSafeIntegerSchema).min(1).max(1_024),
    outputDetailLevel: z.enum(['summary', 'witnesses', 'full']),
    excludedClaims: NonEmptyDescriptionListSchema
}).superRefine((request, context) => {
    if (request.registeredAdapter.id !== request.baselineOrConfigReference.adapter.id ||
        request.registeredAdapter.version !== request.baselineOrConfigReference.adapter.version) {
        context.addIssue({ code: 'custom', path: ['registeredAdapter'], message: 'Registered adapter must match the baseline/config carrier.' });
    }
    if (request.cut.sourceCarrierKind !== request.baselineOrConfigReference.carrierKind) {
        context.addIssue({ code: 'custom', path: ['cut', 'sourceCarrierKind'], message: 'Cut source carrier kind must match the baseline/config carrier.' });
    }
    if (request.protectedFamily.some((item) => !request.cut.protectedFamily.includes(item))) {
        context.addIssue({ code: 'custom', path: ['protectedFamily'], message: 'Request protected family must remain inside the cut protected family.' });
    }
    const requestSeeds = [...request.seeds].sort((left, right) => left - right);
    const domainSeeds = [...request.scenarioDomain.seeds].sort((left, right) => left - right);
    if (canonicalJson(requestSeeds) !== canonicalJson(domainSeeds)) {
        context.addIssue({ code: 'custom', path: ['seeds'], message: 'Request seeds must exactly match the scenario-domain seed set.' });
    }
    const cutDomain = request.cut.admissibleDomain;
    for (const [field, values, allowed] of [
        ['scenarioIds', request.scenarioDomain.scenarioIds, cutDomain.scenarioIds],
        ['actionFamilies', request.scenarioDomain.actionFamilies, cutDomain.actionFamilies],
        ['policyFamilies', request.scenarioDomain.policyFamilies, cutDomain.policyFamilies]
    ] as const) {
        if (values.some((value) => !allowed.includes(value))) {
            context.addIssue({ code: 'custom', path: ['scenarioDomain', field], message: `Request ${field} must remain inside the cut domain.` });
        }
    }
    if (request.seeds.some((seed) => !cutDomain.seeds.includes(seed))) {
        context.addIssue({ code: 'custom', path: ['seeds'], message: 'Request seeds must remain inside the cut domain.' });
    }
});

export const WorldDesignRequestSchema = z.strictObject({
    ...WorldDesignRequestPayloadSchema.shape,
    requestDigest: DigestSchema
}).superRefine((request, context) => {
    const { requestDigest, ...payload } = request;
    const payloadResult = WorldDesignRequestPayloadSchema.safeParse(payload);
    if (!payloadResult.success) {
        for (const issue of payloadResult.error.issues) {
            context.addIssue({
                code: 'custom',
                path: issue.path,
                message: issue.message
            });
        }
        return;
    }
    if (sha256Digest(payload) !== requestDigest) {
        context.addIssue({ code: 'custom', path: ['requestDigest'], message: 'Request digest does not match canonical request content.' });
    }
});

export const WorldDesignResultPayloadSchema = z.strictObject({
    schemaVersion: SchemaVersionSchema,
    resultId: IdentifierSchema,
    resultVersion: VersionSchema,
    requestDigest: DigestSchema,
    sourceLocks: z.array(SourceLockSchema).min(1).max(16),
    traces: z.array(VoyageTraceSchema).max(1_024),
    transitionWitnesses: z.array(TransitionWitnessSchema).max(4_096),
    projectionAssessments: z.array(ProjectionTransportAssessmentSchema).max(1_024),
    returnObligations: z.array(ReturnObligationSchema).max(1_024),
    diagnostics: z.array(DiagnosticProfileSchema).max(1_024),
    residualLedger: ResidualLedgerSchema,
    blockedClaims: NonEmptyDescriptionListSchema,
    maturity: CarrierMaturitySchema,
    productAuthority: ProductAuthoritySchema,
    evidenceOrigin: EvidenceOriginSchema,
    covarianceGroup: IdentifierSchema,
    deduplicationIdentity: DigestSchema
});

export const WorldDesignResultSchema = z.strictObject({
    ...WorldDesignResultPayloadSchema.shape,
    resultDigest: DigestSchema
}).superRefine((result, context) => {
    const { resultDigest, ...payload } = result;
    if (sha256Digest(payload) !== resultDigest) {
        context.addIssue({ code: 'custom', path: ['resultDigest'], message: 'Result digest does not match canonical result content.' });
    }
});

export function buildWorldDesignRequest(input: unknown) {
    const payload = WorldDesignRequestPayloadSchema.parse(input);
    return WorldDesignRequestSchema.parse({ ...payload, requestDigest: sha256Digest(payload) });
}

export function buildWorldDesignResult(input: unknown) {
    const payload = WorldDesignResultPayloadSchema.parse(input);
    return WorldDesignResultSchema.parse({ ...payload, resultDigest: sha256Digest(payload) });
}

export function parseRegisteredWorldDesignRequest(input: unknown, portContractInput: unknown) {
    const request = WorldDesignRequestSchema.parse(input);
    const portContract = PortContractSchema.parse(portContractInput);
    const adapterRegistered = portContract.catalogs.adapters.some((adapter) =>
        adapter.id === request.registeredAdapter.id && adapter.version === request.registeredAdapter.version
    );
    if (!adapterRegistered) {
        throw new Error(`Adapter ${request.registeredAdapter.id}@${request.registeredAdapter.version} is not registered.`);
    }
    if (!portContract.catalogs.rulesetsOrConfigs.includes(request.baselineOrConfigReference.rulesetOrConfigId)) {
        throw new Error(`Ruleset/config ${request.baselineOrConfigReference.rulesetOrConfigId} is not registered.`);
    }
    if (!portContract.catalogs.cuts.some((cut) =>
        cut.id === request.cut.cutId && cut.version === request.cut.cutVersion
    )) {
        throw new Error(`Cut ${request.cut.cutId}@${request.cut.cutVersion} is not registered.`);
    }
    return request;
}
