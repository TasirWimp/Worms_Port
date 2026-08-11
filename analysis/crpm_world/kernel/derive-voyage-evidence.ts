import { canonicalJson, compareCanonicalText } from '../canonical';
import type {
    CompositionContract,
    CompositionWitnessV2,
    ResidualLedger as Residual,
    WorldCarrierReference as Carrier,
    WorldTransitionEdgeV2 as Edge
} from '../types';
import { assessEdgeCompatibility, assessInitialEdgeCompatibility } from './compose-edges';

export type DerivableVoyageAttempt = Readonly<{
    outcome: 'accepted' | 'rejected' | 'incompatible';
    edge: Edge;
    compositionWitness: CompositionWitnessV2;
}>;

export type DerivedVoyageEvidence = Readonly<{
    transitionEdges: readonly Edge[];
    accumulatedResidual: Residual;
    obligationHistory: Readonly<{
        opened: readonly string[];
        carried: readonly string[];
        discharged: readonly string[];
        expired: readonly string[];
        unresolved: readonly string[];
    }>;
    finalCarrier: Carrier;
    compatibility: Readonly<{
        compatible: boolean;
        checkedEdgeIds: readonly string[];
        issues: readonly string[];
    }>;
    attemptValidations: readonly Readonly<{
        valid: boolean;
        expectedOutcome: 'accepted' | 'rejected' | 'incompatible';
        expectedWitness: CompositionWitnessV2;
        issues: readonly string[];
    }>[];
}>;

function appendUnique<T>(target: T[], values: readonly T[]): void {
    for (const value of values) {
        if (!target.some((candidate) => canonicalJson(candidate) === canonicalJson(value))) target.push(value);
    }
}

function responseAccepted(edge: Edge): boolean | undefined {
    const response = edge.response;
    if (!response || typeof response !== 'object' || Array.isArray(response)) return undefined;
    return typeof response.accepted === 'boolean' ? response.accepted : undefined;
}

function emptyResidual(): Residual {
    return {
        schemaVersion: 2,
        positionDeltas: [],
        resourceDeltas: [],
        healthDeltas: [],
        statusDeltas: [],
        terrainDeltas: [],
        authorityDeltas: [],
        expiredRights: [],
        openedObligations: [],
        carriedObligations: [],
        dischargedObligations: [],
        unresolvedObligations: [],
        excludedUnmodelledResidue: []
    };
}

/** Canonical edge-derived voyage summaries; no caller-authored summary is trusted. */
export function deriveVoyageEvidence(
    attempts: readonly DerivableVoyageAttempt[],
    initialCarrier: Carrier,
    initialObligationIds: readonly string[] = [],
    compositionContract: CompositionContract
): DerivedVoyageEvidence {
    const transitionEdges: Edge[] = [];
    const aggregate = emptyResidual() as {
        -readonly [K in keyof Residual]: Residual[K] extends readonly (infer T)[] ? T[] : Residual[K]
    };
    const live = new Set<string>(initialObligationIds);
    const historyOpened = [...initialObligationIds];
    const issues: string[] = [];
    const attemptValidations: DerivedVoyageEvidence['attemptValidations'][number][] = [];
    let previous: Edge | undefined;

    for (const attempt of attempts) {
        const expectedWitness = previous
            ? assessEdgeCompatibility(previous, attempt.edge, compositionContract).witness
            : assessInitialEdgeCompatibility(initialCarrier, attempt.edge, compositionContract);
        const expectedOutcome = expectedWitness.compatible
            ? responseAccepted(attempt.edge) === false ? 'rejected' : 'accepted'
            : 'incompatible';
        const validationIssues: string[] = [];
        if (attempt.outcome !== expectedOutcome) {
            validationIssues.push(`Attempt ${attempt.edge.edgeId} declares ${attempt.outcome} but recomputes as ${expectedOutcome}.`);
        }
        if (canonicalJson(attempt.compositionWitness) !== canonicalJson(expectedWitness)) {
            validationIssues.push(`Attempt ${attempt.edge.edgeId} composition witness does not match the edge digests and declared composition contract.`);
        }
        attemptValidations.push({
            valid: validationIssues.length === 0,
            expectedOutcome,
            expectedWitness,
            issues: validationIssues
        });
        appendUnique(issues, validationIssues);
        if (!expectedWitness.compatible) {
            appendUnique(issues, expectedWitness.issues.map((item) => item.message));
            continue;
        }
        const edge = attempt.edge;
        transitionEdges.push(edge);
        previous = edge;
        const ledger = edge.residual;
        for (const field of [
            'positionDeltas', 'resourceDeltas', 'healthDeltas', 'statusDeltas',
            'terrainDeltas', 'authorityDeltas'
        ] as const) {
            aggregate[field].push(...ledger[field] as never[]);
        }
        for (const field of [
            'expiredRights', 'openedObligations', 'carriedObligations',
            'dischargedObligations', 'excludedUnmodelledResidue'
        ] as const) {
            appendUnique(aggregate[field] as string[], ledger[field]);
        }

        const discharged = new Set(ledger.dischargedObligations);
        const expired = new Set(ledger.expiredRights);
        for (const obligationId of discharged) {
            if (expired.has(obligationId)) {
                appendUnique(issues, [`Obligation ${obligationId} cannot discharge and expire on the same edge.`]);
            }
        }
        for (const obligationId of live) {
            const closed = discharged.has(obligationId) || expired.has(obligationId);
            if (!closed && !ledger.carriedObligations.includes(obligationId)) {
                appendUnique(issues, [`Obligation ${obligationId} was neither carried nor closed by edge ${edge.edgeId}.`]);
            }
        }
        for (const obligationId of ledger.openedObligations) {
            if (live.has(obligationId)) appendUnique(issues, [`Obligation ${obligationId} opened more than once.`]);
            live.add(obligationId);
            appendUnique(historyOpened, [obligationId]);
        }
        for (const obligationId of ledger.carriedObligations) {
            if (!live.has(obligationId)) appendUnique(issues, [`Obligation ${obligationId} was carried before opening.`]);
        }
        for (const obligationId of ledger.dischargedObligations) {
            if (!live.has(obligationId)) appendUnique(issues, [`Obligation ${obligationId} discharged before opening.`]);
            live.delete(obligationId);
        }
        for (const obligationId of ledger.expiredRights) {
            if (!live.has(obligationId)) appendUnique(issues, [`Obligation ${obligationId} expired before opening.`]);
            live.delete(obligationId);
        }
        const expectedUnresolved = [...live].sort(compareCanonicalText);
        const declaredUnresolved = [...ledger.unresolvedObligations].sort(compareCanonicalText);
        if (canonicalJson(expectedUnresolved) !== canonicalJson(declaredUnresolved)) {
            appendUnique(issues, [`Edge ${edge.edgeId} unresolved obligations do not equal its derived live set.`]);
        }
    }

    aggregate.unresolvedObligations.push(...[...live].sort(compareCanonicalText));
    const finalCarrier = transitionEdges.length > 0
        ? transitionEdges[transitionEdges.length - 1].targetCarrier
        : initialCarrier;
    return {
        transitionEdges,
        accumulatedResidual: aggregate,
        obligationHistory: {
            opened: historyOpened,
            carried: aggregate.carriedObligations,
            discharged: aggregate.dischargedObligations,
            expired: aggregate.expiredRights,
            unresolved: aggregate.unresolvedObligations
        },
        finalCarrier,
        compatibility: {
            compatible: issues.length === 0,
            checkedEdgeIds: transitionEdges.map((edge) => edge.edgeId),
            issues
        },
        attemptValidations
    };
}

/** Aggregate trace residue without inventing propagation across voyage boundaries. */
export function deriveWorldDesignResidual(traces: readonly Readonly<{ accumulatedResidual: Residual }>[]): Residual {
    const aggregate = emptyResidual() as {
        -readonly [K in keyof Residual]: Residual[K] extends readonly (infer T)[] ? T[] : Residual[K]
    };
    for (const trace of traces) {
        const ledger = trace.accumulatedResidual;
        for (const field of [
            'positionDeltas', 'resourceDeltas', 'healthDeltas', 'statusDeltas',
            'terrainDeltas', 'authorityDeltas'
        ] as const) {
            aggregate[field].push(...ledger[field] as never[]);
        }
        for (const field of [
            'expiredRights', 'openedObligations', 'carriedObligations',
            'dischargedObligations', 'unresolvedObligations', 'excludedUnmodelledResidue'
        ] as const) {
            appendUnique(aggregate[field] as string[], ledger[field]);
        }
    }
    return aggregate;
}
