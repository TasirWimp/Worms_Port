import {
    StrategicProviderUsageV10R8Schema,
    type StrategicProviderUsageV10R8
} from '../../../shared/strategic-voyage-v10-r8';
import type { StrategicDecisionBriefV10R8 } from './loomkeeper-strategy-v10-r8';
import type {
    StrategicDecisionProviderRequestV10R8,
    StrategicDecisionProviderResponseV10R8,
    StrategicDecisionProviderV10R8,
    StrategicProviderFailureDiagnosticV10R8
} from './loomkeeper-strategy-provider-v10-r8';
import { StrategicProviderOperationalErrorV10R8 } from './loomkeeper-strategy-provider-v10-r8';

export const WP027_GEMINI_MODEL_ID = 'gemini-3.6-flash' as const;
export const WP027_GEMINI_ENDPOINT =
    `https://generativelanguage.googleapis.com/v1beta/models/${WP027_GEMINI_MODEL_ID}:generateContent` as const;

const MAX_PROVIDER_BODY_BYTES = 64 * 1024;
const INPUT_USD_PER_MILLION = 0.75;
const OUTPUT_USD_PER_MILLION = 3.75;
const SYSTEM_INSTRUCTION = [
    'You choose one strategic candidate for the Loomkeeper in NIMble Knots.',
    'Use only facts and identifiers present in the supplied bounded brief.',
    'Choose exactly one legal candidate or abstain. Never invent an action, object, route, target, or observation.',
    'Prefer continuing a feasible committed strategy through its declared temporary cost.',
    'Repair or switch only when current evidence invalidates that strategy or protects a more valuable future option.',
    'Your output is advice only. The server validates it and alone owns execution.'
].join('\n');

type FetchLike = typeof fetch;

/** Stateless, server-only Gemini transport. It returns data and usage, never executable authority. */
export class GeminiStrategicDecisionProviderV10R8 implements StrategicDecisionProviderV10R8 {
    readonly modelId = WP027_GEMINI_MODEL_ID;

    public constructor(
        readonly mode: 'gemini_shadow' | 'gemini',
        private readonly apiKey: string,
        private readonly fetchImpl: FetchLike = fetch
    ) {
        if (!validApiKey(apiKey)) throw new Error('GEMINI_API_KEY is invalid.');
    }

    public async decide(
        request: StrategicDecisionProviderRequestV10R8
    ): Promise<StrategicDecisionProviderResponseV10R8> {
        let response: Response;
        try {
            response = await this.fetchImpl(WP027_GEMINI_ENDPOINT, {
                method: 'POST',
                signal: request.signal,
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': this.apiKey
                },
                body: JSON.stringify(geminiRequestBody(request.brief))
            });
        } catch (error) {
            throw new StrategicProviderOperationalErrorV10R8(
                request.signal.aborted || isAbortError(error)
                    ? 'provider_request_aborted'
                    : 'provider_network_failure'
            );
        }
        if (!response.ok) {
            throw new StrategicProviderOperationalErrorV10R8(httpFailureDiagnostic(response.status));
        }
        const declaredLength = Number(response.headers.get('content-length'));
        if (Number.isFinite(declaredLength) && declaredLength > MAX_PROVIDER_BODY_BYTES) {
            throw new StrategicProviderOperationalErrorV10R8('provider_response_too_large');
        }
        let body: string;
        try {
            body = await response.text();
        } catch (error) {
            throw new StrategicProviderOperationalErrorV10R8(
                request.signal.aborted || isAbortError(error)
                    ? 'provider_request_aborted'
                    : 'provider_network_failure'
            );
        }
        if (Buffer.byteLength(body, 'utf8') > MAX_PROVIDER_BODY_BYTES) {
            throw new StrategicProviderOperationalErrorV10R8('provider_response_too_large');
        }
        try {
            return parseGeminiResponse(body);
        } catch {
            throw new StrategicProviderOperationalErrorV10R8('provider_response_invalid');
        }
    }
}

export function geminiRequestBody(brief: StrategicDecisionBriefV10R8): Readonly<Record<string, unknown>> {
    return Object.freeze({
        systemInstruction: Object.freeze({ parts: Object.freeze([{ text: SYSTEM_INSTRUCTION }]) }),
        contents: Object.freeze([Object.freeze({
            role: 'user',
            parts: Object.freeze([{ text: JSON.stringify({
                instruction: 'Select the best current candidate for the multi-turn strategy, or abstain when the brief is insufficient.',
                brief
            }) }])
        })]),
        generationConfig: Object.freeze({
            thinkingConfig: Object.freeze({ thinkingLevel: 'low' }),
            maxOutputTokens: 2_048,
            responseMimeType: 'application/json',
            responseJsonSchema: responseSchema(brief)
        })
    });
}

function responseSchema(brief: StrategicDecisionBriefV10R8): Readonly<Record<string, unknown>> {
    const selected = {
        type: 'object',
        additionalProperties: false,
        properties: {
            candidateId: { type: 'string', enum: brief.legalCandidates.map(candidate => candidate.candidateId) },
            strategy: { type: 'string', enum: ['continue', 'refine', 'repair', 'switch', 'complete'] },
            targetId: { type: 'string', enum: [...brief.strategyVocabulary.targetIds] },
            milestoneId: { type: 'string', enum: [...brief.strategyVocabulary.milestoneIds] },
            horizonOwnTurns: { type: 'integer', minimum: 1, maximum: 8 },
            reason: { type: 'string' },
            watchFor: { type: 'string' }
        },
        required: ['candidateId', 'strategy', 'targetId', 'milestoneId', 'horizonOwnTurns', 'reason', 'watchFor']
    };
    const abstained = {
        type: 'object',
        additionalProperties: false,
        properties: {
            candidateId: { type: 'null' },
            strategy: { type: 'null' },
            targetId: { type: 'null' },
            milestoneId: { type: 'null' },
            horizonOwnTurns: { type: 'null' },
            reason: { type: 'string' },
            watchFor: { type: 'null' }
        },
        required: ['candidateId', 'strategy', 'targetId', 'milestoneId', 'horizonOwnTurns', 'reason', 'watchFor']
    };
    return Object.freeze({ anyOf: Object.freeze([selected, abstained]) });
}

function parseGeminiResponse(body: string): StrategicDecisionProviderResponseV10R8 {
    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch {
        throw new Error('Gemini returned malformed JSON.');
    }
    const root = record(parsed);
    const candidates = Array.isArray(root.candidates) ? root.candidates : [];
    if (candidates.length !== 1) throw new Error('Gemini returned an unexpected candidate count.');
    const candidate = record(candidates[0]);
    if (candidate.finishReason !== 'STOP') throw new Error('Gemini did not finish a complete response.');
    const content = record(candidate.content);
    const parts = Array.isArray(content.parts) ? content.parts : [];
    const texts = parts.map(part => record(part).text).filter((text): text is string => typeof text === 'string');
    if (texts.length !== 1) throw new Error('Gemini response text is missing or ambiguous.');
    let payload: unknown;
    try {
        payload = JSON.parse(texts[0]);
    } catch {
        throw new Error('Gemini structured output is malformed.');
    }
    return Object.freeze({ payload, usage: usageFromResponse(root.usageMetadata) });
}

function usageFromResponse(value: unknown): StrategicProviderUsageV10R8 {
    const usage = record(value);
    const inputTokens = nonNegativeInteger(usage.promptTokenCount, 'prompt token count');
    const outputTokens = nonNegativeInteger(usage.candidatesTokenCount, 'candidate token count');
    const thinkingTokens = nonNegativeInteger(usage.thoughtsTokenCount ?? 0, 'thought token count');
    const totalTokens = nonNegativeInteger(usage.totalTokenCount, 'total token count');
    if (totalTokens < inputTokens + outputTokens + thinkingTokens) {
        throw new Error('Gemini usage totals are inconsistent.');
    }
    return StrategicProviderUsageV10R8Schema.parse({
        inputTokens,
        outputTokens,
        thinkingTokens,
        totalTokens,
        // USD per million tokens converts directly to micro-USD per token.
        estimatedCostUsdMicros: Math.ceil(
            inputTokens * INPUT_USD_PER_MILLION +
            (outputTokens + thinkingTokens) * OUTPUT_USD_PER_MILLION
        )
    });
}

function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Gemini response shape is invalid.');
    }
    return value as Record<string, unknown>;
}

function nonNegativeInteger(value: unknown, name: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw new Error(`Gemini ${name} is invalid.`);
    }
    return value as number;
}

function validApiKey(value: string): boolean {
    return value === value.trim() && value.length >= 20 && value.length <= 256 && !/\s/.test(value);
}

function httpFailureDiagnostic(status: number): StrategicProviderFailureDiagnosticV10R8 {
    if (status === 429) return 'provider_http_rate_limited';
    if (status === 401 || status === 403) return 'provider_http_auth_rejected';
    if (status >= 400 && status < 500) return 'provider_http_request_rejected';
    if (status >= 500 && status < 600) return 'provider_http_unavailable';
    return 'provider_http_unexpected_status';
}

function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
}
