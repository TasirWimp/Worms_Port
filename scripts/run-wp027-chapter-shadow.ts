import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { WP027_MISTRAL_ENDPOINT, WP027_MISTRAL_MODEL_ID } from
    '../server/src/simulation/mistral-strategy-provider-v10-r8';
import {
    candidateFitCardsV10R8, matchChapterIntentionV10R8, validateCandidateFitV10R8
} from '../server/src/simulation/loomkeeper-chapter-matcher-v10-r8';
import {
    buildChapterStoryBriefV10R8, chapterStorySystemInstructionV10R8,
    validateChapterStoryV10R8, type ChapterStoryBriefV10R8,
    type ChapterStoryProposalV10R8
} from '../server/src/simulation/loomkeeper-chapter-story-v10-r8';
import { hashCanonicalV10Value } from '../shared/simulation-v10';
import { createWp027ChapterFixtures, WP027_CHAPTER_FIXTURE_VERSION, type Wp027ChapterFixture } from
    './wp027-chapter-shadow-fixtures';

const VERSION = 'v10-r8-chapter-shadow-r1';
const DEADLINE_MS = 60_000;
const OUTPUT = path.resolve('test-results/wp027-chapter-shadow.json');
type Mode = 'fixture-only' | 'local-fake' | 'mistral';
type JsonSchema = Readonly<Record<string, unknown>>;
type CallResult = Readonly<{
    outcome: 'complete' | 'http_error' | 'timeout' | 'network_error' | 'invalid_response';
    durationMs: number;
    requestHash: string;
    httpStatus: number | null;
    usage: Readonly<{ inputTokens: number; outputTokens: number; totalTokens: number; estimatedCostUsdMicros: number }> | null;
    payload: unknown | null;
}>;

const stringEnum = (values: readonly string[]): JsonSchema => ({ type: 'string', enum: values });
const objectSchema = (properties: Readonly<Record<string, JsonSchema>>): JsonSchema => ({
    type: 'object', additionalProperties: false, properties, required: Object.keys(properties)
});
const textSchema: JsonSchema = { type: 'string' };

export function chapterStoryJsonSchema(brief: ChapterStoryBriefV10R8): JsonSchema {
    const evidence = brief.facts.map(fact => fact.id).filter(id =>
        id !== 'prior.committed' && id !== 'world.no_material_change');
    const reading = objectSchema({
        hypothesis: textSchema,
        evidenceIds: { type: 'array', items: stringEnum(evidence), minItems: 1, maxItems: 3 },
        alternative: textSchema,
        watchFor: textSchema
    });
    return objectSchema({
        chapterClosure: textSchema,
        playerReading: { anyOf: [reading, { type: 'null' }] },
        intention: objectSchema({
            posture: stringEnum(brief.allowedPostures),
            targetId: stringEnum(brief.targetIds),
            horizonOwnTurns: { type: 'integer', minimum: 1, maximum: 3 },
            reason: textSchema,
            watchFor: textSchema
        })
    });
}

export function candidateFitJsonSchema(ids: readonly string[]): JsonSchema {
    return objectSchema({ candidateId: stringEnum(ids), reason: textSchema, watchFor: textSchema });
}

function requestBody(system: string, user: unknown, schemaName: string, schema: JsonSchema): Readonly<Record<string, unknown>> {
    return {
        model: WP027_MISTRAL_MODEL_ID,
        messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(user) }],
        reasoning_effort: 'high',
        response_format: { type: 'json_schema', json_schema: { name: schemaName, schema, strict: true } },
        stream: false
    };
}

export function chapterStoryRequestBody(brief: ChapterStoryBriefV10R8): Readonly<Record<string, unknown>> {
    return requestBody(chapterStorySystemInstructionV10R8(brief.mode), {
        task: 'Close only the observed chapter, then open the next exchange with one tentative mode-correct intention. Cite fact IDs for any player reading. Return JSON.',
        brief
    }, 'wp027_chapter_story', chapterStoryJsonSchema(brief));
}

export function chapterFitRequestBody(
    fixture: Wp027ChapterFixture,
    story: ReturnType<typeof validateChapterStoryV10R8>,
    comparison: ReturnType<typeof matchChapterIntentionV10R8>
): Readonly<Record<string, unknown>> {
    return requestBody([
        'You are selecting one legal completed Loomkeeper turn in a NIMble Knots match.',
        'The chapter story and intention below are frozen. Do not revise them or assert an uncomputed future player response.',
        'Compare only the supplied complete-turn cards. Their immediate effects are computed; route-shaping outcomes beyond this turn are unknown.',
        'Return one candidate ID from these cards, a short reason and what to watch next. Your choice cannot execute gameplay.'
    ].join('\n'), {
        mode: fixture.mode,
        stateHash: fixture.storyBrief.stateHash,
        frozenIntention: story.proposal.intention,
        chapterClosure: story.proposal.chapterClosure,
        playerReading: story.proposal.playerReading,
        candidates: candidateFitCardsV10R8(comparison, fixture.boundary.brief)
    }, 'wp027_chapter_fit', candidateFitJsonSchema(comparison.shortlist));
}

function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object.');
    return value as Record<string, unknown>;
}

function completionText(value: unknown): string {
    if (typeof value === 'string' && value) return value;
    if (!Array.isArray(value)) throw new Error('Missing completion text.');
    const texts = value.filter(item => item?.type === 'text').map(item => item.text);
    if (texts.length !== 1 || typeof texts[0] !== 'string' || !texts[0]) throw new Error('Ambiguous completion text.');
    return texts[0];
}

async function callMistral(apiKey: string, body: Readonly<Record<string, unknown>>): Promise<CallResult> {
    const started = performance.now();
    let httpStatus: number | null = null;
    let usage: CallResult['usage'] = null;
    let outcome: CallResult['outcome'] = 'complete';
    let payload: unknown | null = null;
    let accepted = false;
    try {
        const response = await fetch(WP027_MISTRAL_ENDPOINT, {
            method: 'POST', signal: AbortSignal.timeout(DEADLINE_MS),
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify(body)
        });
        httpStatus = response.status;
        if (!response.ok) outcome = 'http_error';
        else {
            accepted = true;
            const root = record(await response.json());
            const rawUsage = root.usage ? record(root.usage) : null;
            if (rawUsage && [rawUsage.prompt_tokens, rawUsage.completion_tokens, rawUsage.total_tokens]
                .every(value => Number.isSafeInteger(value) && (value as number) >= 0)) {
                const inputTokens = rawUsage.prompt_tokens as number;
                const outputTokens = rawUsage.completion_tokens as number;
                usage = {
                    inputTokens, outputTokens, totalTokens: rawUsage.total_tokens as number,
                    estimatedCostUsdMicros: Math.ceil(inputTokens * 0.15 + outputTokens * 0.60)
                };
            }
            const choices = root.choices;
            if (!Array.isArray(choices) || choices.length !== 1) throw new Error('Unexpected completion count.');
            const choice = record(choices[0]);
            if (choice.finish_reason !== 'stop') throw new Error('Incomplete completion.');
            payload = JSON.parse(completionText(record(choice.message).content));
        }
    } catch (error) {
        outcome = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
            ? 'timeout' : accepted ? 'invalid_response' : 'network_error';
        payload = null;
    }
    return {
        outcome, durationMs: Math.round(performance.now() - started),
        requestHash: hashCanonicalV10Value(body), httpStatus, usage, payload
    };
}

function fakeStory(brief: ChapterStoryBriefV10R8): ChapterStoryProposalV10R8 {
    const posture = brief.mode === 'collect' ? 'contest_coin' : brief.mode === 'defend' ? 'approach_chest' : 'hold_chest';
    const targetId = brief.mode === 'collect' ? brief.targetIds.find(id => id.startsWith('coin-')) :
        brief.mode === 'defend' ? 'player-chest' : 'loomkeeper-chest';
    if (!targetId) throw new Error('Fake story target is absent.');
    const evidenceId = brief.facts.find(fact => fact.id.startsWith('player.'))?.id;
    return {
        chapterClosure: 'The observed player turn ended; the next Loomkeeper turn is open.',
        playerReading: evidenceId ? {
            hypothesis: 'The player may repeat this observed action.', evidenceIds: [evidenceId],
            alternative: 'This may have been a one-off action.', watchFor: 'Whether it recurs next turn.'
        } : null,
        intention: { posture, targetId, horizonOwnTurns: 1,
            reason: 'Continue the fixed match objective.', watchFor: 'Whether the objective changes next turn.' }
    };
}

export async function runWp027ChapterShadow(mode: Mode): Promise<Readonly<Record<string, unknown>>> {
    const apiKey = mode === 'mistral' ? process.env.MISTRAL_API_KEY : undefined;
    if (mode === 'mistral' && (!apiKey || apiKey.length < 20)) {
        throw new Error('MISTRAL_API_KEY is not configured for the explicit shadow run.');
    }
    const fixtures = createWp027ChapterFixtures();
    const priorReadings = new Map<string, ChapterStoryProposalV10R8['playerReading']>();
    const rows: Record<string, unknown>[] = [];
    for (const fixture of fixtures) {
        const brief = buildChapterStoryBriefV10R8({
            decisionBrief: fixture.boundary.brief, observation: fixture.observation,
            priorReading: priorReadings.get(fixture.mode) ?? null
        });
        const row: Record<string, unknown> = {
            id: fixture.id, mode: fixture.mode, chapterIndex: fixture.chapterIndex,
            stateHash: brief.stateHash, observationBasis: brief.basisId,
            atlasBasis: fixture.boundary.brief.basisId,
            storyRequestHash: hashCanonicalV10Value(chapterStoryRequestBody(brief)),
            fallbackCandidateId: fixture.boundary.deterministicFallbackCandidate().candidateId
        };
        rows.push(row);
        if (mode === 'fixture-only') continue;
        const storyCall = mode === 'mistral'
            ? await callMistral(apiKey!, chapterStoryRequestBody(brief))
            : { outcome: 'complete', durationMs: 0, requestHash: row.storyRequestHash,
                httpStatus: null, usage: null, payload: fakeStory(brief) };
        row.storyCall = storyCall;
        if (storyCall.outcome !== 'complete') continue;
        try {
            const frozen = validateChapterStoryV10R8(brief, storyCall.payload);
            row.story = frozen;
            priorReadings.set(fixture.mode, frozen.proposal.playerReading);
            const comparison = matchChapterIntentionV10R8({
                storyBrief: brief, frozenStory: frozen, decisionBrief: fixture.boundary.brief,
                fallbackCandidateId: row.fallbackCandidateId as string
            });
            row.serverMatcher = comparison;
            row.serverCandidate = fixture.boundary.brief.legalCandidates.find(candidate =>
                candidate.candidateId === comparison.deterministicCandidateId);
            const fitBody = chapterFitRequestBody(fixture, frozen, comparison);
            const fitCall = mode === 'mistral'
                ? await callMistral(apiKey!, fitBody)
                : { outcome: 'complete', durationMs: 0, requestHash: hashCanonicalV10Value(fitBody),
                    httpStatus: null, usage: null, payload: {
                        candidateId: comparison.shortlist.at(-1), reason: 'Compare the frozen candidate cards.',
                        watchFor: 'The actual next-turn result.' } };
            row.fitCall = fitCall;
            if (fitCall.outcome === 'complete') {
                const choice = validateCandidateFitV10R8(comparison, fitCall.payload);
                row.modelFit = choice;
                row.modelCandidate = fixture.boundary.brief.legalCandidates.find(candidate =>
                    candidate.candidateId === choice.candidateId);
                row.sameCandidate = choice.candidateId === comparison.deterministicCandidateId;
                row.modelFitRank = comparison.ranked.findIndex(candidate => candidate.candidateId === choice.candidateId) + 1;
            }
        } catch (error) {
            row.validationError = error instanceof Error ? error.message : 'unknown_validation_error';
        }
    }
    const completed = rows.filter(row => row.story && row.modelFit);
    const comparisonReady = mode !== 'fixture-only' && completed.length === fixtures.length;
    const result = {
        version: VERSION, fixtureVersion: WP027_CHAPTER_FIXTURE_VERSION,
        generatedAt: new Date().toISOString(), mode,
        comparisonReady,
        strategicGatePassed: null,
        coverage: { fixtures: fixtures.length, storiesAndFitsValidated: completed.length,
            matchedSelections: completed.filter(row => row.sameCandidate).length },
        totalProviderMs: rows.reduce((sum, row) => {
            const story = row.storyCall as CallResult | undefined;
            const fit = row.fitCall as CallResult | undefined;
            return sum + (story?.durationMs ?? 0) + (fit?.durationMs ?? 0);
        }, 0),
        costUsdMicros: rows.reduce((sum, row) => {
            const story = row.storyCall as CallResult | undefined;
            const fit = row.fitCall as CallResult | undefined;
            return sum + (story?.usage?.estimatedCostUsdMicros ?? 0) + (fit?.usage?.estimatedCostUsdMicros ?? 0);
        }, 0),
        rows
    };
    await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
    await fs.writeFile(OUTPUT, JSON.stringify(result, null, 2) + '\n');
    return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const arg = process.argv[2];
    const mode: Mode = arg === '--fixture-only' ? 'fixture-only' :
        arg === '--local-fake' ? 'local-fake' : arg === '--provider=mistral' ? 'mistral' : (() => {
            throw new Error('Use --fixture-only, --local-fake, or --provider=mistral.');
        })();
    runWp027ChapterShadow(mode).then(result => {
        console.log(JSON.stringify({ artifact: OUTPUT, mode, comparisonReady: result.comparisonReady,
            strategicGatePassed: result.strategicGatePassed, coverage: result.coverage,
            totalProviderMs: result.totalProviderMs, costUsdMicros: result.costUsdMicros }));
        if (mode !== 'fixture-only' && !result.comparisonReady) process.exitCode = 1;
    }).catch(error => { console.error(error); process.exitCode = 1; });
}
