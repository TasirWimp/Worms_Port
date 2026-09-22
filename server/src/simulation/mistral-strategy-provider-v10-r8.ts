import {
    StrategicProviderUsageV10R8Schema,
    type StrategicProviderUsageV10R8
} from '../../../shared/strategic-voyage-v10-r8';
import type { StrategicDecisionBriefV10R8, StrategicPathAtlasV10R8 } from './loomkeeper-strategy-v10-r8';
import type {
    StrategicDecisionProviderRequestV10R8,
    StrategicDecisionProviderResponseV10R8,
    StrategicDecisionProviderV10R8,
    StrategicProviderFailureDiagnosticV10R8
} from './loomkeeper-strategy-provider-v10-r8';
import { StrategicProviderOperationalErrorV10R8 } from './loomkeeper-strategy-provider-v10-r8';
import { renderCandidatePathImageV10R8 } from './loomkeeper-candidate-path-image-v10-r8';
import {
    strategicMistralResponseSchemaV10R8,
    strategicPathSystemInstructionV10R8,
    strategicPathUserPromptV10R8
} from './loomkeeper-strategy-prompt-v10-r8';

export const WP027_MISTRAL_MODEL_ID = 'mistral-small-2603' as const;
export const WP027_MISTRAL_ENDPOINT = 'https://api.mistral.ai/v1/chat/completions' as const;

const INPUT_USD_PER_MILLION = 0.15;
const OUTPUT_USD_PER_MILLION = 0.60;

type FetchLike = typeof fetch;

/** Stateless, server-only Mistral transport. Shadow proposals never receive execution authority. */
export class MistralStrategicDecisionProviderV10R8 implements StrategicDecisionProviderV10R8 {
    readonly modelId = WP027_MISTRAL_MODEL_ID;
    readonly mode = 'mistral_shadow' as const;

    public constructor(
        private readonly apiKey: string,
        private readonly fetchImpl: FetchLike = fetch
    ) {
        if (!validApiKey(apiKey)) throw new Error('MISTRAL_API_KEY is invalid.');
    }

    public async decide(
        request: StrategicDecisionProviderRequestV10R8
    ): Promise<StrategicDecisionProviderResponseV10R8> {
        let response: Response;
        try {
            response = await this.fetchImpl(WP027_MISTRAL_ENDPOINT, {
                method: 'POST',
                signal: request.signal,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(mistralRequestBody(request.brief, request.pathAtlas))
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
        try {
            return parseMistralResponse(body);
        } catch {
            throw new StrategicProviderOperationalErrorV10R8('provider_response_invalid');
        }
    }
}

export function mistralRequestBody(
    brief: StrategicDecisionBriefV10R8,
    pathAtlas: StrategicPathAtlasV10R8 | undefined
): Readonly<Record<string, unknown>> {
    if (!pathAtlas) throw new Error('Mistral requires the current simulated candidate paths.');
    const imageUrl = `data:image/png;base64,${renderCandidatePathImageV10R8(brief, pathAtlas).toString('base64')}`;
    return Object.freeze({
        model: WP027_MISTRAL_MODEL_ID,
        messages: Object.freeze([
            Object.freeze({ role: 'system', content: strategicPathSystemInstructionV10R8(brief) }),
            Object.freeze({ role: 'user', content: Object.freeze([
                Object.freeze({
                    type: 'text',
                    text: strategicPathUserPromptV10R8(brief, pathAtlas)
                }),
                Object.freeze({ type: 'image_url', image_url: imageUrl })
            ]) })
        ]),
        reasoning_effort: 'high',
        response_format: Object.freeze({
            type: 'json_schema',
            json_schema: Object.freeze({
                name: 'loomkeeper_strategic_decision',
                schema: strategicMistralResponseSchemaV10R8(brief),
                strict: true
            })
        }),
        stream: false
    });
}

function parseMistralResponse(body: string): StrategicDecisionProviderResponseV10R8 {
    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch {
        throw new Error('Mistral returned malformed JSON.');
    }
    const root = record(parsed);
    const choices = Array.isArray(root.choices) ? root.choices : [];
    if (choices.length !== 1) throw new Error('Mistral returned an unexpected choice count.');
    const choice = record(choices[0]);
    if (choice.finish_reason !== 'stop') throw new Error('Mistral did not finish a complete response.');
    const message = record(choice.message);
    const text = responseText(message.content);
    let payload: unknown;
    try {
        payload = JSON.parse(text);
    } catch {
        throw new Error('Mistral structured output is malformed.');
    }
    return Object.freeze({ payload, usage: usageFromResponse(root.usage) });
}

function responseText(content: unknown): string {
    if (typeof content === 'string' && content.length > 0) return content;
    if (!Array.isArray(content)) throw new Error('Mistral response text is missing.');
    const texts: string[] = [];
    for (const chunkValue of content) {
        const chunk = record(chunkValue);
        if (chunk.type === 'text' && typeof chunk.text === 'string') texts.push(chunk.text);
        else if (chunk.type !== 'thinking') throw new Error('Mistral response content is ambiguous.');
    }
    if (texts.length !== 1 || texts[0].length === 0) {
        throw new Error('Mistral response text is missing or ambiguous.');
    }
    return texts[0];
}

function usageFromResponse(value: unknown): StrategicProviderUsageV10R8 {
    const usage = record(value);
    const inputTokens = nonNegativeInteger(usage.prompt_tokens, 'prompt token count');
    const outputTokens = nonNegativeInteger(usage.completion_tokens, 'completion token count');
    const totalTokens = nonNegativeInteger(usage.total_tokens, 'total token count');
    if (totalTokens < inputTokens + outputTokens) throw new Error('Mistral usage totals are inconsistent.');
    return StrategicProviderUsageV10R8Schema.parse({
        inputTokens,
        outputTokens,
        thinkingTokens: 0,
        totalTokens,
        // USD per million tokens converts directly to micro-USD per token.
        estimatedCostUsdMicros: Math.ceil(
            inputTokens * INPUT_USD_PER_MILLION + outputTokens * OUTPUT_USD_PER_MILLION
        )
    });
}

function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Mistral response shape is invalid.');
    }
    return value as Record<string, unknown>;
}

function nonNegativeInteger(value: unknown, name: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw new Error(`Mistral ${name} is invalid.`);
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
