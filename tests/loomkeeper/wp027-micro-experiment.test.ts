import assert from 'node:assert/strict';
import test from 'node:test';

import { createWp027ProbeFixturesV10R8 } from
    '../../server/src/simulation/loomkeeper-strategy-probes-v10-r8';
import {
    assembleMicroDecision,
    assembleMicroDecisionV2,
    buildMicroCase,
    type ClaimAnswer,
    type ChoiceAnswer
} from '../../scripts/wp027-micro-experiment-cases';

const cases = createWp027ProbeFixturesV10R8().map(buildMicroCase);

test('micro experiment freezes five distinct current-world cards with bounded evidence', () => {
    assert.equal(cases.length, 5);
    for (const item of cases) {
        assert.notEqual(item.options[0].candidateId, item.options[1].candidateId);
        assert.equal(item.expectedFuture.status, 'unknown');
        assert.equal(item.expectedFuture.evidenceId, 'limit');
        assert.ok(item.evidence.limit.includes('not computed'));
        assert.ok(item.options.every(option => Number.isFinite(option.committedTargetDistanceAfter)));
        assert.ok(item.computedClaim.includes('this Loomkeeper turn'));
        assert.ok(item.evidence[item.computedEvidenceId].length > 0);
    }
});

test('temporary distance cost is measured against the committed target, not a nearest coin', () => {
    const item = cases.find(item => item.id === 'temporary-cost-preparation')!;
    assert.equal(item.options[1].committedTargetDistanceBefore, 500);
    assert.equal(item.options[1].committedTargetDistanceAfter, 600);
    assert.equal(item.expectedAction, 'abstain');
});

test('the ledge comparison checks exact completed terrain rather than total removal', () => {
    const item = cases.find(item => item.id === 'preserve-future-option')!;
    assert.equal(item.options[0].namedLedgeCellsRemoved, 14);
    assert.equal(item.options[1].namedLedgeCellsRemoved, 0);
    assert.equal(item.expectedAction, 'B');
});

test('computed-fact control claims match authoritative completed-turn metrics', () => {
    const byId = (id: string) => cases.find(item => item.id === id)!;
    const temporary = byId('temporary-cost-preparation');
    assert.equal(temporary.options[1].committedTargetDistanceAfter -
        temporary.options[1].committedTargetDistanceBefore, 100);
    const continueCase = byId('continue-through-setback');
    assert.equal(continueCase.options[1].committedTargetDistanceAfter, 461);
    assert.equal(byId('repair-destroyed-route').options[0].terrainCellsRemoved, 2);
    assert.equal(byId('preserve-future-option').options[1].namedLedgeCellsRemoved, 0);
    assert.equal(byId('acknowledge-information-gap').options[0].objectiveScoreDelta, 1);
});

test('assembler keeps missing facts and incorrect citations from authorizing an option', () => {
    for (const item of cases) {
        const present: ClaimAnswer = { ...item.expectedCurrent, reason: 'Source fact.' };
        const future: ClaimAnswer = { ...item.expectedFuture, reason: 'Future is not simulated.' };
        const choice: ChoiceAnswer = { action: item.expectedAction, reason: 'Policy choice.' };
        const accepted = assembleMicroDecision(item, present, future, choice);
        assert.equal(accepted.action, item.expectedAction);
        assert.equal(accepted.strategy, item.acceptedStrategy);
        const badCitation = assembleMicroDecision(item,
            { ...present, evidenceId: present.evidenceId === 'event' ? 'A' : 'event' },
            future, choice);
        assert.equal(badCitation.action, 'abstain');
        assert.equal(badCitation.source, 'claim_guard');
    }
});

test('destroyed-route event maps an accepted provisional option to repair', () => {
    const item = cases.find(item => item.id === 'repair-destroyed-route')!;
    const result = assembleMicroDecision(item,
        { ...item.expectedCurrent, reason: 'Player destroyed support.' },
        { ...item.expectedFuture, reason: 'Next turn is uncomputed.' },
        { action: item.expectedAction, reason: 'Less terrain removed.' });
    assert.equal(result.action, 'A');
    assert.equal(result.strategy, 'repair');
});

test('versioned assembler accepts a certified status with alternate cited evidence', () => {
    const continuation = cases.find(item => item.id === 'continue-through-setback')!;
    const present: ClaimAnswer = { ...continuation.expectedCurrent, reason: 'Current route is feasible.' };
    const future: ClaimAnswer = {
        ...continuation.expectedFuture,
        evidenceId: 'B',
        reason: 'B shows this turn, not a later player response.'
    };
    const choice: ChoiceAnswer = { action: 'B', reason: 'Current continuation advances.' };
    assert.equal(assembleMicroDecision(continuation, present, future, choice).source, 'claim_guard');
    assert.deepEqual(assembleMicroDecisionV2(continuation, present, future, choice), {
        action: 'B', strategy: 'continue', source: 'validated_preference'
    });
    assert.equal(assembleMicroDecisionV2(continuation, present,
        { ...future, status: 'supported' }, choice).source, 'claim_guard');
    assert.equal(assembleMicroDecisionV2(continuation, present,
        { ...future, evidenceId: 'missing' as ClaimAnswer['evidenceId'] }, choice).source,
        'claim_guard');
});
