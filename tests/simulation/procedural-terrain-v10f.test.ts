import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { terrainSolid } from '../../shared/simulation';
import {
    V10_R2_RULESET_ID, SimulationStateV10Schema, advanceSimulationTicksV10,
    applySimulationIntentV10, createSimulationV10, generateV10TacticalArena
} from '../../shared/simulation-v10';
import {
    V10_AUTHORING_EXPANSION, V10_AUTHORING_WIDTH, V10_PROCEDURAL_CANDIDATE_COUNT,
    V10_PROCEDURAL_OPERATION_LIMITS, V10_PROCEDURAL_RECIPE_REVISION,
    V10_PROCEDURAL_TERRAIN_PROFILE_IDS, V10_PROCEDURAL_TERRAIN_RECIPES,
    compileV10ProceduralOperations, generateV10ProceduralSurfaceCandidate,
    generateV10ProceduralSurfaceCandidates, packV10SurfaceRows,
    v10ProceduralTerrainProfileForSeed,
    type V10ProceduralTerrainOperation
} from '../../shared/terrain-generation-v10';
import {
    evaluateV10ProceduralCandidate, selectV10ProceduralEvaluation,
    selectV10ProceduralSurface, type V10FCandidateEvaluation
} from '../../shared/terrain-admission-v10f';

const ASCII_HASHES: Readonly<Record<string, string>> = Object.freeze({
    'twin-crests': 'ea912366a3a9139f31bdaae8b1c16d4b0bc3c4b87f903cc6e8de1421d8193974',
    'asymmetric-rampart': 'b75a33fd569dc29f04bb5fd3ffbd7b36a40938bc7f80fe7532de65e2430671be',
    'trench-needle': 'da44beb6413aac3ddf09e8cc34bf4f8a6816a0dcdb56d2e07e09342b13af4691',
    'stepping-mesa': 'e6d5cd7e79d5fd75e9f5d837a0596875b4b2dcbf746e7184092dfe9190839c7f'
});

test('V10F machine recipes preserve all four documented operation sequences and normalized ASCII snapshots', () => {
    const expectedSequences = {
        'twin-crests': ['plateau', 'ridge', 'hollow', 'jump-shelf', 'notch', 'ridge', 'notch', 'jump-shelf', 'hollow', 'ridge', 'plateau'],
        'asymmetric-rampart': ['plateau', 'asymmetric-elevation', 'ramp', 'jump-shelf', 'notch', 'hollow', 'ridge', 'plateau'],
        'trench-needle': ['plateau', 'hollow', 'ridge', 'notch', 'hollow', 'jump-shelf', 'hollow', 'notch', 'ridge', 'hollow', 'plateau'],
        'stepping-mesa': ['plateau', 'hollow', 'jump-shelf', 'notch', 'ridge', 'notch', 'jump-shelf', 'hollow', 'plateau']
    } as const;
    for (const [index, profileId] of V10_PROCEDURAL_TERRAIN_PROFILE_IDS.entries()) {
        const recipe = V10_PROCEDURAL_TERRAIN_RECIPES[profileId];
        assert.equal(recipe.revision, V10_PROCEDURAL_RECIPE_REVISION);
        assert.equal(recipe.segments.reduce((total, item) => total + item.width, 0), V10_AUTHORING_WIDTH);
        assert.deepEqual(recipe.segments.map(item => item.kind), expectedSequences[profileId]);

        const candidate = generateV10ProceduralSurfaceCandidate(index + 1, 0, profileId);
        assert.equal(candidate.authoringRows.length, 32);
        assert.equal(candidate.rows.length, 256);
        assert.ok(candidate.rows.every(row => Number.isSafeInteger(row) && row >= 34 && row <= 54));
        for (let column = 0; column < 32; column += 1) {
            assert.equal(candidate.authoringRows[column],
                candidate.rows[column * V10_AUTHORING_EXPANSION + V10_AUTHORING_EXPANSION / 2]);
        }
        assert.equal(createHash('sha256').update(candidate.ascii).digest('hex'), ASCII_HASHES[profileId]);
        assert.ok(candidate.ascii.startsWith(`${profileId}@${V10_PROCEDURAL_RECIPE_REVISION}`));
        if (recipe.transform === 'mirror') {
            assert.deepEqual(candidate.rows, [...candidate.rows].reverse(), `${profileId}: mirrored surface`);
        }

        const packed = packV10SurfaceRows(candidate.rows);
        for (let x = 0; x < packed.width; x += 1) for (let y = 0; y < packed.height; y += 1) {
            assert.equal(terrainSolid(packed, x, y), y >= candidate.rows[x], `${profileId} ${x}/${y}`);
        }
    }
});

test('V10F compiler covers every operation at its minimum and maximum bounds', () => {
    const limits = V10_PROCEDURAL_OPERATION_LIMITS;
    const plateauWidths = new Set(V10_PROCEDURAL_TERRAIN_PROFILE_IDS.flatMap(profileId =>
        V10_PROCEDURAL_TERRAIN_RECIPES[profileId].segments
            .filter(item => item.kind === 'plateau')
            .map(item => item.width)));
    const cases: V10ProceduralTerrainOperation[] = [
        { kind: 'ramp', start: 0, width: limits.ramp.minimumWidth, delta: -limits.ramp.minimumDelta },
        { kind: 'ramp', start: 0, width: limits.ramp.maximumWidth, delta: limits.ramp.maximumDelta },
        { kind: 'hollow', start: 0, width: limits.hollow.minimumWidth, depth: limits.hollow.minimumDepth },
        { kind: 'hollow', start: 0, width: limits.hollow.maximumWidth, depth: limits.hollow.maximumDepth },
        { kind: 'ridge', start: 0, width: limits.ridge.minimumWidth, height: limits.ridge.minimumHeight },
        { kind: 'ridge', start: 0, width: limits.ridge.maximumWidth, height: limits.ridge.maximumHeight },
        { kind: 'jump-shelf', start: 0, width: limits['jump-shelf'].minimumWidth, rise: limits['jump-shelf'].minimumRise },
        { kind: 'jump-shelf', start: 0, width: limits['jump-shelf'].maximumWidth, rise: limits['jump-shelf'].maximumRise },
        { kind: 'notch', start: 0, width: limits.notch.minimumWidth, depth: limits.notch.minimumDepth },
        { kind: 'notch', start: 0, width: limits.notch.maximumWidth, depth: limits.notch.maximumDepth },
        { kind: 'asymmetric-elevation', start: 0, width: limits['asymmetric-elevation'].minimumWidth, delta: limits['asymmetric-elevation'].minimumDelta },
        { kind: 'asymmetric-elevation', start: 0, width: limits['asymmetric-elevation'].maximumWidth, delta: limits['asymmetric-elevation'].maximumDelta }
    ];
    for (const operation of cases) {
        const operations: V10ProceduralTerrainOperation[] = [operation];
        let start = operation.width;
        for (const width of partitionPlateaus(32 - start)) {
            operations.push({ kind: 'plateau', start, width });
            start += width;
        }
        const rows = compileV10ProceduralOperations(44, operations);
        assert.equal(rows.length, 256, `${operation.kind}/${operation.width}`);
    }
    assert.throws(() => compileV10ProceduralOperations(48, [
        { kind: 'jump-shelf', start: 0, width: 2, rise: 2 },
        ...plateausFrom(2, 30)
    ]), /rise is outside/);
    assert.deepEqual(plateauWidths, new Set([3, 4, 5]));
});

test('V10F emits exactly eight deterministic candidates and seed-reflects only the asymmetric family', () => {
    const seen = new Set<string>();
    const asymmetricReflections = new Set<boolean>();
    for (let seed = 1; seed <= 64; seed += 1) {
        const candidates = generateV10ProceduralSurfaceCandidates(seed);
        assert.equal(candidates.length, V10_PROCEDURAL_CANDIDATE_COUNT);
        assert.deepEqual(candidates.map(item => item.candidateIndex), [0, 1, 2, 3, 4, 5, 6, 7]);
        assert.deepEqual(generateV10ProceduralSurfaceCandidates(seed), candidates);
        const profileId = v10ProceduralTerrainProfileForSeed(seed);
        assert.ok(candidates.every(item => item.profileId === profileId));
        if (profileId === 'asymmetric-rampart') {
            asymmetricReflections.add(candidates[0].reflected);
            assert.ok(candidates.every(item => item.reflected === candidates[0].reflected));
        } else {
            assert.ok(candidates.every(item => !item.reflected));
        }
        for (const item of candidates) seen.add(item.rows.join(','));
    }
    assert.deepEqual(asymmetricReflections, new Set([false, true]));
    assert.ok(seen.size >= 128, 'tagged parameters should retain broad deterministic variety');
});

test('V10F admission checks both sides, ranks deterministically, and uses candidate zero only if all fail', () => {
    const selectedIndices = new Set<number>();
    const seenProfiles = new Set<string>();
    for (let seed = 1; seed <= 64; seed += 1) {
        const first = selectV10ProceduralSurface(seed);
        const repeated = selectV10ProceduralSurface(seed);
        assert.deepEqual(repeated, first, `${seed}: deterministic selection`);
        assert.equal(first.evaluations.length, 8);
        assert.ok(first.admittedCandidates > 0, `${seed}: admitted candidate`);
        assert.equal(first.selected.admitted, true);
        assert.equal(first.fallbackUsed, false);
        assert.ok(first.selected.shallowCover.every(Boolean));
        assert.ok(first.selected.legalPreflightOptions.every(count => count > 0));
        assert.ok(first.selected.localMobility.every(count => count >= 8));
        selectedIndices.add(first.selected.candidate.candidateIndex);
        seenProfiles.add(first.selected.candidate.profileId);
    }
    assert.deepEqual(seenProfiles, new Set(V10_PROCEDURAL_TERRAIN_PROFILE_IDS));
    assert.ok(selectedIndices.size >= 6, 'ranking should select multiple candidate indices');

    const evaluations = generateV10ProceduralSurfaceCandidates(4).map(evaluateV10ProceduralCandidate);
    const invalidOpening = evaluateV10ProceduralCandidate({
        ...evaluations[0].candidate,
        openingColumns: [0, 31]
    });
    assert.equal(invalidOpening.admitted, false);
    assert.ok(invalidOpening.failures.includes('left_start_margin'));
    assert.ok(invalidOpening.failures.includes('right_start_margin'));
    const rejected = evaluations.map(item => Object.freeze({
        ...item, admitted: false, failures: Object.freeze(['forced_test_failure'])
    })) as readonly V10FCandidateEvaluation[];
    const fallback = selectV10ProceduralEvaluation(rejected);
    assert.equal(fallback.fallbackUsed, true);
    assert.equal(fallback.admittedCandidates, 0);
    assert.equal(fallback.selected.candidate.candidateIndex, 0);
});

test('V10F R2 binds selected recipe authority and every required jump lands in normal simulation', () => {
    for (let seed = 1; seed <= 8; seed += 1) {
        const arena = generateV10TacticalArena(seed, V10_R2_RULESET_ID);
        const state = createSimulationV10(seed, 'wizard', V10_R2_RULESET_ID);
        assert.equal(state.rulesetId, V10_R2_RULESET_ID);
        assert.equal(state.terrainRecipeRevision, V10_PROCEDURAL_RECIPE_REVISION);
        assert.equal(state.terrainCandidateIndex, arena.candidateIndex);
        assert.equal(state.terrainProfileId, arena.profileId);
        assert.equal(SimulationStateV10Schema.safeParse(state).success, true);
        assert.ok(arena.opening.jumpPositions?.length);
        for (const position of arena.opening.jumpPositions ?? []) {
            const actor = position.takeoffX < 1024 ? 'player' : 'loomkeeper';
            const unitIndex = actor === 'player' ? 0 : 1;
            let jumpState = structuredClone(state);
            jumpState.activeActor = actor;
            const unit = jumpState.units[unitIndex];
            unit.xFp = position.takeoffX * 256;
            unit.yFp = (position.takeoffSurfaceY - 12) * 256;
            unit.vxFp = 0;
            unit.vyFp = 0;
            unit.grounded = true;
            unit.airTicks = 0;
            unit.airDrive = null;
            unit.support = supportAt(jumpState, unitIndex);
            const launched = applySimulationIntentV10(
                jumpState, actor, { type: 'jump', direction: position.direction },
                jumpState.turn, jumpState.phase, jumpState.inputEpoch
            );
            assert.equal(launched.accepted, true, `${seed}/${actor}: jump accepted`);
            jumpState = launched.state;
            for (let tick = 0; tick < 120 && !jumpState.units[unitIndex].grounded; tick += 1) {
                jumpState = advanceSimulationTicksV10(jumpState, 1).state;
            }
            assert.equal(jumpState.units[unitIndex].grounded, true, `${seed}/${actor}: landed`);
            assert.equal(surfaceWorldY(jumpState, jumpState.units[unitIndex].xFp / 256), position.landingSurfaceY);
        }
    }
});

function partitionPlateaus(total: number): number[] {
    if (total === 0) return [];
    for (let count = 1; count <= 11; count += 1) {
        if (total < count * 3 || total > count * 5) continue;
        const widths = Array<number>(count).fill(3);
        let remainder = total - count * 3;
        for (let index = 0; remainder > 0; index = (index + 1) % count) {
            if (widths[index] < 5) { widths[index] += 1; remainder -= 1; }
        }
        return widths;
    }
    throw new Error(`Cannot partition ${total} into plateau spans.`);
}

function plateausFrom(start: number, total: number): V10ProceduralTerrainOperation[] {
    const result: V10ProceduralTerrainOperation[] = [];
    for (const width of partitionPlateaus(total)) {
        result.push({ kind: 'plateau', start, width });
        start += width;
    }
    return result;
}

function supportAt(state: ReturnType<typeof createSimulationV10>, unitIndex: number): number {
    const unit = state.units[unitIndex];
    const row = (unit.yFp / 256 + 12) / state.terrain.cellSize;
    const first = Math.max(0, Math.floor((unit.xFp / 256 - 12) / state.terrain.cellSize));
    const last = Math.min(state.terrain.width - 1, Math.ceil((unit.xFp / 256 + 12) / state.terrain.cellSize) - 1);
    for (let column = first; column <= last; column += 1) {
        if (terrainSolid(state.terrain, column, row)) return row * state.terrain.width + column;
    }
    throw new Error('No support at V10F jump takeoff.');
}

function surfaceWorldY(state: ReturnType<typeof createSimulationV10>, worldX: number): number {
    const column = Math.floor(worldX / state.terrain.cellSize);
    for (let row = 0; row < state.terrain.height; row += 1) {
        if (terrainSolid(state.terrain, column, row)) return row * state.terrain.cellSize;
    }
    return state.terrain.height * state.terrain.cellSize;
}
