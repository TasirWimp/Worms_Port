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
        const simultaneousClosure = ledger.dischargedObligations.filter((obligationId) =>
            ledger.expiredRights.includes(obligationId)
        );
        for (const obligationId of simultaneousClosure) {
            propagationIssues.push({
                obligationId,
                message: `Obligation ${obligationId} cannot discharge and expire in residual ledger ${index}.`
            });
        }
        if (index > 0) {
            for (const obligationId of priorOutstanding) {
                if (ledger.dischargedObligations.includes(obligationId) || ledger.expiredRights.includes(obligationId)) continue;
                if (ledger.carriedObligations.includes(obligationId) &&
                    ledger.unresolvedObligations.includes(obligationId)) {
                    if (!carriedObligations.includes(obligationId)) carriedObligations.push(obligationId);
                    continue;
                }
                propagationIssues.push({
                    obligationId,
                    message: `Obligation ${obligationId} was neither carried nor explicitly discharged/expired by residual ledger ${index}.`
                });
            }
        }

        for (const obligationId of [...ledger.dischargedObligations, ...ledger.expiredRights]) {
            if (!outstanding.has(obligationId)) {
                propagationIssues.push({
                    obligationId,
                    message: `Obligation ${obligationId} closed before opening in residual ledger ${index}.`
                });
            }
        }
        for (const obligationId of ledger.carriedObligations) {
            if (!outstanding.has(obligationId) && !ledger.openedObligations.includes(obligationId)) {
                propagationIssues.push({
                    obligationId,
                    message: `Obligation ${obligationId} was carried before opening or after closure in residual ledger ${index}.`
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

        for (const obligationId of ledger.openedObligations) outstanding.add(obligationId);
        for (const obligationId of ledger.carriedObligations) outstanding.add(obligationId);
        for (const obligationId of ledger.unresolvedObligations) outstanding.add(obligationId);
        for (const obligationId of ledger.dischargedObligations) outstanding.delete(obligationId);
        for (const obligationId of ledger.expiredRights) outstanding.delete(obligationId);
    }

    aggregate.unresolvedObligations.push(...[...outstanding].sort());
    return Object.freeze({
        ledger: ResidualLedgerSchema.parse(aggregate),
        carriedObligations: carriedObligations.sort(),
        propagationIssues
    });
}
