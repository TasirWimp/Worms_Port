import assert from 'node:assert/strict';
import test from 'node:test';

import { SimulationSnapshotSchema } from '../../shared/protocol';
import {
    createSimulation,
    LATEST_RULESET_ID,
    V4_RULESET_ID,
    V5_LAUNCH_SPEED_RULES,
    V5_RELIC_RULES,
    V5_RULESET_ID
} from '../../shared/simulation';
import { hashSimulationState } from '../../server/src/simulation/coordinator';
import { SimulationCoordinator } from '../../server/src/simulation/coordinator';
import {
    createV5BalanceReport,
    V5_MARKETING_PROFILE
} from '../../scripts/run-v5-balance-candidate';

test('V5 profile zero is explicit-only and preserves the frozen V4 starting hash', () => {
    assert.equal(LATEST_RULESET_ID, V4_RULESET_ID);
    assert.equal(V5_MARKETING_PROFILE.id, 'v5-marketing-candidate-v0');
    assert.deepEqual(V5_RELIC_RULES, {
        threadball: { craterRadius: 40, damageRadius: 64, maximumDamage: 45 },
        needlepoint: { craterRadius: 40, damageRadius: 64, maximumDamage: 30 },
        spoolburst: { craterRadius: 40, damageRadius: 64, maximumDamage: 80 }
    });
    assert.deepEqual(V5_LAUNCH_SPEED_RULES, {
        threadball: { minimumShotSpeed: 1459, maximumShotSpeed: 4864 },
        needlepoint: { minimumShotSpeed: 1536, maximumShotSpeed: 5120 },
        spoolburst: { minimumShotSpeed: 1373, maximumShotSpeed: 4576 }
    });
    assert.equal(
        hashSimulationState(createSimulation(0xC0FFEE11, 'wizard', V4_RULESET_ID)),
        'f319a603ccc9f1cce95a4affb0ab54219bf8963c620e88fc3a07de52cf496f4d'
    );
});

test('V5 has a strict version-five snapshot identity before activation', () => {
    const state = createSimulation(0xC0FFEE11, 'wizard', V5_RULESET_ID);
    assert.equal(state.rulesetId, V5_RULESET_ID);
    assert.equal(state.rulesetVersion, 5);
    assert.equal(state.formatVersion, 5);
    assert.equal(state.terrain.words.length, 576);
    assert.equal(SimulationSnapshotSchema.safeParse(state).success, true);
    assert.equal(SimulationSnapshotSchema.safeParse({
        ...state,
        rulesetId: V4_RULESET_ID
    }).success, false);
});

test('V5 replay records its explicit identity and reconstructs exactly', () => {
    const coordinator = new SimulationCoordinator();
    try {
        coordinator.create('v5-candidate', 'v5-session', 0xC0FFEE11, 'wizard', V5_RULESET_ID);
        coordinator.apply('v5-candidate', 'player', {
            type: 'select_relic', relicId: 'needlepoint'
        }, 0);
        coordinator.apply('v5-candidate', 'player', {
            type: 'aim', angleMilliDegrees: 45_000, powerPermille: 1_000
        }, 0);
        coordinator.apply('v5-candidate', 'player', { type: 'fire' }, 0);
        const replay = coordinator.replay('v5-candidate')!;
        assert.equal(replay.rulesetId, V5_RULESET_ID);
        assert.equal(
            coordinator.reconstructAndVerify(replay).stateHash,
            coordinator.get('v5-candidate')!.stateHash
        );
    } finally {
        coordinator.dispose();
    }
});

test('V5 marketing profile passes the bounded authoritative plausibility gate', () => {
    const first = createV5BalanceReport();
    const second = createV5BalanceReport();
    assert.deepEqual(second, first);
    assert.equal(first.pass, true, JSON.stringify(first, null, 2));
});
