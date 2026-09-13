import assert from 'node:assert/strict';
import test from 'node:test';

import { computeActorStatusLayout, computeCombatLayout } from '../../client/src/combat/layout';
import {
    cameraDirectionToWorldX,
    cameraForActor,
    createCombatCamera,
    createCombatOverviewCamera,
    interpolateCombatCamera,
    panCombatCamera
} from '../../client/src/combat/camera';
import {
    createSimulation,
    V4_RULESET_ID,
    V7_RULESET_ID
} from '../../shared/simulation';

test('V4 opening survey continuously contracts from the full arena to the normal player view', () => {
    const state = createSimulation(0xC0FFEE11, 'wizard', V4_RULESET_ID);
    const overview = createCombatOverviewCamera(state);
    const playerView = cameraForActor(state, createCombatCamera(state), 'player');
    assert.deepEqual(playerView, { left: 0, top: 0, width: 1024, height: 576 });
    assert.deepEqual(overview, { left: 0, top: 0, width: 2048, height: 576 });
    assert.equal(cameraDirectionToWorldX(overview, state.units[1].x), null);
    assert.deepEqual(interpolateCombatCamera(state, overview, playerView, 0.5), {
        left: 0, top: 0, width: 1536, height: 576
    });
    assert.deepEqual(interpolateCombatCamera(state, overview, playerView, 1), playerView);

    const layout = computeCombatLayout(844, 390, undefined, overview);
    const normalLayout = computeCombatLayout(844, 390, undefined, playerView);
    assert.equal(layout.battlefield.height, normalLayout.battlefield.height);
    assert.equal(layout.worldScaleY, normalLayout.worldScaleY);
    assert.equal(layout.worldScaleX, normalLayout.worldScaleX / 2);
    assert.equal(
        layout.battlefield.y + state.units[0].y * layout.worldScaleY,
        normalLayout.battlefield.y + state.units[0].y * normalLayout.worldScaleY,
        'the opening survey must keep the player planted at its normal vertical screen position'
    );
    assert.equal(
        layout.battlefield.y + state.units[1].y * layout.worldScaleY,
        normalLayout.battlefield.y + state.units[1].y * normalLayout.worldScaleY,
        'the opening survey must keep the Loomkeeper planted at its normal vertical screen position'
    );
    const statuses = computeActorStatusLayout(layout, state.units);
    assert.notEqual(statuses.player, undefined);
    assert.notEqual(statuses.loomkeeper, undefined);
});

test('V7 opening survey centres on terrain-derived spawns without changing vertical framing', () => {
    for (const seed of [1, 2, 3, 0xC0FFEE11, 0xDEADBEEF]) {
        const state = createSimulation(seed, 'wizard', V7_RULESET_ID);
        const overview = createCombatOverviewCamera(state);
        const playerView = cameraForActor(state, createCombatCamera(state), 'player');
        const expectedLeft = Math.max(0, Math.min(1024, state.units[0].x - 512));
        assert.deepEqual(playerView, { left: expectedLeft, top: 0, width: 1024, height: 576 });
        if (seed === 1) {
            assert.equal(state.units[0].x, 704);
            assert.equal(playerView.left, 192);
        }
        assert.deepEqual(interpolateCombatCamera(state, overview, playerView, 0.5), {
            left: expectedLeft / 2, top: 0, width: 1536, height: 576
        });
        assert.deepEqual(interpolateCombatCamera(state, overview, playerView, 1), playerView);
        assert.equal(cameraDirectionToWorldX(playerView, state.units[0].x), null);
        assert.equal(cameraDirectionToWorldX(playerView, state.units[1].x), 'right');
        const surveyLayout = computeCombatLayout(844, 390, undefined, overview);
        const playerLayout = computeCombatLayout(844, 390, undefined, playerView);
        assert.deepEqual(surveyLayout.battlefield, playerLayout.battlefield);
        assert.equal(surveyLayout.worldScaleY, playerLayout.worldScaleY);
    }
});

test('historical arenas remain a full-width zero-range camera', () => {
    const historical = createSimulation(0xC0FFEE11, 'wizard', 'nimble-knots-artillery-v3');
    const camera = createCombatCamera(historical);
    assert.deepEqual(camera, { left: 0, top: 0, width: 1024, height: 576 });
    assert.deepEqual(panCombatCamera(historical, camera, 100), camera);
    assert.deepEqual(createCombatOverviewCamera(historical), camera);
});

