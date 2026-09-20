import { performance } from 'node:perf_hooks';

import {
    V10_R8_CANDIDATE_CAPS,
    parseStrategicDecisionV10R8,
    type StrategicDecisionBriefV10R8
} from './loomkeeper-strategy-v10-r8';
import {
    StrategicProviderUsageV10R8Schema,
    V10_R8_PROMPT_VERSION,
    type StrategicDecisionV10R8,
    type StrategicProviderUsageV10R8,
    type StrategicTurnRecordV10R8
} from '../../../shared/strategic-voyage-v10-r8';

export const V10_R8_STRATEGIC_DEADLINE_MS = 8_000;

export type StrategicDecisionProviderRequestV10R8 = Readonly<{
    promptVersion: typeof V10_R8_PROMPT_VERSION;
    brief: StrategicDecisionBriefV10R8;
    signal: AbortSignal;
    deadlineMs: number;
}>;

export type StrategicDecisionProviderResponseV10R8 = Readonly<{
    payload: unknown;
    usage: StrategicProviderUsageV10R8 | null;
}>;

export const STRATEGIC_PROVIDER_FAILURE_DIAGNOSTICS_V10_R8 = [
    'provider_http_rate_limited',
    'provider_http_auth_rejected',
    'provider_http_request_rejected',
    'provider_http_unavailable',
    'provider_http_unexpected_status',
    'provider_network_failure',
    'provider_request_aborted',
    'provider_response_too_large',
    'provider_response_invalid',
    'provider_unclassified_failure'
] as const;
export type StrategicProviderFailureDiagnosticV10R8 =
    typeof STRATEGIC_PROVIDER_FAILURE_DIAGNOSTICS_V10_R8[number];

/** Carries one allowlisted operational category without retaining provider text or credentials. */
export class StrategicProviderOperationalErrorV10R8 extends Error {
    public constructor(readonly diagnostic: StrategicProviderFailureDiagnosticV10R8) {
        super('Strategic provider operation failed.');
        this.name = 'StrategicProviderOperationalErrorV10R8';
    }
}

/** Data-only provider seam. It receives no executor, replay or persistence authority. */
export interface StrategicDecisionProviderV10R8 {
    readonly mode: 'local_fake' | 'gemini_shadow' | 'gemini';
    readonly modelId: string;
    decide(request: StrategicDecisionProviderRequestV10R8): Promise<StrategicDecisionProviderResponseV10R8>;
}

export type StrategicProviderOutcomeV10R8 = StrategicTurnRecordV10R8['operationalOutcome'];
export type StrategicProviderResultV10R8 = Readonly<{
    outcome: StrategicProviderOutcomeV10R8;
    decision: StrategicDecisionV10R8 | null;
    providerMode: StrategicDecisionProviderV10R8['mode'];
    modelId: string;
    usage: StrategicProviderUsageV10R8 | null;
    responseBytes: number | null;
    diagnostic: string | null;
    timingMs: StrategicTurnRecordV10R8['timingMs'];
}>;

export type StrategicDecisionAdapterOptionsV10R8 = Readonly<{
    deadlineMs?: number;
    maxConcurrentRequests?: number;
    maxRequests?: number;
    failureThreshold?: number;
    circuitCooldownMs?: number;
    nowMs?: () => number;
}>;

type ActiveRequest = Readonly<{ controller: AbortController }>;

/** One-call operational envelope shared by local fakes now and a later Gemini transport. */
export class StrategicDecisionAdapterV10R8 {
    readonly #deadlineMs: number;
    readonly #maxConcurrent: number;
    readonly #maxRequests: number;
    readonly #failureThreshold: number;
    readonly #circuitCooldownMs: number;
    readonly #nowMs: () => number;
    readonly #active = new Map<string, ActiveRequest>();
    #requests = 0;
    #consecutiveFailures = 0;
    #circuitUntilMs = 0;

    constructor(
        readonly provider: StrategicDecisionProviderV10R8,
        options: StrategicDecisionAdapterOptionsV10R8 = {}
    ) {
        if (!/^[A-Za-z0-9._-]{1,96}$/.test(provider.modelId)) throw new Error('Invalid strategic provider model identity.');
        this.#deadlineMs = boundedInteger(options.deadlineMs ?? V10_R8_STRATEGIC_DEADLINE_MS, 1, V10_R8_STRATEGIC_DEADLINE_MS);
        this.#maxConcurrent = boundedInteger(options.maxConcurrentRequests ?? 4, 1, 32);
        this.#maxRequests = boundedInteger(options.maxRequests ?? 10_000, 1, 1_000_000);
        this.#failureThreshold = boundedInteger(options.failureThreshold ?? 3, 1, 16);
        this.#circuitCooldownMs = boundedInteger(options.circuitCooldownMs ?? 60_000, 1, 3_600_000);
        this.#nowMs = options.nowMs ?? (() => performance.now());
    }

    public async request(
        matchId: string,
        brief: StrategicDecisionBriefV10R8,
        preparationMs: number
    ): Promise<StrategicProviderResultV10R8> {
        if (!/^[A-Za-z0-9_-]{16,64}$/.test(matchId)) throw new Error('Invalid strategic match identity.');
        const preparation = boundedInteger(Math.round(preparationMs), 0, 60_000);
        const gated = this.#gate(matchId, preparation);
        if (gated) return gated;

        const controller = new AbortController();
        const active = Object.freeze({ controller });
        this.#active.set(matchId, active);
        this.#requests += 1;
        const remainingMs = Math.max(1, this.#deadlineMs - preparation);
        let timeout: NodeJS.Timeout | undefined;
        const timeoutResult = new Promise<symbol>(resolve => {
            timeout = setTimeout(() => resolve(timeoutMarker), remainingMs);
            timeout.unref();
        });
        const providerStarted = this.#nowMs();
        const providerResult = Promise.resolve().then(() => this.provider.decide(Object.freeze({
            promptVersion: V10_R8_PROMPT_VERSION,
            brief,
            signal: controller.signal,
            deadlineMs: remainingMs
        }))).then(value => ({ value }), error => ({ error: providerFailureDiagnostic(error) }));

        try {
            const raced = await Promise.race([providerResult, timeoutResult]);
            const providerEnded = this.#nowMs();
            if (typeof raced === 'symbol') {
                controller.abort();
                this.#registerFailure(providerEnded);
                return this.#result('timeout', null, null, null, 'Provider deadline elapsed.', preparation,
                    providerEnded - providerStarted, 0);
            }
            if ('error' in raced) {
                this.#registerFailure(providerEnded);
                return this.#result('provider_error', null, null, null, raced.error, preparation,
                    providerEnded - providerStarted, 0);
            }
            const validationStarted = this.#nowMs();
            const serialized = serializableBytes(raced.value.payload);
            let usage: StrategicProviderUsageV10R8 | null;
            try {
                usage = raced.value.usage === null
                    ? null
                    : StrategicProviderUsageV10R8Schema.parse(raced.value.usage);
            } catch {
                const ended = this.#nowMs();
                this.#registerFailure(ended);
                return this.#result('invalid_response', null, null, null,
                    'Provider usage metadata failed strict validation.', preparation,
                    providerEnded - providerStarted, ended - validationStarted);
            }
            let decision: StrategicDecisionV10R8;
            try {
                decision = parseStrategicDecisionV10R8(raced.value.payload);
            } catch {
                const ended = this.#nowMs();
                this.#registerFailure(ended);
                return this.#result('invalid_response', null, usage,
                    serialized !== null && serialized <= V10_R8_CANDIDATE_CAPS.responseBytes ? serialized : null,
                    'Provider response failed strict validation.', preparation,
                    providerEnded - providerStarted, ended - validationStarted);
            }
            const ended = this.#nowMs();
            this.#consecutiveFailures = 0;
            this.#circuitUntilMs = 0;
            return this.#result(decision.candidateId === null ? 'abstained' : 'selected', decision, usage,
                serialized, null, preparation, providerEnded - providerStarted,
                ended - validationStarted);
        } finally {
            if (timeout) clearTimeout(timeout);
            if (this.#active.get(matchId) === active) this.#active.delete(matchId);
        }
    }

    public cancelMatch(matchId: string): void {
        this.#active.get(matchId)?.controller.abort();
        this.#active.delete(matchId);
    }

    public diagnostics(): Readonly<{
        requests: number;
        active: number;
        consecutiveFailures: number;
        circuitOpen: boolean;
    }> {
        return Object.freeze({
            requests: this.#requests,
            active: this.#active.size,
            consecutiveFailures: this.#consecutiveFailures,
            circuitOpen: this.#nowMs() < this.#circuitUntilMs
        });
    }

    #gate(matchId: string, preparation: number): StrategicProviderResultV10R8 | undefined {
        if (preparation >= this.#deadlineMs) {
            return this.#result('timeout', null, null, null, 'Preparation exhausted the decision deadline.',
                preparation, 0, 0);
        }
        if (this.#active.has(matchId) || this.#active.size >= this.#maxConcurrent) {
            return this.#result('concurrency_limit', null, null, null, 'Provider concurrency limit reached.',
                preparation, 0, 0);
        }
        if (this.#requests >= this.#maxRequests) {
            return this.#result('spend_limit', null, null, null, 'Provider request budget exhausted.',
                preparation, 0, 0);
        }
        if (this.#nowMs() < this.#circuitUntilMs) {
            return this.#result('circuit_open', null, null, null, 'Provider circuit is open.',
                preparation, 0, 0);
        }
        return undefined;
    }

    #registerFailure(nowMs: number): void {
        this.#consecutiveFailures += 1;
        if (this.#consecutiveFailures >= this.#failureThreshold) {
            this.#circuitUntilMs = nowMs + this.#circuitCooldownMs;
        }
    }

    #result(
        outcome: StrategicProviderOutcomeV10R8,
        decision: StrategicDecisionV10R8 | null,
        usage: StrategicProviderUsageV10R8 | null,
        responseBytes: number | null,
        diagnostic: string | null,
        preparation: number,
        provider: number,
        validation: number
    ): StrategicProviderResultV10R8 {
        const providerMs = boundedInteger(Math.round(Math.max(0, provider)), 0, 60_000);
        const validationMs = boundedInteger(Math.round(Math.max(0, validation)), 0, 60_000);
        return Object.freeze({
            outcome,
            decision,
            providerMode: this.provider.mode,
            modelId: this.provider.modelId,
            usage,
            responseBytes,
            diagnostic,
            timingMs: Object.freeze({
                preparation,
                provider: providerMs,
                validation: validationMs,
                total: Math.min(60_000, preparation + providerMs + validationMs)
            })
        });
    }
}

const timeoutMarker = Symbol('strategic-provider-timeout');

function providerFailureDiagnostic(error: unknown): StrategicProviderFailureDiagnosticV10R8 {
    return error instanceof StrategicProviderOperationalErrorV10R8
        ? error.diagnostic
        : 'provider_unclassified_failure';
}

function serializableBytes(input: unknown): number | null {
    try {
        const serialized = JSON.stringify(input);
        return serialized === undefined ? null : Buffer.byteLength(serialized, 'utf8');
    } catch {
        return null;
    }
}

function boundedInteger(value: number, minimum: number, maximum: number): number {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
        throw new Error(`Value must be an integer from ${minimum} through ${maximum}.`);
    }
    return value;
}
