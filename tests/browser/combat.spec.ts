import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createRuntimeServer } from '../../server/src/runtime';
import { V8_R1_RULESET_ID } from '../../shared/simulation-v8';
import { V8_AUTOMATION_ID } from '../../shared/combat-version';
import { SIM_RULES } from '../../shared/simulation';
import { protocolEventsV8, ChallengeSnapshotV8RuntimeSchema, ChallengeResultV8RuntimeSchema,
  type ChallengeSnapshotV8Runtime } from '../../shared/protocol-v8';
import { WIZARD_ANIMATION_SCALE_IN_WORLD, WIZARD_UNRAVEL_ROOT_ORIGIN_Y } from '../../client/src/combat/loomseed-origin';

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

test('V9 resource engineering preview is local-only and keeps V7 Practice unselected', async ({ page }) => {
  test.setTimeout(60_000);
  const previewRequests: string[] = [];
  page.on('request', request => previewRequests.push(request.url()));
  await page.goto('/?combat-preview=v9');
  const ui = page.locator('.combat-v9');
  await expect(ui).toBeVisible();
  await expect(ui).toHaveAttribute('data-preview', 'V9 resource engineering preview · local-only');
  await expect(ui).toHaveAttribute('data-ruleset', 'nimble-knots-artillery-v9');
  await expect(page.locator('.practice-shell')).toHaveCount(0);
  expect(previewRequests.some(url => /socket\.io|\/(?:session|challenge|reward)(?:\/|$|\?)/.test(url))).toBe(false);
  await expect(page.locator('.v9-thread')).toHaveText('Thread 3/9');
  await expect(page.getByRole('button', { name: 'Actions' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Actions' }).tap();
  await expect(page.getByRole('button', { name: 'Attack' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Defense' })).toBeVisible();
  await page.getByRole('button', { name: 'Attack' }).tap();
  await expect(page.getByRole('button', { name: 'Threadball · 2' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Spoolburst · 5' })).toBeDisabled();
  await page.getByRole('button', { name: 'Threadball · 2' }).tap();
  await expect(ui).toHaveAttribute('data-selected-relic', 'threadball');
  await expect(page.locator('.combat-message')).toHaveText('Threadball selected. Lock aim, then Use.');
  await expect(ui).toHaveAttribute('data-offense-allowed', 'true');
  await dragPad(page, '.combat-v9 .aim-zone', 909, 0.35, -0.35);
  // The local fixture can be draining its bounded tick credit immediately after
  // a selection receipt; a fresh gesture is the documented recovery path.
  await page.waitForTimeout(80);
  await dragPad(page, '.combat-v9 .aim-zone', 910, 0.35, -0.35);
  await expect(ui).toHaveAttribute('data-aim-locked', 'true');
  await expect(page.locator('.fire-button')).toBeEnabled();
  await page.locator('.fire-button').tap();
  await expect(ui).toHaveAttribute('data-combat-phase', 'projectile');
  await expect(ui).toHaveAttribute('data-presentation', 'projectile');
  const flightTick = Number(await ui.getAttribute('data-simulation-tick'));
  await expect.poll(async () => Number(await ui.getAttribute('data-simulation-tick'))).toBeGreaterThan(flightTick);
  await expect(ui).toHaveAttribute('data-projectile-points', /[2-9]\d*/);
  for (const button of await page.locator('.combat-v9 .combat-actions button:visible').all()) {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(48); expect(box!.height).toBeGreaterThanOrEqual(48);
  }

  await page.goto('/?combat-preview=v9');
  await expect(page.locator('.combat-v9')).toBeVisible();
  await page.getByRole('button', { name: 'Actions' }).tap();
  await page.getByRole('button', { name: 'Defense' }).tap();
  await page.getByRole('button', { name: 'Guard · 2 Thread' }).tap();
  await expectV9ArmedActionAfterAuthorityTick(page, page.locator('.combat-v9'), 'Use Guard · 2 Thread');
  await page.getByRole('button', { name: 'Use Guard · 2 Thread' }).tap();
  await expect(page.locator('.player-status')).toHaveAttribute('aria-label', /Shield 24 · expires turn 2/);
  await dragPad(page, '.combat-v9 .aim-zone', 933, 0.35, -0.35);
  const armedUse = page.getByRole('button', { name: 'Use Threadball · 2' });
  await expect(armedUse).toBeDisabled();
  await expect(armedUse).toHaveAttribute('title', /Need 2 Thread for Threadball/);
  await expect(page.locator('.combat-message')).toContainText('Need 2 Thread for Threadball');
  await page.getByRole('button', { name: 'Actions' }).tap();
  await page.getByRole('button', { name: 'Attack' }).tap();
  const spentThreadball = page.getByRole('button', { name: 'Threadball · 2', exact: true });
  await expect(spentThreadball).toBeDisabled();
  await expect(spentThreadball).toHaveAttribute('title', /Need 2 Thread/);

  await page.goto('/?combat-preview=v9');
  await expect(page.locator('.combat-v9')).toBeVisible();
  await page.getByRole('button', { name: 'Actions' }).tap();
  await page.getByRole('button', { name: 'Attack' }).tap();
  await page.getByRole('button', { name: 'Needlepoint · 3' }).tap();
  await expect(page.locator('.combat-v9')).toHaveAttribute('data-selected-relic', 'needlepoint');
  await expect(page.locator('.combat-message')).toHaveText('Needlepoint selected. Lock aim, then Use.');

  await page.goto('/?combat-preview=v9');
  await expect(page.locator('.combat-v9')).toBeVisible();
  await page.getByRole('button', { name: 'Actions' }).tap();
  await page.getByRole('button', { name: 'Defense' }).tap();
  await page.getByRole('button', { name: 'Leap · 2 Thread' }).tap();
  await expectV9ArmedActionAfterAuthorityTick(page, page.locator('.combat-v9'), 'Use Leap · 2 Thread');
  await page.getByRole('button', { name: 'Use Leap · 2 Thread' }).tap();
  await expect(page.locator('.combat-v9')).toHaveAttribute('data-player-airborne', 'true');
  await page.locator('.pause-button').tap();
  await expect(page.locator('.combat-v9')).toHaveAttribute('data-paused', 'true');
  await expect(page.getByRole('button', { name: 'Resume' })).toBeEnabled();
  await page.getByRole('button', { name: 'Start fresh preview' }).tap();
  await expect(page.locator('.combat-v9')).toHaveAttribute('data-paused', 'false');
  await expect(page.locator('.combat-v9')).toHaveAttribute('data-input-epoch', '0');
  expect(Number(await page.locator('.combat-v9').getAttribute('data-simulation-tick'))).toBeLessThan(16);
  await expect(page.locator('.v9-thread')).toHaveText('Thread 3/9');
  await dragPad(page, '.combat-v9 .aim-zone', 934, 0.35, -0.35);
  await expect(page.locator('.combat-v9')).toHaveAttribute('data-aim-locked', 'true');
  await page.locator('.pause-button').tap();
  await expect(page.locator('.combat-v9')).toHaveAttribute('data-paused', 'true');
  await page.getByRole('button', { name: 'Resume' }).tap();
  await expect(page.locator('.combat-v9')).toHaveAttribute('data-paused', 'false');

  // The scene owns neutralization across browser interruption. An old pointer
  // release cannot become an aim after its cancel snapshot; a fresh touch can.
  await page.goto('/?combat-preview=v9');
  await expect(page.locator('.combat-v9')).toBeVisible();
  for (const pointerId of [941, 942]) {
    const aim = page.locator('.combat-v9 .aim-zone'); const box = await aim.boundingBox();
    expect(box).not.toBeNull();
    await aim.dispatchEvent('pointerdown', { pointerId, button: 0, clientX: box!.x + box!.width / 2, clientY: box!.y + box!.height / 2 });
    await aim.dispatchEvent('pointermove', { pointerId, button: 0, clientX: box!.x + box!.width * 0.8, clientY: box!.y + box!.height * 0.25 });
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await aim.dispatchEvent('pointerup', { pointerId, button: 0, clientX: box!.x + box!.width * 0.8, clientY: box!.y + box!.height * 0.25 });
    await expect(page.locator('.combat-v9')).toHaveAttribute('data-aim-locked', 'false');
    await dragPad(page, '.combat-v9 .aim-zone', pointerId + 100, 0.35, -0.35);
    await expect(page.locator('.combat-v9')).toHaveAttribute('data-aim-locked', 'true');
  }

  await page.goto('/?combat-preview=v9');
  await expect(page.locator('.combat-v9')).toBeVisible();
  await dragPad(page, '.combat-v9 .movement-zone', 910, 0.2, -0.5);
  await expect(page.locator('.combat-v9')).toHaveAttribute('data-player-airborne', 'true');

  await page.goto('/?sideways=off');
  await page.getByRole('button', { name: 'Start Practice' }).tap();
  await expect(page.locator('.combat-ui')).toBeVisible();
  await expect(page.locator('.combat-v9')).toHaveCount(0);
  await expect(page.locator('.movement-zone')).toHaveAttribute('aria-label', /8 of 8 steps remaining/);
});

test('V9 turn-two carried Spoolburst yields to immediately selected affordable Relics', async ({ page }) => {
  test.setTimeout(55_000);
  await page.goto('/?combat-preview=v9&sideways=off');
  const ui = page.locator('.combat-v9'); await expect(ui).toBeVisible();
  await expect.poll(async () => ({
    actor: await ui.getAttribute('data-active-actor'), phase: await ui.getAttribute('data-combat-phase'), thread: await ui.getAttribute('data-player-thread')
  }), { timeout: 40_000 }).toEqual({ actor: 'player', phase: 'action', thread: '6' });

  await page.getByRole('button', { name: 'Actions' }).tap();
  await page.getByRole('button', { name: 'Attack' }).tap();
  await page.getByRole('button', { name: 'Spoolburst · 5' }).tap();
  await expect(ui).toHaveAttribute('data-selected-relic', 'spoolburst');
  await page.getByRole('button', { name: 'Actions' }).tap();
  await page.getByRole('button', { name: 'Defense' }).tap();
  await page.getByRole('button', { name: 'Guard · 2 Thread' }).tap();
  await page.getByRole('button', { name: 'Use Guard · 2 Thread' }).tap();
  await expect(ui).toHaveAttribute('data-player-thread', '4');
  await dragPad(page, '.combat-v9 .aim-zone', 961, 0.35, -0.35);
  const use = page.locator('.fire-button');
  await expect(use).toBeDisabled();
  await expect(use).toHaveAttribute('title', /Need 5 Thread for Spoolburst/);

  for (const [relic, id] of [['Threadball', 'threadball'], ['Needlepoint', 'needlepoint']] as const) {
    await page.getByRole('button', { name: 'Actions' }).tap();
    await page.getByRole('button', { name: 'Attack' }).tap();
    await page.getByRole('button', { name: `${relic} · ${relic === 'Threadball' ? 2 : 3}` }).tap();
    await expect(ui).toHaveAttribute('data-selected-relic', id);
    await expect(page.locator('.combat-message')).toHaveText(`${relic} selected. Lock aim, then Use.`);
  }
});

test('V9 local re-entry retires paused and terminal adapters without a transport', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = []; const requests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.goto('/?combat-preview=v9&sideways=off');
  const ui = page.locator('.combat-v9'); await expect(ui).toBeVisible();
  await page.locator('.pause-button').tap(); await expect(ui).toHaveAttribute('data-paused', 'true');
  const pausedAdapter = await ui.elementHandle();
  await page.getByRole('button', { name: 'Start fresh preview' }).tap();
  expect(await pausedAdapter!.evaluate(element => element.isConnected)).toBe(false);
  await expect(ui).toHaveAttribute('data-input-epoch', '0');
  await expect(ui).toHaveAttribute('data-player-thread', '3');
  expect(Number(await ui.getAttribute('data-simulation-tick'))).toBeLessThan(16);

  // Each paused/resumed local barrier is authoritative fixture work. The 65th
  // pause reaches its documented lifecycle terminal without adding a test seam.
  await page.evaluate(async () => {
    const root = document.querySelector<HTMLElement>('.combat-v9')!;
    const button = root.querySelector<HTMLButtonElement>('.pause-button')!;
    const waitFor = (attribute: string, value: string) => new Promise<void>(resolve => {
      if (root.dataset[attribute] === value) { resolve(); return; }
      const observer = new MutationObserver(() => {
        if (root.dataset[attribute] === value) { observer.disconnect(); resolve(); }
      });
      observer.observe(root, { attributes: true, attributeFilter: [`data-${attribute.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`] });
    });
    for (let cycle = 0; cycle < 64; cycle += 1) {
      button.click(); await waitFor('paused', 'true'); button.click(); await waitFor('paused', 'false');
    }
    button.click(); await waitFor('terminal', 'true');
  });
  await expect(ui).toHaveAttribute('data-terminal', 'true');
  await expect(page.getByRole('button', { name: 'Start fresh preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Start fresh preview' }).tap();
  await expect(ui).toHaveAttribute('data-terminal', 'false');
  await expect(ui).toHaveAttribute('data-input-epoch', '0');
  await expect(ui).toHaveAttribute('data-player-thread', '3');
  expect(Number(await ui.getAttribute('data-simulation-tick'))).toBeLessThan(16);
  await dragPad(page, '.combat-v9 .aim-zone', 955, 0.35, -0.35);
  await expect(ui).toHaveAttribute('data-aim-locked', 'true');
  expect(errors).toEqual([]);
  expect(requests.some(url => /socket\.io|\/(?:session|challenge|reward)(?:\/|$|\?)/.test(url))).toBe(false);
});

test('V9 actor cards keep compact visible values and full labels through phone modes', async ({ page }) => {
  test.setTimeout(60_000);
  for (const mode of ['right', 'left', 'off'] as const) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/?combat-preview=v9&sideways=${mode}`);
    if (mode === 'off') await applySyntheticSafeArea(page, SYNTHETIC_SAFE_AREA);
    await assertV9ActorCardsFit(page);
    const focus = page.locator('.combat-v9 .camera-focus-button:visible').first();
    if (await focus.count()) { await focus.tap(); await page.waitForTimeout(350); await assertV9ActorCardsFit(page); }
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/?combat-preview=v9');
  await assertV9ActorCardsFit(page);
});

test('V10 terrain preview keeps the inherited phone guidance local and surveys its map-specific starts', async ({ page }) => {
  test.setTimeout(60_000);
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?combat-preview=v10&sideways=off');
  await applySyntheticSafeArea(page, SYNTHETIC_SAFE_AREA);
  const ui = page.locator('.combat-v10');
  await expect(ui).toBeVisible();
  await expect(ui).toHaveAttribute('data-preview', 'V10 terrain engineering preview · local-only');
  await expect(ui).toHaveAttribute('data-ruleset', 'nimble-knots-artillery-v10');
  await expect(ui).toHaveAttribute('data-terrain-profile', 'rising-braid');
  await expect(page.locator('.practice-shell')).toHaveCount(0);
  expect(requests.some(url => /socket\.io|\/(?:session|challenge|reward)(?:\/|$|\?)/.test(url))).toBe(false);

  await expect(ui).toHaveAttribute('data-opening-survey', 'true');
  expect(Number(await ui.getAttribute('data-camera-width'))).toBeGreaterThan(1024);
  await assertV9ActorCardsFit(page);
  await expect(page.locator('.v9-action-menu')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Actions' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use', exact: true })).toBeDisabled();

  const pause = await page.locator('.pause-button').boundingBox();
  expect(pause).not.toBeNull();
  expect(pause!.x).toBeLessThan(390 / 2);
  expect(pause!.y).toBeLessThan(844 / 2);

  await expect(ui).toHaveAttribute('data-opening-survey', 'false', { timeout: 5_000 });
  await expect(ui).toHaveAttribute('data-camera-width', '1024');
  const direction = page.locator('.combat-v10 .camera-focus-loomkeeper');
  await expect(direction).toBeVisible();
  await expect(direction).toHaveAttribute('data-side', 'right');
  await expect(direction).toHaveAttribute('aria-label', /Loomkeeper, 100 Stitching, off-screen right/);

  await page.goto('/?combat-preview=v10&sideways=off');
  await expect(ui).toHaveAttribute('data-opening-survey', 'true');
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await expect(ui).toHaveAttribute('data-opening-survey', 'false');
  await expect(ui).toHaveAttribute('data-camera-width', '1024');

  await page.getByRole('button', { name: 'Actions' }).tap();
  await expect(page.getByRole('button', { name: 'Attack' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Defense' })).toBeVisible();
  await page.getByRole('button', { name: 'Attack' }).tap();
  await page.getByRole('button', { name: 'Needlepoint · 3' }).tap();
  await expect(ui).toHaveAttribute('data-selected-relic', 'needlepoint');
  await expect(page.locator('.combat-message')).toHaveText('Needlepoint selected. Lock aim, then Use.');
  await dragPad(page, '.combat-v10 .aim-zone', 1510, 0.35, -0.35);
  await expect(ui).toHaveAttribute('data-aim-locked', 'true');
  await expect(page.getByRole('button', { name: 'Use Needlepoint · 3' })).toBeEnabled();
  await page.getByRole('button', { name: 'Use Needlepoint · 3' }).tap();
  await expect(ui).toHaveAttribute('data-combat-phase', 'projectile');
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

test('V8 r1 unified pad taps, walks, centers, reverses, hops and keeps aim Fire separate', async ({ page }, testInfo) => {
  await page.goto('/?combat-preview=v8-r1&sideways=off');
  const ui = page.locator('.combat-v8-r1');
  await expect(ui).toHaveAttribute('data-ruleset', 'nimble-knots-artillery-v8-r1');
  await expect(page.locator('.jump-button, .face-left, .face-right')).toHaveCount(0);
  await expect(page.locator('.movement-zone')).toHaveAttribute('aria-label', /Tap a side.*Push up/);
  await assertControlsFit(page);
  const start = Number(await ui.getAttribute('data-player-x'));
  const epoch = await ui.getAttribute('data-input-epoch');
  await r1Pointer(page, 'pointerdown', 301, -32, 0);
  await r1Pointer(page, 'pointerup', 301, -32, 0);
  await expect(ui).toHaveAttribute('data-player-facing', 'left');
  expect(Number(await ui.getAttribute('data-player-x'))).toBe(start);
  expect(await ui.getAttribute('data-input-epoch')).toBe(epoch);
  await page.locator('.movement-zone').dispatchEvent('lostpointercapture', { pointerId: 301 });
  expect(await ui.getAttribute('data-input-epoch')).toBe(epoch);
  await r1Pointer(page, 'pointerdown', 302, 0, 0);
  await r1Pointer(page, 'pointermove', 302, 10, 0);
  await expect(ui).toHaveAttribute('data-held-direction', '1');
  await r1Pointer(page, 'pointermove', 302, 180, 0);
  const walkingTick = Number(await ui.getAttribute('data-simulation-tick'));
  await expect.poll(async () => Number(await ui.getAttribute('data-simulation-tick'))).toBeGreaterThan(walkingTick + 6);
  await expect(page.locator('.movement-zone')).toHaveClass(/is-active/);
  expect(Number(await ui.getAttribute('data-player-x'))).toBeGreaterThan(start);
  await r1Pointer(page, 'pointermove', 302, 0, 0);
  await expect(ui).toHaveAttribute('data-held-direction', '0');
  await expect(page.locator('.movement-zone')).toHaveClass(/is-active/);
  expect(await ui.getAttribute('data-input-epoch')).toBe(epoch);
  await r1Pointer(page, 'pointermove', 302, -30, 0);
  await expect(ui).toHaveAttribute('data-held-direction', '-1');
  await r1Pointer(page, 'pointermove', 302, 30, 0);
  await expect(ui).toHaveAttribute('data-held-direction', '1');
  await r1Pointer(page, 'pointermove', 302, -40, -40);
  await expect(ui).toHaveAttribute('data-player-grounded', 'false');
  await expect(ui).toHaveAttribute('data-player-facing', 'left');
  await expect(ui).toHaveAttribute('data-player-animation', 'wp015c-wizard-idle');
  await r1Pointer(page, 'pointerup', 302, -140, -140);
  await expect(ui).toHaveAttribute('data-held-direction', '0');
  const airborneX = Number(await ui.getAttribute('data-player-x'));
  await expect.poll(async () => Number(await ui.getAttribute('data-player-x'))).toBeLessThan(airborneX - 2);
  await expect(ui).toHaveAttribute('data-player-grounded', 'true', { timeout: 5000 });
  await dragPad(page, '.aim-zone', 303, 0.3, 0);
  await expect(page.locator('.fire-button')).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('v8-r1-unified-pad-candidate.png') });
  await page.locator('.fire-button').tap();
  await expect(ui).toHaveAttribute('data-combat-phase', 'retreat', { timeout: 6000 });
  await expect(page.locator('.fire-button')).toBeDisabled();
});

test('V8D presentation keeps hit receipts visible with live time and player framing', async ({ page }, testInfo) => {
  const fixture = await presentationV8Fixture(page);
  try {
    const ui = page.locator('.combat-v8');
    const camera = await ui.getAttribute('data-camera-left');
    fixture.update(snapshot => {
      snapshot.simulation.units[0].stitching = 81;
      snapshot.simulation.units[1].stitching = 68;
    });
    await expect(page.locator('.combat-message')).toHaveText('You −19 · 81 Stitching | Loomkeeper −32 · 68 Stitching');
    await expect(ui).toHaveAttribute('data-command-controls', 'true');
    await expect(page.locator('.movement-zone')).toHaveAttribute('aria-disabled', 'false');
    const tick = Number(await ui.getAttribute('data-simulation-tick'));
    const timer = await page.locator('.combat-timer').textContent();
    await expect.poll(async () => Number(await ui.getAttribute('data-simulation-tick'))).toBeGreaterThan(tick + 30);
    await expect(page.locator('.combat-timer')).not.toHaveText(timer!);
    await expect(ui).toHaveAttribute('data-hit-feedback', 'visible');
    fixture.update(snapshot => {
      const s = snapshot.simulation; s.turn++; s.inputEpoch++; s.activeActor = 'loomkeeper';
      s.phaseStartedTick = s.tick; s.phaseDeadlineTick = s.tick + 450;
      s.units[1].facing = -1; s.units[1].vxFp = -256;
    });
    await expect(ui).toHaveAttribute('data-active-actor', 'loomkeeper');
    await expect(ui).toHaveAttribute('data-camera-left', camera!);
    fixture.update(snapshot => { snapshot.simulation.units[1].facing = 1; snapshot.simulation.units[1].vxFp = 256; });
    await expect(ui).toHaveAttribute('data-loomkeeper-animation', 'wp015c-wizard-walk');
    await expect(ui).toHaveAttribute('data-camera-left', camera!);
    await page.screenshot({ path: testInfo.outputPath('v8d-live-hit-feedback.png') });
    await expect(ui).toHaveAttribute('data-hit-feedback', 'none', { timeout: 3000 });
    await expect(page.locator('.combat-message')).not.toContainText('−');
  } finally { await fixture.close(); }
});

test('V8D presentation shows visible full defeat and aftermath before either result', async ({ page }, testInfo) => {
  test.setTimeout(45_000);
  const originalViewport = page.viewportSize()!;
  // Test-only engine timestamps: the scene's performance.now clock is untouched.
  // A half-speed engine must still complete before its real-time aftermath starts.
  await page.addInitScript(() => {
    const nativeFrame = window.requestAnimationFrame.bind(window);
    let previous = performance.now(), synthetic = previous;
    window.requestAnimationFrame = callback => nativeFrame(time => {
      const rate = (window as typeof window & { __v8AnimationRate?: number }).__v8AnimationRate ?? 1;
      synthetic += (time - previous) * rate; previous = time; callback(synthetic);
    });
  });
  for (const [defeated, viewport, slow] of [
    ['both', { width: 844, height: 390 }, true],
    ['player', originalViewport, false], ['loomkeeper', originalViewport, false],
    ['both', { width: 390, height: 844 }, false]
  ] as const) {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: defeated === 'both' ? 'reduce' : 'no-preference' });
    const fixture = await presentationV8Fixture(page);
    try {
      if (slow) await page.evaluate(() => { (window as typeof window & { __v8AnimationRate?: number }).__v8AnimationRate = 0.5; });
      const actors = defeated === 'both' ? ['player', 'loomkeeper'] : [defeated];
      await installV8DefeatRecorder(page, fixture.current(), actors);
      fixture.defeat(defeated);
      await page.waitForFunction(() => (window as typeof window & { __v8Defeat: V8DefeatEvidence }).__v8Defeat.firstDeath !== undefined);
      // Capture while animation is starting, not after an RPC chain consumes the aftermath.
      await page.screenshot({ path: testInfo.outputPath(`v8d-${defeated}-${viewport.width}-unravel.png`) });
      await expect(page.locator('.result-shell')).toHaveCount(0, { timeout: 100 });
      await expect(page.locator('.result-shell')).toHaveAttribute('data-outcome', defeated === 'player' ? 'loomkeeper_win' : defeated === 'loomkeeper' ? 'player_win' : 'draw', { timeout: 9200 });
      await expect(page.locator('.result-shell')).toHaveAttribute('data-final-hash', fixture.current().stateHash);
      const proof = await page.evaluate(() => (window as typeof window & { __v8Defeat: V8DefeatEvidence }).__v8Defeat);
      const proofPath = testInfo.outputPath(`v8d-${defeated}-${viewport.width}-timeline.json`);
      await writeFile(proofPath, JSON.stringify(proof, null, 2));
      await testInfo.attach(`v8d-${defeated}-${viewport.width}-timeline`, { path: proofPath, contentType: 'application/json' });
      expect(proof.violations).toEqual([]); expect(proof.overflow).toBe(false);
      expect(proof.samples.length).toBeGreaterThan(2);
      expect(proof.samples.some(sample => sample.playback === 'unavailable')).toBe(false);
      expect(proof.samples.some(sample => sample.pending)).toBe(true);
      expect(proof.samples.every(sample => !sample.controls)).toBe(true);
      if (defeated === 'both') expect(proof.samples.every(sample => sample.cameraWidth === 2048)).toBe(true);
      for (const actor of actors) {
        const frames = proof.samples.flatMap(sample => sample.actors.filter(value => value.actor === actor));
        expect(frames.every(value => value.key === 'wp015c-wizard-unravel')).toBe(true);
        expect(frames.some(value => value.frame > 0 && value.frame < 25)).toBe(true);
        expect(frames.some(value => value.frame === 25 && value.complete)).toBe(true);
        const completed = proof.samples.find(sample => sample.actors.some(value => value.actor === actor && value.complete));
        expect(completed, `${actor} must actually finish before result`).toBeDefined();
        // The recorder runs at the end of the same task as the render; allow at
        // most one 60Hz observer/frame boundary, not a shortened cooldown.
        expect(proof.resultAt! - completed!.at).toBeGreaterThanOrEqual(1000 - 17);
        if (slow) expect(completed!.at - proof.firstDeath!).toBeGreaterThanOrEqual(3500);
      }
    } finally { await fixture.close(); }
  }
});

test('V8D presentation retires interrupted aftermath without losing accepted result or leaking into retry', async ({ page }) => {
  const fixture = await presentationV8Fixture(page);
  try {
    const ui = page.locator('.combat-v8'); fixture.defeat('loomkeeper');
    await expect(ui).toHaveAttribute('data-result-pending', 'true');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.locator('.result-shell')).toHaveCount(0);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('.result-shell')).toHaveAttribute('data-outcome', 'player_win');
    await expect(page.locator('.result-shell')).toHaveAttribute('data-final-hash', fixture.current().stateHash);
    fixture.stop();
    fixture.releaseServerMatch();
    await page.getByRole('button', { name: 'Change Calling' }).tap();
    await page.getByRole('button', { name: 'Start Practice' }).tap();
    await expect(ui).not.toHaveAttribute('data-challenge-id', fixture.current().challengeId);
    await expect(ui).toHaveAttribute('data-hit-feedback', 'none');
    await expect(page.locator('.result-shell')).toHaveCount(0);
  } finally { await fixture.close(); }
});

test('V8D presentation preserves accepted result through hidden unavailable reentry', async ({ page }) => {
  const fixture = await presentationV8Fixture(page);
  try {
    const ui = page.locator('.combat-v8'); fixture.defeat('player');
    await expect(ui).toHaveAttribute('data-result-pending', 'true');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    fixture.loseSession();
    await expect.poll(() => fixture.sessionCount(), { timeout: 6000 }).toBe(1);
    await expect(page.locator('.result-shell')).toHaveCount(0);
    await page.evaluate(() => {
      Reflect.deleteProperty(document, 'hidden'); document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    await expect(page.locator('.result-shell')).toHaveAttribute('data-outcome', 'loomkeeper_win');
    await expect(page.locator('.result-shell')).toHaveAttribute('data-final-hash', fixture.current().stateHash);
  } finally { await fixture.close(); }
});

test('V8E edge controls expose live Stitching and reversible 300ms or reduced-motion focus', async ({ page }) => {
  const fixture = await presentationV8Fixture(page);
  try {
    const ui = page.locator('.combat-v8');
    fixture.update(value => { value.simulation.units[1].stitching = 73; });
    const loomkeeper = page.locator('.camera-focus-loomkeeper');
    await expect(loomkeeper).toBeVisible();
    await expect(loomkeeper).toHaveAttribute('data-side', 'right');
    await expect(loomkeeper).toHaveAttribute('aria-label', 'Loomkeeper, 73 Stitching, off-screen right');
    await expect(loomkeeper).toContainText('Loomkeeper · 73 Stitching ›');
    const target = await loomkeeper.boundingBox();
    expect(target!.width).toBeGreaterThanOrEqual(48);
    expect(target!.height).toBeGreaterThanOrEqual(48);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await armCameraTransitionRecorder(page);
    await loomkeeper.tap();
    await expectCameraTransitionObserved(page, 'loomkeeper');
    await page.waitForTimeout(100);
    const middle = Number(await ui.getAttribute('data-camera-left'));
    expect(middle).toBeGreaterThan(0); expect(middle).toBeLessThan(1024);
    await expect(ui).toHaveAttribute('data-camera-transition', 'none', { timeout: 700 });
    const loomkeeperX = Number(await ui.getAttribute('data-render-loomkeeper-x'));
    const loomkeeperLeft = Math.max(0, Math.min(1024, loomkeeperX - 512));
    await expect.poll(async () => Number(await ui.getAttribute('data-camera-left'))).toBe(loomkeeperLeft);
    const back = page.locator('.camera-focus-player');
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute('data-side', 'left');
    await expect(back).toHaveAttribute('aria-label', 'Back to You, 100 Stitching, off-screen left');
    await expect(ui).not.toHaveAttribute('data-last-command', /.+/);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await back.tap();
    await expect(ui).toHaveAttribute('data-camera-transition', 'none');
    const playerX = Number(await ui.getAttribute('data-render-player-x'));
    const playerLeft = Math.max(0, Math.min(1024, playerX - 512));
    await expect.poll(async () => Number(await ui.getAttribute('data-camera-left'))).toBe(playerLeft);
  } finally { await fixture.close(); }
});

test('V8E ordinary Loomkeeper handover preserves an in-flight actor focus', async ({ page }) => {
  const fixture = await presentationV8Fixture(page);
  try {
    const ui = page.locator('.combat-v8');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const actorX = Number(await ui.getAttribute('data-render-loomkeeper-x'));
    const loomkeeperLeft = Math.max(0, Math.min(1024, actorX - 512));
    expect(await startVisibleCameraTransition(page)).toBe('loomkeeper');
    expect(Number(await ui.getAttribute('data-camera-left'))).toBeLessThan(loomkeeperLeft);
    fixture.update(value => {
      const simulation = value.simulation;
      simulation.turn++;
      simulation.activeActor = 'loomkeeper';
      simulation.phase = 'action';
      simulation.phaseStartedTick = simulation.tick;
      simulation.phaseDeadlineTick = simulation.tick + 450;
      simulation.inputEpoch++;
      simulation.heldDirection = 0;
      simulation.leaseExpiresTick = null;
      simulation.lastLeaseRefreshTick = null;
      simulation.aim = null;
    });
    await expect(ui).toHaveAttribute('data-active-actor', 'loomkeeper');
    await expect(ui).toHaveAttribute('data-camera-transition', 'none', { timeout: 700 });
    await expect.poll(async () => Number(await ui.getAttribute('data-camera-left')))
      .toBe(loomkeeperLeft);
    await expect(ui).not.toHaveAttribute('data-last-command', /.+/);
  } finally { await fixture.close(); }
});

test('V8E manual cancellation/free recovery and terminal priority are bounded', async ({ page }) => {
  const fixture = await presentationV8Fixture(page);
  try {
    const ui = page.locator('.combat-v8');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.camera-focus-loomkeeper').tap();
    const loomkeeperX = Number(await ui.getAttribute('data-render-loomkeeper-x'));
    const loomkeeperLeft = Math.max(0, Math.min(1024, loomkeeperX - 512));
    await expect.poll(async () => Number(await ui.getAttribute('data-camera-left'))).toBe(loomkeeperLeft);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('.camera-focus-player').tap();
    await cameraPointer(page, 'pointerdown', 601, 0, 0);
    const cancelledAt = Number(await ui.getAttribute('data-camera-left'));
    await cameraPointer(page, 'pointermove', 601, 8, 6);
    await cameraPointer(page, 'pointerup', 601, 8, 6);
    await expect(ui).toHaveAttribute('data-camera-transition', 'none');
    await expect(ui).toHaveAttribute('data-camera-anchor', 'player');
    expect(Number(await ui.getAttribute('data-camera-left'))).toBe(cancelledAt);

    await cameraPointer(page, 'pointerdown', 602, 0, 0);
    await cameraPointer(page, 'pointermove', 602, 20, 21);
    await cameraPointer(page, 'pointerup', 602, 20, 21);
    await expect(ui).toHaveAttribute('data-camera-anchor', 'player');
    await expect.poll(async () => Number(await ui.getAttribute('data-camera-left'))).toBe(cancelledAt);

    const panDx = cancelledAt < 512 ? -160 : 160;
    await cameraPointer(page, 'pointerdown', 603, 0, 0);
    await cameraPointer(page, 'pointermove', 603, panDx, 30);
    await cameraPointer(page, 'pointerup', 603, panDx, 30);
    await expect(ui).toHaveAttribute('data-camera-anchor', 'free');
    const freeLeft = Number(await ui.getAttribute('data-camera-left'));
    expect(Math.abs(freeLeft - cancelledAt)).toBeGreaterThan(100);

    await cameraPointer(page, 'pointerdown', 604, 0, 0);
    await cameraPointer(page, 'pointermove', 604, panDx * 4, 30);
    await cameraPointer(page, 'pointerup', 604, panDx * 4, 30);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const recovery = page.locator('.camera-focus-button:visible').first();
    await expect(recovery).toBeVisible();
    await recovery.tap();
    await expect(ui).not.toHaveAttribute('data-camera-transition', 'none');
    fixture.defeat('player');
    await expect(ui).toHaveAttribute('data-camera-transition', 'none');
    await expect(page.locator('.camera-focus-button:visible')).toHaveCount(0);
    await expect(ui).toHaveAttribute('data-presentation', 'unravel');
    await expect(ui).toHaveAttribute('data-result-pending', 'true');
  } finally { await fixture.close(); }
});

test('V8E actual Loomkeeper projectiles restore preselected actor and exact free views', async ({ page }) => {
  test.setTimeout(45_000);
  for (const preference of ['loomkeeper', 'free'] as const) {
    const fixture = await presentationV8Fixture(page, { authoritative: true });
    try {
      const ui = page.locator('.combat-v8');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      if (preference === 'loomkeeper') {
        await page.locator('.camera-focus-loomkeeper').tap();
      } else {
        await cameraPointer(page, 'pointerdown', 620, 0, 0);
        await cameraPointer(page, 'pointermove', 620, -180, 20);
        await cameraPointer(page, 'pointerup', 620, -180, 20);
      }
      await expect(ui).toHaveAttribute('data-camera-anchor', preference);
      const savedLeft = Number(await ui.getAttribute('data-camera-left'));
      fixture.stop();

      fixture.authorityAdvance(450);
      for (let step = 0; step < 180 && !fixture.current().simulation.projectile; step++)
        fixture.authorityAdvance(3);
      expect(fixture.current().simulation.projectile?.actor).toBe('loomkeeper');
      await expect(ui).toHaveAttribute('data-presentation', 'projectile');
      let tracked = false;
      for (let step = 0; step < 100 && fixture.current().simulation.projectile; step++) {
        fixture.authorityAdvance(3);
        tracked ||= fixture.current().simulation.projectile !== null;
      }
      expect(fixture.current().simulation.projectile).toBeNull();
      expect(tracked).toBe(true);
      await expect(ui).toHaveAttribute('data-simulation-tick', String(fixture.current().simulation.tick));
      await expect(ui).not.toHaveAttribute('data-presentation', 'projectile');
      await expect(ui).toHaveAttribute('data-camera-anchor', preference);
      if (preference === 'free') {
        await expect.poll(async () => Number(await ui.getAttribute('data-camera-left'))).toBe(savedLeft);
      } else {
        const actorX = Number(await ui.getAttribute('data-render-loomkeeper-x'));
        await expect.poll(async () => Number(await ui.getAttribute('data-camera-left')))
          .toBe(Math.max(0, Math.min(1024, actorX - 512)));
      }
    } finally { await fixture.close(); }
  }
});

test('V8E actual player projectile endpoint recentres the new player retreat action', async ({ page }) => {
  const fixture = await presentationV8Fixture(page, { authoritative: true });
  try {
    const ui = page.locator('.combat-v8');
    await cameraPointer(page, 'pointerdown', 621, 0, 0);
    await cameraPointer(page, 'pointermove', 621, -180, 20);
    await cameraPointer(page, 'pointerup', 621, -180, 20);
    await expect(ui).toHaveAttribute('data-camera-anchor', 'free');
    fixture.stop();
    fixture.authorityIntent({ type: 'aim', angleMilliDegrees: 45000, powerPermille: 1000 });
    fixture.authorityIntent({ type: 'fire', aimId: fixture.current().simulation.aimId });
    await expect(ui).toHaveAttribute('data-presentation', 'projectile');
    for (let step = 0; step < 100 && fixture.current().simulation.projectile; step++)
      fixture.authorityAdvance(3);
    expect(fixture.current().simulation.projectile).toBeNull();
    expect(fixture.current().simulation.activeActor).toBe('player');
    expect(fixture.current().simulation.phase).toBe('retreat');
    await expect(ui).toHaveAttribute('data-simulation-tick', String(fixture.current().simulation.tick));
    await expect(ui).toHaveAttribute('data-camera-anchor', 'player');
    const playerX = Number(await ui.getAttribute('data-render-player-x'));
    await expect.poll(async () => Number(await ui.getAttribute('data-camera-left')))
      .toBe(Math.max(0, Math.min(1024, playerX - 512)));
  } finally { await fixture.close(); }
});

test('V8E injected reward scene has focus parity without wallet, entitlement, payout or service', async ({ page }) => {
  test.setTimeout(45_000);
  const fixture = await presentationV8Fixture(page, { reward: true, authoritative: true });
  try {
    const ui = page.locator('.combat-v8');
    await expect(ui).toHaveAttribute('data-mode', 'reward');
    await expect(ui).toHaveAttribute('data-ruleset', V8_R1_RULESET_ID);
    const challenge = await ui.getAttribute('data-challenge-id');
    const focus = page.locator('.camera-focus-loomkeeper');
    await expect(focus).toHaveAttribute('aria-label', 'Loomkeeper, 100 Stitching, off-screen right');
    const box = await focus.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(48); expect(box!.height).toBeGreaterThanOrEqual(48);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await armCameraTransitionRecorder(page);
    await focus.tap();
    await expectCameraTransitionObserved(page, 'loomkeeper');
    await expect(ui).toHaveAttribute('data-camera-transition', 'none', { timeout: 700 });
    const loomkeeperX = Number(await ui.getAttribute('data-render-loomkeeper-x'));
    await expect.poll(async () => Number(await ui.getAttribute('data-camera-left')))
      .toBe(Math.max(0, Math.min(1024, loomkeeperX - 512)));
    await expect(page.locator('.camera-focus-player')).toHaveAttribute('aria-label',
      'Back to You, 100 Stitching, off-screen left');
    await armCameraTransitionRecorder(page);
    await page.locator('.camera-focus-player').tap();
    await expectCameraTransitionObserved(page, 'player');
    await expect(ui).toHaveAttribute('data-camera-transition', 'none', { timeout: 700 });
    const playerX = Number(await ui.getAttribute('data-render-player-x'));
    await expect.poll(async () => Number(await ui.getAttribute('data-camera-left')))
      .toBe(Math.max(0, Math.min(1024, playerX - 512)));
    await expect(ui).toHaveAttribute('data-challenge-id', challenge!);
    await expect(ui).not.toHaveAttribute('data-last-command', /.+/);
    await expect(page.locator('.wallet-card, .reward-result, .reward-claim, .daily-card')).toHaveCount(0);
    expect(fixture.current().mode).toBe('reward');
  } finally { await fixture.close(); }
});

test('V8E blur hidden and disconnect cancel focus without late resume mutation', async ({ page }) => {
  test.setTimeout(30_000);
  for (const event of ['blur', 'hidden', 'disconnect'] as const) {
    const fixture = await presentationV8Fixture(page, { authoritative: true });
    try {
      const ui = page.locator('.combat-v8');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await startVisibleCameraTransition(page, event === 'disconnect' ? undefined : event);
      if (event === 'disconnect') fixture.disconnectTransport();
      await expect(ui).toHaveAttribute('data-camera-transition', 'none');
      await expect(ui).toHaveAttribute('data-suspended', 'true');
      const stoppedLeft = Number(await ui.getAttribute('data-camera-left'));
      if (event === 'blur') {
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      } else if (event === 'hidden') {
        await page.evaluate(() => {
          Reflect.deleteProperty(document, 'hidden');
          document.dispatchEvent(new Event('visibilitychange'));
          window.dispatchEvent(new Event('focus'));
        });
      }
      await expect(ui).toHaveAttribute('data-suspended', 'false', { timeout: 6000 });
      await page.waitForTimeout(350);
      expect(Number(await ui.getAttribute('data-camera-left'))).toBe(stoppedLeft);
      await expect(ui).toHaveAttribute('data-camera-transition', 'none');
    } finally { await fixture.close(); }
  }
});

test('V8E unavailable retry replacement and scene destruction never resurrect detached focus', async ({ page }) => {
  test.setTimeout(30_000);
  for (const operation of ['unavailable', 'retry', 'destroy'] as const) {
    const fixture = await presentationV8Fixture(page, operation === 'retry' ? { authoritative: true } : {});
    try {
      const ui = page.locator('.combat-v8');
      const challenge = await ui.getAttribute('data-challenge-id');
      await installDetachedCameraMonitor(page);
      await startVisibleCameraTransition(page);
      if (operation === 'unavailable') {
        fixture.loseSession();
        await expect(page.locator('.result-shell')).toBeVisible({ timeout: 6000 });
      } else if (operation === 'retry') {
        await page.locator('.pause-button').tap();
        await expect(ui).toHaveAttribute('data-paused', 'true');
        await expect(ui).toHaveAttribute('data-camera-transition', 'none');
        await page.locator('.retry-button').tap();
        await expect(page.locator('.combat-v8')).not.toHaveAttribute('data-challenge-id', challenge!, { timeout: 6000 });
        await expect(page.locator('.combat-v8')).toHaveAttribute('data-camera-transition', 'none');
      } else {
        fixture.defeat('player');
        await expect(ui).toHaveAttribute('data-camera-transition', 'none');
        await expect(page.locator('.result-shell')).toBeVisible({ timeout: 6000 });
      }
      await expect.poll(() => detachedCameraEvidence(page)).toMatchObject({ connected: false });
      const detached = await detachedCameraEvidence(page);
      await page.waitForTimeout(400);
      expect(await detachedCameraEvidence(page)).toEqual(detached);
    } finally { await fixture.close(); }
  }
});

test('V8 r1 right left off and actual landscape preserve pad axes and safe areas', async ({ page }, testInfo) => {
  test.setTimeout(45_000);
  for (const mode of ['right', 'left', 'off'] as const) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/?combat-preview=v8-r1&sideways=${mode}`);
    const ui = page.locator('.combat-v8-r1'); await expect(ui).toBeVisible();
    await page.evaluate(native => {
      for (const side of ['top', 'right', 'bottom', 'left'] as const)
        document.documentElement.style.setProperty(`--native-safe-area-${side}`, `${native[side]}px`);
      window.dispatchEvent(new Event('resize'));
    }, SYNTHETIC_SAFE_AREA);
    await expect.poll(() => readSafeArea(page)).toEqual(mode === 'right'
      ? { top: 14, right: 22, bottom: 12, left: 18 }
      : mode === 'left' ? { top: 12, right: 18, bottom: 14, left: 22 } : SYNTHETIC_SAFE_AREA);
    await assertControlsFit(page);
    await assertFocusTarget(page);
    await assertFocusRoundTrip(page);
    const pad = await page.locator('.movement-zone').boundingBox();
    expect(pad!.width).toBeGreaterThanOrEqual(112); expect(pad!.height).toBeGreaterThanOrEqual(112);
    await r1Pointer(page, 'pointerdown', 304, 0, 0);
    await r1Pointer(page, 'pointermove', 304, 150, 0);
    await expect(ui).toHaveAttribute('data-held-direction', '1');
    await r1Pointer(page, 'pointerup', 304, 150, 0);
    await expect(ui).toHaveAttribute('data-held-direction', '0');
    await r1Pointer(page, 'pointerdown', 305, 0, 0);
    await r1Pointer(page, 'pointermove', 305, 0, -30);
    await expect(ui).toHaveAttribute('data-player-grounded', 'false');
    await expect(ui).toHaveAttribute('data-player-animation', 'wp015c-wizard-idle');
    await r1Pointer(page, 'pointerup', 305, 0, -30);
    await page.screenshot({ path: testInfo.outputPath(`v8-r1-${mode}-candidate.png`) });
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('html')).not.toHaveAttribute('data-sideways', /.+/);
    await expect(ui).toHaveAttribute('data-orientation', 'landscape');
    await assertControlsFit(page);
    await assertFocusTarget(page);
    await assertFocusRoundTrip(page);
  }
});

async function r1Pointer(page: Page, type: 'pointerdown' | 'pointermove' | 'pointerup', pointerId: number, dx: number, dy: number): Promise<void> {
  await page.locator('.movement-zone').evaluate((element, args) => {
    const rect = element.getBoundingClientRect(); const mode = document.documentElement.dataset.sideways;
    const x = mode === 'right' ? -args.dy : mode === 'left' ? args.dy : args.dx;
    const y = mode === 'right' ? args.dx : mode === 'left' ? -args.dx : args.dy;
    element.dispatchEvent(new PointerEvent(args.type, { bubbles: true, cancelable: true,
      pointerId: args.pointerId, pointerType: 'touch', isPrimary: true, button: 0,
      buttons: args.type === 'pointerup' ? 0 : 1, clientX: rect.left + rect.width / 2 + x,
      clientY: rect.top + rect.height / 2 + y }));
  }, { type, pointerId, dx, dy });
}

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

async function cameraPointer(
  page: Page,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  pointerId: number,
  dx: number,
  dy: number
): Promise<void> {
  const ui = page.locator('.combat-ui');
  const canvas = page.locator('#game canvas');
  const [x, y, width, height, box] = await Promise.all([
    ui.getAttribute('data-battlefield-x'), ui.getAttribute('data-battlefield-y'),
    ui.getAttribute('data-battlefield-width'), ui.getAttribute('data-battlefield-height'),
    canvas.boundingBox()
  ]);
  expect(box).not.toBeNull();
  const originX = Number(x) + Number(width) / 2;
  const originY = Number(y) + Number(height) * 0.25;
  await pointer(page, '#game canvas', type, pointerId,
    (originX + dx) / box!.width, (originY + dy) / box!.height);
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;
}

async function assertV9ActorCardsFit(page: Page): Promise<void> {
  await expect(page.locator('.combat-v9')).toBeVisible();
  const evidence = await page.locator('.combat-v9').evaluate(root => Array.from(
    root.querySelectorAll<HTMLElement>('.combat-unit-status')
  ).map(card => {
    const value = card.querySelector<HTMLElement>('.unit-status-value')!;
    const range = document.createRange(); range.selectNodeContents(value);
    const box = card.getBoundingClientRect();
    const lines = Array.from(range.getClientRects());
    return {
      hidden: card.hidden, display: getComputedStyle(card).display, label: card.getAttribute('aria-label') ?? '',
      width: box.width, height: box.height, logicalHeight: card.offsetHeight,
      contained: lines.every(line => line.left >= box.left - 0.5 && line.right <= box.right + 0.5 && line.top >= box.top - 0.5 && line.bottom <= box.bottom + 0.5)
    };
  }));
  for (const card of evidence) {
    if (card.hidden) { expect(card.display).toBe('none'); continue; }
    expect(card.width).toBeGreaterThan(0); expect(card.logicalHeight).toBe(32);
    expect(card.contained).toBe(true);
    expect(card.label).toMatch(/Stitching.*Thread.*Shield/);
  }
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

async function expectV9ArmedActionAfterAuthorityTick(page: Page, ui: ReturnType<Page['locator']>, label: string): Promise<void> {
  const use = page.getByRole('button', { name: label, exact: true });
  await expect(use).toBeEnabled();
  await expect(use).toHaveAttribute('title', '');
  await expect(page.locator('.combat-message')).toHaveText(`${label} is ready.`);
  const selectionTick = Number(await ui.getAttribute('data-simulation-tick'));
  await expect.poll(async () => Number(await ui.getAttribute('data-simulation-tick'))).toBeGreaterThan(selectionTick);
  await expect(use).toBeEnabled();
  await expect(use).toHaveAttribute('title', '');
  await expect(page.locator('.combat-message')).toHaveText(`${label} is ready.`);
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

async function assertFocusTarget(page: Page): Promise<void> {
  const button = page.locator('.camera-focus-button:visible').first();
  await expect(button).toBeVisible();
  const [box, viewport] = await Promise.all([button.boundingBox(), page.evaluate(() => ({
    width: window.visualViewport?.width ?? innerWidth,
    height: window.visualViewport?.height ?? innerHeight
  }))]);
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(48); expect(box!.height).toBeGreaterThanOrEqual(48);
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function assertFocusRoundTrip(page: Page): Promise<void> {
  const ui = page.locator('.combat-v8');
  const command = await ui.getAttribute('data-last-command');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const loomkeeper = page.locator('.camera-focus-loomkeeper');
  await expect(loomkeeper).toHaveAttribute('data-side', 'right');
  await expect(loomkeeper).toHaveAttribute('aria-label', /Loomkeeper, \d+ Stitching, off-screen right/);
  await loomkeeper.tap();
  await expect(ui).toHaveAttribute('data-camera-anchor', 'loomkeeper');
  await expect(ui).toHaveAttribute('data-camera-transition', 'none');
  const player = page.locator('.camera-focus-player');
  await expect(player).toHaveAttribute('data-side', 'left');
  await expect(player).toHaveAttribute('aria-label', /Back to You, \d+ Stitching, off-screen left/);
  await player.tap();
  await expect(ui).toHaveAttribute('data-camera-anchor', 'player');
  await expect(ui).toHaveAttribute('data-camera-transition', 'none');
  expect(await ui.getAttribute('data-last-command')).toBe(command);
}

type CameraTransitionActor = 'player' | 'loomkeeper';

async function armCameraTransitionRecorder(page: Page): Promise<void> {
  await page.locator('.combat-v8').evaluate(element => {
    const host = window as typeof window & {
      __v8eCameraTransitionObserver?: MutationObserver;
      __v8eCameraTransitions?: { actors: string[] };
    };
    host.__v8eCameraTransitionObserver?.disconnect();
    const ui = element as HTMLElement;
    const evidence = { actors: [] as string[] };
    const recordActor = (actor: string | null | undefined) => {
      if ((actor === 'player' || actor === 'loomkeeper') && !evidence.actors.includes(actor))
        evidence.actors.push(actor);
    };
    const record = (records: MutationRecord[] = []) => {
      for (const mutation of records) recordActor(mutation.oldValue);
      const actor = ui.dataset.cameraTransition;
      recordActor(actor);
    };
    const observer = new MutationObserver(record);
    observer.observe(ui, {
      attributes: true,
      attributeFilter: ['data-camera-transition'],
      attributeOldValue: true
    });
    host.__v8eCameraTransitionObserver = observer;
    host.__v8eCameraTransitions = evidence;
    record();
  });
}

async function expectCameraTransitionObserved(
  page: Page,
  actor: CameraTransitionActor
): Promise<void> {
  await expect.poll(() => page.evaluate(expected => {
    const evidence = (window as typeof window & {
      __v8eCameraTransitions?: { actors: string[] };
    }).__v8eCameraTransitions;
    return evidence?.actors.includes(expected) ?? false;
  }, actor)).toBe(true);
}

async function startVisibleCameraTransition(
  page: Page,
  interruption?: 'blur' | 'hidden'
): Promise<CameraTransitionActor> {
  const button = page.locator('.camera-focus-button:visible').first();
  await expect(button).toBeVisible();
  const actor = await button.evaluate(element => element.classList.contains('camera-focus-player')
    ? 'player' : 'loomkeeper') as CameraTransitionActor;
  await armCameraTransitionRecorder(page);
  await button.evaluate((element, args) => new Promise<void>(resolve => {
    const ui = document.querySelector<HTMLElement>('.combat-v8')!;
    let observer: MutationObserver | undefined;
    const observeStart = () => {
      if (ui.dataset.cameraTransition !== args.actor) return;
      observer?.disconnect();
      if (args.interruption === 'blur') {
        window.dispatchEvent(new Event('blur'));
      } else if (args.interruption === 'hidden') {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
      }
      resolve();
    };
    observer = new MutationObserver(observeStart);
    observer.observe(ui, { attributes: true, attributeFilter: ['data-camera-transition'] });
    (element as HTMLButtonElement).click();
    observeStart();
  }), { actor, interruption });
  await expectCameraTransitionObserved(page, actor);
  return actor;
}

async function installDetachedCameraMonitor(page: Page): Promise<void> {
  await page.locator('.combat-v8').evaluate(element => {
    const evidence = { connected: true, mutations: 0, cameraLeft: '', transition: '' };
    const update = () => {
      const ui = element as HTMLElement;
      evidence.connected = ui.isConnected;
      evidence.cameraLeft = ui.dataset.cameraLeft ?? '';
      evidence.transition = ui.dataset.cameraTransition ?? '';
    };
    const observer = new MutationObserver(records => { evidence.mutations += records.length; update(); });
    observer.observe(element, { attributes: true, subtree: true });
    new MutationObserver(update).observe(document.body, { childList: true, subtree: true });
    update();
    (window as typeof window & { __v8eDetachedCamera?: typeof evidence }).__v8eDetachedCamera = evidence;
  });
}

async function detachedCameraEvidence(page: Page): Promise<{
  connected: boolean; mutations: number; cameraLeft: string; transition: string;
}> {
  return page.evaluate(() => ({
    ...(window as typeof window & { __v8eDetachedCamera: {
      connected: boolean; mutations: number; cameraLeft: string; transition: string;
    } }).__v8eDetachedCamera
  }));
}

/** Schema-checked presentation fixture on the real test-only runtime. Direct
 * presentation receipts are not outcomes, replay evidence, or a product seam. */
async function presentationV8Fixture(page: Page, options: { authoritative?: boolean; reward?: boolean } = {}) {
  const runtime = createRuntimeServer({ clientDir: path.resolve('client/build'), sessionRegistry: {
    simulationRulesetId: V8_R1_RULESET_ID, seedSource: () => 1,
    simulationTickIntervalMs: false, v8TestOnly: { nowUs: () => 0 }
  } });
  const port = await runtime.listen();
  await page.goto(`http://127.0.0.1:${port}/?sideways=off`);
  await expect(page.locator('.practice-shell')).toBeVisible();
  let socket = [...runtime.io.sockets.sockets.values()][0];
  let session = runtime.sessions.getBound(socket.id)!;
  if (options.reward) {
    const injected = runtime.sessions.createChallengeV8ForTest(session, 'reward', 'wizard', V8_R1_RULESET_ID);
    if ('code' in injected) throw new Error(injected.message);
    // Bind the test-only injected instance to the same exact automated adapter
    // identity used by the product runtime; no reward service or eligibility is installed.
    session.challenges.get(injected.challengeId)!.automationId = V8_AUTOMATION_ID;
    ChallengeSnapshotV8RuntimeSchema.parse(runtime.sessions.activeSnapshotV8(session));
    await page.reload();
    await expect(page.locator('.practice-shell')).toBeVisible();
    await page.locator('.practice-start').tap();
  } else {
    await page.getByRole('button', { name: 'Start Practice' }).tap();
  }
  await expect(page.locator('.combat-v8')).toBeVisible({ timeout: 10_000 });
  socket = [...runtime.io.sockets.sockets.values()].find(candidate => runtime.sessions.getBound(candidate.id)?.id === session.id)!;
  session = runtime.sessions.getBound(socket.id)!;
  let snapshot = structuredClone(runtime.sessions.activeSnapshotV8(session)!);
  const update = (mutate: (value: ChallengeSnapshotV8Runtime) => void) => {
    const next = structuredClone(snapshot);
    next.simulation.revision++; next.simulation.tick += 3; next.serverTimeMs++;
    mutate(next);
    next.stateHash = next.simulation.revision.toString(16).padStart(64, '0');
    snapshot = ChallengeSnapshotV8RuntimeSchema.parse(next);
    runtime.io.emit(protocolEventsV8.snapshot, snapshot);
  };
  const timer = setInterval(() => {
    if (snapshot.status !== 'active') return;
    if (options.authoritative) {
      snapshot = ChallengeSnapshotV8RuntimeSchema.parse(
        runtime.sessions.advanceChallengeTicksV8ForTest(session, snapshot.challengeId, 3));
      runtime.io.emit(protocolEventsV8.snapshot, snapshot);
    } else update(() => {});
  }, 60);
  return {
    current: () => structuredClone(snapshot), update, stop: () => clearInterval(timer),
    authorityIntent: (intent: Parameters<typeof runtime.sessions.applyIntentV8ForTest>[2]) => {
      if (!options.authoritative) throw new Error('Authoritative fixture option required.');
      snapshot = ChallengeSnapshotV8RuntimeSchema.parse(
        runtime.sessions.applyIntentV8ForTest(session, snapshot.challengeId, intent));
      runtime.io.emit(protocolEventsV8.snapshot, snapshot);
      return structuredClone(snapshot);
    },
    authorityAdvance: (count: number) => {
      if (!options.authoritative) throw new Error('Authoritative fixture option required.');
      snapshot = ChallengeSnapshotV8RuntimeSchema.parse(
        runtime.sessions.advanceChallengeTicksV8ForTest(session, snapshot.challengeId, count));
      runtime.io.emit(protocolEventsV8.snapshot, snapshot);
      return structuredClone(snapshot);
    },
    disconnectTransport: () => socket.conn.close(),
    defeat: (actor: 'player' | 'loomkeeper' | 'both') => {
      update(value => {
        value.status = 'completed'; const s = value.simulation;
        s.phase = 'finished'; s.finishReason = 'unravelled'; s.projectile = null;
        s.phaseStartedTick = s.tick; s.phaseDeadlineTick = s.tick; s.settleReason = null;
        s.heldDirection = 0; s.leaseExpiresTick = null; s.lastLeaseRefreshTick = null; s.aim = null;
        s.winner = actor === 'player' ? 'loomkeeper' : actor === 'loomkeeper' ? 'player' : 'draw';
        for (const unit of s.units) {
          unit.vxFp = 0; unit.vyFp = 0;
          if (actor === 'both' || actor === unit.id) {
            unit.alive = false; unit.stitching = 0; unit.grounded = false;
            unit.support = null; unit.airTicks = 0; unit.airDrive = null;
          }
        }
      });
      const result = ChallengeResultV8RuntimeSchema.parse({ protocolVersion: 8, serverTimeMs: snapshot.serverTimeMs,
        sessionId: snapshot.sessionId, challengeId: snapshot.challengeId, rulesetId: snapshot.rulesetId,
        loomkeeperPolicyId: snapshot.loomkeeperPolicyId, loomkeeperProfileId: snapshot.loomkeeperProfileId,
        ...('automationId' in snapshot ? { automationId: snapshot.automationId } : {}),
        nextInputSequence: snapshot.nextInputSequence,
        outcome: actor === 'player' ? 'loomkeeper_win' : actor === 'loomkeeper' ? 'player_win' : 'draw',
        finalTick: snapshot.simulation.tick, finalStateHash: snapshot.stateHash });
      runtime.io.emit(protocolEventsV8.result, result);
      runtime.io.emit(protocolEventsV8.result, result); // Duplicates must not reset the visible deadline.
    },
    loseSession: () => { socket.conn.close(); runtime.sessions.close(session.id); },
    sessionCount: () => runtime.sessions.size,
    releaseServerMatch: () => { runtime.sessions.leaveChallengeV8(session, snapshot.challengeId); },
    close: async () => {
      clearInterval(timer);
      try { if (!page.isClosed()) await page.goto('about:blank', { timeout: 2000 }); }
      finally { await runtime.close(); }
    }
  };
}

type V8DefeatEvidence = {
  firstDeath?: number; resultAt?: number; overflow: boolean; violations: string[];
  samples: { at: number; playback: string; pending: boolean; controls: boolean; cameraWidth: number;
    actors: { actor: string; key: string; frame: number; complete: boolean }[] }[];
};

async function installV8DefeatRecorder(page: Page, snapshot: ChallengeSnapshotV8Runtime, actors: string[]) {
  // Capture in the browser before receipt and retain after scene removal. Driver
  // round trips cannot erase the finite animation, geometry or aftermath proof.
  await page.evaluate(({ units, names, scale, origin, radius }) => {
    const evidence: V8DefeatEvidence = { samples: [], violations: [], overflow: false };
    (window as typeof window & { __v8Defeat: V8DefeatEvidence }).__v8Defeat = evidence;
    let signature = '';
    const violation = (message: string) => {
      if (!evidence.violations.includes(message) && evidence.violations.length < 20) evidence.violations.push(message);
    };
    const record = () => {
      const at = performance.now();
      if (document.querySelector('.result-shell')) {
        evidence.resultAt ??= at; observer.disconnect(); return;
      }
      const ui = document.querySelector<HTMLElement>('.combat-v8');
      if (ui?.dataset.presentation !== 'unravel') return;
      evidence.firstDeath ??= at;
      const messageElement = document.querySelector('.combat-message'), canvasElement = document.querySelector('#game canvas');
      if (!messageElement || !canvasElement) { violation('Missing defeat readout/canvas'); return; }
      const message = messageElement.getBoundingClientRect(), canvas = canvasElement.getBoundingClientRect();
      const width = Number(ui.dataset.battlefieldWidth), height = Number(ui.dataset.battlefieldHeight);
      const left = Number(ui.dataset.cameraLeft), cameraWidth = Number(ui.dataset.cameraWidth);
      const size = 256 * Math.max(0.1, height / 576 * scale);
      const statuses = names.map(actor => document.querySelector(`.${actor}-status`)?.getBoundingClientRect());
      for (const [index, actor] of names.entries()) {
        const status = statuses[index], unit = units[actor === 'player' ? 0 : 1];
        if (!status || status.width <= 0 || status.height <= 0) violation(`${actor} status missing`);
        else if (message.bottom >= status.top) violation(`${actor} status overlaps message`);
        if (!(unit.xFp / 256 > left + 30 && unit.xFp / 256 < left + cameraWidth - 30)) violation(`${actor} outside camera`);
        // Exact approved 256px sheet bounds, including transparent padding and
        // the renderer's actor-radius root offset (not the status label box).
        const sprite = {
          x: canvas.x + (canvas.width - width) / 2 + (unit.xFp / 256 - left) * width / cameraWidth - size / 2,
          y: canvas.y + (canvas.height - height) / 2 + (unit.yFp / 256 + radius) * height / 576 - size * origin
        };
        if (message.x < sprite.x + size && message.right > sprite.x && message.y < sprite.y + size && message.bottom > sprite.y)
          violation(`${actor} animation overlaps message`);
        if (sprite.x < canvas.left || sprite.x + size > canvas.right || sprite.y < canvas.top || sprite.y + size > canvas.bottom)
          violation(`${actor} animation outside canvas`);
      }
      if (names.length === 2 && statuses[0] && statuses[1] && statuses[0].right >= statuses[1].left)
        violation('Double defeat statuses overlap');
      const sample = { at, cameraWidth, playback: ui.dataset.defeatPlayback ?? '',
        pending: ui.dataset.resultPending === 'true', controls: ui.dataset.commandControls === 'true',
        actors: names.map(actor => ({ actor, key: ui.getAttribute(`data-${actor}-animation`) ?? '',
          frame: Number(ui.getAttribute(`data-${actor}-animation-frame`)),
          complete: ui.getAttribute(`data-${actor}-animation-complete`) === 'true' })) };
      const nextSignature = JSON.stringify({ ...sample, at: 0, message: messageElement.textContent });
      if (nextSignature !== signature) {
        signature = nextSignature;
        if (evidence.samples.length < 128) evidence.samples.push(sample); else evidence.overflow = true;
      }
    };
    const observer = new MutationObserver(record);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: [
      'data-presentation', 'data-result-pending', 'data-defeat-playback',
      'data-player-animation-frame', 'data-loomkeeper-animation-frame',
      'data-player-animation-complete', 'data-loomkeeper-animation-complete'
    ] });
    record();
  }, { units: snapshot.simulation.units, names: actors, scale: WIZARD_ANIMATION_SCALE_IN_WORLD,
    origin: WIZARD_UNRAVEL_ROOT_ORIGIN_Y, radius: SIM_RULES.actorRadius });
}
