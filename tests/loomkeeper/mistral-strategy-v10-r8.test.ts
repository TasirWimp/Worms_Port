import assert from 'node:assert/strict';
import test from 'node:test';

import {
    MistralStrategicDecisionProviderV10R8,
    WP027_MISTRAL_ENDPOINT,
    WP027_MISTRAL_MODEL_ID
} from '../../server/src/simulation/mistral-strategy-provider-v10-r8';
import { loomkeeperStrategyRuntimeFromEnvironmentV10R8 } from '../../server/src/simulation/loomkeeper-strategy-config-v10-r8';
import {
    createWp027ProbeFixturesV10R8,
    evaluateWp027ProbeV10R8
} from '../../server/src/simulation/loomkeeper-strategy-probes-v10-r8';
import { StrategicProviderOperationalErrorV10R8 } from '../../server/src/simulation/loomkeeper-strategy-provider-v10-r8';

const TEST_API_KEY = 'wp027-mistral-test-key-1234567890';

test('WP-027 Mistral transport sends one bounded structured request and records usage', async () => {
    const fixture = createWp027ProbeFixturesV10R8()[0];
    const firstCandidate = fixture.boundary.brief.legalCandidates[0];
    const decision = {
        candidateId: firstCandidate.candidateId,
        strategy: 'switch',
        targetId: fixture.boundary.brief.strategyVocabulary.targetIds[0],
        milestoneId: fixture.boundary.brief.strategyVocabulary.milestoneIds[0],
        horizonOwnTurns: 2,
        reason: 'Advance the multi-turn objective while preserving a legal follow-up.',
        watchFor: 'The player may alter the route before the next turn.'
    };
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const provider = new MistralStrategicDecisionProviderV10R8(TEST_API_KEY, async (input, init) => {
        capturedUrl = String(input);
        capturedInit = init;
        return new Response(JSON.stringify({
            choices: [{
                finish_reason: 'stop',
                message: { role: 'assistant', content: JSON.stringify(decision) }
            }],
            usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 }
        }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const response = await provider.decide({
        promptVersion: 'v10-r8-strategic-prompt-r4',
        brief: fixture.boundary.brief,
        signal: new AbortController().signal,
        deadlineMs: 8_000
    });

    assert.equal(provider.mode, 'mistral_shadow');
    assert.equal(provider.modelId, WP027_MISTRAL_MODEL_ID);
    assert.equal(WP027_MISTRAL_MODEL_ID, 'mistral-small-2603');
    assert.equal(capturedUrl, WP027_MISTRAL_ENDPOINT);
    assert.equal(capturedInit?.method, 'POST');
    assert.equal((capturedInit?.headers as Record<string, string>).Authorization, `Bearer ${TEST_API_KEY}`);
    const body = JSON.parse(String(capturedInit?.body));
    assert.equal(body.model, 'mistral-small-2603');
    assert.equal(body.reasoning_effort, 'low');
    assert.equal(body.max_tokens, 2_048);
    assert.equal(body.stream, false);
    assert.equal(body.response_format.type, 'json_schema');
    assert.equal(body.response_format.json_schema.strict, true);
    assert.match(body.messages[0].content, /turn-based 2D tactics game/);
    assert.match(body.messages[0].content, /Mode Collect:/);
    assert.doesNotMatch(body.messages[0].content, /Mode Defend:|Mode Claim:/);
    const providerInput = JSON.parse(body.messages[1].content);
    assert.equal(providerInput.brief.legalCandidates.some((candidate: Record<string, unknown>) =>
        'deterministicFallback' in candidate), false);
    assert.deepEqual(body.response_format.json_schema.schema.anyOf[0].properties.candidateId.enum,
        fixture.boundary.brief.legalCandidates.map(candidate => candidate.candidateId));
    assert.deepEqual(response.payload, decision);
    assert.deepEqual(response.usage, {
        inputTokens: 120,
        outputTokens: 30,
        thinkingTokens: 0,
        totalTokens: 150,
        estimatedCostUsdMicros: 36
    });
});

test('WP-027 Mistral transport accepts one text block alongside hidden reasoning', async () => {
    const fixture = createWp027ProbeFixturesV10R8()[0];
    const decision = {
        candidateId: null,
        strategy: null,
        targetId: null,
        milestoneId: null,
        horizonOwnTurns: null,
        reason: 'The bounded brief cannot establish the missing support fact.',
        watchFor: null
    };
    const provider = new MistralStrategicDecisionProviderV10R8(TEST_API_KEY, async () =>
        new Response(JSON.stringify({
            choices: [{
                finish_reason: 'stop',
                message: { content: [
                    { type: 'thinking', thinking: Object.freeze([]) },
                    { type: 'text', text: JSON.stringify(decision) }
                ] }
            }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        }), { status: 200 }));
    const response = await provider.decide({
        promptVersion: 'v10-r8-strategic-prompt-r4',
        brief: fixture.boundary.brief,
        signal: new AbortController().signal,
        deadlineMs: 8_000
    });
    assert.deepEqual(response.payload, decision);
});

test('WP-027 Mistral transport exposes only bounded operational failure categories', async () => {
    const fixture = createWp027ProbeFixturesV10R8()[0];
    const request = {
        promptVersion: 'v10-r8-strategic-prompt-r4' as const,
        brief: fixture.boundary.brief,
        signal: new AbortController().signal,
        deadlineMs: 8_000
    };
    const cases = [
        [429, 'provider_http_rate_limited'],
        [401, 'provider_http_auth_rejected'],
        [422, 'provider_http_request_rejected'],
        [503, 'provider_http_unavailable'],
        [302, 'provider_http_unexpected_status']
    ] as const;
    for (const [status, diagnostic] of cases) {
        const provider = new MistralStrategicDecisionProviderV10R8(TEST_API_KEY,
            async () => new Response('private provider body', { status }));
        await assert.rejects(() => provider.decide(request), error =>
            error instanceof StrategicProviderOperationalErrorV10R8 && error.diagnostic === diagnostic &&
            !error.message.includes('private provider body'));
    }
    const invalid = new MistralStrategicDecisionProviderV10R8(TEST_API_KEY,
        async () => new Response('{"private":"malformed-provider-shape"}', { status: 200 }));
    await assert.rejects(() => invalid.decide(request), error =>
        error instanceof StrategicProviderOperationalErrorV10R8 &&
        error.diagnostic === 'provider_response_invalid' && !error.message.includes('malformed-provider-shape'));
});

test('WP-027 Mistral configuration requires the exact server-side model and key', () => {
    assert.throws(() => loomkeeperStrategyRuntimeFromEnvironmentV10R8({
        LOOMKEEPER_PROVIDER: 'mistral-shadow'
    }), /MISTRAL_MODEL/);
    assert.throws(() => loomkeeperStrategyRuntimeFromEnvironmentV10R8({
        LOOMKEEPER_PROVIDER: 'mistral-shadow',
        MISTRAL_MODEL: 'mistral-small-2603'
    }), /MISTRAL_API_KEY/);
    assert.throws(() => loomkeeperStrategyRuntimeFromEnvironmentV10R8({
        LOOMKEEPER_PROVIDER: 'mistral-shadow',
        MISTRAL_MODEL: 'mistral-small-latest',
        MISTRAL_API_KEY: TEST_API_KEY
    }), /frozen stable model mistral-small-2603/);
    assert.throws(() => loomkeeperStrategyRuntimeFromEnvironmentV10R8({
        LOOMKEEPER_PROVIDER: 'mistral-shadow',
        MISTRAL_MODEL: 'mistral-small-2603',
        MISTRAL_API_KEY: TEST_API_KEY,
        WP014_QUALITY_TEST: 'true'
    }), /refuse an external/);
    const configured = loomkeeperStrategyRuntimeFromEnvironmentV10R8({
        LOOMKEEPER_PROVIDER: 'mistral-shadow',
        MISTRAL_MODEL: 'mistral-small-2603',
        MISTRAL_API_KEY: TEST_API_KEY
    }, async () => new Response('', { status: 500 }), () => {});
    assert.equal(configured.mode, 'mistral-shadow');
    assert.equal(configured.strategicAdapter?.provider.mode, 'mistral_shadow');
    assert.equal(configured.strategicAdapter?.provider.modelId, 'mistral-small-2603');
});

test('WP-027 Mistral shadow proposals retain deterministic execution authority', () => {
    const fixture = createWp027ProbeFixturesV10R8()[0];
    const candidate = fixture.boundary.brief.legalCandidates.find(item =>
        item.candidateId !== fixture.boundary.deterministicFallbackCandidate().candidateId) ??
        fixture.boundary.brief.legalCandidates[0];
    const result = evaluateWp027ProbeV10R8(fixture, {
        outcome: 'selected',
        decision: {
            candidateId: candidate.candidateId,
            strategy: 'switch',
            targetId: fixture.boundary.brief.strategyVocabulary.targetIds[0],
            milestoneId: fixture.boundary.brief.strategyVocabulary.milestoneIds[0],
            horizonOwnTurns: 2,
            reason: 'Preserve the longer route to the objective.',
            watchFor: 'The player may alter the route.'
        },
        providerMode: 'mistral_shadow',
        modelId: 'mistral-small-2603',
        usage: { inputTokens: 100, outputTokens: 20, thinkingTokens: 0, totalTokens: 120,
            estimatedCostUsdMicros: 27 },
        responseBytes: 240,
        diagnostic: null,
        timingMs: { preparation: 100, provider: 1_000, validation: 1, total: 1_101 }
    });
    assert.equal(result.authoritySafe, true);
    assert.equal(result.deterministicCandidateId, fixture.boundary.deterministicFallbackCandidate().candidateId);
});
