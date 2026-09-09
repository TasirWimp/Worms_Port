import assert from 'node:assert/strict';
import test from 'node:test';
import { packV10SurfaceRows } from '../../shared/terrain-generation-v10';
import { createSimulationV10, applySimulationIntentV10, advanceSimulationTicksV10,
    assertSimulationInvariantsV10, generateV10TacticalArena, V10_R2_RULESET_ID } from '../../shared/simulation-v10';
import { V10G_COMBAT_DIMENSIONS, V10G_COVER_CONSTRAINTS, v10gDamageBounds,
    v10gFeatureDimensionFailures, v10gFreeJumpEnvelope, v10gHorizontalCoverFailures
} from '../../shared/terrain-geometry-v10g';

function arena(wallRise: number) {
    const rows = Array<number>(256).fill(56);
    for (let column = 120; column < 136; column += 1) rows[column] -= wallRise / 8;
    return packV10SurfaceRows(rows);
}

test('V10G reproduces the legacy mismatch between support body and damage target', () => {
    assert.equal(V10G_COMBAT_DIMENSIONS.movementRadius * 2, 24);
    assert.deepEqual(v10gDamageBounds({ x: 800, surfaceY: 448 }),
        { left: 768, right: 832, top: 351, bottom: 449 });
    assert.equal(V10G_COVER_CONSTRAINTS.minimumCoverRise, 112);
    assert.equal(V10G_COVER_CONSTRAINTS.minimumPocketWidth, 80);
    assert.equal(V10G_COVER_CONSTRAINTS.minimumShelfWidth, 80);
    for (const [x, direction] of [[800, 1], [1248, -1]] as const) {
        assert.deepEqual(v10gHorizontalCoverFailures(arena(40), { x, surfaceY: 448 }, direction),
            ['exposed_damage_hitbox']);
        assert.deepEqual(v10gHorizontalCoverFailures(arena(112), { x, surfaceY: 448 }, direction), []);
    }
});

test('V10G refuses shallow/narrow features and shelves beyond the jump envelope', () => {
    assert.deepEqual(v10gFeatureDimensionFailures({ coverRise: 40, pocketWidth: 24, shelfWidth: 24, jumpRise: 128 }),
        ['cover_too_low', 'pocket_too_narrow', 'shelf_too_narrow', 'shelf_above_jump_envelope']);
    assert.deepEqual(v10gFeatureDimensionFailures({ coverRise: 112, pocketWidth: 80, shelfWidth: 80, jumpRise: 112 }), []);
    assert.deepEqual(v10gFeatureDimensionFailures({ coverRise: NaN, pocketWidth: 80, shelfWidth: 80, jumpRise: 112 }),
        ['non_grid_dimensions']);
});

test('V10F Twin Crests seed 4 does not shelter the full damage target horizontally', () => {
    const old = generateV10TacticalArena(4, V10_R2_RULESET_ID);
    assert.deepEqual(v10gHorizontalCoverFailures(old.terrain,
        { x: old.opening.leftX, surfaceY: old.opening.leftSurfaceY }, 1), ['exposed_damage_hitbox']);
    assert.deepEqual(v10gHorizontalCoverFailures(old.terrain,
        { x: old.opening.rightX, surfaceY: old.opening.rightSurfaceY }, -1), ['exposed_damage_hitbox']);
});

test('V10G low-cover regression uses actual launched projectiles and damage outcomes', () => {
    for (const side of [0, 1] as const) {
        const outcomes: number[] = [];
        for (const rise of [40, 112]) {
            let state = createSimulationV10(4, 'wizard');
            const rows = Array<number>(256).fill(56);
            for (let column = 120; column < 136; column += 1) rows[column] -= rise / 8;
            for (let column = 96; column < 116; column += 1) rows[side === 0 ? column : 255 - column] = 47;
            state.terrain = packV10SurfaceRows(rows);
            state.activeActor = side === 0 ? 'player' : 'loomkeeper';
            for (const [index, unit] of state.units.entries()) {
                const shooter = index === side;
                const x = shooter ? (side === 0 ? 884 : 1164) : (side === 0 ? 1248 : 800);
                const surface = shooter ? 376 : 448;
                unit.xFp = x * 256; unit.yFp = (surface - 12) * 256;
                unit.support = (surface / 8) * 256 + Math.floor((x - 12) / 8);
                unit.thread = 9;
            }
            assertSimulationInvariantsV10(state);
            for (const intent of [
                { type: 'face', direction: side === 0 ? 1 : -1 } as const,
                { type: 'aim', angleMilliDegrees: 0, powerPermille: 1000 } as const,
                { type: 'fire', aimId: state.aimId + 1 } as const
            ]) {
                const transition = applySimulationIntentV10(state, state.activeActor, intent, 0);
                assert.equal(transition.accepted, true, JSON.stringify(transition.error));
                state = transition.state;
            }
            for (let tick = 0; tick < 300 && state.phase === 'projectile'; tick += 1) {
                state = advanceSimulationTicksV10(state, 1).state;
            }
            outcomes.push(state.units[1 - side].stitching);
            assert.equal(state.lastProjectile?.impact, rise === 40 ? (side === 0 ? 'loomkeeper' : 'player') : 'terrain');
        }
        assert.deepEqual(outcomes, [55, 100], 'same launch: 45 damage behind low cover, none behind tall cover');
    }
});

test('V10G jump envelope agrees with actual authority and a tall ledge requires jumping', () => {
    assert.deepEqual(v10gFreeJumpEnvelope(), { rise: 124, horizontalReach: 63 });
    for (const side of [0, 1] as const) {
        let state = createSimulationV10(4, 'wizard');
        state.terrain = arena(112);
        const x = side === 0 ? 928 : 1120;
        const actor = side === 0 ? 'player' : 'loomkeeper';
        state.activeActor = actor;
        for (const [index, unit] of state.units.entries()) {
            const ux = index === side ? x : (side === 0 ? 1400 : 600);
            unit.xFp = ux * 256; unit.yFp = 436 * 256;
            unit.support = 56 * 256 + Math.floor((ux - 12) / 8);
        }
        assertSimulationInvariantsV10(state);
        const walk = applySimulationIntentV10(state, actor, { type: 'walk_start', direction: side === 0 ? 1 : -1 }, 0);
        assert.equal(walk.accepted, true);
        let walking = walk.state;
        for (let tick = 0; tick < 70; tick += 1) {
            if (tick > 0 && tick % 3 === 0) {
                const refreshed = applySimulationIntentV10(walking, actor, { type: 'walk_refresh' }, 0);
                assert.equal(refreshed.accepted, true);
                walking = refreshed.state;
            }
            walking = advanceSimulationTicksV10(walking, 1).state;
        }
        assert.equal(walking.units[side].yFp / 256, 436, 'walking stays below the ledge');
        assert.equal(walking.units[side].xFp / 256, side === 0 ? 948 : 1100, 'walking stops at physical contact');
        const jumped = applySimulationIntentV10(state, actor, { type: 'jump', direction: side === 0 ? 1 : -1 }, 0);
        assert.equal(jumped.accepted, true);
        state = jumped.state;
        let minimumY = 436;
        for (let tick = 0; tick < 100; tick += 1) {
            state = advanceSimulationTicksV10(state, 1).state;
            minimumY = Math.min(minimumY, state.units[side].yFp / 256);
            if (state.units[side].grounded) break;
        }
        assert.equal(436 - minimumY, 124);
        assert.equal(state.units[side].grounded, true);
        assert.equal(state.units[side].yFp / 256, 324, 'actual 112-unit ledge landing');
    }
});
