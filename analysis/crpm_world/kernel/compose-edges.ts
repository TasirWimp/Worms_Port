import { canonicalJson, sha256Digest } from '../canonical';
import {
    CompositionWitnessSchema,
    EdgeCompositionResultSchema,
    WorldTransitionEdgeSchema
} from '../schemas';
import type {
    CompositionIssue,
    CompositionWitness,
    EdgeCompositionResult,
    WorldCarrierReference,
    WorldTransitionEdge,
    WorldTransitionEdgeV2
} from '../types';
import { mergeResidualLedgers } from './residual-ledger';

export type CompositionPolicy = Readonly<{
    externallySuppliedInputPorts?: readonly string[];
    forbiddenPortIds?: readonly string[];
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
    ])].sort();
}

function issue(code: CompositionIssue['code'], message: string, details: unknown): CompositionIssue {
    return { code, message, details: details as CompositionIssue['details'] };
}

function cutsCompatible(first: WorldTransitionEdge, second: WorldTransitionEdge): boolean {
    return canonicalJson(first.targetCut) === canonicalJson(second.sourceCut);
}

export function makeCompositionWitness(
    firstEdgeId: string,
    secondEdgeId: string,
    issues: readonly CompositionIssue[],
    requiredInputPorts: readonly string[] = [],
    availableInputPorts: readonly string[] = [],
    forbiddenPortsCrossed: readonly string[] = []
): CompositionWitness {
    const compatible = issues.length === 0;
    const identity = {
        firstEdgeId,
        secondEdgeId,
        compatible,
        issues,
        requiredInputPorts,
        availableInputPorts,
        forbiddenPortsCrossed
    };
    return CompositionWitnessSchema.parse({
        schemaVersion: 1,
        witnessId: `composition-${sha256Digest(identity).slice(0, 32)}`,
        witnessVersion: 1,
        firstEdgeId,
        secondEdgeId,
        compatible,
        checkedConditions: [...CHECKED_CONDITIONS],
        requiredInputPorts: [...requiredInputPorts].sort(),
        availableInputPorts: [...availableInputPorts].sort(),
        forbiddenPortsCrossed: [...forbiddenPortsCrossed].sort(),
        issues
    });
}

export function composeEdges(
    firstInput: WorldTransitionEdge,
    secondInput: WorldTransitionEdge,
    policy: CompositionPolicy = {}
): EdgeCompositionResult {
    const first = WorldTransitionEdgeSchema.parse(firstInput);
    const second = WorldTransitionEdgeSchema.parse(secondInput);
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

    const externalPorts = [...new Set(policy.externallySuppliedInputPorts ?? [])];
    let requiredInputPorts: string[] = [];
    let availableInputPorts: string[] = [];
    if (first.schemaVersion === 2 && second.schemaVersion === 2) {
        requiredInputPorts = [...new Set([
            ...second.portBindings.contextPorts,
            ...second.portBindings.actionPorts
        ])].sort();
        availableInputPorts = [...new Set([
            ...first.portBindings.contextPorts,
            ...first.portBindings.responsePorts,
            ...first.portBindings.evidencePorts,
            ...first.portBindings.supportPorts,
            ...first.portBindings.returnPorts,
            ...externalPorts
        ])].sort();
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

    const forbidden = [...new Set(policy.forbiddenPortIds ?? [])].sort();
    const crossed = first.schemaVersion === 2 && second.schemaVersion === 2
        ? [...new Set([...allBoundPorts(first), ...allBoundPorts(second)])]
            .filter((port) => forbidden.includes(port))
            .sort()
        : [];
    if (crossed.length > 0) {
        issues.push(issue('forbidden-port-crossing', 'Composition crosses one or more forbidden ports.', { forbiddenPorts: crossed }));
    }

    const residual = mergeResidualLedgers([first.residual, second.residual]);
    for (const propagationIssue of residual.propagationIssues) {
        issues.push(issue('obligation-not-propagated', propagationIssue.message, {
            obligationId: propagationIssue.obligationId
        }));
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
        first.edgeId,
        second.edgeId,
        issues,
        requiredInputPorts,
        availableInputPorts,
        crossed
    );
    return EdgeCompositionResultSchema.parse({
        schemaVersion: 1,
        compatible: issues.length === 0,
        partialValidEdges: issues.length === 0 ? [first, second] : [first],
        attemptedEdge: second,
        accumulatedResidual: residual.ledger,
        carriedObligations: residual.carriedObligations,
        unresolvedObligations: residual.ledger.unresolvedObligations,
        witness
    });
}
