import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';

import {
    CandidateCapabilityV10R8,
    EMPTY_COMMITTED_VOYAGE_V10_R8,
    StrategicTurnRecordV10R8Schema,
    StrategicDecisionV10R8Schema,
    V10_R8_CANDIDATE_CAPS,
    V10_R8_PROMPT_VERSION,
    buildStrategicDecisionBoundaryV10R8,
    parseStrategicDecisionV10R8,
    projectWorldSurfaceV10R8,
    strategicBasisIdV10R8
} from '../../server/src/simulation/loomkeeper-strategy-v10-r8';
import { LoomkeeperExecutionV10R8, LoomkeeperPlannerV10R8 } from '../../shared/loomkeeper-v10-r8';
import { v10gCandidateAt, type LoomkeeperCandidateV10 } from '../../shared/loomkeeper-v10';
import { V10_R6_DYNAMICS, hashTerrainV10R7 } from '../../shared/simulation-v10';
import {
    advanceSimulationTicksV10R8,
    applySimulationBarrierV10R8,
    applySimulationIntentV10R8,
    assertSimulationInvariantsV10R8,
    createSimulationV10R8,
    type SimulationStateV10R8,
    type V10R8ObjectiveMode
} from '../../shared/simulation-v10-r8';
import { setTerrainSolid, terrainSolid } from '../../shared/simulation';

test('WP-027 prepares one deterministic decision boundary inside its six-second ceiling', context => {
    const state = loomkeeperState('collect');
    const started = performance.now();
    const fixture = createFixture(state);
    const fallbackReady = performance.now();
    fixtures.set('collect', fixture);
    const boundary = createBoundary('collect', fixture);
    const boundaryReady = performance.now();
    boundaries.set('collect', boundary);
    const fallbackMs = fallbackReady - started;
    const boundaryMs = boundaryReady - fallbackReady;
    const elapsed = boundaryReady - started;
    context.diagnostic(`fallback=${Math.round(fallbackMs)}ms atlas=${Math.round(boundaryMs)}ms total=${Math.round(elapsed)}ms`);
    assert.ok(boundary.brief.legalCandidates.length >= V10_R8_CANDIDATE_CAPS.atlasMinimum);
    assert.ok(elapsed < 6_000,
        `decision preparation took ${Math.round(elapsed)}ms (fallback ${Math.round(fallbackMs)}ms, atlas ${Math.round(boundaryMs)}ms)`);
});

test('WP-027 brief is compact, deterministic and objective-aware across R8 modes', () => {
    const basisIds = new Set<string>();
    let collectBrief: ReturnType<typeof buildStrategicDecisionBoundaryV10R8>['brief'] | undefined;
    let collectEvidence: ReturnType<ReturnType<typeof buildStrategicDecisionBoundaryV10R8>['evidence']> | undefined;
    for (const mode of ['defend', 'collect', 'claim'] as const satisfies readonly V10R8ObjectiveMode[]) {
        const left = boundaryFixture(mode);
        if (mode === 'collect') {
            collectBrief = left.brief;
            collectEvidence = left.evidence();
        }
        assert.equal(left.brief.objective.mode, mode);
        assert.equal(left.brief.battlefield.width, 64);
        assert.equal(left.brief.battlefield.height, 36);
        assert.equal(left.brief.battlefield.ascii.split('\n').length, 36);
        assert.ok(left.brief.battlefield.ascii.split('\n').every(line => line.length === 64));
        assert.match(left.brief.battlefield.ascii, /L/);
        assert.match(left.brief.battlefield.ascii, /P/);
        assert.deepEqual(left.brief.currentStrategy, EMPTY_COMMITTED_VOYAGE_V10_R8);
        assert.equal(Object.isFrozen(left.brief.currentStrategy), true);
        assert.equal(Object.isFrozen(left.brief.currentStrategy.invalidationConditions), true);
        assert.equal(Object.isFrozen(left.brief.recentChanges.playerChanges), true);
        assert.ok(Buffer.byteLength(JSON.stringify(left.brief), 'utf8') <= V10_R8_CANDIDATE_CAPS.briefBytes);
        assert.match(left.brief.stateHash, /^[a-f0-9]{64}$/);
        assert.ok(Object.values(left.evidence()).every(value => /^[a-f0-9]{64}$/.test(value)));
        assert.ok(left.brief.legalCandidates.length >= V10_R8_CANDIDATE_CAPS.atlasMinimum);
        assert.ok(left.brief.legalCandidates.length <= V10_R8_CANDIDATE_CAPS.atlasMaximum);
        assert.deepEqual(left.brief.legalCandidates.map(candidate => candidate.candidateId),
            left.brief.legalCandidates.map((_, index) => `c${String(index + 1).padStart(2, '0')}`));
        const families = new Set(left.brief.legalCandidates.flatMap(candidate => candidate.families));
        for (const family of ['objective_progress', 'defence', 'terrain', 'survival', 'combat']) {
            assert.ok(families.has(family as any), `${mode} retains ${family}`);
        }
        assert.ok(left.brief.legalCandidates.every(candidate =>
            candidate.uncertainty.length > 0 && candidate.opportunities.length > 0 && candidate.risks.length > 0));
        assert.equal(left.brief.legalCandidates.filter(candidate => candidate.deterministicFallback).length, 1);
        basisIds.add(left.brief.basisId);
    }
    assert.equal(basisIds.size, 3);
    const collectFixture = loomkeeperFixture('collect');
    const rebuilt = buildStrategicDecisionBoundaryV10R8({
        challengeId: 'wp027_collect_boundary',
        state: collectFixture.state,
        deterministicFallback: collectFixture.fallback
    });
    assert.deepEqual(rebuilt.brief, collectBrief);
    assert.deepEqual(rebuilt.evidence(), collectEvidence);
});

test('WP-027 capability resolution rejects unknown, forged, cross-basis and repeated use', () => {
    const collect = boundaryFixture('collect');
    const defend = boundaryFixture('defend');
    assert.throws(() => collect.resolve('c99'), /Unknown candidate/);
    assert.throws(() => new CandidateCapabilityV10R8(Symbol('forged'), collect.brief.basisId, 'c01'), /server-owned/);
    const collectCapability = collect.resolve('c01');
    assert.throws(() => defend.consume(collectCapability), /another decision basis/);
    const rebuilt = createBoundary('collect', loomkeeperFixture('collect'));
    const resolved = rebuilt.consume(collectCapability);
    assert.ok(resolved.candidate.ordinal >= 0 && resolved.candidate.ordinal < V10_R8_CANDIDATE_CAPS.sourcePlans);
    assert.throws(() => collect.consume(collectCapability), /already consumed/);
});

test('WP-027 response schema freezes selected and abstention variants', () => {
    const selected = {
        candidateId: 'c07',
        strategy: 'continue',
        targetId: 'loomkeeper-chest',
        milestoneId: 'lower_passage_open',
        horizonOwnTurns: 2,
        reason: 'Open the lower passage.',
        watchFor: 'The player may remove its landing shelf.'
    } as const;
    const abstained = {
        candidateId: null,
        strategy: null,
        targetId: null,
        milestoneId: null,
        horizonOwnTurns: null,
        reason: 'The brief does not establish a supported route.',
        watchFor: null
    } as const;
    assert.deepEqual(parseStrategicDecisionV10R8(selected), selected);
    assert.deepEqual(parseStrategicDecisionV10R8(abstained), abstained);
    for (const malformed of [
        { candidateId: 'c99', strategy: 'continue', targetId: 'chest', milestoneId: 'open',
            horizonOwnTurns: 1, reason: 'x', watchFor: 'y' },
        { candidateId: null, strategy: 'switch', targetId: null, milestoneId: null,
            horizonOwnTurns: null, reason: 'x', watchFor: null },
        { candidateId: 'c01', strategy: 'continue', targetId: 'chest', milestoneId: 'open',
            horizonOwnTurns: 9, reason: 'x', watchFor: 'y' }
    ]) assert.equal(StrategicDecisionV10R8Schema.safeParse(malformed).success, false);
    assert.throws(() => parseStrategicDecisionV10R8({ ...selected, reason: 'x'.repeat(2_000) }), /byte cap/);
});

test('WP-027 turn records cannot commit unwitnessed strategy or mismatch a provider selection', () => {
    const boundary = boundaryFixture('collect');
    const evidence = boundary.evidence();
    const decision = {
        candidateId: 'c01', strategy: 'continue', targetId: 'coin-4', milestoneId: 'middle-shelf',
        horizonOwnTurns: 2, reason: 'Continue toward the central coin.', watchFor: 'The shelf may be destroyed.'
    } as const;
    const voyage = {
        targetId: 'coin-4', milestoneId: 'middle-shelf', originalDueOwnTurn: 2,
        acceptedTemporaryCost: null, invalidationConditions: ['coin-4 is resolved'], unresolvedConcerns: []
    };
    const pending = {
        revision: boundary.brief.revision,
        policyId: boundary.brief.policyId,
        promptVersion: V10_R8_PROMPT_VERSION,
        providerMode: 'local_fake',
        modelId: 'wp027-local-fake-v1',
        operationalOutcome: 'selected',
        turn: loomkeeperFixture('collect').state.turn,
        ...evidence,
        selectedCandidateId: 'c01',
        decisionSource: 'local_fake',
        providerDecision: decision,
        status: 'pending',
        proposedVoyage: voyage,
        committedVoyage: null,
        immediatePredictionHash: 'a'.repeat(64),
        observedStateHash: null,
        timingMs: { preparation: 100, provider: 10, validation: 1, total: 111 },
        usage: null,
        responseBytes: 240,
        diagnostic: null
    } as const;
    assert.equal(StrategicTurnRecordV10R8Schema.safeParse(pending).success, true);
    assert.equal(StrategicTurnRecordV10R8Schema.safeParse({
        ...pending, status: 'committed', committedVoyage: null, observedStateHash: 'b'.repeat(64)
    }).success, false);
    assert.equal(StrategicTurnRecordV10R8Schema.safeParse({
        ...pending, selectedCandidateId: 'c02'
    }).success, false);
    assert.equal(StrategicTurnRecordV10R8Schema.safeParse({
        ...pending, providerDecision: null
    }).success, false);
    assert.equal(StrategicTurnRecordV10R8Schema.safeParse({
        ...pending,
        providerMode: 'gemini_shadow',
        decisionSource: 'local_fake',
        usage: { inputTokens: 10, outputTokens: 5, thinkingTokens: 5, totalTokens: 10,
            estimatedCostUsdMicros: 100 }
    }).success, false);
    assert.equal(StrategicTurnRecordV10R8Schema.safeParse({
        ...pending, timingMs: { ...pending.timingMs, total: 100 }
    }).success, false);
    assert.equal(StrategicTurnRecordV10R8Schema.safeParse({
        ...pending, status: 'committed', committedVoyage: voyage, observedStateHash: 'b'.repeat(64)
    }).success, true);
});

test('WP-027 projection preserves a route-relevant terrain distinction between otherwise paired worlds', () => {
    const state = loomkeeperFixture('collect').state;
    const changed = structuredClone(state);
    const protectedSupports = new Set<number>([
        ...changed.units.map(unit => typeof unit.support === 'number' ? unit.support : -1),
        ...changed.objective.objects.map(object => object.support ?? -1)
    ]);
    let removed = false;
    for (let row = 8; row < changed.terrain.height - 4 && !removed; row += 2) {
        for (let column = 8; column < changed.terrain.width - 8 && !removed; column += 4) {
            const cells = Array.from({ length: 8 }, (_, index) => {
                const x = column + index % 4;
                const y = row + Math.trunc(index / 4);
                return { x, y, support: y * changed.terrain.width + x };
            });
            if (cells.every(cell => terrainSolid(changed.terrain, cell.x, cell.y) &&
                !protectedSupports.has(cell.support))) {
                cells.forEach(cell => setTerrainSolid(changed.terrain, cell.x, cell.y, false));
                removed = true;
            }
        }
    }
    assert.equal(removed, true);
    changed.terrainRevision = changed.terrainRevision! + 1;
    changed.terrainHash = hashTerrainV10R7(changed.terrain);
    assertSimulationInvariantsV10R8(changed);
    const before = projectWorldSurfaceV10R8(state);
    const after = projectWorldSurfaceV10R8(changed);
    assert.deepEqual(after.actors, before.actors);
    assert.deepEqual(after.objects, before.objects);
    assert.deepEqual(after.relationships, before.relationships);
    assert.notEqual(after.ascii, before.ascii);
});

test('WP-027 detached candidate consequences match one authoritative R8 complete turn', () => {
    const fixture = loomkeeperFixture('collect');
    const boundary = buildStrategicDecisionBoundaryV10R8({
        challengeId: 'wp027_authority_match',
        state: fixture.state,
        deterministicFallback: fixture.fallback
    });
    const projected = [...boundary.brief.legalCandidates]
        .sort((left, right) => right.immediate.terrainCellsRemoved - left.immediate.terrainCellsRemoved ||
            left.candidateId.localeCompare(right.candidateId))[0];
    const resolved = boundary.consume(boundary.resolve(projected.candidateId));
    let state = advanceSimulationTicksV10R8(
        fixture.state,
        V10_R8_CANDIDATE_CAPS.planningTicks
    ).state;
    const execution = new LoomkeeperExecutionV10R8(resolved.candidate, resolved.prefix, state);
    let fired = false;
    for (let ticks = V10_R8_CANDIDATE_CAPS.planningTicks;
        ticks < V10_R8_CANDIDATE_CAPS.rolloutTicks &&
        state.phase !== 'finished' && state.turn === fixture.state.turn;
        ticks += 1) {
        for (let operations = 0; operations < V10_R8_CANDIDATE_CAPS.operationsPerTick; operations += 1) {
            const operation = execution.next(state);
            if (!operation) break;
            const transition = operation.kind === 'intent'
                ? applySimulationIntentV10R8(
                    state, 'loomkeeper', operation.intent, state.turn, state.phase, state.inputEpoch
                )
                : applySimulationBarrierV10R8(state, operation.barrier);
            assert.equal(transition.accepted, true);
            if (operation.kind === 'intent' && operation.intent.type === 'fire') fired = true;
            if (transition.mutated) state = transition.state;
        }
        if (state.phase === 'finished' || state.turn !== fixture.state.turn) break;
        state = advanceSimulationTicksV10R8(state, 1).state;
    }
    const ownBefore = fixture.state.units[1];
    const ownAfter = state.units[1];
    const playerBefore = fixture.state.units[0];
    const playerAfter = state.units[0];
    assert.deepEqual(projected.immediate, {
        ownStitchingDelta: ownAfter.stitching - ownBefore.stitching,
        opponentStitchingDelta: playerAfter.stitching - playerBefore.stitching,
        ownXDelta: Math.round((ownAfter.xFp - ownBefore.xFp) / 256),
        ownYDelta: Math.round((ownAfter.yFp - ownBefore.yFp) / 256),
        terrainCellsRemoved: removedTerrain(fixture.state, state),
        objectiveScoreDelta: state.objective.scores.loomkeeper - fixture.state.objective.scores.loomkeeper,
        objectiveDistanceDelta: projected.immediate.objectiveDistanceDelta,
        resolvedObjectiveIds: state.objective.objects
            .filter(object => object.status !== 'active' &&
                fixture.state.objective.objects.find(previous => previous.id === object.id)?.status === 'active')
            .map(object => object.id),
        terminalWinner: state.winner
    });
    assert.equal(projected.action.shotFired, fired);
});

test('WP-027 basis changes with match, state and committed voyage while inputs stay immutable', () => {
    const { state, fallback } = loomkeeperFixture('collect');
    const original = structuredClone(state);
    const baseline = strategicBasisIdV10R8({
        challengeId: 'wp027_basis_original', state, deterministicFallback: fallback
    });
    const otherMatch = strategicBasisIdV10R8({
        challengeId: 'wp027_basis_changed_', state, deterministicFallback: fallback
    });
    const voyage = strategicBasisIdV10R8({
        challengeId: 'wp027_basis_original',
        state,
        deterministicFallback: fallback,
        currentStrategy: {
            targetId: 'coin-4',
            milestoneId: 'reach-middle-shelf',
            originalDueOwnTurn: 2,
            acceptedTemporaryCost: 'Move without immediate objective score.',
            invalidationConditions: ['coin-4 is no longer active'],
            unresolvedConcerns: ['player may destroy the middle shelf']
        }
    });
    const otherFallback = strategicBasisIdV10R8({
        challengeId: 'wp027_basis_original',
        state,
        deterministicFallback: {
            candidate: v10gCandidateAt((fallback.candidate.ordinal + 1) % V10_R8_CANDIDATE_CAPS.sourcePlans),
            prefix: fallback.prefix
        }
    });
    assert.notEqual(baseline, otherMatch);
    assert.notEqual(baseline, voyage);
    assert.notEqual(baseline, otherFallback);
    assert.deepEqual(state, original);
});

const fixtures = new Map<V10R8ObjectiveMode, Readonly<{
    state: SimulationStateV10R8;
    fallback: Readonly<{ candidate: LoomkeeperCandidateV10; prefix: 'threadguard' | 'threadleap' | 'none' }>;
}>>();
const boundaries = new Map<V10R8ObjectiveMode, ReturnType<typeof buildStrategicDecisionBoundaryV10R8>>();

function boundaryFixture(mode: V10R8ObjectiveMode) {
    const existing = boundaries.get(mode);
    if (existing) return existing;
    const fixture = loomkeeperFixture(mode);
    const boundary = createBoundary(mode, fixture);
    boundaries.set(mode, boundary);
    return boundary;
}

function createBoundary(mode: V10R8ObjectiveMode, fixture: ReturnType<typeof createFixture>) {
    return buildStrategicDecisionBoundaryV10R8({
        challengeId: `wp027_${mode}_boundary`,
        state: fixture.state,
        deterministicFallback: fixture.fallback
    });
}

function loomkeeperFixture(mode: V10R8ObjectiveMode) {
    const existing = fixtures.get(mode);
    if (existing) return existing;
    const fixture = createFixture(loomkeeperState(mode));
    fixtures.set(mode, fixture);
    return fixture;
}

function createFixture(state: SimulationStateV10R8) {
    const planner = new LoomkeeperPlannerV10R8(state);
    for (let tick = 0; tick < V10_R8_CANDIDATE_CAPS.planningTicks; tick += 1) planner.step();
    assert.equal(planner.selection.status, 'selected');
    const candidate = planner.selectedCandidate();
    if (!candidate || planner.selection.status !== 'selected') throw new Error('Expected deterministic R8 fallback.');
    return Object.freeze({
        state,
        fallback: Object.freeze({ candidate, prefix: planner.selection.prefix })
    });
}

function loomkeeperState(mode: V10R8ObjectiveMode): SimulationStateV10R8 {
    const initial = createSimulationV10R8(4, 'wizard', mode);
    const transition = advanceSimulationTicksV10R8(initial, V10_R6_DYNAMICS.actionTicks + 60);
    assert.equal(transition.accepted, true);
    assert.equal(transition.state.phase, 'action');
    assert.equal(transition.state.activeActor, 'loomkeeper');
    return transition.state;
}

function removedTerrain(before: SimulationStateV10R8, after: SimulationStateV10R8): number {
    let removed = 0;
    for (let index = 0; index < before.terrain.words.length; index += 1) {
        let word = (before.terrain.words[index] & ~after.terrain.words[index]) >>> 0;
        word -= (word >>> 1) & 0x55555555;
        word = (word & 0x33333333) + ((word >>> 2) & 0x33333333);
        removed += (((word + (word >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
    }
    return removed;
}
