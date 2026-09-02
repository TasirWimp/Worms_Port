import { expect, test, type Page } from '@playwright/test';

import {
  applySyntheticSafeArea,
  readSafeArea,
  SYNTHETIC_SAFE_AREA,
  ZERO_SAFE_AREA
} from './support/safe-area';
import { skipExcludedProjectBeforeSetup } from './support/project-routing';

test.beforeEach(async ({ page }, testInfo) => {
  skipExcludedProjectBeforeSetup('combat.spec.ts', testInfo);
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
  await expectPlayerCamera(page);
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

test('landscape offers a user-activated full-screen probe with a safe exit', async ({ page }) => {
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

test('V8 hold survives snapshots, release stops, forward Jump and separate Fire reveal retreat', async ({ page }, testInfo) => {
  await page.goto('/?combat-preview=v8&sideways=off');
  const ui = page.locator('.combat-v8');
  await expect(ui).toHaveAttribute('data-ruleset', 'nimble-knots-artillery-v8');
  await expect(ui).toHaveAttribute('data-visual-assets', 'approved-runtime-copies');
  await expect(page.locator('.fire-button')).toBeDisabled();
  for (const relic of ['Needlepoint', 'Spoolburst', 'Threadball'] as const) {
    await selectRelic(page, relic);
    await expect(page.locator('.relic-trigger')).toHaveText(relic);
    const fit = await page.locator('.relic-trigger').evaluate((element) => {
      const box = element.getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(element);
      return element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight &&
        Array.from(range.getClientRects()).every((line) => line.left >= box.left && line.right <= box.right &&
          line.top >= box.top && line.bottom <= box.bottom);
    });
    expect(fit, `${relic} must be completely readable inside its touch target`).toBe(true);
  }
  const messageBox = await page.locator('.combat-message').boundingBox();
  const actionsBox = await page.locator('.combat-actions').boundingBox();
  expect(messageBox).not.toBeNull(); expect(actionsBox).not.toBeNull();
  expect(overlaps(messageBox!, actionsBox!)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('v8-portrait-candidate.png') });
  const tick = Number(await ui.getAttribute('data-simulation-tick'));
  const start = Number(await ui.getAttribute('data-player-x'));
  await pointer(page, '.movement-zone', 'pointerdown', 201, 0.5, 0.5);
  await pointer(page, '.movement-zone', 'pointermove', 201, 2.2, 0.5);
  await expect(ui).toHaveAttribute('data-held-direction', '1');
  await expect.poll(async () => Number(await ui.getAttribute('data-simulation-tick'))).toBeGreaterThan(tick + 12);
  await expect(page.locator('.movement-zone')).toHaveClass(/is-active/);
  expect(Number(await ui.getAttribute('data-player-x'))).toBeGreaterThan(start);
  expect(Number(await ui.getAttribute('data-interpolation-samples'))).toBeLessThanOrEqual(2);
  await pointer(page, '.movement-zone', 'pointerup', 201, 2.2, 0.5);
  await expect(ui).toHaveAttribute('data-held-direction', '0');
  const released = Number(await ui.getAttribute('data-player-x'));
  const releaseTick = Number(await ui.getAttribute('data-simulation-tick'));
  await expect.poll(async () => Number(await ui.getAttribute('data-simulation-tick'))).toBeGreaterThan(releaseTick + 6);
  expect(Number(await ui.getAttribute('data-player-x'))).toBe(released);
  await page.getByRole('button', { name: 'Face left', exact: true }).tap();
  await expect(ui).toHaveAttribute('data-player-facing', 'left');
  expect(Number(await ui.getAttribute('data-player-x'))).toBe(released);
  const jump = page.getByRole('button', { name: 'Jump forward' });
  const jumpBox = await jump.boundingBox();
  expect(jumpBox!.width).toBeGreaterThanOrEqual(48); expect(jumpBox!.height).toBeGreaterThanOrEqual(48);
  await jump.tap();
  await expect(ui).toHaveAttribute('data-player-grounded', 'false');
  await expect.poll(async () => Number(await ui.getAttribute('data-player-x'))).toBeLessThan(released - 3);
  await expect(ui).toHaveAttribute('data-held-direction', '0');
  await expect(ui).toHaveAttribute('data-player-grounded', 'true', { timeout: 5000 });
  await dragPad(page, '.aim-zone', 202, 0.3, 0);
  await expect(page.locator('.fire-button')).toBeEnabled();
  await expect(ui).toHaveAttribute('data-combat-phase', 'action');
  await page.locator('.fire-button').tap();
  await expect(ui).toHaveAttribute('data-combat-phase', 'retreat', { timeout: 6000 });
  await expect(ui).not.toHaveAttribute('data-presentation', 'projectile');
  await expect(page.locator('.combat-turn')).toContainText('Retreat');
  await expect(page.locator('.fire-button')).toBeDisabled();
  const actorX = Number(await ui.getAttribute('data-player-x'));
  const left = Number(await ui.getAttribute('data-camera-left'));
  expect(actorX).toBeGreaterThanOrEqual(left); expect(actorX).toBeLessThanOrEqual(left + 1024);
});

test('V8 right left off and actual-landscape keep safe touch targets and rotation mapping', async ({ page }, testInfo) => {
  for (const mode of ['right', 'left', 'off'] as const) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/?combat-preview=v8&sideways=${mode}`);
    const ui = page.locator('.combat-v8');
    await expect(ui).toBeVisible();
    if (mode === 'off') await applySyntheticSafeArea(page, SYNTHETIC_SAFE_AREA);
    else {
      // The existing helper deliberately expects an unrotated composition.
      // Inject native insets here, then assert their exact logical rotation.
      await page.evaluate((native) => {
        for (const side of ['top', 'right', 'bottom', 'left'] as const) {
          document.documentElement.style.setProperty(`--native-safe-area-${side}`, `${native[side]}px`);
        }
        window.dispatchEvent(new Event('resize'));
      }, SYNTHETIC_SAFE_AREA);
      await expect.poll(() => readSafeArea(page)).toEqual(mode === 'right'
        ? { top: 14, right: 22, bottom: 12, left: 18 }
        : { top: 12, right: 18, bottom: 14, left: 22 });
    }
    await assertControlsFit(page);
    for (const control of ['.jump-button', '.face-left', '.face-right']) {
      const box = await page.locator(control).boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(48); expect(box!.height).toBeGreaterThanOrEqual(48);
      expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(391);
      expect(box!.y + box!.height).toBeLessThanOrEqual(845);
    }
    await pointer(page, '.movement-zone', 'pointerdown', 203, 0.5, 0.5);
    await pointer(page, '.movement-zone', 'pointermove', 203,
      mode === 'off' ? 1.8 : 0.5, mode === 'right' ? 1.8 : mode === 'left' ? -0.8 : 0.5);
    await expect(ui).toHaveAttribute('data-held-direction', '1');
    await pointer(page, '.movement-zone', 'pointerup', 203, 0.5, 0.5);
    await expect(ui).toHaveAttribute('data-held-direction', '0');
    await page.screenshot({ path: testInfo.outputPath(`v8-${mode}-candidate.png`) });
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('html')).not.toHaveAttribute('data-sideways', /.+/);
    await expect(ui).toHaveAttribute('data-orientation', 'landscape');
    await assertControlsFit(page);
  }
});

test('current opening survey continuously zooms to the player view', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?combat-preview=1&sideways=off');
  await expect(page.locator('.combat-ui')).toBeVisible();
  const ui = page.locator('.combat-ui');
  const startWidth = Number(await ui.getAttribute('data-camera-width'));
  const battlefieldHeight = await ui.getAttribute('data-battlefield-height');
  const verticalScale = await ui.getAttribute('data-world-scale');
  expect(startWidth).toBeGreaterThan(1_500);
  await expect(ui).toHaveAttribute('data-camera-top', '0.00');
  await page.waitForTimeout(1_000);
  const middleWidth = Number(await ui.getAttribute('data-camera-width'));
  expect(middleWidth).toBeLessThan(startWidth);
  expect(middleWidth).toBeGreaterThan(1_024);
  await expect(ui).toHaveAttribute('data-battlefield-height', battlefieldHeight!);
  await expect(ui).toHaveAttribute('data-world-scale', verticalScale!);
  await expect.poll(async () => Number(await ui.getAttribute('data-camera-width')), {
    timeout: 4_000
  }).toBe(1_024);
  await expectPlayerCamera(page);
  await expect(ui).toHaveAttribute('data-camera-top', '0.00');
  await expect(ui).toHaveAttribute('data-battlefield-height', battlefieldHeight!);
  await expect(ui).toHaveAttribute('data-world-scale', verticalScale!);
  await expect(page.getByText('← Swipe left to find Loomkeeper')).toBeVisible();
});

test('current camera follows a live preview edge, preserves a locked aim, and preserves post-lock panning', async ({ page }) => {
  const ui = page.locator('.combat-ui');
  const initialCamera = await expectPlayerCamera(page);

  // The long arc remains an editable preview while the thumb is down. Its
  // terrain endpoint moves into the view at the outgoing edge; no command has
  // been submitted yet.
  await pointer(page, '.aim-zone', 'pointerdown', 43, 0.5, 0.55);
  await pointer(page, '.aim-zone', 'pointermove', 43, 0.99, 0.27);
  await expect(ui).toHaveAttribute('data-phase', 'aiming');
  await expect(ui).toHaveAttribute('data-camera-width', '1024');
  await expect.poll(async () => Number(await ui.getAttribute('data-camera-left'))).toBeGreaterThan(initialCamera + 20);
  await expect(ui).not.toHaveAttribute('data-last-command', 'aim');
  const previewCamera = Number(await ui.getAttribute('data-camera-left'));
  await pointer(page, '.aim-zone', 'pointerup', 43, 0.99, 0.27);
  await expect(ui).toHaveAttribute('data-phase', 'aim_locked');
  await expect.poll(async () => Number(await ui.getAttribute('data-camera-left'))).toBe(previewCamera);

  await dragBattlefield(page, 44, 0.74, 0.22, 0.35, 0.22);
  await expect.poll(async () => Number(await ui.getAttribute('data-camera-left'))).toBeGreaterThan(previewCamera + 120);
  await expect(page.locator('.combat-camera-hint')).toBeHidden();
  await expect(ui).toHaveAttribute('data-last-command', 'aim');

  await dragPad(page, '.aim-zone', 45, 0.3, -0.34);
  await expect(ui).toHaveAttribute('data-phase', 'aim_locked');
  const lockedCamera = Number(await ui.getAttribute('data-camera-left'));
  await dragBattlefield(page, 46, 0.32, 0.22, 0.7, 0.35);
  await expect.poll(async () => Number(await ui.getAttribute('data-camera-left'))).not.toBe(lockedCamera);
  await expect(ui).toHaveAttribute('data-phase', 'aim_locked');
  await expect(page.locator('.fire-button')).toBeEnabled();
});

test('V4 actor Stitching cards remain at their Wizard anchors and disappear off-screen', async ({ page }) => {
  const ui = page.locator('.combat-ui');
  await expect.poll(async () => Number(await ui.getAttribute('data-camera-width')), {
    timeout: 4_000
  }).toBe(1_024);
  await expect(page.locator('.loomkeeper-status')).toBeHidden();

  await dragBattlefield(page, 47, 0.82, 0.3, 0.08, 0.3);
  await expect.poll(async () => Number(await ui.getAttribute('data-camera-left'))).toBeGreaterThan(650);
  await expect(page.locator('.player-status')).toBeHidden();
  await expect(page.locator('.loomkeeper-status')).toBeVisible();
});

test('Threadball preserves the approved cast order before the authoritative trace', async ({ page }) => {
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
  await expect(page.locator('.relic-needlepoint .relic-role')).toHaveText('Long · 30');
  await expect(page.locator('.relic-threadball .relic-role')).toHaveText('Medium · 45');
  await expect(page.locator('.relic-spoolburst .relic-role')).toHaveText('Short · 80');
  for (const button of await page.locator('.relic-chooser button').all()) {
    const relicBox = await button.boundingBox();
    expect(relicBox).not.toBeNull();
    expect(relicBox!.width).toBeGreaterThanOrEqual(48);
    expect(relicBox!.height).toBeGreaterThanOrEqual(48);
  }
  await page.getByRole('button', {
    name: 'Select Spoolburst, short range, 80 maximum damage'
  }).tap();
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-selected-relic', 'spoolburst');
  await expect(page.locator('.relic-chooser')).toBeHidden();
});

test('compact landscape visual viewport keeps every control visible and separate', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 800, height: 300 });
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-orientation', 'landscape');
  await assertControlsFit(page);
  await page.screenshot({ path: testInfo.outputPath('wp-011a-compact-landscape.png') });
});

test('V6 overlong movement commits in both directions, turns, and shows its budget', async ({ page }) => {
  test.setTimeout(90_000);

  const ui = page.locator('.combat-ui');
  const label = page.locator('.movement-zone .pad-label');
  await expect(label).toHaveText('Move 8/8');
  await expect(page.locator('.movement-zone')).toHaveAttribute(
    'aria-label',
    'Movement pad. 8 of 8 steps remaining.'
  );
  const startX = Number(await ui.getAttribute('data-player-x'));

  await dragPad(page, '.movement-zone', 90, 1.4, 0);
  await expect.poll(async () => Number(await ui.getAttribute('data-player-x'))).toBe(startX + 32);
  await expect(label).toHaveText('Move 4/8');
  await expect(ui).toHaveAttribute('data-player-facing', 'right');

  await dragPad(page, '.movement-zone', 91, -1.4, 0);
  await expect.poll(async () => Number(await ui.getAttribute('data-player-x'))).toBe(startX);
  await expect(label).toHaveText('Move 0/8');
  await expect(ui).toHaveAttribute('data-player-facing', 'left');

  const exhaustedX = Number(await ui.getAttribute('data-player-x'));
  await dragPad(page, '.movement-zone', 92, 1.4, 0);
  await expect(ui).toHaveAttribute('data-player-facing', 'right');
  await expect.poll(async () => Number(await ui.getAttribute('data-player-x'))).toBe(exhaustedX);
  await expect(label).toHaveText('Move 0/8');

  await page.goto('/?combat-preview=1');
  const sidewaysUi = page.locator('.combat-ui');
  const sidewaysLabel = page.locator('.movement-zone .pad-label');
  await expect(page.locator('html')).toHaveAttribute('data-sideways', 'right');
  await expect(sidewaysLabel).toHaveText('Move 8/8');
  const sidewaysStartX = Number(await sidewaysUi.getAttribute('data-player-x'));

  await dragPad(page, '.movement-zone', 93, 0, 1.4);
  await expect.poll(async () => Number(
    await sidewaysUi.getAttribute('data-player-x')
  )).toBe(sidewaysStartX + 32);
  await expect(sidewaysLabel).toHaveText('Move 4/8');

  await dragPad(page, '.movement-zone', 94, 0, -1.4);
  await expect.poll(async () => Number(
    await sidewaysUi.getAttribute('data-player-x')
  )).toBe(sidewaysStartX);
  await expect(sidewaysLabel).toHaveText('Move 0/8');
  await expect(sidewaysUi).toHaveAttribute('data-player-facing', 'left');
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

async function expectPlayerCamera(page: Page): Promise<number> {
  const ui = page.locator('.combat-ui');
  // The current preview follows the latest ruleset. V7 derives its spawn from
  // terrain, so V4's fixed left=0 is not the current player-view contract.
  const playerXAttribute = await ui.getAttribute('data-player-x');
  expect(playerXAttribute).toMatch(/^\d+(?:\.\d+)?$/);
  const playerX = Number(playerXAttribute);
  expect(Number.isFinite(playerX)).toBe(true);
  const expectedLeft = Math.max(0, Math.min(2_048 - 1_024, playerX - 1_024 / 2));
  await expect(ui).toHaveAttribute('data-camera-width', '1024', { timeout: 4_000 });
  await expect(ui).toHaveAttribute('data-camera-left', expectedLeft.toFixed(2));
  await expect(ui).toHaveAttribute('data-camera-top', '0.00');
  return expectedLeft;
}

async function dragBattlefield(
  page: Page,
  pointerId: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): Promise<void> {
  const ui = page.locator('.combat-ui');
  const canvas = page.locator('#game canvas');
  const [x, y, width, height, canvasBox] = await Promise.all([
    ui.getAttribute('data-battlefield-x'),
    ui.getAttribute('data-battlefield-y'),
    ui.getAttribute('data-battlefield-width'),
    ui.getAttribute('data-battlefield-height'),
    canvas.boundingBox()
  ]);
  expect(canvasBox).not.toBeNull();
  const field = {
    x: Number(x), y: Number(y), width: Number(width), height: Number(height)
  };
  expect(Object.values(field).every(Number.isFinite)).toBe(true);
  const ratios = {
    fromX: (field.x + field.width * fromX) / canvasBox!.width,
    fromY: (field.y + field.height * fromY) / canvasBox!.height,
    toX: (field.x + field.width * toX) / canvasBox!.width,
    toY: (field.y + field.height * toY) / canvasBox!.height
  };
  expect(
    Object.values(ratios).every(Number.isFinite),
    JSON.stringify({ field, canvasBox, ratios })
  ).toBe(true);
  await pointer(page, '#game canvas', 'pointerdown', pointerId, ratios.fromX, ratios.fromY);
  await pointer(page, '#game canvas', 'pointermove', pointerId, ratios.toX, ratios.toY);
  await pointer(page, '#game canvas', 'pointerup', pointerId, ratios.toX, ratios.toY);
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
