import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto('/?combat-preview=1');
  await expect(page.locator('.combat-ui')).toBeVisible();
  await expect.poll(() => pageErrors).toEqual([]);
  await expect.poll(() => consoleErrors).toEqual([]);
});

test('portrait/landscape layout is touch-safe and renders deterministic combat', async ({ page }, testInfo) => {
  const ui = page.locator('.combat-ui');
  const viewport = page.viewportSize()!;
  await expect(ui).toHaveAttribute('data-orientation', viewport.width > viewport.height ? 'landscape' : 'portrait');
  await expect(ui).toHaveAttribute('data-selected-relic', 'threadball');
  await expect(page.getByText('Your turn')).toBeVisible();

  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible();
  expect((await canvas.screenshot()).byteLength).toBeGreaterThan(2_000);
  await expect(page.locator('.screen-shell')).toHaveCount(0);

  const boxes = await Promise.all([
    page.locator('.movement-zone').boundingBox(),
    page.locator('.aim-zone').boundingBox(),
    page.locator('.combat-actions').boundingBox()
  ]);
  for (const box of boxes) {
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(96);
    expect(box!.height).toBeGreaterThanOrEqual(56);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  }
  expect(overlaps(boxes[0]!, boxes[1]!)).toBe(false);
  expect(overlaps(boxes[0]!, boxes[2]!)).toBe(false);
  expect(overlaps(boxes[1]!, boxes[2]!)).toBe(false);

  for (const button of await page.locator('.combat-actions button').all()) {
    const box = await button.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(48);
    expect(box!.height).toBeGreaterThanOrEqual(48);
  }
  expect(await canvas.evaluate((element) => getComputedStyle(element).touchAction)).toBe('none');
  expect(await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    innerWidth,
    innerHeight
  }))).toEqual({ width: viewport.width, height: viewport.height, innerWidth: viewport.width, innerHeight: viewport.height });
  await page.screenshot({ path: testInfo.outputPath('wp-010-combat.png') });
});

test('touch movement, Relic selection, aim lock, and explicit Fire stay separate', async ({ page }) => {
  const startX = Number(await page.locator('.combat-ui').getAttribute('data-player-x'));
  await dragPad(page, '.movement-zone', 1, 0.36, 0);
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-last-command', 'move');
  await expect.poll(async () => Math.abs(
    Number(await page.locator('.combat-ui').getAttribute('data-player-x')) - startX
  )).toBeGreaterThanOrEqual(8);
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-presenting', 'false');
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-preview-points', '0');

  await page.getByRole('button', { name: 'Select Needlepoint' }).tap();
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-selected-relic', 'needlepoint');

  await dragPad(page, '.aim-zone', 2, 0.3, -0.34);
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-last-command', 'aim');
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-phase', 'aim_locked');
  await expect.poll(async () => Number(
    await page.locator('.combat-ui').getAttribute('data-preview-points')
  )).toBeGreaterThan(1);
  await expect(page.locator('.fire-button')).toBeEnabled();
  await expect(page.locator('.combat-ui')).not.toHaveAttribute('data-last-command', 'fire');

  await dragPad(page, '.movement-zone', 3, -0.36, 0);
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-presenting', 'false');
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-preview-points', '0');
  await expect(page.locator('.fire-button')).toBeDisabled();
  await expect(page.getByText(/aim again/i)).toBeVisible();
  await dragPad(page, '.aim-zone', 4, 0.3, -0.34);
  await expect(page.locator('.fire-button')).toBeEnabled();

  await installPresentationRecorder(page);
  await page.locator('.fire-button').tap();
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-last-command', 'fire');
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-active-actor', 'loomkeeper');
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-presenting', 'false');
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-preview-points', '0');
  await expect(page.locator('.fire-button')).toBeDisabled();
  const presentation = await readPresentationRecorder(page);
  expect(presentation.phases).toEqual(expect.arrayContaining([
    'player-projectile', 'player-impact'
  ]));
  expect(presentation.maximumProjectilePoints).toBeGreaterThan(1);
});

test('compact landscape visual viewport keeps every control visible and separate', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 800, height: 300 });
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-orientation', 'landscape');
  await assertControlsFit(page);
  await page.screenshot({ path: testInfo.outputPath('wp-011a-compact-landscape.png') });
});

test('pointer transfer, cancellation, release outside, pause, and retry fail safe', async ({ page }) => {
  await pointer(page, '.movement-zone', 'pointerdown', 10, 0.5, 0.5);
  await pointer(page, '.aim-zone', 'pointerdown', 11, 0.5, 0.5);
  await pointer(page, '.aim-zone', 'pointermove', 11, 0.8, 0.2);
  await pointer(page, '.aim-zone', 'pointerup', 11, 0.8, 0.2);
  await expect(page.locator('.combat-ui')).not.toHaveAttribute('data-last-command', 'aim');
  await pointer(page, '.movement-zone', 'pointercancel', 10, 0.8, 0.5);
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-phase', 'idle');

  await pointer(page, '.aim-zone', 'pointerdown', 12, 0.5, 0.5);
  await pointer(page, '.aim-zone', 'pointermove', 12, 0.8, 0.2);
  await pointer(page, '.aim-zone', 'pointerup', 12, 1.4, -0.2);
  await expect(page.locator('.combat-ui')).not.toHaveAttribute('data-last-command', 'aim');
  await expect(page.locator('.fire-button')).toBeDisabled();

  await page.locator('.pause-button').tap();
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-paused', 'true');
  await expect(page.getByText(/turn clock stopped/i)).toBeVisible();
  await expect(page.locator('.movement-zone')).toHaveAttribute('aria-disabled', 'true');
  await page.locator('.pause-button').tap();
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-paused', 'false');

  const turn = await page.locator('.combat-ui').getAttribute('data-turn');
  await page.locator('.retry-button').tap();
  await expect(page.getByText(/Fresh Practice Clash started/i)).toBeVisible();
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-turn', turn!);
});

test('blur, backgrounding, resize, orientation, and reduced motion clear transient input', async ({ page }) => {
  const ui = page.locator('.combat-ui');
  const original = page.viewportSize()!;
  await pointer(page, '.aim-zone', 'pointerdown', 30, 0.5, 0.5);
  await pointer(page, '.aim-zone', 'pointermove', 30, 0.8, 0.2);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(ui).toHaveAttribute('data-phase', 'idle');
  await expect(page.locator('.fire-button')).toBeDisabled();

  await pointer(page, '.aim-zone', 'pointerdown', 31, 0.5, 0.5);
  await pointer(page, '.aim-zone', 'pointermove', 31, 0.8, 0.2);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(ui).toHaveAttribute('data-phase', 'idle');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await page.setViewportSize({ width: original.height, height: original.width });
  await expect(ui).toHaveAttribute(
    'data-orientation',
    original.height > original.width ? 'landscape' : 'portrait'
  );
  await expect(ui).toHaveAttribute('data-phase', 'idle');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.pad-knob').first().evaluate((element) =>
    getComputedStyle(element).transitionDuration
  )).toBe('0s');
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
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
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
      buttons: args.type === 'pointerup' || args.type === 'pointercancel' ? 0 : 1,
      clientX: rect.left + rect.width * args.xRatio,
      clientY: rect.top + rect.height * args.yRatio
    }));
  }, { type, pointerId, xRatio, yRatio });
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;
}

async function assertControlsFit(page: Page): Promise<void> {
  const viewport = await page.evaluate(() => ({
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight
  }));
  const boxes = await Promise.all([
    page.locator('.movement-zone').boundingBox(),
    page.locator('.aim-zone').boundingBox(),
    page.locator('.combat-actions').boundingBox()
  ]);
  for (const box of boxes) {
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  }
  expect(overlaps(boxes[0]!, boxes[1]!)).toBe(false);
  expect(overlaps(boxes[0]!, boxes[2]!)).toBe(false);
  expect(overlaps(boxes[1]!, boxes[2]!)).toBe(false);
  for (const button of await page.locator('.combat-actions button').all()) {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  }
}

async function installPresentationRecorder(page: Page): Promise<void> {
  await page.locator('.combat-ui').evaluate((element) => {
    const state = { phases: [] as string[], maximumProjectilePoints: 0 };
    (window as typeof window & { __combatPresentation?: typeof state }).__combatPresentation = state;
    const record = () => {
      const phase = (element as HTMLElement).dataset.presentation;
      if (phase && state.phases.at(-1) !== phase) state.phases.push(phase);
      state.maximumProjectilePoints = Math.max(
        state.maximumProjectilePoints,
        Number((element as HTMLElement).dataset.projectilePoints || 0)
      );
    };
    new MutationObserver(record).observe(element, {
      attributes: true,
      attributeFilter: ['data-presentation', 'data-projectile-points']
    });
    record();
  });
}

async function readPresentationRecorder(page: Page): Promise<{
  phases: string[];
  maximumProjectilePoints: number;
}> {
  return page.evaluate(() => (
    window as typeof window & {
      __combatPresentation: { phases: string[]; maximumProjectilePoints: number }
    }
  ).__combatPresentation);
}
