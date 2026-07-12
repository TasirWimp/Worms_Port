import assert from 'node:assert/strict';
import test from 'node:test';

import {
    assertSimulationInvariants,
    canonicalSimulationJson,
    cloneSimulation,
    createSimulation,
    deformTerrain,
    setTerrainSolid,
    terrainSolid
} from '../../shared/simulation';
import { hashSimulationState } from '../../server/src/simulation/coordinator';

const CASES = [
    [0x00000001, 3412600852, '327420a743f313a751fd4fe9bb3d66421f74a44766e143c6298756a7483ee179'],
    [0x6D2B79F5, 1518213276, 'ab460c87822f7367c2e7b0c3c602543e641ccee35efd05416c374abfcae994b3'],
    [0xC0FFEE11, 3807197890, 'fc1d6bb92a1f61b4209eb4a944a564c5d755ec4039762827b009dc69f31de365'],
    [0xDEADBEEF, 1383315948, 'ab20bf9b9471bd7d54924267569885deb9cc38d11ae10d4463b7d5c83c71df08'],
    [0xFFFFFFFF, 706285398, '2d9746d679077fc159429a40c2bbf7af5ac0658c179d1f01a779b00f7b2e747f'],
    [0x13579BDF, 1457923832, 'f3d520295e9a3344e811849bdde503f4c6931ffdc129722a38919b95dde0eb1a'],
    [0x2468ACE0, 3224150152, '01c43252b2fbf130e87e4b28e6ded23e3821c5509323e67ac593ba681585253b']
] as const;

test('fixed seeds freeze terrain RNG cursors and initial state hashes', () => {
    const hashes = new Set<string>();
    for (const [seed, rngState, expectedHash] of CASES) {
        const first = createSimulation(seed, 'wizard');
        const second = createSimulation(seed, 'wizard');
        assert.deepEqual(second, first, `seed=0x${seed.toString(16)}`);
        assert.equal(first.rngState, rngState, `seed=0x${seed.toString(16)}`);
        assert.equal(hashSimulationState(first), expectedHash, `seed=0x${seed.toString(16)}`);
        hashes.add(expectedHash);
    }
    assert.equal(hashes.size, CASES.length);
});

test('zero seed is normalized away from the xorshift absorbing state', () => {
    const state = createSimulation(0, 'thief');
    assert.equal(state.seed, 0x6D2B79F5);
    assert.notEqual(state.rngState, 0);
    assert.deepEqual(state, createSimulation(0x6D2B79F5, 'thief'));
});

test('canonical JSON and hashes are stable across reconstruction and key order', () => {
    const original = createSimulation(0xC0FFEE11, 'warrior');
    const reconstructed = JSON.parse(JSON.stringify(original));
    const reverseOrdered = Object.fromEntries(Object.entries(reconstructed).reverse());
    assert.equal(canonicalSimulationJson(reconstructed), canonicalSimulationJson(reverseOrdered as typeof original));
    assert.equal(hashSimulationState(reconstructed), hashSimulationState(original));

    reconstructed.units[0].x += 1;
    assert.notEqual(hashSimulationState(reconstructed), hashSimulationState(original));
    assertSimulationInvariants(original);
});

test('clones detach every nested authoritative collection', () => {
    const original = createSimulation(0xDEADBEEF, 'wizard');
    const clone = cloneSimulation(original);
    clone.units[0].x += 8;
    clone.terrain.words[0] ^= 1;
    clone.aim = { angleMilliDegrees: 1, powerPermille: 1 };
    assert.notDeepEqual(clone, original);
    assert.notEqual(clone.units[0].x, original.units[0].x);
    assert.notEqual(clone.terrain.words[0], original.terrain.words[0]);
    assert.equal(original.aim, null);
});

test('terrain deformation is clipped, binary, and idempotent at every edge', () => {
    const centers = [
        [0, 0], [1023, 0], [0, 575], [1023, 575], [512, 288]
    ] as const;
    for (const [x, y] of centers) {
        const state = createSimulation(0x13579BDF, 'wizard');
        const beforeLength = state.terrain.words.length;
        deformTerrain(state.terrain, x, y, 40);
        const once = [...state.terrain.words];
        deformTerrain(state.terrain, x, y, 40);
        assert.deepEqual(state.terrain.words, once, `center=${x},${y}`);
        assert.equal(state.terrain.words.length, beforeLength);
        for (const word of state.terrain.words) {
            assert.equal(Number.isSafeInteger(word), true);
            assert.equal(word >= 0 && word <= 0xFFFFFFFF, true);
        }
    }
});

test('a center crater removes exactly the cells whose centers are within its radius', () => {
    const state = createSimulation(1, 'wizard');
    state.terrain.words.fill(0xFFFFFFFF);
    const centerX = 512;
    const centerY = 288;
    const radius = 40;
    deformTerrain(state.terrain, centerX, centerY, radius);
    let removed = 0;
    for (let y = 0; y < state.terrain.height; y += 1) {
        for (let x = 0; x < state.terrain.width; x += 1) {
            const dx = x * state.terrain.cellSize + 4 - centerX;
            const dy = y * state.terrain.cellSize + 4 - centerY;
            const expectedSolid = dx * dx + dy * dy > radius * radius;
            assert.equal(terrainSolid(state.terrain, x, y), expectedSolid, `cell=${x},${y}`);
            if (!expectedSolid) removed += 1;
        }
    }
    assert.equal(removed, 80);
});

test('terrain setters ignore out-of-bounds writes and preserve valid cells', () => {
    const terrain = createSimulation(1, 'wizard').terrain;
    const before = [...terrain.words];
    for (const [x, y] of [[-1, 0], [0, -1], [128, 0], [0, 72]]) {
        setTerrainSolid(terrain, x, y, true);
    }
    assert.deepEqual(terrain.words, before);
});
