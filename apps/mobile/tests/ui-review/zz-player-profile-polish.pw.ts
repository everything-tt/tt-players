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
    if (sessionStorage.getItem('tt_test_keep_my_player') !== 'true') {
      localStorage.removeItem('tt_players_my_player');
    }
  });
}

async function mockProfileApi(page: Page, player: { id: string; name: string }) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === `/api/players/${player.id}/profile-overview`) {
      await route.fulfill({
        json: {
          player_id: player.id,
          player_name: player.name,
          wins: 86,
          losses: 78,
          total: 164,
          form: {
            rolling_10_win_rate: 70,
            rolling_20_win_rate: 60,
            momentum: 'hot',
            recent_results: ['W', 'W', 'L', 'W', 'W', 'L', 'W', 'W', 'W', 'L'],
          },
          current_season_affiliations: [],
        },
      });
      return;
    }

    if (path === `/api/ratings/${player.id}`) {
      await route.fulfill({
        json: {
          data: {
            rank: 142,
            player_id: player.id,
            player_name: player.name,
            rating: 1187,
            rating_deviation: 62,
            conservative_rating: 1063,
            rating_low: 1065,
            rating_high: 1309,
            confidence: 'high',
            rated_matches: 164,
            rated_wins: 86,
            rated_losses: 78,
            win_rate: 52,
            provisional: false,
            first_rated_at: '2024-09-01T00:00:00.000Z',
            last_rated_at: '2026-07-28T00:00:00.000Z',
          },
        },
      });
      return;
    }

    if (path === `/api/players/${player.id}/rubbers`) {
      await route.fulfill({ json: { total: 0, limit: 20, offset: 0, data: [] } });
      return;
    }

    await route.fulfill({ json: { data: [] } });
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

async function capture(page: Page, testInfo: TestInfo, title: string, diagnostics: unknown) {
  await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; caret-color: transparent !important; }' });
  await page.evaluate(() => document.fonts.ready);
  const screenshotPath = `screenshots/${testInfo.project.name}-${title}.png`;
  const diagnosticsPath = `diagnostics/${testInfo.project.name}-${title}.json`;
  await page.screenshot({ path: join(reportDir, screenshotPath), fullPage: false, timeout: 15_000 });
  writeFileSync(join(reportDir, diagnosticsPath), `${JSON.stringify({ route: page.url(), finalUrl: page.url(), diagnostics }, null, 2)}\n`);
  appendManifest({ project: testInfo.project.name, title, url: page.url(), path: screenshotPath, diagnosticsPath });
}

test.beforeAll(() => {
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(diagnosticsDir, { recursive: true });
});

test('polishes the profile hierarchy and treats identity as a reversible claim', async ({ page }, testInfo) => {
  const previewUrl = requirePreviewUrl();
  await prepareAppState(page);
  const player = { id: 'player-profile-polish', name: 'Wudong Liu' };
  await mockProfileApi(page, player);

  await page.goto(`${previewUrl}/tabs/players/player/${player.id}`, { waitUntil: 'domcontentloaded' });

  const hero = page.locator('.tt-player-profile-hero');
  await expect(hero).toBeVisible({ timeout: 30_000 });
  await expect(hero.getByText('Rating', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(hero.getByRole('button', { name: 'Save to favourites' })).toBeVisible();
  await expect(hero.getByRole('button', { name: 'History' })).toBeVisible();
  await expect(hero.getByRole('button', { name: 'Insights' })).toBeVisible();
  await expect(hero.getByRole('button', { name: 'Share' })).toBeVisible();
  await expect(hero.locator('.tt-player-profile-metric')).toHaveCount(3);

  const geometry = await hero.evaluate((element) => {
    const shell = element.getBoundingClientRect();
    const copy = element.querySelector<HTMLElement>('.tt-player-profile-copy')!.getBoundingClientRect();
    const avatar = element.querySelector<HTMLElement>('.tt-player-profile-avatar')!.getBoundingClientRect();
    const range = element.querySelector<HTMLElement>('.tt-player-profile-range')!.getBoundingClientRect();
    return {
      shell: { left: shell.left, right: shell.right, height: shell.height },
      copy: { left: copy.left, right: copy.right },
      avatar: { left: avatar.left, right: avatar.right },
      range: { left: range.left, right: range.right },
    };
  });

  expect(geometry.copy.left).toBeLessThan(geometry.avatar.left);
  expect(geometry.copy.right).toBeLessThanOrEqual(geometry.avatar.left);
  expect(geometry.range.left - geometry.shell.left).toBeGreaterThanOrEqual(12);
  expect(geometry.shell.right - geometry.range.right).toBeGreaterThanOrEqual(12);
  expect(geometry.shell.height).toBeLessThan(690);
  await capture(page, testInfo, 'player-profile-polished', geometry);

  await page.evaluate(({ id, name }) => {
    localStorage.setItem('tt_players_my_player', JSON.stringify({ id, name }));
    sessionStorage.setItem('tt_test_keep_my_player', 'true');
  }, player);
  await page.reload({ waitUntil: 'domcontentloaded' });

  const claimedHero = page.locator('.tt-player-profile-hero');
  await expect(claimedHero.getByText('Claimed as your profile', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(claimedHero.locator('.tt-player-profile-actions > *')).toHaveCount(3);
  await expect(claimedHero.getByRole('button', { name: 'Save to favourites' })).toHaveCount(0);
  await capture(page, testInfo, 'player-profile-claimed', { actions: 3, claimStatus: true });

  await claimedHero.getByRole('button', { name: 'Undo claim' }).click();
  const dialog = page.getByRole('dialog', { name: 'Undo this profile claim?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('No match data will be deleted.', { exact: false })).toBeVisible();
  await capture(page, testInfo, 'player-profile-undo-claim', { actions: 3, claimConfirmation: true });

  await dialog.getByRole('button', { name: 'Keep linked' }).click();
  await expect(dialog).toBeHidden();
  await expect(claimedHero.getByText('Claimed as your profile', { exact: true })).toBeVisible();

  await claimedHero.getByRole('button', { name: 'Undo claim' }).click();
  await page.getByRole('dialog', { name: 'Undo this profile claim?' }).getByRole('button', { name: 'Undo claim' }).click();
  await expect(claimedHero.getByText('Claimed as your profile', { exact: true })).toHaveCount(0);
  await expect(claimedHero.getByRole('button', { name: 'Save to favourites' })).toBeVisible();

  writeReportIndex(previewUrl);
});
