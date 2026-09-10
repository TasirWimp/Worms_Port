import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BACKGROUND_LEGIBILITY_LANES,
    VOLCANIC_RUIN_BACKGROUND,
    VOLCANIC_RUIN_PREVIEW_WORLD,
    backgroundPlacements,
    backgroundSceneFromSearch,
    pointIsInBackgroundLegibilityLane,
    projectBackgroundPlacement,
    seededVegetationPlacements
} from '../../client/src/combat/background-scene';

test('volcanic-ruin scene art is an explicit engineering-preview opt-in', () => {
    assert.equal(backgroundSceneFromSearch('?combat-preview=v10g'), undefined);
    assert.equal(backgroundSceneFromSearch('?background-preview=volcanic-ruin'), VOLCANIC_RUIN_BACKGROUND);
    assert.equal(backgroundSceneFromSearch('?background-preview=other'), undefined);
});

test('landmarks use bounded parallax, height-scaled anchors, and explicit depth grammar', () => {
    const landmarks = VOLCANIC_RUIN_BACKGROUND.landmarkPlacements;
    assert.deepEqual(landmarks.map(({ asset, layer, parallax }) => [asset, layer, parallax]), [
        ['volcano', 'L1-distant', 0.08],
        ['jungle', 'L1-distant', 0.1],
        ['tower', 'L2-landmark', 0.18]
    ]);
    for (const placement of landmarks) {
        assert.ok(placement.parallax > 0 && placement.parallax < 1);
        assert.equal(pointIsInBackgroundLegibilityLane(placement.anchor), false);
    }
    assert.equal(BACKGROUND_LEGIBILITY_LANES.length, 3);
});

test('near vegetation is repeatable from its scene-owned seed and avoids legibility lanes', () => {
    const first = seededVegetationPlacements(VOLCANIC_RUIN_BACKGROUND.vegetationSeed);
    const second = seededVegetationPlacements(VOLCANIC_RUIN_BACKGROUND.vegetationSeed);
    assert.deepEqual(first, second);
    assert.equal(first.length, 6);
    for (const placement of first) {
        assert.equal(placement.layer, 'L3-near');
        assert.ok(placement.parallax >= 0.3 && placement.parallax <= 0.35);
        assert.equal(pointIsInBackgroundLegibilityLane(placement.anchor), false);
    }
    assert.deepEqual(backgroundPlacements(VOLCANIC_RUIN_BACKGROUND).slice(0, 3), VOLCANIC_RUIN_BACKGROUND.landmarkPlacements);
});

test('background projection uses only layout/camera inputs with bounded parallax and depth', () => {
    const placement = VOLCANIC_RUIN_BACKGROUND.landmarkPlacements[0];
    const basis = { worldWidth: 2048, worldHeight: 576, cameraLeft: 0,
        fieldX: 10, fieldY: 20, fieldHeight: 576, worldScaleX: 1, worldScaleY: 1 };
    const initial = projectBackgroundPlacement(placement, basis);
    const panned = projectBackgroundPlacement(placement, { ...basis, cameraLeft: 100 });
    assert.equal(initial.x - panned.x, 8);
    assert.equal(initial.scale, placement.scale);
    assert.equal(initial.depth, 0.1);
    assert.ok(initial.depth < 1, 'decorative scene art remains behind terrain and actors');
});

test('the preview scene has a fixed reviewed world and no terrain-derived placement input', () => {
    assert.deepEqual(VOLCANIC_RUIN_PREVIEW_WORLD, { width: 2048, height: 576 });
});
