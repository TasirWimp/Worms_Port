import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT || 4173);
const baseURL = `http://127.0.0.1:${port}`;

const phoneUse = {
  viewport: { width: 390, height: 844 },
  screen: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
  locale: 'en-US',
  timezoneId: 'UTC',
  reducedMotion: 'reduce' as const,
  colorScheme: 'light' as const
};

export default defineConfig({
  testDir: './tests/browser',
  outputDir: './test-results',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
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
      name: 'chromium-phone',
      use: { ...phoneUse, browserName: 'chromium' }
    },
    {
      name: 'webkit-phone',
      use: { ...phoneUse, browserName: 'webkit' }
    }
  ],
  webServer: {
    command: 'node scripts/build-and-start-test-server.js',
    env: { ...process.env, PORT: String(port) },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000
  }
});
