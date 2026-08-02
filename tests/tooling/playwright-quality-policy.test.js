const assert = require('node:assert/strict');
const test = require('node:test');

const {
  evaluateQualityRun
} = require('../../scripts/playwright-quality-policy');
const {
  assertQualityGateEnvironment
} = require('../../scripts/run-playwright');

const policy = {
  maintainedProjects: ['phone-a', 'phone-b'],
  requiredFiles: ['smoke.spec.ts', 'scoped.spec.ts'],
  criticalTests: [{ file: 'smoke.spec.ts', title: 'critical journey' }],
  expectedProjectSkips: [{
    file: 'scoped.spec.ts',
    title: 'landscape only',
    runsOn: ['phone-b'],
    reason: 'Landscape coverage'
  }]
};

const passing = [
  { project: 'phone-a', file: 'smoke.spec.ts', title: 'critical journey', status: 'passed' },
  { project: 'phone-b', file: 'smoke.spec.ts', title: 'critical journey', status: 'passed' },
  { project: 'phone-a', file: 'scoped.spec.ts', title: 'landscape only', status: 'skipped' },
  { project: 'phone-b', file: 'scoped.spec.ts', title: 'landscape only', status: 'passed' }
];

test('quality policy accepts reviewed project routing', () => {
  assert.deepEqual(evaluateQualityRun(policy, ['phone-a', 'phone-b'], passing), []);
});

test('quality policy rejects an unexpected skip and missing project', () => {
  const records = passing.map((record) => ({ ...record }));
  records[0].status = 'skipped';
  const errors = evaluateQualityRun(policy, ['phone-a'], records);
  assert.match(errors.join('\n'), /maintained project did not run: phone-b/);
  assert.match(errors.join('\n'), /unexpected skip: phone-a/);
  assert.match(errors.join('\n'), /critical test skipped: phone-a/);
});

test('quality policy rejects a routed test outside its allowlist', () => {
  const records = passing.map((record) => ({ ...record }));
  records[2].status = 'passed';
  assert.match(
    evaluateQualityRun(policy, ['phone-a', 'phone-b'], records).join('\n'),
    /expected project exclusion ran unexpectedly: phone-a/
  );
});

test('quality runner rejects inherited chain, database, RPC, and key authority', () => {
  assert.doesNotThrow(() => assertQualityGateEnvironment({ REWARD_MODE: 'record-only' }));
  assert.throws(
    () => assertQualityGateEnvironment({ REWARD_MODE: 'mainnet' }),
    /refuse inherited chain reward modes/
  );
  for (const name of [
    'DATABASE_URL',
    'REWARD_PRIVATE_KEY_FILE',
    'REWARD_RPC_URL',
    'NIMIQ_RECOVERY_WORDS',
    'REWARD_MAINNET_ACKNOWLEDGEMENT',
    'REWARD_TEST_WALLET_ADDRESS',
    'REWARD_TEST_DAILY_ATTEMPT_LIMIT',
    'REWARD_TEST_REPEAT_ACKNOWLEDGEMENT'
  ]) {
    assert.throws(
      () => assertQualityGateEnvironment({ [name]: 'configured' }),
      new RegExp(name)
    );
  }
});
