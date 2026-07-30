import assert from 'node:assert/strict';
import test from 'node:test';

import { rewardConfigFromEnvironment } from '../../server/src/reward/config';

test('rewards default disabled without requiring payout secrets', () => {
    const config = rewardConfigFromEnvironment({
        REWARD_PRIVATE_KEY_FILE: 'Z:\\definitely-missing\\reward-key'
    });
    assert.equal(config.mode, 'disabled');
    assert.equal(config.privateKeyFile, 'Z:\\definitely-missing\\reward-key');
    assert.equal(config.network, 'test-albatross');
    assert.equal(config.rewardLuna, 100_000n);
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
