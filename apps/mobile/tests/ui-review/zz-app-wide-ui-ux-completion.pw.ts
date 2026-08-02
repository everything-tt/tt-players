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

interface PlayerSearchResponse {
  data: Array<{ id: string; name: string }>;
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
  const cards = readManifest().map((entry) => `
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

async function capture(page: Page, testInfo: TestInfo, title: string) {
  await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; caret-color: transparent !important; }' });
  await page.evaluate(() => document.fonts.ready);
  const screenshotPath = `screenshots/${testInfo.project.name}-${title}.png`;
  const diagnosticsPath = `diagnostics/${testInfo.project.name}-${title}.json`;
  await page.screenshot({ path: join(reportDir, screenshotPath), fullPage: false, timeout: 15_000 });
  writeFileSync(join(reportDir, diagnosticsPath), `${JSON.stringify({ route: page.url(), viewport: page.viewportSize() }, null, 2)}\n`);
  appendManifest({ project: testInfo.project.name, title, url: page.url(), path: screenshotPath, diagnosticsPath });
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(overflow.document, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport + 1);
  expect(overflow.body, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport + 1);
}

async function expectPlayerProfile(page: Page, playerName: string) {
  await expect(page.getByRole('heading', { name: playerName, level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.tt-entity-hero')).toHaveCount(1);
  await expect(page.getByLabel('Player summary').locator('.tt-metric')).toHaveCount(4);
  await expect(page.getByRole('heading', { name: 'Ability Rating' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Current season' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Form' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent matches' })).toBeVisible();
  await expect(page.locator('section.tt-player-hero, section.tt-player-section')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
}

test.beforeAll(() => {
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(diagnosticsDir, { recursive: true });
});

test('reviews the canonical root shell and player profile', async ({ page }, testInfo) => {
  const previewUrl = requirePreviewUrl();
  await prepareAppState(page);

  const lookupResponse = await page.request.get(`${previewUrl}/api/players/search?q=Wudong%20Liu&limit=10&offset=0`);
  expect(lookupResponse.ok()).toBe(true);
  const lookup = await lookupResponse.json() as PlayerSearchResponse;
  const player = lookup.data.find((item) => item.name === 'Wudong Liu') ?? lookup.data[0];
  expect(player).toBeTruthy();

  await page.goto(`${previewUrl}/tabs/home`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.tt-app-shell')).toBeVisible();
  await expect(page.locator('.tt-root-content')).toBeVisible();
  await expect(page.locator('main.tt-page-content')).toHaveCount(1);
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, 'home-canonical-shell');

  await page.goto(`${previewUrl}/tabs/players`, { waitUntil: 'domcontentloaded' });
  const playerSearch = page.getByRole('search');
  await expect(playerSearch).toBeVisible({ timeout: 30_000 });
  await expect(playerSearch.getByRole('textbox')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto(`${previewUrl}/tabs/players/player/${player!.id}`, { waitUntil: 'domcontentloaded' });
  await expectPlayerProfile(page, player!.name);
  await capture(page, testInfo, 'player-profile-standard');

  await page.setViewportSize({ width: 320, height: 780 });
  await expectPlayerProfile(page, player!.name);
  await capture(page, testInfo, 'player-profile-narrow');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    localStorage.setItem('TTPlayers-Theme', 'dark-mode');
    document.body.classList.add('theme-dark');
    document.body.classList.remove('theme-light', 'detect-theme');
  });
  await expect(page.locator('body')).toHaveClass(/theme-dark/);
  await expectPlayerProfile(page, player!.name);
  await capture(page, testInfo, 'player-profile-dark');

  writeReportIndex(previewUrl);
});
