import {
  expect,
  test,
  type BrowserContextOptions,
  type Page,
  type TestInfo
} from '@playwright/test';

import { createTestSigner } from '../support/nimiq-signer';

const CANONICAL_PROJECTS = new Set(['chromium-390x844', 'webkit-390x844']);

test('V8 interruptions require fresh walking and Jump presses without pausing hidden combat', async ({ page }) => {
  const errors = captureErrors(page);
  await page.goto('/?combat-preview=v8&sideways=off');
  const ui = page.locator('.combat-v8'); await expect(ui).toBeVisible();
  for (const interruption of ['blur', 'hidden', 'pointercancel', 'lostpointercapture', 'rotation', 'wallet']) {
    await pointer(page, '.movement-zone', 'pointerdown', 211, 0.5, 0.5);
    await pointer(page, '.movement-zone', 'pointermove', 211, 1.8, 0.5);
    await expect(ui).toHaveAttribute('data-held-direction', '1');
    await page.evaluate((kind) => {
      if (kind === 'hidden') {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
      } else if (kind === 'pointercancel' || kind === 'lostpointercapture') {
        document.querySelector('.movement-zone')!.dispatchEvent(new PointerEvent(kind, { pointerId: 211, bubbles: true }));
      } else {
        window.dispatchEvent(new Event(kind === 'rotation' ? 'orientationchange' : kind === 'wallet' ? 'nimble-knots:wallet-boundary' : 'blur'));
        window.dispatchEvent(new Event('focus'));
      }
    }, interruption);
    if (interruption === 'hidden') {
      await expect(ui).toHaveAttribute('data-suspended', 'true');
      const hiddenTick = Number(await ui.getAttribute('data-simulation-tick'));
      await expect.poll(async () => Number(await ui.getAttribute('data-simulation-tick'))).toBeGreaterThan(hiddenTick + 3);
      await page.evaluate(() => {
        delete (document as Document & { hidden?: boolean }).hidden;
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('focus'));
      });
    }
    await expect(ui).toHaveAttribute('data-held-direction', '0');
    await expect(page.locator('.movement-zone')).not.toHaveClass(/is-active/);
    await pointer(page, '.movement-zone', 'pointermove', 211, 1.8, 0.5);
    await pointer(page, '.movement-zone', 'pointerup', 211, 1.8, 0.5);
    await expect(ui).toHaveAttribute('data-held-direction', '0');
    await expect(ui).toHaveAttribute('data-paused', 'false');
  }
  await pointer(page, '.jump-button', 'pointerdown', 212, 0.5, 0.5);
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  await pointer(page, '.jump-button', 'pointerup', 212, 0.5, 0.5);
  await page.locator('.jump-button').dispatchEvent('click');
  await expect(ui).toHaveAttribute('data-player-grounded', 'true');
  expect(await ui.getAttribute('data-last-command')).not.toBe('jump');
  await page.getByRole('button', { name: 'Pause Practice' }).tap();
  await expect(ui).toHaveAttribute('data-paused', 'true');
  const tick = await ui.getAttribute('data-simulation-tick');
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  expect(await ui.getAttribute('data-simulation-tick')).toBe(tick);
  await page.getByRole('button', { name: 'Resume Practice' }).tap();
  await expect(ui).toHaveAttribute('data-paused', 'false');
  await expect(ui).toHaveAttribute('data-held-direction', '0');
  expect(errors).toEqual([]);
});

test('V8 r1 interrupted movement cannot reuse old upward input or pause hidden combat', async ({ page }) => {
  const errors = captureErrors(page);
  for (const interruption of ['blur', 'hidden', 'pointercancel', 'lostpointercapture', 'resize', 'rotation', 'wallet']) {
    await page.goto('/?combat-preview=v8-r1&sideways=off');
    const ui = page.locator('.combat-v8-r1'); await expect(ui).toBeVisible();
    await pointer(page, '.movement-zone', 'pointerdown', 311, 0.5, 0.5);
    await pointer(page, '.movement-zone', 'pointermove', 311, 1.8, 0.5);
    await expect(ui).toHaveAttribute('data-held-direction', '1');
    await page.evaluate(kind => {
      if (kind === 'hidden') {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
      } else if (kind === 'pointercancel' || kind === 'lostpointercapture') {
        document.querySelector('.movement-zone')!.dispatchEvent(new PointerEvent(kind, { pointerId: 311, bubbles: true }));
      } else {
        window.dispatchEvent(new Event(kind === 'rotation' ? 'orientationchange' : kind === 'wallet' ? 'nimble-knots:wallet-boundary' : kind));
        window.dispatchEvent(new Event('focus'));
      }
    }, interruption);
    await expect(ui).toHaveAttribute('data-held-direction', '0');
    await expect(page.locator('.movement-zone')).not.toHaveClass(/is-active/);
    if (interruption === 'hidden') {
      const tick = Number(await ui.getAttribute('data-simulation-tick'));
      await expect.poll(async () => Number(await ui.getAttribute('data-simulation-tick'))).toBeGreaterThan(tick + 3);
      await page.evaluate(() => {
        Reflect.deleteProperty(document, 'hidden');
        document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus'));
      });
    }
    await pointer(page, '.movement-zone', 'pointermove', 311, 0.5, -0.5);
    await pointer(page, '.movement-zone', 'pointerup', 311, 0.5, -0.5);
    await expect(ui).toHaveAttribute('data-player-grounded', 'true');
    await expect(ui).toHaveAttribute('data-paused', 'false');
    await expect(ui).not.toHaveAttribute('data-last-command', 'jump');
    await pointer(page, '.movement-zone', 'pointerdown', 312, 0.5, 0.5);
    await pointer(page, '.movement-zone', 'pointermove', 312, 0.5, 0.1);
    await expect(ui).toHaveAttribute('data-player-grounded', 'false');
    await pointer(page, '.movement-zone', 'pointerup', 312, 0.5, 0.1);
  }
  expect(errors).toEqual([]);
});

test('constrained Chromium loading reaches actionable wallet-free Practice', async ({ page, context }, testInfo) => {
  test.setTimeout(60_000);
  test.skip(testInfo.project.name !== 'chromium-390x844', 'Chromium CDP provides the supported deterministic network control.');
  const errors = captureErrors(page);
  await page.addInitScript(() => {
    const runtime = window as typeof window & { __walletCalls?: number; nimiq?: unknown };
    runtime.__walletCalls = 0;
    runtime.nimiq = {
      listAccounts: async () => {
        runtime.__walletCalls! += 1;
        throw new Error('Wallet must remain lazy during Practice.');
      }
    };
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: 256 * 1024,
    uploadThroughput: 128 * 1024,
    connectionType: 'cellular3g'
  });
  try {
    await page.goto('/?sideways=off', { timeout: 45_000 });
    await expect(page.getByRole('heading', { name: 'Practice Clash' })).toBeVisible();
    await page.getByRole('button', { name: 'Start Practice' }).tap();
    await expect(page.locator('.combat-ui')).toBeVisible({ timeout: 20_000 });
  } finally {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1
    }).catch(() => undefined);
    await cdp.detach().catch(() => undefined);
  }
  expect(await page.evaluate(() => (
    window as typeof window & { __walletCalls?: number }
  ).__walletCalls)).toBe(0);
  expect(errors).toEqual([]);
});

test('Chromium and WebKit offline lifecycle resumes the same authority', async ({ page, context }, testInfo) => {
  test.setTimeout(90_000);
  test.skip(!CANONICAL_PROJECTS.has(testInfo.project.name), 'The canonical Chromium and WebKit projects own offline/resume coverage.');
  const errors = captureErrors(page);
  await openPractice(page);
  const ui = page.locator('.combat-ui');
  const movement = page.locator('.movement-zone');
  const challengeId = await ui.getAttribute('data-challenge-id');
  const startX = Number(await ui.getAttribute('data-player-x'));

  await pointer(page, '.movement-zone', 'pointerdown', 71, 0.5, 0.55);
  await pointer(page, '.movement-zone', 'pointermove', 71, 0.82, 0.55);
  await expect(movement).toHaveClass(/is-active/);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete (document as Document & { hidden?: boolean }).hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(movement).not.toHaveClass(/is-active/);

  await pointer(page, '.movement-zone', 'pointerdown', 72, 0.5, 0.55);
  await pointer(page, '.movement-zone', 'pointermove', 72, 0.82, 0.55);
  await expect(movement).toHaveClass(/is-active/);
  await context.setOffline(true);
  await expect(ui).toHaveAttribute('data-suspended', 'true', { timeout: 10_000 });
  await expect(movement).not.toHaveClass(/is-active/);
  await expect(movement).toHaveAttribute('aria-disabled', 'true');

  await context.setOffline(false);
  await expect(ui).toHaveAttribute('data-suspended', 'false', { timeout: 15_000 });
  await expect(ui).toHaveAttribute('data-challenge-id', challengeId!);
  const originalViewport = page.viewportSize()!;
  await page.setViewportSize({ width: 412, height: 915 });
  await expect(ui).toHaveAttribute('data-challenge-id', challengeId!);
  await page.setViewportSize(originalViewport);

  await pointer(page, '.movement-zone', 'pointerup', 72, 0.82, 0.55);
  await page.waitForTimeout(250);
  await expect(ui).toHaveAttribute('data-player-x', String(startX));
  await dragPad(page, '.movement-zone', 73, 0.36, 0);
  await expect.poll(async () => Number(await ui.getAttribute('data-player-x'))).not.toBe(startX);
  expect(errors).toEqual([]);
});

test('delayed synthetic wallet settlement authorizes once and keeps Practice usable', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  test.skip(testInfo.project.name !== 'chromium-390x844', 'One canonical Chromium project covers delayed synthetic wallet settlement.');
  const errors = captureErrors(page);
  const signer = createTestSigner();
  try {
    await page.exposeFunction('testNimiqSign', (message: string) => signer.sign(message));
    await page.addInitScript(({ address }) => {
      const runtime = window as typeof window & {
        __walletCalls?: { accounts: number; signs: number };
        testNimiqSign?: (message: string) => Promise<{ publicKey: string; signature: string }>;
        nimiq?: unknown;
        nimiqPay?: unknown;
      };
      const delay = (milliseconds: number) => new Promise<void>((resolve) => {
        window.setTimeout(resolve, milliseconds);
      });
      runtime.__walletCalls = { accounts: 0, signs: 0 };
      runtime.nimiq = {
        listAccounts: async () => {
          runtime.__walletCalls!.accounts += 1;
          await delay(650);
          return [address];
        },
        sign: async (message: string) => {
          runtime.__walletCalls!.signs += 1;
          await delay(650);
          return runtime.testNimiqSign!(message);
        }
      };
      runtime.nimiqPay = { language: 'en' };
    }, { address: signer.address });
    await page.goto('/?identity-preview=1&sideways=off');
    const start = page.getByRole('button', { name: 'Start Practice' });
    const originalToken = await sessionToken(page);

    await page.getByRole('button', { name: 'Choose Nimiq account' }).tap();
    await expect(start).toBeDisabled();
    const account = page.getByRole('button', { name: signer.address });
    await expect(account).toBeVisible();
    await account.tap();
    await expect(start).toBeDisabled();
    await expect(page.locator('.identity-acceptance')).toHaveAttribute('data-authorized', 'true');
    await expect(start).toBeEnabled();
    expect(await sessionToken(page)).not.toBe(originalToken);
    expect(await page.evaluate(() => (
      window as typeof window & { __walletCalls?: { accounts: number; signs: number } }
    ).__walletCalls)).toEqual({ accounts: 1, signs: 1 });

    await start.tap();
    await expect(page.locator('.combat-ui')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    signer.dispose();
  }
});

test('lost session authority offers one truthful fresh Practice path', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  test.skip(!CANONICAL_PROJECTS.has(testInfo.project.name), 'The canonical Chromium and WebKit projects cover session-loss recovery.');
  const errors = captureErrors(page);
  await openPractice(page);
  const ui = page.locator('.combat-ui');
  const oldChallengeId = await ui.getAttribute('data-challenge-id');
  const oldToken = await sessionToken(page);
  await page.evaluate(() => {
    sessionStorage.setItem('nimble-knots.session-token', 'z'.repeat(43));
  });
  await page.reload();

  const fresh = page.getByRole('button', { name: 'Start Fresh Practice' });
  await expect(fresh).toBeVisible();
  await expect(page.getByText(/previous in-memory Practice Clash cannot be resumed/i)).toBeVisible();
  const storage = await page.evaluate(() => ({
    token: sessionStorage.getItem('nimble-knots.session-token'),
    active: sessionStorage.getItem('nimble-knots.active-practice')
  }));
  expect(storage.token).not.toBe(oldToken);
  expect(storage.token).not.toBe('z'.repeat(43));
  expect(storage.active).toBeNull();

  await fresh.tap();
  await expect(ui).toBeVisible();
  await expect.poll(() => ui.getAttribute('data-challenge-id')).not.toBe(oldChallengeId);
  await expect(page.locator('.result-shell')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('two browser contexts isolate storage, identity, challenge events, controls, and reconnects', async ({ browser, page, context }, testInfo) => {
  test.setTimeout(120_000);
  test.skip(!CANONICAL_PROJECTS.has(testInfo.project.name), 'The canonical Chromium and WebKit projects cover two-context isolation.');
  const signer = createTestSigner();
  const secondContext = await browser.newContext(phoneContext(testInfo));
  const secondPage = await secondContext.newPage();
  const firstErrors = captureErrors(page);
  const secondErrors = captureErrors(secondPage);
  try {
    await page.exposeFunction('testNimiqSign', (message: string) => signer.sign(message));
    await page.addInitScript(({ address }) => {
      const runtime = window as typeof window & {
        testNimiqSign?: (message: string) => Promise<{ publicKey: string; signature: string }>;
        nimiq?: unknown;
        nimiqPay?: unknown;
      };
      runtime.nimiq = {
        listAccounts: async () => [address],
        sign: async (message: string) => runtime.testNimiqSign!(message)
      };
      runtime.nimiqPay = { language: 'en' };
    }, { address: signer.address });
    await Promise.all([
      page.goto('/?identity-preview=1&sideways=off'),
      secondPage.goto('/?identity-preview=1&sideways=off')
    ]);
    await Promise.all([
      expect(page.getByRole('heading', { name: 'Practice Clash' })).toBeVisible(),
      expect(secondPage.getByRole('heading', { name: 'Practice Clash' })).toBeVisible()
    ]);

    await page.getByRole('button', { name: 'Choose Nimiq account' }).tap();
    await page.getByRole('button', { name: signer.address }).tap();
    await expect(page.locator('.identity-acceptance')).toHaveAttribute('data-authorized', 'true');
    await expect(secondPage.locator('.identity-acceptance')).not.toHaveAttribute('data-authorized', 'true');

    await page.getByRole('button', { name: /Thief/ }).tap();
    await secondPage.getByRole('button', { name: /Warrior/ }).tap();
    await Promise.all([
      page.getByRole('button', { name: 'Start Practice' }).tap(),
      secondPage.getByRole('button', { name: 'Start Practice' }).tap()
    ]);
    const firstUi = page.locator('.combat-ui');
    const secondUi = secondPage.locator('.combat-ui');
    await Promise.all([expect(firstUi).toBeVisible(), expect(secondUi).toBeVisible()]);
    const firstChallenge = await firstUi.getAttribute('data-challenge-id');
    const secondChallenge = await secondUi.getAttribute('data-challenge-id');
    expect(firstChallenge).not.toBe(secondChallenge);

    const isolation = await Promise.all([page, secondPage].map(async (currentPage) => ({
      token: await sessionToken(currentPage),
      active: await currentPage.evaluate(() => JSON.parse(
        sessionStorage.getItem('nimble-knots.active-practice') || 'null'
      ))
    })));
    expect(isolation[0].token).not.toBe(isolation[1].token);
    expect(isolation[0].active.sessionId).not.toBe(isolation[1].active.sessionId);
    expect(isolation[0].active.challengeId).toBe(firstChallenge);
    expect(isolation[1].active.challengeId).toBe(secondChallenge);

    const firstStartX = Number(await firstUi.getAttribute('data-player-x'));
    const secondStartX = Number(await secondUi.getAttribute('data-player-x'));
    await dragPad(page, '.movement-zone', 81, 0.36, 0);
    await expect.poll(async () => Number(await firstUi.getAttribute('data-player-x'))).not.toBe(firstStartX);
    await expect(secondUi).toHaveAttribute('data-player-x', String(secondStartX));
    await expect(secondUi).toHaveAttribute('data-challenge-id', secondChallenge!);

    await context.setOffline(true);
    await expect(firstUi).toHaveAttribute('data-suspended', 'true', { timeout: 10_000 });
    await expect(secondUi).toHaveAttribute('data-suspended', 'false');
    await expect(secondPage.locator('.movement-zone')).toHaveAttribute('aria-disabled', 'false');
    await context.setOffline(false);
    await expect(firstUi).toHaveAttribute('data-suspended', 'false', { timeout: 15_000 });
    await expect(firstUi).toHaveAttribute('data-challenge-id', firstChallenge!);

    await page.close();
    await dragPad(secondPage, '.movement-zone', 82, 0.36, 0);
    await expect.poll(async () => Number(await secondUi.getAttribute('data-player-x'))).not.toBe(secondStartX);
    await expect(secondUi).toHaveAttribute('data-challenge-id', secondChallenge!);
    expect(unexpectedOfflineLifecycleErrors(firstErrors)).toEqual([]);
    expect(secondErrors).toEqual([]);
  } finally {
    await context.setOffline(false).catch(() => undefined);
    await secondContext.close();
    signer.dispose();
  }
});

async function openPractice(page: Page): Promise<void> {
  await page.goto('/?sideways=off');
  await expect(page.getByRole('heading', { name: 'Practice Clash' })).toBeVisible({
    timeout: 10_000
  });
  await page.getByRole('button', { name: 'Start Practice' }).tap();
  await expect(page.locator('.combat-ui')).toBeVisible();
}

function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

function unexpectedOfflineLifecycleErrors(errors: string[]): string[] {
  const intentionalOfflineWebSocketFailure =
    /^WebSocket connection to 'ws:\/\/127\.0\.0\.1:\d+\/socket\.io\/\?[^']*transport=websocket[^']*' failed: Error in connection establishment: net::ERR_INTERNET_DISCONNECTED$/;
  return errors.filter((message) => !intentionalOfflineWebSocketFailure.test(message));
}

function phoneContext(testInfo: TestInfo): BrowserContextOptions {
  const baseURL = testInfo.project.use.baseURL ||
    `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT}`;
  return {
    baseURL,
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    locale: 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'reduce',
    colorScheme: 'light'
  };
}

async function sessionToken(page: Page): Promise<string | null> {
  return page.evaluate(() => sessionStorage.getItem('nimble-knots.session-token'));
}

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
