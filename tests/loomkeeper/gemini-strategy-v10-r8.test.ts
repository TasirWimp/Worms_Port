import assert from 'node:assert/strict';
import test from 'node:test';

import {
    GeminiStrategicDecisionProviderV10R8,
    WP027_GEMINI_ENDPOINT,
    WP027_GEMINI_MODEL_ID
} from '../../server/src/simulation/gemini-strategy-provider-v10-r8';
import { loomkeeperStrategyRuntimeFromEnvironmentV10R8 } from '../../server/src/simulation/loomkeeper-strategy-config-v10-r8';
import {
    createWp027ProbeFixturesV10R8,
    createWp027ProbeScenarioV10R8,
    evaluateWp027ProbeV10R8,
    prepareWp027ProbeFixtureV10R8,
    summarizeWp027ProbesV10R8
} from '../../server/src/simulation/loomkeeper-strategy-probes-v10-r8';
import {
    StrategicDecisionAdapterV10R8,
    StrategicProviderOperationalErrorV10R8,
    type StrategicDecisionProviderRequestV10R8,
    type StrategicDecisionProviderV10R8,
    type StrategicProviderResultV10R8
} from '../../server/src/simulation/loomkeeper-strategy-provider-v10-r8';
import { StrategicShadowTelemetryV10R8 } from '../../server/src/simulation/loomkeeper-strategy-telemetry-v10-r8';
import {
    authorizeStrategicTurnV10R8
} from '../../server/src/simulation/loomkeeper-strategic-turn-v10-r8';
import { LiveSimulationCoordinatorV10 } from '../../server/src/simulation/coordinator-v10-live';
import { VersionedSimulationCoordinator } from '../../server/src/simulation/versioned-coordinator';
import { CoordinatorReplayV10AutomatedSchema } from '../../shared/protocol-v10-live';
import { V10_R6_DYNAMICS } from '../../shared/simulation-v10';
import { V10_R8_RULESET_ID } from '../../shared/simulation-v10-r8';
import type {
    StrategicDecisionV10R8,
    StrategicTurnRecordV10R8
} from '../../shared/strategic-voyage-v10-r8';

const TEST_API_KEY = 'wp027-test-api-key-1234567890';

test('WP-027 Gemini transport sends one bounded structured request and records usage', async () => {
    const fixture = createWp027ProbeFixturesV10R8()[0];
    const decision = decisionFor(fixture, 'switch');
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const provider = new GeminiStrategicDecisionProviderV10R8('gemini_shadow', TEST_API_KEY,
        async (input, init) => {
            capturedUrl = String(input);
            capturedInit = init;
            return new Response(JSON.stringify({
                candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(decision) }] } }],
                usageMetadata: {
                    promptTokenCount: 120,
                    candidatesTokenCount: 30,
                    thoughtsTokenCount: 20,
                    totalTokenCount: 170
                }
            }), { status: 200, headers: { 'content-type': 'application/json' } });
        });
    const response = await provider.decide({
        promptVersion: 'v10-r8-strategic-prompt-r3',
        brief: fixture.boundary.brief,
        signal: new AbortController().signal,
        deadlineMs: 8_000
    });

    assert.equal(provider.modelId, WP027_GEMINI_MODEL_ID);
    assert.equal(WP027_GEMINI_MODEL_ID, 'gemini-3.6-flash');
    assert.equal(WP027_GEMINI_ENDPOINT,
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent');
    assert.equal(capturedUrl, WP027_GEMINI_ENDPOINT);
    assert.equal(capturedInit?.method, 'POST');
    assert.equal((capturedInit?.headers as Record<string, string>)['x-goog-api-key'], TEST_API_KEY);
    const body = JSON.parse(String(capturedInit?.body));
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'low');
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    assert.match(body.systemInstruction.parts[0].text, /no longer than 160 characters/);
    assert.match(body.systemInstruction.parts[0].text, /identifiers and list positions carry no preference/);
    assert.match(body.systemInstruction.parts[0].text, /y:xStart-xEnd:before>after/);
    const providerInput = JSON.parse(body.contents[0].parts[0].text);
    assert.equal(providerInput.brief.legalCandidates.some((candidate: Record<string, unknown>) =>
        'deterministicFallback' in candidate), false);
    assert.ok(providerInput.brief.legalCandidates.every((candidate: Record<string, unknown>) =>
        typeof candidate.worldDelta === 'object'));
    assert.match(body.generationConfig.responseJsonSchema.anyOf[0].properties.reason.description, /1 to 160/);
    assert.match(body.generationConfig.responseJsonSchema.anyOf[0].properties.watchFor.description, /1 to 160/);
    assert.match(body.generationConfig.responseJsonSchema.anyOf[1].properties.reason.description, /1 to 160/);
    assert.deepEqual(body.generationConfig.responseJsonSchema.anyOf[0].properties.candidateId.enum,
        fixture.boundary.brief.legalCandidates.map(candidate => candidate.candidateId));
    assert.deepEqual(response.payload, decision);
    assert.deepEqual(response.usage, {
        inputTokens: 120,
        outputTokens: 30,
        thinkingTokens: 20,
        totalTokens: 170,
        estimatedCostUsdMicros: 278
    });
});

test('WP-027 Gemini transport exposes only bounded operational failure categories', async () => {
    const brief = createWp027ProbeFixturesV10R8()[0].boundary.brief;
    const request = {
        promptVersion: 'v10-r8-strategic-prompt-r3' as const,
        brief,
        signal: new AbortController().signal,
        deadlineMs: 8_000
    };
    const cases = [
        [429, 'provider_http_rate_limited'],
        [403, 'provider_http_auth_rejected'],
        [400, 'provider_http_request_rejected'],
        [503, 'provider_http_unavailable'],
        [302, 'provider_http_unexpected_status']
    ] as const;
    for (const [status, diagnostic] of cases) {
        const provider = new GeminiStrategicDecisionProviderV10R8('gemini_shadow', TEST_API_KEY,
            async () => new Response('private provider body', { status }));
        await assert.rejects(() => provider.decide(request), error =>
            error instanceof StrategicProviderOperationalErrorV10R8 && error.diagnostic === diagnostic &&
            !error.message.includes('private provider body'));
    }
    const network = new GeminiStrategicDecisionProviderV10R8('gemini_shadow', TEST_API_KEY,
        async () => { throw new TypeError('private network detail'); });
    await assert.rejects(() => network.decide(request), error =>
        error instanceof StrategicProviderOperationalErrorV10R8 &&
        error.diagnostic === 'provider_network_failure' && !error.message.includes('private network detail'));

    const bodyReadFailure = new GeminiStrategicDecisionProviderV10R8('gemini_shadow', TEST_API_KEY,
        async () => ({
            ok: true,
            status: 200,
            headers: new Headers(),
            text: async () => { throw new TypeError('private response stream detail'); }
        } as Response));
    await assert.rejects(() => bodyReadFailure.decide(request), error =>
        error instanceof StrategicProviderOperationalErrorV10R8 &&
        error.diagnostic === 'provider_network_failure' && !error.message.includes('private response stream detail'));

    const invalid = new GeminiStrategicDecisionProviderV10R8('gemini_shadow', TEST_API_KEY,
        async () => new Response('{"private":"malformed-provider-shape"}', { status: 200 }));
    await assert.rejects(() => invalid.decide(request), error =>
        error instanceof StrategicProviderOperationalErrorV10R8 &&
        error.diagnostic === 'provider_response_invalid' && !error.message.includes('malformed-provider-shape'));
});

test('WP-027 provider configuration is deterministic by default and fails closed when external setup is incomplete', () => {
    assert.deepEqual(loomkeeperStrategyRuntimeFromEnvironmentV10R8({}), { mode: 'deterministic' });
    assert.throws(() => loomkeeperStrategyRuntimeFromEnvironmentV10R8({
        LOOMKEEPER_PROVIDER: 'gemini-shadow'
    }), /GEMINI_MODEL/);
    assert.throws(() => loomkeeperStrategyRuntimeFromEnvironmentV10R8({
        LOOMKEEPER_PROVIDER: 'gemini-shadow',
        GEMINI_MODEL: 'gemini-3.6-flash'
    }), /GEMINI_API_KEY/);
    assert.throws(() => loomkeeperStrategyRuntimeFromEnvironmentV10R8({
        LOOMKEEPER_PROVIDER: 'gemini-shadow',
        GEMINI_MODEL: 'gemini-3.6-flash',
        GEMINI_API_KEY: TEST_API_KEY,
        WP014_QUALITY_TEST: 'true'
    }), /refuse an external/);
    assert.throws(() => loomkeeperStrategyRuntimeFromEnvironmentV10R8({
        LOOMKEEPER_PROVIDER: 'gemini-shadow',
        GEMINI_MODEL: 'gemini-3.8-flash',
        GEMINI_API_KEY: TEST_API_KEY
    }), /frozen stable model gemini-3\.6-flash/);
    const configured = loomkeeperStrategyRuntimeFromEnvironmentV10R8({
        LOOMKEEPER_PROVIDER: 'gemini-shadow',
        GEMINI_MODEL: 'gemini-3.6-flash',
        GEMINI_API_KEY: TEST_API_KEY
    }, async () => new Response('', { status: 500 }), () => {});
    assert.equal(configured.mode, 'gemini-shadow');
    assert.equal(configured.strategicAdapter?.provider.mode, 'gemini_shadow');
});

test('WP-027 fixed probes enforce shadow authority and prospective release thresholds', () => {
    const fixtures = createWp027ProbeFixturesV10R8();
    const temporaryCost = fixtures.find(fixture => fixture.id === 'temporary-cost-preparation')!;
    assert.match(temporaryCost.currentStrategy.acceptedTemporaryCost ?? '', /only future route/);
    assert.match(temporaryCost.recentChanges.observedResult ?? '', /temporary distance loss/);
    assert.ok(temporaryCost.boundary.brief.legalCandidates.every(candidate =>
        candidate.worldDelta.committedTargetAfter?.id === temporaryCost.currentStrategy.targetId));
    assert.ok(temporaryCost.boundary.brief.legalCandidates.some(candidate =>
        candidate.worldDelta.asciiRuns.length > 0 && candidate.worldDelta.actorsAfter.length > 0));
    const rebuiltTemporaryCost = prepareWp027ProbeFixtureV10R8(
        createWp027ProbeScenarioV10R8('temporary-cost-preparation'));
    assert.equal(rebuiltTemporaryCost.boundary.evidence().briefHash,
        temporaryCost.boundary.evidence().briefHash);
    const results = fixtures.map(fixture => {
        let decision: StrategicDecisionV10R8;
        if (fixture.id === 'temporary-cost-preparation') {
            const candidate = fixture.boundary.brief.legalCandidates.find(item =>
                (item.immediate.objectiveScoreDelta < 0 ||
                    (item.immediate.objectiveDistanceDelta ?? 0) < 0 ||
                    item.immediate.ownStitchingDelta < 0) &&
                item.opportunities.some(opportunity => /objective|future route|closer/i.test(opportunity)));
            assert.ok(candidate);
            decision = decisionFor(fixture, 'continue', candidate.candidateId,
                fixture.currentStrategy.targetId!, fixture.currentStrategy.milestoneId!);
        } else if (fixture.id === 'continue-through-setback') {
            decision = decisionFor(fixture, 'continue', undefined,
                fixture.currentStrategy.targetId!, fixture.currentStrategy.milestoneId!);
        } else if (fixture.id === 'repair-destroyed-route') {
            decision = decisionFor(fixture, 'repair');
        } else if (fixture.id === 'preserve-future-option') {
            const minimum = Math.min(...fixture.boundary.brief.legalCandidates.map(item =>
                item.immediate.terrainCellsRemoved));
            const candidate = fixture.boundary.brief.legalCandidates.find(item =>
                item.immediate.terrainCellsRemoved === minimum)!;
            decision = decisionFor(fixture, 'refine', candidate.candidateId);
        } else {
            decision = {
                candidateId: null,
                strategy: null,
                targetId: null,
                milestoneId: null,
                horizonOwnTurns: null,
                reason: 'The bounded brief cannot establish the missing support fact.',
                watchFor: null
            };
        }
        return evaluateWp027ProbeV10R8(fixture, providerResult(decision));
    });
    const report = summarizeWp027ProbesV10R8(results);
    assert.equal(results.every(result => result.authoritySafe), true);
    assert.equal(results.every(result => result.diagnostic === null), true);
    assert.equal(results.every(result => result.timingMs.preparation === 100), true);
    assert.equal(report.passed, true);
    assert.deepEqual(report.totals, {
        calls: 5,
        valid: 5,
        useful: 5,
        onTime: 5,
        providerFallbacks: 0,
        authorityViolations: 0,
        p95Ms: 1_000,
        estimatedCostUsdMicros: 5_000
    });

    const failed = evaluateWp027ProbeV10R8(fixtures[0], {
        outcome: 'provider_error',
        decision: null,
        providerMode: 'gemini_shadow',
        modelId: 'gemini-3.6-flash',
        usage: null,
        responseBytes: null,
        diagnostic: 'provider_http_unavailable',
        timingMs: { preparation: 1_250, provider: 500, validation: 0, total: 1_750 }
    });
    assert.equal(failed.diagnostic, 'provider_http_unavailable');
    assert.equal(failed.timingMs.preparation, 1_250);
});

test('WP-027 telemetry emits source-correct operational facts without model prose', () => {
    const fixture = createWp027ProbeFixturesV10R8()[0];
    const secretReason = 'private model prose must not enter telemetry';
    const selected = authorizeStrategicTurnV10R8({
        boundary: fixture.boundary,
        state: fixture.state,
        currentStrategy: fixture.currentStrategy,
        providerResult: providerResult({ ...decisionFor(fixture, 'switch'), reason: secretReason })
    });
    const lines: string[] = [];
    const telemetry = new StrategicShadowTelemetryV10R8(line => lines.push(line));
    telemetry.observe(selected.record);
    const unavailable = authorizeStrategicTurnV10R8({
        boundary: fixture.boundary,
        state: fixture.state,
        currentStrategy: fixture.currentStrategy,
        providerResult: {
            outcome: 'provider_error',
            decision: null,
            providerMode: 'gemini_shadow',
            modelId: 'gemini-3.6-flash',
            usage: null,
            responseBytes: null,
            diagnostic: 'provider_http_rate_limited',
            timingMs: { preparation: 200, provider: 300, validation: 0, total: 500 }
        }
    });
    telemetry.observe(unavailable.record);
    assert.equal(lines.length, 2);
    assert.doesNotMatch(lines[0], new RegExp(secretReason));
    assert.match(lines[0], /"providerMode":"gemini_shadow"/);
    assert.match(lines[1], /"diagnostic":"provider_http_rate_limited"/);
    assert.deepEqual(telemetry.summary(), {
        observedTurns: 2,
        selectedProposals: 1,
        abstentions: 0,
        invalidOrUnavailable: 1,
        deterministicSelections: 2,
        p50TotalMs: 500,
        p95TotalMs: 1_000,
        totalTokens: 100,
        estimatedCostUsdMicros: 1_000
    });
});

test('WP-027 shadow replay retains the unexecuted proposal and reconstructs provider-free', async () => {
    let calls = 0;
    const adapter = new StrategicDecisionAdapterV10R8(shadowProvider(request => {
        calls += 1;
        const candidate = request.brief.legalCandidates[0];
        return {
            candidateId: candidate.candidateId,
            strategy: 'switch',
            targetId: request.brief.strategyVocabulary.targetIds[0],
            milestoneId: 'approach-objective',
            horizonOwnTurns: 2,
            reason: 'Preserve the longer objective path.',
            watchFor: 'The player may alter the route.'
        };
    }));
    const observations: StrategicTurnRecordV10R8[] = [];
    const live = new LiveSimulationCoordinatorV10({
        nowUs: () => 0,
        strategicAdapter: adapter,
        onStrategicTurnObserved: record => observations.push(record)
    });
    const verifier = new VersionedSimulationCoordinator();
    const challengeId = 'wp027_shadow_replay_01';
    try {
        live.createAutomated(challengeId, 'wp027_shadow_owner_01', 4, 'wizard', { objectiveMode: 'collect' });
        live.advance(challengeId, V10_R6_DYNAMICS.actionTicks + 60);
        await live.waitForStrategicDecision(challengeId);
        assert.equal(observations.length, 1);
        assert.equal(observations[0].status, 'pending');
        assert.equal(replay(live, challengeId).strategicTurns.length, 0,
            'telemetry observes the validated proposal before execution is retained');
        for (let attempt = 0; attempt < 400; attempt += 1) {
            live.advance(challengeId, 6);
            const current = replay(live, challengeId);
            if (current.strategicTurns[0]?.status === 'committed') break;
        }
        const retained = replay(live, challengeId);
        assert.equal(retained.strategicTurns[0].providerMode, 'gemini_shadow');
        assert.equal(retained.strategicTurns[0].decisionSource, 'deterministic_fallback');
        assert.ok(retained.strategicTurns[0].providerDecision?.candidateId);
        const reconstructed = await verifier.reconstructAndVerifyAsync(retained);
        assert.equal(reconstructed.stateHash, live.get(challengeId)?.stateHash);
        assert.equal(calls, 1);
    } finally {
        live.dispose();
        verifier.dispose();
    }
});

function decisionFor(
    fixture: ReturnType<typeof createWp027ProbeFixturesV10R8>[number],
    strategy: Extract<StrategicDecisionV10R8, { candidateId: string }>['strategy'],
    candidateId?: string,
    targetId?: string,
    milestoneId?: string
): Extract<StrategicDecisionV10R8, { candidateId: string }> {
    const candidate = candidateId ?? fixture.boundary.brief.legalCandidates[0].candidateId;
    return {
        candidateId: candidate,
        strategy,
        targetId: targetId ?? fixture.boundary.brief.strategyVocabulary.targetIds[0],
        milestoneId: milestoneId ?? 'approach-objective',
        horizonOwnTurns: 2,
        reason: 'Advance the multi-turn objective while preserving a legal follow-up.',
        watchFor: 'The player may alter the route before the next turn.'
    };
}

function providerResult(decision: StrategicDecisionV10R8): StrategicProviderResultV10R8 {
    return {
        outcome: decision.candidateId === null ? 'abstained' : 'selected',
        decision,
        providerMode: 'gemini_shadow',
        modelId: 'gemini-3.6-flash',
        usage: {
            inputTokens: 50,
            outputTokens: 20,
            thinkingTokens: 30,
            totalTokens: 100,
            estimatedCostUsdMicros: 1_000
        },
        responseBytes: Buffer.byteLength(JSON.stringify(decision)),
        diagnostic: null,
        timingMs: { preparation: 100, provider: 890, validation: 10, total: 1_000 }
    };
}

function shadowProvider(
    decide: (request: StrategicDecisionProviderRequestV10R8) => StrategicDecisionV10R8
): StrategicDecisionProviderV10R8 {
    return {
        mode: 'gemini_shadow',
        modelId: 'gemini-3.6-flash',
        decide: async request => ({
            payload: decide(request),
            usage: {
                inputTokens: 50,
                outputTokens: 20,
                thinkingTokens: 30,
                totalTokens: 100,
                estimatedCostUsdMicros: 1_000
            }
        })
    };
}

function replay(live: LiveSimulationCoordinatorV10, challengeId: string) {
    const parsed = CoordinatorReplayV10AutomatedSchema.parse(live.replay(challengeId));
    assert.equal(parsed.rulesetId, V10_R8_RULESET_ID);
    if (parsed.rulesetId !== V10_R8_RULESET_ID) throw new Error('Expected R8 replay.');
    return parsed;
}
