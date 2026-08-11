import { ResidualLedgerSchema } from '../schemas';
import type { ResidualLedger } from '../types';

export type ResidualPropagationIssue = Readonly<{
    obligationId: string;
    message: string;
}>;

export type ResidualMergeResult = Readonly<{
    ledger: ResidualLedger;
    carriedObligations: string[];
    propagationIssues: ResidualPropagationIssue[];
}>;

function appendUnique(target: string[], values: readonly string[]): void {
    for (const value of values) {
        if (!target.includes(value)) target.push(value);
    }
}

export function emptyResidualLedger(): ResidualLedger {
    return ResidualLedgerSchema.parse({
        schemaVersion: 1,
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
    });
}

/** Accumulates every residual entry and checks obligation transfer edge by edge. */
export function mergeResidualLedgers(ledgers: readonly ResidualLedger[]): ResidualMergeResult {
    const parsed = ledgers.map((ledger) => ResidualLedgerSchema.parse(ledger));
    const aggregate = emptyResidualLedger();
    const outstanding = new Set<string>();
    const carriedObligations: string[] = [];
    const propagationIssues: ResidualPropagationIssue[] = [];

    for (let index = 0; index < parsed.length; index += 1) {
        const ledger = parsed[index];
        const priorOutstanding = [...outstanding];
        if (index > 0) {
            for (const obligationId of priorOutstanding) {
                if (ledger.dischargedObligations.includes(obligationId)) continue;
                if (ledger.carriedObligations.includes(obligationId) &&
                    ledger.unresolvedObligations.includes(obligationId)) {
                    if (!carriedObligations.includes(obligationId)) carriedObligations.push(obligationId);
                    continue;
                }
                propagationIssues.push({
                    obligationId,
                    message: `Obligation ${obligationId} was neither carried nor explicitly discharged by residual ledger ${index}.`
                });
            }
        }

        aggregate.positionDeltas.push(...ledger.positionDeltas);
        aggregate.resourceDeltas.push(...ledger.resourceDeltas);
        aggregate.healthDeltas.push(...ledger.healthDeltas);
        aggregate.statusDeltas.push(...ledger.statusDeltas);
        aggregate.terrainDeltas.push(...ledger.terrainDeltas);
        aggregate.authorityDeltas.push(...ledger.authorityDeltas);
        appendUnique(aggregate.expiredRights, ledger.expiredRights);
        appendUnique(aggregate.openedObligations, ledger.openedObligations);
        appendUnique(aggregate.carriedObligations, ledger.carriedObligations);
        appendUnique(aggregate.dischargedObligations, ledger.dischargedObligations);
        appendUnique(aggregate.excludedUnmodelledResidue, ledger.excludedUnmodelledResidue);

        for (const obligationId of ledger.dischargedObligations) outstanding.delete(obligationId);
        for (const obligationId of ledger.openedObligations) outstanding.add(obligationId);
        for (const obligationId of ledger.carriedObligations) outstanding.add(obligationId);
        for (const obligationId of ledger.unresolvedObligations) outstanding.add(obligationId);
        for (const obligationId of ledger.dischargedObligations) outstanding.delete(obligationId);
    }

    aggregate.unresolvedObligations.push(...[...outstanding].sort());
    return Object.freeze({
        ledger: ResidualLedgerSchema.parse(aggregate),
        carriedObligations: carriedObligations.sort(),
        propagationIssues
    });
}
