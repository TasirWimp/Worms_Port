import { canonicalJson, compareCanonicalText, sha256Digest } from '../canonical';
import type {
    CompositionIssue,
    CompositionContract,
    CompositionWitnessV2,
    EdgeCompositionResult,
    WorldCarrierReference,
    WorldTransitionEdge,
    WorldTransitionEdgeV2
} from '../types';
import { mergeResidualLedgers } from './residual-ledger';

export type CompositionPolicy = Readonly<{
    externallySuppliedInputPorts?: readonly string[];
    forbiddenPortIds?: readonly string[];
    cutBridgePolicy?: 'explicit_bridge_edge_only';
}>;

const CHECKED_CONDITIONS = [
    'carrier-state',
    'carrier-reference',
    'revision-order',
    'turn-order',
    'ruleset-identity',
    'adapter-identity',
    'cut-contract',
    'port-satisfaction',
    'forbidden-port-boundary',
    'obligation-propagation',
    'residual-preservation'
] as const;

function sourceReferenceBase(sourceReference: string | undefined): string | undefined {
    return sourceReference
        ?.replace(/#(?:pre|post)$/, '')
        .replace(/:(?:pre|post):[0-9a-f]{64}$/, '');
}

export function carrierContinuationMatches(
    target: WorldCarrierReference,
    source: WorldCarrierReference
): boolean {
    return target.stateDigest === source.stateDigest &&
        target.baselineDigest === source.baselineDigest &&
        target.schemaVersion === source.schemaVersion &&
        target.profileVersion === source.profileVersion &&
        target.revisionOrStep === source.revisionOrStep &&
        target.carrierKind === source.carrierKind &&
        target.rulesetOrConfigId === source.rulesetOrConfigId &&
        target.adapter.id === source.adapter.id &&
        target.adapter.version === source.adapter.version &&
        sourceReferenceBase(target.sourceReference) === sourceReferenceBase(source.sourceReference);
}

function readExpectedTurn(edge: WorldTransitionEdge): number | undefined {
    const declaration = edge.commandOrDeclaration;
    if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) return undefined;
    const value = declaration.expectedTurn;
    return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
}

function edgeAccepted(edge: WorldTransitionEdge): boolean | undefined {
    const response = edge.response;
    if (!response || typeof response !== 'object' || Array.isArray(response)) return undefined;
    return typeof response.accepted === 'boolean' ? response.accepted : undefined;
}

function allBoundPorts(edge: WorldTransitionEdgeV2): string[] {
    return [...new Set([
        ...edge.portBindings.contextPorts,
        ...edge.portBindings.actionPorts,
        ...edge.portBindings.responsePorts,
        ...edge.portBindings.evidencePorts,
        ...edge.portBindings.supportPorts,
        ...edge.portBindings.returnPorts
    ])].sort(compareCanonicalText);
}

function issue(code: CompositionIssue['code'], message: string, details: unknown): CompositionIssue {
    return { code, message, details: details as CompositionIssue['details'] };
}

function cutsCompatible(first: WorldTransitionEdge, second: WorldTransitionEdge): boolean {
    return canonicalJson(first.targetCut) === canonicalJson(second.sourceCut);
}

export function normalizeCompositionContract(policy: CompositionPolicy = {}): CompositionContract {
    return Object.freeze({
        schemaVersion: 1,
        contractId: 'crpm-world-edge-composition',
        contractVersion: 1,
        externallySuppliedInputPorts: [...new Set(policy.externallySuppliedInputPorts ?? [])].sort(compareCanonicalText),
        forbiddenPortIds: [...new Set(policy.forbiddenPortIds ?? [])].sort(compareCanonicalText),
        cutBridgePolicy: policy.cutBridgePolicy ?? 'explicit_bridge_edge_only'
    });
}

export function makeCompositionWitness(
    first: WorldTransitionEdge,
    second: WorldTransitionEdge,
    issues: readonly CompositionIssue[],
    compositionContract: CompositionContract,
    requiredInputPorts: readonly string[] = [],
    availableInputPorts: readonly string[] = [],
    forbiddenPortsCrossed: readonly string[] = []
): CompositionWitnessV2 {
    const compatible = issues.length === 0;
    const identity = {
        firstEdgeId: first.edgeId,
        secondEdgeId: second.edgeId,
        firstEdgeDigest: sha256Digest(first),
        secondEdgeDigest: sha256Digest(second),
        compositionContract,
        compatible,
        issues,
        requiredInputPorts,
        availableInputPorts,
        forbiddenPortsCrossed
    };
    return {
        schemaVersion: 2,
        witnessId: `composition-${sha256Digest(identity).slice(0, 32)}`,
        witnessVersion: 2,
        firstEdgeId: first.edgeId,
        secondEdgeId: second.edgeId,
        firstEdgeDigest: sha256Digest(first),
        secondEdgeDigest: sha256Digest(second),
        compositionContract,
        compatible,
        checkedConditions: [...CHECKED_CONDITIONS],
        requiredInputPorts: [...requiredInputPorts].sort(compareCanonicalText),
        availableInputPorts: [...availableInputPorts].sort(compareCanonicalText),
        forbiddenPortsCrossed: [...forbiddenPortsCrossed].sort(compareCanonicalText),
        issues: [...issues]
    };
}

export function assessEdgeCompatibility(
    firstInput: WorldTransitionEdge,
    secondInput: WorldTransitionEdge,
    policy: CompositionPolicy = {}
): Readonly<{
    first: WorldTransitionEdge;
    second: WorldTransitionEdge;
    compositionContract: CompositionContract;
    issues: readonly CompositionIssue[];
    requiredInputPorts: readonly string[];
    availableInputPorts: readonly string[];
    forbiddenPortsCrossed: readonly string[];
    residual: ReturnType<typeof mergeResidualLedgers>;
    witness: CompositionWitnessV2;
}> {
    const first = firstInput;
    const second = secondInput;
    const compositionContract = normalizeCompositionContract(policy);
    const issues: CompositionIssue[] = [];

    if (first.targetCarrier.stateDigest !== second.sourceCarrier.stateDigest) {
        issues.push(issue('carrier-state-mismatch', 'First target state digest does not match second source state digest.', {
            firstTargetStateDigest: first.targetCarrier.stateDigest,
            secondSourceStateDigest: second.sourceCarrier.stateDigest
        }));
    }
    if (!carrierContinuationMatches(first.targetCarrier, second.sourceCarrier) &&
        first.targetCarrier.stateDigest === second.sourceCarrier.stateDigest) {
        issues.push(issue('carrier-reference-mismatch', 'Matching state digests do not retain compatible carrier support references.', {
            firstTargetCarrier: first.targetCarrier,
            secondSourceCarrier: second.sourceCarrier
        }));
    }
    if (first.targetCarrier.revisionOrStep !== second.sourceCarrier.revisionOrStep ||
        second.fixedFrame.expectedRevisionOrStep !== second.sourceCarrier.revisionOrStep ||
        first.targetCarrier.revisionOrStep < first.sourceCarrier.revisionOrStep ||
        second.targetCarrier.revisionOrStep < second.sourceCarrier.revisionOrStep) {
        issues.push(issue('revision-order-mismatch', 'Carrier revision/step ordering is not contiguous and nondecreasing.', {
            firstSource: first.sourceCarrier.revisionOrStep,
            firstTarget: first.targetCarrier.revisionOrStep,
            secondSource: second.sourceCarrier.revisionOrStep,
            secondExpected: second.fixedFrame.expectedRevisionOrStep,
            secondTarget: second.targetCarrier.revisionOrStep
        }));
    }
    const firstTurn = readExpectedTurn(first);
    const secondTurn = readExpectedTurn(second);
    if (firstTurn !== undefined && secondTurn !== undefined && secondTurn < firstTurn) {
        issues.push(issue('turn-order-mismatch', 'Declared expected turns must not move backward across composed command edges.', {
            firstExpectedTurn: firstTurn,
            secondExpectedTurn: secondTurn
        }));
    }
    if (first.targetCarrier.rulesetOrConfigId !== second.sourceCarrier.rulesetOrConfigId ||
        first.fixedFrame.baselineOrConfigId !== second.fixedFrame.baselineOrConfigId) {
        issues.push(issue('ruleset-mismatch', 'Ruleset/configuration identity changed across the composition boundary.', {
            firstRuleset: first.targetCarrier.rulesetOrConfigId,
            secondRuleset: second.sourceCarrier.rulesetOrConfigId
        }));
    }
    if (first.targetCarrier.adapter.id !== second.sourceCarrier.adapter.id ||
        first.targetCarrier.adapter.version !== second.sourceCarrier.adapter.version ||
        first.fixedFrame.adapter.id !== second.fixedFrame.adapter.id ||
        first.fixedFrame.adapter.version !== second.fixedFrame.adapter.version) {
        issues.push(issue('adapter-mismatch', 'Adapter identity changed across the composition boundary.', {
            firstAdapter: first.targetCarrier.adapter,
            secondAdapter: second.sourceCarrier.adapter
        }));
    }
    if (!cutsCompatible(first, second)) {
        issues.push(issue('cut-mismatch', 'Target/source cuts are neither equal nor explicitly compatible.', {
            firstTargetCut: first.targetCut,
            secondSourceCut: second.sourceCut
        }));
    }

    const externalPorts = [...compositionContract.externallySuppliedInputPorts];
    let requiredInputPorts: string[] = [];
    let availableInputPorts: string[] = [];
    if (first.schemaVersion === 2 && second.schemaVersion === 2) {
        requiredInputPorts = [...new Set([
            ...second.portBindings.contextPorts,
            ...second.portBindings.actionPorts
        ])].sort(compareCanonicalText);
        availableInputPorts = [...new Set([
            ...first.portBindings.contextPorts,
            ...first.portBindings.responsePorts,
            ...first.portBindings.evidencePorts,
            ...first.portBindings.supportPorts,
            ...first.portBindings.returnPorts,
            ...externalPorts
        ])].sort(compareCanonicalText);
        const missing = requiredInputPorts.filter((port) => !availableInputPorts.includes(port));
        if (missing.length > 0) {
            issues.push(issue('missing-input-port', 'Prior outputs/carried context and explicit external inputs do not satisfy the next edge.', { missingPorts: missing }));
        }
    } else {
        issues.push(issue('missing-input-port', 'Edge composition requires explicit v2 port bindings on both edges.', {
            firstSchemaVersion: first.schemaVersion,
            secondSchemaVersion: second.schemaVersion
        }));
    }

    const forbidden = [...compositionContract.forbiddenPortIds];
    const crossed = first.schemaVersion === 2 && second.schemaVersion === 2
        ? [...new Set([...allBoundPorts(first), ...allBoundPorts(second)])]
            .filter((port) => forbidden.includes(port))
            .sort(compareCanonicalText)
        : [];
    if (crossed.length > 0) {
        issues.push(issue('forbidden-port-crossing', 'Composition crosses one or more forbidden ports.', { forbiddenPorts: crossed }));
    }

    const residual = mergeResidualLedgers([first.residual, second.residual]);
    const secondClosing = new Set([
        ...second.residual.dischargedObligations,
        ...second.residual.expiredRights
    ]);
    for (const obligationId of first.residual.unresolvedObligations) {
        if (secondClosing.has(obligationId)) continue;
        if (second.residual.carriedObligations.includes(obligationId) &&
            second.residual.unresolvedObligations.includes(obligationId)) continue;
        issues.push(issue(
            'obligation-not-propagated',
            `Obligation ${obligationId} was neither carried nor explicitly discharged/expired across the edge boundary.`,
            { obligationId }
        ));
    }

    const secondAccepted = edgeAccepted(second);
    if (secondAccepted === false && (
        second.sourceCarrier.stateDigest !== second.targetCarrier.stateDigest ||
        second.sourceCarrier.revisionOrStep !== second.targetCarrier.revisionOrStep
    )) {
        issues.push(issue('carrier-state-mismatch', 'A rejected edge attempt must retain its source carrier without mutation.', {
            sourceStateDigest: second.sourceCarrier.stateDigest,
            targetStateDigest: second.targetCarrier.stateDigest,
            sourceRevision: second.sourceCarrier.revisionOrStep,
            targetRevision: second.targetCarrier.revisionOrStep
        }));
    }

    const witness = makeCompositionWitness(
        first,
        second,
        issues,
        compositionContract,
        requiredInputPorts,
        availableInputPorts,
        crossed
    );
    return Object.freeze({
        first,
        second,
        compositionContract,
        issues,
        requiredInputPorts,
        availableInputPorts,
        forbiddenPortsCrossed: crossed,
        residual,
        witness
    });
}

export function assessInitialEdgeCompatibility(
    initialCarrier: WorldCarrierReference,
    edge: WorldTransitionEdge,
    policy: CompositionPolicy = {}
): CompositionWitnessV2 {
    const compositionContract = normalizeCompositionContract(policy);
    const issues: CompositionIssue[] = [];
    if (!carrierContinuationMatches(initialCarrier, edge.sourceCarrier)) {
        issues.push(issue(
            initialCarrier.stateDigest === edge.sourceCarrier.stateDigest
                ? 'carrier-reference-mismatch'
                : 'carrier-state-mismatch',
            'Voyage initial carrier does not match the first edge source carrier.',
            { initialCarrier, edgeSourceCarrier: edge.sourceCarrier }
        ));
    }
    if (edge.fixedFrame.expectedRevisionOrStep !== edge.sourceCarrier.revisionOrStep ||
        edge.targetCarrier.revisionOrStep < edge.sourceCarrier.revisionOrStep) {
        issues.push(issue('revision-order-mismatch', 'First-edge revision/step ordering does not match its fixed frame.', {
            sourceRevision: edge.sourceCarrier.revisionOrStep,
            expectedRevision: edge.fixedFrame.expectedRevisionOrStep,
            targetRevision: edge.targetCarrier.revisionOrStep
        }));
    }
    let requiredInputPorts: string[] = [];
    let availableInputPorts = [...compositionContract.externallySuppliedInputPorts];
    let crossed: string[] = [];
    if (edge.schemaVersion === 2) {
        requiredInputPorts = [...new Set(edge.portBindings.actionPorts)].sort(compareCanonicalText);
        availableInputPorts = [...new Set([
            ...edge.portBindings.contextPorts,
            ...compositionContract.externallySuppliedInputPorts
        ])].sort(compareCanonicalText);
        const missing = requiredInputPorts.filter((port) => !availableInputPorts.includes(port));
        if (missing.length > 0) {
            issues.push(issue('missing-input-port', 'Explicit external inputs do not satisfy the first edge action ports.', { missingPorts: missing }));
        }
        crossed = allBoundPorts(edge).filter((port) => compositionContract.forbiddenPortIds.includes(port));
        if (crossed.length > 0) {
            issues.push(issue('forbidden-port-crossing', 'First-edge admission crosses one or more forbidden ports.', { forbiddenPorts: crossed }));
        }
    } else {
        issues.push(issue('missing-input-port', 'Sealed voyage admission requires explicit v2 port bindings.', {
            edgeSchemaVersion: edge.schemaVersion
        }));
    }
    if (edgeAccepted(edge) === false && (
        edge.sourceCarrier.stateDigest !== edge.targetCarrier.stateDigest ||
        edge.sourceCarrier.revisionOrStep !== edge.targetCarrier.revisionOrStep
    )) {
        issues.push(issue('carrier-state-mismatch', 'A rejected first edge must retain its source carrier without mutation.', {
            sourceStateDigest: edge.sourceCarrier.stateDigest,
            targetStateDigest: edge.targetCarrier.stateDigest,
            sourceRevision: edge.sourceCarrier.revisionOrStep,
            targetRevision: edge.targetCarrier.revisionOrStep
        }));
    }
    return makeCompositionWitness(
        edge,
        edge,
        issues,
        compositionContract,
        requiredInputPorts,
        availableInputPorts,
        crossed
    );
}

export function composeEdges(
    firstInput: WorldTransitionEdge,
    secondInput: WorldTransitionEdge,
    policy: CompositionPolicy = {}
): EdgeCompositionResult {
    const assessed = assessEdgeCompatibility(firstInput, secondInput, policy);
    return {
        schemaVersion: 1,
        compatible: assessed.issues.length === 0,
        partialValidEdges: assessed.issues.length === 0 ? [assessed.first, assessed.second] : [assessed.first],
        attemptedEdge: assessed.second,
        accumulatedResidual: assessed.residual.ledger,
        carriedObligations: assessed.residual.carriedObligations,
        unresolvedObligations: assessed.residual.ledger.unresolvedObligations,
        witness: assessed.witness
    } as EdgeCompositionResult;
}
