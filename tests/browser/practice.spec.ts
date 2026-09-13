import { expect, test, type Page } from '@playwright/test';

import { skipExcludedProjectBeforeSetup } from './support/project-routing';
import path from 'node:path';
import { createRuntimeServer } from '../../server/src/runtime';
import { V8_R1_RULESET_ID } from '../../shared/simulation-v8';
import { V9_RULESET_ID } from '../../shared/simulation-v9';
import { CURRENT_V10_RULESET_ID } from '../../shared/simulation-v10';

test.describe('@legacy retired V8/V9 authorities', () => {
test('deployed V9 Practice opens from the phone URL with live authority and supports paused restart', async ({ page }) => {
  const runtime = createRuntimeServer({ clientDir: path.resolve('client/build'),
    sessionRegistry: { practiceV9: 'v9d-practice' }, identity: false });
  const port = await runtime.listen();
  try {
    await page.goto(`http://127.0.0.1:${port}/?combat-preview=v9-live`);
    await page.getByRole('button', { name: 'Start Practice' }).tap();
    const ui = page.locator('.combat-v9');
    await expect(ui).toBeVisible();
    await expect(ui).toHaveAttribute('data-ruleset', V9_RULESET_ID);
    await expect(ui.locator('.pause-button')).toBeEnabled();
    await ui.locator('.pause-button').tap();
    await expect(ui).toHaveAttribute('data-paused', 'true');
    await ui.locator('.v9-reenter').tap();
    await expect(ui).toHaveAttribute('data-paused', 'false');
    await expect(page.locator('.result-shell')).toHaveCount(0);
    await expect(ui.locator('.pause-button')).toBeEnabled();
  } finally { await page.goto('about:blank'); await runtime.close(); }
});

test('V9 server timing stop at AI handoff shows interruption and permits a fresh retry', async ({ page }) => {
  let nowUs = 0;
  const runtime = createRuntimeServer({ clientDir: path.resolve('client/build'), sessionRegistry: {
    simulationRulesetId: V9_RULESET_ID, seedSource: () => 1, simulationTickIntervalMs: false,
    v9TestOnly: { nowUs: () => nowUs, tickIntervalMs: 10 }
  } });
  const port = await runtime.listen();
  try {
    await page.goto(`http://127.0.0.1:${port}/?combat-preview=v9-live`);
    await page.getByRole('button', { name: 'Start Practice' }).tap();
    const ui = page.locator('.combat-v9');
    await expect(ui).toBeVisible();
    const bound = () => runtime.sessions.getBound([...runtime.io.sockets.sockets.values()][0].id)!;
    const first = runtime.sessions.activeSnapshotV9(bound())!.challengeId;
    runtime.sessions.advanceV9Test(first, 450);
    await expect(ui).toHaveAttribute('data-active-actor', 'loomkeeper');
    nowUs += 1_100_000;
    await expect(page.getByRole('heading', { name: 'Practice interrupted', exact: true })).toBeVisible();
    await expect(page.locator('.result-copy')).toContainText('server could not keep up');
    await expect(page.locator('.result-copy')).not.toContainText('expiry');
    await page.getByRole('button', { name: 'Play Again', exact: true }).tap();
    await expect(ui).toBeVisible();
    await expect.poll(() => runtime.sessions.activeSnapshotV9(bound())?.challengeId).not.toBe(first);
    await expect(ui.locator('.pause-button')).toBeEnabled();
  } finally { await page.goto('about:blank'); await runtime.close(); }
});

test('live V9 candidate preserves pause, AI response, terminal result and fresh retry', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let now = Date.now();
  const runtime = createRuntimeServer({ clientDir: path.resolve('client/build'), sessionRegistry: {
    now: () => now, challengeTtlMs: 60_000, simulationRulesetId: V9_RULESET_ID,
    seedSource: () => 1, simulationTickIntervalMs: false, v9TestOnly: { nowUs: () => 0 }
  } });
  const port = await runtime.listen();
  try {
    await page.goto(`http://127.0.0.1:${port}/?sideways=off&combat-preview=v9-live`);
    await page.getByRole('button', { name: 'Start Practice' }).tap();
    const ui = page.locator('.combat-v9');
    await expect(ui).toBeVisible();
    await expect(ui).toHaveAttribute('data-ruleset', V9_RULESET_ID);
    await ui.locator('.pause-button').tap();
    await expect(ui).toHaveAttribute('data-paused', 'true');
    await ui.locator('.pause-button').tap();
    await expect(ui).toHaveAttribute('data-paused', 'false');
    // Interrupt the real transport, then prove an owned resync permits a new command.
    [...runtime.io.sockets.sockets.values()][0].conn.close();
    await expect(ui).toHaveAttribute('data-connection', 'reconnecting');
    await expect(ui).toHaveAttribute('data-connection', 'connected', { timeout: 10_000 });
    await ui.locator('.pause-button').tap();
    await expect(ui).toHaveAttribute('data-paused', 'true');
    await ui.locator('.pause-button').tap();
    await expect(ui).toHaveAttribute('data-paused', 'false');
    const bound = () => runtime.sessions.getBound([...runtime.io.sockets.sockets.values()][0].id)!;
    const first = runtime.sessions.activeSnapshotV9(bound())!.challengeId;
    runtime.sessions.advanceV9Test(first, 450);
    await expect(ui).toHaveAttribute('data-active-actor', 'loomkeeper');
    runtime.sessions.advanceV9Test(first, 350);
    const replay = runtime.sessions.replayForChallengeV9(bound(), first)!;
    expect(JSON.stringify(replay)).toContain('fire');
    now += 60_001;
    runtime.sessions.sweep();
    await expect(page.locator('.result-shell')).toHaveAttribute('data-outcome', 'expired');
    await expect(page.getByRole('heading', { name: 'Practice expired', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Play Again', exact: true }).tap();
    await expect(ui).toBeVisible();
    await expect.poll(() => runtime.sessions.activeSnapshotV9(bound())?.challengeId).not.toBe(first);
    await expect(ui.locator('.pause-button')).toBeEnabled();
    const second = runtime.sessions.activeSnapshotV9(bound())!.challengeId;
    await ui.locator('.pause-button').tap();
    await expect(ui).toHaveAttribute('data-paused', 'true');
    await ui.locator('.v9-reenter').tap();
    await expect(ui).toHaveAttribute('data-paused', 'false');
    await expect.poll(() => runtime.sessions.activeSnapshotV9(bound())?.challengeId).not.toBe(second);
    await expect(page.locator('.result-shell')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await page.goto('about:blank'); await runtime.close(); }
});

test('injected automated Practice reloads paused authority, retries, and shows the actual expired result', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.stack ?? error.message));
  let now = Date.now();
  const runtime = createRuntimeServer({ clientDir: path.resolve('client/build'), sessionRegistry: {
    now: () => now, challengeTtlMs: 60_000, simulationRulesetId: V8_R1_RULESET_ID,
    simulationTickIntervalMs: false, v8TestOnly: {} } });
  const port = await runtime.listen();
  try {
    await page.goto(`http://127.0.0.1:${port}/?sideways=off`);
    await page.getByRole('button', { name: 'Start Practice' }).tap();
    const ui = page.locator('.combat-v8');
    // Live scene arguments must mount after Phaser's synchronous create phase.
    await expect(ui).toBeVisible();
    await expect(ui).toHaveAttribute('data-ruleset', V8_R1_RULESET_ID);
    const first = await ui.getAttribute('data-challenge-id');
    await page.locator('.pause-button').tap();
    await expect(ui).toHaveAttribute('data-paused', 'true');
    await page.reload();
    await page.getByRole('button', { name: 'Resume Paused Clash' }).tap();
    await expect(ui).toHaveAttribute('data-challenge-id', first!);
    await expect(ui).toHaveAttribute('data-paused', 'true');
    await page.locator('.pause-button').tap();
    await expect(ui).toHaveAttribute('data-paused', 'false');
    await page.locator('.pause-button').tap();
    await expect(ui).toHaveAttribute('data-paused', 'true');
    await page.locator('.retry-button').tap();
    await expect(ui).not.toHaveAttribute('data-challenge-id', first!);
    await expect(ui).toHaveAttribute('data-ruleset', V8_R1_RULESET_ID);
    await expect(page.locator('.result-shell')).toHaveCount(0);
    now += 60_001; runtime.sessions.sweep();
    await expect(page.locator('.result-shell')).toHaveAttribute('data-outcome', 'expired');
    await expect(page.locator('.result-shell')).toHaveAttribute('data-final-hash', /^[a-f0-9]{64}$/);
    await page.getByRole('button', { name: 'Change Calling' }).tap();
    await expect(page.getByRole('heading', { name: 'Practice Clash' })).toBeVisible();
    await expect(page.locator('.result-shell')).toHaveCount(0);
    await page.getByRole('button', { name: 'Start Practice' }).tap();
    await expect(ui).toHaveAttribute('data-ruleset', V8_R1_RULESET_ID);
  } finally {
    expect.soft(pageErrors, 'Automated Practice must not raise browser page errors.').toEqual([]);
    await page.goto('about:blank'); await runtime.close();
  }
});
});

test.beforeEach(async ({ page }, testInfo) => {
  skipExcludedProjectBeforeSetup('practice.spec.ts', testInfo);
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

test.describe('@legacy retired pre-V10 live Practice behavior', () => {
test('live practice supports authoritative pause, full player turn, and fresh retry', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
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
  await expect.poll(async () => {
    if (await page.locator('.result-shell').count()) return 'result';
    return Number(await ui.getAttribute('data-turn')) >= 2 &&
      await ui.getAttribute('data-active-actor') === 'player' &&
      await ui.getAttribute('data-presenting') === 'false'
      ? 'ready'
      : 'waiting';
  }, {
    // A live exchange now includes normal-motion casts for both actors and,
    // when terminal, the two-second Unraveling presentation. Match the
    // existing per-turn lifecycle allowance used by completeCurrentClash. A
    // retained Ubuntu failure reached the terminal result immediately after
    // the old poll expired, so keep a bounded 15-second CI scheduling margin.
    timeout: 45_000
  }).toMatch(/^(ready|result)$/);
  const terminalAfterReply = await page.locator('.result-shell').count() > 0;
  if (terminalAfterReply) {
    await expect(page.locator('.result-shell')).toBeVisible();
  } else {
    await expect(ui).toHaveAttribute('data-active-actor', 'player');
    await expect(ui).toHaveAttribute('data-presenting', 'false');
    await expect(ui).toHaveAttribute('data-preview-points', '0');
  }
  const presentation = await readPresentationRecorder(page);
  expect(presentation.phases).toEqual(expect.arrayContaining([
    'player-cast-charge',
    'player-cast-formation',
    'player-projectile',
    'player-impact',
    'loomkeeper-aim',
    'loomkeeper-projectile',
    'loomkeeper-impact'
  ]));
  expect(presentation.phases.indexOf('player-cast-charge')).toBeLessThan(
    presentation.phases.indexOf('player-cast-formation')
  );
  expect(presentation.phases.indexOf('player-cast-formation')).toBeLessThan(
    presentation.phases.indexOf('player-projectile')
  );
  expect(presentation.maximumProjectilePoints).toBeGreaterThan(1);
  expect(presentation.projectileVisuals).toContainEqual({
    phase: 'player-projectile',
    visual: 'generic-spoolburst'
  });
  expect(presentation.projectileVisuals).toContainEqual(expect.objectContaining({
    phase: 'loomkeeper-projectile',
    visual: expect.stringMatching(/^(threadball|generic-(needlepoint|spoolburst))$/)
  }));

  if (terminalAfterReply) {
    await page.getByRole('button', { name: 'Play Again' }).tap();
  } else {
    await page.locator('.pause-button').tap();
    await expect(page.locator('.combat-pause-sheet')).toBeVisible();
    await page.locator('.retry-button').tap();
  }
  await expect(ui).toBeVisible();
  await expect.poll(() => ui.getAttribute('data-challenge-id')).not.toBe(firstChallenge);
  await expect(ui).toHaveAttribute('data-turn', '0');
  await expect(ui).toHaveAttribute('data-calling', 'warrior');
  if (!terminalAfterReply) {
    await expect(page.getByText(/Fresh Practice Clash started/i)).toBeVisible();
  }
  await page.screenshot({ path: testInfo.outputPath('wp-011-live-practice.png') });
});
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
  await page.locator('.pause-button').tap();
  await expect(page.locator('.combat-ui')).toHaveAttribute('data-paused', 'true');
});

test('default sideways mode carries the live practice journey into virtual landscape', async ({ page }, testInfo) => {
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
  await page.locator('.pause-button').tap();
  await expect(ui).toHaveAttribute('data-paused', 'true');
});

test.describe('@legacy retired pre-V10 result and recovery behavior', () => {
test('two consecutive completed Clashes each show a result and use fresh authority', async ({ page }) => {
  test.setTimeout(120_000);
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

test('a full-screen match retains an exit toggle on the result screen', async ({ page }) => {
  test.setTimeout(90_000);
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
    const state = {
      phases: [] as string[],
      maximumProjectilePoints: 0,
      projectileVisuals: [] as { phase: string; visual: string }[]
    };
    (window as typeof window & { __practicePresentation?: typeof state }).__practicePresentation = state;
    const record = () => {
      const phase = (element as HTMLElement).dataset.presentation;
      if (phase && state.phases.at(-1) !== phase) state.phases.push(phase);
      const visual = (element as HTMLElement).dataset.projectileVisual;
      if (phase?.endsWith('-projectile') && visual) {
        const previous = state.projectileVisuals.at(-1);
        if (!previous || previous.phase !== phase || previous.visual !== visual) {
          state.projectileVisuals.push({ phase, visual });
        }
      }
      state.maximumProjectilePoints = Math.max(
        state.maximumProjectilePoints,
        Number((element as HTMLElement).dataset.projectilePoints || 0)
      );
    };
    new MutationObserver(record).observe(element, {
      attributes: true,
      attributeFilter: ['data-presentation', 'data-projectile-points', 'data-projectile-visual']
    });
    record();
  });
}

async function readPresentationRecorder(page: Page): Promise<{
  phases: string[];
  maximumProjectilePoints: number;
  projectileVisuals: { phase: string; visual: string }[];
}> {
  return page.evaluate(() => (
    window as typeof window & {
      __practicePresentation: {
        phases: string[];
        maximumProjectilePoints: number;
        projectileVisuals: { phase: string; visual: string }[];
      }
    }
  ).__practicePresentation);
}


test('standard volcanic Practice at root keeps authority, AI, cold resume and restart background', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  let now = Date.now();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const fetched: string[] = []; page.on('request', request => fetched.push(request.url()));
  const runtime = createRuntimeServer({ clientDir: path.resolve('client/build'), identity: false,
    sessionRegistry: { practiceV10: true, now: () => now, challengeTtlMs: 120_000, seedSource: () => 4 } });
  const port = await runtime.listen();
  const owned = () => runtime.sessions.getBound([...runtime.io.sockets.sockets.values()][0]?.id)!;
  try {
    await page.goto(`http://127.0.0.1:${port}/`);
    await expect(page.getByRole('button', { name: 'Start Practice' })).toBeVisible();
    expect(fetched.some(url => /mini-app-sdk|volcanic-cone-v1/.test(url))).toBe(false);
    await page.getByRole('button', { name: 'Start Practice' }).tap();
    const ui = page.locator('.combat-v10');
    await expect(ui).toHaveAttribute('data-ruleset', CURRENT_V10_RULESET_ID);
    await expect(ui.locator('.combat-timer')).toHaveText(/^(59|60)s$/);
    await expect(ui).toHaveAttribute('data-background', 'volcanic-ruin');
    await expect(ui).toHaveAttribute('data-background-ready', 'true');
    await expect(ui).toHaveAttribute('data-camera-left', '512.00');
    const first = runtime.sessions.activeSnapshotV10(owned())!.challengeId;
    await ui.locator('.pause-button').tap();
    await expect(ui).toHaveAttribute('data-paused', 'true');
    await page.reload();
    await page.getByRole('button', { name: 'Resume Paused Clash' }).tap();
    await expect(ui).toHaveAttribute('data-background', 'volcanic-ruin');
    await expect(ui).toHaveAttribute('data-background-ready', 'true');
    expect(runtime.sessions.activeSnapshotV10(owned())!.challengeId).toBe(first);
    // The entry resumes the paused match; pause it again before restarting.
    if (await ui.getAttribute('data-paused') !== 'true') await ui.locator('.pause-button').tap();
    await expect(ui).toHaveAttribute('data-paused', 'true');
    await ui.locator('.v9-reenter').tap();
    await expect(ui).toHaveAttribute('data-paused', 'false');
    await expect.poll(() => runtime.sessions.activeSnapshotV10(owned())?.challengeId).not.toBe(first);
    await expect(ui).toHaveAttribute('data-background', 'volcanic-ruin');
    await expect(ui).toHaveAttribute('data-background-ready', 'true');
    const sideways = await page.evaluate(() => document.documentElement.dataset.sideways);
    await dragPad(page, '.combat-v10 .aim-zone', 1199, sideways ? 0 : 0.35,
      sideways === 'right' ? 0.35 : sideways === 'left' ? -0.35 : 0);
    await expect(ui).toHaveAttribute('data-aim-locked', 'true');
    await ui.locator('.fire-button').tap();
    await expect(ui).toHaveAttribute('data-player-thread', '1');
    await expect(ui).toHaveAttribute('data-active-actor', 'loomkeeper', { timeout: 12_000 });
    await expect(ui).toHaveAttribute('data-active-actor', 'player', { timeout: 35_000 });
    const second = runtime.sessions.activeSnapshotV10(owned())!.challengeId;
    now += 120001; runtime.sessions.sweep();
    await expect(page.locator('.result-shell')).toBeVisible();
    await page.getByRole('button', { name: 'Play Again', exact: true }).tap();
    await expect(ui).toHaveAttribute('data-background', 'volcanic-ruin');
    await expect(ui).toHaveAttribute('data-background-ready', 'true');
    expect(runtime.sessions.activeSnapshotV10(owned())!.challengeId).not.toBe(second);
    expect(fetched.some(url => /mini-app-sdk/.test(url))).toBe(false);
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('standard-volcanic-retry.png') });
  } finally { await page.goto('about:blank'); await runtime.close(); }
});

test('current R6 phone controls combine held movement, Hop and bounded jump aftertouch', async ({ page }) => {
  test.setTimeout(45_000);
  const runtime = createRuntimeServer({ clientDir: path.resolve('client/build'), identity: false,
    sessionRegistry: { practiceV10: true, seedSource: () => 4 } });
  const port = await runtime.listen();
  const owned = () => runtime.sessions.getBound([...runtime.io.sockets.sockets.values()][0]?.id)!;
  try {
    await page.goto(`http://127.0.0.1:${port}/?sideways=off`);
    await page.getByRole('button', { name: 'Start Practice' }).tap();
    const ui = page.locator('.combat-v10');
    await expect(ui).toHaveAttribute('data-ruleset', CURRENT_V10_RULESET_ID);
    const hop = ui.locator('.jump-button');
    await expect(hop).toBeVisible();
    const hopBox = await hop.boundingBox();
    expect(hopBox?.width).toBeGreaterThanOrEqual(48);
    expect(hopBox?.height).toBeGreaterThanOrEqual(48);
    const actionBox = await ui.locator('.combat-actions').boundingBox();
    const actionButtons = await Promise.all([
      ui.locator('.v9-actions-button').boundingBox(),
      hop.boundingBox(),
      ui.locator('.fire-button').boundingBox()
    ]);
    expect(actionBox).not.toBeNull();
    expect(actionButtons.every(box => box && Math.abs(box.y - actionButtons[0]!.y) < 1)).toBe(true);
    expect(actionButtons.every(box => box && box.x >= actionBox!.x && box.x + box.width <= actionBox!.x + actionBox!.width + 1)).toBe(true);

    const playerCard = ui.locator('.player-status');
    await expect(playerCard.locator('.unit-status-value')).toBeHidden();
    await expect(playerCard.locator('.unit-status-track')).toBeVisible();
    expect((await playerCard.boundingBox())?.height).toBeLessThanOrEqual(19);
    await expect(playerCard.locator('.unit-status-track span')).toHaveCSS('width', /[3-9][0-9]px/);
    await expect(playerCard.locator('.unit-status-track span')).toHaveCSS('background-color', 'rgb(31, 193, 31)');

    const startX = runtime.sessions.activeSnapshotV10(owned())!.simulation.units[0].xFp;
    await pointer(page, '.combat-v10 .movement-zone', 'pointerdown', 1301, 0.5, 0.55);
    await pointer(page, '.combat-v10 .movement-zone', 'pointermove', 1301, 0.82, 0.55);
    await expect.poll(() => runtime.sessions.activeSnapshotV10(owned())!.simulation.units[0].xFp).toBeGreaterThan(startX);

    await hop.tap();
    await expect.poll(() => runtime.sessions.activeSnapshotV10(owned())!.simulation.units[0].grounded).toBe(false);
    await pointer(page, '.combat-v10 .movement-zone', 'pointermove', 1301, 0.18, 0.55);
    await expect.poll(() => {
      const unit = runtime.sessions.activeSnapshotV10(owned())!.simulation.units[0];
      return !unit.grounded && unit.vxFp < 320;
    }).toBe(true);
    await expect.poll(() => runtime.sessions.activeSnapshotV10(owned())!.simulation.units[0].grounded,
      { timeout: 5_000 }).toBe(true);
    await pointer(page, '.combat-v10 .movement-zone', 'pointerup', 1301, 0.18, 0.55);
    await expect.poll(() => runtime.sessions.activeSnapshotV10(owned())!.simulation.heldDirection).toBe(0);
  } finally { await page.goto('about:blank'); await runtime.close(); }
});


test('standard volcanic Practice survives missing art and expired-session reconnect', async ({ page, context }) => {
  test.setTimeout(45_000);
  const runtime = createRuntimeServer({ clientDir: path.resolve('client/build'), identity: false,
    sessionRegistry: { practiceV10: true, seedSource: () => 4 } });
  const port = await runtime.listen();
  try {
    await page.route('**/volcanic-cone-v1.png', route => route.abort());
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.getByRole('button', { name: 'Start Practice' }).tap();
    const ui = page.locator('.combat-v10');
    await expect(ui).toHaveAttribute('data-background-ready', 'false');
    await expect(ui).toHaveAttribute('data-ruleset', CURRENT_V10_RULESET_ID);
    await expect(ui.locator('.pause-button')).toBeEnabled();
    await ui.locator('.pause-button').tap();
    await expect(ui).toHaveAttribute('data-paused', 'true');
    const socket = [...runtime.io.sockets.sockets.values()][0];
    const previousSession = runtime.sessions.getBound(socket.id)!.id;
    await context.setOffline(true);
    await expect(ui).toHaveAttribute('data-connection', 'reconnecting');
    runtime.sessions.close(previousSession);
    await context.setOffline(false);
    await expect(page.locator('.result-shell')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Play Again', exact: true }).tap();
    await expect(ui).toHaveAttribute('data-ruleset', CURRENT_V10_RULESET_ID);
    await expect(ui).toHaveAttribute('data-background-ready', 'false');
    const next = runtime.sessions.getBound([...runtime.io.sockets.sockets.values()][0].id)!;
    expect(next.id).not.toBe(previousSession);
    await expect(ui.locator('.pause-button')).toBeEnabled();
  } finally { await context.setOffline(false); await page.goto('about:blank'); await runtime.close(); }
});
