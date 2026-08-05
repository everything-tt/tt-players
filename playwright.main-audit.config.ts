import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './apps/mobile/tests/main-audit',
  testMatch: 'screenshot-audit.pw.ts',
  outputDir: 'test-results/main-audit',
  timeout: 900_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'ui-review-report/playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: process.env.PREVIEW_URL,
    headless: true,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    colorScheme: 'light',
    video: 'off',
    trace: 'off',
    screenshot: 'off',
    navigationTimeout: 45_000,
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: 'mobile-390',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'desktop-1440',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
});
