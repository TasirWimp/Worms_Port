import assert from 'node:assert/strict';
import test from 'node:test';

import {
    LEGACY_RULESET_ID,
    SIM_RULES,
    V4_RULESET_ID,
    advanceSimulationTicks,
    applySimulationCommand,
    canonicalSimulationJson,
    createSimulation,
    type SimulationActor,
    type SimulationCommand,
    type SimulationState
} from '../../shared/simulation';
import {
    DEFAULT_AUTHORITY_CUT,
    SIMULATION_AUTHORITY_ADAPTER_ID,
    SIMULATION_AUTHORITY_ADAPTER_VERSION,
    adaptSimulationCommand,
    projectSimulationAuthorityCut
} from '../../analysis/crpm_world/adapters/v4-authority-adapter';
import { V4_CUT_IDS, V4_CUT_VERSION } from '../../analysis/crpm_world/cuts/v4-cuts';
import { sha256Digest, sha256Text } from '../../analysis/crpm_world/canonical';
import {
    TransitionWitnessSchema,
    WorldTransitionEdgeSchema,
    WorldTransitionEdgeV2Schema
} from '../../analysis/crpm_world/schemas';

function assertDirectParity(
    state: SimulationState,
    actor: SimulationActor,
    command: SimulationCommand,
    expectedTurn: number,
    declaredCut?: { id: string; version: number }
) {
    const stateSnapshot = structuredClone(state);
    const commandSnapshot = structuredClone(command);
    const direct = applySimulationCommand(state, actor, command, expectedTurn);
    const adapted = adaptSimulationCommand(state, actor, command, expectedTurn, declaredCut);

    assert.deepEqual(adapted.transition, direct);
    assert.equal(adapted.transition.accepted, direct.accepted);
    assert.equal(adapted.transition.mutated, direct.mutated);
    assert.deepEqual(adapted.transition.state, direct.state);
    assert.deepEqual(adapted.transition.events, direct.events);
    assert.deepEqual(adapted.transition.error, direct.error);
    assert.deepEqual(state, stateSnapshot, 'caller state must remain unchanged');
    assert.deepEqual(command, commandSnapshot, 'caller command must remain unchanged');

    assert.equal(adapted.preStateJson, canonicalSimulationJson(state));
    assert.equal(adapted.postStateJson, canonicalSimulationJson(direct.state));
    assert.equal(adapted.preStateDigest, sha256Text(adapted.preStateJson));
    assert.equal(adapted.postStateDigest, sha256Text(adapted.postStateJson));
    assert.equal(adapted.eventsDigest, sha256Digest(direct.events));
    assert.equal(adapted.edge.sourceCarrier.stateDigest, adapted.preStateDigest);
    assert.equal(adapted.edge.targetCarrier.stateDigest, adapted.postStateDigest);
    assert.equal(adapted.edge.witnessReferences[0].digest, adapted.witnessDigest);
    assert.equal(adapted.witness.orderedEventsDigest, adapted.eventsDigest);
    assert.equal(adapted.edgeDigest, sha256Digest(adapted.edge));
    assert.equal(adapted.witnessDigest, sha256Digest(adapted.witness));
    assert.equal(WorldTransitionEdgeSchema.safeParse(adapted.edge).success, true);
    assert.equal(WorldTransitionEdgeV2Schema.safeParse(adapted.edge).success, true);
    assert.equal(TransitionWitnessSchema.safeParse(adapted.witness).success, true);
    return adapted;
}

test('accepted movement has exact direct parity for historical V1 and current V4', () => {
    for (const rulesetId of [LEGACY_RULESET_ID, V4_RULESET_ID]) {
        const state = createSimulation(0xC0FFEE11, 'wizard', rulesetId);
        const adapted = assertDirectParity(state, 'player', { type: 'move', direction: 1 }, 0);

        assert.equal(adapted.transition.accepted, true, rulesetId);
        assert.equal(adapted.transition.mutated, true, rulesetId);
        assert.equal(adapted.rulesetId, rulesetId);
        assert.equal(adapted.rulesetVersion, state.rulesetVersion);
        assert.equal(adapted.edge.domainMotif, 'move');
        assert.equal(adapted.edge.edgeKind, 'authority-state-transition');
        assert.equal(adapted.edge.schemaVersion, 2);
        assert.equal(adapted.edge.productAuthority, 'none');
    }
});

test('wrong-actor movement is witnessed as a rejected response, not a successful state edge', () => {
    const state = createSimulation(0xC0FFEE11, 'wizard', V4_RULESET_ID);
    const adapted = assertDirectParity(state, 'loomkeeper', { type: 'move', direction: -1 }, 0);

    assert.equal(adapted.transition.accepted, false);
    assert.equal(adapted.transition.mutated, false);
    assert.equal(adapted.transition.error?.code, 'NOT_YOUR_TURN');
    assert.equal(adapted.edge.domainMotif, 'rejected_command');
    assert.equal(adapted.edge.edgeKind, 'authority-rejected-transition-witness');
    assert.equal(adapted.edge.reversibility, 'exact');
    assert.equal(adapted.preStateDigest, adapted.postStateDigest);
    assert.match(adapted.edge.residual.excludedUnmodelledResidue.join(' '), /not a successful state edge/);
});

test('select Relic and aim commands preserve exact state and event parity', () => {
    const state = createSimulation(0xC0FFEE11, 'wizard', V4_RULESET_ID);
    const selected = assertDirectParity(state, 'player', {
        type: 'select_relic', relicId: 'needlepoint'
    }, 0);
    assert.equal(selected.edge.domainMotif, 'select_relic');
    assert.deepEqual(selected.transition.events, [{
        type: 'relic_selected', actor: 'player', relicId: 'needlepoint'
    }]);

    const aimed = assertDirectParity(selected.transition.state, 'player', {
        type: 'aim', angleMilliDegrees: 45_000, powerPermille: 1_000
    }, 0);
    assert.equal(aimed.edge.domainMotif, 'aim');
    assert.equal(aimed.transition.state.aim?.angleMilliDegrees, 45_000);
});

test('deterministic fire transcript preserves exact authoritative events and compact terrain support', () => {
    const initial = createSimulation(0xC0FFEE11, 'wizard', V4_RULESET_ID);
    const aimed = applySimulationCommand(initial, 'player', {
        type: 'aim', angleMilliDegrees: 45_000, powerPermille: 1_000
    }, 0).state;
    const adapted = assertDirectParity(aimed, 'player', { type: 'fire' }, 0, DEFAULT_AUTHORITY_CUT);
    const response = adapted.edge.response as Record<string, unknown>;

    assert.deepEqual(adapted.edge.sourceCut, DEFAULT_AUTHORITY_CUT);
    assert.equal(adapted.edge.domainMotif, 'fire');
    assert.equal(adapted.transition.accepted, true);
    assert.ok(adapted.transition.events.some((event) => event.type === 'projectile'));
    assert.ok(adapted.transition.events.some((event) => event.type === 'impact'));
    assert.deepEqual(response.authoritativeEvents, adapted.transition.events);
    assert.equal(response.eventsDigest, adapted.eventsDigest);
    assert.equal('state' in response, false, 'the edge response must not flatten the full state');
    assert.equal(JSON.stringify(adapted.edge.residual).includes('"words"'), false);

    const subjects = new Set([
        ...adapted.edge.residual.positionDeltas,
        ...adapted.edge.residual.resourceDeltas,
        ...adapted.edge.residual.healthDeltas,
        ...adapted.edge.residual.statusDeltas,
        ...adapted.edge.residual.terrainDeltas
    ].map((entry) => entry.subject));
    for (const subject of [
        'state.tick',
        'state.revision',
        'state.turn',
        'state.active-actor',
        'state.movement-remaining',
        'state.selected-relic',
        'state.aim',
        'unit.player.position',
        'unit.loomkeeper.position',
        'unit.player.stitching-alive',
        'unit.loomkeeper.stitching-alive',
        'state.terrain-digest',
        'state.last-projectile-digest',
        'state.phase',
        'state.winner',
        'state.finish-reason'
    ]) assert.equal(subjects.has(subject), true, subject);
    assert.equal(adapted.edge.residual.authorityDeltas.length, 1);
});

test('fire without aim is an exact rejected-command witness', () => {
    const state = createSimulation(0xC0FFEE11, 'wizard', V4_RULESET_ID);
    const adapted = assertDirectParity(state, 'player', { type: 'fire' }, 0);

    assert.equal(adapted.transition.accepted, false);
    assert.equal(adapted.transition.error?.code, 'COMMAND_REJECTED');
    assert.match(adapted.transition.error?.message ?? '', /Aim must be locked/);
    assert.equal(adapted.edge.domainMotif, 'rejected_command');
});

test('commands against a terminal authority state remain exact rejected witnesses', () => {
    const state = createSimulation(0xC0FFEE11, 'wizard', V4_RULESET_ID);
    const terminal = advanceSimulationTicks(
        state,
        SIM_RULES.turnTicks * SIM_RULES.maximumTurns
    ).state;
    assert.equal(terminal.phase, 'finished');

    const adapted = assertDirectParity(terminal, 'player', { type: 'move', direction: 0 }, terminal.turn);
    assert.equal(adapted.transition.accepted, false);
    assert.equal(adapted.transition.error?.code, 'COMMAND_REJECTED');
    assert.match(adapted.transition.error?.message ?? '', /already finished/);
    assert.equal(adapted.edge.domainMotif, 'rejected_command');
});

test('repeated adapter execution produces identical edge and witness records and digests', () => {
    const state = createSimulation(0xC0FFEE11, 'wizard', V4_RULESET_ID);
    const command = { type: 'aim', angleMilliDegrees: 30_000, powerPermille: 500 } as const;
    const first = adaptSimulationCommand(state, 'player', command, 0, DEFAULT_AUTHORITY_CUT);
    const second = adaptSimulationCommand(state, 'player', command, 0, DEFAULT_AUTHORITY_CUT);

    assert.deepEqual(first.transition, second.transition);
    assert.deepEqual(first.edge, second.edge);
    assert.deepEqual(first.witness, second.witness);
    assert.equal(first.edgeDigest, second.edgeDigest);
    assert.equal(first.witnessDigest, second.witnessDigest);
    assert.equal(first.adapterId, SIMULATION_AUTHORITY_ADAPTER_ID);
    assert.equal(first.adapterVersion, SIMULATION_AUTHORITY_ADAPTER_VERSION);
});

test('authority-to-thin projection is an explicit versioned bridge edge', () => {
    const state = createSimulation(0xC0FFEE11, 'wizard', V4_RULESET_ID);
    const projected = projectSimulationAuthorityCut(state, {
        id: V4_CUT_IDS.thinVisibleDuel,
        version: V4_CUT_VERSION
    });

    assert.deepEqual(projected.edge.sourceCut, DEFAULT_AUTHORITY_CUT);
    assert.deepEqual(projected.edge.targetCut, { id: V4_CUT_IDS.thinVisibleDuel, version: V4_CUT_VERSION });
    assert.equal(projected.edge.edgeKind, 'authority-cut-projection');
    assert.equal(projected.edge.sourceCarrier.carrierKind, 'authority');
    assert.equal(projected.edge.targetCarrier.carrierKind, 'player-public');
    assert.notEqual(projected.edge.sourceCarrier.stateDigest, projected.edge.targetCarrier.stateDigest);
    assert.match(projected.edge.returnCondition, /source authority reference and digest/i);
});

test('authority adapter rejects arbitrary or wrong-version cut references', () => {
    const state = createSimulation(0xC0FFEE11, 'wizard', V4_RULESET_ID);
    assert.throws(() => adaptSimulationCommand(
        state,
        'player',
        { type: 'move', direction: 1 },
        0,
        { id: V4_CUT_IDS.thinVisibleDuel, version: V4_CUT_VERSION }
    ), /not compatible/);
    assert.throws(() => adaptSimulationCommand(
        state,
        'player',
        { type: 'move', direction: 1 },
        0,
        { id: V4_CUT_IDS.authority, version: 99 }
    ), /Unknown or unversioned/);
});

test('domain motifs do not silently acquire CRPM cut-effect interpretations', () => {
    const state = createSimulation(0xC0FFEE11, 'wizard', V4_RULESET_ID);
    const adapted = adaptSimulationCommand(state, 'player', { type: 'move', direction: 1 }, 0);

    assert.equal('crpmTransitionInterpretation' in adapted.edge, false);
    assert.equal('crpmInterpretationJustification' in adapted.edge, false);
    assert.match(adapted.witness.excludedClaims.join(' '), /domain motif does not establish/i);
    assert.match(adapted.witness.excludedClaims.join(' '), /not the full source state/i);
});
