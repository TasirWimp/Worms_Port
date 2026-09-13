import { z } from 'zod';

import { canonicalJson, compareCanonicalText, sha256Digest } from '../../canonical';
import { mergeResidualLedgers } from '../../kernel/residual-ledger';
import {
    DeterministicJsonValueSchema,
    DiagnosticProfileV2Schema,
    ResidualLedgerSchema,
    ScalarProbeSchema,
    SourceLockSchema,
    TransitionWitnessSchema,
    VoyageTraceV4Schema,
    WorldCutDefinitionSchema,
    WorldObligationSchema
} from '../../schemas';
import {
    D2E_ACTION_FAMILY,
    D2E_ALLOWED_PORTS,
    D2E_ANALYTICAL_ADAPTER,
    D2E_CONFIG_ID,
    D2E_CONFIG_SCHEMA_VERSION,
    D2E_CRPM_METHOD_COMMIT,
    D2E_CUT,
    D2E_EXCLUDED_INITIAL_CARRIER_DISTANCE,
    D2E_EXPLICIT_EXCLUSIONS,
    D2E_FORBIDDEN_PORTS,
    D2E_MANDATORY_EVIDENCE_PROBES,
    D2E_MAXIMUM_TURNS,
    D2E_POLICIES,
    D2E_POLICY_FAMILY,
    D2E_PRODUCTION_SPAWN_REFERENCE,
    D2E_PROFILE_VERSION,
    D2E_PROTECTED_FAMILY,
    D2E_REPORT_BINDINGS,
    D2E_REQUEST_SCHEMA_VERSION,
    D2E_RESULT_SCHEMA_VERSION,
    D2E_SCENARIO_IDS,
    D2E_SEED,
    D2E_SOURCE_COMMIT,
    D2E_STARTING_DISTANCES,
    D2E_WORLD_ADAPTER
} from './registry';

const IdentifierSchema = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const SourcePathSchema = z.string().min(1).max(512).refine((value) =>
    value.trim() === value && !value.includes('\\') && !value.startsWith('/') && !value.split('/').includes('..')
);
const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const GitOidSchema = z.string().regex(/^[0-9a-f]{40}$/);
const SafeIntegerSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
    .refine((value) => !Object.is(value, -0));
const TrimmedStringSchema = z.string().min(1).max(4_096).refine((value) => value.trim() === value);

function uniqueStrings(minimum = 0, maximum = 256) {
    return z.array(IdentifierSchema).min(minimum).max(maximum).superRefine((values, context) => {
        const seen = new Set<string>();
        values.forEach((value, index) => {
            if (seen.has(value)) context.addIssue({ code: 'custom', path: [index], message: `Duplicate value ${value}.` });
            seen.add(value);
        });
    });
}

function sameCanonicalSet(left: readonly string[], right: readonly string[]): boolean {
    return canonicalJson([...left].sort(compareCanonicalText)) === canonicalJson([...right].sort(compareCanonicalText));
}

const AdapterSchema = z.strictObject({ id: IdentifierSchema, version: z.number().int().min(1) });
const FileBlobSchema = z.strictObject({ path: SourcePathSchema, blobOid: GitOidSchema });

export const D2ESourceBindingSchema = z.strictObject({
    repositoryId: z.literal('worms-port'),
    commit: z.literal(D2E_SOURCE_COMMIT),
    paths: z.array(SourcePathSchema).min(1).max(32),
    fileBlobs: z.array(FileBlobSchema).min(1).max(32),
    bundleDigest: DigestSchema
}).superRefine((binding, context) => {
    if (canonicalJson(binding.paths) !== canonicalJson(binding.fileBlobs.map((file) => file.path))) {
        context.addIssue({ code: 'custom', path: ['fileBlobs'], message: 'Source paths and file blobs must match in order.' });
    }
    const expected = sha256Digest({
        repositoryId: binding.repositoryId,
        commit: binding.commit,
        fileBlobs: binding.fileBlobs
    });
    if (expected !== binding.bundleDigest) {
        context.addIssue({ code: 'custom', path: ['bundleDigest'], message: 'Source bundle digest mismatch.' });
    }
});

const CompactActorSchema = z.strictObject({
    x: SafeIntegerSchema,
    stitching: SafeIntegerSchema,
    escapeSlack: SafeIntegerSchema,
    seamPinTurns: SafeIntegerSchema,
    seamPinCooldown: SafeIntegerSchema,
    spoolburstPreparationTurns: SafeIntegerSchema,
    spoolburstCocoonHits: SafeIntegerSchema,
    snapshotDigest: DigestSchema
});

export const D2ECompactCarrierSchema = z.strictObject({
    completedTurns: SafeIntegerSchema,
    activeActor: z.enum(['player', 'loomkeeper']),
    distance: SafeIntegerSchema,
    player: CompactActorSchema,
    loomkeeper: CompactActorSchema,
    winner: z.enum(['player', 'loomkeeper']).nullable(),
    finishReason: z.enum(['unravelled', 'turn_limit']).nullable(),
    recurrenceKeyDigest: DigestSchema,
    fullSnapshotDigest: DigestSchema
});

const TacticalActionSchema = z.strictObject({
    actor: z.enum(['player', 'loomkeeper']),
    policy: IdentifierSchema,
    kind: IdentifierSchema,
    direction: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
    relicId: z.enum(['threadball', 'needlepoint', 'spoolburst']).nullable(),
    actionKey: IdentifierSchema
});

const MatchIdentitySchema = z.strictObject({
    startingDistance: SafeIntegerSchema,
    firstActor: z.enum(['player', 'loomkeeper']),
    mirrored: z.boolean(),
    playerPolicy: z.enum(D2E_POLICIES),
    loomkeeperPolicy: z.enum(D2E_POLICIES)
});

const EntryResidualSchema = z.strictObject({
    movementByActor: z.strictObject({ player: z.number().int(), loomkeeper: z.number().int() }),
    damageToTarget: z.literal(30),
    targetSeamPinTurns: z.literal(0),
    casterSeamPinCooldown: z.literal(0),
    entrySeamPinSuppression: z.strictObject({
        target: z.enum(['player', 'loomkeeper']),
        relicId: z.literal('needlepoint')
    })
});

const EvidenceEdgeSchema = z.strictObject({
    sourceCarrier: D2ECompactCarrierSchema,
    action: TacticalActionSchema,
    targetCarrier: D2ECompactCarrierSchema,
    analyticalTraceStep: DeterministicJsonValueSchema
});

export const D2EEntryWitnessSchema = z.strictObject({
    witnessId: z.string().regex(/^d2e-i2-entry-response-(641|703|704)$/),
    witnessVersion: z.literal(1),
    motifs: z.tuple([
        z.literal('outside_range_to_enter_range'),
        z.literal('enter_range_to_opponent_response')
    ]),
    matchIdentity: MatchIdentitySchema,
    entry: z.strictObject({
        sourceCarrier: D2ECompactCarrierSchema,
        action: TacticalActionSchema,
        targetPolicy: z.enum(D2E_POLICIES),
        targetCarrier: D2ECompactCarrierSchema,
        analyticalTraceStep: DeterministicJsonValueSchema,
        residual: EntryResidualSchema
    }),
    opponentResponse: EvidenceEdgeSchema,
    matchedF4: z.strictObject({
        sourceCarrierDigest: DigestSchema,
        action: TacticalActionSchema,
        targetCarrier: D2ECompactCarrierSchema,
        analyticalTraceStep: DeterministicJsonValueSchema,
        residual: z.strictObject({
            damageToTarget: z.literal(30),
            targetSeamPinTurns: z.literal(1),
            casterSeamPinCooldown: z.literal(1)
        })
    }),
    terminalOutcome: z.strictObject({
        winner: z.enum(['player', 'loomkeeper']),
        finishReason: z.literal('unravelled'),
        turns: SafeIntegerSchema
    }),
    sourceReference: z.strictObject({
        reportDigest: z.literal(D2E_REPORT_BINDINGS.i2),
        traceIndex: z.literal(0)
    }),
    excludedClaims: z.array(TrimmedStringSchema).min(1),
    witnessDigest: DigestSchema
}).superRefine((witness, context) => {
    const { witnessDigest, ...payload } = witness;
    if (sha256Digest(payload) !== witnessDigest) {
        context.addIssue({ code: 'custom', path: ['witnessDigest'], message: 'Entry witness digest mismatch.' });
    }
    if (witness.entry.targetCarrier.fullSnapshotDigest !== witness.opponentResponse.sourceCarrier.fullSnapshotDigest) {
        context.addIssue({ code: 'custom', path: ['opponentResponse', 'sourceCarrier'], message: 'Entry target must be the response source carrier.' });
    }
    if (witness.entry.sourceCarrier.distance <= 640 || witness.entry.targetCarrier.distance > 640) {
        context.addIssue({ code: 'custom', path: ['entry'], message: 'Entry witness must cross into Needlepoint range.' });
    }
});

export const D2EInBandControlSchema = z.strictObject({
    witnessId: z.literal('d2e-i2-later-in-band-resolution-576'),
    witnessVersion: z.literal(1),
    motifs: z.tuple([z.literal('later_in_band_cast_to_resolution')]),
    sourceCarrier: D2ECompactCarrierSchema,
    action: TacticalActionSchema,
    targetCarrier: D2ECompactCarrierSchema,
    residual: z.strictObject({
        damageToTarget: z.literal(30),
        targetSeamPinTurns: z.literal(1),
        casterSeamPinCooldown: z.literal(1),
        entrySeamPinSuppression: z.null()
    }),
    sourceReference: z.strictObject({
        configId: z.literal(D2E_CONFIG_ID),
        declaration: TrimmedStringSchema
    }),
    excludedClaims: z.array(TrimmedStringSchema).min(1),
    witnessDigest: DigestSchema
}).superRefine((witness, context) => {
    const { witnessDigest, ...payload } = witness;
    if (sha256Digest(payload) !== witnessDigest) {
        context.addIssue({ code: 'custom', path: ['witnessDigest'], message: 'In-band witness digest mismatch.' });
    }
    if (witness.sourceCarrier.distance > 640) {
        context.addIssue({ code: 'custom', path: ['sourceCarrier', 'distance'], message: 'In-band control must begin within Needlepoint range.' });
    }
});

const TerminalAtDistanceSchema = z.strictObject({
    startingDistance: z.union([z.literal(768), z.literal(769)]),
    terminalReasons: z.strictObject({
        unravelled: SafeIntegerSchema,
        turn_limit: SafeIntegerSchema.optional()
    })
});

export const D2EHorizonWarningSchema = z.strictObject({
    witnessId: z.literal('d2e-i2-excluded-start-769-horizon-warning'),
    witnessVersion: z.literal(1),
    admissibleInitialCarrier: z.literal(false),
    productionSpawnReference: z.literal(D2E_PRODUCTION_SPAWN_REFERENCE),
    excludedStartingDistance: z.literal(D2E_EXCLUDED_INITIAL_CARRIER_DISTANCE),
    terminalResults: z.strictObject({
        f4: z.tuple([TerminalAtDistanceSchema, TerminalAtDistanceSchema]),
        i2: z.tuple([TerminalAtDistanceSchema, TerminalAtDistanceSchema])
    }),
    additionalI2TimeoutPaths: z.array(z.strictObject({
        matchIdentity: MatchIdentitySchema,
        i2FinishReason: z.literal('turn_limit'),
        f4FinishReason: z.literal('unravelled'),
        entrySuppressionTurns: z.tuple([z.literal(10)])
    })).length(4),
    blockedClaims: z.array(TrimmedStringSchema).min(1),
    witnessDigest: DigestSchema
}).superRefine((witness, context) => {
    const { witnessDigest, ...payload } = witness;
    if (sha256Digest(payload) !== witnessDigest) {
        context.addIssue({ code: 'custom', path: ['witnessDigest'], message: 'Horizon-warning digest mismatch.' });
    }
    const exactTerminal = {
        f4: [
            { startingDistance: 768, terminalReasons: { unravelled: 100 } },
            { startingDistance: 769, terminalReasons: { unravelled: 96, turn_limit: 4 } }
        ],
        i2: [
            { startingDistance: 768, terminalReasons: { unravelled: 100 } },
            { startingDistance: 769, terminalReasons: { unravelled: 92, turn_limit: 8 } }
        ]
    };
    if (canonicalJson(witness.terminalResults) !== canonicalJson(exactTerminal)) {
        context.addIssue({ code: 'custom', path: ['terminalResults'], message: 'Registered 768/769 terminal warning drifted.' });
    }
});

const ReportBindingSchema = z.strictObject({
    caseId: z.enum(['c4', 'f4', 'h2', 'i1', 'i2']),
    configId: IdentifierSchema,
    configPath: SourcePathSchema,
    configSchemaVersion: SafeIntegerSchema,
    configDigest: DigestSchema,
    reportDigest: DigestSchema,
    historicalDisposition: IdentifierSchema,
    matchCount: z.literal(1200),
    firstActorWins: SafeIntegerSchema,
    firstActorWinRate: z.number().min(0).max(1),
    firstActorWinRateByDistance: z.array(z.strictObject({
        startingDistance: SafeIntegerSchema,
        rate: z.number().min(0).max(1)
    })).length(D2E_STARTING_DISTANCES.length),
    terminalReasons: z.strictObject({
        unravelled: SafeIntegerSchema,
        turn_limit: SafeIntegerSchema.optional()
    }),
    forcedOpeningScenarioCount: SafeIntegerSchema,
    nonterminalRecurrenceMatchCount: SafeIntegerSchema,
    relicUses: z.strictObject({
        threadball: SafeIntegerSchema,
        needlepoint: SafeIntegerSchema,
        spoolburst: SafeIntegerSchema
    }),
    escapeSlackSpent: SafeIntegerSchema,
    entrySeamPinSuppressions: z.strictObject({
        total: z.literal(416),
        byRelic: z.strictObject({
            threadball: z.literal(0),
            needlepoint: z.literal(416),
            spoolburst: z.literal(0)
        }),
        openingRouteResults: z.strictObject({
            total: z.literal(120),
            firstActorWins: z.literal(84),
            secondActorWins: z.literal(36),
            turnLimitResults: z.literal(0)
        })
    }).optional()
});

export const D2EI2AnalyticalExportSchema = z.strictObject({
    schemaVersion: z.literal(1),
    exportId: z.literal('wp-015d2e-i2-spawn-pressure'),
    adapter: z.strictObject({
        id: z.literal(D2E_ANALYTICAL_ADAPTER.id),
        version: z.literal(D2E_ANALYTICAL_ADAPTER.version)
    }),
    profileVersion: z.literal(D2E_PROFILE_VERSION),
    sourceBinding: D2ESourceBindingSchema,
    methodBinding: z.strictObject({
        repositoryId: z.literal('crpm'),
        commit: z.literal(D2E_CRPM_METHOD_COMMIT),
        paths: z.array(SourcePathSchema).length(2),
        relationship: z.literal('read-only methodological source; no runtime dependency')
    }),
    domain: z.strictObject({
        productionSpawnReference: z.literal(D2E_PRODUCTION_SPAWN_REFERENCE),
        startingDistances: z.tuple(D2E_STARTING_DISTANCES.map((distance) => z.literal(distance)) as [z.ZodLiteral<number>, ...z.ZodLiteral<number>[]]),
        firstActors: z.tuple([z.literal('player'), z.literal('loomkeeper')]),
        mirrored: z.tuple([z.literal(false), z.literal(true)]),
        policies: z.tuple(D2E_POLICIES.map((policy) => z.literal(policy)) as [z.ZodLiteral<string>, ...z.ZodLiteral<string>[]]),
        orderedPolicyPairCount: z.literal(25),
        seed: z.literal(D2E_SEED),
        maximumTurns: z.literal(D2E_MAXIMUM_TURNS),
        matchCountPerDistance: z.literal(100),
        totalMatchCount: z.literal(1200),
        excludedInitialCarrierDistances: z.tuple([z.literal(D2E_EXCLUDED_INITIAL_CARRIER_DISTANCE)])
    }),
    reportBindings: z.array(ReportBindingSchema).length(5),
    transitionWitnesses: z.tuple([
        D2EEntryWitnessSchema,
        D2EEntryWitnessSchema,
        D2EEntryWitnessSchema,
        D2EInBandControlSchema
    ]),
    horizonWarning: D2EHorizonWarningSchema,
    diagnosticEvidence: z.strictObject({
        pathPressure: TrimmedStringSchema,
        residueVisibility: TrimmedStringSchema,
        localReorganization: TrimmedStringSchema,
        cutFidelity: TrimmedStringSchema,
        returnStrength: TrimmedStringSchema,
        closureRisk: TrimmedStringSchema
    }),
    blockedClaims: z.array(TrimmedStringSchema).min(1),
    analyticalDisposition: z.literal('structural_reference'),
    maturity: z.literal('M2_local_use'),
    productAuthority: z.literal('none'),
    excludedClaims: z.array(TrimmedStringSchema).min(1),
    exportDigest: DigestSchema
}).superRefine((result, context) => {
    const { exportDigest, ...payload } = result;
    if (sha256Digest(payload) !== exportDigest) {
        context.addIssue({ code: 'custom', path: ['exportDigest'], message: 'Analytical export digest mismatch.' });
    }
    const cases = result.reportBindings.map((binding) => binding.caseId);
    if (canonicalJson(cases) !== canonicalJson(['c4', 'f4', 'h2', 'i1', 'i2'])) {
        context.addIssue({ code: 'custom', path: ['reportBindings'], message: 'Comparator order or membership drifted.' });
    }
    for (const binding of result.reportBindings) {
        if (binding.reportDigest !== D2E_REPORT_BINDINGS[binding.caseId]) {
            context.addIssue({ code: 'custom', path: ['reportBindings'], message: `${binding.caseId} report digest drifted.` });
        }
        if ((binding.caseId === 'i2') !== (binding.entrySeamPinSuppressions !== undefined)) {
            context.addIssue({ code: 'custom', path: ['reportBindings'], message: 'Only I2 may carry the entry-suppression aggregate.' });
        }
    }
});

export const D2EI2RequestPayloadSchema = z.strictObject({
    schemaVersion: z.literal(D2E_REQUEST_SCHEMA_VERSION),
    requestId: IdentifierSchema,
    profileVersion: z.literal(D2E_PROFILE_VERSION),
    adapter: z.strictObject({
        id: z.literal(D2E_WORLD_ADAPTER.id),
        version: z.literal(D2E_WORLD_ADAPTER.version)
    }),
    baseline: z.strictObject({
        kind: z.literal('d2a_config'),
        id: z.literal(D2E_CONFIG_ID),
        version: z.literal(D2E_CONFIG_SCHEMA_VERSION)
    }),
    scenarioDomain: z.strictObject({
        schemaVersion: z.literal(1),
        scenarioIds: z.array(IdentifierSchema).min(1),
        actionFamilies: z.array(IdentifierSchema).min(1),
        policyFamilies: z.array(IdentifierSchema).min(1),
        seeds: z.array(SafeIntegerSchema).min(1),
        constraints: z.array(TrimmedStringSchema)
    }),
    cut: z.strictObject({ id: z.literal(D2E_CUT.id), version: z.literal(D2E_CUT.version) }),
    protectedFamily: z.array(TrimmedStringSchema).min(1),
    sequence: z.tuple([z.strictObject({
        sequence: z.literal(0),
        kind: z.literal('policy'),
        configId: z.literal(D2E_CONFIG_ID),
        policyFamily: z.literal(D2E_POLICY_FAMILY)
    })]),
    seeds: z.tuple([z.literal(D2E_SEED)]),
    outputDetailLevel: z.literal('witnesses'),
    mandatoryEvidenceProbes: uniqueStrings(1),
    requestedPorts: uniqueStrings(1),
    activation: z.literal('offline_only'),
    explicitExclusions: z.array(TrimmedStringSchema).min(1)
}).superRefine((request, context) => {
    if (!sameCanonicalSet(request.scenarioDomain.scenarioIds, D2E_SCENARIO_IDS)) {
        context.addIssue({ code: 'custom', path: ['scenarioDomain', 'scenarioIds'], message: 'Request must declare the complete registered twelve-start domain.' });
    }
    if (!sameCanonicalSet(request.scenarioDomain.actionFamilies, [D2E_ACTION_FAMILY]) ||
        !sameCanonicalSet(request.scenarioDomain.policyFamilies, [D2E_POLICY_FAMILY]) ||
        canonicalJson(request.scenarioDomain.seeds) !== canonicalJson([D2E_SEED])) {
        context.addIssue({ code: 'custom', path: ['scenarioDomain'], message: 'Request action, policy, or seed domain drifted.' });
    }
    if (!sameCanonicalSet(request.protectedFamily, D2E_PROTECTED_FAMILY)) {
        context.addIssue({ code: 'custom', path: ['protectedFamily'], message: 'Protected family must exactly match the admission registry.' });
    }
    if (!sameCanonicalSet(request.mandatoryEvidenceProbes, D2E_MANDATORY_EVIDENCE_PROBES)) {
        context.addIssue({ code: 'custom', path: ['mandatoryEvidenceProbes'], message: 'Mandatory evidence probes must exactly match the admission registry.' });
    }
    if (!sameCanonicalSet(request.requestedPorts, D2E_ALLOWED_PORTS)) {
        const forbidden = request.requestedPorts.filter((port) => (D2E_FORBIDDEN_PORTS as readonly string[]).includes(port));
        context.addIssue({
            code: 'custom',
            path: ['requestedPorts'],
            message: forbidden.length > 0
                ? `Forbidden port requested: ${forbidden.join(', ')}.`
                : 'Requested ports must exactly match the bounded admission registry.'
        });
    }
    if (!sameCanonicalSet(request.explicitExclusions, D2E_EXPLICIT_EXCLUSIONS)) {
        context.addIssue({ code: 'custom', path: ['explicitExclusions'], message: 'Explicit exclusions must remain complete.' });
    }
});

export const D2EI2RequestSchema = z.strictObject({
    ...D2EI2RequestPayloadSchema.shape,
    requestDigest: DigestSchema
}).superRefine((request, context) => {
    const { requestDigest, ...payload } = request;
    if (!D2EI2RequestPayloadSchema.safeParse(payload).success) {
        context.addIssue({ code: 'custom', message: 'Request payload is invalid.' });
        return;
    }
    if (sha256Digest(payload) !== requestDigest) {
        context.addIssue({ code: 'custom', path: ['requestDigest'], message: 'Request digest mismatch.' });
    }
});

const D2EImplementationReceiptBaseObjectSchema = z.strictObject({
    schemaVersion: z.literal(1),
    repositoryId: z.literal('worms-port'),
    implementationCommit: GitOidSchema,
    implementationTree: GitOidSchema,
    implementationPaths: z.array(SourcePathSchema).min(1).max(64),
    implementationFileBlobs: z.array(FileBlobSchema).min(1).max(64),
    implementationBundleDigest: DigestSchema,
    adapterVersions: z.tuple([
        z.strictObject({ id: z.literal(D2E_WORLD_ADAPTER.id), version: z.literal(1) }),
        z.strictObject({ id: z.literal(D2E_ANALYTICAL_ADAPTER.id), version: z.literal(1) })
    ]),
    profileVersion: z.literal(D2E_PROFILE_VERSION),
    requestSchemaVersion: z.literal(D2E_REQUEST_SCHEMA_VERSION),
    resultSchemaVersion: z.literal(D2E_RESULT_SCHEMA_VERSION),
    sourceCommit: z.literal(D2E_SOURCE_COMMIT),
    requestDigest: DigestSchema,
    analyticalExportDigest: DigestSchema
});

function validateImplementationReceipt(
    receipt: z.infer<typeof D2EImplementationReceiptBaseObjectSchema>,
    context: z.RefinementCtx
) {
    if (canonicalJson(receipt.implementationPaths) !== canonicalJson(receipt.implementationFileBlobs.map((file) => file.path))) {
        context.addIssue({ code: 'custom', path: ['implementationFileBlobs'], message: 'Implementation paths and blobs must match in order.' });
    }
    const expected = sha256Digest({
        repositoryId: receipt.repositoryId,
        implementationCommit: receipt.implementationCommit,
        implementationTree: receipt.implementationTree,
        implementationFileBlobs: receipt.implementationFileBlobs
    });
    if (expected !== receipt.implementationBundleDigest) {
        context.addIssue({ code: 'custom', path: ['implementationBundleDigest'], message: 'Implementation bundle digest mismatch.' });
    }
}

export const D2EImplementationReceiptBaseSchema = D2EImplementationReceiptBaseObjectSchema
    .superRefine(validateImplementationReceipt);

export const D2EImplementationReceiptSchema = z.strictObject({
    ...D2EImplementationReceiptBaseObjectSchema.shape,
    resultDigest: DigestSchema
}).superRefine(validateImplementationReceipt);

const D2EResultPayloadShape = {
    schemaVersion: z.literal(D2E_RESULT_SCHEMA_VERSION),
    resultId: IdentifierSchema,
    profileVersion: z.literal(D2E_PROFILE_VERSION),
    requestDigest: DigestSchema,
    sourceLocks: z.tuple([SourceLockSchema, SourceLockSchema]),
    cut: WorldCutDefinitionSchema,
    analyticalEvidence: D2EI2AnalyticalExportSchema,
    traces: z.array(VoyageTraceV4Schema).length(4),
    transitionWitnesses: z.array(TransitionWitnessSchema).min(7).max(8),
    worldObligations: z.array(WorldObligationSchema).length(1),
    diagnosticProfile: DiagnosticProfileV2Schema,
    scalarProbes: z.array(ScalarProbeSchema).min(1).max(64),
    residualLedger: ResidualLedgerSchema,
    blockedClaims: z.array(TrimmedStringSchema).min(1),
    analyticalDisposition: z.literal('structural_reference'),
    maturity: z.literal('M2_local_use'),
    productAuthority: z.literal('none'),
    executionReceipt: D2EImplementationReceiptBaseSchema
};

export const D2EI2ResultPayloadSchema = z.strictObject(D2EResultPayloadShape);

export const D2EI2ResultSchema = z.strictObject({
    ...D2EResultPayloadShape,
    executionReceipt: D2EImplementationReceiptSchema,
    resultDigest: DigestSchema
}).superRefine((result, context) => {
    const { resultDigest, executionReceipt, ...rest } = result;
    const { resultDigest: receiptResultDigest, ...receiptBase } = executionReceipt;
    if (sha256Digest({ ...rest, executionReceipt: receiptBase }) !== resultDigest) {
        context.addIssue({ code: 'custom', path: ['resultDigest'], message: 'D2E result digest mismatch.' });
    }
    if (receiptResultDigest !== resultDigest) {
        context.addIssue({ code: 'custom', path: ['executionReceipt', 'resultDigest'], message: 'Execution receipt must bind the result digest.' });
    }
    if (executionReceipt.requestDigest !== result.requestDigest ||
        executionReceipt.analyticalExportDigest !== result.analyticalEvidence.exportDigest) {
        context.addIssue({ code: 'custom', path: ['executionReceipt'], message: 'Execution receipt does not bind the request and analytical export.' });
    }
    const derivedResidual = mergeResidualLedgers(result.traces.map((trace) => trace.accumulatedResidual));
    if (derivedResidual.propagationIssues.length > 0 ||
        canonicalJson(derivedResidual.ledger) !== canonicalJson(result.residualLedger)) {
        context.addIssue({ code: 'custom', path: ['residualLedger'], message: 'Result residual must equal the canonical aggregation of all admitted voyages.' });
    }
    const edges = result.traces.flatMap((trace) => trace.transitionEdges);
    const edgeIds = new Set(edges.map((edge) => edge.edgeId));
    const witnessIdentities = new Set(result.transitionWitnesses.map((witness) =>
        canonicalJson({ witnessId: witness.witnessId, digest: sha256Digest(witness) })
    ));
    for (const edge of edges) {
        for (const reference of edge.witnessReferences) {
            if (!witnessIdentities.has(canonicalJson(reference))) {
                context.addIssue({ code: 'custom', path: ['transitionWitnesses'], message: `Edge ${edge.edgeId} references a missing exact transition witness.` });
            }
        }
        if (canonicalJson(edge.sourceCarrier.adapter) !== canonicalJson(D2E_ANALYTICAL_ADAPTER) ||
            canonicalJson(edge.targetCarrier.adapter) !== canonicalJson(D2E_ANALYTICAL_ADAPTER)) {
            context.addIssue({ code: 'custom', path: ['traces'], message: 'Every D2E carrier must use the registered analytical adapter.' });
        }
    }
    for (const obligation of result.worldObligations) {
        if (obligation.origin.kind !== 'edge' || !edgeIds.has(obligation.origin.edgeId)) {
            context.addIssue({ code: 'custom', path: ['worldObligations'], message: 'Every D2E world obligation must originate on a contained edge.' });
            continue;
        }
        const originEdgeId = obligation.origin.edgeId;
        const origin = edges.find((edge) => edge.edgeId === originEdgeId)!;
        if (canonicalJson(obligation.supportCarrier) !== canonicalJson(origin.targetCarrier)) {
            context.addIssue({ code: 'custom', path: ['worldObligations'], message: 'D2E obligation support must be the exact origin-edge target carrier.' });
        }
    }
});

export type D2EI2AnalyticalExport = z.infer<typeof D2EI2AnalyticalExportSchema>;
export type D2EI2RequestPayload = z.infer<typeof D2EI2RequestPayloadSchema>;
export type D2EI2Request = z.infer<typeof D2EI2RequestSchema>;
export type D2EImplementationReceiptBase = z.infer<typeof D2EImplementationReceiptBaseSchema>;
export type D2EI2Result = z.infer<typeof D2EI2ResultSchema>;

export function buildD2EI2Request(input: unknown): D2EI2Request {
    const payload = D2EI2RequestPayloadSchema.parse(input);
    return D2EI2RequestSchema.parse({ ...payload, requestDigest: sha256Digest(payload) });
}

export function parseOrBuildD2EI2Request(input: unknown): D2EI2Request {
    if (input && typeof input === 'object' && !Array.isArray(input) && 'requestDigest' in input) {
        return D2EI2RequestSchema.parse(input);
    }
    return buildD2EI2Request(input);
}
