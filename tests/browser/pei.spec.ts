import { expect, test } from '@playwright/test';
import path from 'node:path';

import { PeiCoordinatorV0, type PeiRuntimeConfigV0 } from '../../server/src/pei/coordinator';
import { createPeiProxyRuntimeV0 } from '../../server/src/pei/proxy-runtime';
import type { PeiChainTransactionV0 } from '../../server/src/pei/verifier';
import { createRuntimeServer } from '../../server/src/runtime';
import { MemoryRewardStore } from '../../server/src/reward/memory-store';
import { RewardService } from '../../server/src/reward/service';
import type { RewardConfig } from '../../server/src/reward/types';
import { V10_R5_RULESET_ID } from '../../shared/simulation-v10';
import { createTestSigner, privateKeyForProject } from '../support/nimiq-signer';

const PROXY_ADDRESS = 'NQ34 61R8 YJUA KLDJ 4VVL E22V T7KE ATA3 A1HY';
const EARN_HASH = '7'.repeat(64);
const SPEND_HASH = '8'.repeat(64);

test('PEI helper survives both crossings and admits the same volcanic Daily match', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000);
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
  const rewards = new RewardService(rewardConfig, new MemoryRewardStore(), {
    idSource: () => `pei_browser_reward_${String(++id).padStart(3, '0')}`,
    seedSource: () => 4,
    peiGrantIdSource: () => 'pei_browser_admission_001',
    peiGrantTokenSource: () => 'T'.repeat(43)
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
      reconnectGraceMs: 660_000,
      v10TestOnly: { nowUs: () => 0 }
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
  page.on('pageerror', error => pageErrors.push(error.stack ?? error.message));
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
    await expect(page.locator('.daily-summary')).toContainText('complete PEI');
    await page.getByRole('button', { name: 'Choose Nimiq account' }).tap();
    await page.getByRole('button', { name: signer.address }).tap();
    await expect(page.getByRole('button', { name: 'Complete PEI qualification' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Start Daily Challenge' })).toBeDisabled();

    await page.getByRole('button', { name: 'Complete PEI qualification' }).tap();
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
    await expect(page.locator('.daily-message')).toContainText('PEI complete');
    await expect(page.getByRole('button', { name: 'Start Daily Challenge' })).toBeEnabled();
    await page.reload();
    await page.getByRole('button', { name: 'Check Daily Challenge' }).tap();
    await expect(page.getByRole('button', { name: 'Start Daily Challenge' })).toBeEnabled();
    await page.getByRole('button', { name: 'Start Daily Challenge' }).tap();
    await expect(page.locator('.combat-v10')).toHaveAttribute('data-mode', 'reward');
    await expect(page.locator('.combat-v10')).toHaveAttribute('data-ruleset', V10_R5_RULESET_ID);
    await expect(page.locator('.combat-v10')).toHaveAttribute('data-background', 'volcanic-ruin');
  } finally {
    expect.soft(pageErrors, 'PEI browser crossings must not raise page errors.').toEqual([]);
    await page.goto('about:blank');
    await helper.close();
    await game.close();
    signer.dispose();
  }
});
