import { canonicalJson, compareCanonicalText } from '../canonical';

type Carrier = Readonly<{
    schemaVersion: number;
    profileVersion: number;
    carrierKind: string;
    adapter: Readonly<{ id: string; version: number }>;
    rulesetOrConfigId: string;
    baselineDigest: string;
    stateDigest: string;
    revisionOrStep: number;
    sourceReference?: string;
}>;

type Residual = Readonly<{
    schemaVersion: number;
    positionDeltas: readonly unknown[];
    resourceDeltas: readonly unknown[];
    healthDeltas: readonly unknown[];
    statusDeltas: readonly unknown[];
    terrainDeltas: readonly unknown[];
    authorityDeltas: readonly unknown[];
    expiredRights: readonly string[];
    openedObligations: readonly string[];
    carriedObligations: readonly string[];
    dischargedObligations: readonly string[];
    unresolvedObligations: readonly string[];
    excludedUnmodelledResidue: readonly string[];
}>;

type Edge = Readonly<{
    edgeId: string;
    sourceCarrier: Carrier;
    targetCarrier: Carrier;
    sourceCut: unknown;
    targetCut: unknown;
    residual: Residual;
}>;

export type DerivableVoyageAttempt = Readonly<{
    outcome: 'accepted' | 'rejected' | 'incompatible';
    edge: Edge;
    compositionWitness?: Readonly<{
        compatible: boolean;
        issues: readonly Readonly<{ message: string }>[];
    }> | null;
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
}>;

function appendUnique<T>(target: T[], values: readonly T[]): void {
    for (const value of values) {
        if (!target.some((candidate) => canonicalJson(candidate) === canonicalJson(value))) target.push(value);
    }
}

function normalizedSourceReference(value: string | undefined): string | undefined {
    return value
        ?.replace(/#(?:pre|post)$/, '')
        .replace(/:(?:pre|post):[0-9a-f]{64}$/, '');
}

function carrierMatches(left: Carrier, right: Carrier): boolean {
    return left.stateDigest === right.stateDigest &&
        left.baselineDigest === right.baselineDigest &&
        left.schemaVersion === right.schemaVersion &&
        left.profileVersion === right.profileVersion &&
        left.revisionOrStep === right.revisionOrStep &&
        left.carrierKind === right.carrierKind &&
        left.rulesetOrConfigId === right.rulesetOrConfigId &&
        left.adapter.id === right.adapter.id &&
        left.adapter.version === right.adapter.version &&
        normalizedSourceReference(left.sourceReference) === normalizedSourceReference(right.sourceReference);
}

function emptyResidual(schemaVersion: number): Residual {
    return {
        schemaVersion,
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
    initialObligationIds: readonly string[] = []
): DerivedVoyageEvidence {
    const transitionEdges = attempts.filter((attempt) => attempt.outcome !== 'incompatible').map((attempt) => attempt.edge);
    const schemaVersion = transitionEdges[0]?.residual.schemaVersion ?? 2;
    const aggregate = emptyResidual(schemaVersion) as {
        -readonly [K in keyof Residual]: Residual[K] extends readonly (infer T)[] ? T[] : Residual[K]
    };
    const live = new Set<string>(initialObligationIds);
    const historyOpened = [...initialObligationIds];
    const issues: string[] = [];
    let previous: Edge | undefined;

    for (const attempt of attempts) {
        if (attempt.outcome === 'incompatible') {
            const witnessIssues = attempt.compositionWitness?.issues.map((issue) => issue.message) ?? [];
            appendUnique(issues, witnessIssues.length > 0 ? witnessIssues : [`Edge ${attempt.edge.edgeId} is incompatible.`]);
            continue;
        }
        const edge = attempt.edge;
        if (!previous) {
            if (!carrierMatches(initialCarrier, edge.sourceCarrier)) {
                appendUnique(issues, [`Initial carrier mismatch before edge ${edge.edgeId}.`]);
            }
        } else {
            if (!carrierMatches(previous.targetCarrier, edge.sourceCarrier)) {
                appendUnique(issues, [`Carrier mismatch before edge ${edge.edgeId}.`]);
            }
            if (canonicalJson(previous.targetCut) !== canonicalJson(edge.sourceCut)) {
                appendUnique(issues, [`Cut mismatch before edge ${edge.edgeId}.`]);
            }
        }
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
        }
    };
}

/** Aggregate trace residue without inventing propagation across voyage boundaries. */
export function deriveWorldDesignResidual(traces: readonly Readonly<{ accumulatedResidual: Residual }>[]): Residual {
    const schemaVersion = traces[0]?.accumulatedResidual.schemaVersion ?? 2;
    const aggregate = emptyResidual(schemaVersion) as {
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
