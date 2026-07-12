import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import test from 'node:test';

import {
    applySimulationCommand,
    assertSimulationInvariants,
    canonicalSimulationJson,
    cloneSimulation,
    createSimulation,
    deformTerrain,
    type SimulationActor,
    type SimulationCommand,
    type SimulationState
} from '../../shared/simulation';
import { hashSimulationState, SimulationCoordinator } from '../../server/src/simulation/coordinator';

type GoldenFixture = {
    seed: number;
    calling: 'wizard' | 'thief' | 'warrior';
    initialHash: string;
    commands: Array<{
        actor: SimulationActor;
        expectedTurn: number;
        command: SimulationCommand;
        stateHash: string;
    }>;
    final: { winner: SimulationActor | 'draw'; tick: number; stateHash: string };
};

const fixture = JSON.parse(readFileSync(
    new URL('./fixtures/direct-hit-v1.json', import.meta.url),
    'utf8'
)) as GoldenFixture;

const PROPERTY_SEEDS = [
    0x00000001, 0x6D2B79F5, 0xC0FFEE11, 0xDEADBEEF,
    0xFFFFFFFF, 0x13579BDF, 0x2468ACE0
];

test('golden replay freezes every command checkpoint through deterministic victory', () => {
    let state = createSimulation(fixture.seed, fixture.calling);
    assert.equal(hashSimulationState(state), fixture.initialHash);
    for (const [index, step] of fixture.commands.entries()) {
        const result = applySimulationCommand(
            state, step.actor, step.command, step.expectedTurn
        );
        assert.equal(result.accepted, true, `golden command index=${index}`);
        state = result.state;
        assert.equal(hashSimulationState(state), step.stateHash, `golden command index=${index}`);
    }
    assert.equal(state.phase, 'finished');
    assert.equal(state.winner, fixture.final.winner);
    assert.equal(state.tick, fixture.final.tick);
    assert.equal(hashSimulationState(state), fixture.final.stateHash);
});

test('property traces repeat and survive JSON reconstruction for every evidence seed', () => {
    for (const seed of PROPERTY_SEEDS) {
        const first = propertyTrace(seed);
        const second = propertyTrace(seed);
        assert.deepEqual(second.hashes, first.hashes, `seed=0x${seed.toString(16)}`);
        assert.deepEqual(second.state, first.state, `seed=0x${seed.toString(16)}`);

        const restored = JSON.parse(canonicalSimulationJson(first.state)) as SimulationState;
        assertSimulationInvariants(restored);
        assert.equal(hashSimulationState(restored), hashSimulationState(first.state));
    }
});

test('seeded crater properties preserve dimensions, integer words, and idempotency', () => {
    for (const seed of PROPERTY_SEEDS) {
        let random = seed || 1;
        const state = createSimulation(seed, 'wizard');
        const expectedWords = state.terrain.words.length;
        for (let caseIndex = 0; caseIndex < 64; caseIndex += 1) {
            random = lcg(random);
            const x = Number(random % 1280) - 128;
            random = lcg(random);
            const y = Number(random % 768) - 96;
            random = lcg(random);
            const radius = Number(random % 65);
            deformTerrain(state.terrain, x, y, radius);
            const once = [...state.terrain.words];
            deformTerrain(state.terrain, x, y, radius);
            assert.deepEqual(state.terrain.words, once,
                `seed=0x${seed.toString(16)} case=${caseIndex} crater=${x},${y},${radius}`);
            assert.equal(state.terrain.words.length, expectedWords);
            assert.equal(state.terrain.words.every(Number.isSafeInteger), true);
        }
    }
});

test('bounded simulation and hashing workload completes within five seconds', () => {
    const started = performance.now();
    let digest = '';
    for (let match = 0; match < 200; match += 1) {
        let state = createSimulation((0xC0FFEE11 + match) >>> 0, 'wizard');
        for (let turn = 0; turn < 4 && state.phase !== 'finished'; turn += 1) {
            const actor = state.activeActor;
            state = applySimulationCommand(state, actor, {
                type: 'aim', angleMilliDegrees: 45_000, powerPermille: 1_000
            }, state.turn).state;
            state = applySimulationCommand(state, actor, { type: 'fire' }, state.turn).state;
        }
        digest = hashSimulationState(state);
    }
    const elapsedMs = performance.now() - started;
    assert.match(digest, /^[a-f0-9]{64}$/);
    assert.equal(elapsedMs < 5_000, true, `bounded workload took ${elapsedMs.toFixed(1)} ms`);
});

test('coordinator replay record bound fails closed', () => {
    const coordinator = new SimulationCoordinator({ maxReplayRecords: 2 });
    try {
        coordinator.create('challenge_bound', 'session_bound', 1, 'wizard');
        coordinator.apply('challenge_bound', 'player', {
            type: 'aim', angleMilliDegrees: 30_000, powerPermille: 500
        }, 0);
        coordinator.apply('challenge_bound', 'player', { type: 'select_relic', relicId: 'threadball' }, 0);
        const before = coordinator.get('challenge_bound')!;
        const rejected = coordinator.apply(
            'challenge_bound', 'player', { type: 'move', direction: 0 }, 0
        );
        assert.equal(rejected.transition.accepted, false);
        assert.equal(rejected.transition.mutated, false);
        assert.equal(rejected.transition.error?.code, 'COMMAND_REJECTED');
        assert.match(rejected.transition.error!.message, /record limit/);
        assert.equal(rejected.stateHash, before.stateHash);
        assert.deepEqual(rejected.state, before.state);
        assert.equal(coordinator.replay('challenge_bound')!.records.length, 2);
    } finally {
        coordinator.dispose();
    }
});

function propertyTrace(seed: number): { state: SimulationState; hashes: string[] } {
    let random = seed || 1;
    let state = createSimulation(seed, 'wizard');
    const hashes = [hashSimulationState(state)];
    for (let index = 0; index < 24 && state.phase !== 'finished'; index += 1) {
        const actor = state.activeActor;
        random = lcg(random);
        const angleMilliDegrees = 20_000 + Number(random % 50_001);
        random = lcg(random);
        const powerPermille = 250 + Number(random % 751);
        state = applySimulationCommand(state, actor, {
            type: 'aim', angleMilliDegrees, powerPermille
        }, state.turn).state;
        assertSimulationInvariants(state);
        hashes.push(hashSimulationState(state));

        const checkpoint = JSON.parse(canonicalSimulationJson(state)) as SimulationState;
        const fired = applySimulationCommand(
            checkpoint, actor, { type: 'fire' }, checkpoint.turn
        );
        assert.equal(fired.accepted, true,
            `seed=0x${seed.toString(16)} command=${index} actor=${actor}`);
        state = cloneSimulation(fired.state);
        assertSimulationInvariants(state);
        hashes.push(hashSimulationState(state));
    }
    return { state, hashes };
}

function lcg(value: number): number {
    return (Math.imul(value, 1664525) + 1013904223) >>> 0;
}
