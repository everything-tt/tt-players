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

test('reviews one-row tournament toolbar, filter sheet, and favourite alignment', async ({ page }, testInfo) => {
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

  const filterRail = page.locator('.tt-tournament-filter-rail');
  const statusToggle = page.getByRole('radiogroup', { name: 'Tournament status' });
  const filterButton = page.getByRole('button', { name: 'Tournament filters', exact: true });
  const searchButton = page.getByRole('button', { name: 'Search tournaments', exact: true });

  await expect(filterRail).toBeVisible();
  await expect(statusToggle).toBeVisible();
  await expect(filterButton).toBeVisible();
  await expect(searchButton).toBeVisible();
  await expect(filterButton.locator('.tt-tournament-toolbar-icon__label')).toBeHidden();
  await expect(searchButton.locator('.tt-tournament-toolbar-icon__label')).toBeHidden();
  await expect(page.getByRole('button', { name: /Select leagues/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Tournament list:/i })).toHaveCount(0);

  const railBounds = await filterRail.boundingBox();
  const controlBounds = await Promise.all([
    statusToggle.boundingBox(),
    filterButton.boundingBox(),
    searchButton.boundingBox(),
  ]);
  expect(railBounds).not.toBeNull();
  expect(railBounds?.height ?? 999).toBeLessThanOrEqual(50);
  for (const bounds of controlBounds) {
    expect(bounds).not.toBeNull();
    expect(Math.abs((bounds?.y ?? 0) - (railBounds?.y ?? 0))).toBeLessThan(4);
  }

  const firstTournamentRow = page.locator('.tt-tournament-timeline-list > .tt-list-item').first();
  const firstFavourite = firstTournamentRow.getByRole('button', { name: 'Save to favourites' });
  await expect(firstTournamentRow).toBeVisible();
  await expect(firstFavourite).toBeVisible();
  const rowBounds = await firstTournamentRow.boundingBox();
  const favouriteBounds = await firstFavourite.boundingBox();
  expect(rowBounds).not.toBeNull();
  expect(favouriteBounds).not.toBeNull();
  const favouriteRightInset = (rowBounds?.x ?? 0) + (rowBounds?.width ?? 0)
    - ((favouriteBounds?.x ?? 0) + (favouriteBounds?.width ?? 0));
  expect(favouriteRightInset).toBeGreaterThanOrEqual(10);

  await capture(page, testInfo, 'tournaments-toolbar');

  await searchButton.click();
  await expect(filterRail).toHaveCount(0);
  const searchInput = page.getByLabel('Search upcoming tournaments');
  await expect(searchInput).toBeVisible();
  await expect(searchInput).toBeFocused();
  await searchInput.fill('regional');
  await page.getByRole('button', { name: 'Close tournament search' }).click();
  await expect(filterRail).toBeVisible();
  await expect(page.getByRole('button', { name: /Search tournaments, active query regional/i })).toBeVisible();

  await page.getByRole('button', { name: /Search tournaments, active query regional/i }).click();
  await expect(page.getByLabel('Search upcoming tournaments')).toHaveValue('regional');
  await page.getByLabel('Search upcoming tournaments').fill('');
  await page.getByRole('button', { name: 'Close tournament search' }).click();
  await expect(filterRail).toBeVisible();

  await filterButton.click();
  const scopeFilters = page.getByRole('group', { name: 'Tournament list filters' });
  const categoryFilters = page.getByRole('group', { name: 'Tournament category filters' });
  await expect(scopeFilters).toBeVisible();
  await expect(scopeFilters.getByRole('button', { name: 'All', exact: true })).toBeVisible();
  await expect(scopeFilters.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
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
  await expect(page.getByRole('button', { name: 'Tournament filters, 2 active' }).locator('.tt-tournament-toolbar-icon__count')).toHaveText('2');
  await capture(page, testInfo, 'tournaments-filter-sheet');

  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.locator('.tt-tournament-toolbar-icon__count')).toHaveCount(0);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(categoryFilters).toBeHidden();

  await page.setViewportSize({ width: 320, height: 844 });
  await expect(filterRail).toBeVisible();
  const compactBounds = await filterRail.boundingBox();
  expect(compactBounds?.height ?? 999).toBeLessThanOrEqual(50);
  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  expect(noOverflow).toBe(true);
  await capture(page, testInfo, 'tournaments-toolbar-320');

  writeReportIndex(previewUrl);
});
