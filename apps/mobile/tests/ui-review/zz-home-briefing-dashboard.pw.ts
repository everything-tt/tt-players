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
const selectedLeagueIds = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
];

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
<title>TT Players Home Briefing Review</title><style>
body{margin:0;font-family:system-ui,sans-serif;background:#f7f8f7;color:#17211d}main{max-width:1100px;margin:0 auto;padding:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}article{background:#fff;border:1px solid #d9dfda;border-radius:10px;padding:14px}img{width:100%;height:auto;border:1px solid #d9dfda;border-radius:8px;display:block}a{color:#0f6655}
</style></head><body><main><h1>TT Players Home Briefing Review</h1><p>Preview: <a href="${escapeHtml(previewUrl)}">${escapeHtml(previewUrl)}</a></p><div class="grid">${cards}</div></main></body></html>\n`);
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
  await page.addInitScript(({ ids, claimedPlayerId }) => {
    localStorage.setItem('tt_players_league_onboarding_complete', 'true');
    localStorage.setItem('tt_players_selected_league_ids', JSON.stringify(ids));
    localStorage.setItem('tt_players_my_player', JSON.stringify({ id: claimedPlayerId, name: 'Wudong Liu' }));
    localStorage.setItem('TTPlayers-Theme', 'light-mode');
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  }, { ids: selectedLeagueIds, claimedPlayerId: playerId });
}

function establishedRating(overrides: Record<string, unknown>) {
  return {
    rank: 1,
    player_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    player_name: 'Alex Morgan',
    rating: 2018,
    rating_deviation: 48,
    volatility: 0.06,
    conservative_rating: 1922,
    rating_low: 1900,
    rating_high: 2136,
    confidence: 'high',
    rated_matches: 64,
    rated_wins: 43,
    rated_losses: 21,
    win_rate: 67,
    provisional: false,
    first_rated_at: '2025-01-01',
    last_rated_at: '2026-08-05',
    overall_rank: 18,
    ...overrides,
  };
}

async function mockApi(page: Page) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith('/api/leagues')) {
      await route.fulfill({ json: { data: [
        { id: selectedLeagueIds[0], name: 'Colchester & District League', season: '2026/27', divisions: [{ id: 'd1', name: 'Division 3' }] },
        { id: selectedLeagueIds[1], name: 'Chelmsford Table Tennis League', season: '2026/27', divisions: [{ id: 'd2', name: 'Division 2' }] },
        { id: '10000000-0000-4000-8000-000000000003', name: 'Brentwood Table Tennis League', season: '2026/27', divisions: [{ id: 'd3', name: 'Division 1' }] },
      ] } });
      return;
    }

    if (path.endsWith('/api/leagues/dashboard')) {
      await route.fulfill({ json: {
        totals: { leagues: 2, divisions: 2, teams: 22, matches_played: 184, upcoming_fixtures: 9 },
        upcoming_fixtures: [
          {
            fixture_id: 'f-unrelated',
            league_id: selectedLeagueIds[1],
            league_name: 'Chelmsford Table Tennis League',
            competition_id: 'd2',
            division_name: 'Division 2',
            date_played: '2026-08-10',
            home_team_name: 'Danbury B',
            away_team_name: 'Chelmsford C',
          },
          {
            fixture_id: 'f-personal',
            league_id: selectedLeagueIds[0],
            league_name: 'Colchester & District League',
            competition_id: 'd1',
            division_name: 'Division 3',
            date_played: '2026-08-12',
            home_team_name: 'Rowhedge K',
            away_team_name: 'Pegasus E',
          },
        ],
        recent_results: [{
          fixture_id: 'f-result',
          league_id: selectedLeagueIds[0],
          league_name: 'Colchester & District League',
          competition_id: 'd1',
          division_name: 'Division 3',
          date_played: '2026-08-07',
          home_team_name: 'Rowhedge K',
          away_team_name: 'Halstead A',
          home_score: 7,
          away_score: 3,
        }],
        top_teams: [{
          team_id: 'team-rowhedge',
          team_name: 'Rowhedge K',
          league_id: selectedLeagueIds[0],
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
          team_id: 'team-rowhedge',
          team_name: 'Rowhedge K',
          league_id: selectedLeagueIds[0],
          league_name: 'Colchester & District League',
          season_id: 'season-2026',
          competition_name: 'Division 3',
          season_name: '2026/27',
        }],
      } });
      return;
    }

    if (path.endsWith(`/api/ratings/${playerId}`)) {
      await route.fulfill({ json: { data: establishedRating({
        player_id: playerId,
        player_name: 'Wudong Liu',
        rating: 1742,
        overall_rank: 126,
      }) } });
      return;
    }

    if (path.endsWith('/api/ratings/league/risers')) {
      await route.fulfill({ json: {
        data: [{
          rank: 1,
          overall_rank: 42,
          player_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          player_name: 'Sarah Jones',
          rating_before: 1638,
          rating_after: 1722,
          change: 84,
          rating_deviation_after: 61,
          rated_matches: 31,
          baseline_date: '2026-06-27',
        }],
        total: 1,
        page: 1,
        page_size: 1,
        model: 'glicko2',
        league_ids: selectedLeagueIds,
        window_days: 42,
      } });
      return;
    }

    if (path.endsWith('/api/ratings/league')) {
      await route.fulfill({ json: {
        data: [establishedRating({ player_name: 'Jane Smith', rating: 2114, overall_rank: 7 })],
        total: 1,
        page: 1,
        page_size: 1,
        model: 'glicko2',
        league_ids: selectedLeagueIds,
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

    await route.fulfill({ json: { data: [] } });
  });
}

test.beforeAll(() => {
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(diagnosticsDir, { recursive: true });
});

test('reviews Home as a concise cross-page briefing', async ({ page }, testInfo) => {
  const previewUrl = requirePreviewUrl();
  await installState(page);
  await mockApi(page);

  await page.goto(`${previewUrl}/tabs/home`, { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: 'Your TT' })).toBeVisible();
  await expect(page.getByText('Wudong Liu', { exact: true })).toBeVisible();
  await expect(page.getByText(/18W · 7L · 25 played · Rating 1,742/)).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Next up' })).toBeVisible();
  await expect(page.getByText('Rowhedge K vs Pegasus E', { exact: true })).toBeVisible();
  await expect(page.getByText('Your team', { exact: true })).toBeVisible();
  await expect(page.getByText('Essex Junior 2★ Open', { exact: true })).toBeVisible();
  await expect(page.getByText('Entries open', { exact: true })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Top Rated Players' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Latest results' })).toHaveCount(0);
  await expect(page.getByText('Players to watch', { exact: true })).toHaveCount(0);

  await expect(page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).resolves.toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, testInfo, 'home-briefing-top', {
    personalSnapshot: true,
    personalFixturePrioritised: true,
    tournamentPreview: true,
  });

  const highlightsHeading = page.getByRole('heading', { name: 'Highlights' });
  await highlightsHeading.scrollIntoViewIfNeeded();
  await expect(page.getByText('Sarah Jones is moving up', { exact: true })).toBeVisible();
  await expect(page.getByText('Top rated · Jane Smith', { exact: true })).toBeVisible();
  await expect(page.getByText('Rowhedge K vs Halstead A', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /View leagues/ })).toBeVisible();
  await capture(page, testInfo, 'home-briefing-highlights', {
    highlightCount: 3,
    noEmbeddedFilters: true,
  });

  writeReportIndex(previewUrl);
});
