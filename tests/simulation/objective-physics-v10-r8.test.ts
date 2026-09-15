import assert from 'node:assert/strict';
import test from 'node:test';

import { parseV10R7Terrain } from '../../shared/terrain-battlefield-v10-r7';
import { setTerrainSolid } from '../../shared/simulation';
import {
    advanceDetachedProjectileV10,
    applySimulationIntentV10,
    CURRENT_V10_RULESET_ID,
    hashTerrainV10R7,
    V10_R7_RULESET_ID
} from '../../shared/simulation-v10';
import {
    advanceObjectivePhysicsV10R8,
    advanceSimulationTicksV10R8,
    assertSimulationInvariantsV10R8,
    cloneSimulationV10R8,
    compileV10R8ObjectiveLayer,
    createSimulationV10R8,
    hashSimulationStateV10R8,
    serializeV10R8BattlefieldState,
    simulationV10R7ViewOfR8,
    trajectoryPreviewV10R8,
    V10_R8_COLLECT_OBJECTIVES_ASCII,
    V10_R8_DEFEND_OBJECTIVES_ASCII,
    V10_R8_OBJECTIVE_RECIPE_REVISION,
    V10_R8_RULESET_ID
} from '../../shared/simulation-v10-r8';

test('R8 compiles bounded coin and chest layers without changing current R7 terrain truth', () => {
    const collect = createSimulationV10R8(4, 'wizard', 'collect');
    const defend = createSimulationV10R8(4, 'wizard', 'defend');
    const claim = createSimulationV10R8(4, 'wizard', 'claim');

    assert.equal(CURRENT_V10_RULESET_ID, V10_R7_RULESET_ID);
    assert.equal(collect.rulesetId, V10_R8_RULESET_ID);
    assert.equal(collect.objective.recipeRevision, V10_R8_OBJECTIVE_RECIPE_REVISION);
    assert.deepEqual(collect.objective.objects.map(object => object.id),
        ['coin-1', 'coin-2', 'coin-3', 'coin-4', 'coin-5', 'coin-6', 'coin-7']);
    assert.ok(collect.objective.objects.every(object => object.kind === 'coin' && object.owner === null &&
        object.status === 'active' && object.grounded && object.support !== null));
    assert.deepEqual(defend.objective.objects.map(object => [object.id, object.kind, object.owner]),
        [['player-chest', 'chest', 'player']]);
    assert.deepEqual(claim.objective.objects.map(object => [object.id, object.kind, object.owner]),
        [['loomkeeper-chest', 'chest', 'loomkeeper']]);
    assert.deepEqual(collect.terrain, defend.terrain);
    assert.deepEqual(defend.terrain, claim.terrain);
    assert.equal(collect.terrainHash, hashTerrainV10R7(collect.terrain));
    assert.equal(collect.terrainRevision, 0);
    assert.equal(collect.objective.objectiveRevision, 0);
    assert.equal(collect.objective.objectiveHash.length, 64);
    assertSimulationInvariantsV10R8(collect);
});

test('R8 objective ASCII rejects malformed dimensions, legend, inventory, occupancy and support', () => {
    const terrain = createSimulationV10R8(4, 'wizard', 'collect').terrain;
    assert.throws(() => compileV10R8ObjectiveLayer('collect', terrain,
        `${V10_R8_COLLECT_OBJECTIVES_ASCII}.`), /exactly 64 by 36/);
    assert.throws(() => compileV10R8ObjectiveLayer('collect', terrain,
        V10_R8_COLLECT_OBJECTIVES_ASCII.replace('\n', '\r\n')), /LF separators/);
    assert.throws(() => compileV10R8ObjectiveLayer('collect', terrain,
        setLayerCell(V10_R8_COLLECT_OBJECTIVES_ASCII, 0, 0, '?')), /unknown character/);
    assert.throws(() => compileV10R8ObjectiveLayer('collect', terrain,
        setLayerCell(V10_R8_COLLECT_OBJECTIVES_ASCII, 12, 32, '.')), /object count/);
    const occupied = setLayerCell(setLayerCell(V10_R8_COLLECT_OBJECTIVES_ASCII, 12, 32, '.'), 13, 32, 'o');
    assert.throws(() => compileV10R8ObjectiveLayer('collect', terrain, occupied), /intersects terrain/);
    const unsupported = setLayerCell(setLayerCell(V10_R8_COLLECT_OBJECTIVES_ASCII, 12, 32, '.'), 8, 32, 'o');
    assert.throws(() => compileV10R8ObjectiveLayer('collect', terrain, unsupported), /has no support/);
    assert.throws(() => compileV10R8ObjectiveLayer('defend', terrain,
        V10_R8_COLLECT_OBJECTIVES_ASCII), /object count/);
});

test('R8 objects fall vertically, land on lower terrain and leave revisions separate from terrain', () => {
    const initial = createSimulationV10R8(4, 'wizard', 'defend');
    const terrain = structuredClone(initial.terrain);
    const chest = initial.objective.objects[0];
    const leftColumn = Math.floor((chest.xFp / 256 - 28) / terrain.cellSize);
    const rightColumn = Math.floor((chest.xFp / 256 + 28 - 1) / terrain.cellSize);
    for (let row = 30; row <= 31; row += 1) {
        for (let column = leftColumn; column <= rightColumn; column += 1) {
            setTerrainSolid(terrain, column, row, false);
        }
    }

    let objective = initial.objective;
    const terrainHash = hashTerrainV10R7(terrain);
    const initialObjectiveHash = objective.objectiveHash;
    for (let tick = 0; tick < 80; tick += 1) {
        objective = advanceObjectivePhysicsV10R8(objective, terrain);
        if (objective.objects[0].grounded) break;
    }
    const landed = objective.objects[0];
    assert.equal(landed.status, 'active');
    assert.equal(landed.grounded, true);
    assert.equal(landed.yFp / 256, 284, 'chest lands on the lower row-19 shelf');
    assert.equal(landed.xFp, chest.xFp, 'the first R8 object model has no horizontal motion');
    assert.ok(objective.objectiveRevision > 1);
    assert.notEqual(objective.objectiveHash, initialObjectiveHash);
    assert.equal(hashTerrainV10R7(terrain), terrainHash, 'objective motion cannot mutate terrain');

    const state = {
        ...initial,
        terrain,
        terrainRevision: 1,
        terrainHash,
        objective
    };
    assertSimulationInvariantsV10R8(state);
    const before = hashSimulationStateV10R8(state);
    const advanced = advanceSimulationTicksV10R8(state, 1);
    assert.equal(advanced.accepted, true);
    assert.equal(hashSimulationStateV10R8(state), before, 'a public tick cannot mutate its input state');
    assert.equal(advanced.state.objective.objectiveHash, objective.objectiveHash);
    assert.notEqual(hashSimulationStateV10R8(advanced.state), before, 'the ordinary simulation tick still advances');
});

test('an unsupported R8 object becomes lost only after its whole body clears the open bottom', () => {
    const initial = createSimulationV10R8(4, 'wizard', 'defend');
    const terrain = structuredClone(initial.terrain);
    const chest = initial.objective.objects[0];
    const leftColumn = Math.floor((chest.xFp / 256 - 28) / terrain.cellSize);
    const rightColumn = Math.floor((chest.xFp / 256 + 28 - 1) / terrain.cellSize);
    for (let row = 30; row < terrain.height; row += 1) {
        for (let column = leftColumn; column <= rightColumn; column += 1) {
            setTerrainSolid(terrain, column, row, false);
        }
    }

    let objective = initial.objective;
    let lastActiveTop = -1;
    for (let tick = 0; tick < 120 && objective.objects[0].status === 'active'; tick += 1) {
        objective = advanceObjectivePhysicsV10R8(objective, terrain);
        if (objective.objects[0].status === 'active') {
            lastActiveTop = objective.objects[0].yFp / 256 - 20;
        }
    }
    const lost = objective.objects[0];
    assert.ok(lastActiveTop < 576);
    assert.equal(lost.status, 'lost');
    assert.ok(lost.yFp / 256 - 20 >= 576);
    assert.equal(lost.grounded, false);
    assert.equal(lost.support, null);
    assert.equal(lost.vyFp, 0);
});

test('R8 projectiles remain transparent to objective objects and clone/hash validation fails closed', () => {
    const state = createSimulationV10R8(4, 'wizard', 'collect');
    const r7 = simulationV10R7ViewOfR8(state);
    const aim = { angleMilliDegrees: 45_000, powerPermille: 800 };
    assert.deepEqual(trajectoryPreviewV10R8(state, aim), trajectoryPreviewR7(r7, aim));
    assert.deepEqual(state.objective.objects.map(object => object.status), Array(7).fill('active'));

    const clone = cloneSimulationV10R8(state);
    assert.notEqual(clone, state);
    assert.deepEqual(clone, state);
    assert.equal(hashSimulationStateV10R8(clone), hashSimulationStateV10R8(state));
    assert.throws(() => cloneSimulationV10R8({
        ...state,
        objective: { ...state.objective, objectiveHash: '0'.repeat(64) }
    }), /objective hash/);
});

test('live R8 serialization overlays actors and active objects beside exact terrain state', () => {
    const state = createSimulationV10R8(4, 'wizard', 'collect');
    const live = serializeV10R8BattlefieldState(state);
    assert.equal(live.terrainRevision, state.terrainRevision);
    assert.equal(live.terrainHash, state.terrainHash);
    assert.equal(live.objectiveRevision, 0);
    assert.equal(live.objectiveHash, state.objective.objectiveHash);
    assert.equal(live.stateHash, hashSimulationStateV10R8(state));
    assert.deepEqual(parseV10R7Terrain(live.terrainAscii), state.terrain);
    assert.equal(live.tacticalAscii.split('\n').length, 72);
    assert.ok(live.tacticalAscii.split('\n').every(line => line.length === 256));
    assert.equal([...live.tacticalAscii].filter(character => character === 'o').length, 7);
    assert.equal([...live.tacticalAscii].filter(character => character === 'P').length, 1);
    assert.equal([...live.tacticalAscii].filter(character => character === 'L').length, 1);
    assert.equal(live.terrainAscii.includes('o'), false);
    assert.equal(live.terrainAscii.includes('C'), false);
});

function setLayerCell(source: string, row: number, column: number, glyph: string): string {
    const lines = source.split('\n');
    lines[row] = `${lines[row].slice(0, column)}${glyph}${lines[row].slice(column + 1)}`;
    return lines.join('\n');
}

function trajectoryPreviewR7(
    state: ReturnType<typeof simulationV10R7ViewOfR8>,
    aim: { angleMilliDegrees: number; powerPermille: number }
): { x: number; y: number }[] {
    const aimed = applySimulationIntentV10(
        state, 'player', { type: 'aim', ...aim }, state.turn, state.phase, state.inputEpoch
    );
    assert.equal(aimed.accepted, true, aimed.error?.message);
    const fired = applySimulationIntentV10(
        aimed.state, 'player', { type: 'fire', aimId: aimed.state.aimId },
        aimed.state.turn, aimed.state.phase, aimed.state.inputEpoch
    );
    assert.equal(fired.accepted, true, fired.error?.message);
    return advanceDetachedProjectileV10(fired.state, 300).state.lastProjectile?.trace ?? [];
}
