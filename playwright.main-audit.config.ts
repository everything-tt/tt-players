import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './apps/mobile/tests/main-audit',
  testMatch: 'main-audit.pw.ts',
  outputDir: 'test-results/main-audit',
  timeout: 180_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 1,
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
    screenshot: 'only-on-failure',
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
