const assert = require('node:assert/strict');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const {
  assertSafeEnvironment,
  databaseUrlFor,
  quotedIdentifier
} = require('../../scripts/run-postgres-browser');

const LOOPBACK_ADMIN = 'postgresql://tester:password@127.0.0.1:5432/postgres';

test('daily PostgreSQL prerequisite reports omission or propagates the database gate result', () => {
  const reporter = require.resolve('../../scripts/report-postgres-quality-prerequisite');
  const missing = spawnSync(process.execPath, [reporter], {
    env: { ...process.env, WP014_TEST_DATABASE_URL: '' }, encoding: 'utf8'
  });
  assert.equal(missing.status, 0);
  assert.match(missing.stdout, /not run.*unavailable/);
  for (const status of [0, 7]) {
    const code = `
      const assert = require('node:assert/strict');
      require('node:child_process').spawnSync = (command, args) => {
        assert.equal(command, 'npm');
        assert.deepEqual(args, ['run', 'verify:postgres']);
        return { status: ${status} };
      };
      require(${JSON.stringify(reporter)});
    `;
    const result = spawnSync(process.execPath, ['-e', code], {
      env: { ...process.env, WP014_TEST_DATABASE_URL: LOOPBACK_ADMIN }, encoding: 'utf8'
    });
    assert.equal(result.status, status, result.stderr);
    assert.match(result.stdout, /running the authoritative database gate/);
  }
});

test('PostgreSQL browser gate accepts only isolated loopback record-only authority', () => {
  assert.doesNotThrow(() => assertSafeEnvironment({
    WP014_TEST_DATABASE_URL: LOOPBACK_ADMIN,
    REWARD_MODE: 'record-only'
  }));
  assert.throws(
    () => assertSafeEnvironment({ WP014_TEST_DATABASE_URL: '' }),
    /is required/
  );
  assert.throws(
    () => assertSafeEnvironment({
      WP014_TEST_DATABASE_URL: 'postgresql://tester:password@db.example/postgres'
    }),
    /disposable loopback/
  );
  assert.throws(
    () => assertSafeEnvironment({
      WP014_TEST_DATABASE_URL: LOOPBACK_ADMIN,
      REWARD_MODE: 'mainnet'
    }),
    /refuse chain reward modes/
  );
  assert.throws(
    () => assertSafeEnvironment({
      WP014_TEST_DATABASE_URL: LOOPBACK_ADMIN,
      REWARD_PRIVATE_KEY_FILE: '/run/secrets/reward-mainnet-key.hex'
    }),
    /refuse payout authority/
  );
  assert.throws(
    () => assertSafeEnvironment({
      WP014_TEST_DATABASE_URL: LOOPBACK_ADMIN,
      REWARD_TEST_DAILY_ATTEMPT_LIMIT: '2'
    }),
    /refuse payout authority/
  );
});

test('PostgreSQL browser gate builds and quotes only WP-014 database names', () => {
  assert.equal(
    databaseUrlFor(LOOPBACK_ADMIN, 'nimble_knots_wp014_browser_ab12'),
    'postgresql://tester:password@127.0.0.1:5432/nimble_knots_wp014_browser_ab12'
  );
  assert.equal(
    quotedIdentifier('nimble_knots_wp014_browser_ab12'),
    '"nimble_knots_wp014_browser_ab12"'
  );
  assert.throws(() => quotedIdentifier('postgres'), /unsafe/);
  assert.throws(() => quotedIdentifier('nimble_knots_wp014_bad; DROP DATABASE postgres'), /unsafe/);
});
