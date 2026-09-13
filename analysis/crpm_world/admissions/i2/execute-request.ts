import { execFileSync } from 'node:child_process';
import {
    existsSync,
    lstatSync,
    mkdirSync,
    readFileSync,
    writeFileSync
} from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson, deepSortJson, sha256Digest, type JsonValue } from '../../canonical';
import { traceVoyage } from '../../kernel/trace-voyage';
import { mergeResidualLedgers } from '../../kernel/residual-ledger';
import {
    DiagnosticProfileV2Schema,
    ScalarProbeSchema,
    TransitionWitnessSchema,
    WorldCarrierReferenceSchema,
    WorldObligationSchema,
    WorldTransitionEdgeV2Schema
} from '../../schemas';
import type {
    ResidualLedger,
    TransitionWitness,
    VoyageTraceV4,
    WorldCarrierReference,
    WorldTransitionEdgeV2
} from '../../types';
import { D2E_I2_CUT_DEFINITION } from './cut';
import {
    assertD2EImplementationSealed,
    buildD2EImplementationReceiptBase
} from './implementation-lock';
import {
    D2E_ACTION_FAMILY,
    D2E_ANALYTICAL_ADAPTER,
    D2E_CONFIG_ID,
    D2E_CUT,
    D2E_EXPLICIT_EXCLUSIONS,
    D2E_FORBIDDEN_PORTS,
    D2E_MANDATORY_EVIDENCE_PROBES,
    D2E_POLICY_FAMILY,
    D2E_PROTECTED_FAMILY,
    D2E_RESULT_SCHEMA_VERSION,
    D2E_SOURCE_COMMIT,
    D2E_WORLD_ADAPTER
} from './registry';
import {
    D2EI2AnalyticalExportSchema,
    D2EI2ResultPayloadSchema,
    D2EI2ResultSchema,
    parseOrBuildD2EI2Request,
    type D2EI2AnalyticalExport,
    type D2EI2Request,
    type D2EI2Result,
    type D2EImplementationReceiptBase
} from './schemas';

export const D2E_RESULT_ROOT = 'test-results/crpm-world/d2e-i2';
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const ACTION_INPUT_PORT = 'd2e.action.declaration';

type AnalysisSurfaces = Readonly<{
    traces: VoyageTraceV4[];
    transitionWitnesses: TransitionWitness[];
    worldObligations: ReturnType<typeof WorldObligationSchema.parse>[];
    diagnosticProfile: ReturnType<typeof DiagnosticProfileV2Schema.parse>;
    scalarProbes: ReturnType<typeof ScalarProbeSchema.parse>[];
    residualLedger: ResidualLedger;
}>;

function unique(values: readonly string[]): string[] {
    return [...new Set(values)];
}

function sourceLocks(evidence: D2EI2AnalyticalExport) {
    return [
        {
            repositoryId: 'worms-port',
            commit: evidence.sourceBinding.commit,
            paths: evidence.sourceBinding.paths
        },
        {
            repositoryId: 'crpm',
            commit: evidence.methodBinding.commit,
            paths: evidence.methodBinding.paths
        }
    ] as const;
}

function i2Binding(evidence: D2EI2AnalyticalExport) {
    const binding = evidence.reportBindings.find((item) => item.caseId === 'i2');
    if (!binding) throw new Error('Validated D2E evidence lost its I2 report binding.');
    return binding;
}

function carrier(
    evidence: D2EI2AnalyticalExport,
    compact: D2EI2AnalyticalExport['transitionWitnesses'][number] extends infer _T ? any : never,
    sourceReference: string
): WorldCarrierReference {
    const binding = i2Binding(evidence);
    return WorldCarrierReferenceSchema.parse({
        schemaVersion: 1,
        profileVersion: 3,
        carrierKind: 'tactical-analysis',
        adapter: D2E_ANALYTICAL_ADAPTER,
        rulesetOrConfigId: D2E_CONFIG_ID,
        baselineDigest: binding.configDigest,
        stateDigest: compact.fullSnapshotDigest,
        revisionOrStep: compact.completedTurns,
        sourceReference
    });
}

function delta(subject: string, before: JsonValue, after: JsonValue, description: string) {
    return { subject, before, after, description };
}

function residualFor(
    before: any,
    after: any,
    openedObligation?: string
): ResidualLedger {
    const positionDeltas = [];
    const resourceDeltas = [];
    const healthDeltas = [];
    const statusDeltas = [];
    for (const actor of ['player', 'loomkeeper'] as const) {
        if (before[actor].x !== after[actor].x) {
            positionDeltas.push(delta(`${actor}.position`, before[actor].x, after[actor].x, 'Tactical world-position change.'));
        }
        if (before[actor].escapeSlack !== after[actor].escapeSlack) {
            resourceDeltas.push(delta(`${actor}.escape_slack`, before[actor].escapeSlack, after[actor].escapeSlack, 'Bounded Escape-Slack residue.'));
        }
        if (before[actor].stitching !== after[actor].stitching) {
            healthDeltas.push(delta(`${actor}.stitching`, before[actor].stitching, after[actor].stitching, 'Abstract direct-damage residue.'));
        }
        for (const [field, subject] of [
            ['seamPinTurns', 'seam_pin_turns'],
            ['seamPinCooldown', 'seam_pin_cooldown'],
            ['spoolburstPreparationTurns', 'spoolburst_preparation_turns'],
            ['spoolburstCocoonHits', 'spoolburst_cocoon_hits']
        ] as const) {
            if (before[actor][field] !== after[actor][field]) {
                statusDeltas.push(delta(`${actor}.${subject}`, before[actor][field], after[actor][field], 'Visible tactical support/status change.'));
            }
        }
    }
    for (const [field, subject] of [
        ['activeActor', 'tactical.active_actor'],
        ['winner', 'tactical.winner'],
        ['finishReason', 'tactical.finish_reason']
    ] as const) {
        if (before[field] !== after[field]) {
            statusDeltas.push(delta(subject, before[field], after[field], 'Turn ownership or terminal-state change.'));
        }
    }
    return {
        schemaVersion: 2,
        positionDeltas,
        resourceDeltas,
        healthDeltas,
        statusDeltas,
        terrainDeltas: [],
        authorityDeltas: [],
        expiredRights: [],
        openedObligations: openedObligation ? [openedObligation] : [],
        carriedObligations: [],
        dischargedObligations: [],
        unresolvedObligations: openedObligation ? [openedObligation] : [],
        excludedUnmodelledResidue: [...D2E_EXPLICIT_EXCLUSIONS]
    };
}

function scenarioDomain(startingDistance: number) {
    return {
        schemaVersion: 1 as const,
        scenarioIds: [`d2e-i2-start-${startingDistance}`],
        actionFamilies: [D2E_ACTION_FAMILY],
        policyFamilies: [D2E_POLICY_FAMILY],
        seeds: [3_237_998_097],
        constraints: [
            `Full-resource analytical start ${startingDistance}; production spawn authority remains 640.`,
            'Both first actors, both mirrors, and all registered policy pairs remain part of the complete report even when this edge is a compact selected witness.'
        ]
    };
}

function transitionWitness(
    edgeId: string,
    witnessId: string,
    underlyingDigest: string,
    source: WorldCarrierReference,
    target: WorldCarrierReference,
    sourceRefs: readonly string[]
): TransitionWitness {
    return TransitionWitnessSchema.parse({
        schemaVersion: 1,
        witnessId,
        witnessVersion: 1,
        edgeId,
        evidenceOrigin: 'analysis-derived',
        covarianceGroup: 'd2e-i2-fixed-model-policy-domain-v1',
        deduplicationIdentity: underlyingDigest,
        sourceRefs,
        decoderRefs: ['d2e.i2.compact_carrier.v1', 'd2e.i2.analytical_export.v1'],
        inputDigest: source.stateDigest,
        outputDigest: target.stateDigest,
        status: 'exact',
        excludedClaims: [
            'Exact means parity with the source-locked D2A analytical carrier, not TypeScript gameplay authority.',
            ...D2E_EXPLICIT_EXCLUSIONS
        ]
    });
}

function edge(
    evidence: D2EI2AnalyticalExport,
    input: Readonly<{
        edgeId: string;
        motif: string;
        pathPosition: number;
        startingDistance: number;
        source: WorldCarrierReference;
        target: WorldCarrierReference;
        action: any;
        response: unknown;
        underlyingWitnessId: string;
        underlyingDigest: string;
        residual: ResidualLedger;
        newlyVisible: readonly string[];
    }>
): Readonly<{ edge: WorldTransitionEdgeV2; witness: TransitionWitness }> {
    const sourceRefs = [
        i2Binding(evidence).configPath,
        'analysis/tactical_model/model.py',
        `report-sha256:${i2Binding(evidence).reportDigest}`,
        `analytical-witness-sha256:${input.underlyingDigest}`
    ];
    const witness = transitionWitness(
        input.edgeId,
        `${input.edgeId}-transition-witness`,
        input.underlyingDigest,
        input.source,
        input.target,
        sourceRefs
    );
    const parsed = WorldTransitionEdgeV2Schema.parse({
        schemaVersion: 2,
        edgeId: input.edgeId,
        edgeVersion: 1,
        edgeKind: 'd2e_i2_analytical_action',
        domainMotif: input.motif,
        sourceCarrier: input.source,
        targetCarrier: input.target,
        sourceCut: D2E_CUT,
        targetCut: D2E_CUT,
        fixedFrame: {
            schemaVersion: 1,
            sourceLocks: sourceLocks(evidence),
            baselineOrConfigId: D2E_CONFIG_ID,
            adapter: D2E_ANALYTICAL_ADAPTER,
            scenarioDomain: scenarioDomain(input.startingDistance),
            sourceCut: D2E_CUT,
            targetCut: D2E_CUT,
            actorOrPolicy: `${input.action.actor}:${input.action.policy}`,
            expectedRevisionOrStep: input.source.revisionOrStep
        },
        commandOrDeclaration: input.action,
        response: input.response,
        protectedFamily: [...D2E_PROTECTED_FAMILY],
        sourceRefs,
        witnessReferences: [{ witnessId: witness.witnessId, digest: sha256Digest(witness) }],
        decoderRefs: ['d2e.i2.compact_carrier.v1', 'd2e.i2.analytical_export.v1'],
        carrierRefs: [sha256Digest(input.source), sha256Digest(input.target)],
        pathPosition: input.pathPosition,
        preserved: [
            'Source-locked config, scenario, policy, actor, action, damage, support, and response order.',
            'Production spawn authority remains 640 and ProductAuthority remains none.'
        ],
        forgotten: [...D2E_EXPLICIT_EXCLUSIONS],
        newlyVisible: [...input.newlyVisible],
        residual: input.residual,
        reversibility: 'one_way',
        returnCondition: 'Re-enter the exact D2D commit/config/report/match/trace carrier; no recurrence or exact state return is inferred.',
        reopeningCondition: 'Reopen on source, config, domain, report, witness, obligation, exclusion, or product-authority drift.',
        supportStatus: 'verified',
        productAuthority: 'none',
        authorityDefinitionMutationObserved: false,
        portBindings: {
            contextPorts: ['d2e.context.config', 'd2e.context.cut', 'd2e.context.scenario'],
            actionPorts: [ACTION_INPUT_PORT],
            responsePorts: ['d2e.response.observed'],
            evidencePorts: ['d2e.evidence.report', 'd2e.evidence.transition_witness'],
            supportPorts: ['d2e.support.tactical_carrier', 'd2e.support.range_status_resource'],
            returnPorts: ['d2e.return.source_locked_reentry']
        }
    });
    return { edge: parsed, witness };
}

function buildEntryVoyage(
    evidence: D2EI2AnalyticalExport,
    selected: Extract<D2EI2AnalyticalExport['transitionWitnesses'][number], { matchIdentity: unknown }>
): Readonly<{ trace: VoyageTraceV4; witnesses: TransitionWitness[] }> {
    const base = selected.witnessId;
    const pre = carrier(evidence, selected.entry.sourceCarrier, `${base}:pre`);
    const entered = carrier(evidence, selected.entry.targetCarrier, `${base}:entered`);
    const responded = carrier(evidence, selected.opponentResponse.targetCarrier, `${base}:responded`);
    const first = edge(evidence, {
        edgeId: `${base}-entry-edge`,
        motif: 'outside_range_to_enter_range',
        pathPosition: 0,
        startingDistance: selected.matchIdentity.startingDistance,
        source: pre,
        target: entered,
        action: selected.entry.action,
        response: {
            accepted: true,
            targetPolicy: selected.entry.targetPolicy,
            entryResidual: selected.entry.residual,
            matchedF4: selected.matchedF4,
            terminalOutcome: selected.terminalOutcome,
            analyticalTraceStep: selected.entry.analyticalTraceStep
        },
        underlyingWitnessId: selected.witnessId,
        underlyingDigest: selected.witnessDigest,
        residual: residualFor(selected.entry.sourceCarrier, selected.entry.targetCarrier),
        newlyVisible: [
            'Movement creates Needlepoint legality while retaining the normal 30-damage cast.',
            'I2 suppresses only the entry-generated target Seam Pin and caster cooldown relative to the matched F4 carrier.'
        ]
    });
    const second = edge(evidence, {
        edgeId: `${base}-response-edge`,
        motif: 'enter_range_to_opponent_response',
        pathPosition: 1,
        startingDistance: selected.matchIdentity.startingDistance,
        source: entered,
        target: responded,
        action: selected.opponentResponse.action,
        response: {
            accepted: true,
            analyticalTraceStep: selected.opponentResponse.analyticalTraceStep
        },
        underlyingWitnessId: selected.witnessId,
        underlyingDigest: selected.witnessDigest,
        residual: residualFor(selected.opponentResponse.sourceCarrier, selected.opponentResponse.targetCarrier),
        newlyVisible: ['The opponent next ordinary action remains a separate composable edge rather than an implied response.']
    });
    return {
        trace: traceVoyage([first.edge, second.edge], {
            voyageId: `${base}-voyage`,
            terminalStatus: 'nonterminal',
            terminalSummary: `Selected I2 entry and ordinary opponent response at starting distance ${selected.matchIdentity.startingDistance}.`,
            externallySuppliedInputPorts: [ACTION_INPUT_PORT],
            forbiddenPortIds: [...D2E_FORBIDDEN_PORTS],
            reentryInstructions: [
                `Re-enter source commit ${D2E_SOURCE_COMMIT}, the I2 config, and match identity ${canonicalJson(selected.matchIdentity)}.`,
                'Replay both declared policy actions and compare compact carrier, residual, transition-witness, and source report digests.'
            ],
            excludedClaims: [...D2E_EXPLICIT_EXCLUSIONS]
        }),
        witnesses: [first.witness, second.witness]
    };
}

function buildControlVoyage(
    evidence: D2EI2AnalyticalExport,
    selected: Extract<D2EI2AnalyticalExport['transitionWitnesses'][number], { sourceReference: { configId: string } }>
): Readonly<{
    trace: VoyageTraceV4;
    witness: TransitionWitness;
    obligation: ReturnType<typeof WorldObligationSchema.parse>;
}> {
    const obligationId = 'd2e.i2.control.loomkeeper.seam_pin';
    const source = carrier(evidence, selected.sourceCarrier, `${selected.witnessId}:pre`);
    const target = carrier(evidence, selected.targetCarrier, `${selected.witnessId}:post`);
    const built = edge(evidence, {
        edgeId: `${selected.witnessId}-edge`,
        motif: 'later_in_band_cast_to_resolution',
        pathPosition: 0,
        startingDistance: selected.sourceCarrier.distance,
        source,
        target,
        action: selected.action,
        response: {
            accepted: true,
            residual: selected.residual,
            sourceReference: selected.sourceReference
        },
        underlyingWitnessId: selected.witnessId,
        underlyingDigest: selected.witnessDigest,
        residual: residualFor(selected.sourceCarrier, selected.targetCarrier, obligationId),
        newlyVisible: [
            'An already-in-band advancing Needlepoint remains ordinary F4 behavior and opens the one-turn Seam-Pin obligation.',
            'The entry suppression is edge-scoped and does not weaken every Needlepoint cast.'
        ]
    });
    const trace = traceVoyage([built.edge], {
        voyageId: `${selected.witnessId}-voyage`,
        terminalStatus: 'nonterminal',
        terminalSummary: 'Already-in-band Needlepoint control retains normal Seam Pin and caster cooldown.',
        externallySuppliedInputPorts: [ACTION_INPUT_PORT],
        forbiddenPortIds: [...D2E_FORBIDDEN_PORTS],
        reentryInstructions: [
            'Re-enter the exact I2 config at distance 576 and apply the declared advancing Needlepoint control action.'
        ],
        excludedClaims: [...D2E_EXPLICIT_EXCLUSIONS]
    });
    const obligation = WorldObligationSchema.parse({
        schemaVersion: 2,
        obligationId,
        obligationVersion: 1,
        obligationType: 'seam_pin',
        origin: { kind: 'edge', edgeId: built.edge.edgeId },
        roles: {
            owner: 'loomkeeper',
            bearer: 'loomkeeper',
            beneficiary: 'player',
            originator: 'player',
            eligibleResponders: ['loomkeeper']
        },
        supportCarrier: target,
        legalResponses: ['Take the next ordinary actor turn under the existing D2A Seam-Pin movement restriction.'],
        expiryCondition: 'The existing one-turn Seam Pin expires under the source tactical transition order.',
        dischargeCondition: 'No separate reaction discharges this ordinary control status in the declared carrier.',
        lifecycleStatus: 'open'
    });
    return { trace, witness: built.witness, obligation };
}

function scalarProbes(evidence: D2EI2AnalyticalExport) {
    const i2 = i2Binding(evidence);
    if (!i2.entrySeamPinSuppressions) throw new Error('I2 evidence lost the suppression aggregate.');
    const values = new Map<string, Readonly<{ value: number; unit: string }>>([
        ['i2.match_count', { value: i2.matchCount, unit: 'matches' }],
        ['i2.terminal_unravelled', { value: i2.terminalReasons.unravelled ?? 0, unit: 'matches' }],
        ['i2.terminal_turn_limit', { value: i2.terminalReasons.turn_limit ?? 0, unit: 'matches' }],
        ['i2.forced_opening_scenarios', { value: i2.forcedOpeningScenarioCount, unit: 'scenarios' }],
        ['i2.nonterminal_recurrence_matches', { value: i2.nonterminalRecurrenceMatchCount, unit: 'matches' }],
        ['i2.first_actor_win_rate', { value: i2.firstActorWinRate, unit: 'proportion' }],
        ['i2.entry_seam_pin_suppressions', { value: i2.entrySeamPinSuppressions.total, unit: 'actions' }],
        ['i2.affected_opening_route_first_actor_wins', { value: i2.entrySeamPinSuppressions.openingRouteResults.firstActorWins, unit: 'routes' }],
        ['i2.affected_opening_route_second_actor_wins', { value: i2.entrySeamPinSuppressions.openingRouteResults.secondActorWins, unit: 'routes' }],
        ['i2.affected_opening_route_turn_limits', { value: i2.entrySeamPinSuppressions.openingRouteResults.turnLimitResults, unit: 'routes' }],
        ['i2.movement_created_needlepoint_damage', { value: 30, unit: 'stitching' }],
        ['i2.target_seam_pin_turns', { value: 0, unit: 'turns' }],
        ['i2.caster_seam_pin_cooldown', { value: 0, unit: 'actor_turns' }],
        ['i2.threadball_uses', { value: i2.relicUses.threadball, unit: 'actions' }],
        ['i2.needlepoint_uses', { value: i2.relicUses.needlepoint, unit: 'actions' }],
        ['i2.spoolburst_uses', { value: i2.relicUses.spoolburst, unit: 'actions' }],
        ['i2.escape_slack_spent', { value: i2.escapeSlackSpent, unit: 'resource_units' }],
        ['i2.excluded_start_769_turn_limits', { value: 8, unit: 'matches' }],
        ['f4.excluded_start_769_turn_limits', { value: 4, unit: 'matches' }]
    ]);
    for (const row of i2.firstActorWinRateByDistance) {
        values.set(`i2.distance_${row.startingDistance}_first_actor_win_rate`, {
            value: row.rate,
            unit: 'proportion'
        });
    }
    return D2E_MANDATORY_EVIDENCE_PROBES.map((probeId) => {
        const probe = values.get(probeId);
        if (!probe) throw new Error(`D2E executor did not implement mandatory scalar probe ${probeId}.`);
        return ScalarProbeSchema.parse({
            probeId,
            value: probe.value,
            unit: probe.unit,
            scope: probeId.includes('excluded_start_769')
                ? 'Excluded full-resource start-769 horizon warning only.'
                : 'Registered twelve-start, 1,200-match I2 spawn-pressure domain.'
        });
    });
}

function diagnosticProfile(evidence: D2EI2AnalyticalExport) {
    const references = [
        ...evidence.transitionWitnesses.map((witness) => ({
            witnessId: witness.witnessId,
            digest: witness.witnessDigest
        })),
        {
            witnessId: evidence.horizonWarning.witnessId,
            digest: evidence.horizonWarning.witnessDigest
        }
    ];
    const claims = [
        {
            claimId: 'i2.aggregate_claimed_as_landfall',
            reason: 'The 57-percent aggregate and affected-route redistribution do not establish gameplay quality or initiative fairness.',
            witnessReferences: references
        },
        {
            claimId: 'i2.spawn_slice_claimed_as_global_distance_support',
            reason: 'The excluded start-769 witness blocks generalization from the twelve registered starts to every full-resource initial carrier.',
            witnessReferences: [references[references.length - 1]]
        },
        {
            claimId: 'i2.adapter_admission_claimed_as_v5_authority',
            reason: 'Source-locked M2 admission remains analysis-derived and cannot activate V5 or change ProductAuthority.',
            witnessReferences: references
        },
        {
            claimId: 'i2.compact_trace_claimed_as_full_relation',
            reason: 'Every compact edge requires its source report, match, trace, carrier, and witness digest for re-entry.',
            witnessReferences: references
        }
    ];
    const axis = (
        value: string,
        reason: string,
        visibleResidue: readonly string[],
        blockedClaimIds: readonly string[]
    ) => ({ value, reason, witnessReferences: references, visibleResidue, blockedClaimIds });
    return DiagnosticProfileV2Schema.parse({
        schemaVersion: 2,
        diagnosticId: 'wp-015d2e-i2-admission-diagnostic',
        diagnosticVersion: 1,
        evaluationObject: { kind: 'candidate_design_result', objectRef: 'wp-015d2e-i2-spawn-pressure-result' },
        activeFrame: {
            frameRef: 'wp-015d2e-i2-spawn-pressure-frame',
            cut: D2E_CUT,
            admissibleScope: D2E_I2_CUT_DEFINITION.admissibleDomain
        },
        protectedFamily: [...D2E_PROTECTED_FAMILY],
        excludedClaims: [...D2E_EXPLICIT_EXCLUSIONS],
        pathPressure: axis(
            'mixed_routes', evidence.diagnosticEvidence.pathPressure,
            ['Affected openings split 84/36 overall and 28/12 at each registered target distance.'],
            ['i2.aggregate_claimed_as_landfall']
        ),
        residueVisibility: axis(
            'explicit', evidence.diagnosticEvidence.residueVisibility,
            ['Position, damage, pin, cooldown, response, Relic, Escape Slack, terminal, and unmodelled residue remain bound.'],
            ['i2.compact_trace_claimed_as_full_relation']
        ),
        localReorganization: axis(
            'partial_reorganization', evidence.diagnosticEvidence.localReorganization,
            ['I2 reorganizes affected entry routes but retains policy/distance conditioning and the inherited horizon boundary.'],
            ['i2.aggregate_claimed_as_landfall']
        ),
        cutFidelity: axis(
            'boundary_residue', evidence.diagnosticEvidence.cutFidelity,
            ['Start 769 is excluded from the cut and retained as an explicit blocking warning.'],
            ['i2.spawn_slice_claimed_as_global_distance_support']
        ),
        returnStrength: axis(
            'reenterable', evidence.diagnosticEvidence.returnStrength,
            ['Re-entry is analytical source/report/trace reproduction, not the production replay ABI.'],
            ['i2.compact_trace_claimed_as_full_relation']
        ),
        closureRisk: axis(
            'blocked_landfall', evidence.diagnosticEvidence.closureRisk,
            ['M2 and ProductAuthority none remain separate from analytical disposition.'],
            ['i2.aggregate_claimed_as_landfall', 'i2.spawn_slice_claimed_as_global_distance_support', 'i2.adapter_admission_claimed_as_v5_authority']
        ),
        blockedClaims: claims
    });
}

export function buildD2EI2AnalysisSurfaces(
    requestInput: unknown,
    evidenceInput: unknown
): AnalysisSurfaces {
    const request = parseOrBuildD2EI2Request(requestInput);
    const evidence = D2EI2AnalyticalExportSchema.parse(evidenceInput);
    if (request.baseline.id !== i2Binding(evidence).configId ||
        request.seeds[0] !== evidence.domain.seed ||
        canonicalJson(request.scenarioDomain.scenarioIds) !== canonicalJson(
            evidence.domain.startingDistances.map((distance) => `d2e-i2-start-${distance}`)
        )) {
        throw new Error('D2E request and analytical evidence bindings do not match exactly.');
    }
    const entryResults = evidence.transitionWitnesses.slice(0, 3).map((selected) => {
        if (!('matchIdentity' in selected)) throw new Error('D2E entry witness order drifted.');
        return buildEntryVoyage(evidence, selected as any);
    });
    const controlEvidence = evidence.transitionWitnesses[3];
    if (!('sourceReference' in controlEvidence) || !('sourceCarrier' in controlEvidence)) {
        throw new Error('D2E in-band control witness order drifted.');
    }
    const control = buildControlVoyage(evidence, controlEvidence as any);
    const traces = [...entryResults.map((result) => result.trace), control.trace];
    const transitionWitnesses = [
        ...entryResults.flatMap((result) => result.witnesses),
        control.witness
    ];
    const residual = mergeResidualLedgers(traces.map((trace) => trace.accumulatedResidual));
    if (residual.propagationIssues.length > 0) {
        throw new Error(`D2E cross-voyage residual aggregation failed: ${residual.propagationIssues[0].message}`);
    }
    return {
        traces,
        transitionWitnesses,
        worldObligations: [control.obligation],
        diagnosticProfile: diagnosticProfile(evidence),
        scalarProbes: scalarProbes(evidence),
        residualLedger: residual.ledger
    };
}

export function runD2EI2AnalyticalExport(): D2EI2AnalyticalExport {
    const stdout = execFileSync('python', [
        '-m', 'analysis.crpm_world.adapters.d2e_i2_export'
    ], {
        cwd: REPOSITORY_ROOT,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024
    });
    return D2EI2AnalyticalExportSchema.parse(JSON.parse(stdout));
}

function buildResultPayload(
    request: D2EI2Request,
    evidence: D2EI2AnalyticalExport,
    receipt: D2EImplementationReceiptBase
) {
    const surfaces = buildD2EI2AnalysisSurfaces(request, evidence);
    return D2EI2ResultPayloadSchema.parse({
        schemaVersion: D2E_RESULT_SCHEMA_VERSION,
        resultId: 'wp-015d2e-i2-spawn-pressure-result',
        profileVersion: 3,
        requestDigest: request.requestDigest,
        sourceLocks: sourceLocks(evidence),
        cut: D2E_I2_CUT_DEFINITION,
        analyticalEvidence: evidence,
        ...surfaces,
        blockedClaims: unique([
            ...evidence.blockedClaims,
            ...evidence.horizonWarning.blockedClaims,
            'WP-015D2B remains sealed and historical; D2E does not rewrite its registry, schemas, adapter chain, or evidence lock.',
            'M2 analytical admission and structural-reference disposition leave ProductAuthority none.'
        ]),
        analyticalDisposition: 'structural_reference',
        maturity: 'M2_local_use',
        productAuthority: 'none',
        executionReceipt: receipt
    });
}

export function executeD2EI2Request(input: unknown): D2EI2Result {
    assertD2EImplementationSealed();
    const request = parseOrBuildD2EI2Request(input);
    const evidence = runD2EI2AnalyticalExport();
    const receipt = buildD2EImplementationReceiptBase(request.requestDigest, evidence.exportDigest);
    const payload = buildResultPayload(request, evidence, receipt);
    const resultDigest = sha256Digest(payload);
    return D2EI2ResultSchema.parse({
        ...payload,
        executionReceipt: { ...payload.executionReceipt, resultDigest },
        resultDigest
    });
}

function within(parent: string, target: string): boolean {
    const fromParent = relative(parent, target);
    return fromParent !== '' && !fromParent.startsWith('..') && !isAbsolute(fromParent);
}

function assertNoLinkTraversal(target: string): void {
    const pathFromRepository = relative(REPOSITORY_ROOT, target);
    let cursor = REPOSITORY_ROOT;
    for (const segment of pathFromRepository.split(sep)) {
        cursor = resolve(cursor, segment);
        if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) {
            throw new RangeError('D2E file paths must not traverse symbolic links or junctions.');
        }
    }
}

export function readD2EI2RequestFile(path: string): unknown {
    if (typeof path !== 'string' || path.trim() !== path || path.length === 0) {
        throw new TypeError('D2E request path must be a non-empty trimmed path.');
    }
    const target = isAbsolute(path) ? resolve(path) : resolve(REPOSITORY_ROOT, path);
    if (!within(REPOSITORY_ROOT, target) || extname(target).toLowerCase() !== '.json') {
        throw new RangeError('D2E request must be a repository-local JSON file.');
    }
    assertNoLinkTraversal(target);
    return JSON.parse(readFileSync(target, 'utf8'));
}

export function resolveD2EI2OutputPath(path: string): string {
    if (typeof path !== 'string' || path.trim() !== path || path.length === 0) {
        throw new TypeError('D2E output path must be a non-empty trimmed path.');
    }
    const root = resolve(REPOSITORY_ROOT, D2E_RESULT_ROOT);
    const target = isAbsolute(path) ? resolve(path) : resolve(REPOSITORY_ROOT, path);
    if (!within(root, target) || extname(target).toLowerCase() !== '.json') {
        throw new RangeError(`D2E output must be a JSON file below ${D2E_RESULT_ROOT}.`);
    }
    assertNoLinkTraversal(target);
    return target;
}

export function defaultD2EI2OutputPath(request: D2EI2Request): string {
    return resolveD2EI2OutputPath(`${D2E_RESULT_ROOT}/${request.requestId}-result.json`);
}

export function writeD2EI2Result(path: string, input: unknown): string {
    const result = D2EI2ResultSchema.parse(input);
    const target = resolveD2EI2OutputPath(path);
    mkdirSync(dirname(target), { recursive: true });
    assertNoLinkTraversal(target);
    writeFileSync(target, `${JSON.stringify(deepSortJson(result), null, 2)}\n`, 'utf8');
    return target;
}
