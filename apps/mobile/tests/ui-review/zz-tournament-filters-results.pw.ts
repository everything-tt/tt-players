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

interface EventListResponse {
  data: Array<{ id: string; match_count: number }>;
  total: number;
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

async function prepareAppState(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('tt_players_league_onboarding_complete', 'true');
    localStorage.setItem('tt_players_selected_league_ids', JSON.stringify([]));
    localStorage.setItem('tt_players_favourite_tournaments', JSON.stringify([]));
    localStorage.setItem('TTPlayers-Theme', 'light-mode');
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  });
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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function writeReportIndex(previewUrl: string) {
  const entries = readManifest();
  const groups = entries.reduce<Record<string, ScreenshotEntry[]>>((acc, entry) => {
    acc[entry.project] = acc[entry.project] ?? [];
    acc[entry.project].push(entry);
    return acc;
  }, {});
  const sections = Object.entries(groups).map(([project, items]) => `
    <section>
      <h2>${escapeHtml(project)}</h2>
      <div class="grid">
        ${items.map((item) => `
          <article>
            <h3>${escapeHtml(item.title)}</h3>
            <a href="${escapeHtml(item.path)}"><img src="${escapeHtml(item.path)}" alt="${escapeHtml(`${project} ${item.title}`)}" /></a>
            <p><a href="${escapeHtml(item.url)}">${escapeHtml(new URL(item.url).pathname)}</a></p>
            <p><a href="${escapeHtml(item.diagnosticsPath)}">Diagnostics</a></p>
          </article>
        `).join('')}
      </div>
    </section>
  `).join('');
  writeFileSync(join(reportDir, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>TT Players UI Review</title><style>
body{margin:0;font-family:system-ui,sans-serif;background:#f7f8f7;color:#17211d}main{max-width:1180px;margin:0 auto;padding:24px}
h1,h2,h3{margin:0 0 12px}header,section{margin-bottom:28px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
article{background:white;border:1px solid #d9dfda;border-radius:8px;padding:12px}img{width:100%;height:auto;border:1px solid #d9dfda;border-radius:6px;display:block}a{color:#0f6655}code{background:#eef2ef;padding:2px 5px;border-radius:4px}
</style></head><body><main><header><h1>TT Players UI Review</h1><p>Preview: <a href="${escapeHtml(previewUrl)}">${escapeHtml(previewUrl)}</a></p><p>Commit: <code>${escapeHtml(process.env.GITHUB_SHA ?? 'local')}</code></p></header>${sections}</main></body></html>\n`);
}

async function settleForScreenshot(page: Page) {
  await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; caret-color: transparent !important; }' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
}

async function capture(page: Page, testInfo: TestInfo, title: string) {
  await settleForScreenshot(page);
  const screenshotPath = `screenshots/${testInfo.project.name}-${title}.png`;
  const diagnosticsPath = `diagnostics/${testInfo.project.name}-${title}.json`;
  await page.screenshot({ path: join(reportDir, screenshotPath), fullPage: false, timeout: 15_000 });
  writeFileSync(join(reportDir, diagnosticsPath), `${JSON.stringify({ route: page.url(), finalUrl: page.url(), events: [] }, null, 2)}\n`);
  appendManifest({ project: testInfo.project.name, title, url: page.url(), path: screenshotPath, diagnosticsPath });
}

test.beforeAll(() => {
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(diagnosticsDir, { recursive: true });
});

test('reviews icon filters, category selection, and results-only completed tournaments', async ({ page }, testInfo) => {
  const previewUrl = requirePreviewUrl();
  await prepareAppState(page);

  const upcomingResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/api/events')
      && url.searchParams.get('status') === 'upcoming'
      && !url.searchParams.has('categories')
      && response.status() === 200;
  });
  await page.goto(`${previewUrl}/tabs/events`, { waitUntil: 'domcontentloaded' });
  await upcomingResponse;

  const savedButton = page.getByRole('button', { name: /show saved tournaments only/i });
  const filterButton = page.getByRole('button', { name: /show tournament category filters/i });
  await expect(savedButton).toBeVisible();
  await expect(filterButton).toBeVisible();
  await expect(savedButton.locator('.tt-tournament-toolbar-icon__label')).toBeHidden();
  await expect(filterButton.locator('.tt-tournament-toolbar-icon__label')).toBeHidden();

  const widths = await Promise.all([
    savedButton.evaluate((element) => element.getBoundingClientRect().width),
    filterButton.evaluate((element) => element.getBoundingClientRect().width),
  ]);
  expect(Math.abs(widths[0] - widths[1])).toBeLessThan(1);
  expect(widths[0]).toBeGreaterThanOrEqual(48);

  await filterButton.click();
  const categoryFilters = page.getByRole('group', { name: 'Tournament category filters' });
  await expect(categoryFilters).toBeVisible();

  const juniorResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/api/events')
      && url.searchParams.get('status') === 'upcoming'
      && url.searchParams.get('categories') === 'junior'
      && response.status() === 200;
  });
  await categoryFilters.getByRole('button', { name: 'Junior', exact: true }).click();
  await juniorResponse;

  const girlsResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/api/events')
      && url.searchParams.get('status') === 'upcoming'
      && url.searchParams.get('categories') === 'girls,junior'
      && response.status() === 200;
  });
  await categoryFilters.getByRole('button', { name: 'Girls', exact: true }).click();
  await girlsResponse;
  await expect(filterButton.locator('.tt-tournament-toolbar-icon__count')).toHaveText('2');
  await capture(page, testInfo, 'tournaments-category-filters');

  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(filterButton.locator('.tt-tournament-toolbar-icon__count')).toHaveCount(0);

  const completedResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/api/events')
      && url.searchParams.get('status') === 'completed'
      && !url.searchParams.has('categories')
      && response.status() === 200;
  });
  await page.getByRole('radio', { name: 'Completed' }).click();
  const completedResponse = await completedResponsePromise;
  const completedPayload = await completedResponse.json() as EventListResponse;
  expect(completedPayload.data.length).toBeGreaterThan(0);
  expect(completedPayload.data.every((event) => event.match_count > 0)).toBe(true);
  await expect(page.locator('.tt-tournament-timeline-item').first()).toBeVisible();
  await expect(page.locator('.tt-tournament-timeline-item__match-count')).toHaveCount(completedPayload.data.length);
  await capture(page, testInfo, 'tournaments-completed-results-only');

  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByRole('button', { name: /hide tournament category filters/i }).click();
  await expect(categoryFilters).toBeHidden();
  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  expect(noOverflow).toBe(true);
  await capture(page, testInfo, 'tournaments-icon-filters-320');

  writeReportIndex(previewUrl);
});
