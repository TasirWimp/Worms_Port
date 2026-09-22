import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { WP027_MISTRAL_ENDPOINT, WP027_MISTRAL_MODEL_ID } from
    '../server/src/simulation/mistral-strategy-provider-v10-r8';
import { createWp027ProbeFixturesV10R8, type Wp027ProbeFixture } from
    '../server/src/simulation/loomkeeper-strategy-probes-v10-r8';
import {
    assembleMicroDecision,
    assembleMicroDecisionV2,
    buildMicroCase,
    type ClaimAnswer,
    type ChoiceAnswer,
    type MicroCase
} from './wp027-micro-experiment-cases';

const VERSION = 'v10-r8-micro-factorial-r2';
const DEADLINE_MS = 60_000;
const OUTPUT = path.resolve('test-results/wp027-factorial-experiment.json');
const STATUSES = ['supported', 'refuted', 'unknown'];
const ACTIONS = ['A', 'B', 'abstain'];
const EVIDENCE_IDS = ['event', 'A', 'B', 'limit'];

type Presentation = 'compact' | 'crowded';
type Kind = 'one-shot' | 'present' | 'future' | 'narrow-choice' | 'computed';
type JsonSchema = Readonly<Record<string, unknown>>;
type CallResult = Readonly<{
    kind: Kind;
    inputSha256: string;
    outcome: 'complete' | 'http_error' | 'timeout' | 'network_error' | 'invalid_response';
    durationMs: number;
    usage: Readonly<{
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        estimatedCostUsdMicros: number;
    }> | null;
    answer: Record<string, string> | null;
}>;

const stringEnum = (values: readonly string[]): JsonSchema => ({ type: 'string', enum: values });
const schema = (properties: Record<string, JsonSchema>): JsonSchema => ({
    type: 'object', additionalProperties: false, properties,
    required: Object.keys(properties)
});
const oneShotSchema = schema({
    currentStatus: stringEnum(STATUSES),
    futureStatus: stringEnum(STATUSES),
    action: stringEnum(ACTIONS),
    reason: { type: 'string' }
});
const claimSchema = schema({
    status: stringEnum(STATUSES),
    evidenceId: stringEnum(EVIDENCE_IDS),
    reason: { type: 'string' }
});
const choiceSchema = schema({ action: stringEnum(ACTIONS), reason: { type: 'string' } });

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

function factorialCard(
    testCase: MicroCase,
    fixture: Wp027ProbeFixture,
    presentation: Presentation
): Record<string, unknown> {
    const base = {
        objectiveMode: testCase.objectiveMode,
        committedTargetId: testCase.committedTargetId,
        currentMilestoneId: testCase.currentMilestoneId,
        evidence: testCase.evidence,
        policy: testCase.policy
    };
    if (presentation === 'compact') return base;
    return {
        ...base,
        background: {
            objective: fixture.boundary.brief.objective,
            currentStrategy: fixture.boundary.brief.currentStrategy,
            recentChanges: fixture.boundary.brief.recentChanges,
            battlefield: fixture.boundary.brief.battlefield,
            legalCandidates: fixture.boundary.brief.legalCandidates,
            pathAtlas: fixture.boundary.pathAtlas()
        }
    };
}

function requestFor(
    testCase: MicroCase,
    fixture: Wp027ProbeFixture,
    presentation: Presentation,
    kind: Kind
): Readonly<{ system: string; user: string; responseSchema: JsonSchema }> {
    const system = [
        'You are auditing one bounded NIMble Knots turn. The Loomkeeper and player alternate turns on destructible terrain.',
        'Only A, B or abstain are selectable. Other background candidates are context, never additional choices.',
        'Options A and B are complete legal Loomkeeper turns. Objective objects can fall if support is removed.',
        'Use only evidence IDs event, A, B and limit. Distinguish current-turn facts from uncomputed future outcomes.',
        'Unknown means the supplied evidence neither establishes nor refutes a claim. Do not turn a plan or hope into an observed result.',
        'Return only the required JSON. Keep reason under 240 characters.'
    ].join('\n');
    const base = factorialCard(testCase, fixture, presentation);
    if (kind === 'one-shot') return {
        system,
        user: JSON.stringify({
            task: 'In one response, classify both claims and choose A, B or abstain under the stated policy.',
            ...base,
            currentClaim: testCase.currentClaim,
            futureClaim: testCase.futureClaim
        }),
        responseSchema: oneShotSchema
    };
    if (kind === 'present' || kind === 'future' || kind === 'computed') return {
        system,
        user: JSON.stringify({
            task: 'Classify only this one claim as supported, refuted or unknown; cite exactly one supplied evidence ID.',
            ...base,
            claim: kind === 'present' ? testCase.currentClaim :
                kind === 'future' ? testCase.futureClaim : testCase.computedClaim
        }),
        responseSchema: claimSchema
    };
    return {
        system,
        user: JSON.stringify({
            task: 'Choose only A, B or abstain under the stated policy. The claim statuses below were certified from source facts; future unknown is not a negative outcome.',
            ...base,
            certifiedCurrentStatus: testCase.expectedCurrent.status,
            certifiedFutureStatus: testCase.expectedFuture.status,
            currentClaim: testCase.currentClaim,
            futureClaim: testCase.futureClaim
        }),
        responseSchema: choiceSchema
    };
}

function parseAnswer(text: string, required: readonly string[]): Record<string, string> {
    const answer: unknown = JSON.parse(text);
    if (!answer || typeof answer !== 'object' || Array.isArray(answer)) throw new Error('Invalid answer.');
    const object = answer as Record<string, unknown>;
    if (Object.keys(object).length !== required.length ||
        required.some(key => typeof object[key] !== 'string')) throw new Error('Invalid answer fields.');
    if ((object.reason as string).length > 240) throw new Error('Reason is too long.');
    return object as Record<string, string>;
}

function completionText(content: unknown): string {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) throw new Error('Missing completion.');
    const text = content.filter(item => item?.type === 'text').map(item => item.text);
    if (text.length !== 1 || typeof text[0] !== 'string') throw new Error('Invalid completion parts.');
    return text[0];
}

async function callMistral(
    apiKey: string,
    testCase: MicroCase,
    fixture: Wp027ProbeFixture,
    presentation: Presentation,
    kind: Kind
): Promise<CallResult> {
    const request = requestFor(testCase, fixture, presentation, kind);
    const body = JSON.stringify({
        model: WP027_MISTRAL_MODEL_ID,
        messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.user }
        ],
        reasoning_effort: 'high',
        response_format: {
            type: 'json_schema',
            json_schema: {
                name: `wp027_factorial_${kind.replace(/-/g, '_')}`,
                schema: request.responseSchema,
                strict: true
            }
        },
        stream: false
    });
    const started = performance.now();
    let outcome: CallResult['outcome'] = 'complete';
    let usage: CallResult['usage'] = null;
    let answer: Record<string, string> | null = null;
    let acceptedHttp = false;
    try {
        const response = await fetch(WP027_MISTRAL_ENDPOINT, {
            method: 'POST',
            signal: AbortSignal.timeout(DEADLINE_MS),
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body
        });
        if (!response.ok) {
            outcome = 'http_error';
        } else {
            acceptedHttp = true;
            const payload = await response.json() as Record<string, unknown>;
            const choices = payload.choices as Array<Record<string, unknown>> | undefined;
            if (!choices || choices.length !== 1 || choices[0].finish_reason !== 'stop') {
                outcome = 'invalid_response';
            } else {
                const message = choices[0].message as Record<string, unknown>;
                const required = kind === 'one-shot'
                    ? ['currentStatus', 'futureStatus', 'action', 'reason']
                    : kind === 'narrow-choice' ? ['action', 'reason'] : ['status', 'evidenceId', 'reason'];
                answer = parseAnswer(completionText(message.content), required);
                if ((kind === 'one-shot' && (!STATUSES.includes(answer.currentStatus) ||
                    !STATUSES.includes(answer.futureStatus) || !ACTIONS.includes(answer.action))) ||
                    (kind === 'narrow-choice' && !ACTIONS.includes(answer.action)) ||
                    (kind !== 'one-shot' && kind !== 'narrow-choice' &&
                        (!STATUSES.includes(answer.status) || !EVIDENCE_IDS.includes(answer.evidenceId)))) {
                    throw new Error('Unexpected enum.');
                }
            }
            const rawUsage = payload.usage as Record<string, unknown> | undefined;
            if (rawUsage && Number.isSafeInteger(rawUsage.prompt_tokens) &&
                Number.isSafeInteger(rawUsage.completion_tokens) &&
                Number.isSafeInteger(rawUsage.total_tokens)) {
                const inputTokens = rawUsage.prompt_tokens as number;
                const outputTokens = rawUsage.completion_tokens as number;
                usage = {
                    inputTokens,
                    outputTokens,
                    totalTokens: rawUsage.total_tokens as number,
                    estimatedCostUsdMicros: Math.ceil(inputTokens * 0.15 + outputTokens * 0.60)
                };
            }
        }
    } catch (error) {
        outcome = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
            ? 'timeout' : acceptedHttp ? 'invalid_response' : 'network_error';
        answer = null;
    }
    return {
        kind,
        inputSha256: sha256(body),
        outcome,
        durationMs: Math.round(performance.now() - started),
        usage,
        answer
    };
}

function claimAnswer(call: CallResult): ClaimAnswer | null {
    if (call.outcome !== 'complete' || !call.answer) return null;
    return call.answer as ClaimAnswer;
}

function choiceAnswer(call: CallResult): ChoiceAnswer | null {
    if (call.outcome !== 'complete' || !call.answer) return null;
    return call.answer as ChoiceAnswer;
}

async function main(): Promise<void> {
    const fixtures = createWp027ProbeFixturesV10R8();
    const cases = fixtures.map(buildMicroCase);
    if (process.argv.includes('--fixture-only')) {
        console.log(JSON.stringify(fixtures.flatMap((fixture, index) =>
            (['compact', 'crowded'] as const).map(presentation => ({
                id: fixture.id,
                presentation,
                cardBytes: JSON.stringify(factorialCard(cases[index], fixture, presentation)).length,
                optionCandidateIds: cases[index].options.map(option => option.candidateId),
                expectedAction: cases[index].expectedAction,
                computedClaim: cases[index].computedClaim,
                computedStatus: 'supported',
                futureStatus: cases[index].expectedFuture.status
            }))
        )));
        return;
    }
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey || apiKey.trim() !== apiKey || apiKey.length < 20) {
        throw new Error('MISTRAL_API_KEY is required in the controlled server shell.');
    }
    const rows = [];
    for (const [index, fixture] of fixtures.entries()) {
        const testCase = cases[index];
        const presentations: Presentation[] = index % 2 === 0
            ? ['compact', 'crowded'] : ['crowded', 'compact'];
        for (const [presentationIndex, presentation] of presentations.entries()) {
            const order: Kind[] = (index + presentationIndex) % 2 === 0
                ? ['one-shot', 'present', 'future', 'narrow-choice', 'computed']
                : ['computed', 'present', 'future', 'narrow-choice', 'one-shot'];
            const calls: CallResult[] = [];
            for (const kind of order) {
                const call = await callMistral(apiKey, testCase, fixture, presentation, kind);
                calls.push(call);
                console.log(JSON.stringify({ caseId: testCase.id, presentation, kind,
                    outcome: call.outcome, durationMs: call.durationMs }));
            }
            const byKind = (kind: Kind) => calls.find(call => call.kind === kind)!;
            const present = claimAnswer(byKind('present'));
            const future = claimAnswer(byKind('future'));
            const computed = claimAnswer(byKind('computed'));
            const narrow = choiceAnswer(byKind('narrow-choice'));
            const oneShot = byKind('one-shot').answer;
            rows.push({
                id: testCase.id,
                presentation,
                cardSha256: sha256(JSON.stringify(factorialCard(testCase, fixture, presentation))),
                cardBytes: JSON.stringify(factorialCard(testCase, fixture, presentation)).length,
                optionCandidateIds: testCase.options.map(option => option.candidateId),
                expected: {
                    present: testCase.expectedCurrent,
                    future: testCase.expectedFuture,
                    computed: { status: 'supported', evidenceId: testCase.computedEvidenceId },
                    action: testCase.expectedAction,
                    strategy: testCase.acceptedStrategy
                },
                order,
                calls,
                scores: {
                    oneShotPresent: oneShot?.currentStatus === testCase.expectedCurrent.status,
                    oneShotFuture: oneShot?.futureStatus === testCase.expectedFuture.status,
                    oneShotAction: oneShot?.action === testCase.expectedAction,
                    microPresentStatus: present?.status === testCase.expectedCurrent.status,
                    microFutureStatus: future?.status === testCase.expectedFuture.status,
                    computedStatus: computed?.status === 'supported',
                    presentCanonicalCitation: present?.evidenceId === testCase.expectedCurrent.evidenceId,
                    futureCanonicalCitation: future?.evidenceId === testCase.expectedFuture.evidenceId,
                    computedCanonicalCitation: computed?.evidenceId === testCase.computedEvidenceId,
                    narrowAction: narrow?.action === testCase.expectedAction
                },
                assembledR1: assembleMicroDecision(testCase, present, future, narrow),
                assembledV2: assembleMicroDecisionV2(testCase, present, future, narrow)
            });
        }
    }
    const byPresentation = (presentation: Presentation) => rows.filter(row => row.presentation === presentation);
    const count = (items: typeof rows, field: keyof (typeof rows)[number]['scores']) =>
        items.filter(row => row.scores[field]).length;
    const summary = (items: typeof rows) => ({
        arms: items.length,
        completeCalls: items.flatMap(row => row.calls).filter(call => call.outcome === 'complete').length,
        oneShotActions: count(items, 'oneShotAction'),
        narrowActions: count(items, 'narrowAction'),
        oneShotFutureUnknown: count(items, 'oneShotFuture'),
        microFutureUnknown: count(items, 'microFutureStatus'),
        computedSupported: count(items, 'computedStatus'),
        assembledR1Expected: items.filter(row => row.assembledR1.action === row.expected.action).length,
        assembledV2Expected: items.filter(row => row.assembledV2.action === row.expected.action).length,
        acceptedR1Preferences: items.filter(row => row.assembledR1.source === 'validated_preference').length,
        acceptedV2Preferences: items.filter(row => row.assembledV2.source === 'validated_preference').length,
        estimatedCostUsdMicros: items.flatMap(row => row.calls).reduce((sum, call) =>
            sum + (call.usage?.estimatedCostUsdMicros ?? 0), 0)
    });
    const artifact = {
        version: VERSION,
        generatedAt: new Date().toISOString(),
        modelId: WP027_MISTRAL_MODEL_ID,
        providerDeadlineMs: DEADLINE_MS,
        releaseGate: false,
        sourceCommit: process.env.RENDER_GIT_COMMIT ?? null,
        rows,
        totals: {
            ...summary(rows),
            calls: rows.flatMap(row => row.calls).length,
            compact: summary(byPresentation('compact')),
            crowded: summary(byPresentation('crowded'))
        }
    };
    await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
    await fs.writeFile(OUTPUT, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ artifact: path.relative(process.cwd(), OUTPUT).replace(/\\/g, '/'),
        totals: artifact.totals }));
}

void main().catch(error => {
    console.error(error instanceof Error ? error.message : 'WP-027 factorial experiment failed.');
    process.exitCode = 1;
});
