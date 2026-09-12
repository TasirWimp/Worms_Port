import { expect, test } from '@playwright/test';

import { createTestSigner } from '../support/nimiq-signer';
import { completeCurrentClash } from '../browser/support/reward-journey';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Client } from 'pg';
import { createRuntimeServer, type RuntimeServer } from '../../server/src/runtime';
import { PostgresRewardStore } from '../../server/src/reward/postgres-store';
import { RewardService } from '../../server/src/reward/service';
import { V8_R1_RULESET_ID } from '../../shared/simulation-v8';
import { V8_AUTOMATION_ID } from '../../shared/combat-version';

test('isolated automated r1 Daily retains exact replay identity in disposable PostgreSQL', async ({ page }) => {
  test.setTimeout(120_000);
  const adminUrl = process.env.WP014_TEST_DATABASE_URL?.trim();
  if (!adminUrl) throw new Error('V8 PostgreSQL acceptance requires WP014_TEST_DATABASE_URL; no database gate was run.');
  const parsed = new URL(adminUrl);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) ||
      !['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname))
    throw new Error('V8 PostgreSQL acceptance requires disposable loopback PostgreSQL.');
  if (['testnet', 'mainnet'].includes(process.env.REWARD_MODE ?? '') ||
      ['REWARD_PRIVATE_KEY_FILE', 'REWARD_RPC_URL', 'NIMIQ_RECOVERY_WORDS', 'REWARD_MAINNET_ACKNOWLEDGEMENT']
        .some(key => process.env[key]?.trim())) throw new Error('V8 PostgreSQL acceptance refuses payout authority.');
  const databaseName = `nimble_knots_wp015d_v8d_${randomUUID().replaceAll('-', '')}`;
  if (!/^nimble_knots_wp015d_v8d_[a-f0-9]{32}$/.test(databaseName)) throw new Error('Unsafe disposable database name.');
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  const signer = createTestSigner();
  let runtime: RuntimeServer | undefined; let created = false;
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`); created = true;
    parsed.pathname = `/${databaseName}`;
    const store = new PostgresRewardStore(parsed.toString());
    const ids = ['postgres_automated_challenge', 'postgres_automated_entitlement'];
    const rewards = new RewardService({ mode: 'record-only', rewardLuna: 100000n, feeLuna: 0n,
      dailyBudgetLuna: 400000n, reservationTtlMs: 60_000, claimTtlMs: 60_000, turnLimit: 16,
      paused: false, network: 'test-albatross', testDailyAttemptLimit: 1 }, store,
    { idSource: () => ids.shift()!, seedSource: () => 1 });
    runtime = createRuntimeServer({ clientDir: path.resolve('client/build'), rewards,
      identity: { publicOrigin: 'http://127.0.0.1', network: 'test-albatross' }, sessionRegistry: {
        simulationRulesetId: V8_R1_RULESET_ID, simulationTickIntervalMs: false, v8TestOnly: { nowUs: () => 0 } } });
    const port = await runtime.listen();
    await page.exposeFunction('testAutomatedDatabaseSign', (message: string) => signer.sign(message));
    await page.addInitScript(({ wallet }) => {
      const host = window as any;
      host.nimiq = { listAccounts: async () => [wallet], sign: (message: string) => host.testAutomatedDatabaseSign(message) };
      host.nimiqPay = { language: 'en' };
    }, { wallet: signer.address });
    await page.goto(`http://127.0.0.1:${port}/?sideways=off`);
    await page.getByRole('button', { name: 'Check Daily Challenge' }).tap();
    await page.getByRole('button', { name: 'Choose Nimiq account' }).tap();
    await page.getByRole('button', { name: signer.address }).tap();
    await page.getByRole('button', { name: 'Start Daily Challenge' }).tap();
    const ui = page.locator('.combat-v8');
    await expect(ui).toHaveAttribute('data-mode', 'reward');
    await expect(ui).toHaveAttribute('data-ruleset', V8_R1_RULESET_ID);
    const socketId = [...runtime.io.sockets.sockets.keys()][0];
    const session = runtime.sessions.getBound(socketId)!;
    const challengeId = (await ui.getAttribute('data-challenge-id'))!;
    for (let turn = 0; turn < 20 && runtime.sessions.activeSnapshotV8(session)!.status === 'active'; turn++)
      runtime.sessions.advanceChallengeTicksV8ForTest(session, challengeId, 900);
    await expect(page.locator('.result-shell')).toHaveAttribute('data-outcome', 'loomkeeper_win');
    await expect(page.locator('.reward-result-status')).toContainText('did not earn a reward');
    await page.goto('about:blank'); await runtime.close();
    const check = new Client({ connectionString: parsed.toString() });
    await check.connect();
    try {
      const rows = await check.query(`SELECT state, attempt_consumed, replay->>'automationId' AS automation,
        replay->>'rulesetId' AS ruleset, final_state_hash IS NOT NULL AS has_hash FROM reward_entitlements`);
      expect(rows.rows).toEqual([{ state: 'lost', attempt_consumed: true, automation: V8_AUTOMATION_ID,
        ruleset: V8_R1_RULESET_ID, has_hash: true }]);
      const events = await check.query('SELECT next_state FROM reward_events ORDER BY event_id');
      expect(events.rows.map(row => row.next_state)).toEqual(['reserved', 'in_progress', 'lost']);
    } finally { await check.end(); }
  } finally {
    await runtime?.close(); signer.dispose();
    if (created) {
      await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [databaseName]);
      await admin.query(`DROP DATABASE "${databaseName}"`);
    }
    await admin.end();
  }
});

test('built Daily journey persists consumed authority in PostgreSQL record-only mode', async ({
  page
}) => {
  test.setTimeout(120_000);
  const signer = createTestSigner();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.exposeFunction('testNimiqSign', (message: string) => signer.sign(message));
    await page.addInitScript(({ wallet }) => {
      const runtime = window as typeof window & {
        testNimiqSign?: (message: string) => Promise<{ publicKey: string; signature: string }>;
        nimiq?: unknown;
        nimiqPay?: unknown;
      };
      runtime.nimiq = {
        listAccounts: async () => [wallet],
        sign: async (message: string) => runtime.testNimiqSign!(message)
      };
      runtime.nimiqPay = { language: 'en' };
    }, { wallet: signer.address });

    await page.goto('/?sideways=off');
    await page.getByRole('button', { name: 'Check Daily Challenge' }).tap();
    await expect(page.locator('.daily-summary')).toContainText('Available today');
    await page.getByRole('button', { name: 'Choose Nimiq account' }).tap();
    await page.getByRole('button', { name: signer.address }).tap();
    await page.getByRole('button', { name: 'Start Daily Challenge' }).tap();
    await expect(page.locator('.combat-ui')).toHaveAttribute('data-mode', 'reward');

    await completeCurrentClash(page);
    await expect(page.getByRole('heading', { name: 'The Loomkeeper prevailed' })).toBeVisible();
    await expect(page.locator('.reward-result-status')).toContainText(
      'did not earn a reward'
    );
    await expect(page.getByRole('button', { name: 'Play Practice' })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    signer.dispose();
  }
});
