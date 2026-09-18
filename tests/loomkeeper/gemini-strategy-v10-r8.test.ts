import assert from 'node:assert/strict';
import test from 'node:test';

import { GeminiStrategicDecisionProviderV10R8, WP027_GEMINI_ENDPOINT } from '../../server/src/simulation/gemini-strategy-provider-v10-r8';
import { loomkeeperStrategyRuntimeFromEnvironmentV10R8 } from '../../server/src/simulation/loomkeeper-strategy-config-v10-r8';
import {
    createWp027ProbeFixturesV10R8,
    evaluateWp027ProbeV10R8,
    summarizeWp027ProbesV10R8
} from '../../server/src/simulation/loomkeeper-strategy-probes-v10-r8';
import {
    StrategicDecisionAdapterV10R8,
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
        promptVersion: 'v10-r8-strategic-prompt-r1',
        brief: fixture.boundary.brief,
        signal: new AbortController().signal,
        deadlineMs: 6_000
    });

    assert.equal(capturedUrl, WP027_GEMINI_ENDPOINT);
    assert.equal(capturedInit?.method, 'POST');
    assert.equal((capturedInit?.headers as Record<string, string>)['x-goog-api-key'], TEST_API_KEY);
    const body = JSON.parse(String(capturedInit?.body));
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'low');
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
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

test('WP-027 provider configuration is deterministic by default and fails closed when external setup is incomplete', () => {
    assert.deepEqual(loomkeeperStrategyRuntimeFromEnvironmentV10R8({}), { mode: 'deterministic' });
    assert.throws(() => loomkeeperStrategyRuntimeFromEnvironmentV10R8({
        LOOMKEEPER_PROVIDER: 'gemini-shadow'
    }), /GEMINI_MODEL/);
    assert.throws(() => loomkeeperStrategyRuntimeFromEnvironmentV10R8({
        LOOMKEEPER_PROVIDER: 'gemini-shadow',
        GEMINI_MODEL: 'gemini-3.8-flash'
    }), /GEMINI_API_KEY/);
    assert.throws(() => loomkeeperStrategyRuntimeFromEnvironmentV10R8({
        LOOMKEEPER_PROVIDER: 'gemini-shadow',
        GEMINI_MODEL: 'gemini-3.8-flash',
        GEMINI_API_KEY: TEST_API_KEY,
        WP014_QUALITY_TEST: 'true'
    }), /refuse an external/);
    const configured = loomkeeperStrategyRuntimeFromEnvironmentV10R8({
        LOOMKEEPER_PROVIDER: 'gemini-shadow',
        GEMINI_MODEL: 'gemini-3.8-flash',
        GEMINI_API_KEY: TEST_API_KEY
    }, async () => new Response('', { status: 500 }), () => {});
    assert.equal(configured.mode, 'gemini-shadow');
    assert.equal(configured.strategicAdapter?.provider.mode, 'gemini_shadow');
});

test('WP-027 fixed probes enforce shadow authority and prospective release thresholds', () => {
    const fixtures = createWp027ProbeFixturesV10R8();
    const results = fixtures.map(fixture => {
        let decision: StrategicDecisionV10R8;
        if (fixture.id === 'temporary-cost-preparation') {
            const candidate = fixture.boundary.brief.legalCandidates.find(item =>
                item.immediate.objectiveScoreDelta < 0 ||
                (item.immediate.objectiveDistanceDelta ?? 0) < 0 ||
                item.immediate.ownStitchingDelta < 0);
            assert.ok(candidate);
            decision = decisionFor(fixture, 'switch', candidate.candidateId);
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
    assert.equal(lines.length, 1);
    assert.doesNotMatch(lines[0], new RegExp(secretReason));
    assert.match(lines[0], /"providerMode":"gemini_shadow"/);
    assert.deepEqual(telemetry.summary(), {
        observedTurns: 1,
        selectedProposals: 1,
        abstentions: 0,
        invalidOrUnavailable: 0,
        deterministicSelections: 1,
        p50TotalMs: 1_000,
        p95TotalMs: 1_000,
        totalTokens: 100,
        estimatedCostUsdMicros: 1_000
    });
});

test('WP-027 shadow replay retains the unexecuted proposal and reconstructs provider-free', async () => {
    let calls = 0;
    const adapter = new StrategicDecisionAdapterV10R8(shadowProvider(request => {
        calls += 1;
        const candidate = request.brief.legalCandidates.find(item => !item.deterministicFallback) ??
            request.brief.legalCandidates[0];
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
        modelId: 'gemini-3.8-flash',
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
        modelId: 'gemini-3.8-flash',
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
