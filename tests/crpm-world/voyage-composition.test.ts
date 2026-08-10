import assert from 'node:assert/strict';
import test from 'node:test';

import {
    V4_RULESET_ID,
    applySimulationCommand,
    canonicalSimulationJson,
    createSimulation,
    type SimulationCommand,
    type SimulationState
} from '../../shared/simulation';
import {
    adaptSimulationCommand,
    type AuthorityAdapterOutput
} from '../../analysis/crpm_world/adapters/v4-authority-adapter';
import { sha256Digest } from '../../analysis/crpm_world/canonical';
import { getCutDefinition } from '../../analysis/crpm_world/cuts/registry';
import {
    V4_CUT_IDS,
    V4_SUPPORT_TWIN_SEED
} from '../../analysis/crpm_world/cuts/v4-cuts';
import { assessReturn } from '../../analysis/crpm_world/kernel/assess-return';
import { composeEdges } from '../../analysis/crpm_world/kernel/compose-edges';
import {
    projectV4CommandSample,
    type V4CommandSample
} from '../../analysis/crpm_world/kernel/project-cut';
import {
    reenterSimulationVoyage,
    traceVoyage
} from '../../analysis/crpm_world/kernel/trace-voyage';
import {
    ResidualLedgerSchema,
    ReturnAssessmentSchema,
    VoyageTraceV2Schema,
    WorldTransitionEdgeV2Schema
} from '../../analysis/crpm_world/schemas';
import type {
    ResidualLedger,
    WorldTransitionEdgeV2
} from '../../analysis/crpm_world/types';

const COMPOSITION_POLICY = Object.freeze({
    externallySuppliedInputPorts: ['simulation-command'],
    forbiddenPortIds: ['live-gameplay-mutation', 'production-activation']
});

function authorityTranscript(
    declaredCutId = V4_CUT_IDS.authority
): { initialState: SimulationState; outputs: AuthorityAdapterOutput[] } {
    const initialState = createSimulation(V4_SUPPORT_TWIN_SEED, 'wizard', V4_RULESET_ID);
    const commands: SimulationCommand[] = [
        { type: 'move', direction: 1 },
        { type: 'select_relic', relicId: 'needlepoint' },
        { type: 'aim', angleMilliDegrees: 45_000, powerPermille: 500 },
        { type: 'fire' }
    ];
    const outputs: AuthorityAdapterOutput[] = [];
    let state = initialState;
    for (const command of commands) {
        const output = adaptSimulationCommand(
            state,
            state.activeActor,
            command,
            state.turn,
            declaredCutId
        );
        assert.equal(output.transition.accepted, true);
        outputs.push(output);
        state = output.transition.state;
    }
    return { initialState, outputs };
}

function withResidual(
    edge: WorldTransitionEdgeV2,
    update: Partial<ResidualLedger>
): WorldTransitionEdgeV2 {
    return WorldTransitionEdgeV2Schema.parse({
        ...edge,
        residual: ResidualLedgerSchema.parse({ ...edge.residual, ...update })
    });
}

function afterPositionReturningCycles(count: number): SimulationState {
    let state = createSimulation(V4_SUPPORT_TWIN_SEED, 'wizard', V4_RULESET_ID);
    for (let cycle = 0; cycle < count; cycle += 1) {
        state = applySimulationCommand(state, 'player', { type: 'move', direction: 1 }, 0).state;
        state = applySimulationCommand(state, 'player', { type: 'move', direction: -1 }, 0).state;
    }
    return state;
}

function movementSample(state: SimulationState): V4CommandSample {
    return {
        state,
        actor: 'player',
        command: { type: 'move', direction: 1 },
        expectedTurn: 0
    };
}

test('move, select, aim, and fire edges compose into a deterministic re-enterable voyage', () => {
    const { initialState, outputs } = authorityTranscript();
    const callerBefore = canonicalSimulationJson(initialState);
    for (let index = 1; index < outputs.length; index += 1) {
        const composition = composeEdges(outputs[index - 1].edge, outputs[index].edge, COMPOSITION_POLICY);
        assert.equal(composition.compatible, true);
        assert.deepEqual(composition.witness.issues, []);
        assert.equal(composition.partialValidEdges.length, 2);
    }

    const voyage = traceVoyage(outputs.map((output) => output.edge), {
        voyageId: 'v4-move-select-aim-fire-voyage',
        ...COMPOSITION_POLICY
    });
    assert.equal(VoyageTraceV2Schema.safeParse(voyage).success, true);
    assert.equal(voyage.compatibilityResult.compatible, true);
    assert.deepEqual(voyage.edgeAttempts.map((attempt) => attempt.outcome), [
        'accepted', 'accepted', 'accepted', 'accepted'
    ]);
    assert.deepEqual(voyage.commandPath.map((entry) => entry.commandOrDeclaration),
        outputs.map((output) => output.edge.commandOrDeclaration));
    assert.equal(voyage.witnessReferences.length, 4);
    assert.equal(voyage.terminalResult.status, 'nonterminal');

    const reentry = reenterSimulationVoyage(initialState, voyage);
    assert.equal(reentry.matched, true);
    assert.deepEqual(reentry.issues, []);
    assert.equal(reentry.reproducedEdgeDigests.length, 4);
    assert.equal(
        canonicalSimulationJson(reentry.finalState),
        outputs[3].postStateJson
    );
    assert.equal(canonicalSimulationJson(initialState), callerBefore);
});

test('state and revision incompatibilities return structured partial traces', () => {
    const { initialState, outputs } = authorityTranscript();
    const independent = adaptSimulationCommand(
        initialState,
        'player',
        { type: 'select_relic', relicId: 'needlepoint' },
        0,
        V4_CUT_IDS.authority
    );
    const stateMismatch = composeEdges(outputs[0].edge, independent.edge, COMPOSITION_POLICY);
    assert.equal(stateMismatch.compatible, false);
    assert.equal(stateMismatch.partialValidEdges.length, 1);
    assert.equal(stateMismatch.attemptedEdge.edgeId, independent.edge.edgeId);
    assert.ok(stateMismatch.witness.issues.some((item) => item.code === 'carrier-state-mismatch'));
    const partialVoyage = traceVoyage([
        outputs[0].edge,
        independent.edge,
        outputs[1].edge
    ], {
        voyageId: 'partial-voyage-retains-incompatible-attempt',
        ...COMPOSITION_POLICY
    });
    assert.deepEqual(partialVoyage.edgeAttempts.map((attempt) => attempt.outcome), [
        'accepted', 'incompatible', 'accepted'
    ]);
    assert.deepEqual(partialVoyage.transitionEdges.map((edge) => edge.edgeId), [
        outputs[0].edge.edgeId,
        outputs[1].edge.edgeId
    ]);
    assert.equal(partialVoyage.compatibilityResult.compatible, false);

    const second = outputs[1].edge;
    const shiftedSource = {
        ...second.sourceCarrier,
        revisionOrStep: second.sourceCarrier.revisionOrStep + 1
    };
    const revisionMismatchEdge = WorldTransitionEdgeV2Schema.parse({
        ...second,
        sourceCarrier: shiftedSource,
        fixedFrame: {
            ...second.fixedFrame,
            expectedRevisionOrStep: shiftedSource.revisionOrStep
        },
        carrierRefs: [sha256Digest(shiftedSource), sha256Digest(second.targetCarrier)]
    });
    const revisionMismatch = composeEdges(outputs[0].edge, revisionMismatchEdge, COMPOSITION_POLICY);
    assert.equal(revisionMismatch.compatible, false);
    assert.ok(revisionMismatch.witness.issues.some((item) => item.code === 'revision-order-mismatch'));
});

test('cut mismatches and forbidden ports fail closed unless the cut boundary is explicit', () => {
    const { outputs } = authorityTranscript();
    const nextState = outputs[0].transition.state;
    const thinEdge = adaptSimulationCommand(
        nextState,
        'player',
        { type: 'select_relic', relicId: 'needlepoint' },
        nextState.turn,
        V4_CUT_IDS.thinVisibleDuel
    ).edge;
    const cutMismatch = composeEdges(outputs[0].edge, thinEdge, COMPOSITION_POLICY);
    assert.equal(cutMismatch.compatible, false);
    assert.ok(cutMismatch.witness.issues.some((item) => item.code === 'cut-mismatch'));

    const allowed = composeEdges(outputs[0].edge, thinEdge, {
        ...COMPOSITION_POLICY,
        allowedCutTransitions: [{
            targetCutId: V4_CUT_IDS.authority,
            sourceCutId: V4_CUT_IDS.thinVisibleDuel
        }]
    });
    assert.equal(allowed.compatible, true);
    const cutVoyage = traceVoyage([outputs[0].edge, thinEdge], {
        voyageId: 'explicit-authority-to-thin-cut-voyage',
        ...COMPOSITION_POLICY,
        allowedCutTransitions: [{
            targetCutId: V4_CUT_IDS.authority,
            sourceCutId: V4_CUT_IDS.thinVisibleDuel
        }]
    });
    assert.deepEqual(cutVoyage.cutChanges, [{
        sequence: 1,
        sourceCutId: V4_CUT_IDS.authority,
        targetCutId: V4_CUT_IDS.thinVisibleDuel
    }]);

    const forbiddenEdge = WorldTransitionEdgeV2Schema.parse({
        ...outputs[1].edge,
        portBindings: {
            ...outputs[1].edge.portBindings,
            actionPorts: [
                ...outputs[1].edge.portBindings.actionPorts,
                'production-activation'
            ]
        }
    });
    const forbidden = composeEdges(outputs[0].edge, forbiddenEdge, COMPOSITION_POLICY);
    assert.equal(forbidden.compatible, false);
    assert.deepEqual(forbidden.witness.forbiddenPortsCrossed, ['production-activation']);
    assert.ok(forbidden.witness.issues.some((item) => item.code === 'forbidden-port-crossing'));
});

test('residuals accumulate and obligations must be carried or discharged explicitly', () => {
    const { outputs } = authorityTranscript();
    const obligationId = 'movement-support-return';
    const first = withResidual(outputs[0].edge, {
        resourceDeltas: [{
            subject: 'test-resource',
            before: 0,
            after: 1,
            description: 'Synthetic composition-test resource residue.'
        }],
        openedObligations: [obligationId],
        unresolvedObligations: [obligationId]
    });
    const carried = withResidual(outputs[1].edge, {
        unresolvedObligations: [obligationId]
    });
    const composed = composeEdges(first, carried, COMPOSITION_POLICY);
    assert.equal(composed.compatible, true);
    assert.equal(composed.accumulatedResidual.resourceDeltas.length,
        first.residual.resourceDeltas.length + carried.residual.resourceDeltas.length);
    assert.deepEqual(composed.carriedObligations, [obligationId]);
    assert.deepEqual(composed.unresolvedObligations, [obligationId]);

    const missingCarry = composeEdges(first, outputs[1].edge, COMPOSITION_POLICY);
    assert.equal(missingCarry.compatible, false);
    assert.ok(missingCarry.witness.issues.some((item) => item.code === 'obligation-not-propagated'));

    const discharged = withResidual(outputs[1].edge, {
        dischargedObligations: [obligationId],
        unresolvedObligations: []
    });
    const dischargedComposition = composeEdges(first, discharged, COMPOSITION_POLICY);
    assert.equal(dischargedComposition.compatible, true);
    assert.deepEqual(dischargedComposition.unresolvedObligations, []);
    assert.deepEqual(dischargedComposition.accumulatedResidual.dischargedObligations, [obligationId]);
});

test('visible equality remains distinct from recursive carrier and finite exact return', () => {
    const oneCycle = afterPositionReturningCycles(1);
    const fourCycles = afterPositionReturningCycles(4);
    const leftSample = movementSample(oneCycle);
    const rightSample = movementSample(fourCycles);
    const leftCarrier = adaptSimulationCommand(
        oneCycle, 'player', leftSample.command, 0, V4_CUT_IDS.authority
    ).edge.sourceCarrier;
    const rightCarrier = adaptSimulationCommand(
        fourCycles, 'player', rightSample.command, 0, V4_CUT_IDS.authority
    ).edge.sourceCarrier;
    const assessment = assessReturn({
        assessmentId: 'v4-visible-versus-recursive-return',
        sourceCarrier: leftCarrier,
        targetCarrier: rightCarrier,
        declaredDomain: getCutDefinition(V4_CUT_IDS.boundedCommandSupport).admissibleDomain,
        visibleProjection: {
            cutId: V4_CUT_IDS.thinVisibleDuel,
            sourceKey: projectV4CommandSample(V4_CUT_IDS.thinVisibleDuel, leftSample).projectedValue,
            targetKey: projectV4CommandSample(V4_CUT_IDS.thinVisibleDuel, rightSample).projectedValue,
            declaredExclusions: getCutDefinition(V4_CUT_IDS.thinVisibleDuel)
                .intentionallyForgottenDistinctions
        },
        protectedEquivalence: {
            cutId: V4_CUT_IDS.thinVisibleDuel,
            decodable: true,
            witnessRefs: ['thin-visible-duel-decoder-test'],
            declaredExclusions: ['Full authority equality is not protected by the thin cut.']
        },
        recursiveCarrier: {
            cutId: V4_CUT_IDS.boundedCommandSupport,
            supportCompleteForDeclaredDomain: true,
            sourceKey: projectV4CommandSample(V4_CUT_IDS.boundedCommandSupport, leftSample).projectedValue,
            targetKey: projectV4CommandSample(V4_CUT_IDS.boundedCommandSupport, rightSample).projectedValue,
            declaredExclusions: getCutDefinition(V4_CUT_IDS.boundedCommandSupport)
                .intentionallyForgottenDistinctions
        },
        invariantRegion: {
            regionId: 'v4-live-player-turn-region',
            sourceInRegion: true,
            targetInRegion: true,
            pathRemainsInRegion: true
        }
    });
    assert.equal(ReturnAssessmentSchema.safeParse(assessment).success, true);
    const status = new Map(assessment.classifications.map((item) => [item.classification, item.status]));
    assert.equal(status.get('visible_equal'), 'satisfied');
    assert.equal(status.get('protected_equivalent'), 'satisfied');
    assert.equal(status.get('recursive_carrier_return'), 'not_satisfied');
    assert.equal(status.get('invariant_region_return'), 'satisfied');
    assert.equal(status.get('finite_exact_return'), 'not_satisfied');
});

test('finite exact return and route mismatch remain separately executable', () => {
    const { outputs } = authorityTranscript();
    const carrier = outputs[0].edge.sourceCarrier;
    const exact = assessReturn({
        assessmentId: 'finite-exact-carrier-return',
        sourceCarrier: carrier,
        targetCarrier: carrier,
        declaredDomain: getCutDefinition(V4_CUT_IDS.authority).admissibleDomain
    });
    assert.deepEqual(exact.satisfiedClassifications, ['finite_exact_return']);

    const leftVoyage = traceVoyage([outputs[0].edge], {
        voyageId: 'left-route',
        ...COMPOSITION_POLICY
    });
    const obligationEdge = withResidual(outputs[0].edge, {
        openedObligations: ['route-specific-obligation'],
        unresolvedObligations: ['route-specific-obligation']
    });
    const rightVoyage = traceVoyage([obligationEdge], {
        voyageId: 'right-route',
        ...COMPOSITION_POLICY
    });
    const mismatch = assessReturn({
        assessmentId: 'paired-route-mismatch',
        sourceCarrier: leftVoyage.initialCarrier,
        targetCarrier: leftVoyage.finalCarrier,
        declaredDomain: getCutDefinition(V4_CUT_IDS.authority).admissibleDomain,
        routeComparison: {
            leftVoyage,
            rightVoyage,
            leftTargetProjectionKey: 'same-visible-target',
            rightTargetProjectionKey: 'same-visible-target'
        }
    });
    assert.ok(mismatch.satisfiedClassifications.includes('route_mismatch'));
    assert.notEqual(
        sha256Digest(leftVoyage.accumulatedResidual),
        sha256Digest(rightVoyage.accumulatedResidual)
    );
});

test('rejected attempts remain visible and do not mutate the composed carrier', () => {
    const initialState = createSimulation(V4_SUPPORT_TWIN_SEED, 'wizard', V4_RULESET_ID);
    const rejected = adaptSimulationCommand(
        initialState,
        'player',
        { type: 'fire' },
        0,
        V4_CUT_IDS.authority
    );
    const accepted = adaptSimulationCommand(
        initialState,
        'player',
        { type: 'move', direction: 1 },
        0,
        V4_CUT_IDS.authority
    );
    const voyage = traceVoyage([rejected.edge, accepted.edge], {
        voyageId: 'rejected-then-accepted-voyage',
        ...COMPOSITION_POLICY
    });
    assert.deepEqual(voyage.edgeAttempts.map((attempt) => attempt.outcome), ['rejected', 'accepted']);
    assert.equal(voyage.transitionEdges.length, 2);
    assert.equal(rejected.edge.sourceCarrier.stateDigest, rejected.edge.targetCarrier.stateDigest);
    assert.equal(voyage.finalCarrier.stateDigest, accepted.edge.targetCarrier.stateDigest);

    const reentry = reenterSimulationVoyage(initialState, voyage);
    assert.equal(reentry.matched, true);
    assert.equal(reentry.reproducedEdgeDigests.length, 2);
    assert.equal(canonicalSimulationJson(reentry.finalState), accepted.postStateJson);
});
