import assert from 'node:assert/strict';
import test from 'node:test';

import { compileChapterObservationV10R8 } from '../../server/src/simulation/loomkeeper-chapter-observation-v10-r8';
import {
    candidateFitCardsV10R8, matchChapterIntentionV10R8, validateCandidateFitV10R8
} from '../../server/src/simulation/loomkeeper-chapter-matcher-v10-r8';
import {
    buildChapterStoryBriefV10R8, chapterStorySystemInstructionV10R8,
    validateChapterStoryV10R8
} from '../../server/src/simulation/loomkeeper-chapter-story-v10-r8';
import { buildStrategicDecisionBoundaryV10R8 } from '../../server/src/simulation/loomkeeper-strategy-v10-r8';
import { LoomkeeperPlannerV10R8 } from '../../shared/loomkeeper-v10-r8';
import { V10_R6_DYNAMICS } from '../../shared/simulation-v10';
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
