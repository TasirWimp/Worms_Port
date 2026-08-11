import assert from 'node:assert/strict';
import test from 'node:test';

import {
    V4_RULESET_ID,
    applySimulationCommand,
    canonicalSimulationJson,
    createSimulation,
    type SimulationState,
    type SimulationTransition
} from '../../shared/simulation';
import { canonicalJson } from '../../analysis/crpm_world/canonical';
import {
    getCutDefinition,
    hasCutDefinition,
    listCutDefinitions
} from '../../analysis/crpm_world/cuts/registry';
import {
    V4_CUT_IDS,
    V4_SUPPORT_TWIN_SEED
} from '../../analysis/crpm_world/cuts/v4-cuts';
import {
    FINITE_SAMPLE_TRANSPORT_LIMIT,
    assessQuotientTransport
} from '../../analysis/crpm_world/kernel/assess-quotient-transport';
import {
    projectV4CommandSample,
    projectV4SimulationState,
    type V4CommandSample
} from '../../analysis/crpm_world/kernel/project-cut';
import {
    ProjectionTransportAssessmentV2Schema,
    WorldCutDefinitionSchema
} from '../../analysis/crpm_world/schemas';

function applyAcceptedMove(state: SimulationState, direction: -1 | 1): SimulationState {
    const transition = applySimulationCommand(
        state,
        state.activeActor,
        { type: 'move', direction },
        state.turn
    );
    assert.equal(transition.accepted, true);
    return transition.state;
}

function afterPositionReturningCycles(count: number): SimulationState {
    let state = createSimulation(V4_SUPPORT_TWIN_SEED, 'wizard', V4_RULESET_ID);
    for (let cycle = 0; cycle < count; cycle += 1) {
        state = applyAcceptedMove(state, 1);
        state = applyAcceptedMove(state, -1);
    }
    return state;
}

function movementSample(state: SimulationState): V4CommandSample {
    return {
        state,
        actor: state.activeActor,
        command: { type: 'move', direction: 1 },
        expectedTurn: state.turn
    };
}

function advanceSample(sample: V4CommandSample): SimulationTransition {
    return applySimulationCommand(sample.state, sample.actor, sample.command, sample.expectedTurn);
}

function thinTargetKey(transition: SimulationTransition) {
    return {
        accepted: transition.accepted,
        mutated: transition.mutated,
        errorCode: transition.error?.code ?? null,
        visibleState: projectV4SimulationState(
            V4_CUT_IDS.thinVisibleDuel,
            transition.state
        ).projectedValue
    };
}

test('the closed registry exposes all strict, detached, domain-declared cuts', () => {
    const cuts = listCutDefinitions();
    assert.deepEqual(cuts.map((cut) => cut.cutId), [
        V4_CUT_IDS.historicalAuthority,
        V4_CUT_IDS.authority,
        V4_CUT_IDS.boundedCommandSupport,
        'd2a_tactical_recurrence_v1',
        V4_CUT_IDS.replay,
        V4_CUT_IDS.thinVisibleDuel,
        V4_CUT_IDS.worldDesign
    ]);
    for (const cut of cuts) {
        assert.equal(WorldCutDefinitionSchema.safeParse(cut).success, true);
        assert.ok(cut.admissibleDomain.scenarioIds.length > 0);
        assert.ok(cut.admissibleDomain.actionFamilies.length > 0);
        assert.equal(hasCutDefinition(cut.cutId, cut.cutVersion), true);
    }

    const first = getCutDefinition(V4_CUT_IDS.thinVisibleDuel);
    first.protectedFamily[0] = 'caller mutation';
    assert.notEqual(
        getCutDefinition(V4_CUT_IDS.thinVisibleDuel).protectedFamily[0],
        'caller mutation'
    );
    assert.throws(
        () => getCutDefinition(V4_CUT_IDS.authority, 99),
        /Unknown or unversioned/
    );
});

test('cuts cannot silently omit their admissible domain', () => {
    const { admissibleDomain: _omitted, ...invalid } = getCutDefinition(V4_CUT_IDS.authority);
    assert.equal(WorldCutDefinitionSchema.safeParse(invalid).success, false);
});

test('the thin control is relational while repaired movement support remains action-bounded', () => {
    const thin = getCutDefinition(V4_CUT_IDS.thinVisibleDuel);
    const repaired = getCutDefinition(V4_CUT_IDS.boundedCommandSupport);
    assert.equal(thin.deterministicContinuationClaim, 'relational');
    assert.match(thin.excludedClaims.join(' '), /intentionally incomplete/i);
    assert.equal(repaired.deterministicContinuationClaim, 'bounded');
    assert.deepEqual(repaired.admissibleDomain.actionFamilies, ['move']);
    assert.ok(repaired.includedSupport.includes('movement-budget'));
    assert.match(repaired.excludedClaims.join(' '), /No fire/);

    const state = afterPositionReturningCycles(1);
    assert.throws(
        () => projectV4CommandSample(V4_CUT_IDS.boundedCommandSupport, {
            ...movementSample(state),
            command: { type: 'fire' }
        }),
        /outside cut/
    );
});

test('empty quotient witness domains fail closed', () => {
    assert.throws(
        () => assessQuotientTransport(
            [],
            (item) => item,
            (item) => item,
            (item) => item,
            {
                assessmentId: 'empty-domain',
                sampledDomain: getCutDefinition(V4_CUT_IDS.thinVisibleDuel).admissibleDomain
            }
        ),
        /requires at least one witnessed item/
    );
});

test('assessment records one explicit pair for every aliased source class', () => {
    const items = [
        { ref: 'a-left', source: 'a', target: 'one' },
        { ref: 'a-right', source: 'a', target: 'two' },
        { ref: 'b-left', source: 'b', target: 'three' },
        { ref: 'b-right', source: 'b', target: 'four' }
    ];
    const before = canonicalJson(items);
    const assessment = assessQuotientTransport(
        items,
        (item) => item.source,
        (item) => {
            item.source = 'mutated-clone';
            return item;
        },
        (item) => item.target,
        {
            assessmentId: 'two-alias-classes',
            sampledDomain: getCutDefinition(V4_CUT_IDS.thinVisibleDuel).admissibleDomain,
            itemReference: (item) => item.ref
        }
    );
    assert.equal(canonicalJson(items), before);
    assert.equal(assessment.aliasingKeys.length, 2);
    assert.equal(assessment.aliasingWitnessPairs.length, 2);
    assert.equal(assessment.recommendedShape, 'relation_or_kernel');
    assert.equal(ProjectionTransportAssessmentV2Schema.safeParse(assessment).success, true);
});

test('V4 movement support twins expose thin aliasing and pass after bounded repair', () => {
    const oneCycleState = afterPositionReturningCycles(1);
    const fourCycleState = afterPositionReturningCycles(4);
    const authorityBefore = [
        canonicalSimulationJson(oneCycleState),
        canonicalSimulationJson(fourCycleState)
    ];
    const samples = [movementSample(oneCycleState), movementSample(fourCycleState)];

    assert.equal(oneCycleState.activeActor, fourCycleState.activeActor);
    assert.deepEqual(
        oneCycleState.units.map(({ id, x, y, stitching }) => ({ id, x, y, stitching })),
        fourCycleState.units.map(({ id, x, y, stitching }) => ({ id, x, y, stitching }))
    );
    assert.equal(oneCycleState.movementRemaining, 48);
    assert.equal(fourCycleState.movementRemaining, 0);
    assert.equal(oneCycleState.revision, 2);
    assert.equal(fourCycleState.revision, 8);
    assert.equal(
        projectV4CommandSample(V4_CUT_IDS.thinVisibleDuel, samples[0]).classKey,
        projectV4CommandSample(V4_CUT_IDS.thinVisibleDuel, samples[1]).classKey
    );

    const directResults = samples.map(advanceSample);
    assert.equal(directResults[0].accepted, true);
    assert.equal(directResults[1].accepted, false);
    assert.equal(directResults[1].error?.code, 'COMMAND_REJECTED');

    const thinAssessment = assessQuotientTransport(
        samples,
        (sample) => projectV4CommandSample(V4_CUT_IDS.thinVisibleDuel, sample).projectedValue,
        advanceSample,
        thinTargetKey,
        {
            assessmentId: 'v4-thin-movement-support-twin',
            sampledDomain: getCutDefinition(V4_CUT_IDS.thinVisibleDuel).admissibleDomain,
            itemReference: (sample) => sample.state.movementRemaining === 48
                ? 'one-position-returning-cycle-budget-48'
                : 'four-position-returning-cycles-budget-0',
            blockedClaims: ['This destructive control does not establish global V4 state or continuation completeness.']
        }
    );
    assert.equal(thinAssessment.sourceClasses.length, 1);
    assert.equal(thinAssessment.targetClasses.length, 2);
    assert.equal(thinAssessment.deterministicMapEligibility, false);
    assert.equal(thinAssessment.recommendedShape, 'relation_or_kernel');
    assert.equal(thinAssessment.aliasingWitnessPairs.length, 1);
    assert.deepEqual(
        new Set([
            thinAssessment.aliasingWitnessPairs[0].left.sourceItemRef,
            thinAssessment.aliasingWitnessPairs[0].right.sourceItemRef
        ]),
        new Set([
            'one-position-returning-cycle-budget-48',
            'four-position-returning-cycles-budget-0'
        ])
    );

    assert.notEqual(
        projectV4CommandSample(V4_CUT_IDS.boundedCommandSupport, samples[0]).classKey,
        projectV4CommandSample(V4_CUT_IDS.boundedCommandSupport, samples[1]).classKey
    );
    const repairedAssessment = assessQuotientTransport(
        samples,
        (sample) => projectV4CommandSample(
            V4_CUT_IDS.boundedCommandSupport,
            sample
        ).projectedValue,
        advanceSample,
        thinTargetKey,
        {
            assessmentId: 'v4-bounded-movement-support-repair',
            sampledDomain: getCutDefinition(V4_CUT_IDS.boundedCommandSupport).admissibleDomain,
            itemReference: (_sample, index) => `bounded-movement-item-${index}`
        }
    );
    assert.equal(repairedAssessment.sourceClasses.length, 2);
    assert.equal(repairedAssessment.deterministicMapEligibility, true);
    assert.equal(repairedAssessment.recommendedShape, 'map');
    assert.deepEqual(repairedAssessment.aliasingKeys, []);
    assert.deepEqual(repairedAssessment.aliasingWitnessPairs, []);
    assert.ok(repairedAssessment.blockedClaims.includes(FINITE_SAMPLE_TRANSPORT_LIMIT));
    assert.deepEqual(
        [canonicalSimulationJson(oneCycleState), canonicalSimulationJson(fourCycleState)],
        authorityBefore
    );
});
