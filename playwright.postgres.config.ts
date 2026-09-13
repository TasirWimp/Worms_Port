import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT || 4174);
const baseURL = `http://127.0.0.1:${port}`;
const includeLegacy = process.env.PLAYWRIGHT_LEGACY_TESTS === 'true';

export default defineConfig({
  testDir: './tests/browser-postgres',
  outputDir: './test-results',
  fullyParallel: false,
  forbidOnly: true,
  grepInvert: includeLegacy ? undefined : /@legacy/,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  reporter: [
    ['line'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  use: {
    baseURL,
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    locale: 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'reduce',
    colorScheme: 'light',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [{ name: 'chromium-postgres-390x844', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'node scripts/build-and-start-test-server.js',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      SESSION_OPEN_RATE_CAPACITY: '100',
      PRACTICE_TEST_SEEDS: '1,3735928559',
      IDENTITY_PUBLIC_ORIGIN: baseURL,
      NIMIQ_NETWORK: 'main-albatross'
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000
  }
});
