import assert from 'node:assert/strict';
import test from 'node:test';

import { LiveSimulationCoordinatorV10 } from '../../server/src/simulation/coordinator-v10-live';
import {
    StrategicDecisionAdapterV10R8,
    type StrategicDecisionProviderRequestV10R8,
    type StrategicDecisionProviderV10R8,
    type StrategicProviderResultV10R8
} from '../../server/src/simulation/loomkeeper-strategy-provider-v10-r8';
import {
    buildStrategicDecisionBoundaryV10R8,
    type StrategicDecisionBoundaryV10R8,
    type StrategicDecisionBriefV10R8
} from '../../server/src/simulation/loomkeeper-strategy-v10-r8';
import {
    authorizeStrategicTurnV10R8,
    deriveRecentStrategicChangesV10R8
} from '../../server/src/simulation/loomkeeper-strategic-turn-v10-r8';
import { VersionedSimulationCoordinator } from '../../server/src/simulation/versioned-coordinator';
import { LoomkeeperPlannerV10R8 } from '../../shared/loomkeeper-v10-r8';
import { CoordinatorReplayV10AutomatedSchema } from '../../shared/protocol-v10-live';
import { V10_R6_DYNAMICS } from '../../shared/simulation-v10';
import {
    advanceSimulationTicksV10R8,
    createSimulationV10R8,
    V10_R8_RULESET_ID,
    type SimulationStateV10R8
} from '../../shared/simulation-v10-r8';
import type {
    CommittedStrategicVoyageV10R8,
    StrategicDecisionV10R8
} from '../../shared/strategic-voyage-v10-r8';

test('WP-027 adapter accepts one strict selection and records abstention without retry', async () => {
    const boundary = collectBoundary('wp027_adapter_valid');
    const requests: StrategicDecisionProviderRequestV10R8[] = [];
    const selected = validDecision(boundary.brief);
    const adapter = new StrategicDecisionAdapterV10R8(localProvider('strict-fake', request => {
        requests.push(request);
        return requests.length === 1 ? selected : abstention();
    }), { nowMs: () => 10 });

    const first = await adapter.request('wp027_adapter_match_01', boundary.brief, 40);
    assert.equal(first.outcome, 'selected');
    assert.deepEqual(first.decision, selected);
    assert.equal(first.responseBytes, Buffer.byteLength(JSON.stringify(selected)));
    assert.equal(requests[0].promptVersion, 'v10-r8-strategic-prompt-r3');
    assert.equal(requests[0].brief, boundary.brief);
    assert.equal(requests[0].deadlineMs, 7_960);

    const second = await adapter.request('wp027_adapter_match_02', boundary.brief, 0);
    assert.equal(second.outcome, 'abstained');
    assert.deepEqual(second.decision, abstention());
    assert.equal(adapter.diagnostics().requests, 2);
});

test('WP-027 adapter falls back once for invalid, late and unavailable providers', async () => {
    const boundary = collectBoundary('wp027_adapter_failure');
    let malformedCalls = 0;
    const malformed = new StrategicDecisionAdapterV10R8(localProvider('malformed-fake', () => {
        malformedCalls += 1;
        return { candidateId: 'c01', extraAuthority: 'fire-anything' };
    }));
    const invalid = await malformed.request('wp027_invalid_match_01', boundary.brief, 0);
    assert.equal(invalid.outcome, 'invalid_response');
    assert.equal(invalid.decision, null);
    assert.equal(malformedCalls, 1);

    let timedCalls = 0;
    let aborted = false;
    const slow = new StrategicDecisionAdapterV10R8(localProvider('slow-fake', request => {
        timedCalls += 1;
        request.signal.addEventListener('abort', () => { aborted = true; }, { once: true });
        return new Promise(resolve => setTimeout(() => resolve(validDecision(request.brief)), 25));
    }), { deadlineMs: 2 });
    const timeout = await slow.request('wp027_timeout_match_1', boundary.brief, 0);
    assert.equal(timeout.outcome, 'timeout');
    assert.equal(timeout.decision, null);
    assert.equal(timedCalls, 1);
    assert.equal(aborted, true);

    const exhaustedBeforeCall = await slow.request('wp027_timeout_match_2', boundary.brief, 2);
    assert.equal(exhaustedBeforeCall.outcome, 'timeout');
    assert.equal(timedCalls, 1);
});

test('WP-027 adapter records end-to-end timing as preparation plus provider and validation', async () => {
    const boundary = collectBoundary('wp027_adapter_timing');
    const readings = [100, 100, 250, 250, 255];
    const adapter = new StrategicDecisionAdapterV10R8(localProvider('timing-fake', request =>
        validDecision(request.brief)), { nowMs: () => readings.shift() ?? 255 });

    const result = await adapter.request('wp027_timing_match_01', boundary.brief, 40);

    assert.deepEqual(result.timingMs, {
        preparation: 40,
        provider: 150,
        validation: 5,
        total: 195
    });
});

test('WP-027 adapter enforces circuit, request-budget and concurrency envelopes', async () => {
    const brief = collectBoundary('wp027_adapter_limits').brief;
    let now = 100;
    let circuitCalls = 0;
    const circuit = new StrategicDecisionAdapterV10R8(localProvider('circuit-fake', request => {
        circuitCalls += 1;
        if (circuitCalls === 1) throw new Error('simulated provider outage');
        return validDecision(request.brief);
    }), { failureThreshold: 1, circuitCooldownMs: 5, nowMs: () => now });
    const unclassified = await circuit.request('wp027_circuit_match1', brief, 0);
    assert.equal(unclassified.outcome, 'provider_error');
    assert.equal(unclassified.diagnostic, 'provider_unclassified_failure');
    assert.equal((await circuit.request('wp027_circuit_match2', brief, 0)).outcome, 'circuit_open');
    assert.equal(circuitCalls, 1);
    now = 106;
    assert.equal((await circuit.request('wp027_circuit_match3', brief, 0)).outcome, 'selected');
    assert.equal(circuitCalls, 2);

    const budget = new StrategicDecisionAdapterV10R8(localProvider('budget-fake', request =>
        validDecision(request.brief)), { maxRequests: 1 });
    assert.equal((await budget.request('wp027_budget_match_01', brief, 0)).outcome, 'selected');
    assert.equal((await budget.request('wp027_budget_match_02', brief, 0)).outcome, 'spend_limit');

    let release: ((value: unknown) => void) | undefined;
    const concurrent = new StrategicDecisionAdapterV10R8(localProvider('concurrent-fake', () =>
        new Promise(resolve => { release = resolve; })), { maxConcurrentRequests: 1 });
    const active = concurrent.request('wp027_active_match_01', brief, 0);
    await Promise.resolve();
    assert.equal((await concurrent.request('wp027_blocked_match1', brief, 0)).outcome, 'concurrency_limit');
    release?.(validDecision(brief));
    assert.equal((await active).outcome, 'selected');
});

test('WP-027 authorization binds current semantics, fallback attribution and original deadlines', () => {
    const boundary = collectBoundary('wp027_authorize_001');
    const decision = validDecision(boundary.brief);
    const selected = authorizeStrategicTurnV10R8({
        boundary,
        state: collectState(),
        providerResult: providerResult(decision)
    });
    assert.equal(selected.record.decisionSource, 'local_fake');
    assert.equal(selected.record.operationalOutcome, 'selected');
    assert.equal(selected.record.selectedCandidateId, decision.candidateId);
    assert.equal(selected.record.status, 'pending');
    assert.equal(selected.record.committedVoyage, null);

    const rejected = authorizeStrategicTurnV10R8({
        boundary: collectBoundary('wp027_authorize_002'),
        state: collectState(),
        providerResult: providerResult({ ...decision, targetId: 'cross_match_target' })
    });
    assert.equal(rejected.record.operationalOutcome, 'invalid_response');
    assert.equal(rejected.record.decisionSource, 'deterministic_fallback');
    assert.match(rejected.record.diagnostic ?? '', /current brief/);

    const abstained = authorizeStrategicTurnV10R8({
        boundary: collectBoundary('wp027_authorize_003'),
        state: collectState(),
        providerResult: providerResult(abstention(), 'abstained')
    });
    assert.equal(abstained.record.operationalOutcome, 'abstained');
    assert.equal(abstained.record.decisionSource, 'deterministic_fallback');

    const continuedBoundary = collectBoundary('wp027_authorize_004');
    const continuedDecision = validDecision(continuedBoundary.brief, 'continue');
    const current: CommittedStrategicVoyageV10R8 = {
        targetId: continuedDecision.targetId,
        milestoneId: continuedDecision.milestoneId,
        originalDueOwnTurn: 6,
        acceptedTemporaryCost: 'Yield immediate distance to preserve the route.',
        invalidationConditions: ['target is no longer active'],
        unresolvedConcerns: ['player may remove the landing shelf']
    };
    const continued = authorizeStrategicTurnV10R8({
        boundary: continuedBoundary,
        state: collectState(),
        currentStrategy: current,
        providerResult: providerResult(continuedDecision)
    });
    assert.equal(continued.record.proposedVoyage?.originalDueOwnTurn, 6);

    const costBoundary = collectBoundary('wp027_authorize_005');
    const costlyCandidate = costBoundary.brief.legalCandidates.find(candidate =>
        candidate.immediate.objectiveScoreDelta < 0 ||
        (candidate.immediate.objectiveDistanceDelta ?? 0) < 0 ||
        candidate.immediate.ownStitchingDelta < 0);
    assert.ok(costlyCandidate, 'the atlas must retain at least one explicit temporary-cost choice');
    const costly = authorizeStrategicTurnV10R8({
        boundary: costBoundary,
        state: collectState(),
        providerResult: providerResult({
            ...validDecision(costBoundary.brief),
            candidateId: costlyCandidate.candidateId
        })
    });
    assert.equal(costly.record.proposedVoyage?.acceptedTemporaryCost, costlyCandidate.risks[0]);
});

test('WP-027 feedback attributes player counteractions separately from system changes', () => {
    const previous = collectState();
    const current = structuredClone(previous) as any;
    current.units[0].xFp += 3 * 256;
    current.units[0].stitching -= 5;
    current.objective.scores.player += 1;
    current.terrainRevision += 1;
    current.objective.objects[0].status = 'lost';
    const changes = deriveRecentStrategicChangesV10R8({
        previous,
        current,
        currentStrategy: {
            targetId: previous.objective.objects[0].id,
            milestoneId: 'preserve-route',
            originalDueOwnTurn: 4,
            acceptedTemporaryCost: null,
            invalidationConditions: ['target is no longer active'],
            unresolvedConcerns: ['player may remove the landing shelf']
        },
        previousAction: 'Loomkeeper preserved the upper route.',
        observedResult: 'The upper route remained usable.'
    });
    assert.deepEqual(changes.playerChanges, [
        'Player moved 3 world units right.',
        'Player stitching changed by -5.',
        'Player objective score changed by 1.'
    ]);
    assert.deepEqual(changes.systemChanges, [
        `Terrain revision changed from ${previous.terrainRevision} to ${current.terrainRevision}.`,
        `${previous.objective.objects[0].id} changed from active to lost.`
    ]);
    assert.deepEqual(changes.unresolvedConcerns, ['player may remove the landing shelf']);
});

test('WP-027 coordinator persists selection before execution and reconstructs without a provider', async () => {
    let providerCalls = 0;
    let providerBrief: StrategicDecisionBriefV10R8 | undefined;
    let release: ((value: unknown) => void) | undefined;
    const adapter = new StrategicDecisionAdapterV10R8(localProvider('atomic-fake', request => {
        providerCalls += 1;
        providerBrief = request.brief;
        return new Promise(resolve => { release = resolve; });
    }));
    const live = new LiveSimulationCoordinatorV10({ nowUs: () => 0, strategicAdapter: adapter });
    const verifier = new VersionedSimulationCoordinator();
    const challengeId = 'wp027_atomic_replay_01';
    try {
        live.createAutomated(challengeId, 'wp027_atomic_owner_01', 4, 'wizard', { objectiveMode: 'collect' });
        live.advance(challengeId, V10_R6_DYNAMICS.actionTicks + 60);
        await Promise.resolve();
        assert.equal(providerCalls, 1);
        const waiting = r8Replay(live, challengeId);
        assert.equal(waiting.strategicTurns.length, 0);
        assert.equal(waiting.chosenPlans.length, 0);

        if (!providerBrief || !release) throw new Error('Local fake did not receive its bounded brief.');
        const decision = validDecision(providerBrief);
        release(decision);
        await live.waitForStrategicDecision(challengeId);
        const ready = r8Replay(live, challengeId);
        assert.equal(ready.strategicTurns.length, 0);
        assert.equal(ready.chosenPlans.length, 0);

        live.advance(challengeId, 1);
        const executing = r8Replay(live, challengeId);
        assert.equal(executing.strategicTurns.length, 1);
        assert.equal(executing.chosenPlans.length, 1);
        assert.equal(executing.strategicTurns[0].status, 'executing');
        assert.equal(executing.strategicTurns[0].selectedCandidateId, decision.candidateId);
        assert.equal(executing.strategicTurns[0].decisionSource, 'local_fake');

        for (let attempt = 0; attempt < 400 &&
            r8Replay(live, challengeId).strategicTurns[0]?.status !== 'committed'; attempt += 1) {
            live.advance(challengeId, 6);
        }
        const committed = r8Replay(live, challengeId);
        assert.equal(committed.strategicTurns[0].status, 'committed');
        assert.deepEqual(committed.strategicTurns[0].committedVoyage,
            committed.strategicTurns[0].proposedVoyage);
        assert.match(committed.strategicTurns[0].observedStateHash ?? '', /^[a-f0-9]{64}$/);
        assert.equal(providerCalls, 1);

        const reconstructed = await verifier.reconstructAndVerifyAsync(committed);
        assert.equal(reconstructed.stateHash, live.get(challengeId)?.stateHash);
        assert.equal(providerCalls, 1, 'replay must not call the provider');

        const tampered = structuredClone(committed);
        tampered.strategicTurns[0].observedStateHash = 'f'.repeat(64);
        await assert.rejects(() => verifier.reconstructAndVerifyAsync(tampered), /policy proof|changed|boundary/);
    } finally {
        live.dispose();
        verifier.dispose();
    }
});

test('WP-027 deletion cancels an uncommitted decision and its persisted prefix reconstructs provider-free', async () => {
    let calls = 0;
    let aborted = false;
    const adapter = new StrategicDecisionAdapterV10R8(localProvider('lifecycle-fake', request => {
        calls += 1;
        if (calls > 1) return validDecision(request.brief);
        return new Promise((_, reject) => request.signal.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('cancelled by match deletion'));
        }, { once: true }));
    }));
    const live = new LiveSimulationCoordinatorV10({ nowUs: () => 0, strategicAdapter: adapter });
    const verifier = new VersionedSimulationCoordinator();
    const challengeId = 'wp027_crash_recovery_1';
    try {
        live.createAutomated(challengeId, 'wp027_crash_owner_0001', 4, 'wizard', { objectiveMode: 'collect' });
        live.advance(challengeId, V10_R6_DYNAMICS.actionTicks + 60);
        await Promise.resolve();
        assert.equal(calls, 1);
        const stateHash = live.get(challengeId)?.stateHash;
        const replay = r8Replay(live, challengeId);
        assert.equal(replay.strategicTurns.length, 0);
        assert.equal(live.delete(challengeId), true);
        assert.equal(aborted, true);
        assert.equal(live.get(challengeId), undefined);
        const recovered = await verifier.reconstructAndVerifyAsync(replay);
        assert.equal(recovered.stateHash, stateHash);
        assert.equal(calls, 1);
        const extended = structuredClone(replay);
        const last = extended.records.at(-1);
        if (!last || last.operation.kind !== 'ticks') throw new Error('Expected a final coalesced tick record.');
        (last.operation as { kind: 'ticks'; count: number }).count += 1;
        await assert.rejects(() => verifier.reconstructAndVerifyAsync(extended),
            /missing the current turn record/);
    } finally {
        live.dispose();
        verifier.dispose();
    }
});

function localProvider(
    modelId: string,
    decide: (request: StrategicDecisionProviderRequestV10R8) => unknown | Promise<unknown>
): StrategicDecisionProviderV10R8 {
    return Object.freeze({
        mode: 'local_fake' as const,
        modelId,
        decide: async request => Object.freeze({ payload: await decide(request), usage: null })
    });
}

function validDecision(
    brief: StrategicDecisionBriefV10R8,
    strategy: Extract<StrategicDecisionV10R8, { candidateId: string }>['strategy'] = 'switch'
): Extract<StrategicDecisionV10R8, { candidateId: string }> {
    const candidate = brief.legalCandidates[0];
    return Object.freeze({
        candidateId: candidate.candidateId,
        strategy,
        targetId: brief.strategyVocabulary.targetIds[0],
        milestoneId: 'approach-objective',
        horizonOwnTurns: 2,
        reason: 'Advance the current objective while preserving a legal follow-up.',
        watchFor: 'The player may alter the supporting route before the next turn.'
    });
}

function abstention(): StrategicDecisionV10R8 {
    return Object.freeze({
        candidateId: null,
        strategy: null,
        targetId: null,
        milestoneId: null,
        horizonOwnTurns: null,
        reason: 'The bounded brief does not support a safer strategic distinction.',
        watchFor: null
    });
}

function providerResult(
    decision: StrategicDecisionV10R8,
    outcome: StrategicProviderResultV10R8['outcome'] = 'selected'
): StrategicProviderResultV10R8 {
    return Object.freeze({
        outcome,
        decision,
        providerMode: 'local_fake',
        modelId: 'authorization-fake',
        usage: null,
        responseBytes: Buffer.byteLength(JSON.stringify(decision)),
        diagnostic: null,
        timingMs: Object.freeze({ preparation: 10, provider: 1, validation: 1, total: 12 })
    });
}

function collectBoundary(challengeId: string): StrategicDecisionBoundaryV10R8 {
    const state = collectState();
    const planner = new LoomkeeperPlannerV10R8(state);
    for (let tick = 0; tick < 30; tick += 1) planner.step();
    if (planner.selection.status !== 'selected' || !planner.selectedCandidate()) {
        throw new Error('Expected a selected deterministic fallback.');
    }
    return buildStrategicDecisionBoundaryV10R8({
        challengeId,
        state,
        deterministicFallback: {
            candidate: planner.selectedCandidate()!,
            prefix: planner.selection.prefix
        }
    });
}

function collectState(): SimulationStateV10R8 {
    const transition = advanceSimulationTicksV10R8(
        createSimulationV10R8(4, 'wizard', 'collect'),
        V10_R6_DYNAMICS.actionTicks + 60
    );
    assert.equal(transition.state.activeActor, 'loomkeeper');
    return transition.state;
}

function r8Replay(live: LiveSimulationCoordinatorV10, challengeId: string) {
    const replay = CoordinatorReplayV10AutomatedSchema.parse(live.replay(challengeId));
    assert.equal(replay.rulesetId, V10_R8_RULESET_ID);
    if (replay.rulesetId !== V10_R8_RULESET_ID) throw new Error('Expected an R8 replay.');
    return replay;
}
