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

const SOURCE_QUALITY_SNAPSHOT = {
  generated_at: '2026-08-08T08:00:00.000Z',
  summary: {
    providers: 2,
    healthy: 1,
    degraded: 1,
    unobserved: 0,
    leagues: 12,
    competitions: 30,
    canonical_players: 1200,
    rubbers: 8000,
    dated_rubbers_pct: 98.5,
    full_score_rubbers_pct: 96.4,
    missing_player_rubbers: 12,
    pending_identity_suggestions: 4,
    unhealthy_resources: 1,
  },
  sources: [
    {
      platform_id: '11111111-1111-4111-8111-111111111111',
      name: 'Table Tennis 365',
      base_url: 'https://www.tabletennis365.com',
      health: 'healthy',
      leagues: 8,
      competitions: 20,
      fixtures: 400,
      rubbers: 6000,
      dated_rubbers_pct: 99,
      full_score_rubbers_pct: 97,
      missing_player_rubbers: 4,
      external_players: 1400,
      canonical_players: 1000,
      total_scrapes: 120,
      failed_scrapes: 1,
      source_instances: 8,
      source_resources: 50,
      unhealthy_resources: 0,
      latest_activity_at: '2026-08-08T07:30:00.000Z',
      last_error: null,
    },
    {
      platform_id: '22222222-2222-4222-8222-222222222222',
      name: 'Sport80',
      base_url: 'https://www.sport80.com',
      health: 'degraded',
      leagues: 4,
      competitions: 10,
      fixtures: 120,
      rubbers: 2000,
      dated_rubbers_pct: 97,
      full_score_rubbers_pct: 94,
      missing_player_rubbers: 8,
      external_players: 500,
      canonical_players: 200,
      total_scrapes: 40,
      failed_scrapes: 3,
      source_instances: 2,
      source_resources: 12,
      unhealthy_resources: 1,
      latest_activity_at: '2026-08-08T06:45:00.000Z',
      last_error: 'One source resource is awaiting a successful refresh.',
    },
  ],
};

test.describe.configure({ mode: 'serial' });

function requirePreviewUrl(): string {
  const previewUrl = process.env.PREVIEW_URL;
  if (!previewUrl) throw new Error('PREVIEW_URL is required');
  return previewUrl.replace(/\/$/, '');
}

function readManifest(): ScreenshotEntry[] {
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
    return Array.isArray(parsed) ? (parsed as ScreenshotEntry[]) : [];
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
  writeFileSync(join(reportDir, diagnosticsPath), `${JSON.stringify({ route: page.url(), events: [] }, null, 2)}\n`);
  appendManifest({ project: testInfo.project.name, title, url: page.url(), path: screenshotPath, diagnosticsPath });
}

function writeReportIndex(previewUrl: string) {
  const entries = readManifest();
  const cards = entries.map((entry) => `<article><h2>${entry.title}</h2><img src="${entry.path}" alt="${entry.title}" /><p>${entry.url}</p></article>`).join('');
  writeFileSync(join(reportDir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><title>TT Players UI Review</title></head><body><main><h1>Platform menu cleanup</h1><p>${previewUrl}</p>${cards}</main></body></html>\n`);
}

test.beforeAll(() => {
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(diagnosticsDir, { recursive: true });
});

test('groups snapshot-backed Platform pages and keeps About focused', async ({ page }, testInfo) => {
  const previewUrl = requirePreviewUrl();
  let liveMonitorRequests = 0;

  await page.route('**/sources/quality*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SOURCE_QUALITY_SNAPSHOT),
    });
  });
  await page.route('**/scraping/monitor*', async (route) => {
    liveMonitorRequests += 1;
    await route.abort();
  });

  await page.addInitScript(() => {
    localStorage.setItem('tt_players_league_onboarding_complete', 'true');
    localStorage.setItem('tt_players_selected_league_ids', JSON.stringify([]));
    localStorage.setItem('TTPlayers-Theme', 'light-mode');
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  });

  await page.goto(`${previewUrl}/tabs/home`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Open menu' }).click();

  await expect(page.getByRole('heading', { name: 'Platform' })).toBeVisible();
  const dataUpdatesLink = page.getByRole('link', { name: /Data Updates/i });
  const dataQualityLink = page.getByRole('link', { name: /Data Quality/i });
  const ratingAuditLink = page.getByRole('link', { name: /Rating Audit/i });
  await expect(dataUpdatesLink).toHaveAttribute('href', '/platform/data-updates');
  await expect(dataQualityLink).toHaveAttribute('href', '/platform/data-quality');
  await expect(ratingAuditLink).toHaveAttribute('href', '/platform/audit');
  await expect(page.getByRole('button', { name: /About/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Feedback/i })).toHaveAttribute('href', '/feedback');
  await capture(page, testInfo, 'platform-drawer');

  await dataUpdatesLink.click();
  await expect(page).toHaveURL(/\/platform\/data-updates$/);
  await expect(page.getByRole('heading', { name: 'Data Updates' })).toBeVisible();
  await expect(page.getByText('Latest published snapshot')).toBeVisible();
  await expect(page.getByText(/rather than querying the live scraping queue/i)).toBeVisible();
  await expect(page.getByText('Table Tennis 365', { exact: true })).toBeVisible();
  await expect.poll(() => liveMonitorRequests).toBe(0);
  await capture(page, testInfo, 'snapshot-data-updates');

  await page.goto(`${previewUrl}/platform/data-quality`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Data Quality' })).toBeVisible();
  await expect(page.getByText('Quality Summary')).toBeVisible();
  await expect(page.getByText(/Snapshot generated/)).toBeVisible();
  await expect(page.getByText('Sport80', { exact: true })).toBeVisible();
  await expect.poll(() => liveMonitorRequests).toBe(0);
  await capture(page, testInfo, 'snapshot-data-quality');

  await page.goto(`${previewUrl}/about`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
  await expect(page.getByText('Data Coverage', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Scraping Monitor', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Send Feedback', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Saved Data', { exact: true })).toHaveCount(0);
  await capture(page, testInfo, 'clean-about');

  await page.goto(`${previewUrl}/feedback`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Feedback' })).toBeVisible();
  await expect(page.getByText(/Found a bug, noticed a data issue/i)).toBeVisible();
  await capture(page, testInfo, 'feedback-page');

  writeReportIndex(previewUrl);
});
