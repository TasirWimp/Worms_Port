import assert from 'node:assert/strict';
import test from 'node:test';

import { compileChapterObservationV10R8 } from '../../server/src/simulation/loomkeeper-chapter-observation-v10-r8';
import {
    commitChapterCarrierV10R8, CommittedChapterCarrierV10R8Schema,
    V10_R8_CHAPTER_POLICY_ID
} from '../../server/src/simulation/loomkeeper-chapter-carrier-v10-r8';
import {
    candidateFitCardsV10R8, matchChapterIntentionV10R8, validateCandidateFitV10R8
} from '../../server/src/simulation/loomkeeper-chapter-matcher-v10-r8';
import {
    buildChapterStoryBriefV10R8, chapterStorySystemInstructionV10R8,
    validateChapterStoryV10R8
} from '../../server/src/simulation/loomkeeper-chapter-story-v10-r8';
import { buildStrategicDecisionBoundaryV10R8 } from '../../server/src/simulation/loomkeeper-strategy-v10-r8';
import { LoomkeeperPlannerV10R8 } from '../../shared/loomkeeper-v10-r8';
import { hashCanonicalV10Value, V10_R6_DYNAMICS } from '../../shared/simulation-v10';
import { advanceSimulationTicksV10R8, createSimulationV10R8, hashSimulationStateV10R8 } from '../../shared/simulation-v10-r8';
import { chapterFitRequestBody, chapterStoryRequestBody } from '../../scripts/run-wp027-chapter-shadow';

test('WP-027 story port hides candidates and freezes only mode-correct grounded intentions', () => {
    const before = createSimulationV10R8(4, 'wizard', 'collect');
    const after = advanceSimulationTicksV10R8(before, V10_R6_DYNAMICS.actionTicks + 60).state;
    const planner = new LoomkeeperPlannerV10R8(after);
    for (let step = 0; step < 30; step += 1) planner.step();
    if (planner.selection.status !== 'selected' || !planner.selectedCandidate()) throw new Error('Expected a legal fallback.');
    const boundary = buildStrategicDecisionBoundaryV10R8({
        challengeId: 'wp027_story_match_01', state: after,
        deterministicFallback: { candidate: planner.selectedCandidate(), prefix: planner.selection.prefix }
    });
    const observation = compileChapterObservationV10R8({
        before, after,
        beforeStateHash: hashSimulationStateV10R8(before),
        afterStateHash: boundary.brief.stateHash,
        replayRecords: []
    });
    const brief = buildChapterStoryBriefV10R8({ decisionBrief: boundary.brief, observation });
    assert.equal(brief.mode, 'collect');
    assert.equal(brief.facts[0].id, 'world.no_material_change');
    assert.equal('legalCandidates' in brief, false);
    assert.equal(JSON.stringify(brief).includes('candidateId'), false);
    assert.equal(JSON.stringify(brief).includes('deterministicFallback'), false);
    const storyWire = JSON.stringify(chapterStoryRequestBody(brief));
    assert.equal(storyWire.includes('legalCandidates'), false);
    assert.equal(storyWire.includes('candidateId'), false);
    assert.equal(storyWire.includes('deterministicFallback'), false);
    assert.equal(storyWire.includes('at most 180 characters'), true);
    assert.equal(storyWire.includes('at most 110 characters'), true);
    assert.equal(storyWire.includes('State only witnessed effects'), true);
    const redactedLater = buildChapterStoryBriefV10R8({
        decisionBrief: boundary.brief,
        observation: { ...observation, priorLoomkeeper: {
            turn: 1, selectedCandidateId: 'c07', observedStateHash: observation.basis.beforeStateHash,
            action: 'c07: toward with jump, then threadball.',
            result: 'c07 removed 0 terrain cells, changed player stitching by 0, and objective score by 0.'
        } }
    });
    assert.equal(JSON.stringify(redactedLater).includes('c07'), false);
    assert.equal(redactedLater.observation.priorLoomkeeper?.action,
        'Loomkeeper toward with jump, then threadball.');
    assert.equal(redactedLater.observation.priorLoomkeeper?.result?.startsWith('Loomkeeper removed'), true);
    assert.equal(chapterStorySystemInstructionV10R8('collect').includes('Mode Defend:'), false);
    const proposal = {
        chapterClosure: 'The opening exchange made no material change.',
        playerReading: null,
        intention: {
            posture: 'contest_coin', targetId: 'coin-1', horizonOwnTurns: 1,
            reason: 'Contest an active coin.', watchFor: 'The player may approach the same coin.'
        }
    };
    const frozen = validateChapterStoryV10R8(brief, proposal);
    assert.equal(frozen.proposal.intention.targetId, 'coin-1');
    assert.match(frozen.proposalHash, /^[a-f0-9]{64}$/);
    assert.throws(() => validateChapterStoryV10R8(brief, {
        ...proposal, intention: { ...proposal.intention, posture: 'hold_chest' }
    }), /match mode/);
    assert.throws(() => validateChapterStoryV10R8(brief, {
        ...proposal, intention: { ...proposal.intention, targetId: 'player' }
    }), /coin intention/);
    assert.throws(() => validateChapterStoryV10R8(brief, {
        ...proposal,
        playerReading: { hypothesis: 'The player is rushing.', evidenceIds: ['player.fire.spoolburst'],
            alternative: 'The player may be waiting.', watchFor: 'A later route choice.' }
    }), /absent or duplicate observation/);
    assert.throws(() => validateChapterStoryV10R8(brief, {
        ...proposal,
        playerReading: { hypothesis: 'The player is rushing.', evidenceIds: ['world.no_material_change'],
            alternative: 'The player may be waiting.', watchFor: 'A later route choice.' }
    }), /absent or duplicate observation/);
    const comparison = matchChapterIntentionV10R8({
        storyBrief: brief, frozenStory: frozen, decisionBrief: boundary.brief,
        fallbackCandidateId: boundary.deterministicFallbackCandidate().candidateId
    });
    assert.ok(comparison.shortlist.length >= 2 && comparison.shortlist.length <= 3);
    assert.ok(comparison.shortlist.includes(comparison.deterministicCandidateId));
    assert.ok(comparison.shortlist.includes(boundary.deterministicFallbackCandidate().candidateId));
    const cards = candidateFitCardsV10R8(comparison, boundary.brief);
    assert.deepEqual(cards.map(card => card.candidateId), comparison.shortlist);
    assert.equal(JSON.stringify(cards).includes('deterministicFallback'), false);
    assert.equal(cards.every(card => card.after.objects.length === 7), true);
    const fitWire = JSON.stringify(chapterFitRequestBody({
        id: 'collect-opening', mode: 'collect', chapterIndex: 1,
        observation, storyBrief: brief, boundary
    }, frozen, comparison));
    assert.equal(fitWire.includes('legalCandidates'), false);
    assert.equal(fitWire.includes('deterministicFallback'), false);
    assert.equal(fitWire.includes(frozen.proposal.intention.posture), true);
    assert.equal(fitWire.includes('at most 110 characters'), true);
    for (const candidateId of comparison.shortlist) assert.equal(fitWire.includes(candidateId), true);
    const chosen = validateCandidateFitV10R8(comparison, {
        candidateId: comparison.shortlist[0], reason: 'Fits the frozen coin contest.', watchFor: 'The player may collect first.'
    });
    assert.equal(chosen.candidateId, comparison.shortlist[0]);
    const excluded = boundary.brief.legalCandidates.find(candidate => !comparison.shortlist.includes(candidate.candidateId));
    if (!excluded) throw new Error('Expected an excluded but otherwise legal candidate.');
    assert.throws(() => validateCandidateFitV10R8(comparison, {
        candidateId: excluded.candidateId, reason: 'Outside the shortlist.', watchFor: 'Unknown.'
    }), /frozen shortlist/);
});

test('WP-027 chapter carrier retains legal selection, observed outcome and predecessor identity', () => {
    const opening = createSimulationV10R8(4, 'wizard', 'collect');
    const firstLoomkeeper = advanceSimulationTicksV10R8(opening, V10_R6_DYNAMICS.actionTicks + 60).state;
    const planner = new LoomkeeperPlannerV10R8(firstLoomkeeper);
    for (let step = 0; step < 30; step += 1) planner.step();
    if (planner.selection.status !== 'selected' || !planner.selectedCandidate()) throw new Error('Expected first legal plan.');
    const boundary = buildStrategicDecisionBoundaryV10R8({
        challengeId: 'wp027_chapter_carrier_01', state: firstLoomkeeper,
        deterministicFallback: { candidate: planner.selectedCandidate(), prefix: planner.selection.prefix }
    });
    const observation = compileChapterObservationV10R8({
        before: opening, after: firstLoomkeeper,
        beforeStateHash: hashSimulationStateV10R8(opening),
        afterStateHash: boundary.brief.stateHash, replayRecords: []
    });
    const storyBrief = buildChapterStoryBriefV10R8({ decisionBrief: boundary.brief, observation });
    const frozenStory = validateChapterStoryV10R8(storyBrief, {
        chapterClosure: 'The match opened without a witnessed objective change.',
        playerReading: null,
        intention: { posture: 'contest_coin', targetId: 'coin-1', horizonOwnTurns: 1,
            reason: 'Contest a still-active coin.', watchFor: 'Whether the player collects it.' }
    });
    const comparison = matchChapterIntentionV10R8({ storyBrief, frozenStory,
        decisionBrief: boundary.brief,
        fallbackCandidateId: boundary.deterministicFallbackCandidate().candidateId });
    const firstOutcome = advanceSimulationTicksV10R8(firstLoomkeeper, V10_R6_DYNAMICS.actionTicks + 60).state;
    const first = commitChapterCarrierV10R8({
        observation, storyBrief, frozenStory, comparison, decisionSource: 'server_matcher',
        boundary, before: firstLoomkeeper, after: firstOutcome
    });
    assert.equal(first.policyId, V10_R8_CHAPTER_POLICY_ID);
    assert.equal(first.selectedCandidateId, comparison.deterministicCandidateId);
    assert.equal(first.observedStateHash, hashSimulationStateV10R8(firstOutcome));
    assert.equal(first.storyHash, frozenStory.proposalHash);
    assert.equal(first.priorCarrierHash, null);
    assert.deepEqual(first.unresolvedCounterevidence, ['Whether the player collects it.']);
    assert.equal(first.observedResult.playerScoreDelta,
        firstOutcome.objective.scores.player - firstLoomkeeper.objective.scores.player);
    assert.throws(() => CommittedChapterCarrierV10R8Schema.parse({ ...first, storyHash: '0'.repeat(64) }),
        /retained chapter story hash/);
    const excluded = boundary.brief.legalCandidates.find(candidate => !comparison.shortlist.includes(candidate.candidateId));
    if (!excluded) throw new Error('Expected a legal turn outside the frozen shortlist.');
    assert.throws(() => commitChapterCarrierV10R8({
        observation, storyBrief, frozenStory, comparison, decisionSource: 'mistral_fit',
        boundary, before: firstLoomkeeper, after: firstOutcome,
        modelFit: { candidateId: excluded.candidateId, reason: 'Outside the shortlist.', watchFor: 'Unknown.' }
    }), /frozen shortlist/);
    const fitted = commitChapterCarrierV10R8({
        observation, storyBrief, frozenStory, comparison, decisionSource: 'mistral_fit',
        boundary, before: firstLoomkeeper, after: firstOutcome,
        modelFit: { candidateId: comparison.shortlist[0],
            reason: 'The legal turn fits the frozen intention.', watchFor: 'Observe the resulting world.' }
    });
    assert.equal(fitted.selectedCandidateId, comparison.shortlist[0]);
    assert.equal(fitted.decisionSource, 'mistral_fit');

    const secondLoomkeeper = advanceSimulationTicksV10R8(firstOutcome, V10_R6_DYNAMICS.actionTicks + 60).state;
    const secondPlanner = new LoomkeeperPlannerV10R8(secondLoomkeeper);
    for (let step = 0; step < 30; step += 1) secondPlanner.step();
    if (secondPlanner.selection.status !== 'selected' || !secondPlanner.selectedCandidate()) {
        throw new Error('Expected second legal plan.');
    }
    const secondBoundary = buildStrategicDecisionBoundaryV10R8({
        challengeId: 'wp027_chapter_carrier_01', state: secondLoomkeeper,
        deterministicFallback: { candidate: secondPlanner.selectedCandidate(), prefix: secondPlanner.selection.prefix }
    });
    const secondObservation = compileChapterObservationV10R8({
        before: firstOutcome, after: secondLoomkeeper,
        beforeStateHash: first.observedStateHash,
        afterStateHash: secondBoundary.brief.stateHash, replayRecords: [],
        priorLoomkeeper: { turn: first.turn, selectedCandidateId: first.selectedCandidateId,
            observedStateHash: first.observedStateHash, action: null, result: null }
    });
    const secondBrief = buildChapterStoryBriefV10R8({
        decisionBrief: secondBoundary.brief, observation: secondObservation,
        priorReading: first.story?.playerReading ?? null
    });
    const secondOutcome = advanceSimulationTicksV10R8(secondLoomkeeper, V10_R6_DYNAMICS.actionTicks + 60).state;
    const second = commitChapterCarrierV10R8({
        observation: secondObservation, storyBrief: secondBrief,
        decisionSource: 'deterministic_fallback', boundary: secondBoundary,
        before: secondLoomkeeper, after: secondOutcome, priorCarrier: first
    });
    assert.equal(second.priorCarrierHash, hashCanonicalV10Value(first));
    assert.equal(second.selectedCandidateId, secondBoundary.deterministicFallbackCandidate().candidateId);
    assert.equal(second.story, null);
    assert.deepEqual(second.unresolvedCounterevidence, []);
    assert.throws(() => commitChapterCarrierV10R8({
        observation: secondObservation, storyBrief: secondBrief,
        decisionSource: 'deterministic_fallback', boundary: secondBoundary,
        before: secondLoomkeeper, after: secondOutcome
    }), /committed predecessor/);
    assert.throws(() => commitChapterCarrierV10R8({
        observation: secondObservation, storyBrief: secondBrief,
        decisionSource: 'deterministic_fallback', boundary: secondBoundary,
        before: secondLoomkeeper, after: secondOutcome,
        priorCarrier: { ...first, observedStateHash: '0'.repeat(64) }
    }), /does not precede/);
});
