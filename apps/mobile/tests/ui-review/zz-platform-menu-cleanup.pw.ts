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

test('groups platform tools and keeps About focused', async ({ page }, testInfo) => {
  const previewUrl = requirePreviewUrl();
  await page.addInitScript(() => {
    localStorage.setItem('tt_players_league_onboarding_complete', 'true');
    localStorage.setItem('tt_players_selected_league_ids', JSON.stringify([]));
    localStorage.setItem('TTPlayers-Theme', 'light-mode');
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  });

  await page.goto(`${previewUrl}/tabs/home`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Open menu' }).click();

  await expect(page.getByRole('heading', { name: 'Platform' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Data Updates/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Data Quality/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Rating Audit/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /About/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Feedback/i })).toBeVisible();
  await capture(page, testInfo, 'platform-drawer');

  await page.getByRole('button', { name: /About/i }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
  await expect(page.getByText('Data Coverage', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Scraping Monitor', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Send Feedback', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Saved Data', { exact: true })).toHaveCount(0);
  await capture(page, testInfo, 'clean-about');

  await page.goto(`${previewUrl}/feedback`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Feedback' })).toBeVisible();
  await capture(page, testInfo, 'feedback-page');

  writeReportIndex(previewUrl);
});
