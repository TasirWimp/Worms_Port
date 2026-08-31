import { expect, test, type Browser, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const {
  BUDGETS,
  summarizePerformanceSamples
} = require('../../scripts/performance-budget');

type TimingSample = {
  navigationToActionablePractice: number;
  startPracticeToLegalInput: number;
  fireToCastStart: number;
  fireToVisibleProjectile: number;
  fireToCompleteResponse: number;
};

const outputPath = path.resolve('test-results', 'wp014-performance.json');

test('ordinary Practice meets the pinned Chromium timing and lazy SDK budgets', async ({
  browser
}, testInfo) => {
  // Six fresh full-motion contexts can exceed two minutes on Ubuntu software
  // rendering. The timing budgets below remain unchanged; this outer allowance
  // exists only so every sample can return a precise budget verdict.
  test.setTimeout(180_000);
  expect(testInfo.project.name).toBe('chromium-390x844');

  const lazyMiniAppSdkPath = findLazyMiniAppSdkPath();
  const samples: TimingSample[] = [];
  let warmup: TimingSample | null = null;
  let lazyMiniAppSdkRequests = 0;
  let pageErrors = 0;
  let consoleErrors = 0;
  let report: ReturnType<typeof summarizePerformanceSamples> | null = null;

  try {
    for (let run = 0; run < BUDGETS.warmupRuns + BUDGETS.measuredRuns; run += 1) {
      const result = await samplePractice(browser, lazyMiniAppSdkPath);
      lazyMiniAppSdkRequests += result.lazyMiniAppSdkRequests;
      pageErrors += result.pageErrors;
      consoleErrors += result.consoleErrors;
      if (run < BUDGETS.warmupRuns) warmup = result.timing;
      else samples.push(result.timing);
    }
    report = summarizePerformanceSamples(warmup, samples, lazyMiniAppSdkRequests, {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      browser: `chromium ${browser.version()}`,
      project: testInfo.project.name,
      viewport: '390x844',
      workerCount: 1,
      route: '/',
      reducedMotion: 'no-preference',
      deterministicSeed: 1,
      pageErrors,
      consoleErrors
    });
    if (pageErrors !== 0) report.violations.push(`Practice emitted ${pageErrors} page error(s).`);
    if (consoleErrors !== 0) report.violations.push(`Practice emitted ${consoleErrors} console error(s).`);
    report.passed = report.violations.length === 0;
    expect(report.violations).toEqual([]);
  } finally {
    const evidence = report || {
      schemaVersion: 1,
      environment: {
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
        browser: `chromium ${browser.version()}`,
        project: testInfo.project.name,
        viewport: '390x844',
        workerCount: 1,
        route: '/',
        reducedMotion: 'no-preference',
        deterministicSeed: 1,
        pageErrors,
        consoleErrors
      },
      budgets: BUDGETS,
      warmup,
      measurements: {},
      lazyMiniAppSdkRequests,
      passed: false,
      violations: ['Performance sampling did not complete.'],
      partialSamples: samples
    };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  }
});

async function samplePractice(browser: Browser, lazyMiniAppSdkPath: string): Promise<{
  timing: TimingSample;
  lazyMiniAppSdkRequests: number;
  pageErrors: number;
  consoleErrors: number;
}> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    locale: 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'no-preference',
    colorScheme: 'light'
  });
  await context.addInitScript(installTimingRecorder);
  const page = await context.newPage();
  let lazyMiniAppSdkRequests = 0;
  let pageErrors = 0;
  let consoleErrors = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === lazyMiniAppSdkPath) lazyMiniAppSdkRequests += 1;
  });
  page.on('pageerror', () => { pageErrors += 1; });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors += 1;
  });

  try {
    await page.goto('/');
    await page.waitForFunction(() => (
      window as typeof window & { __wp014Timing: { actionableAt: number | null } }
    ).__wp014Timing.actionableAt !== null, undefined, {
      timeout: 10_000
    });
    await page.getByRole('button', { name: 'Start Practice' }).tap();
    await page.waitForFunction(() => (
      window as typeof window & { __wp014Timing: { legalInputAt: number | null } }
    ).__wp014Timing.legalInputAt !== null, undefined, {
      timeout: 10_000
    });
    await dragPad(page, '.aim-zone', 900, 0.34, 0.3);
    await expect(page.locator('.fire-button')).toBeEnabled({ timeout: 5_000 });
    await page.locator('.fire-button').tap();
    await page.waitForFunction(() => (
      window as typeof window & { __wp014Timing: { castAt: number | null } }
    ).__wp014Timing.castAt !== null, undefined, {
      timeout: 5_000
    });
    await page.waitForFunction(() => (
      window as typeof window & { __wp014Timing: { projectileAt: number | null } }
    ).__wp014Timing.projectileAt !== null, undefined, {
      timeout: 5_000
    });
    await page.waitForFunction(() => (
      window as typeof window & { __wp014Timing: { responseAt: number | null } }
    ).__wp014Timing.responseAt !== null, undefined, {
      timeout: 15_000
    });
    const state = await page.evaluate(() => (
      window as typeof window & {
        __wp014Timing: {
          actionableAt: number | null;
          startTapAt: number | null;
          legalInputAt: number | null;
          fireTapAt: number | null;
          castAt: number | null;
          projectileAt: number | null;
          responseAt: number | null;
        }
      }
    ).__wp014Timing);
    return {
      timing: {
        navigationToActionablePractice: round(state.actionableAt!),
        startPracticeToLegalInput: round(state.legalInputAt! - state.startTapAt!),
        fireToCastStart: round(state.castAt! - state.fireTapAt!),
        fireToVisibleProjectile: round(state.projectileAt! - state.fireTapAt!),
        fireToCompleteResponse: round(state.responseAt! - state.fireTapAt!)
      },
      lazyMiniAppSdkRequests,
      pageErrors,
      consoleErrors
    };
  } finally {
    await context.close();
  }
}

function installTimingRecorder(): void {
  const state = {
    actionableAt: null as number | null,
    startTapAt: null as number | null,
    legalInputAt: null as number | null,
    fireTapAt: null as number | null,
    castAt: null as number | null,
    projectileAt: null as number | null,
    responseAt: null as number | null,
    sawLoomkeeperImpact: false
  };
  Object.defineProperty(window, '__wp014Timing', { value: state });
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.practice-start') && state.startTapAt === null) {
      state.startTapAt = performance.now();
    }
    if (target?.closest('.fire-button') && state.fireTapAt === null) {
      state.fireTapAt = performance.now();
    }
  }, true);
  const observe = () => {
    const start = document.querySelector<HTMLButtonElement>('.practice-start');
    if (state.actionableAt === null && start && !start.disabled &&
        start.getBoundingClientRect().width > 0 && start.getBoundingClientRect().height > 0) {
      state.actionableAt = performance.now();
    }
    const combat = document.querySelector<HTMLElement>('.combat-ui');
    const movement = document.querySelector<HTMLElement>('.movement-zone');
    if (state.startTapAt !== null && state.legalInputAt === null && combat && movement &&
        combat.dataset.presenting === 'false' && combat.dataset.activeActor === 'player' &&
        movement.getAttribute('aria-disabled') !== 'true') {
      state.legalInputAt = performance.now();
    }
    if (state.fireTapAt !== null) {
      // A deterministic exchange can end the Clash. The terminal result is as
      // complete a response as a returned player turn, and is reached only
      // after the same authoritative presentation finishes.
      if (document.querySelector('.result-shell') && state.responseAt === null) {
        state.responseAt = performance.now();
        return;
      }
      if (!combat) return;
      if (combat.dataset.presentation === 'player-cast-charge' && state.castAt === null) {
        state.castAt = performance.now();
      }
      if (combat.dataset.presentation === 'player-projectile' &&
          Number(combat.dataset.projectilePoints || 0) > 1 && state.projectileAt === null) {
        state.projectileAt = performance.now();
      }
      if (combat.dataset.presentation === 'loomkeeper-impact') state.sawLoomkeeperImpact = true;
      if (state.sawLoomkeeperImpact && state.responseAt === null &&
          combat.dataset.presenting === 'false' && combat.dataset.activeActor === 'player') {
        state.responseAt = performance.now();
      }
    }
    requestAnimationFrame(observe);
  };
  requestAnimationFrame(observe);
}

async function dragPad(
  page: Page,
  selector: string,
  pointerId: number,
  dx: number,
  dy: number
): Promise<void> {
  for (const [type, xRatio, yRatio] of [
    ['pointerdown', 0.5, 0.55],
    ['pointermove', 0.5 + dx, 0.55 + dy],
    ['pointerup', 0.5 + dx, 0.55 + dy]
  ] as const) {
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
}

function findLazyMiniAppSdkPath(): string {
  const build = path.resolve('client', 'build');
  const manifest = JSON.parse(fs.readFileSync(path.join(build, '.vite', 'manifest.json'), 'utf8'));
  const candidates = Object.values(manifest) as Array<{ file?: string; isDynamicEntry?: boolean }>;
  const matches = candidates.filter((chunk) => chunk.isDynamicEntry && chunk.file &&
    fs.readFileSync(path.join(build, chunk.file), 'utf8').includes('Nimiq provider was not injected'));
  if (matches.length !== 1) throw new Error(`Expected one lazy Mini App SDK chunk, found ${matches.length}.`);
  return `/${matches[0].file!.replaceAll('\\', '/')}`;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
