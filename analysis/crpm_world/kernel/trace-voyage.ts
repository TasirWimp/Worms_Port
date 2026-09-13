import {
    canonicalSimulationJson,
    cloneSimulation,
    type SimulationActor,
    type SimulationCommand,
    type SimulationState
} from '../../../shared/simulation';

import { adaptSimulationCommand } from '../adapters/v4-authority-adapter';
import { canonicalJson, sha256Digest, sha256Text } from '../canonical';
import { VoyageTraceV4Schema, WorldTransitionEdgeV2Schema } from '../schemas';
import type {
    VoyageTraceV4,
    WorldCarrierReference,
    WorldTransitionEdge,
    WorldTransitionEdgeV2
} from '../types';
import {
    assessInitialEdgeCompatibility,
    assessEdgeCompatibility,
    normalizeCompositionContract,
    type CompositionPolicy
} from './compose-edges';
import { deriveVoyageEvidence } from './derive-voyage-evidence';

export type VoyageTraceOptions = CompositionPolicy & Readonly<{
    voyageId: string;
    voyageVersion?: number;
    initialCarrier?: WorldCarrierReference;
    terminalStatus?: 'completed' | 'blocked' | 'nonterminal' | 'failed';
    terminalSummary?: string;
    recurrenceWitnesses?: VoyageTraceV4['recurrenceWitnesses'];
    returnWitnesses?: VoyageTraceV4['returnWitnesses'];
    initialObligationIds?: readonly string[];
    reentryInstructions?: readonly string[];
    excludedClaims?: readonly string[];
}>;

export type SimulationVoyageReentryResult = Readonly<{
    matched: boolean;
    finalState: SimulationState;
    reproducedEdgeDigests: string[];
    issues: string[];
}>;

function responseAccepted(edge: WorldTransitionEdge): boolean | undefined {
    const response = edge.response;
    if (!response || typeof response !== 'object' || Array.isArray(response)) return undefined;
    return typeof response.accepted === 'boolean' ? response.accepted : undefined;
}

function unique(values: readonly string[]): string[] {
    return [...new Set(values)];
}

export function traceVoyage(
    edgeInputs: readonly WorldTransitionEdgeV2[],
    options: VoyageTraceOptions
): VoyageTraceV4 {
    const edges = edgeInputs.map((edge) => WorldTransitionEdgeV2Schema.parse(edge));
    if (edges.length === 0 && !options.initialCarrier) {
        throw new RangeError('An empty voyage requires an explicit initial carrier.');
    }
    const initialCarrier = options.initialCarrier ?? edges[0].sourceCarrier;
    const transitionEdges: WorldTransitionEdgeV2[] = [];
    const edgeAttempts: VoyageTraceV4['edgeAttempts'] = [];
    const commandPath: VoyageTraceV4['commandPath'] = [];
    const normalizedCompositionContract = normalizeCompositionContract(options);
    const compositionContract = {
        ...normalizedCompositionContract,
        externallySuppliedInputPorts: [...normalizedCompositionContract.externallySuppliedInputPorts],
        forbiddenPortIds: [...normalizedCompositionContract.forbiddenPortIds]
    };
    let previousCompatibleEdge: WorldTransitionEdgeV2 | undefined;

    for (let sequence = 0; sequence < edges.length; sequence += 1) {
        const edge = edges[sequence];
        const compositionWitness = previousCompatibleEdge
            ? assessEdgeCompatibility(previousCompatibleEdge, edge, compositionContract).witness
            : assessInitialEdgeCompatibility(initialCarrier, edge, compositionContract);

        const incompatible = !compositionWitness.compatible;
        const outcome = incompatible
            ? 'incompatible'
            : responseAccepted(edge) === false ? 'rejected' : 'accepted';
        edgeAttempts.push({ sequence, outcome, edge, compositionWitness });
        commandPath.push({
            sequence,
            edgeId: edge.edgeId,
            outcome,
            commandOrDeclaration: edge.commandOrDeclaration
        });

        if (incompatible) {
            continue;
        }
        transitionEdges.push(edge);
        previousCompatibleEdge = edge;
    }

    const derived = deriveVoyageEvidence(
        edgeAttempts,
        initialCarrier,
        options.initialObligationIds ?? [],
        compositionContract
    );
    const compatible = derived.compatibility.compatible;
    const cutChanges: VoyageTraceV4['cutChanges'] = [];
    const appendCutChange = (
        sequence: number,
        sourceCut: WorldTransitionEdge['sourceCut'],
        targetCut: WorldTransitionEdge['targetCut'],
        bridgeEdgeId: string
    ) => {
        if (canonicalJson(sourceCut) === canonicalJson(targetCut) || cutChanges.some((change) =>
            change.sequence === sequence &&
            change.bridgeEdgeId === bridgeEdgeId &&
            canonicalJson(change.sourceCut) === canonicalJson(sourceCut) &&
            canonicalJson(change.targetCut) === canonicalJson(targetCut)
        )) return;
        cutChanges.push({ sequence, sourceCut, targetCut, bridgeEdgeId });
    };
    const compatibleAttempts = edgeAttempts.filter((attempt) => attempt.outcome !== 'incompatible');
    for (let index = 0; index < compatibleAttempts.length; index += 1) {
        const attempt = compatibleAttempts[index];
        if (index > 0) {
            const previousTarget = compatibleAttempts[index - 1].edge.targetCut;
            if (canonicalJson(previousTarget) !== canonicalJson(attempt.edge.sourceCut)) {
                appendCutChange(attempt.sequence, previousTarget, attempt.edge.sourceCut, attempt.edge.edgeId);
            }
        }
        appendCutChange(attempt.sequence, attempt.edge.sourceCut, attempt.edge.targetCut, attempt.edge.edgeId);
    }
    for (const attempt of edgeAttempts.filter((item) => item.outcome === 'incompatible')) {
        appendCutChange(attempt.sequence, attempt.edge.sourceCut, attempt.edge.targetCut, attempt.edge.edgeId);
    }
    const witnessReferences = edgeAttempts.flatMap((attempt) => attempt.edge.witnessReferences);
    const excludedClaims = unique([
        'A composed voyage does not establish recurrence, return, global support completeness, or gameplay activation by itself.',
        'Rejected and incompatible attempts remain evidence; they are not rewritten as successful carrier mutations.',
        ...(options.excludedClaims ?? [])
    ]);
    const reentryInstructions = unique([
        'Start from the exact initial authority carrier digest and source reference.',
        'Replay each compatible accepted or rejected command declaration in path order under its recorded cut and fixed frame.',
        'Compare every reproduced source/target carrier and edge digest; reopen on the first mismatch.',
        ...(options.reentryInstructions ?? [])
    ]);

    return VoyageTraceV4Schema.parse({
        schemaVersion: 4,
        voyageId: options.voyageId,
        voyageVersion: options.voyageVersion ?? 1,
        initialCarrier,
        transitionEdges,
        finalCarrier: derived.finalCarrier,
        compatibilityResult: derived.compatibility,
        accumulatedResidual: derived.accumulatedResidual,
        terminalResult: {
            status: compatible ? options.terminalStatus ?? 'nonterminal' : 'blocked',
            summary: options.terminalSummary ?? (compatible
                ? 'The declared witnessed edge path composed without a compatibility failure.'
                : 'The voyage retains a partially valid path and one or more incompatible attempts.'),
            excludedClaims
        },
        recurrenceWitnesses: options.recurrenceWitnesses ?? [],
        returnWitnesses: options.returnWitnesses ?? [],
        replaySupport: {
            supported: false,
            replayRecordRefs: [],
            stateHashRefs: [],
            limitations: [
                'Deterministic authority re-entry is checked from command declarations; no coordinator replay ABI record is created by this analysis trace.'
            ]
        },
        edgeAttempts,
        commandPath,
        cutChanges,
        witnessReferences,
        compositionContract,
        initialObligationIds: options.initialObligationIds ?? [],
        obligationHistory: derived.obligationHistory,
        reentryInstructions,
        excludedClaims
    });
}

function commandDeclaration(edge: WorldTransitionEdge): {
    actor: SimulationActor;
    command: SimulationCommand;
    expectedTurn: number;
} | null {
    const declaration = edge.commandOrDeclaration;
    if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) return null;
    if ((declaration.actor !== 'player' && declaration.actor !== 'loomkeeper') ||
        typeof declaration.expectedTurn !== 'number' ||
        !Number.isSafeInteger(declaration.expectedTurn) ||
        !declaration.command || typeof declaration.command !== 'object' ||
        Array.isArray(declaration.command)) {
        return null;
    }
    return {
        actor: declaration.actor,
        command: declaration.command as unknown as SimulationCommand,
        expectedTurn: declaration.expectedTurn
    };
}

export function reenterSimulationVoyage(
    callerInitialState: SimulationState,
    voyage: VoyageTraceV4
): SimulationVoyageReentryResult {
    const trace = VoyageTraceV4Schema.parse(voyage);
    const callerBefore = canonicalSimulationJson(callerInitialState);
    let state = cloneSimulation(callerInitialState);
    const issues: string[] = [];
    const reproducedEdgeDigests: string[] = [];

    if (sha256Text(canonicalSimulationJson(state)) !== trace.initialCarrier.stateDigest) {
        issues.push('Caller initial state does not match the voyage initial carrier digest.');
    }
    for (const attempt of trace.edgeAttempts) {
        if (attempt.outcome === 'incompatible') continue;
        const declaration = commandDeclaration(attempt.edge);
        if (!declaration) {
            issues.push(`Edge ${attempt.edge.edgeId} is not a re-enterable simulation command declaration.`);
            break;
        }
        if (sha256Text(canonicalSimulationJson(state)) !== attempt.edge.sourceCarrier.stateDigest) {
            issues.push(`Re-entry source state mismatch before edge ${attempt.edge.edgeId}.`);
            break;
        }
        const reproduced = adaptSimulationCommand(
            state,
            declaration.actor,
            declaration.command,
            declaration.expectedTurn,
            attempt.edge.sourceCut
        );
        const reproducedDigest = sha256Digest(reproduced.edge);
        reproducedEdgeDigests.push(reproducedDigest);
        if (reproducedDigest !== sha256Digest(attempt.edge)) {
            issues.push(`Re-entry edge digest mismatch at ${attempt.edge.edgeId}.`);
            break;
        }
        state = reproduced.transition.state;
    }
    if (sha256Text(canonicalSimulationJson(state)) !== trace.finalCarrier.stateDigest) {
        issues.push('Re-entered final state does not match the voyage final carrier digest.');
    }
    if (canonicalSimulationJson(callerInitialState) !== callerBefore) {
        issues.push('Re-entry mutated the caller-owned initial state.');
    }

    return Object.freeze({
        matched: issues.length === 0,
        finalState: state,
        reproducedEdgeDigests,
        issues: unique(issues)
    });
}
