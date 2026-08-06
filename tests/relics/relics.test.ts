import assert from 'node:assert/strict';
import test from 'node:test';

import {
    advanceSimulationTicks,
    applySimulationCommand,
    canonicalSimulationJson,
    createLatestSimulation,
    createSimulation,
    DIRECT_PROJECTILE_HITBOXES,
    deformTerrain,
    LEGACY_RULESET_ID,
    LATEST_RULESET_ID,
    RELIC_IDS,
    RELIC_RULES,
    SIM_RULES,
    V2_RULESET_ID,
    type RelicId,
    type SimulationActor,
    type SimulationState
} from '../../shared/simulation';
import { SimulationSnapshotSchema } from '../../shared/protocol';
import {
    hashSimulationState,
    SimulationCoordinator
} from '../../server/src/simulation/coordinator';

const SEEDS = [
    0x00000001,
    0x6D2B79F5,
    0xC0FFEE11,
    0xDEADBEEF,
    0xFFFFFFFF,
    0x13579BDF,
    0x2468ACE0
];

function fire(
    source: SimulationState,
    actor: SimulationActor,
    relicId: RelicId,
    angleMilliDegrees = 45_000,
    powerPermille = 1_000
) {
    let state = applySimulationCommand(source, actor, {
        type: 'select_relic', relicId
    }, source.turn).state;
    state = applySimulationCommand(state, actor, {
        type: 'aim', angleMilliDegrees, powerPermille
    }, source.turn).state;
    return applySimulationCommand(state, actor, { type: 'fire' }, source.turn);
}

function solidCells(state: SimulationState): number {
    return state.terrain.words.reduce((total, word) => total + populationCount(word), 0);
}

function populationCount(input: number): number {
    let value = input >>> 0;
    value -= (value >>> 1) & 0x55555555;
    value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
    return (((value + (value >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
}

test('v3 defaults new challenges while preserving the v2 Relic constants and strict snapshot identity', () => {
    assert.deepEqual(RELIC_IDS, ['threadball', 'needlepoint', 'spoolburst']);
    assert.deepEqual(RELIC_RULES, {
        threadball: { craterRadius: 40, damageRadius: 64, maximumDamage: 70 },
        needlepoint: { craterRadius: 16, damageRadius: 32, maximumDamage: 120 },
        spoolburst: { craterRadius: 64, damageRadius: 88, maximumDamage: 45 }
    });
    const state = createLatestSimulation(1, 'wizard');
    assert.equal(state.formatVersion, 3);
    assert.equal(state.rulesetId, LATEST_RULESET_ID);
    assert.equal(state.rulesetVersion, 3);
    assert.deepEqual(DIRECT_PROJECTILE_HITBOXES[LATEST_RULESET_ID], {
        halfWidth: 32,
        top: 85,
        bottom: 13
    });
    assert.equal(SimulationSnapshotSchema.safeParse(state).success, true);
    assert.equal(SimulationSnapshotSchema.safeParse({
        ...state, rulesetId: LEGACY_RULESET_ID
    }).success, false);
});

test('v3 registers a visible upper-body direct hit without changing the v2 result', () => {
    const fireAtVisibleUpperBody = (rulesetId: typeof V2_RULESET_ID | typeof LATEST_RULESET_ID) => {
        const state = createSimulation(0xC0FFEE11, 'wizard', rulesetId);
        state.units[1].x = 528;
        state.units[1].y = 257;
        return fire(state, 'player', 'threadball');
    };

    const v2 = fireAtVisibleUpperBody(V2_RULESET_ID);
    const v3 = fireAtVisibleUpperBody(LATEST_RULESET_ID);
    assert.notEqual(v2.state.lastProjectile?.impact, 'loomkeeper');
    assert.equal(v2.state.units[1].stitching, 100);
    assert.equal(v3.state.lastProjectile?.impact, 'loomkeeper');
    assert.equal(v3.state.units[1].stitching, 30);
});

test('v1 hashes and Threadball behavior remain compatible and reject v2 Relics', () => {
    const legacy = createSimulation(0xC0FFEE11, 'wizard');
    assert.equal(legacy.rulesetId, LEGACY_RULESET_ID);
    assert.equal(
        hashSimulationState(legacy),
        'fc1d6bb92a1f61b4209eb4a944a564c5d755ec4039762827b009dc69f31de365'
    );
    for (const relicId of ['needlepoint', 'spoolburst'] as const) {
        const before = canonicalSimulationJson(legacy);
        const rejected = applySimulationCommand(legacy, 'player', {
            type: 'select_relic', relicId
        }, 0);
        assert.equal(rejected.accepted, false);
        assert.equal(canonicalSimulationJson(rejected.state), before);
    }
    const fired = fire(legacy, 'player', 'threadball');
    assert.equal(fired.state.lastProjectile?.relicId, undefined);
    assert.equal(SimulationSnapshotSchema.safeParse(fired.state).success, true);
});

test('Needlepoint rewards direct precision while Spoolburst removes the most terrain', () => {
    const directDamage = new Map<RelicId, number>();
    for (const relicId of RELIC_IDS) {
        const state = createSimulation(0xC0FFEE11, 'wizard', V2_RULESET_ID);
        state.units[1].x = 814;
        state.units[1].y = 304;
        const result = fire(state, 'player', relicId);
        directDamage.set(relicId, 100 - result.state.units[1].stitching);
        assert.equal(result.state.lastProjectile?.relicId, relicId);
        assert.equal(result.state.lastProjectile?.impact, 'loomkeeper');
    }
    assert.equal(directDamage.get('needlepoint')! > directDamage.get('threadball')!, true);
    assert.equal(directDamage.get('threadball')! > directDamage.get('spoolburst')!, true);

    const remainingTerrain = new Map<RelicId, number>();
    for (const relicId of RELIC_IDS) {
        const result = fire(createLatestSimulation(0xC0FFEE11, 'wizard'), 'player', relicId);
        remainingTerrain.set(relicId, solidCells(result.state));
    }
    assert.equal(remainingTerrain.get('spoolburst')! < remainingTerrain.get('threadball')!, true);
    assert.equal(remainingTerrain.get('threadball')! < remainingTerrain.get('needlepoint')!, true);
});

test('player and Loomkeeper have identical legal selection and effect rules', () => {
    for (const relicId of RELIC_IDS) {
        const playerState = createLatestSimulation(0x13579BDF, 'wizard');
        const loomkeeperState = advanceSimulationTicks(
            createLatestSimulation(0x13579BDF, 'wizard'),
            900
        ).state;
        for (const [actor, state] of [
            ['player', playerState],
            ['loomkeeper', loomkeeperState]
        ] as const) {
            const selected = applySimulationCommand(state, actor, {
                type: 'select_relic', relicId
            }, state.turn);
            assert.equal(selected.accepted, true, `${actor}/${relicId}`);
            assert.equal(selected.state.selectedRelic, relicId);
            const result = fire(state, actor, relicId, 35_000, 700);
            assert.equal(result.accepted, true, `${actor}/${relicId}`);
            assert.equal(result.state.lastProjectile?.relicId, relicId);
            assert.equal(result.state.activeActor, actor === 'player' ? 'loomkeeper' : 'player');
        }
    }
});

test('all Relics are deterministic and bounded over the evidence seed corpus', () => {
    for (const seed of SEEDS) {
        for (const relicId of RELIC_IDS) {
            const source = createLatestSimulation(seed, 'thief');
            const before = canonicalSimulationJson(source);
            const first = fire(source, 'player', relicId, 55_000, 650);
            const second = fire(JSON.parse(JSON.stringify(source)), 'player', relicId, 55_000, 650);
            assert.deepEqual(second, first, `${seed.toString(16)}/${relicId}`);
            assert.equal(canonicalSimulationJson(source), before);
            assert.equal(first.state.lastProjectile!.flightTicks <= 300, true);
            assert.equal(first.state.lastProjectile!.trace.length <= 41, true);
            assert.equal(first.state.units.every(
                (unit) => unit.stitching >= 0 && unit.stitching <= 100
            ), true);
        }
    }
});

test('every Relic crater radius clips safely and remains idempotent at world edges', () => {
    for (const relicId of RELIC_IDS) {
        for (const [x, y] of [[0, 0], [1023, 0], [0, 575], [1023, 575]] as const) {
            const state = createLatestSimulation(1, 'wizard');
            deformTerrain(state.terrain, x, y, RELIC_RULES[relicId].craterRadius);
            const once = [...state.terrain.words];
            deformTerrain(state.terrain, x, y, RELIC_RULES[relicId].craterRadius);
            assert.deepEqual(state.terrain.words, once, `${relicId}/${x},${y}`);
            assert.equal(state.terrain.words.length, 288);
            assert.equal(state.terrain.words.every(
                (word) => Number.isSafeInteger(word) && word >= 0 && word <= 0xFFFFFFFF
            ), true);
        }
    }
});

test('replays carry v3 by default, preserve explicit v2, and reconstruct legacy records as v1', () => {
    const current = new SimulationCoordinator();
    try {
        const created = current.create('v3-challenge', 'v3-session', 1, 'wizard');
        current.apply('v3-challenge', 'player', {
            type: 'select_relic', relicId: 'spoolburst'
        }, 0);
        const replay = current.replay('v3-challenge')!;
        assert.equal(replay.rulesetId, LATEST_RULESET_ID);
        assert.equal(current.reconstructAndVerify(replay).stateHash, current.get('v3-challenge')!.stateHash);
        assert.equal(created.state.rulesetId, LATEST_RULESET_ID);

        const v2 = current.create('v2-challenge', 'v2-session', 2, 'wizard', V2_RULESET_ID);
        const v2Replay = current.replay('v2-challenge')!;
        assert.equal(v2Replay.rulesetId, V2_RULESET_ID);
        assert.equal(current.reconstructAndVerify(v2Replay).stateHash, v2.stateHash);
    } finally {
        current.dispose();
    }

    const legacy = new SimulationCoordinator();
    try {
        legacy.create('v1-challenge', 'v1-session', 1, 'wizard', LEGACY_RULESET_ID);
        legacy.apply('v1-challenge', 'player', {
            type: 'aim', angleMilliDegrees: 30_000, powerPermille: 500
        }, 0);
        const replay = structuredClone(legacy.replay('v1-challenge')!);
        delete replay.rulesetId;
        assert.equal(
            legacy.reconstructAndVerify(replay).stateHash,
            legacy.get('v1-challenge')!.stateHash
        );
    } finally {
        legacy.dispose();
    }
});

test('v2 turn-limit draw golden reconstructs exactly', () => {
    const coordinator = new SimulationCoordinator();
    try {
        coordinator.create('draw-v2', 'draw-session', 0xC0FFEE11, 'wizard', V2_RULESET_ID);
        const terminal = coordinator.advance(
            'draw-v2',
            SIM_RULES.turnTicks * SIM_RULES.maximumTurns
        );
        assert.equal(terminal.state.winner, 'draw');
        assert.equal(terminal.state.tick, 14_400);
        assert.equal(
            terminal.stateHash,
            '58d9fe4726717826891154d56fbb76781c2222aa0e62bd225f3d0df41642caa1'
        );
        const replay = coordinator.replay('draw-v2')!;
        assert.equal(replay.records.length, 1);
        assert.equal(coordinator.reconstructAndVerify(replay).stateHash, terminal.stateHash);
    } finally {
        coordinator.dispose();
    }
});
