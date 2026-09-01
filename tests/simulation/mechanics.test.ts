import assert from 'node:assert/strict';
import test from 'node:test';

import {
    advanceSimulationTicks,
    applySimulationCommand,
    assertSimulationInvariants,
    canonicalSimulationJson,
    createSimulation,
    createLatestSimulation,
    evaluateV7OpeningPair,
    generateV7TacticalArena,
    selectV7OpeningPair,
    SIM_RULES,
    terrainSolid,
    V7_OPENING_RULES,
    V7_RULESET_ID,
    V7_TERRAIN_PROFILE_IDS,
    V5_RULESET_ID,
    V6_RULESET_ID
} from '../../shared/simulation';

const V7_EVIDENCE_SEEDS = [
    1,
    0xC0FFEE11,
    0xDEADBEEF,
    3,
    2
] as const;

test('V7 is deterministic, separately versioned, and terrain-derived', () => {
    const first = createLatestSimulation(0xC0FFEE11, 'wizard');
    const second = createLatestSimulation(0xC0FFEE11, 'wizard');
    assert.equal(first.rulesetId, V7_RULESET_ID);
    assert.equal(first.formatVersion, 7);
    assert.deepEqual(
        { width: first.terrain.width, height: first.terrain.height, cellSize: first.terrain.cellSize, words: first.terrain.words.length },
        { width: 256, height: 72, cellSize: 8, words: 576 }
    );
    assert.equal(first.units[1].x - first.units[0].x, V7_OPENING_RULES.separation);
    assert.equal(canonicalSimulationJson(first), canonicalSimulationJson(second));

    const aimed = applySimulationCommand(first, 'player', {
        type: 'aim', angleMilliDegrees: 45_000, powerPermille: 700
    }, first.turn);
    const turned = applySimulationCommand(
        aimed.state,
        'player',
        { type: 'move', direction: 0 },
        aimed.state.turn
    );
    assert.equal(turned.accepted, true);
    assert.equal(turned.state.units[0].facing, -1);
    assert.equal(turned.state.units[0].x, first.units[0].x);
    assert.equal(turned.state.movementRemaining, first.movementRemaining);
    assert.equal(turned.state.aim, null);

    const openingPairs = new Set(V7_EVIDENCE_SEEDS.map((seed) =>
        createSimulation(seed, 'wizard', V7_RULESET_ID).units.map((unit) => unit.x).join(':')
    ));
    assert.equal(openingPairs.size > 1, true, 'seed-derived openings must not collapse to one fixed pair');

    const historical = createSimulation(0xC0FFEE11, 'wizard', 'nimble-knots-artillery-v3');
    assert.deepEqual(
        { width: historical.terrain.width, height: historical.terrain.height, cellSize: historical.terrain.cellSize, words: historical.terrain.words.length },
        { width: 128, height: 72, cellSize: 8, words: 288 }
    );
    assert.deepEqual(historical.units.map((unit) => unit.x), [192, 832]);
});

test('V7 surface profiles are varied, surface-only, solid-below, and bounded', () => {
    const profiles = new Set<string>();
    const terrains = new Set<string>();
    for (const seed of V7_EVIDENCE_SEEDS) {
        const first = generateV7TacticalArena(seed);
        const second = generateV7TacticalArena(seed);
        assert.deepEqual(second, first, `seed=0x${seed.toString(16)}`);
        profiles.add(first.profileId);
        terrains.add(first.terrain.words.join(','));
        assert.equal(first.evaluatedPairs <= first.terrain.width, true);
        assert.equal(first.eligiblePairs > 0, true);

        const surfaceRows = new Set<number>();
        for (let x = 0; x < first.terrain.width; x += 1) {
            let foundSurface = false;
            for (let y = 0; y < first.terrain.height; y += 1) {
                const solid = terrainSolid(first.terrain, x, y);
                if (solid && !foundSurface) surfaceRows.add(y);
                if (solid) foundSurface = true;
                if (foundSurface) assert.equal(solid, true, `seed=${seed} column=${x} row=${y}`);
            }
            assert.equal(foundSurface, true, `seed=${seed} column=${x}`);
        }
        assert.equal(surfaceRows.size >= 4, true, `seed=${seed} visible relief`);
    }
    assert.deepEqual([...profiles].sort(), [...V7_TERRAIN_PROFILE_IDS].sort());
    assert.equal(terrains.size >= V7_TERRAIN_PROFILE_IDS.length, true);
});

test('V7 opening pairs satisfy support, margins, local movement, route, height, and score parity', () => {
    for (const seed of V7_EVIDENCE_SEEDS) {
        const arena = generateV7TacticalArena(seed);
        const pair = arena.opening;
        const reversed = evaluateV7OpeningPair(
            arena.terrain,
            seed,
            pair.rightX,
            pair.leftX
        );
        assert.deepEqual(reversed, pair, `role-swap score seed=0x${seed.toString(16)}`);
        assert.equal(pair.rightX - pair.leftX, V7_OPENING_RULES.separation);
        assert.equal(Math.abs(pair.rightSurfaceY - pair.leftSurfaceY) <= V7_OPENING_RULES.maximumHeightDifference, true);
        assert.equal(pair.leftX >= V7_OPENING_RULES.safeWorldMargin, true);
        assert.equal(pair.rightX <= 2048 - V7_OPENING_RULES.safeWorldMargin, true);

        const state = createSimulation(seed, 'wizard', V7_RULESET_ID);
        for (const [index, actor] of ['player', 'loomkeeper'].entries()) {
            assertBodyClearSupport(state, index);
            const source = structuredClone(state);
            source.activeActor = actor as 'player' | 'loomkeeper';
            for (const direction of [-1, 1] as const) {
                const moved = applySimulationCommand(
                    source,
                    actor as 'player' | 'loomkeeper',
                    { type: 'move', direction },
                    source.turn
                );
                assert.equal(moved.accepted, true, `seed=${seed} actor=${actor} direction=${direction}`);
                assert.equal(
                    moved.state.units[index].x,
                    source.units[index].x + direction * SIM_RULES.movementStep
                );
            }
        }

        let previousY = surfaceAt(arena.terrain, pair.leftX);
        for (let x = pair.leftX + SIM_RULES.movementStep; x <= pair.rightX; x += SIM_RULES.movementStep) {
            const nextY = surfaceAt(arena.terrain, x);
            assert.equal(Math.abs(nextY - previousY) <= SIM_RULES.maximumClimb, true,
                `seed=${seed} route x=${x}`);
            previousY = nextY;
        }

        const ranked = [];
        const firstX = Math.ceil(V7_OPENING_RULES.safeWorldMargin / arena.terrain.cellSize) *
            arena.terrain.cellSize;
        const lastX = 2048 - V7_OPENING_RULES.safeWorldMargin - V7_OPENING_RULES.separation;
        for (let leftX = firstX; leftX <= lastX; leftX += arena.terrain.cellSize) {
            try {
                ranked.push(evaluateV7OpeningPair(
                    arena.terrain,
                    seed,
                    leftX,
                    leftX + V7_OPENING_RULES.separation
                ));
            } catch {
                // Invalid geometry is deliberately excluded before scoring.
            }
        }
        ranked.sort(compareOpeningRank);
        assert.deepEqual(ranked[0], pair, `score priority seed=0x${seed.toString(16)}`);
    }
});

test('V7 opening selection fails closed when no supported pair exists', () => {
    const arena = generateV7TacticalArena(1);
    const empty = { ...arena.terrain, words: arena.terrain.words.map(() => 0) };
    assert.throws(
        () => selectV7OpeningPair(empty, 1),
        /no valid opening pair/i
    );
});

function assertBodyClearSupport(
    state: ReturnType<typeof createSimulation>,
    unitIndex: number
): void {
    const unit = state.units[unitIndex];
    const terrain = state.terrain;
    const supportY = unit.y + SIM_RULES.actorRadius;
    assert.equal(
        terrainSolid(
            terrain,
            Math.trunc(unit.x / terrain.cellSize),
            Math.trunc(supportY / terrain.cellSize)
        ),
        true
    );
    const leftColumn = Math.trunc((unit.x - SIM_RULES.actorRadius) / terrain.cellSize);
    const rightColumn = Math.trunc((unit.x + SIM_RULES.actorRadius - 1) / terrain.cellSize);
    const topRow = Math.trunc((unit.y - SIM_RULES.actorRadius) / terrain.cellSize);
    const bottomRow = Math.trunc((supportY - 1) / terrain.cellSize);
    for (let x = leftColumn; x <= rightColumn; x += 1) {
        for (let y = topRow; y <= bottomRow; y += 1) {
            assert.equal(terrainSolid(terrain, x, y), false, `body cell ${x},${y}`);
        }
    }
}

function compareOpeningRank(
    first: ReturnType<typeof evaluateV7OpeningPair>,
    second: ReturnType<typeof evaluateV7OpeningPair>
): number {
    return first.score.heightBias - second.score.heightBias ||
        second.score.combinedLocalMobility - first.score.combinedLocalMobility ||
        first.score.centerBias - second.score.centerBias ||
        first.score.tieBreak - second.score.tieBreak ||
        first.leftX - second.leftX;
}

function surfaceAt(terrain: ReturnType<typeof generateV7TacticalArena>['terrain'], worldX: number): number {
    const column = Math.trunc(worldX / terrain.cellSize);
    for (let y = 0; y < terrain.height; y += 1) {
        if (terrainSolid(terrain, column, y)) return y * terrain.cellSize;
    }
    throw new Error(`No surface at ${worldX}.`);
}

test('V6 turns in place for free before opposite movement and clears locked aim', () => {
    let state = createSimulation(0xC0FFEE11, 'wizard', V6_RULESET_ID);
    state = applySimulationCommand(state, 'player', {
        type: 'aim', angleMilliDegrees: 45_000, powerPermille: 700
    }, 0).state;
    const beforeX = state.units[0].x;
    const beforeY = state.units[0].y;
    const beforeBudget = state.movementRemaining;

    const turned = applySimulationCommand(state, 'player', { type: 'move', direction: 0 }, 0);
    assert.equal(turned.accepted, true);
    assert.equal(turned.state.units[0].facing, -1);
    assert.equal(turned.state.units[0].x, beforeX);
    assert.equal(turned.state.units[0].y, beforeY);
    assert.equal(turned.state.movementRemaining, beforeBudget);
    assert.equal(turned.state.aim, null);
    assert.deepEqual(turned.events, [{ type: 'turned', actor: 'player', facing: -1 }]);

    const reaimed = applySimulationCommand(turned.state, 'player', {
        type: 'aim', angleMilliDegrees: 30_000, powerPermille: 500
    }, 0);
    const moved = applySimulationCommand(
        reaimed.state,
        'player',
        { type: 'move', direction: -1 },
        0
    );
    assert.equal(moved.accepted, true);
    assert.equal(moved.state.units[0].x, beforeX - SIM_RULES.movementStep);
    assert.equal(moved.state.movementRemaining, beforeBudget - SIM_RULES.movementStep);
    assert.equal(moved.state.units[0].facing, -1);
    assert.equal(moved.state.aim, null);

    const exhausted = createSimulation(1, 'wizard', V6_RULESET_ID);
    exhausted.movementRemaining = 0;
    const exhaustedTurn = applySimulationCommand(
        exhausted,
        'player',
        { type: 'move', direction: 0 },
        0
    );
    assert.equal(exhaustedTurn.accepted, true);
    assert.equal(exhaustedTurn.state.units[0].facing, -1);
    assert.equal(exhaustedTurn.state.movementRemaining, 0);

    const historicalV5 = createSimulation(0xC0FFEE11, 'wizard', V5_RULESET_ID);
    const historicalNeutral = applySimulationCommand(
        historicalV5,
        'player',
        { type: 'move', direction: 0 },
        0
    );
    assert.equal(historicalNeutral.state.units[0].facing, 1);
    assert.equal(historicalNeutral.state.units[0].x, historicalV5.units[0].x);
    assert.deepEqual(historicalNeutral.events, [{
        type: 'moved',
        actor: 'player',
        x: historicalV5.units[0].x,
        y: historicalNeutral.state.units[0].y
    }]);
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
