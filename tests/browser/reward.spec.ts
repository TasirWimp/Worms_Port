import { expect, test } from '@playwright/test';

import { createTestSigner, privateKeyForProject } from '../support/nimiq-signer';
import { completeCurrentClash } from './support/reward-journey';

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
