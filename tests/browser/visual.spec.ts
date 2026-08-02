import { expect, test, type Page } from '@playwright/test';
import { PrivateKey, PublicKey, Signature } from '@nimiq/core';

import { nimiqSignedMessageHash } from '../../server/src/identity/crypto';
import {
  applySyntheticSafeArea,
  SYNTHETIC_SAFE_AREA
} from './support/safe-area';

const PRIVATE_KEY = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';

test('visual geometry baselines cover start, combat, result, and recovery', async ({ page }) => {
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
  await aimAt(page, 40, 302);
  await expect(page.locator('.fire-button')).toBeEnabled();
  await armPresentationGate(page, 'player-projectile');
  await page.locator('.fire-button').tap();
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
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-presenting', 'false');
  expect(errors).toEqual([]);
});

test('canonical Daily visuals cover availability, authorization, claim processing, and finality', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000);
  test.skip(testInfo.project.name !== 'chromium-390x844', 'Canonical Daily visual-state coverage.');
  const errors = captureErrors(page);
  const privateKey = PrivateKey.fromHex(PRIVATE_KEY);
  const publicKey = PublicKey.derive(privateKey);
  const addressObject = publicKey.toAddress();
  const address = addressObject.toUserFriendlyAddress();
  addressObject.free();
  try {
    await page.exposeFunction('testNimiqVisualSign', (message: string) => {
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
        sign: async (message: string) => runtime.testNimiqVisualSign(message)
      };
      runtime.nimiqPay = { language: 'en' };
    }, { wallet: address });

    await page.goto('/?sideways=off');
    await page.getByRole('button', { name: 'Check Daily Challenge' }).tap();
    await expect(page.locator('.daily-summary')).toHaveText(
      'Available today. Authorize the receiving wallet before play.'
    );
    await expect(page.locator('.daily-facts')).toContainText('1 NIM');
    await expect(page.locator('.daily-facts')).toContainText('One started attempt per wallet and UTC day');
    await screenshot(page, 'canonical-daily-available.png');

    await page.getByRole('button', { name: 'Choose Nimiq account' }).tap();
    await page.getByRole('button', { name: address }).tap();
    await expect(page.getByRole('button', { name: 'Start Daily Challenge' })).toBeEnabled();
    await expect(page.locator('.identity-message')).toContainText(`Authorized as ${address}`);
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
    await screenshot(page, 'canonical-daily-finalized.png');
    expect(errors).toEqual([]);
  } finally {
    publicKey.free();
    privateKey.free();
  }
});

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
      if (phase && phase === state.target && timeout <= 1_000 && !state.blocked) {
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
