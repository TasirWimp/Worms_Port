import { expect, test } from '@playwright/test';
import path from 'node:path';

import { PeiCoordinatorV0 } from '../../server/src/pei/coordinator';
import type { PeiRuntimeConfigV0 } from '../../server/src/pei/runtime-contract';
import { createPeiProxyRuntimeV0 } from '../../server/src/pei/proxy-runtime';
import type { PeiChainTransactionV0 } from '../../server/src/pei/verifier';
import { createRuntimeServer } from '../../server/src/runtime';
import { MemoryRewardStore } from '../../server/src/reward/memory-store';
import { RewardService } from '../../server/src/reward/service';
import type { RewardConfig } from '../../server/src/reward/types';
import { V10_R7_RULESET_ID } from '../../shared/simulation-v10';
import { createTestSigner, privateKeyForProject } from '../support/nimiq-signer';
import { completeCurrentClash, playCurrentRound } from './support/reward-journey';

const PROXY_ADDRESS = 'NQ34 61R8 YJUA KLDJ 4VVL E22V T7KE ATA3 A1HY';
const EARN_HASH = '7'.repeat(64);
const SPEND_HASH = '8'.repeat(64);

test('PEI helper receipt survives return and completes the same volcanic Daily and Practice journey', async ({
  page: initialPage,
  context
}, testInfo) => {
  test.setTimeout(240_000);
  test.skip(
    !['chromium-390x844', 'webkit-390x844'].includes(testInfo.project.name),
    'One maintained project per mobile engine covers the two-origin PEI journey.'
  );
  const signer = createTestSigner(privateKeyForProject(testInfo.project.name));
  const transactions = new Map<string, PeiChainTransactionV0>();
  const adapter = {
    transaction: async (hash: string) => {
      const transaction = transactions.get(hash);
      return transaction ? structuredClone(transaction) : undefined;
    }
  };
  const rewardConfig: RewardConfig = {
    mode: 'record-only', paused: false, network: 'test-albatross',
    rewardLuna: 100_000n, feeLuna: 0n, dailyBudgetLuna: 400_000n,
    reservationTtlMs: 60_000, claimTtlMs: 60_000, turnLimit: 16,
    testDailyAttemptLimit: 1,
    peiRequired: true
  };
  let id = 0;
  const store = new MemoryRewardStore();
  const rewards = new RewardService(rewardConfig, store, {
    idSource: () => `pei_browser_reward_${String(++id).padStart(3, '0')}`,
    seedSource: () => 4,
    peiReceiptIdSource: () => 'pei_browser_receipt_001'
  });
  expect((await rewards.info()).status).toBe('available');
  const config: PeiRuntimeConfigV0 = {
    network: 'test-albatross',
    requesterOrigin: 'http://127.0.0.1:1',
    proxyOrigin: 'http://127.0.0.1:2',
    proxyAddress: PROXY_ADDRESS,
    returnUri: 'http://127.0.0.1:1/#pei-return',
    allowedReturnUris: ['http://127.0.0.1:1/#pei-return'],
    earnAmountLuna: '1',
    spendAmountLuna: '1',
    requestAuthSecret: 'U'.repeat(43),
    requestTtlSeconds: 600,
    maximumRequestTtlSeconds: 600,
    clockSkewSeconds: 30,
    requireFinality: true
  };
  const nonces = ['B'.repeat(43), 'C'.repeat(43)];
  const coordinator = new PeiCoordinatorV0({
    config, adapter, rewards, nonceSource: () => nonces.shift()!
  });
  const game = createRuntimeServer({
    clientDir: path.resolve('client/build'), rewards, pei: coordinator,
    identity: { publicOrigin: 'http://127.0.0.1', network: 'test-albatross' },
    sessionRegistry: {
      practiceV10: true,
      seedSource: () => 4,
      reconnectGraceMs: 660_000
    }
  });
  const gamePort = await game.listen();
  config.requesterOrigin = `http://127.0.0.1:${gamePort}`;
  config.returnUri = `${config.requesterOrigin}/#pei-return`;
  config.allowedReturnUris = [config.returnUri];
  let earnTransfers = 0;
  const helper = createPeiProxyRuntimeV0({
    clientDir: path.resolve('client/build'), config, chainAdapter: adapter,
    earnTransfer: {
      send: async (request, commitment) => {
        earnTransfers += 1;
        transactions.set(EARN_HASH, {
          hash: EARN_HASH, network: config.network, sender: PROXY_ADDRESS,
          recipient: request.subject, valueLuna: request.minAmountLuna,
          data: commitment, executionState: 'success', finalized: true
        });
        return EARN_HASH;
      }
    }
  });
  const helperPort = await helper.listen();
  config.proxyOrigin = `http://127.0.0.1:${helperPort}`;
  const pageErrors: string[] = [];
  let page = initialPage;
  const capturePageErrors = () => page.on('pageerror', error => pageErrors.push(error.stack ?? error.message));
  capturePageErrors();
  try {
    await page.exposeFunction('testPeiSign', (message: string) => signer.sign(message));
    await page.exposeFunction('testPeiSpend', (transaction: {
      recipient: string; value: number; data: string
    }) => {
      transactions.set(SPEND_HASH, {
        hash: SPEND_HASH, network: config.network, sender: signer.address,
        recipient: transaction.recipient, valueLuna: String(transaction.value),
        data: transaction.data, executionState: 'success', finalized: true
      });
      return SPEND_HASH;
    });
    await page.addInitScript(({ wallet }) => {
      const host = window as typeof window & {
        testPeiSign(message: string): Promise<unknown>;
        testPeiSpend(transaction: unknown): Promise<string>;
      };
      host.nimiq = {
        listAccounts: async () => [wallet],
        sign: (message: string) => host.testPeiSign(message),
        sendBasicTransactionWithData: (transaction: unknown) => host.testPeiSpend(transaction)
      } as any;
      host.nimiqPay = { language: 'en' } as any;
    }, { wallet: signer.address });

    await page.goto(`${config.requesterOrigin}/?sideways=off`);
    await page.getByRole('button', { name: 'Check Daily Challenge' }).tap();
    await expect(page.locator('.daily-summary')).toContainText('Authorize');
    await page.getByRole('button', { name: 'Choose Nimiq account' }).tap();
    await page.getByRole('button', { name: signer.address }).tap();
    await expect(page.getByRole('button', { name: 'Complete PEI interaction' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Start Daily Challenge' })).toBeDisabled();

    await page.getByRole('button', { name: 'Complete PEI interaction' }).tap();
    await expect(page).toHaveURL(new RegExp(`^http://127\\.0\\.0\\.1:${helperPort}/#\\/pei/`));
    await expect(page.locator('html')).toHaveAttribute('data-step', 'earn');
    await expect(page.locator('#pei-facts')).toContainText('0.00001 NIM');
    const duplicateStatuses = await page.evaluate(async () => {
      const [, , requestCarrier, authorization] = location.hash.split('/');
      const send = () => fetch('/api/pei/earn', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestCarrier, authorization })
      });
      return Promise.all([send(), send()]).then(values => values.map(value => value.status));
    });
    expect(duplicateStatuses).toEqual([200, 200]);
    expect(earnTransfers).toBe(1);
    await page.getByRole('button', { name: 'Receive 0.00001 NIM' }).tap();

    await expect(page).toHaveURL(new RegExp(`^http://127\\.0\\.0\\.1:${helperPort}/#\\/pei/`));
    await expect(page.locator('html')).toHaveAttribute('data-step', 'spend');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Return 0.00001 NIM' })).toBeEnabled();
    await page.getByRole('button', { name: 'Return 0.00001 NIM' }).tap();

    await expect(page).toHaveURL(`${config.requesterOrigin}/`);
    await expect(page.locator('.daily-message')).toContainText('PEI receipt saved');
    await expect(page.locator('.daily-facts')).toContainText('Unused PEI receipts1');
    await expect(page.getByRole('button', { name: 'Complete another PEI interaction' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Start Daily Challenge' })).toBeEnabled();
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await page.getByRole('button', { name: 'Check Daily Challenge' }).tap();
    await expect(page.locator('.daily-summary')).toContainText('Authorize');
    await page.getByRole('button', { name: 'Choose Nimiq account' }).tap();
    await page.getByRole('button', { name: signer.address }).tap();
    await expect(page.locator('.daily-facts')).toContainText('Unused PEI receipts1');
    await expect(page.getByRole('button', { name: 'Start Daily Challenge' })).toBeEnabled();
    await page.getByRole('button', { name: 'Start Daily Challenge' }).tap();
    let combat = page.locator('.combat-v10');
    await expect(combat).toHaveAttribute('data-mode', 'reward');
    await expect(combat).toHaveAttribute('data-ruleset', V10_R7_RULESET_ID);
    await expect(combat).toHaveAttribute('data-background', 'volcanic-ruin');
    const consumed = await store.peiReceiptStatus('pei_browser_receipt_001', signer.address);
    expect(consumed?.consumedAt).toBeInstanceOf(Date);
    expect(consumed?.entitlementId).toBeTruthy();
    expect((await rewards.info({
      address: signer.address,
      authorizedAt: new Date().toISOString()
    })).availablePeiReceipts).toBe(0);

    let socketId = [...game.io.sockets.sockets.keys()][0];
    const dailyChallenge = game.sessions.activeSnapshotV10(game.sessions.getBound(socketId)!)!.challengeId;
    expect(await playCurrentRound(page, 190)).toBe(false);
    const closedState = await combat.evaluate((element) => ({
      turn: Number((element as HTMLElement).dataset.turn),
      activeActor: (element as HTMLElement).dataset.activeActor
    }));
    expect(closedState.turn).toBeGreaterThanOrEqual(2);
    expect(closedState.activeActor).toBe('player');
    await expect.poll(() => page.evaluate(() =>
      localStorage.getItem('nimble-knots.active-reward-session-token')))
      .toMatch(/^[A-Za-z0-9_-]{43}$/);
    await page.close();
    page = await context.newPage();
    capturePageErrors();
    await page.goto(`${config.requesterOrigin}/?sideways=off`);
    await expect(page.getByRole('button', { name: 'Resume Daily Challenge' })).toBeVisible();
    await page.getByRole('button', { name: 'Resume Daily Challenge' }).tap();
    combat = page.locator('.combat-v10');
    await expect(combat).toHaveAttribute('data-mode', 'reward');
    socketId = [...game.io.sockets.sockets.keys()][0];
    expect(game.sessions.activeSnapshotV10(game.sessions.getBound(socketId)!)!.challengeId).toBe(dailyChallenge);
    await expect(combat).toHaveAttribute('data-turn', String(closedState.turn));

    const resumed = () => game.sessions.activeSnapshotV10(game.sessions.getBound(
      [...game.io.sockets.sockets.keys()][0]
    )!)!.simulation;
    const startX = resumed().units[0].xFp;
    await pointer(page, '.combat-v10 .movement-right', 'pointerdown', 1701, 0.5, 0.5);
    await expect.poll(() => resumed().heldDirection).toBe(1);
    await expect.poll(() => resumed().units[0].xFp).toBeGreaterThan(startX);
    const progress: number[] = [];
    for (let sample = 0; sample < 10; sample += 1) {
      await page.waitForTimeout(100);
      const state = resumed();
      progress.push(state.units[0].xFp);
      expect(state.heldDirection, 'a resumed held walk must not lose its movement lease').toBe(1);
    }
    expect(progress.at(-1)!).toBeGreaterThan(progress[0]!);

    await pointer(page, '.combat-v10 .movement-zone', 'pointermove', 1701, 0.5, 0.2);
    await expect.poll(() => resumed().units[0].grounded).toBe(false);
    await pointer(page, '.combat-v10 .movement-zone', 'pointermove', 1701, 0.2, 0.8);
    await expect.poll(() => resumed().heldDirection).toBe(-1);
    await expect.poll(() => resumed().units[0].grounded, { timeout: 5_000 }).toBe(true);
    await pointer(page, '.combat-v10 .movement-zone', 'pointermove', 1701, 0.5, 0.2);
    await expect.poll(() => resumed().units[0].grounded).toBe(false);
    await pointer(page, '.combat-v10 .movement-zone', 'pointerup', 1701, 0.5, 0.2);
    await expect.poll(() => resumed().heldDirection).toBe(0);

    await completeCurrentClash(page);
    await expect.poll(() => page.evaluate(() =>
      localStorage.getItem('nimble-knots.active-reward-session-token')))
      .toBeNull();
    const result = page.locator('.result-shell');
    await expect(result).toBeVisible();
    const outcome = await result.getAttribute('data-outcome');
    expect(['player_win', 'loomkeeper_win', 'draw']).toContain(outcome);
    await expect.poll(async () => (await store.status(consumed!.entitlementId!, signer.address))?.state,
      { timeout: 45_000 }).toBe(outcome === 'player_win' ? 'claimable' : 'lost');
    const entitlement = await store.status(consumed!.entitlementId!, signer.address);
    expect(entitlement?.replay && 'rulesetId' in entitlement.replay
      ? entitlement.replay.rulesetId
      : undefined).toBe(V10_R7_RULESET_ID);

    await page.getByRole('button', { name: 'Play Practice' }).tap();
    await expect(combat).toHaveAttribute('data-mode', 'practice');
    await expect(combat).toHaveAttribute('data-ruleset', V10_R7_RULESET_ID);
    await expect(combat).toHaveAttribute('data-background', 'volcanic-ruin');
  } finally {
    expect.soft(pageErrors, 'PEI browser crossings must not raise page errors.').toEqual([]);
    await page.goto('about:blank');
    await helper.close();
    await game.close();
    signer.dispose();
  }
});

async function pointer(
  page: import('@playwright/test').Page,
  selector: string,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  pointerId: number,
  xRatio: number,
  yRatio: number
): Promise<void> {
  await page.locator(selector).evaluate((element, args) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new PointerEvent(args.type, {
      bubbles: true,
      cancelable: true,
      pointerId: args.pointerId,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      buttons: args.type === 'pointerup' ? 0 : 1,
      clientX: rect.left + rect.width * args.xRatio,
      clientY: rect.top + rect.height * args.yRatio
    }));
  }, { type, pointerId, xRatio, yRatio });
}
