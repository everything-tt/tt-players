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
const playerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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
      <p><a href="${escapeHtml(entry.url)}">Open page</a> · <a href="${escapeHtml(entry.diagnosticsPath)}">Diagnostics</a></p>
    </article>
  `).join('');

  writeFileSync(join(reportDir, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>TT Players Home Claim Review</title><style>
body{margin:0;font-family:system-ui,sans-serif;background:#f7f8f7;color:#17211d}main{max-width:1100px;margin:0 auto;padding:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}article{background:#fff;border:1px solid #d9dfda;border-radius:10px;padding:14px}img{width:100%;height:auto;border:1px solid #d9dfda;border-radius:8px;display:block}a{color:#0f6655}
</style></head><body><main><h1>TT Players Home Claim Review</h1><p>Preview: <a href="${escapeHtml(previewUrl)}">${escapeHtml(previewUrl)}</a></p><div class="grid">${cards}</div></main></body></html>\n`);
}

async function capture(page: Page, testInfo: TestInfo, title: string, diagnostics: unknown) {
  await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; caret-color: transparent !important; }' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(100);
  const screenshotPath = `screenshots/${testInfo.project.name}-${title}.png`;
  const diagnosticsPath = `diagnostics/${testInfo.project.name}-${title}.json`;
  await page.screenshot({ path: join(reportDir, screenshotPath), fullPage: false, timeout: 15_000 });
  writeFileSync(join(reportDir, diagnosticsPath), `${JSON.stringify({ route: page.url(), diagnostics }, null, 2)}\n`);
  appendManifest({ project: testInfo.project.name, title, url: page.url(), path: screenshotPath, diagnosticsPath });
}

async function installState(page: Page) {
  await page.addInitScript(() => {
    localStorage.removeItem('tt_players_my_player');
    localStorage.removeItem('tt_players_selected_league_ids');
    localStorage.removeItem('tt_players_league_onboarding_complete');
    localStorage.setItem('TTPlayers-Theme', 'light-mode');
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  });
}

async function mockApi(page: Page) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith('/api/leagues')) {
      await route.fulfill({ json: { data: [{
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Colchester & District League',
        season: '2026/27',
        divisions: [{ id: 'd1', name: 'Division 3' }],
      }] } });
      return;
    }

    if (path.endsWith('/api/events')) {
      await route.fulfill({ json: { data: [], total: 0, limit: 1, offset: 0, has_more: false } });
      return;
    }

    if (path.endsWith('/api/players/search')) {
      await route.fulfill({ json: { data: [{
        id: playerId,
        name: 'Wudong Liu',
        played: 25,
        wins: 18,
        losses: 7,
        win_rate: 72,
        leagues: ['Colchester & District League'],
        teams: ['Rowhedge K'],
      }] } });
      return;
    }

    if (path.endsWith(`/api/players/${playerId}/profile-overview`)) {
      await route.fulfill({ json: {
        player_id: playerId,
        player_name: 'Wudong Liu',
        wins: 18,
        losses: 7,
        total: 25,
        form: {
          rolling_10_win_rate: 70,
          rolling_20_win_rate: 68,
          momentum: 'hot',
          recent_results: ['W', 'W', 'L', 'W', 'W'],
        },
        current_season_affiliations: [],
      } });
      return;
    }

    if (path.endsWith(`/api/ratings/${playerId}`)) {
      await route.fulfill({ json: { data: {
        rank: 126,
        overall_rank: 126,
        player_id: playerId,
        player_name: 'Wudong Liu',
        rating: 1742,
        rating_deviation: 55,
        volatility: 0.06,
        conservative_rating: 1632,
        rating_low: 1600,
        rating_high: 1884,
        confidence: 'high',
        rated_matches: 25,
        rated_wins: 18,
        rated_losses: 7,
        win_rate: 72,
        provisional: false,
        first_rated_at: '2025-01-01',
        last_rated_at: '2026-08-05',
      } } });
      return;
    }

    await route.fulfill({ json: { data: [] } });
  });
}

test.beforeAll(() => {
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(diagnosticsDir, { recursive: true });
});

test('claims a player directly from Home without leaving the tab', async ({ page }, testInfo) => {
  const previewUrl = requirePreviewUrl();
  await installState(page);
  await mockApi(page);

  await page.goto(`${previewUrl}/tabs/home`, { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: 'Your TT' })).toBeVisible();
  await expect(page.getByText('Claim your player', { exact: true })).toBeVisible();
  const claimButton = page.getByRole('button', { name: 'Claim my player' });
  await expect(claimButton).toBeVisible();
  await capture(page, testInfo, 'home-unclaimed-player', {
    claimCallToActionVisible: true,
    staysOnHome: true,
  });

  await claimButton.click();
  const claimSheet = page.getByLabel('Claim your player');
  await expect(claimSheet).toBeVisible();
  await expect(claimSheet.getByText('Make Home personal', { exact: true })).toBeVisible();

  const searchInput = claimSheet.getByRole('textbox', { name: 'Search players' });
  await searchInput.fill('Wudong');
  await expect(claimSheet.getByText('Wudong Liu', { exact: true })).toBeVisible();
  await expect(claimSheet.getByText('18W · 25 played · Tap to claim as you', { exact: true })).toBeVisible();
  await capture(page, testInfo, 'home-claim-player-drawer', {
    inPlaceSearch: true,
    explicitClaimHint: true,
  });

  await claimSheet.getByText('Wudong Liu', { exact: true }).click();
  await expect(claimSheet).toBeHidden();
  await expect(page).toHaveURL(/\/tabs\/home/);
  await expect(page.getByText('Wudong Liu', { exact: true })).toBeVisible();
  await expect(page.getByText(/18W · 7L · 25 played · Rating 1,742/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Claim my player' })).toHaveCount(0);
  await capture(page, testInfo, 'home-after-player-claim', {
    drawerClosed: true,
    homePersonalisedImmediately: true,
    navigationUnchanged: true,
  });

  writeReportIndex(previewUrl);
});
