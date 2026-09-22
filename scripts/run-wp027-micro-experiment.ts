import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { WP027_MISTRAL_ENDPOINT, WP027_MISTRAL_MODEL_ID } from
    '../server/src/simulation/mistral-strategy-provider-v10-r8';
import {
    createWp027ProbeFixturesV10R8
} from '../server/src/simulation/loomkeeper-strategy-probes-v10-r8';
import {
    assembleMicroDecision,
    buildMicroCase,
    type ClaimAnswer,
    type ChoiceAnswer,
    type MicroCase
} from './wp027-micro-experiment-cases';

const VERSION = 'v10-r8-micro-decisions-r1';
const DEADLINE_MS = 60_000;
const OUTPUT = path.resolve('test-results/wp027-micro-experiment.json');
const STATUSES = ['supported', 'refuted', 'unknown'];
const ACTIONS = ['A', 'B', 'abstain'];
const EVIDENCE_IDS = ['event', 'A', 'B', 'limit'];

type JsonSchema = Readonly<Record<string, unknown>>;
type CallResult = Readonly<{
    kind: 'one-shot' | 'present' | 'future' | 'narrow-choice';
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

function card(testCase: MicroCase): Record<string, unknown> {
    return {
        objectiveMode: testCase.objectiveMode,
        committedTargetId: testCase.committedTargetId,
        currentMilestoneId: testCase.currentMilestoneId,
        evidence: testCase.evidence,
        policy: testCase.policy
    };
}

function requestFor(testCase: MicroCase, kind: CallResult['kind']): Readonly<{
    system: string;
    user: string;
    responseSchema: JsonSchema;
}> {
    const system = [
        'You are auditing one bounded NIMble Knots turn. The Loomkeeper and player alternate turns on destructible terrain.',
        'Options A and B are complete legal Loomkeeper turns. Objective objects can fall if support is removed.',
        'Use only evidence IDs event, A, B and limit. Distinguish current-turn facts from uncomputed future outcomes.',
        'Unknown means the supplied evidence neither establishes nor refutes a claim. Do not turn a plan or hope into an observed result.',
        'Return only the required JSON. Keep reason under 240 characters.'
    ].join('\n');
    const base = card(testCase);
    if (kind === 'one-shot') {
        return {
            system,
            user: JSON.stringify({
                task: 'In one response, classify both claims and choose A, B or abstain under the stated policy.',
                ...base,
                currentClaim: testCase.currentClaim,
                futureClaim: testCase.futureClaim
            }),
            responseSchema: oneShotSchema
        };
    }
    if (kind === 'present' || kind === 'future') {
        return {
            system,
            user: JSON.stringify({
                task: 'Classify only this one claim as supported, refuted or unknown; cite exactly one supplied evidence ID.',
                ...base,
                claim: kind === 'present' ? testCase.currentClaim : testCase.futureClaim
            }),
            responseSchema: claimSchema
        };
    }
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
    kind: CallResult['kind']
): Promise<CallResult> {
    const request = requestFor(testCase, kind);
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
                name: `wp027_micro_${kind.replace(/-/g, '_')}`,
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
                    ((kind === 'present' || kind === 'future') &&
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
    const testCases = createWp027ProbeFixturesV10R8().map(buildMicroCase);
    if (process.argv.includes('--fixture-only')) {
        console.log(JSON.stringify(testCases.map(item => ({
            id: item.id, options: item.options.map(option => option.candidateId),
            expectedCurrent: item.expectedCurrent, expectedFuture: item.expectedFuture,
            expectedAction: item.expectedAction
        }))));
        return;
    }
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey || apiKey.trim() !== apiKey || apiKey.length < 20) {
        throw new Error('MISTRAL_API_KEY is required in the controlled server shell.');
    }
    const rows = [];
    for (const [index, testCase] of testCases.entries()) {
        const order: CallResult['kind'][] = index % 2 === 0
            ? ['one-shot', 'present', 'future', 'narrow-choice']
            : ['present', 'future', 'narrow-choice', 'one-shot'];
        const calls: CallResult[] = [];
        for (const kind of order) {
            const call = await callMistral(apiKey, testCase, kind);
            calls.push(call);
            console.log(JSON.stringify({ caseId: testCase.id, kind, outcome: call.outcome,
                durationMs: call.durationMs }));
        }
        const byKind = (kind: CallResult['kind']) => calls.find(call => call.kind === kind)!;
        const present = claimAnswer(byKind('present'));
        const future = claimAnswer(byKind('future'));
        const narrow = choiceAnswer(byKind('narrow-choice'));
        const oneShot = byKind('one-shot').answer;
        rows.push({
            id: testCase.id,
            evidenceSha256: sha256(JSON.stringify(card(testCase))),
            optionCandidateIds: testCase.options.map(option => option.candidateId),
            expected: {
                present: testCase.expectedCurrent,
                future: testCase.expectedFuture,
                action: testCase.expectedAction,
                strategy: testCase.acceptedStrategy
            },
            order,
            calls,
            scores: {
                oneShotPresent: oneShot?.currentStatus === testCase.expectedCurrent.status,
                oneShotFuture: oneShot?.futureStatus === testCase.expectedFuture.status,
                oneShotAction: oneShot?.action === testCase.expectedAction,
                microPresent: present?.status === testCase.expectedCurrent.status &&
                    present.evidenceId === testCase.expectedCurrent.evidenceId,
                microFuture: future?.status === testCase.expectedFuture.status &&
                    future.evidenceId === testCase.expectedFuture.evidenceId,
                narrowAction: narrow?.action === testCase.expectedAction
            },
            assembled: assembleMicroDecision(testCase, present, future, narrow)
        });
    }
    const artifact = {
        version: VERSION,
        generatedAt: new Date().toISOString(),
        modelId: WP027_MISTRAL_MODEL_ID,
        providerDeadlineMs: DEADLINE_MS,
        releaseGate: false,
        sourceCommit: process.env.RENDER_GIT_COMMIT ?? null,
        cases: rows,
        totals: {
            calls: rows.reduce((sum, row) => sum + row.calls.length, 0),
            complete: rows.flatMap(row => row.calls).filter(call => call.outcome === 'complete').length,
            oneShotActions: rows.filter(row => row.scores.oneShotAction).length,
            oneShotPresentCorrect: rows.filter(row => row.scores.oneShotPresent).length,
            oneShotFutureUnknown: rows.filter(row => row.scores.oneShotFuture).length,
            microPresentCorrect: rows.filter(row => row.scores.microPresent).length,
            microFutureUnknown: rows.filter(row => row.scores.microFuture).length,
            narrowActions: rows.filter(row => row.scores.narrowAction).length,
            assembledExpectedActions: rows.filter(row => row.assembled.action === row.expected.action).length,
            acceptedPreferences: rows.filter(row => row.assembled.source === 'validated_preference').length,
            guardedAbstentions: rows.filter(row => row.assembled.source !== 'validated_preference').length,
            estimatedCostUsdMicros: rows.flatMap(row => row.calls).reduce((sum, call) =>
                sum + (call.usage?.estimatedCostUsdMicros ?? 0), 0)
        }
    };
    await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
    await fs.writeFile(OUTPUT, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ artifact: path.relative(process.cwd(), OUTPUT).replace(/\\/g, '/'),
        totals: artifact.totals }));
}

void main().catch(error => {
    console.error(error instanceof Error ? error.message : 'WP-027 micro experiment failed.');
    process.exitCode = 1;
});
