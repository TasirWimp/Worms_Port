import type { StrategicTurnRecordV10R8 } from '../../../shared/strategic-voyage-v10-r8';

export type StrategicShadowSummaryV10R8 = Readonly<{
    observedTurns: number;
    selectedProposals: number;
    abstentions: number;
    invalidOrUnavailable: number;
    deterministicSelections: number;
    p50TotalMs: number;
    p95TotalMs: number;
    totalTokens: number;
    estimatedCostUsdMicros: number;
}>;

type ShadowLogger = (line: string) => void;

/** Aggregates only bounded operational facts; prompts, reasons and identities never enter logs. */
export class StrategicShadowTelemetryV10R8 {
    readonly #totals: number[] = [];
    #selected = 0;
    #abstained = 0;
    #invalidOrUnavailable = 0;
    #deterministicSelections = 0;
    #tokens = 0;
    #costMicros = 0;

    public constructor(private readonly logger: ShadowLogger = line => console.log(line)) {}

    public observe(record: StrategicTurnRecordV10R8): void {
        if (record.providerMode === 'deterministic' || record.status !== 'pending') return;
        this.#totals.push(record.timingMs.total);
        if (record.operationalOutcome === 'selected') this.#selected += 1;
        else if (record.operationalOutcome === 'abstained') this.#abstained += 1;
        else this.#invalidOrUnavailable += 1;
        if (record.decisionSource === 'deterministic_fallback') this.#deterministicSelections += 1;
        this.#tokens += record.usage?.totalTokens ?? 0;
        this.#costMicros += record.usage?.estimatedCostUsdMicros ?? 0;
        this.logger(`[wp027-shadow] ${JSON.stringify({
            promptVersion: record.promptVersion,
            providerMode: record.providerMode,
            modelId: record.modelId,
            operationalOutcome: record.operationalOutcome,
            proposalCandidateId: record.providerDecision?.candidateId ?? null,
            authorizedCandidateId: record.selectedCandidateId,
            decisionSource: record.decisionSource,
            timingMs: record.timingMs,
            usage: record.usage
        })}`);
    }

    public summary(): StrategicShadowSummaryV10R8 {
        return Object.freeze({
            observedTurns: this.#totals.length,
            selectedProposals: this.#selected,
            abstentions: this.#abstained,
            invalidOrUnavailable: this.#invalidOrUnavailable,
            deterministicSelections: this.#deterministicSelections,
            p50TotalMs: percentile(this.#totals, 0.5),
            p95TotalMs: percentile(this.#totals, 0.95),
            totalTokens: this.#tokens,
            estimatedCostUsdMicros: this.#costMicros
        });
    }
}

function percentile(values: readonly number[], fraction: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.ceil(sorted.length * fraction) - 1];
}
