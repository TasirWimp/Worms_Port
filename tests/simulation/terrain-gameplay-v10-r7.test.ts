import assert from 'node:assert/strict';
import test from 'node:test';

import { deformTerrain, setTerrainSolid, terrainSolid } from '../../shared/simulation';
import {
    CURRENT_V10_RULESET_ID,
    SimulationStateV10Schema,
    V10_R6_DYNAMICS,
    V10_R6_RULESET_ID,
    V10_R7_RULESET_ID,
    advanceSimulationTicksV10,
    applySimulationIntentV10,
    createSimulationV10,
    mechanicsForV10
} from '../../shared/simulation-v10';

const R6_ACTOR_HEIGHT = 68;

test('R7 Waypoint 1 keeps live V10 on R6 and inherits the accepted volcanic action package', () => {
    assert.equal(CURRENT_V10_RULESET_ID, V10_R6_RULESET_ID);
    const r6 = createSimulationV10(4, 'wizard', V10_R6_RULESET_ID);
    const r7 = createSimulationV10(4, 'wizard', V10_R7_RULESET_ID);

    assert.equal(r7.terrainProfileId, 'volcanic-ruin');
    assert.equal(r7.terrainRecipeRevision, r6.terrainRecipeRevision);
    assert.equal(r7.terrainCandidateIndex, r6.terrainCandidateIndex);
    assert.deepEqual(r7.terrain, r6.terrain);
    assert.deepEqual(r7.units, r6.units);
    assert.equal(r7.phaseDeadlineTick, V10_R6_DYNAMICS.actionTicks);
    assert.equal(r7.units[0].thread, 5);
    assert.equal(SimulationStateV10Schema.safeParse(r7).success, true);

    const neutralJump = applySimulationIntentV10(
        r7, 'player', { type: 'jump', direction: 0 }, r7.turn, r7.phase, r7.inputEpoch
    );
    assert.equal(neutralJump.accepted, true, JSON.stringify(neutralJump.error));
    assert.equal(neutralJump.state.units[0].vxFp, 0);
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

    assert.equal(deepestSurface, 56);
    assert.equal((terrain.height - deepestSurface) * terrain.cellSize, 128);

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
