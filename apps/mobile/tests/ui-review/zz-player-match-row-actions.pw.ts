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

interface PlayerRubbersResponse {
  data: Array<{
    opponent: string;
    opponent_id: string | null;
    source: 'league' | 'tournament';
    event_id: string | null;
  }>;
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

async function findPlayer(page: Page, previewUrl: string) {
  const params = new URLSearchParams({ q: 'Wudong Liu', limit: '10', offset: '0' });
  const response = await page.request.get(`${previewUrl}/api/players/search?${params.toString()}`);
  expect(response.ok()).toBe(true);
  const payload = await response.json() as PlayerSearchResponse;
  const player = payload.data.find((item) => item.name === 'Wudong Liu') ?? payload.data[0];
  expect(player).toBeTruthy();
  return player!;
}

async function openPlayer(page: Page, previewUrl: string, playerId: string) {
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith(`/api/players/${playerId}/rubbers`)
      && url.searchParams.get('limit') === '20'
      && url.searchParams.get('offset') === '0'
      && url.searchParams.get('source') === 'all'
      && response.status() === 200;
  });
  await page.goto(`${previewUrl}/tabs/players/player/${playerId}`, { waitUntil: 'domcontentloaded' });
  const response = await responsePromise;
  return response.json() as Promise<PlayerRubbersResponse>;
}

function recentMatchesSection(page: Page) {
  return page.locator('section.tt-player-section').filter({
    has: page.getByRole('heading', { name: 'Recent Matches' }),
  });
}

test.beforeAll(() => {
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(diagnosticsDir, { recursive: true });
});

test('reviews inline dates and direct match actions', async ({ page }, testInfo) => {
  const previewUrl = requirePreviewUrl();
  await prepareAppState(page);
  const player = await findPlayer(page, previewUrl);

  await page.goto(previewUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ id, name }) => {
    localStorage.setItem('tt_players_my_player', JSON.stringify({ id, name }));
  }, player);

  const rubbers = await openPlayer(page, previewUrl, player.id);
  const firstMatch = rubbers.data.find((match) => Boolean(match.opponent_id));
  expect(firstMatch?.opponent_id).toBeTruthy();

  const ownSection = recentMatchesSection(page);
  await ownSection.scrollIntoViewIfNeeded();
  const firstRow = ownSection.locator('.tt-player-match-row').first();
  await expect(firstRow).toBeVisible({ timeout: 30_000 });
  await expect(firstRow.locator('.tt-player-match-date')).toHaveCount(0);
  await expect(firstRow.locator('.tt-player-match-meta')).toBeVisible();
  await expect(firstRow.locator('.tt-player-match-meta__year')).toHaveText(/^\d{4}$/);
  await expect(firstRow.getByRole('button', { name: /Journal match against/ })).toBeVisible();
  await expect(firstRow.getByRole('button', { name: /View (?:fixture|event) for match against/ })).toBeVisible();
  await expect(firstRow.getByRole('button', { name: /Match actions for/ })).toHaveCount(0);

  const fontSizes = await firstRow.evaluate((row) => {
    const date = row.querySelector<HTMLElement>('.tt-player-match-meta__date');
    const year = row.querySelector<HTMLElement>('.tt-player-match-meta__year');
    return {
      date: date ? Number.parseFloat(getComputedStyle(date).fontSize) : 0,
      year: year ? Number.parseFloat(getComputedStyle(year).fontSize) : 0,
    };
  });
  expect(fontSizes.year).toBeGreaterThan(0);
  expect(fontSizes.year).toBeLessThan(fontSizes.date);
  await capture(page, testInfo, 'my-player-direct-actions');

  const opponentId = firstMatch!.opponent_id!;
  const opponentName = firstMatch!.opponent;
  await ownSection.locator('.tt-player-match-row').filter({ hasText: opponentName }).first()
    .locator('.tt-list-item__clickable').click();
  await expect(page).toHaveURL(new RegExp(`/player/${opponentId}(?:$|[/?#])`));

  await page.evaluate(() => localStorage.removeItem('tt_players_my_player'));
  await openPlayer(page, previewUrl, player.id);
  const otherSection = recentMatchesSection(page);
  await otherSection.scrollIntoViewIfNeeded();
  const otherFirstRow = otherSection.locator('.tt-player-match-row').first();
  await expect(otherFirstRow).toBeVisible({ timeout: 30_000 });
  await expect(otherFirstRow.getByRole('button', { name: /Journal match against/ })).toHaveCount(0);
  await expect(otherFirstRow.getByRole('button', { name: /View (?:fixture|event) for match against/ })).toBeVisible();
  await capture(page, testInfo, 'other-player-single-action');

  await page.evaluate(({ id, name }) => {
    localStorage.setItem('tt_players_my_player', JSON.stringify({ id, name }));
  }, player);
  await openPlayer(page, previewUrl, player.id);
  const journalSection = recentMatchesSection(page);
  await journalSection.scrollIntoViewIfNeeded();
  await journalSection.getByRole('button', { name: /Journal match against/ }).first().click();
  await expect(page).toHaveURL(/\/journal\?.*date=.*opponent=.*outcome=(?:win|loss)/);
  const journalUrl = new URL(page.url());
  await expect(page.getByLabel('Match or session date')).toHaveValue(journalUrl.searchParams.get('date') ?? '');
  await expect(page.getByLabel('Opponent or session (optional)')).toHaveValue(journalUrl.searchParams.get('opponent') ?? '');
  await capture(page, testInfo, 'direct-quick-journal');

  writeReportIndex(previewUrl);
});
