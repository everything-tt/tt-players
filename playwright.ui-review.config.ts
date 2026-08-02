/**
 * UI PR PLAYWRIGHT CONFIG — REQUIRED AGENT WORKFLOW
 *
 * Why this config runs only one PR-specific scenario:
 *
 * - The screenshot job runs against a newly deployed preview, so installing the
 *   browser, preparing the runner, deploying the app, and publishing the report
 *   already have a fixed cost.
 * - Running every historical UI-review spec on every PR adds unrelated routes,
 *   slower feedback, more live-API timing failures, and screenshots that do not
 *   help reviewers judge the change in the current PR.
 * - A focused scenario can exercise the exact user flow, wait for meaningful UI
 *   and network states, assert the changed behaviour, and capture only the views
 *   a reviewer needs. This makes failures earlier and easier to diagnose.
 * - Historical scenario files are still useful as examples and for deliberate
 *   regression runs, so they remain in the repository but are not selected here.
 *
 * Required steps whenever an agent creates or substantially updates a UI PR:
 *
 * 1. Create one focused `*.pw.ts` scenario under
 *    `apps/mobile/tests/ui-review/` for that PR.
 * 2. Exercise all materially changed UI flows in that scenario. Wait for the
 *    relevant API response or stable rendered state; do not rely on fixed sleeps
 *    as the main readiness signal.
 * 3. Assert the important behaviour and responsive layout before taking each
 *    screenshot. The test is a functional review flow, not just a page capture.
 * 4. Capture only screenshots relevant to the PR and add them to the existing
 *    UI-review manifest/report.
 * 5. Replace `testMatch` below with the new scenario filename. Remove the
 *    previous PR's filename from this config so CI runs only the current PR test.
 * 6. Do NOT delete the previous scenario file merely because it is removed from
 *    `testMatch`; keep it for reference and optional manual regression testing.
 * 7. Never change `testMatch` back to a wildcard such as `**\/*.pw.ts` for the
 *    pull-request pipeline. A broad/full-app audit must be invoked separately.
 *
 * The GitHub Actions screenshot job uses this config directly, so `testMatch` is
 * the single explicit selector for the scenario that will gate and document the
 * current UI PR.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './apps/mobile/tests/ui-review',

  // Player match row action PR only. Replace this filename for the next UI PR.
  testMatch: 'zz-player-match-row-actions.pw.ts',

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
