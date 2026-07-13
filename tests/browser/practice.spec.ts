import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Practice Clash' })).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => pageErrors).toEqual([]);
  await expect.poll(() => consoleErrors).toEqual([]);
});

test('live practice supports authoritative pause, full player turn, and fresh retry', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: /Warrior/ }).tap();
  await page.getByRole('button', { name: 'Start Practice' }).tap();
  const ui = page.locator('.combat-ui');
  await expect(ui).toBeVisible();
  await expect(ui).toHaveAttribute('data-calling', 'warrior');
  await expect(ui).not.toHaveAttribute('data-preview', /.+/);
  const firstChallenge = await ui.getAttribute('data-challenge-id');

  await page.locator('.pause-button').tap();
  await expect(ui).toHaveAttribute('data-paused', 'true');
  const pausedTimer = await page.locator('.combat-timer').textContent();
  const pausedTick = await ui.getAttribute('data-simulation-tick');
  await page.waitForTimeout(1_100);
  await expect(page.locator('.combat-timer')).toHaveText(pausedTimer!);
  await expect(ui).toHaveAttribute('data-simulation-tick', pausedTick!);
  await page.locator('.pause-button').tap();
  await expect(ui).toHaveAttribute('data-paused', 'false');

  const startX = Number(await ui.getAttribute('data-player-x'));
  await dragPad(page, '.movement-zone', 21, 0.36, 0);
  await expect.poll(async () => Number(await ui.getAttribute('data-player-x'))).not.toBe(startX);
  await page.getByRole('button', { name: 'Select Spoolburst' }).tap();
  await expect(ui).toHaveAttribute('data-selected-relic', 'spoolburst');
  await dragPad(page, '.aim-zone', 22, 0.3, -0.34);
  await expect(page.locator('.fire-button')).toBeEnabled();
  await page.locator('.fire-button').tap();
  await expect.poll(async () => Number(await ui.getAttribute('data-turn')), {
    timeout: 15_000
  }).toBeGreaterThanOrEqual(2);
  await expect(ui).toHaveAttribute('data-active-actor', 'player');

  await page.locator('.retry-button').tap();
  await expect.poll(() => ui.getAttribute('data-challenge-id')).not.toBe(firstChallenge);
  await expect(ui).toHaveAttribute('data-turn', '0');
  await expect(ui).toHaveAttribute('data-calling', 'warrior');
  await expect(page.getByText(/Fresh Practice Clash started/i)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('wp-011-live-practice.png') });
});

test('calling controls and live combat actions remain phone-safe', async ({ page }) => {
  for (const button of await page.locator('.calling-picker button').all()) {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(48);
    expect(box!.height).toBeGreaterThanOrEqual(48);
  }
  await page.getByRole('button', { name: 'Start Practice' }).tap();
  await expect(page.locator('.combat-ui')).toBeVisible();
  for (const button of await page.locator('.combat-actions button').all()) {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(48);
    expect(box!.height).toBeGreaterThanOrEqual(48);
  }
});

test('lost in-memory authority offers a fresh Practice Clash', async ({ page }) => {
  await page.evaluate(() => {
    sessionStorage.setItem('nimble-knots.active-practice', JSON.stringify({
      sessionId: 'lost_render_process_session',
      challengeId: 'lost_render_process_challenge'
    }));
    sessionStorage.removeItem('nimble-knots.session-token');
  });
  await page.reload();

  await expect(page.getByRole('button', { name: 'Start Fresh Practice' })).toBeVisible();
  await expect(page.getByText(/previous in-memory Practice Clash cannot be resumed/i)).toBeVisible();
  await page.getByRole('button', { name: 'Start Fresh Practice' }).tap();
  await expect(page.locator('.combat-ui')).toBeVisible();
});

async function dragPad(
  page: Page,
  selector: string,
  pointerId: number,
  dx: number,
  dy: number
): Promise<void> {
  await pointer(page, selector, 'pointerdown', pointerId, 0.5, 0.55);
  await pointer(page, selector, 'pointermove', pointerId, 0.5 + dx, 0.55 + dy);
  await pointer(page, selector, 'pointerup', pointerId, 0.5 + dx, 0.55 + dy);
}

async function pointer(
  page: Page,
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
