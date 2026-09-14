import assert from 'node:assert/strict';
import test from 'node:test';

import { deformTerrain, setTerrainSolid, terrainSolid } from '../../shared/simulation';
import {
    CURRENT_V10_RULESET_ID,
    SimulationStateV10Schema,
    V10_R6_DYNAMICS,
    V10_R6_RULESET_ID,
    V10_R7_RULESET_ID,
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

test('R7 changes only Threadball and Spoolburst crater scale from R6', () => {
    const r6 = mechanicsForV10(V10_R6_RULESET_ID)!;
    const r7 = mechanicsForV10(V10_R7_RULESET_ID)!;

    assert.equal(r7.relics.threadball.craterRadius, R6_ACTOR_HEIGHT * 2);
    assert.equal(r7.relics.needlepoint.craterRadius, 8);
    assert.equal(r7.relics.spoolburst.craterRadius, 240);
    assert.equal(r7.relics.spoolburst.craterRadius * 2 / R6_ACTOR_HEIGHT, 120 / 17);
    assert.deepEqual(r7.directHitbox, r6.directHitbox);
    assert.deepEqual(r7.blastImpulse, r6.blastImpulse);
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

test('R7 crater radii clear deterministic circular spans in the packed terrain mask', () => {
    const mechanics = mechanicsForV10(V10_R7_RULESET_ID)!;
    const centerX = 1_024;
    const centerY = 320;

    for (const [relic, expectedSurfaceCells] of [
        ['threadball', 34],
        ['needlepoint', 2],
        ['spoolburst', 60]
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
