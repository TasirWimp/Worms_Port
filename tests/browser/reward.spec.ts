import { expect, test, type Page } from '@playwright/test';
import { PrivateKey, PublicKey, Signature } from '@nimiq/core';

import { nimiqSignedMessageHash } from '../../server/src/identity/crypto';

const PRIVATE_KEY = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';

test('Daily Challenge discloses, authorizes, plays, and reports a consumed loss', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000);
  test.skip(testInfo.project.name !== 'chromium-390x844', 'One phone viewport covers the reward journey.');
  const privateKey = PrivateKey.fromHex(PRIVATE_KEY);
  const publicKey = PublicKey.derive(privateKey);
  const addressObject = publicKey.toAddress();
  const address = addressObject.toUserFriendlyAddress();
  addressObject.free();
  try {
    await page.exposeFunction('testNimiqSign', (message: string) => {
      const signature = Signature.create(
        privateKey,
        publicKey,
        nimiqSignedMessageHash(message)
      );
      try {
        return { publicKey: publicKey.toHex(), signature: signature.toHex() };
      } finally {
        signature.free();
      }
    });
    await page.addInitScript(({ wallet }) => {
      const runtime = window as any;
      runtime.nimiq = {
        listAccounts: async () => [wallet],
        sign: async (message: string) => runtime.testNimiqSign(message)
      };
      runtime.nimiqPay = { language: 'en' };
    }, { wallet: address });

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
    await page.getByRole('button', { name: address }).tap();
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
    publicKey.free();
    privateKey.free();
  }
});

async function completeCurrentClash(page: Page): Promise<void> {
  const ui = page.locator('.combat-ui');
  for (let shot = 0; shot < 10; shot += 1) {
    await expect.poll(() => page.evaluate(() => {
      if (document.querySelector('.result-shell')) return 'result';
      const combat = document.querySelector<HTMLElement>('.combat-ui');
      return combat?.dataset.presenting === 'false' &&
        combat.dataset.activeActor === 'player' ? 'ready' : 'waiting';
    }), { timeout: 30_000 }).toMatch(/^(ready|result)$/);
    if (await page.locator('.result-shell').count()) return;
    if (await ui.getAttribute('data-selected-relic') !== 'threadball') {
      await page.locator('.relic-trigger').tap();
      await expect(page.locator('.relic-chooser')).toBeVisible();
      await page.getByRole('button', { name: 'Select Threadball' }).tap();
      await expect(ui).toHaveAttribute('data-selected-relic', 'threadball');
    }
    await aimAt(page, 40, shot + 200);
    await expect(page.locator('.fire-button')).toBeEnabled();
    const turn = Number(await ui.getAttribute('data-turn'));
    await page.locator('.fire-button').tap();
    await expect.poll(() => page.evaluate((minimumTurn) => {
      if (document.querySelector('.result-shell')) return 'result';
      const combat = document.querySelector<HTMLElement>('.combat-ui');
      return Number(combat?.dataset.turn) > minimumTurn &&
        combat?.dataset.presenting === 'false' &&
        combat.dataset.activeActor === 'player' ? 'ready' : 'waiting';
    }, turn), { timeout: 30_000 }).toMatch(/^(ready|result)$/);
    if (await page.locator('.result-shell').count()) return;
  }
  throw new Error('Reward Clash did not reach a terminal result within ten player shots.');
}

async function aimAt(page: Page, angleDegrees: number, pointerId: number): Promise<void> {
  await page.locator('.aim-zone').evaluate((element, args) => {
    const rect = element.getBoundingClientRect();
    const radius = Math.max(24, Math.min(rect.width, rect.height) * 0.34);
    const radians = args.angleDegrees * Math.PI / 180;
    const origin = {
      x: rect.left + rect.width * 0.5,
      y: rect.top + rect.height * 0.55
    };
    const target = {
      x: origin.x + Math.cos(radians) * radius,
      y: origin.y - Math.sin(radians) * radius
    };
    for (const type of ['pointerdown', 'pointermove', 'pointerup'] as const) {
      const point = type === 'pointerdown' ? origin : target;
      element.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: args.pointerId,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        clientX: point.x,
        clientY: point.y
      }));
    }
  }, { angleDegrees, pointerId });
}
