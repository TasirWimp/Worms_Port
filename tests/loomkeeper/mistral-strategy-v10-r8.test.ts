import assert from 'node:assert/strict';
import test from 'node:test';
import { inflateSync } from 'node:zlib';

import {
    MistralStrategicDecisionProviderV10R8,
    WP027_MISTRAL_ENDPOINT,
    WP027_MISTRAL_MODEL_ID
} from '../../server/src/simulation/mistral-strategy-provider-v10-r8';
import { loomkeeperStrategyRuntimeFromEnvironmentV10R8 } from '../../server/src/simulation/loomkeeper-strategy-config-v10-r8';
import {
    renderCandidatePathImageV10R8,
    WP027_CANDIDATE_PATH_IMAGE_VERSION
} from '../../server/src/simulation/loomkeeper-candidate-path-image-v10-r8';
import {
    createWp027ProbeFixturesV10R8,
    evaluateWp027ProbeV10R8,
    WP027_MISTRAL_PROBE_THRESHOLDS
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
        pathAtlas: fixture.boundary.pathAtlas(),
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
    assert.equal(body.reasoning_effort, 'high');
    assert.equal('max_tokens' in body, false);
    assert.equal(body.stream, false);
    assert.equal(body.response_format.type, 'json_schema');
    assert.equal(body.response_format.json_schema.strict, true);
    assert.match(body.messages[0].content, /turn-based 2D tactics game/);
    assert.match(body.messages[0].content, /Mode Collect:/);
    assert.doesNotMatch(body.messages[0].content, /Mode Defend:|Mode Claim:/);
    assert.deepEqual(body.messages[1].content.map((part: { type: string }) => part.type),
        ['text', 'image_url']);
    const providerInput = JSON.parse(body.messages[1].content[0].text);
    assert.equal(providerInput.legalCandidates.some((candidate: Record<string, unknown>) =>
        'deterministicFallback' in candidate), false);
    assert.equal('ascii' in providerInput.battlefield, false);
    assert.equal(providerInput.legalCandidates.some((candidate: { after: Record<string, unknown> }) =>
        'asciiRuns' in candidate.after), false);
    assert.deepEqual(providerInput.legalCandidates.map((candidate: { path: { candidateId: string } }) =>
        candidate.path.candidateId), fixture.boundary.brief.legalCandidates.map(candidate => candidate.candidateId));
    assert.equal(body.messages[1].content[1].image_url,
        `data:image/png;base64,${renderCandidatePathImageV10R8(fixture.boundary.brief, fixture.boundary.pathAtlas()).toString('base64')}`);
    const schema = body.response_format.json_schema.schema;
    assert.equal(schema.type, 'object');
    assert.equal(schema.additionalProperties, false);
    assert.equal('anyOf' in schema, false);
    assert.deepEqual(schema.properties.candidateId.anyOf[0].enum,
        fixture.boundary.brief.legalCandidates.map(candidate => candidate.candidateId));
    assert.deepEqual(schema.properties.candidateId.anyOf[1], { type: 'null' });
    assert.deepEqual(schema.required,
        ['candidateId', 'strategy', 'targetId', 'milestoneId', 'horizonOwnTurns', 'reason', 'watchFor']);
    assert.deepEqual(response.payload, decision);
    assert.deepEqual(response.usage, {
        inputTokens: 120,
        outputTokens: 30,
        thinkingTokens: 0,
        totalTokens: 150,
        estimatedCostUsdMicros: 36
    });
});

test('WP-027 Mistral path sheet is deterministic, bounded and bound to legal candidate order', () => {
    const fixtures = createWp027ProbeFixturesV10R8();
    assert.equal(WP027_CANDIDATE_PATH_IMAGE_VERSION, 'v10-r8-candidate-path-r1');
    for (const fixture of fixtures) {
        const brief = fixture.boundary.brief;
        const atlas = fixture.boundary.pathAtlas();
        const png = renderCandidatePathImageV10R8(brief, atlas);
        assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
        assert.equal(png.readUInt32BE(16), 900);
        assert.equal(png.readUInt32BE(20), 24 + atlas.paths.length * 48);
        assert.deepEqual(renderCandidatePathImageV10R8(brief, atlas), png);
        const pixels = inflateSync(png.subarray(41, png.length - 16));
        assert.equal(pixels.length, png.readUInt32BE(20) * (900 * 4 + 1));
        assert.ok(atlas.paths.every(path => path.waypoints.length >= 1 && path.waypoints.length <= 16));
        assert.throws(() => renderCandidatePathImageV10R8(brief, {
            ...atlas, paths: [...atlas.paths].reverse()
        }), /does not match/);
    }
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
                    { type: 'thinking', thinking: [{ type: 'text', text: 'x'.repeat(70_000) }] },
                    { type: 'text', text: JSON.stringify(decision) }
                ] }
            }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        }), { status: 200 }));
    const response = await provider.decide({
        promptVersion: 'v10-r8-strategic-prompt-r4',
        brief: fixture.boundary.brief,
        pathAtlas: fixture.boundary.pathAtlas(),
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
        pathAtlas: fixture.boundary.pathAtlas(),
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

test('WP-027 Mistral gets a full provider minute after preparation and accepts parallel matches', async () => {
    const fixture = createWp027ProbeFixturesV10R8()[0];
    const decision = {
        candidateId: null, strategy: null, targetId: null, milestoneId: null,
        horizonOwnTurns: null, reason: 'Insufficient evidence for a strategic selection.', watchFor: null
    };
    const requests: RequestInit[] = [];
    const releases: Array<() => void> = [];
    const runtime = loomkeeperStrategyRuntimeFromEnvironmentV10R8({
        LOOMKEEPER_PROVIDER: 'mistral-shadow',
        MISTRAL_MODEL: 'mistral-small-2603',
        MISTRAL_API_KEY: TEST_API_KEY
    }, async (_input, init) => {
        requests.push(init!);
        await new Promise<void>(resolve => { releases.push(resolve); });
        return new Response(JSON.stringify({
            choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(decision) } }],
            usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
        }), { status: 200 });
    }, () => {});
    const adapter = runtime.strategicAdapter!;
    const active = Array.from({ length: 3 }, (_, index) =>
        adapter.request(`wp027_mistral_parallel_${index}`, fixture.boundary.brief,
            index === 0 ? 59_000 : 0, fixture.boundary.pathAtlas()));
    for (let attempt = 0; attempt < 10 && requests.length < 3; attempt += 1) await Promise.resolve();
    assert.equal(requests.length, 3);
    assert.equal(adapter.diagnostics().active, 3);
    for (const request of requests) assert.equal((request.signal as AbortSignal).aborted, false);
    releases.forEach(release => release());
    const results = await Promise.all(active);
    assert.deepEqual(results.map(result => result.outcome), ['abstained', 'abstained', 'abstained']);
    assert.ok(results[0].timingMs.total >= 59_000);
});

test('WP-027 Mistral shadow has no process request budget or failure circuit', async () => {
    const fixture = createWp027ProbeFixturesV10R8()[0];
    let calls = 0;
    const runtime = loomkeeperStrategyRuntimeFromEnvironmentV10R8({
        LOOMKEEPER_PROVIDER: 'mistral-shadow',
        MISTRAL_MODEL: 'mistral-small-2603',
        MISTRAL_API_KEY: TEST_API_KEY
    }, async () => {
        calls += 1;
        return new Response('', { status: 503 });
    }, () => {});
    const adapter = runtime.strategicAdapter!;
    for (let index = 0; index < 251; index += 1) {
        const result = await adapter.request(`wp027_mistral_uncapped_${index}`, fixture.boundary.brief,
            index === 0 ? 59_000 : 0, fixture.boundary.pathAtlas());
        assert.equal(result.outcome, 'provider_error');
    }
    assert.equal(calls, 251);
    assert.equal(adapter.diagnostics().circuitOpen, false);
});

test('WP-027 Mistral probe gate retains quality checks without latency or cost ceiling', () => {
    assert.equal(WP027_MISTRAL_PROBE_THRESHOLDS.maximumP95Ms, null);
    assert.equal(WP027_MISTRAL_PROBE_THRESHOLDS.maximumCostUsdMicros, null);
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
