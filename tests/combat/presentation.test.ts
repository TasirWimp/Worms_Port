import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChallengeSnapshot } from '../../shared/protocol';
import {
    applySimulationCommand,
    createLatestSimulation,
    type SimulationActor,
    type SimulationCommand,
    type SimulationState
} from '../../shared/simulation';
import { planCombatPresentation } from '../../client/src/combat/presentation';

test('presentation plan distinguishes movement from player and Loomkeeper shots', () => {
    const initial = createLatestSimulation(1, 'wizard');
    const moved = apply(initial, 'player', { type: 'move', direction: 1 });
    assert.deepEqual(
        planCombatPresentation(snapshot(initial), snapshot(moved), false).map((step) => step.phase),
        ['player-movement']
    );

    const aimed = apply(moved, 'player', {
        type: 'aim', angleMilliDegrees: 40_000, powerPermille: 1_000
    });
    const playerFire = apply(aimed, 'player', { type: 'fire' });
    assert.deepEqual(
        planCombatPresentation(snapshot(aimed), snapshot(playerFire), false).map((step) => step.phase),
        ['player-cast-charge', 'player-cast-formation', 'player-projectile', 'player-impact']
    );
    assert.equal(playerFire.activeActor, 'loomkeeper');

    const loomkeeperAim = apply(playerFire, 'loomkeeper', {
        type: 'aim', angleMilliDegrees: 35_000, powerPermille: 900
    });
    const loomkeeperFire = apply(loomkeeperAim, 'loomkeeper', { type: 'fire' });
    assert.deepEqual(
        planCombatPresentation(
            snapshot(playerFire),
            snapshot(loomkeeperFire),
            false
        ).map((step) => step.phase),
        [
            'loomkeeper-aim',
            'loomkeeper-cast-charge',
            'loomkeeper-cast-formation',
            'loomkeeper-projectile',
            'loomkeeper-impact'
        ]
    );
});

test('reduced motion keeps causal phases while shortening their duration', () => {
    const initial = createLatestSimulation(0xC0FFEE11, 'wizard');
    const aimed = apply(initial, 'player', {
        type: 'aim', angleMilliDegrees: 45_000, powerPermille: 1_000
    });
    const fired = apply(aimed, 'player', { type: 'fire' });
    const normal = planCombatPresentation(snapshot(aimed), snapshot(fired), false);
    const reduced = planCombatPresentation(snapshot(aimed), snapshot(fired), true);
    assert.deepEqual(reduced.map((step) => step.phase), normal.map((step) => step.phase));
    assert.equal(reduced.every((step, index) => step.durationMs < normal[index].durationMs), true);
});

test('Needlepoint and Spoolburst complete the Wizard spell before their generic flight', () => {
    for (const relicId of ['needlepoint', 'spoolburst'] as const) {
        const initial = createLatestSimulation(relicId === 'needlepoint' ? 71 : 72, 'wizard');
        const selected = apply(initial, 'player', { type: 'select_relic', relicId });
        const aimed = apply(selected, 'player', {
            type: 'aim', angleMilliDegrees: 35_000, powerPermille: 900
        });
        const fired = apply(aimed, 'player', { type: 'fire' });
        const steps = planCombatPresentation(snapshot(aimed), snapshot(fired), false);
        assert.deepEqual(steps.map((step) => step.phase), [
            'player-cast-charge',
            'player-cast-formation',
            'player-projectile',
            'player-impact'
        ]);
        assert.equal(steps[0].relicId, relicId);
        assert.equal(steps[1].relicId, relicId);
        assert.equal(steps[0].durationMs + steps[1].durationMs, 2_000);
    }
});

function apply(
    state: SimulationState,
    actor: SimulationActor,
    command: SimulationCommand
): SimulationState {
    const result = applySimulationCommand(state, actor, command, state.turn);
    assert.equal(result.accepted, true, result.error?.message);
    return result.state;
}

function snapshot(simulation: SimulationState): ChallengeSnapshot {
    return {
        protocolVersion: 1,
        serverTimeMs: simulation.revision,
        sessionId: 'presentation_session',
        challengeId: 'presentation_challenge',
        mode: 'practice',
        calling: 'wizard',
        loomkeeperDifficulty: 'standard',
        loomkeeperPolicyId: 'nimble-knots-loomkeeper-v2',
        status: simulation.phase === 'finished' ? 'completed' : 'active',
        paused: false,
        revision: simulation.revision,
        nextSequence: simulation.revision,
        expiresAt: '2099-01-01T00:00:00.000Z',
        stateHash: simulation.revision.toString(16).padStart(64, '0'),
        simulation: simulation as ChallengeSnapshot['simulation']
    };
}
