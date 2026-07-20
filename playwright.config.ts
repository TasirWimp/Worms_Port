import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT || 4173);
const baseURL = `http://127.0.0.1:${port}`;

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
  outputDir: './test-results',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['line'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium-360x640',
      use: { ...phoneUse(360, 640), browserName: 'chromium' }
    },
    {
      name: 'chromium-390x844',
      use: { ...phoneUse(390, 844), browserName: 'chromium' }
    },
    {
      name: 'chromium-844x390',
      use: { ...phoneUse(844, 390), browserName: 'chromium' }
    },
    {
      name: 'webkit-390x844',
      use: { ...phoneUse(390, 844), browserName: 'webkit' }
    }
  ],
  webServer: {
    command: 'node scripts/build-and-start-test-server.js',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      SESSION_OPEN_RATE_CAPACITY: '100',
      PRACTICE_TEST_SEEDS: '1,3735928559'
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000
  }
});
