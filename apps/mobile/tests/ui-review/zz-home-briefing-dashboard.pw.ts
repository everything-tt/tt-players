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
const leagueId = '10000000-0000-4000-8000-000000000001';

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
<title>TT Players Home Review</title><style>
body{margin:0;font-family:system-ui,sans-serif;background:#f7f8f7;color:#17211d}main{max-width:1100px;margin:0 auto;padding:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}article{background:#fff;border:1px solid #d9dfda;border-radius:10px;padding:14px}img{width:100%;height:auto;border:1px solid #d9dfda;border-radius:8px;display:block}a{color:#0f6655}
</style></head><body><main><h1>TT Players Home Review</h1><p>Preview: <a href="${escapeHtml(previewUrl)}">${escapeHtml(previewUrl)}</a></p><div class="grid">${cards}</div></main></body></html>\n`);
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
  await page.addInitScript(({ claimedPlayerId, selectedLeagueId }) => {
    const configured = sessionStorage.getItem('tt_review_home_configured') === 'true';
    if (configured) {
      localStorage.setItem('tt_players_my_player', JSON.stringify({ id: claimedPlayerId, name: 'Wudong Liu' }));
      localStorage.setItem('tt_players_selected_league_ids', JSON.stringify([selectedLeagueId]));
      localStorage.setItem('tt_players_league_onboarding_complete', 'true');
    } else {
      localStorage.removeItem('tt_players_my_player');
      localStorage.removeItem('tt_players_selected_league_ids');
      localStorage.removeItem('tt_players_league_onboarding_complete');
    }
    localStorage.setItem('TTPlayers-Theme', 'light-mode');
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  }, { claimedPlayerId: playerId, selectedLeagueId: leagueId });
}

function rating(player_id: string, player_name: string, rank: number, value: number, winRate: number) {
  return {
    rank,
    player_id,
    player_name,
    rating: value,
    rating_deviation: 45,
    volatility: 0.06,
    conservative_rating: value - 90,
    rating_low: value - 100,
    rating_high: value + 100,
    confidence: 'high',
    rated_matches: 92 - rank * 6,
    rated_wins: 58,
    rated_losses: 22,
    win_rate: winRate,
    provisional: false,
    first_rated_at: '2025-01-01',
    last_rated_at: '2026-08-05',
  };
}

async function mockApi(page: Page) {
  const globalRatings = [
    rating('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Jane Smith', 1, 2365, 74),
    rating('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Alex Morgan', 2, 2298, 71),
    rating('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Priya Patel', 3, 2254, 69),
    rating('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Daniel Green', 4, 2216, 67),
  ];
  const leagueRatings = [
    { ...rating('f1111111-1111-4111-8111-111111111111', 'Harrison Hill', 1, 2365, 73), overall_rank: 164 },
    { ...rating('f2222222-2222-4222-8222-222222222222', 'Sophie Carter', 2, 2182, 70), overall_rank: 301 },
    { ...rating('f3333333-3333-4333-8333-333333333333', 'James Wilson', 3, 2118, 68), overall_rank: 412 },
    { ...rating('f4444444-4444-4444-8444-444444444444', 'Emily Brown', 4, 2074, 66), overall_rank: 498 },
  ];

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith('/api/leagues')) {
      await route.fulfill({ json: { data: [
        {
          id: leagueId,
          name: 'Colchester & District League',
          season: '2026/27',
          divisions: [{ id: 'd1', name: 'Division 3' }],
        },
        {
          id: '10000000-0000-4000-8000-000000000002',
          name: 'Chelmsford Table Tennis League',
          season: '2026/27',
          divisions: [{ id: 'd2', name: 'Division 2' }],
        },
      ] } });
      return;
    }

    if (path.endsWith('/api/leagues/dashboard')) {
      await route.fulfill({ json: {
        totals: { leagues: 1, divisions: 5, teams: 34, matches_played: 820, upcoming_fixtures: 18 },
        upcoming_fixtures: [{
          fixture_id: 'fixture-rowhedge-pegasus',
          league_id: leagueId,
          league_name: 'Colchester & District League',
          competition_id: 'd1',
          division_name: 'Division 3',
          date_played: '2026-08-20',
          home_team_name: 'Rowhedge K',
          away_team_name: 'Pegasus E',
        }],
        recent_results: [{
          fixture_id: 'fixture-maldon-hutton',
          league_id: leagueId,
          league_name: 'Colchester & District League',
          competition_id: 'd1',
          division_name: 'Division 3',
          date_played: '2026-08-06',
          home_team_name: 'Maldon C',
          away_team_name: 'Hutton A',
          home_score: 4,
          away_score: 6,
        }],
        top_teams: [{
          team_id: 'team-rowhedge-k',
          team_name: 'Rowhedge K',
          league_id: leagueId,
          league_name: 'Colchester & District League',
          competition_id: 'd1',
          division_name: 'Division 3',
          position: 1,
          played: 12,
          won: 10,
          drawn: 1,
          lost: 1,
          points: 31,
          win_rate: 83,
        }],
      } });
      return;
    }

    if (path.endsWith('/api/events')) {
      await route.fulfill({ json: {
        data: [{
          id: 'event-essex-open',
          platform_id: 'sport80',
          source: 'sport80',
          external_id: 'essex-open-2026',
          name: 'Essex Junior 2★ Open',
          event_date: '2026-08-16',
          start_date: '2026-08-16',
          end_date: '2026-08-16',
          category: 'Junior',
          public_url: null,
          platform_name: 'Table Tennis England',
          match_count: 0,
          status: 'entries_open',
          venue_name: 'BATTS Table Tennis Club',
          venue_town: 'Harlow',
          venue_postcode: 'CM20 3AS',
          entry_deadline: '2026-08-12',
          entry_url: null,
          information_url: null,
          result_url: null,
          source_count: 1,
        }],
        total: 1,
        limit: 1,
        offset: 0,
        has_more: false,
      } });
      return;
    }

    if (path.endsWith('/api/ratings/league/risers')) {
      await route.fulfill({ json: {
        data: [{
          rank: 1,
          overall_rank: 164,
          player_id: leagueRatings[0].player_id,
          player_name: leagueRatings[0].player_name,
          rating_before: 2262,
          rating_after: 2365,
          change: 103,
          rating_deviation_after: 45,
          rated_matches: leagueRatings[0].rated_matches,
          baseline_date: '2026-06-27',
        }],
        total: 1,
        page: 1,
        page_size: 1,
        model: 'glicko2',
        league_ids: [leagueId],
        window_days: 42,
      } });
      return;
    }

    if (path.endsWith('/api/ratings/league')) {
      await route.fulfill({ json: {
        data: leagueRatings,
        total: leagueRatings.length,
        page: 1,
        page_size: 4,
        model: 'glicko2',
        league_ids: [leagueId],
      } });
      return;
    }

    if (path.endsWith('/api/ratings')) {
      await route.fulfill({ json: {
        data: globalRatings,
        pagination: { page: 1, page_size: 4, total: 200, total_pages: 50 },
        model: 'glicko2',
        processing: null,
      } });
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
        current_season_affiliations: [{
          team_id: 'team-rowhedge-k',
          team_name: 'Rowhedge K',
          league_id: leagueId,
          league_name: 'Colchester & District League',
          season_id: 'season-2026',
          season_name: '2026/27',
          competition_name: 'Division 3',
        }],
      } });
      return;
    }

    if (path.endsWith(`/api/ratings/${playerId}/history`)) {
      await route.fulfill({ json: {
        player_id: playerId,
        player_name: 'Wudong Liu',
        model: 'glicko2',
        range: '3m',
        data: [{
          week_start: '2026-08-03',
          snapshot_date: '2026-08-08',
          rating: 1912,
          rating_deviation: 45,
          conservative_rating: 1822,
          rating_low: 1812,
          rating_high: 2012,
          rating_change: 34,
          confidence: 'high',
          rated_matches: 76,
          rated_wins: 54,
          rated_losses: 22,
          week_matches: 4,
          week_wins: 3,
          week_losses: 1,
          provisional: false,
        }],
      } });
      return;
    }

    if (path.endsWith(`/api/ratings/${playerId}`)) {
      await route.fulfill({ json: { data: rating(playerId, 'Wudong Liu', 126, 1912, 72) } });
      return;
    }

    await route.fulfill({ json: { data: [] } });
  });
}

test.beforeAll(() => {
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(diagnosticsDir, { recursive: true });
});

test('reviews the adaptive hero, in-place claiming, and player ranking scopes', async ({ page }, testInfo) => {
  const previewUrl = requirePreviewUrl();
  await installState(page);
  await mockApi(page);

  await page.goto(`${previewUrl}/tabs/home`, { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: 'Make TT Players yours' })).toBeVisible();
  await expect(page.getByText('Personal dashboard', { exact: true })).toBeVisible();
  await expect(page.getByLabel('0 of 2 setup steps complete')).toBeVisible();
  await expect(page.getByText('Claim my player', { exact: true })).toBeVisible();
  await expect(page.getByText('Choose leagues', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Next up' })).toBeVisible();
  await expect(page.getByText('Essex Junior 2★ Open', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Top players' })).toBeVisible();
  await expect(page.getByText('Jane Smith', { exact: true })).toBeVisible();
  await expect(page.getByText('Alex Morgan', { exact: true })).toBeVisible();

  await capture(page, testInfo, 'home-new-user-hero', {
    adaptiveHeroState: 'setup',
    setupSteps: 2,
    upcomingTournament: true,
    globalRankingPreview: true,
  });

  await page.getByText('Claim my player', { exact: true }).click();
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
  await expect(page.getByRole('heading', { name: 'Wudong Liu' })).toBeVisible();
  await expect(page.getByText('1,912', { exact: true })).toBeVisible();
  await expect(page.getByText('#126', { exact: true })).toBeVisible();
  await expect(page.getByText('18–7', { exact: true })).toBeVisible();
  await expect(page.getByText('Latest rating move +34', { exact: true })).toBeVisible();
  await expect(page.getByText('Choose leagues to personalise fixtures, results and rankings.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your TT' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Make Home yours' })).toHaveCount(0);
  await expect(page.getByText('Claim my player', { exact: true })).toHaveCount(0);
  await capture(page, testInfo, 'home-claimed-hero-needs-leagues', {
    adaptiveHeroState: 'claimed-needs-leagues',
    drawerClosed: true,
    ratingMovement: 34,
    leagueSetupStillVisible: true,
  });

  await page.evaluate(() => sessionStorage.setItem('tt_review_home_configured', 'true'));
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: 'Wudong Liu' })).toBeVisible();
  await expect(page.getByText('Rowhedge K · Colchester & District League', { exact: true })).toBeVisible();
  await expect(page.getByText('Personalised to your leagues', { exact: true })).toBeVisible();
  await expect(page.getByText('Latest rating move +34', { exact: true })).toBeVisible();
  await capture(page, testInfo, 'home-configured-personal-hero', {
    adaptiveHeroState: 'configured',
    rating: 1912,
    globalRank: 126,
    ratingMovement: 34,
  });

  await expect(page.getByRole('heading', { name: 'Highlights' })).toBeVisible();
  await expect(page.getByText('Harrison Hill is moving up', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Top players' })).toBeVisible();
  const leagueScope = page.getByRole('radio', { name: 'Your leagues' });
  const globalScope = page.getByRole('radio', { name: 'Global' });
  await expect(leagueScope).toBeChecked();
  await expect(page.getByText('Harrison Hill', { exact: true })).toBeVisible();
  await expect(page.getByText('Sophie Carter', { exact: true })).toBeVisible();
  await page.getByRole('heading', { name: 'Top players' }).scrollIntoViewIfNeeded();
  await capture(page, testInfo, 'home-top-players-your-leagues', {
    defaultScope: 'selected',
    rows: 4,
    duplicateTopRatedHighlightRemoved: true,
  });

  await globalScope.click();
  await expect(globalScope).toBeChecked();
  await expect(page.getByText('Jane Smith', { exact: true })).toBeVisible();
  await expect(page.getByText('Harrison Hill', { exact: true })).toHaveCount(0);
  await capture(page, testInfo, 'home-top-players-global', {
    switchedScope: 'site',
    rows: 4,
  });

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  writeReportIndex(previewUrl);
});