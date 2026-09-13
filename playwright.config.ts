import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT || 4173);
const baseURL = `http://127.0.0.1:${port}`;
const qualityGate = process.env.PLAYWRIGHT_QUALITY_GATE === 'true';
const performanceGate = process.env.PLAYWRIGHT_PERFORMANCE_GATE === 'true';
const legacyBrowserTests = process.env.PLAYWRIGHT_LEGACY_TESTS === 'true';
if (legacyBrowserTests && (qualityGate || performanceGate)) {
  throw new Error('Legacy browser diagnostics cannot run as a release or performance gate.');
}

const phoneUse = (width: number, height: number) => ({
  viewport: { width, height },
  screen: { width, height },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
  locale: 'en-US',
  timezoneId: 'UTC',
  reducedMotion: 'reduce' as const,
  colorScheme: 'light' as const
});

export default defineConfig({
  testDir: './tests/browser',
  testMatch: performanceGate ? 'performance.spec.ts' : undefined,
  testIgnore: performanceGate ? undefined : 'performance.spec.ts',
  grepInvert: legacyBrowserTests ? undefined : /@legacy/,
  outputDir: './test-results',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI) || qualityGate,
  retries: 0,
  workers: 1,
  reporter: [
    ['line'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['./scripts/playwright-quality-reporter.js']
  ],
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.005,
      scale: 'css',
      threshold: 0.2
    }
  },
  use: {
    baseURL,
    // The performance project measures full-motion wall-clock behavior. Do not
    // charge Ubuntu software rendering for trace, screenshot, or video capture;
    // its sanitized timing JSON remains the authoritative failure artifact.
    trace: performanceGate ? 'off' : 'retain-on-failure',
    screenshot: performanceGate ? 'off' : 'only-on-failure',
    video: performanceGate ? 'off' : 'retain-on-failure'
  },
  projects: (performanceGate ? [
    {
      name: 'chromium-390x844',
      use: { ...phoneUse(390, 844), browserName: 'chromium' }
    }
  ] : [
    {
      name: 'chromium-360x640',
      use: { ...phoneUse(360, 640), browserName: 'chromium' }
    },
    {
      name: 'chromium-390x844',
      use: { ...phoneUse(390, 844), browserName: 'chromium' }
    },
    {
      name: 'chromium-412x915',
      use: { ...phoneUse(412, 915), browserName: 'chromium' }
    },
    {
      name: 'chromium-844x390',
      use: { ...phoneUse(844, 390), browserName: 'chromium' }
    },
    {
      name: 'webkit-390x844',
      use: { ...phoneUse(390, 844), browserName: 'webkit' }
    }
  ]),
  webServer: {
    command: 'node scripts/build-and-start-test-server.js',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      SESSION_OPEN_RATE_CAPACITY: '100',
      PRACTICE_TEST_VERSION: 'v10',
      PRACTICE_TEST_SEEDS: '1,3735928559',
      IDENTITY_PUBLIC_ORIGIN: baseURL,
      NIMIQ_NETWORK: 'main-albatross'
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000
  }
});
