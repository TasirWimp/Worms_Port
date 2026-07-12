import { expect, test } from '@playwright/test';

test('built phone journey renders and accepts touch', async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/');

  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(async () => canvas.evaluate(async (element: HTMLCanvasElement) => {
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
  })).toBeGreaterThan(1);

  await page.locator('#b-rand').tap();
  await expect(page.getByRole('heading', { name: 'Prepare the Clash' })).toBeVisible();
  await expect(page.locator('#inp-room-id')).toHaveValue(/^[a-z0-9]+(?:-[a-z0-9]+){2}$/);

  expect(pageErrors, `Unexpected page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  expect(consoleErrors, `Unexpected console errors: ${consoleErrors.join(' | ')}`).toEqual([]);

  if (process.env.PLAYWRIGHT_ARTIFACT_PROBE === '1') {
    expect('artifact-probe').toBe('intentional-failure');
  }
});
