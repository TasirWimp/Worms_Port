import assert from 'node:assert/strict';
import test from 'node:test';

import {
    advanceSimulationTicks,
    applySimulationCommand,
    assertSimulationInvariants,
    canonicalSimulationJson,
    createSimulation,
    createLatestSimulation,
    SIM_RULES
} from '../../shared/simulation';

test('V5 retains the V4 arena expansion and remains deterministic', () => {
    const first = createLatestSimulation(0xC0FFEE11, 'wizard');
    const second = createLatestSimulation(0xC0FFEE11, 'wizard');
    assert.equal(first.rulesetId, 'nimble-knots-artillery-v5');
    assert.equal(first.formatVersion, 5);
    assert.deepEqual(
        { width: first.terrain.width, height: first.terrain.height, cellSize: first.terrain.cellSize, words: first.terrain.words.length },
        { width: 256, height: 72, cellSize: 8, words: 576 }
    );
    assert.deepEqual(first.units.map((unit) => unit.x), [512, 1152]);
    assert.equal(canonicalSimulationJson(first), canonicalSimulationJson(second));

    const historical = createSimulation(0xC0FFEE11, 'wizard', 'nimble-knots-artillery-v3');
    assert.deepEqual(
        { width: historical.terrain.width, height: historical.terrain.height, cellSize: historical.terrain.cellSize, words: historical.terrain.words.length },
        { width: 128, height: 72, cellSize: 8, words: 288 }
    );
    assert.deepEqual(historical.units.map((unit) => unit.x), [192, 832]);
});

test('move, aim, and fire form an authoritative fixed-turn transition', () => {
    const initial = createSimulation(0xC0FFEE11, 'wizard');
    const moved = applySimulationCommand(initial, 'player', { type: 'move', direction: 1 }, 0);
    assert.equal(moved.accepted, true);
    assert.equal(moved.state.units[0].x, initial.units[0].x + SIM_RULES.movementStep);
    assert.equal(moved.state.movementRemaining, SIM_RULES.movementPerTurn - SIM_RULES.movementStep);

    const aimed = applySimulationCommand(moved.state, 'player', {
        type: 'aim', angleMilliDegrees: 45_000, powerPermille: 1_000
    }, 0);
    assert.deepEqual(aimed.state.aim, { angleMilliDegrees: 45_000, powerPermille: 1_000 });

    const fired = applySimulationCommand(aimed.state, 'player', { type: 'fire' }, 0);
    assert.equal(fired.accepted, true);
    assert.equal(fired.state.turn, 1);
    assert.equal(fired.state.activeActor, 'loomkeeper');
    assert.equal(fired.state.aim, null);
    assert.equal(Boolean(fired.state.lastProjectile), true);
    assert.equal(fired.state.lastProjectile!.flightTicks <= SIM_RULES.projectileTicks, true);
    assert.equal(fired.events.some((event) => event.type === 'projectile'), true);
    assert.equal(fired.events.some((event) => event.type === 'turn_changed'), true);
    assertSimulationInvariants(fired.state);
});

test('swept collision applies deterministic damage and deformation exactly once', () => {
    let state = createSimulation(0xC0FFEE11, 'wizard');
    state = applySimulationCommand(state, 'player', {
        type: 'aim', angleMilliDegrees: 45_000, powerPermille: 1_000
    }, 0).state;
    const fired = applySimulationCommand(state, 'player', { type: 'fire' }, 0);
    assert.deepEqual(fired.state.lastProjectile, {
        startX: 208, startY: 328, endX: 814, endY: 304,
        flightTicks: 61, impact: 'terrain',
        trace: [
            { x: 208, y: 328 }, { x: 288, y: 259 }, { x: 368, y: 210 },
            { x: 448, y: 181 }, { x: 528, y: 173 }, { x: 608, y: 184 },
            { x: 688, y: 215 }, { x: 768, y: 266 }, { x: 814, y: 304 }
        ]
    });
    assert.equal(fired.state.units[1].stitching, 53);
    assert.deepEqual(
        fired.events.filter((event) => event.type === 'damaged'),
        [{ type: 'damaged', actor: 'loomkeeper', amount: 47, stitching: 53 }]
    );
    assert.equal(fired.state.revision, 2);
});

test('movement reverses facing and the next projectile starts on that side', () => {
    const initial = createSimulation(0xC0FFEE11, 'wizard');
    const moved = applySimulationCommand(initial, 'player', { type: 'move', direction: -1 }, 0);
    assert.equal(moved.accepted, true);
    assert.equal(moved.state.units[0].facing, -1);
    const aimed = applySimulationCommand(moved.state, 'player', {
        type: 'aim', angleMilliDegrees: 45_000, powerPermille: 500
    }, 0);
    const fired = applySimulationCommand(aimed.state, 'player', { type: 'fire' }, 0);
    assert.equal(
        fired.state.lastProjectile!.startX,
        moved.state.units[0].x - SIM_RULES.actorRadius - 4
    );
    assert.equal(fired.state.lastProjectile!.endX < fired.state.lastProjectile!.startX, true);
});

test('radial damage includes diagonals by squared Euclidean distance', () => {
    const state = createSimulation(0xC0FFEE11, 'wizard');
    // The frozen shot impacts terrain at (814, 304). A target at (+40,+40)
    // is 56 units away by deterministic integer sqrt, but 80 by Manhattan distance.
    state.units[1].x = 854;
    state.units[1].y = 344;
    const aimed = applySimulationCommand(state, 'player', {
        type: 'aim', angleMilliDegrees: 45_000, powerPermille: 1_000
    }, 0);
    const fired = applySimulationCommand(aimed.state, 'player', { type: 'fire' }, 0);
    assert.deepEqual(
        fired.events.filter((event) => event.type === 'damaged'),
        [{ type: 'damaged', actor: 'loomkeeper', amount: 8, stitching: 92 }]
    );
});

test('bounded projectile trace persists in state and remains detached from events and clones', () => {
    let state = createSimulation(0xC0FFEE11, 'wizard');
    state = applySimulationCommand(state, 'player', {
        type: 'aim', angleMilliDegrees: 45_000, powerPermille: 1_000
    }, 0).state;
    const fired = applySimulationCommand(state, 'player', { type: 'fire' }, 0);
    const event = fired.events.find((candidate) => candidate.type === 'projectile');
    assert.equal(event?.type, 'projectile');
    assert.deepEqual(fired.state.lastProjectile!.trace, event!.trace);
    assert.equal(fired.state.lastProjectile!.trace.length >= 2, true);
    assert.equal(fired.state.lastProjectile!.trace.length <= 41, true);

    const clone = structuredClone(fired.state);
    clone.lastProjectile!.trace[0].x += 1;
    assert.notEqual(clone.lastProjectile!.trace[0].x, fired.state.lastProjectile!.trace[0].x);
    event!.trace[0].x += 2;
    assert.notEqual(event!.trace[0].x, fired.state.lastProjectile!.trace[0].x);
});

test('zero-power and extreme-angle shots always terminate within the projectile budget', () => {
    for (const [angleMilliDegrees, powerPermille] of [
        [-90_000, 0], [0, 0], [90_000, 0], [-90_000, 1_000], [90_000, 1_000]
    ] as const) {
        let state = createSimulation(0x2468ACE0, 'thief');
        state = applySimulationCommand(state, 'player', {
            type: 'aim', angleMilliDegrees, powerPermille
        }, 0).state;
        const result = applySimulationCommand(state, 'player', { type: 'fire' }, 0);
        assert.equal(result.accepted, true, `aim=${angleMilliDegrees}/${powerPermille}`);
        assert.equal(result.state.lastProjectile!.flightTicks >= 1, true);
        assert.equal(result.state.lastProjectile!.flightTicks <= SIM_RULES.projectileTicks, true);
    }
});

test('wrong-actor, late-turn, malformed aim, and fire-without-aim are immutable rejections', () => {
    const state = createSimulation(0xDEADBEEF, 'warrior');
    const before = canonicalSimulationJson(state);
    const cases = [
        ['wrong actor', applySimulationCommand(state, 'loomkeeper', { type: 'move', direction: 1 }, 0)],
        ['late turn', applySimulationCommand(state, 'player', { type: 'move', direction: 1 }, 1)],
        ['fire without aim', applySimulationCommand(state, 'player', { type: 'fire' }, 0)],
        ['angle above maximum', applySimulationCommand(state, 'player', {
            type: 'aim', angleMilliDegrees: 90_001, powerPermille: 500
        }, 0)],
        ['power above maximum', applySimulationCommand(state, 'player', {
            type: 'aim', angleMilliDegrees: 0, powerPermille: 1_001
        }, 0)]
    ] as const;
    for (const [label, result] of cases) {
        assert.equal(result.accepted, false, label);
        assert.equal(result.mutated, false, label);
        assert.equal(canonicalSimulationJson(result.state), before, label);
        assert.deepEqual(result.events, [], label);
    }
});

test('tick advancement is chunk-equivalent at every timeout boundary', () => {
    const initial = createSimulation(0x6D2B79F5, 'wizard');
    const chunked = advanceSimulationTicks(initial, SIM_RULES.turnTicks * 3);
    let stepped = initial;
    for (let tick = 0; tick < SIM_RULES.turnTicks * 3; tick += 1) {
        stepped = advanceSimulationTicks(stepped, 1).state;
    }
    assert.deepEqual(chunked.state, stepped);
});

test('timeout changes on the exact tick and the turn limit is terminal', () => {
    const initial = createSimulation(1, 'wizard');
    const before = advanceSimulationTicks(initial, SIM_RULES.turnTicks - 1);
    assert.equal(before.state.turn, 0);
    assert.equal(before.state.tick, SIM_RULES.turnTicks - 1);
    const boundary = advanceSimulationTicks(before.state, 1);
    assert.equal(boundary.state.turn, 1);
    assert.equal(boundary.state.tick, SIM_RULES.turnTicks);
    assert.equal(boundary.events.at(-1)?.type, 'turn_changed');

    const terminal = advanceSimulationTicks(initial, SIM_RULES.turnTicks * SIM_RULES.maximumTurns);
    assert.equal(terminal.state.phase, 'finished');
    assert.equal(terminal.state.turn, SIM_RULES.maximumTurns);
    assert.equal(terminal.state.winner, 'draw');
    assert.equal(terminal.state.finishReason, 'turn_limit');
    assert.equal(terminal.state.tick, SIM_RULES.turnTicks * SIM_RULES.maximumTurns);

    const after = advanceSimulationTicks(terminal.state, 100);
    assert.equal(after.mutated, false);
    assert.deepEqual(after.state, terminal.state);
});

test('negative and non-integral tick counts are immutable rejections', () => {
    const state = createSimulation(1, 'wizard');
    for (const count of [-1, 0.5, Number.NaN]) {
        const result = advanceSimulationTicks(state, count);
        assert.equal(result.accepted, false);
        assert.equal(result.mutated, false);
        assert.deepEqual(result.state, state);
    }
});
