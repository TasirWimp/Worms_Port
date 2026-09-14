import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { deformTerrain, setTerrainSolid, terrainSolid } from '../../shared/simulation';
import {
    compileV10R7Battlefield, parseV10R7Terrain, serializeV10R7Terrain,
    V10_R7_BATTLEFIELD_ASCII, V10_R7_BATTLEFIELD_RECIPE_REVISION
} from '../../shared/terrain-battlefield-v10-r7';
import {
    CURRENT_V10_RULESET_ID,
    SimulationStateV10Schema,
    V10_R6_DYNAMICS,
    V10_R6_RULESET_ID,
    V10_R7_RULESET_ID,
    advanceSimulationTicksV10,
    applySimulationIntentV10,
    createSimulationV10,
    hashSimulationStateV10,
    hashTerrainV10R7,
    reconcileTerrainMetadataV10,
    serializeV10R7BattlefieldState,
    mechanicsForV10
} from '../../shared/simulation-v10';

const R6_ACTOR_HEIGHT = 68;

test('R7 Waypoint 3 promotes the full explicit battlefield to the live V10 identity', () => {
    assert.equal(CURRENT_V10_RULESET_ID, V10_R7_RULESET_ID);
    const r6 = createSimulationV10(4, 'wizard', V10_R6_RULESET_ID);
    const r7 = createSimulationV10(4, 'wizard', V10_R7_RULESET_ID);

    assert.equal(r7.terrainProfileId, 'volcanic-ruin');
    assert.equal(r7.terrainRecipeRevision, V10_R7_BATTLEFIELD_RECIPE_REVISION);
    assert.notEqual(r7.terrainRecipeRevision, r6.terrainRecipeRevision);
    assert.equal(r7.terrainCandidateIndex, r6.terrainCandidateIndex);
    assert.notDeepEqual(r7.terrain, r6.terrain);
    assert.deepEqual(r7.units.map(unit => [unit.xFp / 256, unit.yFp / 256]), [[624, 292], [1424, 308]]);
    assert.equal(r7.phaseDeadlineTick, V10_R6_DYNAMICS.actionTicks);
    assert.equal(r7.units[0].thread, 5);
    assert.equal(r7.terrainRevision, 0);
    assert.equal(r7.terrainHash, hashTerrainV10R7(r7.terrain));
    assert.equal(Object.hasOwn(r6, 'terrainRevision'), false);
    assert.equal(Object.hasOwn(r6, 'terrainHash'), false);
    assert.equal(SimulationStateV10Schema.safeParse(r7).success, true);
    assert.equal(SimulationStateV10Schema.safeParse({ ...r7, terrainRevision: undefined }).success, false);
    assert.equal(SimulationStateV10Schema.safeParse({ ...r7, terrainHash: undefined }).success, false);
    assert.equal(SimulationStateV10Schema.safeParse({ ...r6,
        terrainRevision: 0, terrainHash: r7.terrainHash }).success, false);

    const neutralJump = applySimulationIntentV10(
        r7, 'player', { type: 'jump', direction: 0 }, r7.turn, r7.phase, r7.inputEpoch
    );
    assert.equal(neutralJump.accepted, true, JSON.stringify(neutralJump.error));
    assert.equal(neutralJump.state.units[0].vxFp, 0);
});

test('the 64 by 36 compiler uses the complete world, closed legend and exact anchor envelopes', () => {
    const compiled = compileV10R7Battlefield();
    assert.deepEqual(
        [compiled.terrain.width, compiled.terrain.height, compiled.terrain.cellSize],
        [256, 72, 8]
    );
    assert.deepEqual(compiled.opening,
        { leftX: 624, rightX: 1424, leftSurfaceY: 304, rightSurfaceY: 320 });
    assert.equal(V10_R7_BATTLEFIELD_ASCII.split('\n').length, 36);
    assert.ok(V10_R7_BATTLEFIELD_ASCII.split('\n').every(line => line.length === 64));
    assert.equal([...V10_R7_BATTLEFIELD_ASCII].filter(character => character === 'P').length, 1);
    assert.equal([...V10_R7_BATTLEFIELD_ASCII].filter(character => character === 'L').length, 1);
    for (const annotation of ['=', '|', '+']) assert.ok(V10_R7_BATTLEFIELD_ASCII.includes(annotation));

    // Both world edges contain an elevated play structure, while every column
    // owns the explicit nine-row destructible foundation.
    assert.equal(terrainSolid(compiled.terrain, 0, 34), true);
    assert.equal(terrainSolid(compiled.terrain, 255, 32), true);
    for (let column = 0; column < 256; column += 1) {
        for (let row = 54; row < 72; row += 1) assert.equal(terrainSolid(compiled.terrain, column, row), true);
    }

    const lines = V10_R7_BATTLEFIELD_ASCII.split('\n');
    for (const alias of ['=', '|', '+']) {
        const variant = replaceCell(lines, 27, 0, alias);
        assert.deepEqual(compileV10R7Battlefield(variant).terrain.words, compiled.terrain.words);
    }
    const explicitAir = compileV10R7Battlefield(replaceCell(lines, 27, 0, '.')).terrain;
    for (let row = 54; row < 56; row += 1) {
        for (let column = 0; column < 4; column += 1) assert.equal(terrainSolid(explicitAir, column, row), false);
    }
    assert.equal(terrainSolid(explicitAir, 0, 56), true, 'air is not filled implicitly to the world bottom');
});

test('the R7 compiler rejects malformed dimensions, characters, anchors, occupancy and support', () => {
    const lines = V10_R7_BATTLEFIELD_ASCII.split('\n');
    assert.throws(() => compileV10R7Battlefield(`${V10_R7_BATTLEFIELD_ASCII}.`), /exactly 64 by 36/);
    assert.throws(() => compileV10R7Battlefield(V10_R7_BATTLEFIELD_ASCII.replace('\n', '\r\n')), /LF separators/);
    assert.throws(() => compileV10R7Battlefield(replaceCell(lines, 0, 0, '?')), /unknown character/);
    assert.throws(() => compileV10R7Battlefield(replaceCell(lines, 18, 19, '.')), /exactly one P/);
    assert.throws(() => compileV10R7Battlefield(replaceCell(lines, 0, 0, 'L')), /exactly one L/);
    assert.throws(() => compileV10R7Battlefield(replaceCell(lines, 18, 18, '#')), /actor envelopes/);
    assert.throws(() => compileV10R7Battlefield(replaceCell(lines, 19, 19, '.')), /has no support/);
});

test('live R7 ASCII round-trips exact terrain and overlays exact structured actor state', () => {
    const state = createSimulationV10(4, 'wizard', V10_R7_RULESET_ID);
    const terrainAscii = serializeV10R7Terrain(state.terrain);
    assert.equal(terrainAscii.endsWith('\n'), false);
    assert.equal(terrainAscii.split('\n').length, 72);
    assert.ok(terrainAscii.split('\n').every(line => line.length === 256 && /^[.#]+$/.test(line)));
    assert.deepEqual(parseV10R7Terrain(terrainAscii), state.terrain);
    assert.equal(state.terrainHash, createHash('sha256').update(terrainAscii).digest('hex'));

    const live = serializeV10R7BattlefieldState(state);
    assert.equal(live.terrainRevision, 0);
    assert.equal(live.terrainHash, state.terrainHash);
    assert.equal(live.stateHash, hashSimulationStateV10(state));
    assert.deepEqual(live.units.map(unit => [unit.id, unit.xFp, unit.yFp, unit.grounded, unit.stitching]), [
        ['player', 624 * 256, 292 * 256, true, 100],
        ['loomkeeper', 1424 * 256, 308 * 256, true, 100]
    ]);
    const rows = live.terrainAscii.split('\n');
    assert.equal(rows[Math.floor(292 / 8)][Math.floor(624 / 8)], 'P');
    assert.equal(rows[Math.floor(308 / 8)][Math.floor(1424 / 8)], 'L');
    assert.equal([...live.terrainAscii].filter(character => character === 'P').length, 1);
    assert.equal([...live.terrainAscii].filter(character => character === 'L').length, 1);
});

test('R7 terrain revision advances only when the transition reconciler sees cleared solid bits', () => {
    const initial = createSimulationV10(4, 'wizard', V10_R7_RULESET_ID);
    const aimed = applySimulationIntentV10(initial, 'player',
        { type: 'aim', angleMilliDegrees: 0, powerPermille: 700 },
        initial.turn, initial.phase, initial.inputEpoch);
    assert.equal(aimed.accepted, true);
    assert.equal(aimed.state.terrainRevision, 0);
    assert.equal(aimed.state.terrainHash, initial.terrainHash);

    assert.deepEqual(reconcileTerrainMetadataV10(initial, structuredClone(initial.terrain)), {
        terrainRevision: 0,
        terrainHash: initial.terrainHash
    });
    const carved = structuredClone(initial.terrain);
    deformTerrain(carved, 1_056, 360, 64);
    const changed = reconcileTerrainMetadataV10(initial, carved);
    assert.equal(changed.terrainRevision, 1);
    assert.notEqual(changed.terrainHash, initial.terrainHash);
    assert.equal(changed.terrainHash, hashTerrainV10R7(carved));
    const changedState = { ...initial, terrain: carved, ...changed };
    assert.notEqual(hashSimulationStateV10(changedState), hashSimulationStateV10(initial));
});

test('the central plug is a Threadball breach while the foundation needs sustained damage', () => {
    const terrain = structuredClone(compileV10R7Battlefield().terrain);
    const plugCenterX = 1_056;
    const plugCenterY = 360;
    assert.equal(terrainSolid(terrain, Math.floor(plugCenterX / 8), Math.floor(plugCenterY / 8)), true);
    const before = terrain.words.reduce((count, word) => count + popcount(word), 0);
    deformTerrain(terrain, plugCenterX, plugCenterY,
        mechanicsForV10(V10_R7_RULESET_ID)!.relics.threadball.craterRadius);
    const after = terrain.words.reduce((count, word) => count + popcount(word), 0);
    assert.ok(before - after > 100, 'Threadball removes a useful route-sized plug area');
    for (let x = plugCenterX - 12; x <= plugCenterX + 12; x += 8) {
        assert.equal(terrainSolid(terrain, Math.floor(x / 8), Math.floor(plugCenterY / 8)), false);
    }
    assert.equal(terrainSolid(terrain, Math.floor(plugCenterX / 8), 71), true,
        'one route breach does not create an accidental bottom loss');
});

test('R7 scopes its changes to crater scale and phone-legible Needlepoint recoil', () => {
    const r6 = mechanicsForV10(V10_R6_RULESET_ID)!;
    const r7 = mechanicsForV10(V10_R7_RULESET_ID)!;

    assert.equal(r7.relics.threadball.craterRadius, 64);
    assert.equal(r7.relics.needlepoint.craterRadius, 8);
    assert.equal(r7.relics.spoolburst.craterRadius, 112);
    assert.ok(Math.abs(r7.relics.threadball.craterRadius * 2 / R6_ACTOR_HEIGHT - 1.88) < 0.01);
    assert.ok(Math.abs(
        r7.relics.threadball.craterRadius ** 2 / r7.relics.spoolburst.craterRadius ** 2 - 1 / 3
    ) < 0.01);
    assert.deepEqual(r7.directHitbox, r6.directHitbox);
    assert.deepEqual(r7.blastImpulse, {
        ...r6.blastImpulse,
        needlepoint: { minimumSpeedFp: 384, maximumSpeedFp: 1_024, upwardBiasFp: 768 }
    });
    assert.equal(r7.terrainFirst, r6.terrainFirst);
    assert.equal(r7.shieldBlast, r6.shieldBlast);

    for (const relic of ['threadball', 'needlepoint', 'spoolburst'] as const) {
        const { craterRadius: _r6Crater, ...r6Unchanged } = r6.relics[relic];
        const { craterRadius: _r7Crater, ...r7Unchanged } = r7.relics[relic];
        assert.deepEqual(r7Unchanged, r6Unchanged, `${relic} combat values remain frozen`);
    }
    assert.deepEqual(
        [r6.relics.threadball.craterRadius, r6.relics.needlepoint.craterRadius, r6.relics.spoolburst.craterRadius],
        [40, 8, 80],
        'the live R6 table remains unchanged'
    );
});

test('R7 Needlepoint direct hits visibly launch a surviving actor while R6 stays frozen', () => {
    let state = createSimulationV10(4, 'wizard', V10_R7_RULESET_ID);
    const target = state.units[1];
    const targetX = Math.floor(target.xFp / 256);
    const targetY = Math.floor(target.yFp / 256);
    const launchedFromX = target.xFp;
    state.selectedRelic = 'needlepoint';
    state.castUsed = true;
    state.phase = 'projectile';
    state.phaseStartedTick = state.tick;
    state.phaseDeadlineTick = state.tick + V10_R6_DYNAMICS.projectileTicks;
    state.projectile = {
        actor: 'player', relicId: 'needlepoint', xFp: targetX * 256, yFp: targetY * 256,
        vxFp: 256, vyFp: -80, flightTicks: 0, startX: targetX - 1, startY: targetY,
        trace: [{ x: targetX - 1, y: targetY }]
    };

    state = advanceSimulationTicksV10(state, 1).state;
    assert.equal(state.lastProjectile?.impact, 'loomkeeper');
    assert.equal(state.units[1].stitching, 40);
    assert.deepEqual(
        [state.units[1].vxFp, state.units[1].vyFp, state.units[1].airDrive],
        [1_024, -768, 'blast']
    );

    state = advanceSimulationTicksV10(state, 4).state;
    assert.ok(state.units[1].xFp > launchedFromX);
    assert.equal(state.units[1].airDrive, 'blast');
    assert.deepEqual(mechanicsForV10(V10_R6_RULESET_ID)!.blastImpulse?.needlepoint,
        { minimumSpeedFp: 256, maximumSpeedFp: 768, upwardBiasFp: 512 });
});

test('R7 crater radii clear deterministic circular spans in the packed terrain mask', () => {
    const mechanics = mechanicsForV10(V10_R7_RULESET_ID)!;
    const centerX = 1_024;
    const centerY = 320;

    for (const [relic, expectedSurfaceCells] of [
        ['threadball', 16],
        ['needlepoint', 2],
        ['spoolburst', 28]
    ] as const) {
        const terrain = structuredClone(createSimulationV10(4, 'wizard', V10_R7_RULESET_ID).terrain);
        for (let y = 0; y < terrain.height; y += 1) {
            for (let x = 0; x < terrain.width; x += 1) setTerrainSolid(terrain, x, y, true);
        }
        deformTerrain(terrain, centerX, centerY, mechanics.relics[relic].craterRadius);
        const row = Math.floor(centerY / terrain.cellSize);
        const cleared = Array.from({ length: terrain.width }, (_, x) => x)
            .filter(x => !terrainSolid(terrain, x, row));
        assert.equal(cleared.length, expectedSurfaceCells, `${relic} surface span`);
        assert.equal(cleared[0] + cleared.at(-1)!, terrain.width - 1, `${relic} crater symmetry`);
        assert.equal(terrainSolid(terrain, cleared[0] - 1, row), true);
        assert.equal(terrainSolid(terrain, cleared.at(-1)! + 1, row), true);
    }
});

test('the thinnest volcanic shelf needs two Spoolbursts to open the world bottom', () => {
    const terrain = structuredClone(createSimulationV10(4, 'wizard', V10_R7_RULESET_ID).terrain);
    const mechanics = mechanicsForV10(V10_R7_RULESET_ID)!;
    const surfaceRow = (column: number): number => {
        for (let row = 0; row < terrain.height; row += 1) {
            if (terrainSolid(terrain, column, row)) return row;
        }
        return terrain.height;
    };
    const initialSurfaces = Array.from({ length: terrain.width }, (_, column) => surfaceRow(column));
    const deepestSurface = Math.max(...initialSurfaces);
    const column = initialSurfaces.indexOf(deepestSurface);
    const bottomRow = terrain.height - 1;

    assert.equal(deepestSurface, 54);
    assert.equal((terrain.height - deepestSurface) * terrain.cellSize, 144);

    const centerX = column * terrain.cellSize + terrain.cellSize / 2;
    const deepestFirstImpactY = (deepestSurface + 1) * terrain.cellSize - 1;
    deformTerrain(terrain, centerX, deepestFirstImpactY, mechanics.relics.spoolburst.craterRadius);
    assert.equal(terrainSolid(terrain, column, bottomRow), true, 'one hit preserves the floor');

    const secondSurface = surfaceRow(column);
    assert.ok(secondSurface > deepestSurface && secondSurface < terrain.height);
    deformTerrain(terrain, centerX, secondSurface * terrain.cellSize, mechanics.relics.spoolburst.craterRadius);
    assert.equal(terrainSolid(terrain, column, bottomRow), false, 'the second hit opens the floor');
});

test('an R7 unit falling through a floorless crater exits below the world and loses', () => {
    let state = createSimulationV10(4, 'wizard', V10_R7_RULESET_ID);
    const playerX = Math.floor(state.units[0].xFp / 256);
    const firstCell = Math.floor((playerX - 12) / state.terrain.cellSize);
    const lastCell = Math.ceil((playerX + 12) / state.terrain.cellSize) - 1;
    for (let y = 0; y < state.terrain.height; y += 1) {
        for (let x = firstCell; x <= lastCell; x += 1) setTerrainSolid(state.terrain, x, y, false);
    }
    state.terrainRevision! += 1;
    state.terrainHash = hashTerrainV10R7(state.terrain);
    state.units[0].grounded = false;
    state.units[0].support = null;
    state.units[0].vxFp = 0;
    state.units[0].vyFp = 0;
    state.units[0].airTicks = 0;
    state.units[0].airDrive = 'walk_fall';

    for (let tick = 0; tick < 120 && state.phase !== 'finished'; tick += 1) {
        state = advanceSimulationTicksV10(state, 1).state;
    }
    assert.equal(state.phase, 'finished');
    assert.equal(state.units[0].alive, false);
    assert.equal(state.units[0].stitching, 0);
    assert.ok(state.units[0].yFp / 256 - 12 >= 576);
    assert.equal(state.winner, 'loomkeeper');
    assert.equal(state.finishReason, 'unravelled');
});

test('both R7 units leaving through explicit bottom openings resolve as a draw', () => {
    let state = createSimulationV10(4, 'wizard', V10_R7_RULESET_ID);
    for (const unit of state.units) {
        const x = Math.floor(unit.xFp / 256);
        const firstCell = Math.floor((x - 12) / state.terrain.cellSize);
        const lastCell = Math.ceil((x + 12) / state.terrain.cellSize) - 1;
        for (let row = 0; row < state.terrain.height; row += 1) {
            for (let column = firstCell; column <= lastCell; column += 1) {
                setTerrainSolid(state.terrain, column, row, false);
            }
        }
        unit.grounded = false;
        unit.support = null;
        unit.vxFp = 0;
        unit.vyFp = 0;
        unit.airTicks = 0;
        unit.airDrive = 'walk_fall';
    }
    state.terrainRevision! += 1;
    state.terrainHash = hashTerrainV10R7(state.terrain);
    for (let tick = 0; tick < 120 && state.phase !== 'finished'; tick += 1) {
        state = advanceSimulationTicksV10(state, 1).state;
    }
    assert.equal(state.phase, 'finished');
    assert.equal(state.winner, 'draw');
    assert.ok(state.units.every(unit => !unit.alive && unit.stitching === 0));
});

function replaceCell(lines: readonly string[], row: number, column: number, value: string): string {
    return lines.map((line, index) => index === row
        ? `${line.slice(0, column)}${value}${line.slice(column + 1)}`
        : line).join('\n');
}

function popcount(value: number): number {
    let remaining = value >>> 0;
    let count = 0;
    while (remaining) {
        remaining &= remaining - 1;
        count += 1;
    }
    return count;
}
