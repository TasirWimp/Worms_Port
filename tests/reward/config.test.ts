import assert from 'node:assert/strict';
import test from 'node:test';

import {
    assertRewardQualityTestEnvironment,
    rewardConfigFromEnvironment
} from '../../server/src/reward/config';

test('rewards default disabled without requiring payout secrets', () => {
    const config = rewardConfigFromEnvironment({
        REWARD_PRIVATE_KEY_FILE: 'Z:\\definitely-missing\\reward-key'
    });
    assert.equal(config.mode, 'disabled');
    assert.equal(config.privateKeyFile, 'Z:\\definitely-missing\\reward-key');
    assert.equal(config.network, 'test-albatross');
    assert.equal(config.rewardLuna, 100_000n);
    assert.equal(config.peiRequired, false);
});

test('PEI admission is explicit and defaults fail-open only for existing Daily behavior', () => {
    assert.equal(rewardConfigFromEnvironment({ PEI_ENABLED: 'true' }).peiRequired, true);
    assert.equal(rewardConfigFromEnvironment({ PEI_ENABLED: 'false' }).peiRequired, false);
    assert.throws(
        () => rewardConfigFromEnvironment({ PEI_ENABLED: 'yes' }),
        /PEI_ENABLED must be true or false/
    );
});

test('money values are integer Luna and the pinned ruleset fixes the turn limit', () => {
    assert.throws(
        () => rewardConfigFromEnvironment({ REWARD_LUNA: '0.5' }),
        /positive integer Luna/
    );
    assert.throws(
        () => rewardConfigFromEnvironment({ REWARD_TURN_LIMIT: '15' }),
        /must be 16/
    );
    assert.throws(
        () => rewardConfigFromEnvironment({
            REWARD_LUNA: '200',
            REWARD_DAILY_BUDGET_LUNA: '100'
        }),
        /cover at least one/
    );
});

test('chain modes fail closed and mainnet requires an explicit acknowledgement', () => {
    assert.throws(
        () => rewardConfigFromEnvironment({ REWARD_MODE: 'testnet' }),
        /require REWARD_EXPECTED_SIGNER_ADDRESS/
    );
    assert.throws(
        () => rewardConfigFromEnvironment({
            REWARD_MODE: 'mainnet',
            REWARD_NETWORK: 'main-albatross',
            REWARD_EXPECTED_SIGNER_ADDRESS:
                'NQ46 KLJE 5TMF 4Y1A 1255 CJHJ YG1S H0NU T604',
            REWARD_PRIVATE_KEY_FILE: '/run/secrets/reward-key',
            REWARD_RPC_URL: 'https://rpc.example.test'
        }),
        /I_UNDERSTAND_MAINNET_PAYOUTS/
    );
});

test('repeat-attempt testing is wallet-scoped, bounded, and separately acknowledged on mainnet', () => {
    const wallet = 'NQ46 KLJE 5TMF 4Y1A 1255 CJHJ YG1S H0NU T604';
    assert.throws(
        () => rewardConfigFromEnvironment({
            REWARD_TEST_DAILY_ATTEMPT_LIMIT: '2'
        }),
        /must be set together/
    );
    assert.throws(
        () => rewardConfigFromEnvironment({
            REWARD_TEST_WALLET_ADDRESS: wallet,
            REWARD_TEST_DAILY_ATTEMPT_LIMIT: '6'
        }),
        /between 2 and 5/
    );
    const mainnet = {
        REWARD_MODE: 'mainnet',
        REWARD_NETWORK: 'main-albatross',
        REWARD_EXPECTED_SIGNER_ADDRESS: wallet,
        REWARD_PRIVATE_KEY_FILE: '/run/secrets/reward-key',
        REWARD_RPC_URL: 'https://rpc.example.test',
        REWARD_MAINNET_ACKNOWLEDGEMENT: 'I_UNDERSTAND_MAINNET_PAYOUTS',
        REWARD_TEST_WALLET_ADDRESS: wallet,
        REWARD_TEST_DAILY_ATTEMPT_LIMIT: '2'
    };
    assert.throws(
        () => rewardConfigFromEnvironment(mainnet),
        /I_UNDERSTAND_REPEAT_MAINNET_REWARDS/
    );
    const config = rewardConfigFromEnvironment({
        ...mainnet,
        REWARD_TEST_REPEAT_ACKNOWLEDGEMENT: 'I_UNDERSTAND_REPEAT_MAINNET_REWARDS'
    });
    assert.equal(config.testWalletAddress, wallet);
    assert.equal(config.testDailyAttemptLimit, 2);
});

test('reward wallet settings normalize compact addresses and identify invalid variables', () => {
    const config = rewardConfigFromEnvironment({
        REWARD_TEST_WALLET_ADDRESS: 'NQ3461R8YJUAKLDJ4VVLE22VT7KEATA3A1HY',
        REWARD_TEST_DAILY_ATTEMPT_LIMIT: '2'
    });
    assert.equal(
        config.testWalletAddress,
        'NQ34 61R8 YJUA KLDJ 4VVL E22V T7KE ATA3 A1HY'
    );
    assert.throws(
        () => rewardConfigFromEnvironment({
            REWARD_TEST_WALLET_ADDRESS: 'not-an-address',
            REWARD_TEST_DAILY_ATTEMPT_LIMIT: '2'
        }),
        /REWARD_TEST_WALLET_ADDRESS must be a valid compact or spaced Nimiq address/
    );
});

test('quality-test mode permits only memory or loopback disposable record-only authority', () => {
    assert.doesNotThrow(() => assertRewardQualityTestEnvironment({
        WP014_QUALITY_TEST: 'true',
        REWARD_MODE: 'record-only',
        REWARD_TEST_MEMORY_STORE: 'true'
    }));
    assert.doesNotThrow(() => assertRewardQualityTestEnvironment({
        WP014_QUALITY_TEST: 'true',
        REWARD_MODE: 'record-only',
        DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/nimble_knots_wp014_browser_01'
    }));
    assert.throws(() => assertRewardQualityTestEnvironment({
        WP014_QUALITY_TEST: 'true',
        REWARD_MODE: 'mainnet'
    }), /refuse chain reward modes/);
    assert.throws(() => assertRewardQualityTestEnvironment({
        WP014_QUALITY_TEST: 'true',
        REWARD_MODE: 'record-only',
        REWARD_PRIVATE_KEY_FILE: '/run/secrets/reward-key',
        REWARD_TEST_MEMORY_STORE: 'true'
    }), /refuse payout authority: REWARD_PRIVATE_KEY_FILE/);
    assert.throws(() => assertRewardQualityTestEnvironment({
        WP014_QUALITY_TEST: 'true',
        REWARD_MODE: 'record-only',
        REWARD_TEST_MEMORY_STORE: 'true',
        REWARD_TEST_WALLET_ADDRESS: 'NQ46 KLJE 5TMF 4Y1A 1255 CJHJ YG1S H0NU T604'
    }), /refuse payout authority: REWARD_TEST_WALLET_ADDRESS/);
    assert.throws(() => assertRewardQualityTestEnvironment({
        WP014_QUALITY_TEST: 'true',
        REWARD_MODE: 'record-only',
        DATABASE_URL: 'postgresql://test:test@database.example/nimble_knots_wp014_external'
    }), /require a loopback PostgreSQL URL/);
    assert.throws(() => assertRewardQualityTestEnvironment({
        WP014_QUALITY_TEST: 'true',
        REWARD_MODE: 'record-only'
    }), /require an explicit memory or disposable PostgreSQL store/);
});
