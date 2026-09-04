import assert from 'node:assert/strict';
import test from 'node:test';

import { stagingPracticeFromEnvironment } from '../../server/src/staging-config';
import { createRuntimeServer } from '../../server/src/runtime';
import { SessionRegistry, type SessionRegistryOptions } from '../../server/src/session/registry';
import { V8_R1_RULESET_ID } from '../../shared/simulation-v8';
import { V8_AUTOMATION_ID, V8_LOOMKEEPER_POLICY_ID } from '../../shared/combat-version';

const staging = {
    NODE_ENV: 'production', NIMBLE_RUNTIME_PROFILE: 'staging-v8d-practice',
    NIMBLE_DEPLOYMENT: 'staging', REWARD_MODE: 'disabled'
};
const admission = { stagingPracticeV8: 'staging-v8d-practice' as const };

test('staging requires exact explicit production-runtime opt-in; ordinary startup stays V7', () => {
    assert.equal(stagingPracticeFromEnvironment({}), false);
    assert.equal(stagingPracticeFromEnvironment({ NODE_ENV: 'production',
        NIMBLE_RUNTIME_PROFILE: 'production-v7', NIMBLE_DEPLOYMENT: 'production' }), false);
    assert.equal(stagingPracticeFromEnvironment(staging), true);
    assert.equal(stagingPracticeFromEnvironment({ ...staging,
        RENDER_EXTERNAL_URL: 'https://staging.example', ALLOWED_ORIGINS: 'https://staging.example' }), true);
    for (const overrides of [
        { NODE_ENV: 'test' }, { NODE_ENV: 'development' }, { NODE_ENV: undefined },
        { NIMBLE_RUNTIME_PROFILE: 'v8' }, { NIMBLE_RUNTIME_PROFILE: '' },
        { NIMBLE_RUNTIME_PROFILE: undefined }, { NIMBLE_DEPLOYMENT: 'production' },
        { NIMBLE_DEPLOYMENT: undefined }, { NIMBLE_DEPLOYMENT: 'unknown' },
        { REWARD_MODE: undefined }, { REWARD_MODE: '' }, { REWARD_MODE: ' disabled ' },
        { REWARD_MODE: 'record-only' }, { REWARD_MODE: 'testnet' }, { REWARD_MODE: 'mainnet' },
        { NIMBLE_RUNTIME_PROFIL: 'staging-v8d-practice' }
    ]) assert.throws(() => stagingPracticeFromEnvironment({ ...staging, ...overrides }));
    assert.throws(() => stagingPracticeFromEnvironment({ NIMBLE_DEPLOYMENT: 'staging' }));
    assert.throws(() => stagingPracticeFromEnvironment({ NIMBLE_RUNTIME_PROFILE: 'unknown' }));
    assert.throws(() => stagingPracticeFromEnvironment({ NIMBLE_RUNTIME_PROFIL: 'staging-v8d-practice' }));
    // Existing ordinary identity/reward/test configuration is not changed by this staging gate.
    assert.equal(stagingPracticeFromEnvironment({ NODE_ENV: 'test', REWARD_MODE: 'record-only',
        REWARD_TEST_MEMORY_STORE: 'true' }), false);
});

test('staging refuses wallet, store, payout authority and all test shortcuts without leaking values', () => {
    for (const name of ['DATABASE_URL', 'IDENTITY_PUBLIC_ORIGIN', 'NIMIQ_NETWORK',
        'NIMIQ_RECOVERY_WORDS', 'REWARD_PRIVATE_KEY_FILE', 'REWARD_RPC_URL',
        'REWARD_EXPECTED_SIGNER_ADDRESS', 'REWARD_NETWORK', 'REWARD_MAINNET_ACKNOWLEDGEMENT',
        'REWARD_TEST_WALLET_ADDRESS', 'REWARD_TEST_DAILY_ATTEMPT_LIMIT',
        'REWARD_TEST_REPEAT_ACKNOWLEDGEMENT', 'REWARD_TEST_MEMORY_STORE', 'REWARD_TEST_SEED',
        'REWARD_PAUSED', 'PRACTICE_TEST_SEEDS', 'PRACTICE_TEST_CLOCK', 'WP014_QUALITY_TEST',
        'ALLOW_MISSING_ORIGIN', 'SESSION_OPEN_RATE_CAPACITY']) {
        assert.throws(() => stagingPracticeFromEnvironment({ ...staging, [name]: 'secret-marker' }),
            (error: Error) => !error.message.includes('secret-marker'));
    }
});

test('staging admission refuses conflicting simulation fixtures and runtime services', () => {
    for (const override of [
        { stagingPracticeV8: 'unknown' }, { simulationRulesetId: V8_R1_RULESET_ID },
        { v8TestOnly: {} }, { now: Date.now }, { seedSource: () => 1 },
        { simulationTickIntervalMs: false }, { simulationTicksPerInterval: 30 },
        { simulationMaxReplayRecords: 512 }, { loomkeeperEnabled: false },
        { loomkeeperDifficulty: 'standard' }, { sessionTtlMs: 1000 },
        { reconnectGraceMs: 1000 }, { tokenRecoveryMs: 1000 }, { challengeTtlMs: 1000 },
        { sweepIntervalMs: 10 }
    ]) assert.throws(() => new SessionRegistry({ ...admission, ...override } as SessionRegistryOptions));
    for (const override of [{ identity: {} }, { rewards: {} }, { rewardWorker: {} },
        { allowMissingOrigin: true }, { sessionOpenRateCapacity: 100 }]) {
        assert.throws(() => createRuntimeServer({ sessionRegistry: admission, ...override } as any));
    }
});

test('staging pins full automated r1 with live clocks and refuses reward metadata; defaults retain V7', async () => {
    const normal = new SessionRegistry();
    try { assert.equal(normal.legacyCreationAvailable(), true); } finally { normal.dispose(); }
    const runtime = createRuntimeServer({ sessionRegistry: admission, identity: false });
    try {
        assert.equal(runtime.identity, undefined);
        assert.equal(runtime.rewards, undefined);
        assert.equal(runtime.sessions.legacyCreationAvailable(), false);
        const opened = runtime.sessions.create('staging-test-socket');
        assert.ok(!('code' in opened));
        const session = runtime.sessions.getBound('staging-test-socket')!;
        for (const [mode, reward] of [['reward', undefined], ['reward', { challengeId: 'reward-id', seed: 1 }],
            ['practice', { challengeId: 'reward-id', seed: 1 }]] as const) {
            const refused = runtime.sessions.createSelectedChallenge(session, mode, 'wizard', reward);
            assert.ok('code' in refused);
            assert.equal(refused.code, 'FEATURE_UNAVAILABLE');
        }
        assert.equal(session.challenges.size, 0);
        const fixture = runtime.sessions.createChallengeV8ForTest(session, 'practice', 'wizard');
        assert.ok('code' in fixture);
        assert.equal(fixture.code, 'FEATURE_UNAVAILABLE');
        const created = runtime.sessions.createSelectedChallenge(session, 'practice', 'wizard');
        assert.ok('kind' in created && created.kind === 'v8');
        assert.equal(created.snapshot.rulesetId, V8_R1_RULESET_ID);
        assert.ok('automationId' in created.snapshot);
        assert.equal(created.snapshot.automationId, V8_AUTOMATION_ID);
        assert.equal(created.snapshot.loomkeeperPolicyId, V8_LOOMKEEPER_POLICY_ID);
        assert.throws(() => runtime.sessions.advanceChallengeTicksV8ForTest(session, created.snapshot.challengeId, 1));
        assert.throws(() => runtime.sessions.applyIntentV8ForTest(session, created.snapshot.challengeId,
            { type: 'face', direction: 1 } as any));
        const tick = created.snapshot.simulation.tick;
        await new Promise(resolve => setTimeout(resolve, 180));
        const current = runtime.sessions.activeSnapshotV8(session);
        assert.ok(current && current.simulation.tick > tick, 'Real monotonic scheduler must advance staging play.');
    } finally { await runtime.close(); }
});
