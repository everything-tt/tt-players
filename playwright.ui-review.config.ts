import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './apps/mobile/tests/ui-review',
  testMatch: '**/*.pw.ts',
  timeout: 120_000,
  expect: {
    timeout: 10_000,
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
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    navigationTimeout: 25_000,
    actionTimeout: 10_000,
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
