import { expect, test, type Page } from '@playwright/test';

import {
  applySyntheticSafeArea,
  readSafeArea,
  SYNTHETIC_SAFE_AREA,
  ZERO_SAFE_AREA
} from './support/safe-area';

test.beforeEach(async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto('/?combat-preview=1&sideways=off');
  await expect(page.locator('.combat-ui')).toBeVisible();
  await expect.poll(() => pageErrors).toEqual([]);
  await expect.poll(() => consoleErrors).toEqual([]);
});

test('portrait/landscape layout is touch-safe and renders deterministic combat', async ({ page }, testInfo) => {
  const ui = page.locator('.combat-ui');
  const viewport = page.viewportSize()!;
  await expect(ui).toHaveAttribute('data-orientation', viewport.width > viewport.height ? 'landscape' : 'portrait');
  await expect(ui).toHaveAttribute('data-selected-relic', 'threadball');
  await expect(ui).toHaveAttribute('data-visual-assets', 'approved-runtime-copies');
  await expect(page.getByText('Your turn')).toBeVisible();
  await expect(page.locator('.player-status')).toHaveAttribute('aria-label', /Player Stitching 100/);
  await expect(page.locator('.loomkeeper-status')).toHaveAttribute('aria-label', /Loomkeeper Stitching 100/);
  if (viewport.width === 844 && viewport.height === 390) {
    expect(Number(await ui.getAttribute('data-battlefield-width'))).toBeGreaterThanOrEqual(660);
    expect(Number(await ui.getAttribute('data-battlefield-height'))).toBeGreaterThanOrEqual(370);
  }

  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible();
  expect((await canvas.screenshot()).byteLength).toBeGreaterThan(2_000);
  await expect(page.locator('.screen-shell')).toHaveCount(0);
  const fullscreenButton = page.locator('.combat-fullscreen-button');
  const fullscreenAvailable = await page.evaluate(() =>
    document.fullscreenEnabled &&
    typeof document.documentElement.requestFullscreen === 'function' &&
    typeof document.exitFullscreen === 'function'
  );
  if (viewport.width > viewport.height && fullscreenAvailable) {
    await expect(ui).toHaveAttribute('data-fullscreen-available', 'true');
    await expect(fullscreenButton).toBeHidden();
  } else {
    await expect(fullscreenButton).toBeHidden();
  }

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

  for (const button of await page.locator('.combat-actions button:visible').all()) {
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

test('safe-area fixture applies deterministic zero and synthetic insets', async ({ page }) => {
  await applySyntheticSafeArea(page, ZERO_SAFE_AREA);
  expect(await readSafeArea(page)).toEqual(ZERO_SAFE_AREA);

  await applySyntheticSafeArea(page, SYNTHETIC_SAFE_AREA);
  expect(await readSafeArea(page)).toEqual(SYNTHETIC_SAFE_AREA);
  const status = await page.locator('.combat-status').boundingBox();
  expect(status).not.toBeNull();
  expect(status!.x).toBeGreaterThanOrEqual(SYNTHETIC_SAFE_AREA.left - 1);
  expect(status!.y).toBeGreaterThanOrEqual(SYNTHETIC_SAFE_AREA.top - 1);
});

test('landscape offers a user-activated full-screen probe with a safe exit', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-844x390', 'Landscape capability probe');

  await page.evaluate(() => {
    let active: Element | null = null;
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => active });
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: async (options?: FullscreenOptions) => {
        (window as Window & { __fullscreenNavigationUi?: string }).__fullscreenNavigationUi =
          options?.navigationUI;
        active = document.documentElement;
        document.dispatchEvent(new Event('fullscreenchange'));
      }
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: async () => {
        active = null;
        document.dispatchEvent(new Event('fullscreenchange'));
      }
    });
    document.dispatchEvent(new Event('fullscreenchange'));
  });

  await page.locator('.pause-button').tap();
  await expect(page.locator('.combat-pause-sheet')).toBeVisible();
  const button = page.getByRole('button', { name: 'Enter full screen' });
  await expect(button).toBeVisible();
  await button.tap();
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-fullscreen', 'true');
  await expect(page.getByRole('button', { name: 'Exit full screen' })).toBeVisible();
  expect(await page.evaluate(() =>
    (window as Window & { __fullscreenNavigationUi?: string }).__fullscreenNavigationUi
  )).toBe('hide');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-orientation', 'portrait');
  await expect(page.getByRole('button', { name: 'Exit full screen' })).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-orientation', 'landscape');

  await page.getByRole('button', { name: 'Exit full screen' }).tap();
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-fullscreen', 'false');

  await page.evaluate(() => {
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: async () => { throw new DOMException('Host declined', 'NotSupportedError'); }
    });
  });
  await button.tap();
  await expect(button).toBeHidden();
  await expect(page.getByText('Full screen is not supported by this app host')).toBeVisible();
});

test('default sideways mode creates touch-safe landscape in a portrait viewport', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  test.skip(testInfo.project.name !== 'chromium-390x844', 'One portrait viewport is sufficient.');
  await page.goto('/?combat-preview=1');
  const ui = page.locator('.combat-ui');
  await expect(ui).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-sideways', 'right');
  await expect(page.locator('#game')).toHaveAttribute('data-sideways', 'right');
  await expect(ui).toHaveAttribute('data-orientation', 'landscape');
  await expect(page.locator('.combat-fullscreen-button')).toBeHidden();
  expect(await page.locator('#game').evaluate((element) => ({
    width: element.clientWidth,
    height: element.clientHeight
  }))).toEqual({ width: 844, height: 390 });
  await assertControlsFit(page);

  const startX = Number(await ui.getAttribute('data-player-x'));
  await dragPad(page, '.movement-zone', 80, 0, 0.36);
  await expect.poll(async () => Number(await ui.getAttribute('data-player-x'))).toBeGreaterThan(startX);
  await selectRelic(page, 'Needlepoint');
  await expect(ui).toHaveAttribute('data-selected-relic', 'needlepoint');
  await dragPad(page, '.aim-zone', 81, 0.34, 0.3);
  await expect(ui).toHaveAttribute('data-phase', 'aim_locked');
  await expect(page.locator('.fire-button')).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('wp-011d-sideways-default.png') });

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('html')).not.toHaveAttribute('data-sideways', /.+/);
  await expect(ui).toHaveAttribute('data-orientation', 'landscape');
  expect(await page.locator('#game').evaluate((element) => ({
    width: element.clientWidth,
    height: element.clientHeight
  }))).toEqual({ width: 844, height: 390 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?combat-preview=1&sideways=left');
  await expect(page.locator('html')).toHaveAttribute('data-sideways', 'left');
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-orientation', 'landscape');
  await assertControlsFit(page);
  const leftStartX = Number(await page.locator('.combat-ui').getAttribute('data-player-x'));
  await dragPad(page, '.movement-zone', 82, 0, -0.36);
  await expect.poll(async () =>
    Number(await page.locator('.combat-ui').getAttribute('data-player-x'))
  ).toBeGreaterThan(leftStartX);
});

test('touch movement, Relic selection, aim lock, and explicit Fire stay separate', async ({ page }) => {
  test.setTimeout(60_000);
  const startX = Number(await page.locator('.combat-ui').getAttribute('data-player-x'));
  await dragPad(page, '.movement-zone', 1, 0.36, 0);
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-last-command', 'move');
  await expect.poll(async () => Math.abs(
    Number(await page.locator('.combat-ui').getAttribute('data-player-x')) - startX
  )).toBeGreaterThanOrEqual(8);
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-presenting', 'false', {
    timeout: 15_000
  });
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-preview-points', '0');

  await selectRelic(page, 'Needlepoint');
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-selected-relic', 'needlepoint');

  await dragPad(page, '.aim-zone', 2, 0.3, -0.34);
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-last-command', 'aim');
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-phase', 'aim_locked');
  await expect.poll(async () => Number(
    await page.locator('.combat-ui').getAttribute('data-preview-points')
  )).toBeGreaterThan(1);
  await expect(page.locator('.fire-button')).toBeEnabled();
  await expect(page.locator('.combat-ui')).not.toHaveAttribute('data-last-command', 'fire');
  const actionAnchor = await page.locator('.combat-actions').boundingBox();
  const aimAnchor = await page.locator('.aim-zone').boundingBox();

  await dragPad(page, '.movement-zone', 3, -0.36, 0);
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-presenting', 'false', {
    timeout: 15_000
  });
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-preview-points', '0');
  await expect(page.locator('.fire-button')).toBeDisabled();
  await expect(page.getByText(/aim again/i)).toBeVisible();
  await dragPad(page, '.aim-zone', 4, 0.3, -0.34);
  await expect(page.locator('.fire-button')).toBeEnabled();

  await installPresentationRecorder(page);
  await page.locator('.fire-button').tap();
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-last-command', 'fire');
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-presenting', 'true');
  await expect.poll(() => page.locator('.combat-actions').evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).opacity)
  )).toBeLessThan(0.05);
  expect(await page.locator('.combat-actions').boundingBox()).toEqual(actionAnchor);
  expect(await page.locator('.aim-zone').boundingBox()).toEqual(aimAnchor);
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-active-actor', 'loomkeeper');
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-presenting', 'false');
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-preview-points', '0');
  await expect(page.locator('.fire-button')).toBeDisabled();
  const presentation = await readPresentationRecorder(page);
  expect(presentation.phases).toEqual(expect.arrayContaining([
    'player-cast-charge',
    'player-cast-formation',
    'player-projectile',
    'player-impact'
  ]));
  expect(presentation.phases.indexOf('player-cast-charge')).toBeLessThan(
    presentation.phases.indexOf('player-cast-formation')
  );
  expect(presentation.phases.indexOf('player-cast-formation')).toBeLessThan(
    presentation.phases.indexOf('player-projectile')
  );
  expect(presentation.maximumProjectilePoints).toBeGreaterThan(1);
});

test('Threadball preserves the approved cast order before the authoritative trace', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-390x844', 'One phone viewport verifies the asset-bound sequence.');
  await installPresentationRecorder(page);
  await dragPad(page, '.aim-zone', 91, 0.3, -0.34);
  await expect(page.locator('.fire-button')).toBeEnabled();
  await page.locator('.fire-button').tap();
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-presenting', 'false', {
    timeout: 15_000
  });
  const presentation = await readPresentationRecorder(page);
  expect(presentation.phases).toEqual(expect.arrayContaining([
    'player-cast-charge',
    'player-cast-formation',
    'player-projectile',
    'player-impact'
  ]));
  expect(presentation.phases.indexOf('player-cast-charge')).toBeLessThan(
    presentation.phases.indexOf('player-cast-formation')
  );
  expect(presentation.phases.indexOf('player-cast-formation')).toBeLessThan(
    presentation.phases.indexOf('player-projectile')
  );
});

test('floating pads appear at the active thumb and Relics expand in place', async ({ page }) => {
  const zone = page.locator('.movement-zone');
  const box = await zone.boundingBox();
  expect(box).not.toBeNull();
  await pointer(page, '.movement-zone', 'pointerdown', 70, 0.28, 0.36);
  await expect(zone).toHaveClass(/is-active/);
  const origin = await zone.evaluate((element) => ({
    x: Number.parseFloat(element.style.getPropertyValue('--pad-x')),
    y: Number.parseFloat(element.style.getPropertyValue('--pad-y'))
  }));
  expect(origin.x).toBeCloseTo(box!.width * 0.28, 0);
  expect(origin.y).toBeCloseTo(box!.height * 0.36, 0);
  await pointer(page, '.movement-zone', 'pointercancel', 70, 0.28, 0.36);
  await expect(zone).not.toHaveClass(/is-active/);

  const trigger = page.locator('.relic-trigger');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.tap();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.relic-chooser')).toBeVisible();
  for (const button of await page.locator('.relic-chooser button').all()) {
    const relicBox = await button.boundingBox();
    expect(relicBox).not.toBeNull();
    expect(relicBox!.width).toBeGreaterThanOrEqual(48);
    expect(relicBox!.height).toBeGreaterThanOrEqual(48);
  }
  await page.getByRole('button', { name: 'Select Spoolburst' }).tap();
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-selected-relic', 'spoolburst');
  await expect(page.locator('.relic-chooser')).toBeHidden();
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
  await expect(page.locator('.combat-pause-sheet').getByText('Turn clock stopped', { exact: true })).toBeVisible();
  await expect(page.locator('.movement-zone')).toHaveAttribute('aria-disabled', 'true');
  await page.locator('.pause-button').tap();
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-paused', 'false');

  const turn = await page.locator('.combat-ui').getAttribute('data-turn');
  await page.locator('.pause-button').tap();
  await expect(page.locator('.combat-pause-sheet')).toBeVisible();
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
  for (const button of await page.locator('.combat-actions button:visible').all()) {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  }
}

async function selectRelic(page: Page, name: 'Threadball' | 'Needlepoint' | 'Spoolburst'): Promise<void> {
  await page.locator('.relic-trigger').tap();
  await expect(page.locator('.relic-chooser')).toBeVisible();
  await page.getByRole('button', { name: `Select ${name}` }).tap();
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
