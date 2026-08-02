import { expect, test } from '@playwright/test';

import { createTestSigner } from '../support/nimiq-signer';
import { completeCurrentClash } from '../browser/support/reward-journey';

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
