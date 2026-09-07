import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { terrainSolid } from '../../shared/simulation';
import {
    V10_OPENING_RULES, V10_PROFILE_RULES, V10_RULESET_ID,
    SimulationStateV10Schema, advanceSimulationTicksV10, applySimulationIntentV10,
    canonicalSimulationJsonV10, createSimulationV10, generateV10TacticalArena,
    hashSimulationStateV10, v10TerrainProfileForSeed
} from '../../shared/simulation-v10';

const ASSESSMENT_SEEDS = [1, 2, 3, 0x13579BDF, 0xC0FFEE11, 0xDEADBEEF] as const;
const PROPERTY_SEEDS = Array.from({ length: 48 }, (_, index) => index + 1);

test('V10 creates deterministic profile-bound state for every Calling', () => {
    for (const seed of ASSESSMENT_SEEDS) {
        const first = createSimulationV10(seed, 'wizard');
        const repeated = createSimulationV10(seed, 'wizard');
        assert.deepEqual(repeated, first, `${seed}: repeat`);
        assert.equal(first.formatVersion, 10);
        assert.equal(first.rulesetId, V10_RULESET_ID);
        assert.equal(first.rulesetVersion, 10);
        assert.equal(first.terrainProfileId, v10TerrainProfileForSeed(seed));
        assert.equal(SimulationStateV10Schema.safeParse(first).success, true);
        for (const calling of ['thief', 'warrior'] as const) {
            const alternate = createSimulationV10(seed, calling);
            assert.equal(alternate.terrainProfileId, first.terrainProfileId);
            assert.deepEqual(alternate.terrain, first.terrain);
            assert.deepEqual(
                alternate.units.map(unit => [unit.xFp, unit.yFp, unit.support]),
                first.units.map(unit => [unit.xFp, unit.yFp, unit.support])
            );
        }
    }
});

test('V10 profile family stays surface-only, connected and traversable', () => {
    const seen = new Set<string>();
    for (const seed of PROPERTY_SEEDS) {
        const arena = generateV10TacticalArena(seed);
        seen.add(arena.profileId);
        const surfaces = surfaceRows(arena.terrain);
        assert.equal(surfaces.length, 256);
        for (let x = 0; x < surfaces.length; x += 1) {
            const surface = surfaces[x];
            assert.ok(surface >= 34 && surface <= 54, `${seed}: bounded surface ${x}`);
            for (let y = 0; y < arena.terrain.height; y += 1) {
                assert.equal(
                    terrainSolid(arena.terrain, x, y),
                    y >= surface,
                    `${seed}: one surface at ${x}/${y}`
                );
            }
            if (x > 0) assert.ok(Math.abs(surface - surfaces[x - 1]) <= 1, `${seed}: reachable step ${x}`);
        }
    }
    assert.deepEqual([...seen].sort(), ['open-terraces', 'rising-braid', 'sheltered-folds']);
});

test('V10 admits profile-specific starts with support, outward movement and an opponent route', () => {
    for (const seed of PROPERTY_SEEDS) {
        const arena = generateV10TacticalArena(seed);
        const { opening } = arena;
        const rules = V10_PROFILE_RULES[arena.profileId];
        assert.equal(opening.rightX - opening.leftX, rules.separation, `${seed}: separation`);
        assert.ok(opening.leftX >= V10_OPENING_RULES.safeWorldMargin, `${seed}: left margin`);
        assert.ok(opening.rightX <= 2048 - V10_OPENING_RULES.safeWorldMargin, `${seed}: right margin`);
        const difference = Math.abs(opening.rightSurfaceY - opening.leftSurfaceY);
        assert.ok(difference >= rules.minimumHeightDifference, `${seed}: minimum height difference`);
        assert.ok(difference <= rules.maximumHeightDifference, `${seed}: maximum height difference`);
        assert.equal(routeLength(arena.terrain, opening.leftX, -1), 64, `${seed}: left retreat`);
        assert.equal(routeLength(arena.terrain, opening.rightX, 1), 64, `${seed}: right retreat`);
        assert.equal(routeIsContinuous(arena.terrain, opening.leftX, opening.rightX), true, `${seed}: opponent route`);

        const state = createSimulationV10(seed, 'wizard');
        assert.deepEqual(
            state.units.map(unit => unit.xFp / 256),
            [opening.leftX, opening.rightX],
            `${seed}: authoritative starts`
        );
        assert.ok(state.units.every(unit => unit.grounded && unit.support !== null), `${seed}: support`);
    }
});

test('V10 profile geometry exposes its contracted tactical distinction and reflected height side', () => {
    for (const seed of PROPERTY_SEEDS) {
        const arena = generateV10TacticalArena(seed);
        const { leftX, rightX, leftSurfaceY, rightSurfaceY } = arena.opening;
        const rows = surfaceRows(arena.terrain).slice(leftX / 8, rightX / 8 + 1);
        const relief = (Math.max(...rows) - Math.min(...rows)) * 8;
        if (arena.profileId === 'sheltered-folds') {
            const crest = Math.min(...rows) * 8;
            assert.ok(Math.min(leftSurfaceY, rightSurfaceY) - crest >= 48, `${seed}: central shelter`);
        } else if (arena.profileId === 'rising-braid') {
            assert.ok(relief >= 32 && relief <= 64, `${seed}: rising relief`);
            if (arena.reflected) assert.ok(leftSurfaceY < rightSurfaceY, `${seed}: reflected high side`);
            else assert.ok(rightSurfaceY < leftSurfaceY, `${seed}: authored high side`);
        } else {
            assert.ok(relief <= 16, `${seed}: open terrace relief`);
        }
    }
});

test('V10 transitions preserve profile identity while using V9 action and destruction mechanics', () => {
    let state = createSimulationV10(3, 'wizard');
    const initialTerrain = [...state.terrain.words];
    const selected = applySimulationIntentV10(
        state, 'player', { type: 'select_relic', relicId: 'threadball' },
        state.turn, state.phase, state.inputEpoch
    );
    assert.equal(selected.accepted, true);
    state = selected.state;
    state = applySimulationIntentV10(
        state, 'player', { type: 'aim', angleMilliDegrees: 45_000, powerPermille: 700 },
        state.turn, state.phase, state.inputEpoch
    ).state;
    const fired = applySimulationIntentV10(
        state, 'player', { type: 'fire', aimId: state.aimId },
        state.turn, state.phase, state.inputEpoch
    );
    assert.equal(fired.accepted, true);
    const resolved = advanceSimulationTicksV10(fired.state, 300);
    assert.equal(resolved.state.terrainProfileId, 'sheltered-folds');
    assert.equal(resolved.state.rulesetId, V10_RULESET_ID);
    assert.notDeepEqual(resolved.state.terrain.words, initialTerrain, 'projectile changes authoritative terrain');
});

test('V10 canonical hash binds sorted state, profile and packed terrain bytes', () => {
    const state = createSimulationV10(1, 'wizard');
    const canonical = canonicalSimulationJsonV10(state);
    assert.equal(hashSimulationStateV10(state), createHash('sha256').update(canonical).digest('hex'));
    assert.ok(canonical.indexOf('"activeActor"') < canonical.indexOf('"terrainProfileId"'));
    const changedTerrain = structuredClone(state);
    changedTerrain.terrain.words[500] = (changedTerrain.terrain.words[500] ^ 1) >>> 0;
    assert.notEqual(hashSimulationStateV10(changedTerrain), hashSimulationStateV10(state));
    const relabelled = { ...state, terrainProfileId: 'open-terraces' };
    assert.equal(SimulationStateV10Schema.safeParse(relabelled).success, true);
    assert.throws(() => hashSimulationStateV10(relabelled as typeof state), /profile does not match seed/);
});

function surfaceRows(terrain: ReturnType<typeof generateV10TacticalArena>['terrain']): number[] {
    return Array.from({ length: terrain.width }, (_, x) => {
        for (let y = 0; y < terrain.height; y += 1) if (terrainSolid(terrain, x, y)) return y;
        return terrain.height;
    });
}

function routeLength(
    terrain: ReturnType<typeof generateV10TacticalArena>['terrain'],
    startX: number,
    direction: -1 | 1
): number {
    const surfaces = surfaceRows(terrain);
    let x = startX;
    let distance = 0;
    while (distance < 64) {
        const nextX = x + direction * 8;
        if (nextX < 12 || nextX > 2035 ||
            Math.abs(surfaces[nextX / 8] - surfaces[x / 8]) > 1) break;
        x = nextX;
        distance += 8;
    }
    return distance;
}

function routeIsContinuous(
    terrain: ReturnType<typeof generateV10TacticalArena>['terrain'],
    leftX: number,
    rightX: number
): boolean {
    const surfaces = surfaceRows(terrain);
    for (let x = leftX + 8; x <= rightX; x += 8) {
        if (Math.abs(surfaces[x / 8] - surfaces[x / 8 - 1]) > 1) return false;
    }
    return true;
}
