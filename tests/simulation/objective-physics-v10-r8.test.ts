import assert from 'node:assert/strict';
import test from 'node:test';

import { parseV10R7Terrain } from '../../shared/terrain-battlefield-v10-r7';
import { setTerrainSolid, terrainSolid } from '../../shared/simulation';
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
    V10_R8_CLAIM_OBJECTIVES_ASCII,
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

test('R8 collects by living-body overlap and leaves an exact two-actor distance tie active', () => {
    const initial = createSimulationV10R8(4, 'wizard', 'collect');
    const objective = objectiveAtActor(initial, 'collect', 'player');
    const collection = advanceSimulationTicksV10R8({ ...initial, objective }, 1);
    const collected = collection.state;
    const collectionEvent = collection.events.find(event => event.type === 'coin_collected');
    assert.equal(collectionEvent?.type, 'coin_collected');
    if (collectionEvent?.type !== 'coin_collected') throw new Error('Expected coin collection event.');
    assert.match(collectionEvent.objectId, /^coin-[1-7]$/);
    assert.equal(collectionEvent.actor, 'player');
    assert.equal(collectionEvent.tick, 1);
    assert.equal(collected.objective.scores.player, 1);
    assert.equal(collected.objective.objects.filter(object => object.status === 'collected').length, 1);
    assert.equal(collected.objective.objects.find(object => object.status === 'collected')?.resolvedBy, 'player');
    assert.equal(collected.objective.result, null);

    const tiedCoin = objective.objects.find(object => Math.abs(object.xFp - initial.units[0].xFp) <= 16 * 256)!;
    const tiedYFp = tiedCoin.yFp + 4 * 256;
    const playerX = tiedCoin.xFp - 24 * 256;
    const loomkeeperX = tiedCoin.xFp + 24 * 256;
    const playerSupport = actorSupportAt(initial.terrain, playerX, tiedYFp);
    const loomkeeperSupport = actorSupportAt(initial.terrain, loomkeeperX, tiedYFp);
    assert.notEqual(playerSupport, null);
    assert.notEqual(loomkeeperSupport, null);
    const tied = {
        ...initial,
        units: [{ ...initial.units[0], xFp: playerX, yFp: tiedYFp, support: playerSupport },
            { ...initial.units[1], xFp: loomkeeperX, yFp: tiedYFp,
                grounded: true, support: loomkeeperSupport }] as typeof initial.units,
        objective
    };
    const unresolved = advanceSimulationTicksV10R8(tied, 1).state;
    assert.equal(unresolved.objective.scores.player, 0);
    assert.equal(unresolved.objective.scores.loomkeeper, 0);
    assert.equal(unresolved.objective.objects.filter(object => object.status === 'active').length, 7);
});

test('R8 ends Collect as soon as a four-coin lead cannot be caught', () => {
    let state = createSimulationV10R8(4, 'wizard', 'collect');
    for (let count = 0; count < 4; count += 1) {
        const loomkeeper = state.units[1];
        const coin = state.objective.objects.filter(object => object.status === 'active')
            .sort((left, right) => Math.abs(right.xFp - loomkeeper.xFp) - Math.abs(left.xFp - loomkeeper.xFp))[0];
        const playerYFp = coin.yFp + 4 * 256;
        const support = actorSupportAt(state.terrain, coin.xFp, playerYFp);
        assert.notEqual(support, null);
        state = advanceSimulationTicksV10R8({
            ...state,
            units: [{ ...state.units[0], xFp: coin.xFp, yFp: playerYFp,
                vxFp: 0, vyFp: 0, grounded: true, support, airTicks: 0, airDrive: null },
            state.units[1]] as typeof state.units
        }, 1).state;
    }
    assert.equal(state.objective.scores.player, 4);
    assert.equal(state.objective.objects.filter(object => object.status === 'active').length, 3);
    assert.equal(state.winner, 'player');
    assert.deepEqual(state.objective.result, { winner: 'player', reason: 'coin_lead' });
});

test('R8 chest contact awards only the attacker and records the exact result reason', () => {
    const claim = createSimulationV10R8(4, 'wizard', 'claim');
    const capture = advanceSimulationTicksV10R8({
        ...claim,
        objective: objectiveAtActor(claim, 'claim', 'player')
    }, 1);
    const claimed = capture.state;
    assert.deepEqual(capture.events.find(event => event.type === 'chest_captured'), {
        type: 'chest_captured', objectId: 'loomkeeper-chest', actor: 'player', tick: 1
    });
    assert.equal(claimed.winner, 'player');
    assert.deepEqual(claimed.objective.result, { winner: 'player', reason: 'chest_captured' });
    assert.equal(claimed.objective.objects[0].status, 'captured');
    assert.equal(claimed.objective.objects[0].resolvedBy, 'player');
    assertSimulationInvariantsV10R8(claimed);

    const defend = createSimulationV10R8(4, 'wizard', 'defend');
    const defended = advanceSimulationTicksV10R8({
        ...defend,
        objective: objectiveAtActor(defend, 'defend', 'loomkeeper')
    }, 1).state;
    assert.equal(defended.winner, 'loomkeeper');
    assert.deepEqual(defended.objective.result, { winner: 'loomkeeper', reason: 'chest_captured' });
    assertSimulationInvariantsV10R8(defended);
});

test('R8 chest loss and turn-limit outcomes follow the selected objective mode', () => {
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
    while (objective.objects[0].status === 'active') {
        objective = advanceObjectivePhysicsV10R8(objective, terrain);
    }
    const lost = advanceSimulationTicksV10R8({
        ...initial,
        terrain,
        terrainRevision: 1,
        terrainHash: hashTerrainV10R7(terrain),
        objective
    }, 1).state;
    assert.equal(lost.winner, 'loomkeeper');
    assert.deepEqual(lost.objective.result, { winner: 'loomkeeper', reason: 'chest_lost' });

    const expected = { defend: 'player', collect: 'draw', claim: 'loomkeeper' } as const;
    for (const mode of ['defend', 'collect', 'claim'] as const) {
        const state = createSimulationV10R8(4, 'wizard', mode);
        const result = advanceSimulationTicksV10R8({ ...state, turn: 15 }, 1_800).state;
        assert.equal(result.winner, expected[mode]);
        assert.deepEqual(result.objective.result, { winner: expected[mode], reason: 'turn_limit' });
        assertSimulationInvariantsV10R8(result);
    }
});

test('R8 resolves opposing chest-loss and elimination victories on one tick as a draw', () => {
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
    while (objective.objects[0].status === 'active') {
        objective = advanceObjectivePhysicsV10R8(objective, terrain);
    }
    const result = advanceSimulationTicksV10R8({
        ...initial,
        terrain,
        terrainRevision: 1,
        terrainHash: hashTerrainV10R7(terrain),
        units: [initial.units[0], { ...initial.units[1], stitching: 0, alive: false,
            vxFp: 0, vyFp: 0, grounded: false, support: null, airTicks: 0, airDrive: null }],
        objective
    }, 1).state;
    assert.equal(result.winner, 'draw');
    assert.deepEqual(result.objective.result, { winner: 'draw', reason: 'simultaneous' });
    assertSimulationInvariantsV10R8(result);
});

function setLayerCell(source: string, row: number, column: number, glyph: string): string {
    const lines = source.split('\n');
    lines[row] = `${lines[row].slice(0, column)}${glyph}${lines[row].slice(column + 1)}`;
    return lines.join('\n');
}

function objectiveAtActor(
    state: ReturnType<typeof createSimulationV10R8>,
    mode: 'collect' | 'defend' | 'claim',
    actor: 'player' | 'loomkeeper'
) {
    const unit = state.units[actor === 'player' ? 0 : 1];
    assert.notEqual(unit.support, null);
    const supportRow = Math.floor(unit.support! / state.terrain.width);
    const row = Math.floor(supportRow / 2) - 1;
    const column = Math.floor(unit.xFp / 256 / 32);
    const glyph = mode === 'collect' ? 'o' : 'C';
    const source = mode === 'collect' ? V10_R8_COLLECT_OBJECTIVES_ASCII
        : mode === 'defend' ? V10_R8_DEFEND_OBJECTIVES_ASCII : V10_R8_CLAIM_OBJECTIVES_ASCII;
    const lines = source.split('\n');
    if (lines[row][column] !== glyph) {
        const existingRow = lines.findIndex(line => line.includes(glyph));
        const existingColumn = lines[existingRow].indexOf(glyph);
        lines[existingRow] = `${lines[existingRow].slice(0, existingColumn)}.${lines[existingRow].slice(existingColumn + 1)}`;
        lines[row] = `${lines[row].slice(0, column)}${glyph}${lines[row].slice(column + 1)}`;
    }
    return compileV10R8ObjectiveLayer(mode, state.terrain, lines.join('\n'));
}

function actorSupportAt(
    terrain: ReturnType<typeof createSimulationV10R8>['terrain'],
    xFp: number,
    yFp: number
): number | null {
    const left = Math.floor((xFp / 256 - 12) / terrain.cellSize);
    const right = Math.floor((xFp / 256 + 12 - 1) / terrain.cellSize);
    const row = Math.floor((yFp / 256 + 12) / terrain.cellSize);
    for (let column = Math.max(0, left); column <= Math.min(terrain.width - 1, right); column += 1) {
        if (terrainSolid(terrain, column, row)) return row * terrain.width + column;
    }
    return null;
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
