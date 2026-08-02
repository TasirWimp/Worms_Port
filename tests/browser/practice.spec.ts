import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto('/?sideways=off');
  await expect(page.getByRole('heading', { name: 'Practice Clash' })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.practice-sideways-note:visible')).toHaveCount(0);
  await expect.poll(() => pageErrors).toEqual([]);
  await expect.poll(() => consoleErrors).toEqual([]);
});

test('live practice supports authoritative pause, full player turn, and fresh retry', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
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
  await selectRelic(page, 'Spoolburst');
  await expect(ui).toHaveAttribute('data-selected-relic', 'spoolburst');
  await dragPad(page, '.aim-zone', 22, 0.3, -0.34);
  await expect(page.locator('.fire-button')).toBeEnabled();
  await installPresentationRecorder(page);
  await page.locator('.fire-button').tap();
  await expect.poll(async () => Number(await ui.getAttribute('data-turn')), {
    timeout: 15_000
  }).toBeGreaterThanOrEqual(2);
  await expect(ui).toHaveAttribute('data-active-actor', 'player');
  await expect(ui).toHaveAttribute('data-presenting', 'false');
  await expect(ui).toHaveAttribute('data-preview-points', '0');
  const presentation = await readPresentationRecorder(page);
  expect(presentation.phases).toEqual(expect.arrayContaining([
    'player-projectile',
    'player-impact',
    'loomkeeper-aim',
    'loomkeeper-projectile',
    'loomkeeper-impact'
  ]));
  expect(presentation.maximumProjectilePoints).toBeGreaterThan(1);

  await page.locator('.pause-button').tap();
  await expect(page.locator('.combat-pause-sheet')).toBeVisible();
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
  const viewport = page.viewportSize()!;
  if (viewport.width > viewport.height) {
    await page.setViewportSize({ width: 800, height: 300 });
    await expect(page.locator('.combat-ui')).toHaveAttribute('data-orientation', 'landscape');
  }
  await assertControlsFit(page);
  for (const button of await page.locator('.combat-actions button:visible').all()) {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(48);
    expect(box!.height).toBeGreaterThanOrEqual(48);
  }
});

test('default sideways mode carries the live practice journey into virtual landscape', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-390x844', 'One portrait viewport is sufficient.');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Practice Clash' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-sideways', 'right');
  const instruction = page.locator('.practice-sideways-note-right');
  await expect(instruction).toBeVisible();
  await expect(instruction).toContainText('switch off Auto rotate');
  await expect(instruction).toContainText("phone's top points left");
  await page.screenshot({ path: testInfo.outputPath('wp-011d-start-instruction.png') });
  await page.getByRole('button', { name: 'Start Practice' }).tap();
  const ui = page.locator('.combat-ui');
  await expect(ui).toBeVisible();
  await expect(ui).toHaveAttribute('data-orientation', 'landscape');
  await assertControlsFit(page);

  const startX = Number(await ui.getAttribute('data-player-x'));
  await dragPad(page, '.movement-zone', 61, 0, 0.36);
  await expect.poll(async () => Number(await ui.getAttribute('data-player-x'))).toBeGreaterThan(startX);
});

test('two consecutive completed Clashes each show a result and use fresh authority', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  test.skip(testInfo.project.name !== 'chromium-390x844', 'One deterministic live journey is sufficient.');
  await page.getByRole('button', { name: 'Start Practice' }).tap();
  const ui = page.locator('.combat-ui');
  await expect(ui).toBeVisible();
  const firstChallenge = await ui.getAttribute('data-challenge-id');
  const firstSeed = await ui.getAttribute('data-seed');

  await completeCurrentClash(page);
  await expect(page.locator('.result-shell')).toBeVisible();
  await page.getByRole('button', { name: 'Play Again' }).tap();
  await expect(ui).toBeVisible();
  await expect.poll(() => ui.getAttribute('data-challenge-id')).not.toBe(firstChallenge);
  const secondChallenge = await ui.getAttribute('data-challenge-id');
  const secondSeed = await ui.getAttribute('data-seed');
  expect(secondChallenge).not.toBe(firstChallenge);
  expect(secondSeed).not.toBe(firstSeed);

  await completeCurrentClash(page);
  await expect(page.locator('.result-shell')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play Again' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change Calling' })).toBeVisible();
});

test('a full-screen match retains an exit toggle on the result screen', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  test.skip(testInfo.project.name !== 'chromium-844x390', 'One landscape journey is sufficient.');
  await installFullscreenStub(page);
  await page.getByRole('button', { name: 'Start Practice' }).tap();
  await expect(page.locator('.combat-ui')).toBeVisible();
  await page.locator('.pause-button').tap();
  await expect(page.locator('.combat-pause-sheet')).toBeVisible();
  await page.getByRole('button', { name: 'Enter full screen' }).tap();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.locator('.pause-button').tap();
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-paused', 'false');

  await completeCurrentClash(page);
  await expect(page.locator('.result-shell')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Exit full screen' })).toBeVisible();
  await page.getByRole('button', { name: 'Exit full screen' }).tap();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await expect(page.getByText('Returned to default screen')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enter full screen' })).toBeVisible();

  await page.getByRole('button', { name: 'Play Again' }).tap();
  await expect(page.locator('.combat-ui')).toBeVisible();
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-fullscreen', 'false');
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

async function installFullscreenStub(page: Page): Promise<void> {
  await page.evaluate(() => {
    let active: Element | null = null;
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => active });
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: async () => {
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
}

async function completeCurrentClash(page: Page): Promise<void> {
  const ui = page.locator('.combat-ui');
  for (let shot = 0; shot < 10; shot += 1) {
    const state = await expect.poll(
      () => page.evaluate(() => {
        if (document.querySelector('.result-shell')) return 'result';
        const combat = document.querySelector<HTMLElement>('.combat-ui');
        return combat?.dataset.presenting === 'false' &&
          combat.dataset.activeActor === 'player' ? 'ready' : 'waiting';
      }),
      { timeout: 30_000 }
    ).toMatch(/^(ready|result)$/);
    void state;
    if (await page.locator('.result-shell').count()) return;

    if (await ui.getAttribute('data-selected-relic') !== 'threadball') {
      await selectRelic(page, 'Threadball');
      await expect(ui).toHaveAttribute('data-selected-relic', 'threadball');
    }
    const seed = Number(await ui.getAttribute('data-seed'));
    await aimAt(page, seed === 3_735_928_559 ? 35 : 40, shot + 100);
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
  throw new Error('Practice Clash did not reach a terminal result within ten player shots.');
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

async function selectRelic(page: Page, name: 'Threadball' | 'Needlepoint' | 'Spoolburst'): Promise<void> {
  await page.locator('.relic-trigger').tap();
  await expect(page.locator('.relic-chooser')).toBeVisible();
  await page.getByRole('button', { name: `Select ${name}` }).tap();
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
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;
}

async function installPresentationRecorder(page: Page): Promise<void> {
  await page.locator('.combat-ui').evaluate((element) => {
    const state = { phases: [] as string[], maximumProjectilePoints: 0 };
    (window as typeof window & { __practicePresentation?: typeof state }).__practicePresentation = state;
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
      __practicePresentation: { phases: string[]; maximumProjectilePoints: number }
    }
  ).__practicePresentation);
}
