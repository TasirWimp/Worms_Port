import assert from 'node:assert/strict';
import test from 'node:test';

import { computeActorStatusLayout, computeCombatLayout } from '../../client/src/combat/layout';
import { CombatInputController } from '../../client/src/combat/input';
import { loomseedScreenPoint, traceFromLoomseedOrigin } from '../../client/src/combat/loomseed-origin';
import { trajectoryPreview } from '../../client/src/combat/preview';
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

test('actor Stitching anchors clamp to the arena and separate on collision', () => {
    const layout = computeCombatLayout(844, 390);
    const state = createLatestSimulation(0xC0FFEE11, 'wizard');
    state.units[0].x = 64;
    state.units[1].x = 64;
    state.units[0].y = 48;
    state.units[1].y = 48;
    const statuses = computeActorStatusLayout(layout, state.units);
    assert.equal(overlaps(statuses.player, statuses.loomkeeper), false);
    for (const status of [statuses.player, statuses.loomkeeper]) {
        assert.equal(status.x >= layout.battlefield.x, true);
        assert.equal(status.y >= layout.battlefield.y, true);
        assert.equal(status.x + status.width <= layout.battlefield.x + layout.battlefield.width, true);
        assert.equal(status.y + status.height <= layout.battlefield.y + layout.battlefield.height, true);
    }
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

test('Loomseed presentation anchor smoothly offsets a trace while preserving its authoritative impact', () => {
    const layout = computeCombatLayout(844, 390, { top: 0, right: 0, bottom: 0, left: 0 });
    const root = { x: 220, y: 310, facing: 1 as const };
    const trace = [{ x: 24, y: 42 }, { x: 55, y: 30 }, { x: 88, y: 48 }];
    const anchor = loomseedScreenPoint(root, layout, 'animation-sheet');
    const displayed = traceFromLoomseedOrigin(trace, root, layout, 'animation-sheet');

    assert.equal(anchor.x, root.x + 30 * Math.max(0.1, layout.worldScale * 0.56));
    assert.equal(anchor.y, root.y - 106 * Math.max(0.1, layout.worldScale * 0.56));
    assert.equal(displayed[0].x * layout.worldScale + layout.battlefield.x, anchor.x);
    assert.equal(displayed[0].y * layout.worldScale + layout.battlefield.y, anchor.y);
    assert.equal(displayed[1].x, trace[1].x + (displayed[0].x - trace[0].x) * 0.25);
    assert.equal(displayed[1].y, trace[1].y + (displayed[0].y - trace[0].y) * 0.25);
    assert.deepEqual(displayed.at(-1), trace.at(-1));
    assert.deepEqual(trace, [{ x: 24, y: 42 }, { x: 55, y: 30 }, { x: 88, y: 48 }]);
});

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x &&
        a.y < b.y + b.height && a.y + a.height > b.y;
}
