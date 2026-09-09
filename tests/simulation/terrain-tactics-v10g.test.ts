import assert from 'node:assert/strict';
import test from 'node:test';
import { terrainSolid, type RelicId } from '../../shared/simulation';
import { packV10SurfaceRows } from '../../shared/terrain-generation-v10';
import { generateV10GTwinCrests, V10G_RECIPE_REVISION } from '../../shared/terrain-generation-v10g';
import { V10G_PROJECTILE_RULES } from '../../shared/projectile-rules-v10g';
import { CoordinatorReplayV10Schema } from '../../shared/protocol-v10';
import { SimulationCoordinatorV10 } from '../../server/src/simulation/coordinator-v10';
import { LoomkeeperPlannerV10, LoomkeeperExecutionV10 } from '../../shared/loomkeeper-v10';
import { createSimulationV10, applySimulationIntentV10, advanceSimulationTicksV10,
    assertSimulationInvariantsV10, cloneSimulationV10, SimulationStateV10Schema,
    V10_R3_RULESET_ID, type SimulationStateV10, type SimulationIntentV10 } from '../../shared/simulation-v10';

const fresh = () => createSimulationV10(4, 'wizard', V10_R3_RULESET_ID);
function apply(state: SimulationStateV10, intent: SimulationIntentV10) {
    const result = applySimulationIntentV10(state, state.activeActor, intent, state.turn);
    assert.equal(result.accepted, true, JSON.stringify(result.error));
    return result.state;
}
function fire(state: SimulationStateV10, relic: RelicId, angle: number, power = 1000) {
    state = apply(state, { type: 'select_relic', relicId: relic });
    state = apply(state, { type: 'aim', angleMilliDegrees: angle, powerPermille: power });
    return apply(state, { type: 'fire', aimId: state.aimId });
}
function resolve(state: SimulationStateV10) {
    for (let tick = 0; tick < 300 && state.phase === 'projectile'; tick += 1) state = advanceSimulationTicksV10(state, 1).state;
    assert.notEqual(state.phase, 'projectile');
    return state;
}
function position(state: SimulationStateV10, side: 0 | 1, x: number, surface: number) {
    const unit = state.units[side];
    unit.xFp = x * 256; unit.yFp = (surface - 12) * 256;
    unit.support = surface / 8 * 256 + Math.floor((x - 12) / 8);
    assertSimulationInvariantsV10(state);
}
function walk(state: SimulationStateV10, direction: -1 | 1, ticks: number) {
    state = apply(state, { type: 'walk_start', direction });
    for (let tick = 0; tick < ticks; tick += 1) {
        if (tick > 0 && tick % 3 === 0) state = apply(state, { type: 'walk_refresh' });
        state = advanceSimulationTicksV10(state, 1).state;
    }
    return apply(state, { type: 'walk_stop' });
}
function untilTurn(state: SimulationStateV10, turn: number) {
    for (let tick = 0; tick < 2100 && state.turn < turn && state.phase !== 'finished'; tick += 1) state = advanceSimulationTicksV10(state, 1).state;
    assert.equal(state.turn, turn);
    return state;
}

test('V10G constructs a repeatable geometry-derived recipe and strictly binds R3 metadata', () => {
    const terrain = generateV10GTwinCrests();
    assert.deepEqual(terrain, generateV10GTwinCrests());
    assert.equal(terrain.authoringRows.length, 32);
    assert.equal(terrain.rows.length, 256);
    assert.equal(terrain.ascii.split('\n').length, 16);
    assert.deepEqual(terrain.authoringRows, [...terrain.authoringRows].reverse());
    const state = fresh();
    assert.equal(state.terrainRecipeRevision, V10G_RECIPE_REVISION);
    for (const patch of [{ terrainRecipeRevision: 'v10f-recipes-r1' }, { terrainCandidateIndex: 1 }, { terrainProfileId: 'trench-needle' }]) {
        assert.equal(SimulationStateV10Schema.safeParse({ ...state, ...patch }).success, false);
    }
});

test('V10G protection, lob and exposed precision have actual damage outcomes on both sides', () => {
    for (const side of [0, 1] as const) {
        const state = fresh(); state.activeActor = side === 0 ? 'player' : 'loomkeeper'; state.units[side].thread = 3;
        const protectedShot = resolve(fire(state, 'needlepoint', 0));
        assert.equal(protectedShot.lastProjectile?.impact, 'terrain');
        assert.equal(protectedShot.units[1 - side].stitching, 100);
        const lob = resolve(fire(state, 'threadball', 60000));
        assert.equal(lob.units[1 - side].stitching, 55);
        assert.equal(resolve(fire(state, 'threadball', 55000)).units[1 - side].stitching, 100);
        const exposed = cloneSimulationV10(state);
        position(exposed, 0, 880, 336); position(exposed, 1, 1168, 336);
        let needle = fire(exposed, 'needlepoint', 0);
        const originalY = needle.projectile!.yFp;
        needle = advanceSimulationTicksV10(needle, 5).state;
        assert.equal(needle.projectile!.yFp, originalY, 'precision has zero gravity');
        needle = resolve(needle);
        assert.equal(needle.units[1 - side].stitching, 40);
        assert.equal(needle.units[side].thread, 0, 'precision pays its inherited cost');
    }
});

test('V10G jumping unlocks shelf fire and exposure; walking cannot substitute', () => {
    for (const side of [0, 1] as const) {
        let state = fresh(); state.activeActor = side === 0 ? 'player' : 'loomkeeper'; state.units[side].thread = 3;
        position(state, (1 - side) as 0 | 1, side === 0 ? 1168 : 880, 336);
        const direction = side === 0 ? 1 : -1;
        assert.equal(resolve(fire(state, 'needlepoint', 0)).units[1 - side].stitching, 100);
        assert.equal(walk(state, direction, 100).units[side].yFp, 436 * 256);
        state = walk(state, direction, 40);
        state = apply(state, { type: 'jump', direction });
        for (let tick = 0; tick < 100 && !state.units[side].grounded; tick += 1) state = advanceSimulationTicksV10(state, 1).state;
        assert.equal(state.units[side].yFp, 324 * 256);
        assert.equal(resolve(fire(state, 'needlepoint', 0)).units[1 - side].stitching, 40);
        state.activeActor = side === 0 ? 'loomkeeper' : 'player'; state.units[1 - side].thread = 3;
        assert.equal(resolve(fire(state, 'needlepoint', 0)).units[side].stitching, 40, 'shelf exposes jumper to a counterattack');
    }
});

test('V10G pocket boundary hitboxes resist precision aimed at head, centre and feet from opposing pockets and shelves', () => {
    for (const side of [0, 1] as const) for (const pocketX of [616, 688, 760, 792]) for (const onShelf of [false, true]) {
        const state = fresh(); state.activeActor = side === 0 ? 'player' : 'loomkeeper'; state.units[side].thread = 3;
        const targetX = side === 0 ? 2048 - pocketX : pocketX;
        position(state, (1 - side) as 0 | 1, targetX, 448);
        if (onShelf) position(state, side, side === 0 ? 880 : 1168, 336);
        const unit = state.units[side];
        const originX = unit.xFp / 256 + (side === 0 ? 16 : -16);
        const originY = unit.yFp / 256 - 4;
        for (const targetY of [351, 400, 447]) {
            const dy = targetY - originY;
            const angle = Math.round(-90000 * dy / (Math.abs(targetX - originX) + Math.abs(dy)));
            assert.equal(resolve(fire(state, 'needlepoint', angle)).units[1 - side].stitching, 100,
                `${side}/${pocketX}/${onShelf}/${targetY}: protected hitbox`);
        }
    }
});

test('V10G Spoolburst opens a supported forward route using earned Thread', () => {
    for (const side of [0, 1] as const) {
        const source = untilTurn(fresh(), side === 0 ? 2 : 3);
        assert.ok(source.units[side].thread >= 5);
        assert.equal(resolve(fire(source, 'spoolburst', 60000)).units[1 - side].stitching, 75,
            'breacher sacrifices direct damage compared with the 45-damage Threadball lob');
        const breached = resolve(fire(source, 'spoolburst', 45000));
        assert.equal(breached.units[side].thread, source.units[side].thread - 5);
        const nextTurn = source.turn + 2;
        const direction = side === 0 ? 1 : -1;
        const intactWalk = walk(untilTurn(source, nextTurn), direction, 120);
        const breachedWalk = walk(untilTurn(breached, nextTurn), direction, 120);
        assert.equal(intactWalk.units[side].xFp / 256, side === 0 ? 820 : 1228);
        // Signed sweep/raster boundaries can differ by one cell; both directions
        // must buy at least 48 supported world units beyond the intact barrier.
        assert.ok(direction * (breachedWalk.units[side].xFp - intactWalk.units[side].xFp) >= 48 * 256);
        assert.equal(breachedWalk.units[side].grounded, true);
        assert.equal(breachedWalk.units[side].alive, true);
    }
});

test('V10G intact thin cover shields splash even when the impact removes it; blocked muzzle cannot hit through terrain', () => {
    for (const side of [0, 1] as const) for (const muzzleBlocked of [false, true]) {
        let state = untilTurn(fresh(), side === 0 ? 2 : 3);
        const rows = Array<number>(256).fill(56); const wall = side === 0 ? 128 : 127; rows[wall] = 30;
        state.terrain = packV10SurfaceRows(rows);
        const reflect = (x: number) => side === 0 ? x : 2047 - x;
        position(state, side, reflect(muzzleBlocked ? 1008 : 960), 448);
        position(state, (1 - side) as 0 | 1, reflect(muzzleBlocked ? 1044 : 1072), 448);
        state = resolve(fire(state, 'spoolburst', 0));
        assert.equal(state.lastProjectile?.impact, 'terrain');
        assert.equal(state.units[1 - side].stitching, 100);
        assert.equal(terrainSolid(state.terrain, wall, Math.floor(state.lastProjectile!.endY / 8)), false);
    }
    assert.ok(V10G_PROJECTILE_RULES.relics.spoolburst.craterRadius > V10G_PROJECTILE_RULES.relics.threadball.craterRadius);
});

test('V10G coordinator replays a breach and AI response on the mutated map and rejects metadata tampering', () => {
    const coordinator = new SimulationCoordinatorV10();
    try {
        const id = 'challenge_v10g_replay'; const sessionId = 'session_v10g_replay';
        coordinator.create(id, sessionId, 4, 'wizard', V10_R3_RULESET_ID);
        coordinator.advance(id, 900); // Earn the five-Thread breacher legally.
        for (const intent of [{ type: 'select_relic', relicId: 'spoolburst' },
            { type: 'aim', angleMilliDegrees: 45000, powerPermille: 1000 }, { type: 'fire', aimId: 1 }] as const) {
            const state = coordinator.get(id)!.state;
            assert.equal(coordinator.apply(id, 'player', intent, state.turn, state.phase, state.inputEpoch).transition.accepted, true);
        }
        for (let tick = 0; tick < 300 && coordinator.get(id)!.state.turn === 2; tick += 1) coordinator.advance(id, 1);
        const source = coordinator.get(id)!.state;
        assert.equal(source.turn, 3);
        assert.notDeepEqual(source.terrain.words, fresh().terrain.words);
        const planner = new LoomkeeperPlannerV10(source);
        for (let tick = 0; tick < 30; tick += 1) planner.step();
        assert.equal(planner.selection.status, 'selected');
        coordinator.advance(id, 30);
        const execution = new LoomkeeperExecutionV10(planner.selectedCandidate()!, planner.selection.prefix, coordinator.get(id)!.state);
        let fired = false;
        for (let tick = 0; tick < 1050; tick += 1) {
            let state = coordinator.get(id)!.state;
            if (state.turn !== 3 || state.phase === 'finished') break;
            for (let slot = 0; slot < 8; slot += 1) {
                const operation = execution.next(state); if (!operation) break;
                if (operation.kind === 'intent') {
                    assert.equal(coordinator.apply(id, 'loomkeeper', operation.intent, state.turn, state.phase, state.inputEpoch).transition.accepted, true);
                    fired ||= operation.intent.type === 'fire';
                } else assert.equal(coordinator.barrier(id, operation.barrier).transition.accepted, true);
                state = coordinator.get(id)!.state;
            }
            if (state.turn === 3 && state.phase !== 'finished') coordinator.advance(id, 1);
        }
        assert.equal(fired, true);
        assert.notEqual(coordinator.get(id)!.state.turn, 3);
        const replay = coordinator.replay(id)!;
        assert.equal(CoordinatorReplayV10Schema.safeParse(replay).success, true);
        assert.equal(CoordinatorReplayV10Schema.safeParse({ ...replay, recipeRevision: 'v10f-recipes-r1' }).success, false);
        const restored = coordinator.reconstructAndVerify(replay, { challengeId: id, sessionId });
        assert.deepEqual(restored.state, coordinator.get(id)!.state);
        assert.equal(restored.stateHash, coordinator.get(id)!.stateHash);
    } finally { coordinator.dispose(); }
});
