import { performance } from 'node:perf_hooks';

import { hashCanonicalV10Value } from '../../../shared/simulation-v10';
import { StrategicProviderUsageV10R8Schema, type StrategicProviderUsageV10R8 } from
    '../../../shared/strategic-voyage-v10-r8';
import { WP027_MISTRAL_ENDPOINT, WP027_MISTRAL_MODEL_ID } from './mistral-strategy-provider-v10-r8';
import {
    chapterStorySystemInstructionV10R8, validateChapterStoryV10R8,
    type ChapterStoryBriefV10R8, type FrozenChapterStoryV10R8
} from './loomkeeper-chapter-story-v10-r8';

export const V10_R8_CHAPTER_LIVE_DEADLINE_MS = 15_000;
const MAX_RESPONSE_BYTES = 64 * 1024;
type JsonSchema = Readonly<Record<string, unknown>>;
type FetchLike = typeof fetch;

const stringEnum = (values: readonly string[]): JsonSchema => ({ type: 'string', enum: values });
const objectSchema = (properties: Readonly<Record<string, JsonSchema>>): JsonSchema => ({
    type: 'object', additionalProperties: false, properties, required: Object.keys(properties)
});
const conciseText = (purpose: string, characters: number): JsonSchema => ({
    type: 'string', description: `${purpose} Use at most ${characters} characters.`
});

/** The deployed r4 shadow and the canary share this exact candidate-hidden request. */
export function chapterStoryJsonSchemaV10R8(brief: ChapterStoryBriefV10R8): JsonSchema {
    const evidence = brief.facts.map(fact => fact.id).filter(id =>
        id !== 'prior.committed' && id !== 'world.no_material_change');
    const reading = objectSchema({
        hypothesis: conciseText('A tentative player hypothesis.', 110),
        evidenceIds: { type: 'array', items: stringEnum(evidence), minItems: 1, maxItems: 3 },
        alternative: conciseText('A plausible alternative reading.', 110),
        watchFor: conciseText('One observation that would weaken the reading.', 110)
    });
    return objectSchema({
        chapterClosure: conciseText('Only witnessed events in one short sentence.', 180),
        playerReading: { anyOf: [reading, { type: 'null' }] },
        intention: objectSchema({
            posture: stringEnum(brief.allowedPostures),
            targetId: stringEnum(brief.targetIds),
            horizonOwnTurns: { type: 'integer', minimum: 1, maximum: 3 },
            reason: conciseText('Why this intention fits the fixed mode and observed facts.', 110),
            watchFor: conciseText('One observation that would change this intention.', 110)
        })
    });
}

export function chapterStoryRequestBodyV10R8(brief: ChapterStoryBriefV10R8): Readonly<Record<string, unknown>> {
    return {
        model: WP027_MISTRAL_MODEL_ID,
        messages: [{ role: 'system', content: chapterStorySystemInstructionV10R8(brief.mode) }, {
            role: 'user', content: JSON.stringify({
                task: 'Close only the observed chapter, then open the next exchange with one tentative mode-correct intention. Cite fact IDs for any player reading. Return JSON.',
                brief
            })
        }],
        reasoning_effort: 'high',
        response_format: { type: 'json_schema', json_schema: {
            name: 'wp027_chapter_story', schema: chapterStoryJsonSchemaV10R8(brief), strict: true
        } },
        stream: false
    };
}

export type ChapterStoryProviderOutcomeV10R8 =
    'selected' | 'invalid_response' | 'timeout' | 'provider_error' | 'concurrency_limit';
export type ChapterStoryProviderResultV10R8 = Readonly<{
    outcome: ChapterStoryProviderOutcomeV10R8;
    frozenStory: FrozenChapterStoryV10R8 | null;
    requestHash: string;
    modelId: typeof WP027_MISTRAL_MODEL_ID;
    usage: StrategicProviderUsageV10R8 | null;
    responseBytes: number | null;
    diagnostic: string | null;
    timingMs: Readonly<{ preparation: number; provider: number; validation: number; total: number }>;
}>;

/** One request per match turn, no retry or process-wide request/spend ceiling. */
export class MistralChapterStoryAdapterV10R8 {
    readonly #active = new Map<string, AbortController>();

    public constructor(private readonly apiKey: string, private readonly fetchImpl: FetchLike = fetch,
        private readonly deadlineMs = V10_R8_CHAPTER_LIVE_DEADLINE_MS) {
        if (!/^[\x21-\x7e]{20,512}$/.test(apiKey)) throw new Error('MISTRAL_API_KEY is invalid.');
        if (!Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > V10_R8_CHAPTER_LIVE_DEADLINE_MS) {
            throw new Error('Chapter deadline must be an integer from 1 through 15000 ms.');
        }
    }

    public async request(matchId: string, brief: ChapterStoryBriefV10R8,
        preparationMs: number): Promise<ChapterStoryProviderResultV10R8> {
        if (!/^[A-Za-z0-9_-]{16,64}$/.test(matchId)) throw new Error('Invalid chapter match identity.');
        const preparation = Math.max(0, Math.round(preparationMs));
        const body = chapterStoryRequestBodyV10R8(brief);
        const requestHash = hashCanonicalV10Value(body);
        const result = (outcome: ChapterStoryProviderOutcomeV10R8, frozenStory: FrozenChapterStoryV10R8 | null,
            usage: StrategicProviderUsageV10R8 | null, responseBytes: number | null, diagnostic: string | null,
            provider: number, validation: number): ChapterStoryProviderResultV10R8 => Object.freeze({
            outcome, frozenStory, requestHash, modelId: WP027_MISTRAL_MODEL_ID,
            usage, responseBytes, diagnostic,
            timingMs: Object.freeze({ preparation, provider, validation, total: preparation + provider + validation })
        });
        if (this.#active.has(matchId)) return result('concurrency_limit', null, null, null,
            'same_match_request_in_flight', 0, 0);
        if (preparation >= this.deadlineMs) return result('timeout', null, null, null,
            'preparation_deadline', 0, 0);
        const controller = new AbortController();
        this.#active.set(matchId, controller);
        const started = performance.now();
        let expire!: () => void;
        const expired = new Promise<null>(resolve => { expire = () => resolve(null); });
        const timeout = setTimeout(() => { controller.abort(); expire(); }, this.deadlineMs - preparation);
        let responseBytes: number | null = null;
        let usage: StrategicProviderUsageV10R8 | null = null;
        let providerMs = 0;
        try {
            const submitted = this.fetchImpl(WP027_MISTRAL_ENDPOINT, {
                method: 'POST', signal: controller.signal,
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
                body: JSON.stringify(body)
            }).then(async response => ({ response, raw: response.ok ? await response.text() : null }));
            const raced = await Promise.race([
                submitted.then(value => ({ value }), error => ({ error })), expired
            ]);
            if (raced === null) return result('timeout', null, null, null,
                'provider_request_aborted', Math.round(performance.now() - started), 0);
            if ('error' in raced) return result(controller.signal.aborted ? 'timeout' : 'provider_error',
                null, null, null, controller.signal.aborted ? 'provider_request_aborted' : 'provider_network_failure',
                Math.round(performance.now() - started), 0);
            const { response, raw } = raced.value;
            if (!response.ok) return result('provider_error', null, null, null,
                httpDiagnostic(response.status), Math.round(performance.now() - started), 0);
            if (raw === null) throw new Error('Provider body is missing.');
            providerMs = Math.round(performance.now() - started);
            responseBytes = Buffer.byteLength(raw, 'utf8');
            if (responseBytes > MAX_RESPONSE_BYTES) return result('invalid_response', null, null, null,
                'provider_response_too_large', providerMs, 0);
            const validationStarted = performance.now();
            try {
                const root = asRecord(JSON.parse(raw));
                const choice = Array.isArray(root.choices) && root.choices.length === 1
                    ? asRecord(root.choices[0]) : null;
                if (!choice || choice.finish_reason !== 'stop') throw new Error('Incomplete choice.');
                const content = asRecord(choice.message).content;
                const text = typeof content === 'string' ? content : Array.isArray(content)
                    ? content.filter(item => item?.type === 'text').map(item => item.text).join('') : null;
                if (!text || typeof text !== 'string') throw new Error('Missing choice text.');
                const frozenStory = validateChapterStoryV10R8(brief, JSON.parse(text));
                if (root.usage) {
                    const rawUsage = asRecord(root.usage);
                    const inputTokens = rawUsage.prompt_tokens;
                    const outputTokens = rawUsage.completion_tokens;
                    const totalTokens = rawUsage.total_tokens;
                    usage = StrategicProviderUsageV10R8Schema.parse({
                        inputTokens, outputTokens, thinkingTokens: 0, totalTokens,
                        estimatedCostUsdMicros: Math.ceil(Number(inputTokens) * 0.15 + Number(outputTokens) * 0.60)
                    });
                }
                return result('selected', frozenStory, usage, responseBytes, null,
                    providerMs, Math.round(performance.now() - validationStarted));
            } catch {
                return result('invalid_response', null, usage, responseBytes,
                    'provider_response_invalid', providerMs, Math.round(performance.now() - validationStarted));
            }
        } catch {
            const elapsed = Math.round(performance.now() - started);
            return result(controller.signal.aborted ? 'timeout' : 'provider_error', null, null, null,
                controller.signal.aborted ? 'provider_request_aborted' : 'provider_network_failure', elapsed, 0);
        } finally {
            clearTimeout(timeout);
            if (this.#active.get(matchId) === controller) this.#active.delete(matchId);
        }
    }

    public cancelMatch(matchId: string): void {
        this.#active.get(matchId)?.abort();
        this.#active.delete(matchId);
    }
}

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected object.');
    return value as Record<string, unknown>;
}

function httpDiagnostic(status: number): string {
    if (status === 429) return 'provider_http_rate_limited';
    if (status === 401 || status === 403) return 'provider_http_auth_rejected';
    if (status === 400 || status === 422) return 'provider_http_request_rejected';
    if (status >= 500) return 'provider_http_unavailable';
    return 'provider_http_unexpected_status';
}
