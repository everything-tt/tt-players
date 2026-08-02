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
    localStorage.setItem('tt_players_favourite_players', JSON.stringify([]));
    localStorage.removeItem('tt_players_my_player');
    localStorage.removeItem('tt_players_local_data_backup_v1');
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

async function expectVisibleSavedToggle(page: Page, accessibleName: RegExp, searchLabel: string) {
  const button = page.getByRole('button', { name: accessibleName });
  const search = page.getByRole('textbox', { name: searchLabel });
  await expect(button).toBeVisible();
  await expect(button.locator('span')).toBeVisible();
  await expect(button.locator('span')).toHaveText('Saved');
  const iconContent = await button.locator('i').evaluate((element) => getComputedStyle(element, '::before').content);
  expect(iconContent).not.toBe('none');
  expect(iconContent).not.toBe('normal');
  expect(iconContent).not.toBe('""');
  const [buttonBox, searchBox] = await Promise.all([button.boundingBox(), search.boundingBox()]);
  expect(buttonBox).not.toBeNull();
  expect(searchBox).not.toBeNull();
  expect(Math.abs(buttonBox!.y - searchBox!.y)).toBeLessThan(8);
  return button;
}

async function expectEvenSegmentWidths(page: Page, ariaLabel: string) {
  const group = page.getByRole('radiogroup', { name: ariaLabel });
  const tabs = group.getByRole('radio');
  await expect(group).toBeVisible();
  await expect(tabs).toHaveCount(2);
  const widths = await tabs.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().width),
  );
  expect(widths[0]).toBeGreaterThan(120);
  expect(widths[1]).toBeGreaterThan(120);
  expect(Math.abs(widths[0]! - widths[1]!)).toBeLessThan(2);
}

test.beforeAll(() => {
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(diagnosticsDir, { recursive: true });
});

test('exercises the player following hub, tournament browse, and tournament detail layout', async ({ page }, testInfo) => {
  const previewUrl = requirePreviewUrl();
  await prepareAppState(page);

  await page.goto(`${previewUrl}/tabs/players`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('radiogroup', { name: 'Player search scope' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /show saved players only/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /select leagues/i })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Following' })).toBeVisible();
  await expect(page.getByText('No followed players yet')).toBeVisible();
  await capture(page, testInfo, 'players-following-empty');

  const playerSearch = page.getByRole('textbox', { name: 'Search all players' });
  const graceResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/api/players/search')
      && url.searchParams.get('q') === 'Grace'
      && response.status() === 200;
  });
  await playerSearch.fill('Grace');
  await graceResponse;
  await expect(page.getByRole('heading', { name: 'Search results' })).toBeVisible();
  await expect(page.getByText('Loading players…')).toBeHidden();
  await expect(page.locator('.tt-list-item__title').filter({ hasText: /Grace/i }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/undefined/i)).toHaveCount(0);
  await expect(page.getByText(/^\d+ (?:shown|of \d+)$/)).toBeVisible();
  await capture(page, testInfo, 'players-grace-search');

  await page.getByRole('button', { name: 'Save to favourites' }).first().click();
  await expect(page.getByRole('button', { name: 'Remove from favourites' }).first()).toBeVisible();
  await playerSearch.fill('');
  await expect(page.getByRole('heading', { name: 'Following' })).toBeVisible();
  await expect(page.locator('.tt-list-item__title').filter({ hasText: /Grace/i }).first()).toBeVisible({ timeout: 30_000 });
  await capture(page, testInfo, 'players-following-saved');

  const upcomingResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/api/events')
      && url.searchParams.get('status') === 'upcoming'
      && url.searchParams.get('limit') === '10'
      && response.status() === 200;
  });
  await page.goto(`${previewUrl}/tabs/events`, { waitUntil: 'domcontentloaded' });
  await upcomingResponse;
  await expectEvenSegmentWidths(page, 'Tournament status');
  await expectVisibleSavedToggle(page, /show saved tournaments only/i, 'Search upcoming tournaments');
  await expect(page.locator('.tt-list-item__title').first()).toBeVisible({ timeout: 30_000 });
  await capture(page, testInfo, 'tournaments-native-browse');

  await page.locator('.tt-list-item__clickable').first().click();
  await expect(page).toHaveURL(/\/event\//);
  const hero = page.locator('.tt-entity-hero--actions-below');
  await expect(hero).toBeVisible({ timeout: 30_000 });
  await expect(hero.locator('.tt-entity-hero__title')).toBeVisible();
  const layout = await hero.evaluate((element) => {
    const title = element.querySelector<HTMLElement>('.tt-entity-hero__title');
    const copy = element.querySelector<HTMLElement>('.tt-entity-hero__copy');
    const actions = element.querySelector<HTMLElement>(':scope > .tt-entity-hero__actions');
    if (!title || !copy || !actions) return null;
    const titleRect = title.getBoundingClientRect();
    const copyRect = copy.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();
    return {
      titleWidth: titleRect.width,
      actionsBelowCopy: actionsRect.top >= copyRect.bottom - 1,
      noHorizontalOverflow: element.scrollWidth <= element.clientWidth + 1,
    };
  });
  expect(layout).not.toBeNull();
  expect(layout!.titleWidth).toBeGreaterThan(180);
  expect(layout!.actionsBelowCopy).toBe(true);
  expect(layout!.noHorizontalOverflow).toBe(true);
  await capture(page, testInfo, 'tournament-detail-responsive-actions');

  writeReportIndex(previewUrl);
});
