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

test.beforeAll(() => {
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(diagnosticsDir, { recursive: true });
});

test('reviews summary, rating, ranked rivals and career story', async ({ page }, testInfo) => {
  const previewUrl = requirePreviewUrl();
  await prepareAppState(page);

  const lookupResponse = await page.request.get(`${previewUrl}/api/players/search?q=Wudong%20Liu&limit=10&offset=0`);
  expect(lookupResponse.ok()).toBe(true);
  const lookup = await lookupResponse.json() as PlayerSearchResponse;
  const player = lookup.data.find((item) => item.name === 'Wudong Liu') ?? lookup.data[0];
  expect(player).toBeTruthy();

  await page.route('**/api/players/*/rivals', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        player_id: player!.id,
        toughest: [
          { opponent_id: '11111111-1111-4111-8111-111111111111', opponent_name: 'Sienna Jetha', played: 4, wins: 0, losses: 4, win_rate: 0 },
          { opponent_id: '22222222-2222-4222-8222-222222222222', opponent_name: 'Rhea Das', played: 4, wins: 1, losses: 3, win_rate: 25 },
          { opponent_id: '33333333-3333-4333-8333-333333333333', opponent_name: 'Nina Lee', played: 3, wins: 1, losses: 2, win_rate: 33 },
          { opponent_id: '44444444-4444-4444-8444-444444444444', opponent_name: 'Mei Tran', played: 3, wins: 1, losses: 2, win_rate: 33 },
        ],
        easiest: [
          { opponent_id: '55555555-5555-4555-8555-555555555555', opponent_name: 'Cindy Xiao', played: 5, wins: 5, losses: 0, win_rate: 100 },
          { opponent_id: '66666666-6666-4666-8666-666666666666', opponent_name: 'Ava Kim', played: 7, wins: 6, losses: 1, win_rate: 86 },
          { opponent_id: '77777777-7777-4777-8777-777777777777', opponent_name: 'Jade Rao', played: 5, wins: 4, losses: 1, win_rate: 80 },
        ],
        improving: [
          { opponent_id: '88888888-8888-4888-8888-888888888888', opponent_name: 'Monica Chang', played: 8, first_half_win_rate: 25, second_half_win_rate: 75, delta_points: 50 },
          { opponent_id: '99999999-9999-4999-8999-999999999999', opponent_name: 'Yara Zhao', played: 9, first_half_win_rate: 40, second_half_win_rate: 80, delta_points: 40 },
        ],
      }),
    });
  });

  const insightsResponse = page.waitForResponse((response) =>
    response.url().endsWith(`/api/players/${player!.id}/insights`) && response.status() === 200,
  );
  await page.goto(`${previewUrl}/tabs/players/player/${player!.id}/insights`, { waitUntil: 'domcontentloaded' });
  await insightsResponse;

  await expect(page.getByRole('heading', { name: 'Insights Summary' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.tt-insights-metric')).toHaveCount(4);
  await expect(page.getByRole('heading', { name: 'Rating & Form' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, 'player-insights-summary-rating');

  const rivals = page.getByRole('heading', { name: 'Rival Intelligence' });
  await rivals.scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: /Sienna Jetha/ })).toBeVisible();
  await page.getByRole('radio', { name: 'Easiest' }).click();
  await expect(page.getByRole('button', { name: /Cindy Xiao/ })).toBeVisible();
  await page.getByRole('radio', { name: 'Trending up' }).click();
  await expect(page.getByRole('button', { name: /Monica Chang/ })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, 'player-insights-rivals');

  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole('heading', { name: 'Career Story' }).scrollIntoViewIfNeeded();
  await expect(page.locator('.tt-career-highlight')).toHaveCount(4);
  await expect(page.locator('.tt-career-row').first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, 'player-insights-career-narrow');

  writeReportIndex(previewUrl);
});
