import { expect, test, type Page } from '@playwright/test';

import { CURRENT_V10_RULESET_ID } from '../../shared/simulation-v10';
import { createTestSigner } from '../support/nimiq-signer';
import {
  applySyntheticSafeArea,
  SYNTHETIC_SAFE_AREA
} from './support/safe-area';

test.describe('@legacy retired pre-V10 visual previews', () => {
test('visual geometry baselines cover start, combat, result, and recovery', async ({ page }) => {
  // Once a stale combat snapshot no longer stops the test, Ubuntu must still have
  // enough outer time to visit and capture every remaining geometry state.
  test.setTimeout(60_000);
  const errors = captureErrors(page);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Practice Clash' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Wizard/ })).toHaveAttribute('aria-pressed', 'true');
  await assertMinimumTargets(page, '.practice-shell button:visible');
  await assertDocumentLocked(page);
  await screenshot(page, 'geometry-start.png');

  await page.goto('/?combat-preview=1');
  await expect(page.locator('.combat-ui')).toBeVisible();
  await assertCombatGeometry(page);
  await assertDocumentLocked(page);
  await screenshot(page, 'geometry-combat.png');

  await page.goto('/?result-preview=practice');
  await expect(page.getByRole('heading', { name: 'Grand Knot!' })).toBeVisible();
  await expect(page.locator('.result-preview-note')).toContainText('no wallet or payout');
  await expect(page.locator('.result-facts')).toContainText('652');
  await expect(page.locator('.result-facts')).toContainText('bbbbbbbbbb');
  await assertMinimumTargets(page, '.result-card button:visible');
  await assertDocumentLocked(page);
  await screenshot(page, 'geometry-result.png');

  await page.getByRole('button', { name: 'Play Again' }).tap();
  await expect(page.locator('.combat-ui')).toBeVisible();
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-preview', /no wallet or payout/);
  expect(errors).toEqual([]);
});

test('canonical visual states cover combat presentation, controls, motion, and sideways modes', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000);
  test.skip(testInfo.project.name !== 'chromium-390x844', 'Canonical visual-state coverage.');
  const errors = captureErrors(page);
  await installPresentationGate(page);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?combat-preview=1&sideways=off');
  await expect(page.locator('.combat-ui')).toBeVisible();
  expect(await page.locator('.pad-knob').first().evaluate((element) =>
    getComputedStyle(element).transitionDuration
  )).toBe('0s');
  await screenshot(page, 'canonical-reduced-motion.png');

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?combat-preview=1&sideways=off');
  expect(await page.locator('.pad-knob').first().evaluate((element) =>
    getComputedStyle(element).transitionDuration
  )).not.toBe('0s');
  await screenshot(page, 'canonical-full-motion.png');

  await applySyntheticSafeArea(page, SYNTHETIC_SAFE_AREA);
  await dragPad(page, '.aim-zone', 301, 0.3, -0.34);
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-phase', 'aim_locked');
  await expect(page.locator('.fire-button')).toBeEnabled();
  await assertSafeAreaContainment(page);
  await screenshot(page, 'canonical-aim-lock-safe-area.png');

  await page.locator('.relic-trigger').tap();
  await expect(page.locator('.relic-chooser')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select Threadball' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await screenshot(page, 'canonical-relic-chooser.png');
  await page.getByRole('button', { name: 'Select Spoolburst' }).tap();

  await page.locator('.pause-button').tap();
  await expect(page.locator('.combat-pause-sheet')).toBeVisible();
  await expect(page.locator('.pause-button')).toHaveAttribute('aria-pressed', 'true');
  await screenshot(page, 'canonical-pause.png');

  await page.goto('/?combat-preview=1');
  await expect(page.locator('html')).toHaveAttribute('data-sideways', 'right');
  await screenshot(page, 'canonical-sideways-right.png');
  await page.goto('/?combat-preview=1&sideways=left');
  await expect(page.locator('html')).toHaveAttribute('data-sideways', 'left');
  await screenshot(page, 'canonical-sideways-left.png');
  await page.goto('/?combat-preview=1&sideways=off');
  await expect(page.locator('html')).not.toHaveAttribute('data-sideways', /.+/);
  await screenshot(page, 'canonical-sideways-off.png');

  await page.goto('/?sideways=off');
  await expect(page.getByRole('heading', { name: 'Practice Clash' })).toBeVisible();
  await page.getByRole('button', { name: 'Start Practice' }).tap();
  const liveUi = page.locator('.combat-ui');
  await expect(liveUi).toBeVisible();
  await expect(liveUi).toHaveAttribute('data-seed', '1');
  await expect(liveUi).toHaveAttribute('data-visual-assets', 'approved-runtime-copies');
  await aimAt(page, 40, 302);
  await expect(page.locator('.fire-button')).toBeEnabled();
  await armPresentationGate(page, 'player-cast-charge');
  await page.locator('.fire-button').tap();
  await capturePresentation(page, 'player-cast-charge', 'canonical-player-cast-charge.png');
  await releasePresentationGate(page, 'player-cast-formation');
  await expect(liveUi).toHaveAttribute('data-visual-stage', 'formation-start');
  await capturePresentation(page, 'player-cast-formation', 'canonical-player-cast-formation.png');
  await releasePresentationGate(page, 'player-cast-formation');
  await expect(liveUi).toHaveAttribute('data-visual-stage', 'formation-ready');
  await capturePresentation(page, 'player-cast-formation', 'canonical-player-cast-formation-ready.png');
  await releasePresentationGate(page, 'player-projectile');
  await capturePresentation(page, 'player-projectile', 'canonical-player-projectile.png');
  await releasePresentationGate(page, 'player-impact');
  await capturePresentation(page, 'player-impact', 'canonical-player-impact.png');
  await releasePresentationGate(page, 'loomkeeper-aim');
  await capturePresentation(page, 'loomkeeper-aim', 'canonical-loomkeeper-aim.png');
  await releasePresentationGate(page, 'loomkeeper-projectile');
  await capturePresentation(page, 'loomkeeper-projectile', 'canonical-loomkeeper-projectile.png');
  await releasePresentationGate(page, 'loomkeeper-impact');
  await capturePresentation(page, 'loomkeeper-impact', 'canonical-loomkeeper-impact.png');
  await releasePresentationGate(page, null);
  await expect.poll(() => page.evaluate(() => {
    if (document.querySelector('.result-shell')) return 'result';
    const combat = document.querySelector<HTMLElement>('.combat-ui');
    return combat?.dataset.presenting === 'false' ? 'ready' : 'waiting';
  })).toMatch(/^(ready|result)$/);
  expect(errors).toEqual([]);
});
});

test('current R7 volcanic Practice start stays coherent across maintained phone layouts', async ({
  page
}) => {
  test.setTimeout(60_000);
  const errors = captureErrors(page);

  await page.goto('/');
  await page.getByRole('button', { name: 'Start Practice' }).tap();
  const ui = page.locator('.combat-v10');
  await expect(ui).toBeVisible();
  await expect(ui).toHaveAttribute('data-ruleset', CURRENT_V10_RULESET_ID);
  await expect(ui).toHaveAttribute('data-background', 'volcanic-ruin');
  await expect(ui).toHaveAttribute('data-background-ready', 'true');
  await expect(ui.locator('.combat-timer')).toHaveText(/^(59|60)s$/);
  await expect(ui.locator('.player-status')).toBeVisible();
  await expect(ui.locator('.loomkeeper-status')).toBeVisible();
  const movementZone = await ui.locator('.movement-zone').boundingBox();
  const movementButtons = await Promise.all(['left', 'right', 'jump'].map(name =>
    ui.locator(`[data-movement-button="${name}"]`).boundingBox()));
  expect(movementZone).not.toBeNull();
  for (const button of movementButtons) {
    expect(button).not.toBeNull();
    expect(button!.width).toBeGreaterThanOrEqual(48);
    expect(button!.height).toBeGreaterThanOrEqual(48);
    expect(button!.x).toBeGreaterThanOrEqual(movementZone!.x - 1);
    expect(button!.y).toBeGreaterThanOrEqual(movementZone!.y - 1);
    expect(button!.x + button!.width).toBeLessThanOrEqual(movementZone!.x + movementZone!.width + 1);
    expect(button!.y + button!.height).toBeLessThanOrEqual(movementZone!.y + movementZone!.height + 1);
  }
  expect(overlaps(movementButtons[0]!, movementButtons[1]!)).toBe(false);
  expect(overlaps(movementButtons[0]!, movementButtons[2]!)).toBe(false);
  expect(overlaps(movementButtons[1]!, movementButtons[2]!)).toBe(false);
  for (const [first, second] of [[movementButtons[0]!, movementButtons[1]!],
    [movementButtons[0]!, movementButtons[2]!], [movementButtons[1]!, movementButtons[2]!]]) {
    const gap = rectangularGap(first, second);
    expect(gap).toBeGreaterThanOrEqual(2);
    expect(gap).toBeLessThanOrEqual(4);
  }
  await expect(ui.locator('.movement-left')).toHaveCSS('background-color', 'rgba(5, 130, 202, 0.3)');
  await assertDocumentLocked(page);
  await screenshot(page, 'current-r7-volcanic-practice-start.png');
  expect(errors).toEqual([]);
});

test('V10 R7 terrain-as-gameplay preview keeps the accepted R6 mobile shell on the full volcanic arena', async ({ page }) => {
  const errors = captureErrors(page);
  await page.goto('/?combat-preview=v10r7&sideways=off');
  const ui = page.locator('.combat-v10');
  await expect(ui).toHaveAttribute('data-ruleset', 'nimble-knots-artillery-v10-r7');
  await expect(ui).toHaveAttribute('data-preview', 'V10 R7 terrain-as-gameplay preview · full volcanic battlefield · local-only');
  await expect(ui).toHaveAttribute('data-terrain-profile', 'volcanic-ruin');
  await expect(ui).toHaveAttribute('data-background', 'volcanic-ruin');
  await expect(ui).toHaveAttribute('data-background-ready', 'true');
  await expect(ui).toHaveAttribute('data-opening-survey-width', '2048');
  await expect(ui.locator('.combat-timer')).toHaveText(/^(59|60)s$/);
  await expect(ui.locator('.v9-thread')).toHaveText('Thread 5/9');
  await expect(ui.locator('.movement-zone')).toHaveAttribute('aria-label',
    'Movement buttons. Hold left or right to walk and steer in the air. Slide or tap up to jump.');
  for (const control of ['.movement-left', '.movement-jump', '.movement-right']) {
    const box = await ui.locator(control).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(48);
    expect(box!.height).toBeGreaterThanOrEqual(48);
  }
  await expect(ui.locator('.player-status .unit-status-value')).toBeHidden();
  await expect(ui.locator('.player-status .unit-status-track')).toBeVisible();
  await ui.locator('.v9-actions-button').tap();
  await ui.locator('.v9-attack').tap();
  await ui.locator('.relic-spoolburst').tap();
  await expect(ui).toHaveAttribute('data-selected-relic', 'spoolburst');
  await ui.locator('.v9-actions-button').tap();
  await ui.locator('.v9-attack').tap();
  await ui.locator('.relic-threadball').tap();
  await dragPad(page, '.combat-v10 .aim-zone', 1207, 0.35, 0);
  await expect(ui).toHaveAttribute('data-aim-locked', 'true');
  await expect(ui.locator('.fire-button')).toBeEnabled();
  await ui.locator('.fire-button').tap();
  await expect(ui).toHaveAttribute('data-combat-phase', /projectile|settling|retreat/);
  expect(errors).toEqual([]);
});

test('V10 R8 private preview renders bounded coin and chest physics without changing the R7 shell', async ({ page }) => {
  test.setTimeout(45_000);
  const errors = captureErrors(page);
  await page.goto('/?combat-preview=v10r8&objective-mode=collect&sideways=off');
  let ui = page.locator('.combat-v10');
  await expect(ui).toHaveAttribute('data-ruleset', 'nimble-knots-artillery-v10-r8');
  await expect(ui).toHaveAttribute('data-preview',
    'V10 R8 collect object-physics preview · mode rules deferred · local-only');
  await expect(ui).toHaveAttribute('data-objective-mode', 'collect');
  await expect(ui).toHaveAttribute('data-objective-recipe', 'volcanic-ruin-objectives-r1');
  await expect(ui).toHaveAttribute('data-objective-presentation', 'code-owned');
  await expect(ui).toHaveAttribute('data-objective-active', '7');
  await expect(ui).toHaveAttribute('data-objective-lost', '0');
  await expect(ui).toHaveAttribute('data-objective-hash', /^[a-f0-9]{64}$/);
  await expect(ui).toHaveAttribute('data-objective-positions', /coin-1,active/);
  await expect(ui).toHaveAttribute('data-terrain-profile', 'volcanic-ruin');
  await expect(ui).toHaveAttribute('data-background', 'volcanic-ruin');
  await expect(ui).toHaveAttribute('data-opening-survey-width', '2048');
  await expect(ui.locator('.combat-timer')).toHaveText(/^\d{1,2}s$/);
  await expect(ui).toHaveClass(/\bcombat-action-dynamics\b/);
  await expect(ui.locator('.movement-button')).toHaveCount(3);
  await expect(ui.locator('.movement-zone .pad-label')).toBeHidden();
  await expect(ui.locator('.movement-zone .pad-ring, .movement-zone .pad-knob')).toHaveCount(0);
  const [jump, left, right] = await Promise.all([
    ui.locator('.movement-jump').boundingBox(),
    ui.locator('.movement-left').boundingBox(),
    ui.locator('.movement-right').boundingBox()
  ]);
  for (const button of [jump, left, right]) {
    expect(button).not.toBeNull();
    expect(button!.width).toBeGreaterThanOrEqual(48);
    expect(button!.height).toBeGreaterThanOrEqual(48);
  }
  expect(Math.abs(left!.y - right!.y)).toBeLessThanOrEqual(1);
  expect(right!.x - left!.x - left!.width).toBeGreaterThanOrEqual(2);
  expect(right!.x - left!.x - left!.width).toBeLessThanOrEqual(4);
  expect(left!.y - jump!.y - jump!.height).toBeGreaterThanOrEqual(2);
  expect(left!.y - jump!.y - jump!.height).toBeLessThanOrEqual(4);
  const playerCard = ui.locator('.player-status');
  await expect(playerCard.locator('.unit-status-value')).toBeHidden();
  await expect(playerCard.locator('.unit-status-track')).toBeVisible();
  expect((await playerCard.boundingBox())?.height).toBeLessThanOrEqual(19);

  await ui.locator('.v9-actions-button').tap();
  await ui.locator('.v9-attack').tap();
  await ui.locator('.relic-needlepoint').tap();
  await dragPad(page, '.combat-v10 .aim-zone', 2601, 0.35, 0);
  await expect(ui).toHaveAttribute('data-aim-locked', 'true');
  await ui.locator('.fire-button').tap();
  await expect(ui).toHaveAttribute('data-combat-phase', /projectile|settling|retreat/);
  await expect(ui).toHaveAttribute('data-objective-active', '7');

  await page.goto('/?combat-preview=v10r8&objective-mode=defend&sideways=off');
  ui = page.locator('.combat-v10');
  await expect(ui).toHaveAttribute('data-ruleset', 'nimble-knots-artillery-v10-r8');
  await expect(ui).toHaveAttribute('data-objective-mode', 'defend');
  await expect(ui).toHaveAttribute('data-objective-active', '1');
  await expect(ui).toHaveAttribute('data-objective-positions', /player-chest,active/);
  expect(errors).toEqual([]);
});

test('V10 R7 full battlefield persists exact destruction across a local phone reload', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-390x844', 'Canonical phone persistence coverage.');
  test.setTimeout(60_000);
  await page.goto('/?combat-preview=v10r7&sideways=off');
  let ui = page.locator('.combat-v10');
  await expect(ui).toHaveAttribute('data-ruleset', 'nimble-knots-artillery-v10-r7');
  await expect(ui).toHaveAttribute('data-terrain-revision', '0');
  await expect(ui).toHaveAttribute('data-opening-survey-width', '2048');

  await ui.locator('.v9-actions-button').tap();
  await ui.locator('.v9-attack').tap();
  await ui.locator('.relic-threadball').tap();
  await dragPad(page, '.combat-v10 .aim-zone', 1207, 0.35, 0);
  await expect(ui).toHaveAttribute('data-aim-locked', 'true');
  await ui.locator('.fire-button').tap();
  await expect.poll(async () => Number(await ui.getAttribute('data-terrain-revision')),
    { timeout: 12_000 }).toBeGreaterThan(0);
  const revision = await ui.getAttribute('data-terrain-revision');
  const terrainHash = await ui.getAttribute('data-terrain-hash');
  expect(terrainHash).toMatch(/^[a-f0-9]{64}$/);

  await page.reload();
  ui = page.locator('.combat-v10');
  await expect(ui).toHaveAttribute('data-ruleset', 'nimble-knots-artillery-v10-r7');
  await expect(ui).toHaveAttribute('data-terrain-revision', revision!);
  await expect(ui).toHaveAttribute('data-terrain-hash', terrainHash!);
});

test('canonical Daily visuals cover availability, authorization, claim processing, and finality', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000);
  test.skip(testInfo.project.name !== 'chromium-390x844', 'Canonical Daily visual-state coverage.');
  const errors = captureErrors(page);
  const signer = createTestSigner();
  try {
    await page.exposeFunction('testNimiqVisualSign', (message: string) => signer.sign(message));
    await page.addInitScript(({ wallet }) => {
      const runtime = window as any;
      runtime.nimiq = {
        listAccounts: async () => [wallet],
        sign: async (message: string) => runtime.testNimiqVisualSign(message)
      };
      runtime.nimiqPay = { language: 'en' };
    }, { wallet: signer.address });

    await page.goto('/?sideways=off');
    await page.getByRole('button', { name: 'Check Daily Challenge' }).tap();
    await expect(page.locator('.daily-summary')).toHaveText(
      'Available today. Authorize the receiving wallet before play.'
    );
    await expect(page.locator('.daily-facts')).toContainText('1 NIM');
    await expect(page.locator('.daily-facts')).toContainText('One started attempt per wallet and UTC day');
    await screenshot(page, 'canonical-daily-available.png');

    await page.getByRole('button', { name: 'Choose Nimiq account' }).tap();
    await page.getByRole('button', { name: signer.address }).tap();
    await expect(page.getByRole('button', { name: 'Start Daily Challenge' })).toBeEnabled();
    await expect(page.locator('.identity-message')).toContainText(`Authorized as ${signer.address}`);
    await screenshot(page, 'canonical-daily-authorized.png');

    await page.goto('/?result-preview=reward&sideways=off');
    await expect(page.locator('.reward-result-status')).toContainText('ready to claim');
    await expect(page.locator('.reward-result-status')).toContainText('1 NIM');
    await expect(page.locator('.reward-result-status')).toContainText('NQ46 KLJE...H0NU T604');
    await screenshot(page, 'canonical-daily-claimable.png');

    await page.getByRole('button', { name: 'Claim fixed reward' }).tap();
    await expect(page.locator('.reward-result-status')).toContainText('queued for payout');
    await screenshot(page, 'canonical-daily-queued.png');

    await page.getByRole('button', { name: 'Refresh payout status' }).tap();
    await expect(page.locator('.reward-result-status')).toContainText('finalized');
    await expect(page.locator('.reward-transaction-hash')).toHaveText('a'.repeat(64));
    await screenshot(page, 'canonical-daily-finalized.png');
    expect(errors).toEqual([]);
  } finally {
    signer.dispose();
  }
});

test.describe('@legacy retired pre-V10 visual previews', () => {
test('compact landscape visuals cover Pause and full-screen fallback', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-844x390', 'Compact-landscape visual coverage.');
  const errors = captureErrors(page);
  await page.goto('/?combat-preview=1&sideways=off');
  await page.evaluate(() => {
    Object.defineProperty(document, 'fullscreenEnabled', {
      configurable: true,
      get: () => true
    });
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => null
    });
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: async () => {
        throw new DOMException('Host declined', 'NotSupportedError');
      }
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: async () => undefined
    });
    document.dispatchEvent(new Event('fullscreenchange'));
  });
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-orientation', 'landscape');
  await page.locator('.pause-button').tap();
  await expect(page.locator('.combat-pause-sheet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enter full screen' })).toBeVisible();
  await screenshot(page, 'landscape-pause.png');

  await page.getByRole('button', { name: 'Enter full screen' }).tap();
  await expect(page.getByText('Full screen is not supported by this app host')).toBeVisible();
  await screenshot(page, 'landscape-fullscreen-fallback.png');
  expect(errors).toEqual([]);
});
});

function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function screenshot(page: Page, name: string): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() =>
      requestAnimationFrame(() => resolve())
    ));
  });
  await expect(page).toHaveScreenshot(name);
}

async function assertMinimumTargets(page: Page, selector: string): Promise<void> {
  for (const target of await page.locator(selector).all()) {
    const box = await target.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(48);
    expect(box!.height).toBeGreaterThanOrEqual(48);
  }
}

async function assertDocumentLocked(page: Page): Promise<void> {
  const state = await page.evaluate(() => {
    window.scrollTo(20, 20);
    const viewport = window.visualViewport;
    const game = document.getElementById('game')!;
    const canvas = game.querySelector('canvas');
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const value = {
      scrollX,
      scrollY,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      viewportWidth: viewport?.width ?? innerWidth,
      viewportHeight: viewport?.height ?? innerHeight,
      viewportScale: viewport?.scale ?? 1,
      gameUserSelect: getComputedStyle(game).userSelect ||
        getComputedStyle(game).getPropertyValue('-webkit-user-select'),
      canvasTouchAction: canvas ? getComputedStyle(canvas).touchAction : 'none',
      viewportMeta: meta?.content ?? ''
    };
    window.scrollTo(0, 0);
    return value;
  });
  expect(state.scrollX).toBe(0);
  expect(state.scrollY).toBe(0);
  expect(state.scrollWidth).toBeLessThanOrEqual(state.viewportWidth + 1);
  expect(state.scrollHeight).toBeLessThanOrEqual(state.viewportHeight + 1);
  expect(state.viewportScale).toBe(1);
  expect(state.gameUserSelect).toBe('none');
  expect(state.canvasTouchAction).toBe('none');
  expect(state.viewportMeta).toContain('maximum-scale=1');
  expect(state.viewportMeta).toContain('user-scalable=no');
}

async function assertCombatGeometry(page: Page): Promise<void> {
  const ui = page.locator('.combat-ui');
  await expect(page.locator('.combat-turn')).toHaveText('Your turn');
  await expect(page.locator('.combat-stitching')).toHaveText(
    'Player Stitching 100. Loomkeeper Stitching 100.'
  );
  await expect(page.locator('.player-status')).toHaveAttribute(
    'aria-label',
    'Player Stitching 100 of 100'
  );
  await expect(page.locator('.loomkeeper-status')).toHaveAttribute(
    'aria-label',
    'Loomkeeper Stitching 100 of 100'
  );
  await expect(ui).toHaveAttribute('data-selected-relic', 'threadball');
  await expect(page.locator('.relic-trigger')).toHaveAttribute(
    'aria-label',
    'Choose Relic. Threadball selected'
  );
  const boxes = await Promise.all([
    page.locator('.movement-zone').boundingBox(),
    page.locator('.aim-zone').boundingBox(),
    page.locator('.combat-actions').boundingBox()
  ]);
  for (const box of boxes) expect(box).not.toBeNull();
  for (const box of boxes.slice(0, 2)) {
    expect(box!.width).toBeGreaterThanOrEqual(96);
    expect(box!.height).toBeGreaterThanOrEqual(96);
  }
  expect(overlaps(boxes[0]!, boxes[1]!)).toBe(false);
  expect(overlaps(boxes[0]!, boxes[2]!)).toBe(false);
  expect(overlaps(boxes[1]!, boxes[2]!)).toBe(false);
  const padLabelWidths = await page.locator('.combat-touch-zone .pad-label').evaluateAll(
    (labels) => labels.map((label) => ({
      clientWidth: label.clientWidth,
      scrollWidth: label.scrollWidth
    }))
  );
  expect(padLabelWidths).toHaveLength(2);
  for (const width of padLabelWidths) {
    expect(width.scrollWidth).toBeLessThanOrEqual(width.clientWidth + 1);
  }
  await assertMinimumTargets(page, '.combat-actions button:visible, .pause-button:visible');
  await assertSafeAreaContainment(page);
}

async function assertSafeAreaContainment(page: Page): Promise<void> {
  const bounds = await page.locator('#game').boundingBox();
  expect(bounds).not.toBeNull();
  for (const selector of ['.combat-status', '.pause-button', '.movement-zone', '.aim-zone', '.combat-actions']) {
    const box = await page.locator(selector).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(bounds!.x - 1);
    expect(box!.y).toBeGreaterThanOrEqual(bounds!.y - 1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height + 1);
  }
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;
}

function rectangularGap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): number {
  const horizontal = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), 0);
  const vertical = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height), 0);
  return Math.max(horizontal, vertical);
}

async function dragPad(
  page: Page,
  selector: string,
  pointerId: number,
  dx: number,
  dy: number
): Promise<void> {
  await page.locator(selector).evaluate((element, args) => {
    const rect = element.getBoundingClientRect();
    const origin = { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.55 };
    const target = { x: origin.x + rect.width * args.dx, y: origin.y + rect.height * args.dy };
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
  }, { pointerId, dx, dy });
}

async function aimAt(page: Page, angleDegrees: number, pointerId: number): Promise<void> {
  await page.locator('.aim-zone').evaluate((element, args) => {
    const rect = element.getBoundingClientRect();
    const radius = Math.max(24, Math.min(rect.width, rect.height) * 0.34);
    const radians = args.angleDegrees * Math.PI / 180;
    const origin = { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.55 };
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

async function installPresentationGate(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout.bind(window);
    const state: {
      target: string | null;
      blocked?: () => void;
    } = { target: null };
    window.setTimeout = ((handler: TimerHandler, timeout = 0, ...args: unknown[]) => {
      const phase = document.querySelector<HTMLElement>('.combat-ui')?.dataset.presentation;
      // Standard-motion casting and Unraveling can intentionally hold a
      // presentation phase for up to two seconds.
      if (phase && phase === state.target && timeout <= 2_500 && !state.blocked) {
        document.documentElement.dataset.visualCheckpoint = phase;
        state.blocked = () => nativeSetTimeout(handler, 0, ...args);
        return 0;
      }
      return nativeSetTimeout(handler, timeout, ...args);
    }) as typeof window.setTimeout;
    (window as any).__visualPresentationGate = {
      arm(phase: string) {
        state.target = phase;
      },
      release(next: string | null) {
        state.target = next;
        document.documentElement.removeAttribute('data-visual-checkpoint');
        const blocked = state.blocked;
        state.blocked = undefined;
        blocked?.();
      }
    };
  });
}

async function armPresentationGate(page: Page, phase: string): Promise<void> {
  await page.evaluate((next) => (window as any).__visualPresentationGate.arm(next), phase);
}

async function releasePresentationGate(page: Page, next: string | null): Promise<void> {
  await page.evaluate((phase) => (window as any).__visualPresentationGate.release(phase), next);
}

async function capturePresentation(page: Page, phase: string, name: string): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-visual-checkpoint', phase);
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-presentation', phase);
  await screenshot(page, name);
}
