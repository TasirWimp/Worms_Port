const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const net = require('node:net');
const path = require('node:path');
const { Client } = require('pg');

const root = path.resolve(__dirname, '..');

async function main() {
  assertSafeEnvironment(process.env);
  const adminUrl = process.env.WP014_TEST_DATABASE_URL.trim();
  const databaseName = `nimble_knots_wp014_browser_${crypto.randomBytes(4).toString('hex')}`;
  const admin = new Client({
    connectionString: adminUrl,
    application_name: 'nimble-knots-wp014d-browser-runner'
  });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${quotedIdentifier(databaseName)}`);
    const databaseUrl = databaseUrlFor(adminUrl, databaseName);
    const port = await getFreePort();
    const cli = require.resolve('@playwright/test/cli');
    const result = childProcess.spawnSync(
      process.execPath,
      [cli, 'test', '--config=playwright.postgres.config.ts'],
      {
        cwd: root,
        env: {
          ...process.env,
          PLAYWRIGHT_PORT: String(port),
          PLAYWRIGHT_REUSE_BUILD: 'true',
          WP014_QUALITY_TEST: 'true',
          WP014_POSTGRES_BROWSER: 'true',
          DATABASE_URL: databaseUrl,
          REWARD_MODE: 'record-only',
          REWARD_PAUSED: 'false',
          REWARD_TEST_MEMORY_STORE: 'false',
          REWARD_TEST_SEED: '1',
          REWARD_LUNA: '100000',
          REWARD_DAILY_BUDGET_LUNA: '400000'
        },
        stdio: 'inherit'
      }
    );
    if (result.error) throw result.error;
    if (result.signal) throw new Error(`PostgreSQL browser test stopped by ${result.signal}.`);
    if (result.status !== 0) {
      throw new Error(`PostgreSQL browser test exited with ${result.status}.`);
    }
    await assertDurableBrowserResult(databaseUrl);
  } finally {
    await admin.query(
      `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [databaseName]
    ).catch(() => undefined);
    await admin.query(`DROP DATABASE IF EXISTS ${quotedIdentifier(databaseName)}`)
      .catch(() => undefined);
    await admin.end();
  }
}

async function assertDurableBrowserResult(databaseUrl) {
  const client = new Client({
    connectionString: databaseUrl,
    application_name: 'nimble-knots-wp014d-browser-assertion'
  });
  await client.connect();
  try {
    const ledger = await client.query(
      `SELECT state, attempt_consumed, final_state_hash IS NOT NULL AS has_hash,
              replay IS NOT NULL AS has_replay
         FROM reward_entitlements`
    );
    if (ledger.rows.length !== 1 || ledger.rows[0].state !== 'lost' ||
        ledger.rows[0].attempt_consumed !== true || ledger.rows[0].has_hash !== true ||
        ledger.rows[0].has_replay !== true) {
      throw new Error('The PostgreSQL browser journey did not persist one consumed authoritative loss.');
    }
    const events = await client.query(
      `SELECT array_agg(next_state ORDER BY event_id) AS states FROM reward_events`
    );
    const states = events.rows[0]?.states;
    if (!Array.isArray(states) || states.join(',') !== 'reserved,in_progress,lost') {
      throw new Error('The PostgreSQL browser journey persisted an unexpected transition history.');
    }
    console.log('PostgreSQL browser ledger verified: one consumed authoritative loss.');
  } finally {
    await client.end();
  }
}

function assertSafeEnvironment(environment) {
  const adminUrl = environment.WP014_TEST_DATABASE_URL?.trim();
  if (!adminUrl) {
    throw new Error('WP014_TEST_DATABASE_URL is required for the PostgreSQL browser gate.');
  }
  const url = new URL(adminUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error('WP014_TEST_DATABASE_URL must target disposable loopback PostgreSQL.');
  }
  if (['testnet', 'mainnet'].includes(environment.REWARD_MODE || '')) {
    throw new Error('WP-014 PostgreSQL browser tests refuse chain reward modes.');
  }
  const blocked = [
    'REWARD_PRIVATE_KEY_FILE',
    'REWARD_RPC_URL',
    'NIMIQ_RECOVERY_WORDS',
    'REWARD_MAINNET_ACKNOWLEDGEMENT',
    'REWARD_TEST_WALLET_ADDRESS',
    'REWARD_TEST_DAILY_ATTEMPT_LIMIT',
    'REWARD_TEST_REPEAT_ACKNOWLEDGEMENT'
  ].filter((name) => typeof environment[name] === 'string' && environment[name].trim());
  if (blocked.length > 0) {
    throw new Error(`WP-014 PostgreSQL browser tests refuse payout authority: ${blocked.join(', ')}.`);
  }
}

function databaseUrlFor(adminUrl, databaseName) {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function quotedIdentifier(value) {
  if (!/^nimble_knots_wp014_[a-z0-9_]+$/.test(value)) {
    throw new Error('Generated PostgreSQL database name is unsafe.');
  }
  return `"${value}"`;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`PostgreSQL browser gate failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { assertSafeEnvironment, databaseUrlFor, quotedIdentifier };
