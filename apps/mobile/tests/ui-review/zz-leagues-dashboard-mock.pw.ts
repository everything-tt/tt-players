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
const playerName = 'Wudong Liu';
const leagueIds = Array.from({ length: 12 }, (_, index) => {
  const suffix = String(index + 1).padStart(12, '0');
  return `10000000-0000-4000-8000-${suffix}`;
});
const teamIds = Array.from({ length: 8 }, (_, index) => {
  const suffix = String(index + 1).padStart(12, '0');
  return `20000000-0000-4000-8000-${suffix}`;
});

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
<title>TT Players UI Review</title><style>
body{margin:0;font-family:system-ui,sans-serif;background:#f7f8f7;color:#17211d}main{max-width:1100px;margin:0 auto;padding:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}article{background:#fff;border:1px solid #d9dfda;border-radius:10px;padding:14px}img{width:100%;height:auto;border:1px solid #d9dfda;border-radius:8px;display:block}a{color:#0f6655}
</style></head><body><main><h1>TT Players UI Review</h1><p>Preview: <a href="${escapeHtml(previewUrl)}">${escapeHtml(previewUrl)}</a></p><div class="grid">${cards}</div></main></body></html>\n`);
}

async function capture(page: Page, testInfo: TestInfo, title: string, diagnostics: unknown) {
  await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; caret-color: transparent !important; }' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  const screenshotPath = `screenshots/${testInfo.project.name}-${title}.png`;
  const diagnosticsPath = `diagnostics/${testInfo.project.name}-${title}.json`;
  await page.screenshot({ path: join(reportDir, screenshotPath), fullPage: false, timeout: 15_000 });
  writeFileSync(join(reportDir, diagnosticsPath), `${JSON.stringify({ route: page.url(), diagnostics }, null, 2)}\n`);
  appendManifest({ project: testInfo.project.name, title, url: page.url(), path: screenshotPath, diagnosticsPath });
}

function uuid(prefix: string, index: number): string {
  return `${prefix}00-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function leagueList() {
  const names = [
    'Colchester & District League',
    'Chelmsford Table Tennis League',
    'Brentwood Table Tennis League',
    'Clacton & District League',
    'Braintree Table Tennis League',
    'Basildon Table Tennis League',
    'Southend Table Tennis League',
    'Romford Table Tennis League',
    'Maldon Table Tennis League',
    'Harlow Table Tennis League',
    'Thurrock Table Tennis League',
    'Essex Central League',
  ];
  return names.map((name, index) => ({
    id: leagueIds[index],
    name,
    platform: 'TT365',
    season_id: uuid('300000', index + 1),
    season: '2024 / 25',
    regions: [],
    divisions: Array.from({ length: index === 0 ? 5 : 3 }, (_, division) => ({
      id: uuid('400000', index * 10 + division + 1),
      name: `Division ${division + 1}`,
    })),
  }));
}

async function installState(page: Page) {
  await page.addInitScript(({ ids, claimedPlayer }) => {
    localStorage.setItem('tt_players_league_onboarding_complete', 'true');
    localStorage.setItem('tt_players_selected_league_ids', JSON.stringify(ids));
    localStorage.setItem('tt_players_my_player', JSON.stringify(claimedPlayer));
    localStorage.setItem('tt_players_favourite_teams', JSON.stringify([{
      id: '20000000-0000-4000-8000-000000000002',
      name: 'Battsbury B',
      leagueName: 'Colchester & District League',
      divisionName: 'Division 2',
    }]));
    localStorage.setItem('TTPlayers-Theme', 'light-mode');
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  }, { ids: leagueIds, claimedPlayer: { id: playerId, name: playerName } });
}

async function mockApi(page: Page) {
  const leagues = leagueList();
  const overview = leagues.map((league, index) => ({
    id: league.id,
    name: league.name,
    season_id: league.season_id,
    season: league.season,
    divisions: league.divisions.length,
    teams: index === 0 ? 34 : 18 + index,
    matches_played: 180 + index * 11,
    upcoming_fixtures: index === 0 ? 8 : Math.max(1, 5 - index),
    last_scraped_at: '2026-08-04T07:30:00.000Z',
    status: 'in_progress',
  }));
  const upcoming = [
    ['2026-08-17', 'Rowhedge K', 'Pegasus E', 'Division 3'],
    ['2026-08-18', 'Battsbury B', 'Wivenhoe C', 'Division 2'],
    ['2026-08-24', 'Rowhedge K', 'Halstead A', 'Division 3'],
    ['2026-08-26', 'Chelmsford A', 'Danbury C', 'Division 1'],
    ['2026-08-28', 'Brentwood B', 'Hutton A', 'Division 2'],
  ].map(([date, home, away, division], index) => ({
    fixture_id: uuid('500000', index + 1),
    league_id: index < 3 ? leagueIds[0] : leagueIds[index - 2],
    league_name: index < 3 ? leagues[0].name : leagues[index - 2].name,
    competition_id: uuid('400000', index + 1),
    division_name: division,
    date_played: date,
    home_team_name: home,
    away_team_name: away,
  }));
  const recent = [
    ['2026-08-10', 'Rowhedge K', 'Halstead A', 6, 4, 'Division 3'],
    ['2026-08-08', 'Pegasus E', 'Rowhedge K', 3, 7, 'Division 3'],
    ['2026-08-07', 'Battsbury B', 'Wivenhoe C', 5, 5, 'Division 2'],
    ['2026-08-05', 'Chelmsford A', 'Danbury C', 8, 2, 'Division 1'],
  ].map(([date, home, away, homeScore, awayScore, division], index) => ({
    fixture_id: uuid('600000', index + 1),
    league_id: leagueIds[0],
    league_name: leagues[0].name,
    competition_id: uuid('400000', index + 1),
    division_name: division,
    date_played: date,
    home_team_name: home,
    away_team_name: away,
    home_score: homeScore,
    away_score: awayScore,
  }));
  const leaders = [
    ['70000000-0000-4000-8000-000000000001', 'Gary Stallwood', 43, 43, 0, 100, 99],
    ['70000000-0000-4000-8000-000000000002', 'Prateek B. Godse', 42, 42, 0, 100, 98],
    ['70000000-0000-4000-8000-000000000003', 'Mitchell Jones', 41, 41, 0, 100, 97],
    [playerId, playerName, 12, 8, 4, 67, 74],
    ['70000000-0000-4000-8000-000000000005', 'Helen Taylor', 28, 21, 7, 75, 72],
    ['70000000-0000-4000-8000-000000000006', 'Rik James', 30, 22, 8, 73, 70],
  ].map(([id, name, played, wins, losses, winRate, score], index) => ({
    rank: index === 3 ? 27 : index + 1,
    player_id: id,
    player_name: name,
    played,
    wins,
    losses,
    win_rate: winRate,
    score,
    first_match_date: '2024-09-01',
  }));
  const topTeams = ['Rowhedge K', 'Battsbury B', 'Chelmsford A', 'Brentwood B', 'Wivenhoe C'].map((name, index) => ({
    team_id: teamIds[index],
    team_name: name,
    league_id: leagueIds[index === 0 ? 0 : Math.min(index, leagueIds.length - 1)],
    league_name: leagues[index === 0 ? 0 : Math.min(index, leagues.length - 1)].name,
    competition_id: uuid('400000', index + 1),
    division_name: `Division ${index % 3 + 1}`,
    position: index + 1,
    played: 12,
    won: 10 - index,
    drawn: index % 2,
    lost: 2 + index,
    points: 30 - index * 2,
    win_rate: 83 - index * 5,
  }));

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/api/leagues')) {
      await route.fulfill({ json: { data: leagues } });
      return;
    }
    if (url.pathname.endsWith('/api/leagues/overview')) {
      await route.fulfill({ json: { data: overview } });
      return;
    }
    if (url.pathname.endsWith('/api/leagues/dashboard')) {
      await route.fulfill({
        json: {
          totals: { leagues: 12, divisions: 40, teams: 355, matches_played: 2910, upcoming_fixtures: 116 },
          recent_results: recent,
          upcoming_fixtures: upcoming,
          top_teams: topTeams,
        },
      });
      return;
    }
    if (url.pathname.endsWith(`/api/players/${playerId}/profile-overview`)) {
      await route.fulfill({
        json: {
          player_id: playerId,
          player_name: playerName,
          wins: 8,
          losses: 4,
          total: 12,
          form: {
            rolling_10_win_rate: 70,
            rolling_20_win_rate: 67,
            momentum: 'hot',
            recent_results: ['W', 'W', 'L', 'W', 'W', 'W'],
          },
          current_season_affiliations: [{
            team_id: teamIds[0],
            team_name: 'Rowhedge K',
            league_id: leagueIds[0],
            league_name: leagues[0].name,
            season_id: leagues[0].season_id,
            season_name: '2024 / 25',
            competition_name: 'Division 3',
          }],
        },
      });
      return;
    }
    if (url.pathname.endsWith('/api/players/leaders')) {
      await route.fulfill({
        json: {
          mode: url.searchParams.get('mode') ?? 'combined',
          formula: 'review fixture',
          min_played: Number(url.searchParams.get('min_played') ?? 3),
          data: leaders,
        },
      });
      return;
    }
    await route.fulfill({ json: { data: [] } });
  });
}

test.beforeAll(() => {
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(diagnosticsDir, { recursive: true });
});

test.afterAll(() => {
  writeReportIndex(requirePreviewUrl());
});

test('reviews the mock-faithful personalised leagues dashboard', async ({ page }, testInfo) => {
  const previewUrl = requirePreviewUrl();
  await installState(page);
  await mockApi(page);

  await page.goto(`${previewUrl}/tabs/leagues`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Your leagues' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /manage leagues/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your season' })).toBeVisible();
  await expect(page.getByText(playerName, { exact: true })).toBeVisible();
  await expect(page.getByText('Rowhedge K · Division 3', { exact: true })).toBeVisible();
  await expect(page.getByText('Rowhedge K vs Pegasus E', { exact: true }).first()).toBeVisible();

  const heroMetrics = page.locator('.tt-leagues-dashboard-hero .tt-metric');
  await expect(heroMetrics).toHaveCount(4);
  const metricTops = await heroMetrics.evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().top)));
  expect(new Set(metricTops).size).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);

  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, testInfo, 'leagues-dashboard-personal-top', {
    heroMetrics: 4,
    claimedPlayer: playerName,
    upcomingPrioritised: true,
  });

  const pulseHeading = page.getByRole('heading', { name: 'League pulse' });
  await pulseHeading.scrollIntoViewIfNeeded();
  await expect(page.getByText('You', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('You play here', { exact: true })).toBeVisible();
  await capture(page, testInfo, 'leagues-dashboard-pulse-and-leagues', {
    personalRank: 27,
    selectedLeaguePromoted: true,
  });
});
