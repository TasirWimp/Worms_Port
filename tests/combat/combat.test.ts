import assert from 'node:assert/strict';
import test from 'node:test';

import { computeActorStatusLayout, computeCombatLayout } from '../../client/src/combat/layout';
import {
    cameraDirectionToWorldX,
    clampCombatCamera,
    createCombatCamera,
    focusCombatCamera,
    panCombatCamera,
    revealCombatCameraPoint
} from '../../client/src/combat/camera';
import { CombatInputController } from '../../client/src/combat/input';
import {
    WIZARD_ANIMATION_SCALE_IN_WORLD,
    WIZARD_R6_ANIMATION_SCALE_IN_WORLD,
    loomseedScreenPoint,
    traceFromLoomseedOrigin,
    wizardPresentationTopInWorld
} from '../../client/src/combat/loomseed-origin';
import { trajectoryPreview } from '../../client/src/combat/preview';
import { movementRefreshIntervalMs } from '../../client/src/combat/resource-turns-v9-controls';
import {
    applySimulationCommand,
    canonicalSimulationJson,
    createLatestSimulation,
    SIM_RULES
} from '../../shared/simulation';

const VIEWPORTS = [
    [360, 640],
    [390, 844],
    [412, 915],
    [844, 390],
    [800, 300]
] as const;

test('combat layout preserves the fixed world and non-overlapping safe control zones', () => {
    for (const [width, height] of VIEWPORTS) {
        const layout = computeCombatLayout(width, height, { top: 11, right: 7, bottom: 13, left: 5 });
        assert.equal(Math.abs(
            layout.battlefield.width / layout.battlefield.height -
            SIM_RULES.worldWidth / SIM_RULES.worldHeight
        ) < 1e-12, true);
        for (const rect of [layout.battlefield, layout.movementZone, layout.aimZone, layout.actionZone]) {
            assert.equal(rect.x >= 0 && rect.y >= 0, true);
            assert.equal(rect.x + rect.width <= width + 0.001, true, JSON.stringify({ width, rect }));
            assert.equal(rect.y + rect.height <= height + 0.001, true, JSON.stringify({ height, rect }));
        }
        assert.equal(overlaps(layout.movementZone, layout.aimZone), false);
        assert.equal(overlaps(layout.movementZone, layout.actionZone), false);
        assert.equal(overlaps(layout.aimZone, layout.actionZone), false);
    }
});

test('arena-first layout reaches the full-height Samsung acceptance target', () => {
    const layout = computeCombatLayout(844, 390);
    assert.equal(layout.battlefield.width >= 660, true, JSON.stringify(layout.battlefield));
    assert.equal(layout.battlefield.height >= 370, true, JSON.stringify(layout.battlefield));
    assert.equal(layout.battlefield.x >= 8, true);
    assert.equal(layout.battlefield.y >= 8, true);
});

test('actor Stitching cards keep their world anchor or hide instead of clamping to an edge', () => {
    const state = createLatestSimulation(0xC0FFEE11, 'wizard');
    const initialLayout = computeCombatLayout(844, 390);
    const initial = computeActorStatusLayout(initialLayout, state.units);
    assert.notEqual(initial.player, undefined);
    assert.equal(
        initial.player!.x + initial.player!.width / 2,
        initialLayout.battlefield.x + state.units[0].x * initialLayout.worldScaleX
    );

    const pannedLayout = computeCombatLayout(844, 390, undefined, {
        left: state.units[0].x + 64, top: 0, width: 1024, height: 576
    });
    const statuses = computeActorStatusLayout(pannedLayout, state.units);
    assert.equal(statuses.player, undefined);
    assert.notEqual(statuses.loomkeeper, undefined);
    assert.equal(
        statuses.loomkeeper!.x + statuses.loomkeeper!.width / 2,
        pannedLayout.battlefield.x +
            (state.units[1].x - pannedLayout.camera.left) * pannedLayout.worldScaleX
    );
});

test('actor Stitching cards do not claim a false in-field position near a camera edge', () => {
    const state = createLatestSimulation(0xC0FFEE11, 'wizard');
    const layout = computeCombatLayout(844, 390, undefined, {
        left: state.units[0].x - 32, top: 0, width: 1024, height: 576
    });
    const statuses = computeActorStatusLayout(layout, state.units);
    assert.equal(statuses.player, undefined);
    assert.notEqual(statuses.loomkeeper, undefined);
});

test('movement dead zone quantizes only the owned pointer and release outside is inert', () => {
    const input = new CombatInputController();
    assert.equal(input.begin('movement', 1, { x: 100, y: 100 }, 100), true);
    input.move(1, { x: 117, y: 100 });
    assert.equal(input.movementDirection(), 0);
    input.move(2, { x: 200, y: 100 });
    assert.equal(input.movementDirection(), 0);
    input.move(1, { x: 119, y: 100 });
    assert.equal(input.movementDirection(), 1);
    assert.equal(input.movementSteps(), 1);
    input.move(1, { x: 200, y: 100 });
    assert.equal(input.movementSteps(), 4);
    assert.deepEqual(input.end(1, true), { type: 'move', direction: 1 });

    assert.equal(input.begin('movement', 3, { x: 100, y: 100 }, 100), true);
    input.move(3, { x: 0, y: 100 });
    assert.equal(input.end(3, false), null);
    assert.equal(input.phase, 'idle');
});

test('aim clamps power, locks without firing, and explicit submission is separate', () => {
    const input = new CombatInputController();
    assert.equal(input.begin('aim', 7, { x: 200, y: 300 }, 100), true);
    input.move(7, { x: 400, y: 100 });
    const command = input.end(7, true);
    assert.equal(command?.type, 'aim');
    assert.equal(input.phase, 'aim_locked');
    assert.equal(input.lockedAim?.powerPermille, 1000);
    assert.equal(input.beginSubmission(), true);
    assert.equal(input.phase, 'submitting');
    input.finishSubmission(true, false);
    assert.equal(input.phase, 'idle');
    assert.equal(input.lockedAim, null);
});

test('cancellation, suspension, and pointer ownership cannot produce commands', () => {
    const input = new CombatInputController();
    assert.equal(input.begin('movement', 10, { x: 10, y: 10 }, 50), true);
    assert.equal(input.begin('aim', 11, { x: 30, y: 30 }, 50), false);
    assert.equal(input.cancel(11), false);
    assert.equal(input.cancel(10), true);
    input.suspend();
    assert.equal(input.begin('aim', 12, { x: 0, y: 0 }, 50), false);
    input.resume();
    assert.equal(input.phase, 'idle');
});

test('trajectory preview exactly matches cloned v2 resolution and leaves its source untouched', () => {
    const state = createLatestSimulation(0xC0FFEE11, 'wizard');
    const before = canonicalSimulationJson(state);
    const aim = { angleMilliDegrees: 42_000, powerPermille: 760 };
    const preview = trajectoryPreview(state, aim);
    const aimed = applySimulationCommand(state, 'player', { type: 'aim', ...aim }, state.turn);
    const fired = applySimulationCommand(aimed.state, 'player', { type: 'fire' }, aimed.state.turn);
    assert.deepEqual(preview, fired.state.lastProjectile?.trace);
    assert.equal(canonicalSimulationJson(state), before);
    assert.equal(preview.length >= 2, true);
});

test('current camera pans over the doubled arena without changing the phone-sized combat window', () => {
    const state = createLatestSimulation(0xC0FFEE11, 'wizard');
    const initial = createCombatCamera(state);
    assert.deepEqual(initial, { left: 0, top: 0, width: 1024, height: 576 });
    assert.equal(cameraDirectionToWorldX(initial, state.units[1].x), 'right');
    assert.deepEqual(panCombatCamera(state, initial, 9999), {
        left: 1024, top: 0, width: 1024, height: 576
    });
    assert.deepEqual(focusCombatCamera(state, initial, state.units[1].x), {
        left: state.units[1].x - 512, top: 0, width: 1024, height: 576
    });
    assert.deepEqual(revealCombatCameraPoint(state, initial, 1068), {
        left: 108, top: 0, width: 1024, height: 576
    });
    assert.deepEqual(revealCombatCameraPoint(state, initial, -25), initial);
    assert.deepEqual(clampCombatCamera(state, { ...initial, left: -20, top: 99 }), initial);

    const layout = computeCombatLayout(844, 390, undefined, initial);
    assert.equal(layout.battlefield.width >= 660, true);
    assert.equal(layout.battlefield.height >= 370, true);
    const statuses = computeActorStatusLayout(layout, state.units);
    assert.notEqual(statuses.player, undefined);
    assert.equal(statuses.loomkeeper, undefined);
});

test('Loomseed presentation anchor smoothly offsets a trace while preserving its authoritative impact', () => {
    const layout = computeCombatLayout(844, 390, { top: 0, right: 0, bottom: 0, left: 0 }, {
        left: 300, top: 0, width: 1024, height: 576
    });
    const root = { x: 220, y: 310, facing: 1 as const };
    const trace = [{ x: 324, y: 42 }, { x: 355, y: 30 }, { x: 388, y: 48 }];
    const anchor = loomseedScreenPoint(root, layout, 'animation-sheet');
    const displayed = traceFromLoomseedOrigin(trace, root, layout, 'animation-sheet');

    const wizardScale = Math.max(0.1, layout.worldScale * WIZARD_ANIMATION_SCALE_IN_WORLD);
    assert.equal(anchor.x, root.x + 30 * wizardScale);
    assert.equal(anchor.y, root.y - 106 * wizardScale);
    assert.equal(
        (displayed[0].x - layout.camera.left) * layout.worldScaleX + layout.battlefield.x,
        anchor.x
    );
    assert.equal(
        (displayed[0].y - layout.camera.top) * layout.worldScaleY + layout.battlefield.y,
        anchor.y
    );
    assert.equal(displayed[1].x, trace[1].x + (displayed[0].x - trace[0].x) * 0.25);
    assert.equal(displayed[1].y, trace[1].y + (displayed[0].y - trace[0].y) * 0.25);
    assert.deepEqual(displayed.at(-1), trace.at(-1));
    assert.deepEqual(trace, [{ x: 324, y: 42 }, { x: 355, y: 30 }, { x: 388, y: 48 }]);
});

test('R6 uses the compact coherent Wizard geometry without changing older presentation geometry', () => {
    const layout = computeCombatLayout(844, 390, { top: 0, right: 0, bottom: 0, left: 0 }, {
        left: 300, top: 0, width: 1024, height: 576
    });
    const root = { x: 220, y: 310, facing: 1 as const };
    const legacy = loomseedScreenPoint(root, layout, 'animation-sheet');
    const compact = loomseedScreenPoint(root, layout, 'animation-sheet', 'nimble-knots-artillery-v10-r6');
    const compactScale = Math.max(0.1, layout.worldScale * WIZARD_R6_ANIMATION_SCALE_IN_WORLD);

    assert.equal(WIZARD_R6_ANIMATION_SCALE_IN_WORLD, 0.4);
    assert.equal(compact.x, root.x + 30 * compactScale);
    assert.equal(compact.y, root.y - 106 * compactScale);
    assert.ok(compact.y > legacy.y);
    assert.ok(wizardPresentationTopInWorld('nimble-knots-artillery-v10-r6') < wizardPresentationTopInWorld());
    assert.equal(movementRefreshIntervalMs('nimble-knots-artillery-v10-r6'), 200);
    assert.equal(movementRefreshIntervalMs('nimble-knots-artillery-v10-r5'), 100);
});

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x &&
        a.y < b.y + b.height && a.y + a.height > b.y;
}
