import { expect, test, type Page } from '@playwright/test';
import { PrivateKey, PublicKey, Signature } from '@nimiq/core';

import { nimiqSignedMessageHash } from '../../server/src/identity/crypto';

const PRIVATE_KEY = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const DEVICE_ID = 'ab'.repeat(32);

function createSigner(privateKeyHex = PRIVATE_KEY) {
  const privateKey = PrivateKey.fromHex(privateKeyHex);
  const publicKey = PublicKey.derive(privateKey);
  const addressObject = publicKey.toAddress();
  const address = addressObject.toUserFriendlyAddress();
  addressObject.free();
  return {
    address,
    sign(message: string) {
      const signature = Signature.create(privateKey, publicKey, nimiqSignedMessageHash(message));
      try {
        return { publicKey: publicKey.toHex(), signature: signature.toHex() };
      } finally {
        signature.free();
      }
    },
    dispose() {
      publicKey.free();
      privateKey.free();
    }
  };
}

function captureErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('query-gated fake provider authorizes a rotated session and leaves Practice usable', async ({ page }, testInfo) => {
  const errors = captureErrors(page);
  const signer = createSigner(projectPrivateKey(testInfo.project.name));
  try {
    await page.exposeFunction('testNimiqSign', (message: string) => signer.sign(message));
    await page.addInitScript(({ address, deviceId }) => {
      const runtime = window as any;
      runtime.__walletCalls = { accounts: 0, signs: 0, devices: 0, boundaries: 0 };
      window.addEventListener('nimble-knots:wallet-boundary', () => {
        runtime.__walletCalls.boundaries += 1;
      });
      runtime.nimiq = {
        listAccounts: async () => {
          runtime.__walletCalls.accounts += 1;
          return [address];
        },
        sign: async (message: string) => {
          runtime.__walletCalls.signs += 1;
          return runtime.testNimiqSign(message);
        }
      };
      runtime.nimiqPay = {
        language: 'de',
        requestDeviceIdentifier: async () => {
          runtime.__walletCalls.devices += 1;
          return deviceId;
        }
      };
    }, { address: signer.address, deviceId: DEVICE_ID });

    await page.goto('/?identity-preview=1&sideways=off');
    await expect(page.getByRole('heading', { name: 'Practice Clash' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Nimiq Pay identity test' })).toBeVisible();
    await expect(page.locator('.identity-language')).toContainText('de');
    const originalToken = await page.evaluate(() =>
      sessionStorage.getItem('nimble-knots.session-token')
    );

    await page.getByRole('button', { name: 'Test optional device consent' }).tap();
    await expect(page.locator('.identity-message')).toContainText('not displayed, stored, or used');
    await page.getByRole('button', { name: 'Choose Nimiq account' }).tap();
    await page.getByRole('button', { name: signer.address }).tap();
    await expect(page.locator('.identity-acceptance')).toHaveAttribute('data-authorized', 'true');
    await expect(page.locator('.identity-message')).toContainText(`Authorized as ${signer.address}`);

    const state = await page.evaluate(({ deviceId }) => ({
      token: sessionStorage.getItem('nimble-knots.session-token'),
      storage: JSON.stringify(sessionStorage),
      htmlContainsDeviceId: document.documentElement.innerHTML.includes(deviceId),
      calls: (window as any).__walletCalls
    }), { deviceId: DEVICE_ID });
    expect(state.token).not.toBe(originalToken);
    expect(state.storage).not.toContain(DEVICE_ID);
    expect(state.htmlContainsDeviceId).toBe(false);
    expect(state.calls).toEqual({ accounts: 1, signs: 1, devices: 1, boundaries: 6 });

    await page.getByRole('button', { name: 'Start Practice' }).tap();
    await expect(page.locator('.combat-ui')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    signer.dispose();
  }
});

function projectPrivateKey(projectName: string): string {
  const suffixes: Record<string, string> = {
    'chromium-360x640': '20',
    'chromium-390x844': '21',
    'chromium-844x390': '22',
    'webkit-390x844': '23'
  };
  return `${PRIVATE_KEY.slice(0, -2)}${suffixes[projectName] || '24'}`;
}

test('signing rejection is cancelled and the same account can retry immediately', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-390x844', 'One portrait host covers the rejection presentation.');
  const errors = captureErrors(page);
  const signer = createSigner();
  try {
    await page.exposeFunction('testNimiqSign', (message: string) => signer.sign(message));
    await page.addInitScript(({ address }) => {
      const runtime = window as any;
      runtime.__walletCalls = { signs: 0 };
      runtime.nimiq = {
        listAccounts: async () => [address],
        sign: async (message: string) => {
          runtime.__walletCalls.signs += 1;
          if (runtime.__walletCalls.signs <= 2) {
            return { error: { type: 'USER_REJECTED', message: 'User cancelled signing.' } };
          }
          return runtime.testNimiqSign(message);
        }
      };
      runtime.nimiqPay = { language: 'en' };
    }, { address: signer.address });
    await page.goto('/?identity-preview=1');
    await expect(page.locator('html')).toHaveAttribute('data-sideways', 'right');
    await page.getByRole('button', { name: 'Choose Nimiq account' }).tap();
    const account = page.getByRole('button', { name: signer.address });
    await account.tap();
    await expect(page.locator('.identity-message')).toContainText('cancelled');
    await expect(account).toBeEnabled();

    await account.tap();
    await expect(page.locator('.identity-message')).toContainText('cancelled');
    await expect(account).toBeEnabled();

    await account.tap();
    await expect(page.locator('.identity-message')).toContainText(`Authorized as ${signer.address}`);
    expect(await page.evaluate(() => (window as any).__walletCalls.signs)).toBe(3);
    await expect(page.locator('html')).toHaveAttribute('data-sideways', 'right');
    await expect(page.getByRole('button', { name: 'Start Practice' })).toBeEnabled();
    expect(errors).toEqual([]);
  } finally {
    signer.dispose();
  }
});

test('ordinary Practice never initializes or calls an injected wallet provider', async ({ page }) => {
  const errors = captureErrors(page);
  await page.addInitScript(() => {
    const runtime = window as any;
    runtime.__walletCalls = 0;
    runtime.nimiq = {
      listAccounts: async () => {
        runtime.__walletCalls += 1;
        throw new Error('Wallet must not be called by Practice.');
      },
      sign: async () => {
        runtime.__walletCalls += 1;
        throw new Error('Wallet must not be called by Practice.');
      }
    };
  });
  await page.goto('/?sideways=off');
  await expect(page.locator('.identity-acceptance')).toHaveCount(0);
  await page.getByRole('button', { name: 'Start Practice' }).tap();
  await expect(page.locator('.combat-ui')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__walletCalls)).toBe(0);
  expect(errors).toEqual([]);
});
