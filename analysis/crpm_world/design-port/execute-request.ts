import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    V4_RULESET_ID,
    applySimulationCommand,
    cloneSimulation,
    createSimulation
} from '../../../shared/simulation';

import { adaptSimulationCommand } from '../adapters/v4-authority-adapter';
import { canonicalJson, deepSortJson, sha256Digest } from '../canonical';
import { V4_CUT_IDS } from '../cuts/v4-cuts';
import { assessQuotientTransport } from '../kernel/assess-quotient-transport';
import { projectV4CommandSample, projectV4SimulationState, type V4CommandSample } from '../kernel/project-cut';
import { traceVoyage } from '../kernel/trace-voyage';
import { evaluateWorldDesignResult } from '../evaluation/evaluate';
import type { EvaluationBundle, EvaluationDeclaration } from '../evaluation/schemas';
import {
    VoyageTraceV2Schema,
    WorldDesignResultSchema,
    buildWorldDesignResult
} from '../schemas';
import type {
    DiagnosticAxis,
    DiagnosticProfileV1,
    ProjectionTransportAssessment,
    WorldDesignResult
} from '../types';
import {
    FORBIDDEN_DESIGN_PORTS,
    OFFLINE_ADAPTER_IDS,
    getD2AConfigRegistration
} from './registry';
import {
    parseOrBuildOfflineWorldDesignRequest,
    type OfflineCommandStep,
    type OfflineWorldDesignRequest
} from './validate-request';

export const CRPM_WORLD_RESULT_ROOT = 'test-results/crpm-world';
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function unique(values: readonly string[]): string[] {
    return [...new Set(values)];
}

function diagnosticAxis(
    assessment: string,
    evidenceRefs: readonly string[],
    visibleResidue: readonly string[],
    blockedClaims: readonly string[]
): DiagnosticAxis {
    return {
        assessment,
        evidenceRefs: unique(evidenceRefs),
        visibleResidue: unique(visibleResidue),
        blockedClaims: unique(blockedClaims)
    };
}

function v4Diagnostic(
    request: OfflineWorldDesignRequest,
    accepted: number,
    rejected: number,
    mutated: number,
    eventCount: number,
    witnessIds: readonly string[]
): DiagnosticProfileV1 {
    const values = new Map<string, number>([
        ['v4.accepted_commands', accepted],
        ['v4.rejected_commands', rejected],
        ['v4.mutated_commands', mutated],
        ['v4.event_count', eventCount]
    ]);
    const blocked = [
        'A bounded transcript does not prove all-command or all-state simulation equivalence.',
        'Authority-adapter parity does not establish balance, gameplay approval, or production activation.'
    ];
    const residue = [
        `The declared transcript contains ${request.sequence.length} command attempts under one seed.`,
        'Projection transport is assessed only over the supplied command samples.'
    ];
    return {
        schemaVersion: 1,
        diagnosticId: `${request.requestId}-v4-diagnostic`,
        diagnosticVersion: 1,
        evaluationObjectRef: request.baseline.id,
        cut: request.cut,
        protectedFamily: request.protectedFamily,
        scope: `Offline request ${request.requestId}; scenarios ${request.scenarioDomain.scenarioIds.join(', ')}; seeds ${request.seeds.join(', ')}.`,
        pathPressure: diagnosticAxis('The ordered authoritative command path remains explicit.', witnessIds, residue, blocked),
        residueVisibility: diagnosticAxis('State, event, terrain, projectile, and authority residuals remain edge-scoped.', witnessIds, residue, blocked),
        localReorganization: diagnosticAxis('Only changes returned by applySimulationCommand are credited.', witnessIds, residue, blocked),
        cutFidelity: diagnosticAxis('The complete digest-backed V4 authority cut is used for the declared transcript.', witnessIds, residue, blocked),
        returnStrength: diagnosticAxis('Deterministic transcript re-entry is supported; no recurrence or exact return is inferred.', witnessIds, residue, blocked),
        closureRisk: diagnosticAxis('Finite parity and projection checks remain bounded evidence.', witnessIds, residue, blocked),
        scalarProbes: request.mandatoryEvidenceProbes.map((probeId) => ({
            probeId,
            value: values.get(probeId)!,
            unit: probeId === 'v4.event_count' ? 'events' : 'commands',
            scope: 'Declared offline V4 authority transcript only.'
        })),
        blockedClaims: blocked,
        excludedClaims: request.explicitExclusions
    };
}

function executeV4(request: OfflineWorldDesignRequest): WorldDesignResult {
    if (request.baseline.kind !== 'ruleset') throw new TypeError('Validated V4 request lost its ruleset baseline.');
    const commandSteps = request.sequence as OfflineCommandStep[];
    let state = createSimulation(request.seeds[0], request.baseline.calling, V4_RULESET_ID);
    const samples: V4CommandSample[] = [];
    const outputs = commandSteps.map((step) => {
        const sample: V4CommandSample = {
            state: cloneSimulation(state),
            actor: step.actor,
            command: step.command,
            expectedTurn: step.expectedTurn
        };
        samples.push(sample);
        const output = adaptSimulationCommand(state, step.actor, step.command, step.expectedTurn, request.cut);
        state = output.transition.state;
        return output;
    });
    const baseVoyage = traceVoyage(outputs.map((output) => output.edge), {
        voyageId: `${request.requestId}-v4-voyage`,
        externallySuppliedInputPorts: ['simulation-command'],
        forbiddenPortIds: [...FORBIDDEN_DESIGN_PORTS],
        terminalStatus: state.phase === 'finished' ? 'completed' : 'nonterminal',
        terminalSummary: 'The declared V4 command transcript was executed only through the existing simulation authority adapter.',
        excludedClaims: request.explicitExclusions,
        reentryInstructions: [
            `Recreate ${request.baseline.id} with seed ${request.seeds[0]} and calling ${request.baseline.calling}.`,
            'Replay the exact actor, expectedTurn, and command declarations in sequence order.'
        ]
    });
    const voyage = VoyageTraceV2Schema.parse({
        ...baseVoyage,
        replaySupport: {
            supported: true,
            replayRecordRefs: outputs.map((output, index) =>
                `analysis-transcript-${String(index).padStart(4, '0')}-${output.edgeDigest.slice(0, 24)}`
            ),
            stateHashRefs: [baseVoyage.initialCarrier.stateDigest, ...outputs.map((output) => output.postStateDigest)],
            limitations: [
                'This is deterministic analysis-side command-path re-entry, not a new or modified CoordinatorReplayRecord ABI.',
                'Ordered events are witnessed separately by each transition and are not serialized into production replay records by this port.'
            ]
        }
    });
    const projection = assessQuotientTransport(
        samples,
        (sample) => projectV4CommandSample(V4_CUT_IDS.authority, sample).projectedValue,
        (sample) => applySimulationCommand(sample.state, sample.actor, sample.command, sample.expectedTurn).state,
        (target) => projectV4SimulationState(V4_CUT_IDS.authority, target).projectedValue,
        {
            assessmentId: `${request.requestId}-v4-authority-transport`,
            sampledDomain: request.scenarioDomain,
            itemReference: (_sample, index) => `v4-command-${String(index).padStart(4, '0')}`,
            blockedClaims: request.explicitExclusions
        }
    );
    const accepted = outputs.filter((output) => output.transition.accepted).length;
    const rejected = outputs.length - accepted;
    const mutated = outputs.filter((output) => output.transition.mutated).length;
    const eventCount = outputs.reduce((total, output) => total + output.transition.events.length, 0);
    const witnessIds = outputs.map((output) => output.witness.witnessId);
    return buildWorldDesignResult({
        schemaVersion: 1,
        resultId: `${request.requestId}-result`,
        resultVersion: 1,
        requestDigest: request.requestDigest,
        sourceLocks: outputs[0].edge.fixedFrame.sourceLocks,
        traces: [voyage],
        transitionWitnesses: outputs.map((output) => output.witness),
        projectionAssessments: [projection],
        worldObligations: [],
        returnAssessments: [],
        diagnostics: [v4Diagnostic(request, accepted, rejected, mutated, eventCount, witnessIds)],
        residualLedger: voyage.accumulatedResidual,
        blockedClaims: [
            'This offline result cannot mutate shared, protocol, replay, client, server, reward, or runtime state.',
            'Passing finite transcript, re-entry, or projection checks does not activate gameplay or prove global equivalence.',
            ...request.explicitExclusions
        ],
        maturity: 'M2_local_use',
        productAuthority: 'none',
        authorityProvenance: {
            relationship: 'authority_adapter_parity',
            authoritySource: outputs[0].edge.fixedFrame.sourceLocks[0],
            witnessReferences: outputs.map((output) => ({
                witnessId: output.witness.witnessId,
                digest: sha256Digest(output.witness)
            })),
            scope: 'Exact accepted, mutated, state, ordered-event, and error parity for the registered finite V4 transcript.',
            excludedClaims: [
                'This provenance relation is not ProductAuthority, design landfall, replay-ABI equivalence, balance, or production activation.'
            ]
        },
        evidenceOrigin: 'authority-derived',
        covarianceGroup: `offline-v4-${request.baseline.id}`,
        deduplicationIdentity: sha256Digest({
            requestDigest: request.requestDigest,
            witnesses: outputs.map((output) => output.witness.deduplicationIdentity)
        })
    });
}

function d2aProjectionAssessment(
    request: OfflineWorldDesignRequest,
    result: WorldDesignResult
): ProjectionTransportAssessment[] {
    const edges = result.traces.flatMap((trace) => trace.transitionEdges);
    if (edges.length === 0) return [];
    const readable = edges.filter((edge) => {
        const response = edge.response;
        return response && typeof response === 'object' && !Array.isArray(response) &&
            'preRecurrenceKey' in response && 'postRecurrenceKey' in response;
    });
    if (readable.length === 0) return [];
    return [assessQuotientTransport(
        readable,
        (edge) => (edge.response as Record<string, unknown>).preRecurrenceKey,
        (edge) => edge,
        (edge) => (edge.response as Record<string, unknown>).postRecurrenceKey,
        {
            assessmentId: `${request.requestId}-d2a-tactical-transport`,
            sampledDomain: request.scenarioDomain,
            itemReference: (edge, index) => `${edge.edgeId}-${String(index).padStart(4, '0')}`,
            blockedClaims: [
                'Passing this compact action sample does not prove continuation over the full D2A state space.',
                ...request.explicitExclusions
            ]
        }
    )];
}

function executeD2A(request: OfflineWorldDesignRequest): WorldDesignResult {
    if (request.baseline.kind !== 'd2a_config') throw new TypeError('Validated D2A request lost its config baseline.');
    const config = getD2AConfigRegistration(request.baseline.id);
    const encoded = execFileSync(
        'python',
        ['-m', 'analysis.crpm_world.adapters.d2a_export', '--case', config.caseId],
        {
            cwd: REPOSITORY_ROOT,
            encoding: 'utf8',
            maxBuffer: 32 * 1024 * 1024,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true
        }
    );
    const analytical = WorldDesignResultSchema.parse(JSON.parse(encoded));
    const diagnostics = analytical.diagnostics.map((diagnostic) => diagnostic.schemaVersion === 1
        ? {
            ...diagnostic,
            excludedClaims: unique([...diagnostic.excludedClaims, ...request.explicitExclusions])
        }
        : diagnostic
    );
    const provisional = WorldDesignResultSchema.parse(analytical);
    const projectionAssessments = uniqueAssessments([
        ...provisional.projectionAssessments,
        ...d2aProjectionAssessment(request, provisional)
    ]);
    const { resultDigest: _analyticalResultDigest, ...analyticalPayload } = analytical;
    return buildWorldDesignResult({
        ...analyticalPayload,
        resultId: `${request.requestId}-result`,
        requestDigest: request.requestDigest,
        diagnostics,
        projectionAssessments,
        blockedClaims: unique([
            ...analytical.blockedClaims,
            'The fixed Python module invocation is an offline analytical boundary, not a runtime service or executable-operator port.',
            ...request.explicitExclusions
        ]),
        deduplicationIdentity: sha256Digest({
            requestDigest: request.requestDigest,
            analyticalDeduplicationIdentity: analytical.deduplicationIdentity
        })
    });
}

function uniqueAssessments(assessments: readonly ProjectionTransportAssessment[]): ProjectionTransportAssessment[] {
    const seen = new Set<string>();
    return assessments.filter((assessment) => {
        const key = `${assessment.assessmentId}@${assessment.assessmentVersion}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function executeWorldDesignRequestBase(input: unknown): {
    request: OfflineWorldDesignRequest;
    result: WorldDesignResult;
} {
    const request = parseOrBuildOfflineWorldDesignRequest(input);
    const result = request.adapter.id === OFFLINE_ADAPTER_IDS.v4Authority
        ? executeV4(request)
        : executeD2A(request);
    return { request, result };
}

function evaluationDeclaration(
    request: OfflineWorldDesignRequest,
    result: WorldDesignResult
): EvaluationDeclaration {
    const reportEvidence = result.diagnostics.flatMap((diagnostic) => diagnostic.schemaVersion === 1
        ? diagnostic.pathPressure.evidenceRefs.map((reference) => {
            const digest = /^[0-9a-f]{64}$/.test(reference) ? reference : sha256Digest(reference);
            return { witnessId: `source-evidence-${digest.slice(0, 24)}`, digest };
        })
        : []);
    const witnessReferences = [
        ...result.transitionWitnesses.map((witness) => ({
            witnessId: witness.witnessId,
            digest: sha256Digest(witness)
        })),
        ...reportEvidence
    ].filter((reference, index, all) => all.findIndex((candidate) =>
        candidate.witnessId === reference.witnessId && candidate.digest === reference.digest
    ) === index);
    if (witnessReferences.length === 0) {
        throw new Error('Registered evaluation requires result-bound witness references.');
    }
    const pressureCaseId = request.adapter.id === OFFLINE_ADAPTER_IDS.v4Authority
        ? 'v4_adapter' as const
        : getD2AConfigRegistration(request.baseline.id).caseId;
    const residueDeclaration = unique([
        ...result.residualLedger.excludedUnmodelledResidue,
        ...result.residualLedger.unresolvedObligations.map((item) => `Unresolved obligation: ${item}.`),
        'The declared scope, source authority, and product-authority boundary remain visible residue.'
    ]);
    return {
        schemaVersion: 1,
        evaluationId: `${request.requestId}-evaluation`,
        evaluationVersion: 1,
        evaluationMode: 'registered_historical_pressure',
        object: {
            kind: 'candidate_design_result',
            objectRef: result.resultId
        },
        activeFrame: {
            frameRef: `${request.requestId}/frame`,
            cut: request.cut,
            admissibleScope: request.scenarioDomain
        },
        protectedFamily: request.protectedFamily,
        excludedClaims: request.explicitExclusions,
        pressureCaseId,
        witnessReferences,
        residueDeclaration,
        returnDeclaration: request.adapter.id === OFFLINE_ADAPTER_IDS.v4Authority
            ? 'Re-enter the exact authority seed and replay the ordered actor, expected-turn, and command declarations.'
            : 'Re-enter the registered config and schema version through the fixed D2A exporter, then verify report and witness digests.',
        boundedExecution: {
            reason: 'The registered adapter completed the declared bounded request and produced a schema-valid deterministic result.',
            witnessReferences
        },
        mandatoryEvidenceProbeIds: request.mandatoryEvidenceProbes,
        optionalDisplayedScalarProbeIds: request.optionalDisplayedScalarProbes,
        assertedClaims: []
    };
}

export function executeWorldDesignEvaluation(input: unknown): {
    result: WorldDesignResult;
    evaluation: EvaluationBundle;
} {
    const { request, result: baseResult } = executeWorldDesignRequestBase(input);
    const declaration = evaluationDeclaration(request, baseResult);
    const preliminaryEvaluation = evaluateWorldDesignResult(declaration, baseResult);
    const { resultDigest: _baseDigest, ...basePayload } = baseResult;
    const result = buildWorldDesignResult({
        ...basePayload,
        diagnostics: [preliminaryEvaluation.diagnosticProfile, ...baseResult.diagnostics],
        blockedClaims: unique([
            ...baseResult.blockedClaims,
            ...preliminaryEvaluation.falseClosureDetections
                .filter((detection) => detection.triggered)
                .map((detection) => `${detection.blockedClaimId}: ${detection.reason}`)
        ]),
        maturity: preliminaryEvaluation.maturityAssessment.maturity
    });
    const evaluation = evaluateWorldDesignResult(declaration, result);
    return { result, evaluation };
}

export function executeWorldDesignRequest(input: unknown): WorldDesignResult {
    return executeWorldDesignEvaluation(input).result;
}

function within(parent: string, target: string): boolean {
    const pathFromParent = relative(parent, target);
    return pathFromParent !== '' && !pathFromParent.startsWith('..') && !isAbsolute(pathFromParent);
}

function assertNoLinkTraversal(target: string): void {
    const pathFromRepository = relative(REPOSITORY_ROOT, target);
    let cursor = REPOSITORY_ROOT;
    for (const segment of pathFromRepository.split(sep)) {
        cursor = resolve(cursor, segment);
        if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) {
            throw new RangeError('World-design file paths must not traverse symbolic links or junctions.');
        }
    }
}

export function resolveWorldDesignOutputPath(outputPath: string): string {
    if (typeof outputPath !== 'string' || outputPath.trim() !== outputPath || outputPath.length === 0) {
        throw new TypeError('Output path must be a non-empty trimmed path.');
    }
    const allowedRoot = resolve(REPOSITORY_ROOT, CRPM_WORLD_RESULT_ROOT);
    const target = isAbsolute(outputPath) ? resolve(outputPath) : resolve(REPOSITORY_ROOT, outputPath);
    if (!within(allowedRoot, target) || extname(target).toLowerCase() !== '.json') {
        throw new RangeError(`World-design output must be a JSON file below ${CRPM_WORLD_RESULT_ROOT}.`);
    }
    assertNoLinkTraversal(target);
    return target;
}

export function defaultWorldDesignOutputPath(request: OfflineWorldDesignRequest): string {
    return resolveWorldDesignOutputPath(`${CRPM_WORLD_RESULT_ROOT}/${request.requestId}-result.json`);
}

export function writeWorldDesignResult(outputPath: string, resultInput: unknown): string {
    const result = WorldDesignResultSchema.parse(resultInput);
    const target = resolveWorldDesignOutputPath(outputPath);
    mkdirSync(dirname(target), { recursive: true });
    assertNoLinkTraversal(target);
    writeFileSync(target, `${JSON.stringify(deepSortJson(result), null, 2)}\n`, { encoding: 'utf8' });
    return target;
}

export function readWorldDesignRequestFile(requestPath: string): unknown {
    if (typeof requestPath !== 'string' || requestPath.trim() !== requestPath || requestPath.length === 0) {
        throw new TypeError('Request path must be a non-empty trimmed path.');
    }
    const target = isAbsolute(requestPath) ? resolve(requestPath) : resolve(REPOSITORY_ROOT, requestPath);
    if (!within(REPOSITORY_ROOT, target) || extname(target).toLowerCase() !== '.json') {
        throw new RangeError('World-design request must be a repository-local JSON file.');
    }
    assertNoLinkTraversal(target);
    return JSON.parse(readFileSync(target, 'utf8'));
}

export function canonicalWorldDesignResult(result: WorldDesignResult): string {
    return canonicalJson(WorldDesignResultSchema.parse(result));
}
