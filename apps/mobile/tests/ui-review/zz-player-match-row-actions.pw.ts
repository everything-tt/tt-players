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

interface H2HResponse {
  encounters: unknown[];
}

interface LeaguesResponse {
  data: Array<{ id: string }>;
}

interface LeagueResult {
  fixture_id: string;
  home_team_id: string | null;
  away_team_id: string | null;
}

interface LeagueDashboardResponse {
  recent_results: LeagueResult[];
}

interface EventsResponse {
  data: Array<{ id: string; match_count: number }>;
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

async function searchPlayers(page: Page, previewUrl: string, query: string) {
  const params = new URLSearchParams({ q: query, limit: '10', offset: '0' });
  const response = await page.request.get(`${previewUrl}/api/players/search?${params.toString()}`);
  expect(response.ok()).toBe(true);
  return response.json() as Promise<PlayerSearchResponse>;
}

async function findPlayer(page: Page, previewUrl: string) {
  const payload = await searchPlayers(page, previewUrl, 'Wudong Liu');
  const player = payload.data.find((item) => item.name === 'Wudong Liu') ?? payload.data[0];
  expect(player).toBeTruthy();
  return player!;
}

async function findH2HOpponent(
  page: Page,
  previewUrl: string,
  playerId: string,
  opponentNames: string[],
) {
  const uniqueNames = Array.from(new Set(opponentNames)).slice(0, 12);
  for (const opponentName of uniqueNames) {
    const search = await searchPlayers(page, previewUrl, opponentName);
    const candidates = [...search.data].sort((a, b) => (
      Number(b.name.toLowerCase() === opponentName.toLowerCase())
      - Number(a.name.toLowerCase() === opponentName.toLowerCase())
    ));
    for (const candidate of candidates) {
      if (candidate.id === playerId) continue;
      const response = await page.request.get(`${previewUrl}/api/players/${playerId}/h2h/${candidate.id}`);
      if (!response.ok()) continue;
      const h2h = await response.json() as H2HResponse;
      if (h2h.encounters.length > 0) return candidate;
    }
  }
  throw new Error('No canonical opponent with direct meetings was available for H2H UI review.');
}

async function findLeagueWithResult(page: Page, previewUrl: string, leagueIds: string[]) {
  for (const leagueId of leagueIds) {
    const response = await page.request.get(`${previewUrl}/api/leagues/${leagueId}/dashboard`);
    if (!response.ok()) continue;
    const dashboard = await response.json() as LeagueDashboardResponse;
    const result = dashboard.recent_results.find((item) => item.home_team_id || item.away_team_id);
    if (result) return { leagueId, result };
  }
  throw new Error('No league with a recent result and team id was available for UI review.');
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

function sectionWithHeading(page: Page, name: string) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name }) }).first();
}

async function assertScoreLedRow(row: ReturnType<Page['locator']>) {
  await expect(row).toBeVisible({ timeout: 30_000 });
  const score = row.locator('.tt-match-record-score');
  await expect(score).toBeVisible();
  await expect(score).toHaveText(/^(?:\d+–\d+|W|L|D|—)$/);
  await expect(row.locator('.tt-outcome-badge')).toHaveCount(0);
}

test.beforeAll(() => {
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(diagnosticsDir, { recursive: true });
});

test('reviews score-led match records across the app', async ({ page }, testInfo) => {
  const previewUrl = requirePreviewUrl();
  await prepareAppState(page);
  const player = await findPlayer(page, previewUrl);

  await page.goto(`${previewUrl}/tabs/home`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ id, name }) => {
    localStorage.setItem('tt_players_my_player', JSON.stringify({ id, name }));
  }, player);

  const rubbers = await openPlayer(page, previewUrl, player.id);
  const firstMatch = rubbers.data.find((match) => Boolean(match.opponent_id));
  expect(firstMatch?.opponent_id).toBeTruthy();

  const ownSection = recentMatchesSection(page);
  await ownSection.scrollIntoViewIfNeeded();
  const firstRow = ownSection.locator('.tt-player-match-row').first();
  await assertScoreLedRow(firstRow);
  await expect(firstRow.locator('.tt-player-match-date')).toHaveCount(0);
  await expect(firstRow.locator('.tt-player-match-meta')).toHaveCount(0);
  await expect(firstRow.locator('.tt-player-match-date-inline__year')).toHaveText(/^\d{4}$/);
  await expect(firstRow.getByRole('button', { name: /Journal match against/ })).toBeVisible();
  await expect(firstRow.getByRole('button', { name: /View (?:fixture|event) for match against/ })).toBeVisible();
  await expect(firstRow.getByRole('button', { name: /Match actions for/ })).toHaveCount(0);

  const fontSizes = await firstRow.evaluate((row) => {
    const date = row.querySelector<HTMLElement>('.tt-player-match-date-inline');
    const year = row.querySelector<HTMLElement>('.tt-player-match-date-inline__year');
    return {
      date: date ? Number.parseFloat(getComputedStyle(date).fontSize) : 0,
      year: year ? Number.parseFloat(getComputedStyle(year).fontSize) : 0,
    };
  });
  expect(fontSizes.year).toBeGreaterThan(0);
  expect(fontSizes.year).toBeLessThan(fontSizes.date);
  await capture(page, testInfo, 'my-player-score-actions');

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
  await assertScoreLedRow(otherFirstRow);
  await expect(otherFirstRow.getByRole('button', { name: /Journal match against/ })).toHaveCount(0);
  await expect(otherFirstRow.getByRole('button', { name: /View (?:fixture|event) for match against/ })).toBeVisible();
  await capture(page, testInfo, 'other-player-score-action');

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

  const leaguesResponse = await page.request.get(`${previewUrl}/api/leagues`);
  expect(leaguesResponse.ok()).toBe(true);
  const leagues = await leaguesResponse.json() as LeaguesResponse;
  const leagueIds = leagues.data.map((league) => league.id);
  expect(leagueIds.length).toBeGreaterThan(0);
  const scopedLeague = await findLeagueWithResult(page, previewUrl, leagueIds);

  await page.goto(`${previewUrl}/tabs/home`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((leagueId) => {
    localStorage.setItem('tt_players_selected_league_ids', JSON.stringify([leagueId]));
  }, scopedLeague.leagueId);
  const homeDashboardResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/api/leagues/dashboard')
      && url.searchParams.get('league_ids') === scopedLeague.leagueId
      && response.status() === 200;
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await homeDashboardResponse;
  const latestResults = sectionWithHeading(page, 'Latest results');
  await latestResults.scrollIntoViewIfNeeded();
  await assertScoreLedRow(latestResults.locator('.tt-match-record-row').first());
  await capture(page, testInfo, 'home-latest-results');

  const teamId = scopedLeague.result.home_team_id ?? scopedLeague.result.away_team_id;
  expect(teamId).toBeTruthy();
  const teamFixturesResponse = page.waitForResponse((response) => (
    new URL(response.url()).pathname.endsWith(`/api/teams/${teamId}/fixtures`)
      && response.status() === 200
  ));
  await page.goto(`${previewUrl}/tabs/leagues/team/${teamId}`, { waitUntil: 'domcontentloaded' });
  await teamFixturesResponse;
  const teamMatches = sectionWithHeading(page, 'Matches');
  await teamMatches.scrollIntoViewIfNeeded();
  await assertScoreLedRow(teamMatches.locator('.tt-match-record-row').first());
  await capture(page, testInfo, 'team-completed-results');

  const h2hOpponent = await findH2HOpponent(
    page,
    previewUrl,
    player.id,
    rubbers.data.map((match) => match.opponent),
  );
  const h2hResponse = page.waitForResponse((response) => (
    new URL(response.url()).pathname.endsWith(`/api/players/${player.id}/h2h/${h2hOpponent.id}`)
      && response.status() === 200
  ));
  await page.goto(`${previewUrl}/h2h/${player.id}/${h2hOpponent.id}`, { waitUntil: 'domcontentloaded' });
  await h2hResponse;
  const meetingHistory = sectionWithHeading(page, 'Meeting history');
  await meetingHistory.scrollIntoViewIfNeeded();
  await assertScoreLedRow(meetingHistory.locator('.tt-match-record-row').first());
  await capture(page, testInfo, 'h2h-meeting-history');

  const eventsResponse = await page.request.get(`${previewUrl}/api/events?status=completed&limit=20&offset=0`);
  expect(eventsResponse.ok()).toBe(true);
  const events = await eventsResponse.json() as EventsResponse;
  const event = events.data.find((item) => item.match_count > 0);
  expect(event).toBeTruthy();

  const eventDetailResponse = page.waitForResponse((response) => (
    new URL(response.url()).pathname.endsWith(`/api/events/${event!.id}`)
      && response.status() === 200
  ));
  await page.goto(`${previewUrl}/tabs/events/event/${event!.id}`, { waitUntil: 'domcontentloaded' });
  await eventDetailResponse;
  const tournamentResults = sectionWithHeading(page, 'Results');
  await tournamentResults.scrollIntoViewIfNeeded();
  await assertScoreLedRow(tournamentResults.locator('.tt-match-record-row').first());
  await capture(page, testInfo, 'tournament-results');

  writeReportIndex(previewUrl);
});
