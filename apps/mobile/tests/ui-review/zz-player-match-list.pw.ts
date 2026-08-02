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
  const cards = entries.map((entry) => `
    <article>
      <h2>${escapeHtml(`${entry.project}: ${entry.title}`)}</h2>
      <a href="${escapeHtml(entry.path)}"><img src="${escapeHtml(entry.path)}" alt="${escapeHtml(entry.title)}" /></a>
      <p><a href="${escapeHtml(entry.url)}">Open page</a></p>
      <p><a href="${escapeHtml(entry.diagnosticsPath)}">Diagnostics</a></p>
    </article>
  `).join('');

  writeFileSync(join(reportDir, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>TT Players UI Review</title><style>
body{margin:0;font-family:system-ui,sans-serif;background:#f7f8f7;color:#17211d}main{max-width:1100px;margin:0 auto;padding:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}article{background:#fff;border:1px solid #d9dfda;border-radius:10px;padding:14px}img{width:100%;height:auto;border:1px solid #d9dfda;border-radius:8px;display:block}a{color:#0f6655}
</style></head><body><main><h1>TT Players UI Review</h1><p>Preview: <a href="${escapeHtml(previewUrl)}">${escapeHtml(previewUrl)}</a></p><div class="grid">${cards}</div></main></body></html>\n`);
}

async function settleForScreenshot(page: Page) {
  await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; caret-color: transparent !important; }' });
  await page.evaluate(() => document.fonts.ready);
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

function playerIdFromUrl(value: string): string {
  const match = new URL(value).pathname.match(/\/player\/([^/]+)/);
  if (!match?.[1]) throw new Error(`Could not read player id from ${value}`);
  return decodeURIComponent(match[1]);
}

test.beforeAll(() => {
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(diagnosticsDir, { recursive: true });
});

test('reviews compact recent matches and Quick Journal', async ({ page }, testInfo) => {
  const previewUrl = requirePreviewUrl();
  await prepareAppState(page);

  await page.goto(`${previewUrl}/tabs/players`, { waitUntil: 'domcontentloaded' });
  const search = page.getByRole('textbox', { name: 'Search players' });
  await expect(search).toBeVisible();

  const searchResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/api/players/search')
      && url.searchParams.get('q') === 'Wudong Liu'
      && response.status() === 200;
  });
  await search.fill('Wudong Liu');
  await searchResponse;

  const playerTitle = page.locator('.tt-list-item__title').filter({ hasText: /^Wudong Liu$/ }).first();
  await expect(playerTitle).toBeVisible({ timeout: 30_000 });
  await playerTitle.locator('xpath=ancestor::*[contains(@class,"tt-list-item__clickable")]').click();
  await expect(page).toHaveURL(/\/player\//);

  const playerId = playerIdFromUrl(page.url());
  await page.evaluate(({ id }) => {
    localStorage.setItem('tt_players_my_player', JSON.stringify({ id, name: 'Wudong Liu' }));
  }, { id: playerId });

  const firstPageResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith(`/api/players/${playerId}/rubbers`)
      && url.searchParams.get('limit') === '20'
      && url.searchParams.get('offset') === '0'
      && url.searchParams.get('source') === 'all'
      && response.status() === 200;
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await firstPageResponse;

  await expect(page.locator('.tt-player-hero')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'This isn’t me' })).toBeVisible();

  const recentSection = page.locator('section.tt-player-section').filter({
    has: page.getByRole('heading', { name: 'Recent Matches' }),
  });
  await recentSection.scrollIntoViewIfNeeded();
  await expect(recentSection.locator('.tt-player-match-row').first()).toBeVisible({ timeout: 30_000 });
  await expect(recentSection.locator('.tt-outcome-badge--icon')).toHaveCount(0);
  await expect(recentSection.getByRole('button', { name: /View .+ profile/ }).first()).toBeVisible();
  await expect(recentSection.getByRole('button', { name: /Match actions for/ }).first()).toBeVisible();

  const secondPageResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith(`/api/players/${playerId}/rubbers`)
      && url.searchParams.get('limit') === '20'
      && url.searchParams.get('offset') === '20'
      && url.searchParams.get('source') === 'all'
      && response.status() === 200;
  });
  await recentSection.locator('.tt-infinite-list-footer').scrollIntoViewIfNeeded();
  await secondPageResponse;
  await expect(recentSection.locator('.tt-player-match-row')).toHaveCount(40);
  await capture(page, testInfo, 'compact-recent-matches');

  await recentSection.getByRole('button', { name: /Match actions for/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Opponent' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Fixture' }).or(page.getByRole('button', { name: 'View Event' }))).toBeVisible();
  await page.getByRole('button', { name: 'Quick Journal' }).click();

  await expect(page).toHaveURL(/\/journal\?.*date=.*opponent=.*outcome=(?:win|loss)/);
  const journalUrl = new URL(page.url());
  const expectedOutcome = journalUrl.searchParams.get('outcome');
  await expect(page.getByLabel('Match or session date')).toHaveValue(journalUrl.searchParams.get('date') ?? '');
  await expect(page.getByLabel('Opponent or session (optional)')).toHaveValue(journalUrl.searchParams.get('opponent') ?? '');
  await expect(page.getByRole('radio', { name: expectedOutcome === 'loss' ? 'Loss' : 'Win' })).toHaveAttribute('aria-checked', 'true');
  await capture(page, testInfo, 'quick-journal-prefilled');

  writeReportIndex(previewUrl);
});
