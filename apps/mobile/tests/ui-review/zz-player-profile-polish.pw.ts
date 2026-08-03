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

async function mockInsightsApi(page: Page, player: { id: string; name: string }) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === `/api/players/${player.id}/stats/extended`) {
      await route.fulfill({
        json: {
          player_id: player.id,
          player_name: player.name,
          wins: 86,
          losses: 78,
          total: 164,
          nemesis: 'Sienna Jetha',
          duo: 'Alex Morgan',
          streak: '5 wins',
        },
      });
      return;
    }

    if (path === `/api/players/${player.id}/insights`) {
      await route.fulfill({
        json: {
          player_id: player.id,
          player_name: player.name,
          years_played: 6,
          first_match_date: '2020-09-12',
          latest_match_date: '2026-07-28',
          career_by_year: [
            { year: 2026, played: 38, wins: 24, losses: 14, win_rate: 63 },
            { year: 2025, played: 42, wins: 29, losses: 13, win_rate: 69 },
            { year: 2024, played: 31, wins: 16, losses: 15, win_rate: 52 },
          ],
          peaks: {
            best_season: { year: 2025, played: 42, win_rate: 69 },
            most_active_season: { year: 2025, played: 42 },
            best_month: { month: '2025-11', played: 8, win_rate: 88 },
            worst_month: { month: '2024-02', played: 6, win_rate: 33 },
          },
          form: {
            rolling_10_win_rate: 70,
            rolling_20_win_rate: 60,
            momentum: 'hot',
            recent_results: ['W', 'W', 'L', 'W', 'W', 'L', 'W', 'W', 'W', 'L'],
          },
          milestones: {
            total_matches: 164,
            longest_win_streak: 7,
            milestone_hits: [50, 100, 150],
          },
          projection: {
            current_season_matches: 38,
            current_season_win_rate: 63,
            projected_matches: 44,
            on_track_for_70_win_rate: false,
          },
        },
      });
      return;
    }

    if (path === `/api/players/${player.id}/rivals`) {
      await route.fulfill({
        json: {
          player_id: player.id,
          toughest: [
            { opponent_id: 'rival-tough-1', opponent_name: 'Sienna Jetha', played: 4, wins: 0, losses: 4, win_rate: 0 },
            { opponent_id: 'rival-tough-2', opponent_name: 'Rhea Das', played: 4, wins: 1, losses: 3, win_rate: 25 },
          ],
          easiest: [
            { opponent_id: 'rival-easy-1', opponent_name: 'Cindy Xiao', played: 5, wins: 5, losses: 0, win_rate: 100 },
            { opponent_id: 'rival-easy-2', opponent_name: 'Ava Kim', played: 7, wins: 6, losses: 1, win_rate: 86 },
          ],
          improving: [
            { opponent_id: 'rival-up-1', opponent_name: 'Monica Chang', played: 8, first_half_win_rate: 25, second_half_win_rate: 75, delta_points: 50 },
          ],
        },
      });
      return;
    }

    if (path === `/api/ratings/${player.id}/history`) {
      const ratings = [1118, 1134, 1127, 1152, 1171, 1187];
      await route.fulfill({
        json: {
          player_id: player.id,
          player_name: player.name,
          model: 'glicko2-v1',
          range: url.searchParams.get('range') ?? '1y',
          data: ratings.map((rating, index) => ({
            week_start: `2026-0${index + 2}-02`,
            snapshot_date: `2026-0${index + 2}-08`,
            rating,
            rating_deviation: 62 - index * 2,
            conservative_rating: rating - 120,
            rating_low: rating - 120,
            rating_high: rating + 120,
            rating_change: index === 0 ? null : rating - ratings[index - 1]!,
            confidence: 'high',
            rated_matches: 142 + index * 4,
            rated_wins: 74 + index * 2,
            rated_losses: 68 + index * 2,
            week_matches: 4,
            week_wins: index % 3 === 0 ? 3 : 2,
            week_losses: index % 3 === 0 ? 1 : 2,
            provisional: false,
          })),
        },
      });
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

test('carries the polished hierarchy into the player insights page', async ({ page }, testInfo) => {
  const previewUrl = requirePreviewUrl();
  await prepareAppState(page);
  const player = { id: 'player-insights-polish', name: 'Wudong Liu' };
  await mockInsightsApi(page, player);

  await page.goto(`${previewUrl}/tabs/players/player/${player.id}/insights`, { waitUntil: 'domcontentloaded' });

  const summary = page.locator('.tt-insights-summary');
  await expect(summary).toBeVisible({ timeout: 30_000 });
  await expect(summary.getByText('Performance snapshot', { exact: true })).toBeVisible();
  await expect(summary.getByRole('heading', { name: 'Hot form' })).toBeVisible();
  await expect(summary.getByText('Recent record', { exact: true })).toBeVisible();
  await expect(summary.locator('.tt-insights-summary-metrics .tt-metric')).toHaveCount(3);

  const geometry = await summary.evaluate((element) => {
    const shell = element.getBoundingClientRect();
    const copy = element.querySelector<HTMLElement>('.tt-insights-summary-copy')!.getBoundingClientRect();
    const momentum = element.querySelector<HTMLElement>('.tt-insights-momentum')!.getBoundingClientRect();
    const recent = element.querySelector<HTMLElement>('.tt-insights-recent')!.getBoundingClientRect();
    return {
      shell: { left: shell.left, right: shell.right, height: shell.height },
      copy: { left: copy.left, right: copy.right },
      momentum: { left: momentum.left, right: momentum.right },
      recent: { left: recent.left, right: recent.right },
    };
  });

  expect(geometry.copy.left).toBeLessThan(geometry.momentum.left);
  expect(geometry.copy.right).toBeLessThanOrEqual(geometry.momentum.left);
  expect(geometry.recent.left - geometry.shell.left).toBeGreaterThanOrEqual(12);
  expect(geometry.shell.right - geometry.recent.right).toBeGreaterThanOrEqual(12);
  expect(geometry.shell.height).toBeLessThan(470);
  await capture(page, testInfo, 'player-insights-snapshot', geometry);

  const ratingSection = page.locator('.tt-rating-history');
  await ratingSection.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, -86));
  const rating = page.getByRole('heading', { name: 'Rating trend' });
  await expect(rating).toBeVisible();
  await expect(page.getByLabel('Rating summary for selected range').locator('.tt-metric')).toHaveCount(3);
  await expect(page.getByText('Last 8', { exact: true })).toHaveCount(0);
  await capture(page, testInfo, 'player-insights-rating-trend', { ratingMetrics: 3 });

  const matchupsSection = page.locator('.tt-rivals');
  await matchupsSection.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, -86));
  const matchups = page.getByRole('heading', { name: 'Key matchups' });
  await expect(matchups).toBeVisible();
  await expect(page.getByRole('button', { name: /Sienna Jetha/ })).toBeVisible();
  await page.getByRole('radio', { name: 'Easiest' }).click();
  await expect(page.getByRole('button', { name: /Cindy Xiao/ })).toBeVisible();
  await page.getByRole('radio', { name: 'Trending up' }).click();
  await expect(page.getByRole('button', { name: /Monica Chang/ })).toBeVisible();
  await capture(page, testInfo, 'player-insights-matchups', { categories: 3 });

  await page.setViewportSize({ width: 360, height: 800 });
  const careerSection = page.locator('.tt-career-story');
  await careerSection.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, -86));
  const career = page.getByRole('heading', { name: 'Career highlights' });
  await expect(career).toBeVisible();
  await expect(page.getByLabel('Career highlights').locator('.tt-metric')).toHaveCount(3);
  await expect(page.getByText('Latest milestone', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Season record' })).toBeVisible();
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(overflow.document).toBeLessThanOrEqual(overflow.viewport + 1);
  expect(overflow.body).toBeLessThanOrEqual(overflow.viewport + 1);
  await capture(page, testInfo, 'player-insights-career-narrow', overflow);

  writeReportIndex(previewUrl);
});
