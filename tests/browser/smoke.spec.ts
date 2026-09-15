import { expect, test } from '@playwright/test';

test.describe('@legacy retired V7/V8 previews', () => {
test('V8 engineering preview does not replace ordinary wallet-free V7 Practice', async ({ page }) => {
  await page.goto('/?combat-preview=v8&sideways=off');
  await expect(page.locator('.combat-v8')).toBeVisible();
  await page.goto('/?sideways=off');
  await page.getByRole('button', { name: 'Start Practice' }).tap();
  await expect(page.locator('.combat-ui')).toBeVisible();
  await expect(page.locator('.combat-v8')).toHaveCount(0);
  await expect(page.locator('.movement-zone')).toHaveAttribute('aria-label', /8 of 8 steps remaining/);
  await expect(page.locator('.jump-button')).toHaveCount(0);
});

test('V8 r1 preview is explicit and preserves original V8 and public wallet-free V7', async ({ page }) => {
  await page.goto('/?combat-preview=v8-r1&sideways=off');
  await expect(page.locator('.combat-v8-r1')).toHaveAttribute('data-ruleset', 'nimble-knots-artillery-v8-r1');
  await expect(page.locator('.jump-button, .face-left, .face-right')).toHaveCount(0);
  await page.goto('/?combat-preview=v8&sideways=off');
  await expect(page.locator('.combat-v8')).toHaveAttribute('data-ruleset', 'nimble-knots-artillery-v8');
  await expect(page.getByRole('button', { name: 'Jump forward' })).toBeVisible();
  await page.goto('/?sideways=off');
  await page.getByRole('button', { name: 'Start Practice' }).tap();
  await expect(page.locator('.combat-ui')).toBeVisible();
  await expect(page.locator('.combat-v8')).toHaveCount(0);
  await expect(page.locator('.movement-zone')).toHaveAttribute('aria-label', /8 of 8 steps remaining/);
});
});

test('built phone journey starts wallet-free live practice and accepts touch', async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Practice Clash' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/No wallet, matchmaking, or reward pool/i)).toBeVisible();
  await expect(page.locator('.calling-picker')).toHaveCount(0);
  await expect(page.getByText('Play as the Wizard Knotkin')).toBeVisible();
  await page.getByRole('button', { name: 'Start Practice' }).tap();

  const ui = page.locator('.combat-ui');
  await expect(ui).toBeVisible();
  await expect(ui).toHaveAttribute('data-calling', 'wizard');
  await expect(ui).toHaveAttribute('data-challenge-id', /^[A-Za-z0-9_-]{16,64}$/);
  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvasColors(canvas)).toBeGreaterThan(1);

  await page.locator('.pause-button').tap();
  await expect(ui).toHaveAttribute('data-paused', 'true');
  await expect(page.locator('.combat-pause-sheet')).toContainText(
    /Practice paused.*authoritative clock is stopped/i
  );
  await page.locator('.pause-button').tap();
  await expect(ui).toHaveAttribute('data-paused', 'false');
  await page.locator('.pause-button').tap();
  await expect(ui).toHaveAttribute('data-paused', 'true');

  expect(pageErrors, `Unexpected page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  expect(consoleErrors, `Unexpected console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  if (process.env.PLAYWRIGHT_ARTIFACT_PROBE === '1') {
    expect('artifact-probe').toBe('intentional-failure');
  }
});

test('practice reconnect suspends controls and resumes the same challenge', async ({ page, context }) => {
  test.setTimeout(45_000);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Practice Clash' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Start Practice' }).tap();
  const ui = page.locator('.combat-ui');
  await expect(ui).toBeVisible();
  const challengeId = await ui.getAttribute('data-challenge-id');

  await context.setOffline(true);
  await expect(ui).toHaveAttribute('data-connection', 'reconnecting', { timeout: 10_000 });
  await expect(page.getByText(/Reconnecting/i)).toBeVisible();

  await context.setOffline(false);
  await expect(ui).toHaveAttribute('data-connection', 'connected', { timeout: 15_000 });
  await expect(ui).toHaveAttribute('data-challenge-id', challengeId!);
  await page.locator('.pause-button').tap();
  await expect(ui).toHaveAttribute('data-paused', 'true');
});

async function canvasColors(canvas: import('@playwright/test').Locator): Promise<number> {
  return canvas.evaluate(async (element: HTMLCanvasElement) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const probe = document.createElement('canvas');
    probe.width = 64;
    probe.height = 64;
    const context = probe.getContext('2d');
    if (!context) return 0;
    context.drawImage(element, 0, 0, probe.width, probe.height);
    const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
    const colors = new Set<string>();
    for (let index = 0; index < pixels.length; index += 16) {
      if (pixels[index + 3] > 0) {
        colors.add(`${pixels[index]}:${pixels[index + 1]}:${pixels[index + 2]}`);
      }
    }
    return colors.size;
  });
}
