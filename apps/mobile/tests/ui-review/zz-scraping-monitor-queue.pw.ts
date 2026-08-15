import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface ScreenshotEntry {
  project: string;
  title: string;
  url: string;
  path: string;
  diagnosticsPath: string;
}

const reportDir = process.env.UI_REVIEW_REPORT_DIR ?? 'ui-review-report';
const screenshotsDir = join(reportDir, 'screenshots');
const diagnosticsDir = join(reportDir, 'diagnostics');
const manifestPath = join(reportDir, 'manifest.json');

const MONITOR_RESPONSE = {
  generated_at: '2026-08-15T10:00:00.000Z',
  window_hours: 168,
  state: 'idle',
  queue: {
    available: true,
    total: 6,
    running: 0,
    ready: 0,
    scheduled: 0,
    failed: 6,
    active_failed: 0,
    historical_failed: 6,
    oldest_pending_at: null,
  },
  scrapes: {
    total: 4758,
    pending: 0,
    processed: 4758,
    failed: 0,
    transform_progress_pct: 100,
    transform_success_pct: 100,
    latest_scrape_at: '2026-08-15T02:41:16.288Z',
  },
  pipeline_history: {
    available: true,
    retention_days: 14,
    total: 2,
    runs: [
      {
        run_key: '2026-08-15',
        status: 'completed',
        current_stage: 'read-models',
        window_start: '2026-08-15T00:00:00.000Z',
        started_at: '2026-08-15T03:45:00.081Z',
        finished_at: '2026-08-15T03:46:51.600Z',
        duration_ms: 111518,
        attempt_count: 4,
        error_message: null,
        stages: [],
      },
      {
        run_key: '2026-08-12',
        status: 'failed',
        current_stage: 'reconcile',
        window_start: '2026-08-12T00:00:00.000Z',
        started_at: '2026-08-12T03:45:00.000Z',
        finished_at: '2026-08-13T09:32:35.000Z',
        duration_ms: 107255878,
        attempt_count: 4,
        error_message: 'Recovered stale running pipeline audit after worker termination or lost execution',
        stages: [],
      },
    ],
  },
  active_resource_failures: 0,
  tasks: [
    {
      task_identifier: 'scrapeUrlTask',
      total: 4,
      running: 0,
      ready: 0,
      scheduled: 0,
      failed: 4,
      active_failed: 0,
      historical_failed: 4,
      oldest_created_at: '2026-08-13T02:20:02.998Z',
      latest_updated_at: '2026-08-13T02:39:22.132Z',
      latest_error: 'HTTP 503 Service Temporarily Unavailable',
    },
    {
      task_identifier: 'completeDailyPipelineTask',
      total: 2,
      running: 0,
      ready: 0,
      scheduled: 0,
      failed: 2,
      active_failed: 0,
      historical_failed: 2,
      oldest_created_at: '2026-08-11T03:45:00.083Z',
      latest_updated_at: '2026-08-12T03:45:00.102Z',
      latest_error: 'canceling statement due to statement timeout',
    },
  ],
  recent_jobs: [
    {
      id: '268681',
      task_identifier: 'scrapeUrlTask',
      state: 'failed',
      attempts: 1,
      max_attempts: 1,
      created_at: '2026-08-13T02:39:22.132Z',
      updated_at: '2026-08-13T02:39:22.132Z',
      run_at: '2026-08-13T07:23:23.437Z',
      locked_at: null,
      last_error: 'HTTP 503 Service Temporarily Unavailable',
    },
  ],
  recent_scrapes: [],
  resource_failures: [],
};

function requirePreviewUrl(): string {
  const previewUrl = process.env.PREVIEW_URL;
  if (!previewUrl) throw new Error('PREVIEW_URL is required');
  return previewUrl.replace(/\/$/, '');
}

function readManifest(): ScreenshotEntry[] {
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
    return Array.isArray(parsed) ? parsed as ScreenshotEntry[] : [];
  } catch {
    return [];
  }
}

function appendManifest(entry: ScreenshotEntry) {
  const entries = readManifest().filter((item) => item.path !== entry.path);
  entries.push(entry);
  writeFileSync(manifestPath, `${JSON.stringify(entries, null, 2)}\n`);
}

async function capture(page: Page, testInfo: TestInfo, title: string) {
  await page.addStyleTag({
    content: '* { transition: none !important; animation: none !important; caret-color: transparent !important; }',
  });
  await page.evaluate(() => document.fonts.ready);
  const screenshotPath = `screenshots/${testInfo.project.name}-${title}.png`;
  const diagnosticsPath = `diagnostics/${testInfo.project.name}-${title}.json`;
  await page.screenshot({ path: join(reportDir, screenshotPath), fullPage: false, timeout: 15_000 });
  writeFileSync(join(reportDir, diagnosticsPath), `${JSON.stringify({ route: page.url(), viewport: page.viewportSize() }, null, 2)}\n`);
  appendManifest({ project: testInfo.project.name, title, url: page.url(), path: screenshotPath, diagnosticsPath });
}

function writeReportIndex(previewUrl: string) {
  const cards = readManifest().map((entry) => `<article><h2>${entry.title}</h2><img src="${entry.path}" alt="${entry.title}" /><p>${entry.url}</p></article>`).join('');
  writeFileSync(join(reportDir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><title>TT Players UI Review</title></head><body><main><h1>Scraping monitor queue review</h1><p>${previewUrl}</p>${cards}</main></body></html>\n`);
}

test.beforeAll(() => {
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(diagnosticsDir, { recursive: true });
});

test('distinguishes historical exhausted jobs from active queue failures', async ({ page }, testInfo) => {
  const previewUrl = requirePreviewUrl();

  await page.route('**/api/scraping/monitor*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MONITOR_RESPONSE),
    });
  });

  await page.addInitScript(() => {
    localStorage.setItem('tt_players_league_onboarding_complete', 'true');
    localStorage.setItem('tt_players_selected_league_ids', JSON.stringify([]));
    localStorage.setItem('TTPlayers-Theme', 'light-mode');
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  });

  await page.goto(`${previewUrl}/scraping-monitor`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Scraping Monitor' })).toBeVisible();
  await expect(page.getByText('Up to date')).toBeVisible();
  await expect(page.getByText('6 historical failed', { exact: true })).toBeVisible();
  await expect(page.getByText(/4 historical failed/).first()).toBeVisible();
  await expect(page.getByText(/2 historical failed/).first()).toBeVisible();
  await expect(page.getByText('Fetch source URL', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Complete daily pipeline', { exact: true }).first()).toBeVisible();

  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(overflow.document, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport + 1);
  expect(overflow.body, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport + 1);

  await capture(page, testInfo, 'historical-queue-failures');
  writeReportIndex(previewUrl);
});
