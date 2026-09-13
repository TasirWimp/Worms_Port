import assert from 'node:assert/strict';
import test from 'node:test';

import { createRuntimeServer } from '../../server/src/runtime';
import { SessionRegistry } from '../../server/src/session/registry';
import { practiceOnlyProfileFromEnvironment } from '../../server/src/staging-config';

test('volcanic no-wallet deployment requires production and paused rewards', () => {
    const env: NodeJS.ProcessEnv = {
        NODE_ENV: 'production',
        NIMBLE_RUNTIME_PROFILE: 'development-v10-practice',
        REWARD_PAUSED: 'true'
    };
    for (const key of ['DATABASE_URL', 'REWARD_PRIVATE_KEY_FILE', 'REWARD_RPC_URL', 'NIMIQ_NETWORK']) {
        Object.defineProperty(env, key, {
            enumerable: true,
            get: () => { throw new Error('Dormant credentials were read.'); }
        });
    }
    assert.equal(practiceOnlyProfileFromEnvironment(env), 'development-v10-practice');
    assert.throws(() => practiceOnlyProfileFromEnvironment({
        NODE_ENV: 'production',
        NIMBLE_RUNTIME_PROFILE: 'development-v10-practice',
        REWARD_PAUSED: 'false'
    }));
    assert.throws(() => practiceOnlyProfileFromEnvironment({
        NODE_ENV: 'test',
        NIMBLE_RUNTIME_PROFILE: 'development-v10-practice',
        REWARD_PAUSED: 'true'
    }));
    assert.throws(() => new SessionRegistry({ practiceV10: true, practiceV9: 'v9d-practice' }));
    assert.throws(() => new SessionRegistry({ v10PracticeOnly: true }));
    assert.throws(() => createRuntimeServer({
        sessionRegistry: { practiceV10: true, v10PracticeOnly: true },
        rewards: {} as never
    }));
});
