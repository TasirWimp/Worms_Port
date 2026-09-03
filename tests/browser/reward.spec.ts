import { expect, test } from '@playwright/test';

import { createTestSigner, privateKeyForProject } from '../support/nimiq-signer';
import { completeCurrentClash } from './support/reward-journey';
import path from 'node:path';
import { createRuntimeServer } from '../../server/src/runtime';
import { MemoryRewardStore } from '../../server/src/reward/memory-store';
import { RewardService } from '../../server/src/reward/service';
import { V8_R1_RULESET_ID } from '../../shared/simulation-v8';
import { V8_AUTOMATION_ID } from '../../shared/combat-version';

test('injected automated Daily shares Practice version and retains a replay-verified no-fund loss', async ({ page }) => {
  test.setTimeout(90_000);
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.stack ?? error.message));
  const signer = createTestSigner();
  const store = new MemoryRewardStore();
  const ids = ['browser_automated_challenge', 'browser_automated_entitlement'];
  const rewards = new RewardService({ mode: 'record-only', rewardLuna: 100000n, feeLuna: 0n,
    dailyBudgetLuna: 400000n, reservationTtlMs: 60_000, claimTtlMs: 60_000, turnLimit: 16,
    paused: false, network: 'test-albatross', testDailyAttemptLimit: 1 }, store,
  { idSource: () => ids.shift()!, seedSource: () => 1 });
  const runtime = createRuntimeServer({ clientDir: path.resolve('client/build'), rewards,
    identity: { publicOrigin: 'http://127.0.0.1', network: 'test-albatross' },
    sessionRegistry: { simulationRulesetId: V8_R1_RULESET_ID, simulationTickIntervalMs: false,
      v8TestOnly: { nowUs: () => 0 } } });
  const port = await runtime.listen();
  try {
    await page.exposeFunction('testAutomatedSign', (message: string) => signer.sign(message));
    await page.addInitScript(({ wallet }) => {
      const host = window as any;
      host.nimiq = { listAccounts: async () => [wallet], sign: (message: string) => host.testAutomatedSign(message) };
      host.nimiqPay = { language: 'en' };
    }, { wallet: signer.address });
    await page.goto(`http://127.0.0.1:${port}/?sideways=off`);
    await page.getByRole('button', { name: 'Check Daily Challenge' }).tap();
    await page.getByRole('button', { name: 'Choose Nimiq account' }).tap();
    await page.getByRole('button', { name: signer.address }).tap();
    await page.getByRole('button', { name: 'Start Daily Challenge' }).tap();
    const ui = page.locator('.combat-v8');
    await expect(ui).toBeVisible();
    await expect(ui).toHaveAttribute('data-mode', 'reward');
    await expect(ui).toHaveAttribute('data-ruleset', V8_R1_RULESET_ID);
    await expect(page.locator('.pause-button')).toBeDisabled();
    const socketId = [...runtime.io.sockets.sockets.keys()][0];
    const session = runtime.sessions.getBound(socketId)!;
    const challenge = (await ui.getAttribute('data-challenge-id'))!;
    for (let turn = 0; turn < 20 && runtime.sessions.activeSnapshotV8(session)!.status === 'active'; turn++)
      runtime.sessions.advanceChallengeTicksV8ForTest(session, challenge, 900);
    await expect(page.locator('.result-shell')).toHaveAttribute('data-outcome', 'loomkeeper_win');
    await expect(page.locator('.reward-result-status')).toContainText('did not earn a reward');
    await expect(page.locator('.reward-claim')).toBeHidden();
    const retained = await store.status('browser_automated_entitlement', signer.address);
    expect(retained?.state).toBe('lost');
    expect(retained?.replay && 'automationId' in retained.replay && retained.replay.automationId).toBe(V8_AUTOMATION_ID);
    await page.getByRole('button', { name: 'Play Practice' }).tap();
    await expect(ui).toHaveAttribute('data-mode', 'practice');
    await expect(ui).toHaveAttribute('data-ruleset', V8_R1_RULESET_ID);
  } finally {
    expect.soft(pageErrors, 'Automated Daily must not raise browser page errors.').toEqual([]);
    await page.goto('about:blank'); await runtime.close(); signer.dispose();
  }
});

test('Daily Challenge discloses, authorizes, plays, and reports a consumed loss', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000);
  test.skip(
    !['chromium-390x844', 'webkit-390x844'].includes(testInfo.project.name),
    'One maintained project per mobile engine covers the complete reward journey.'
  );
  const signer = createTestSigner(privateKeyForProject(testInfo.project.name));
  try {
    await page.exposeFunction('testNimiqSign', (message: string) => signer.sign(message));
    await page.addInitScript(({ wallet }) => {
      const runtime = window as any;
      runtime.nimiq = {
        listAccounts: async () => [wallet],
        sign: async (message: string) => runtime.testNimiqSign(message)
      };
      runtime.nimiqPay = { language: 'en' };
    }, { wallet: signer.address });

    await page.goto('/?sideways=off');
    await expect(page.getByRole('heading', {
      name: 'Daily Grand Knot Challenge'
    })).toBeVisible();
    await page.getByRole('button', { name: 'Check Daily Challenge' }).tap();
    await expect(page.locator('.daily-summary')).toContainText('Available today');
    await expect(page.locator('.daily-facts')).toContainText('1 NIM');
    await expect(page.locator('.daily-facts')).toContainText(
      'One started attempt per wallet and UTC day'
    );
    await expect(page.getByRole('button', {
      name: 'Start Daily Challenge'
    })).toBeDisabled();

    await page.getByRole('button', { name: 'Choose Nimiq account' }).tap();
    await page.getByRole('button', { name: signer.address }).tap();
    await expect(page.getByRole('button', {
      name: 'Start Daily Challenge'
    })).toBeEnabled();
    await page.getByRole('button', { name: 'Start Daily Challenge' }).tap();
    await expect(page.locator('.combat-ui')).toHaveAttribute('data-mode', 'reward');

    await completeCurrentClash(page);
    await expect(page.locator('.result-shell')).toBeVisible();
    await expect(page.getByRole('heading', {
      name: 'The Loomkeeper prevailed'
    })).toBeVisible();
    await expect(page.locator('.reward-result-status')).toContainText(
      'did not earn a reward'
    );
    await expect(page.locator('.reward-result-status')).toContainText('1 NIM');
    await expect(page.locator('.reward-claim')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Play Practice' })).toBeVisible();
  } finally {
    signer.dispose();
  }
});
