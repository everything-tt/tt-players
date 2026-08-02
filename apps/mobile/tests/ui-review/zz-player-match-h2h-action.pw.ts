import { expect, test } from '@playwright/test';
import type { Locator, Page, TestInfo } from '@playwright/test';
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

interface PlayerRubber {
  fixture_id: string;
  opponent: string;
  opponent_id: string | null;
  source: 'league' | 'tournament';
  event_id: string | null;
}

interface PlayerRubbersResponse {
  data: PlayerRubber[];
}

interface H2HResponse {
  player1_wins: number;
  player2_wins: number;
  encounters: unknown[];
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

async function loadRubbers(page: Page, previewUrl: string, playerId: string) {
  const params = new URLSearchParams({ limit: '100', offset: '0', source: 'all' });
  const response = await page.request.get(`${previewUrl}/api/players/${playerId}/rubbers?${params.toString()}`);
  expect(response.ok()).toBe(true);
  return response.json() as Promise<PlayerRubbersResponse>;
}

async function findMatchWithDirectH2H(
  page: Page,
  previewUrl: string,
  playerId: string,
  matches: PlayerRubber[],
): Promise<{ match: PlayerRubber; h2h: H2HResponse }> {
  const checked = new Set<string>();
  for (const match of matches) {
    const opponentId = match.opponent_id;
    const hasDestination = match.source === 'tournament' ? Boolean(match.event_id) : Boolean(match.fixture_id);
    if (!opponentId || !hasDestination || checked.has(opponentId)) continue;
    checked.add(opponentId);

    const response = await page.request.get(`${previewUrl}/api/players/${playerId}/h2h/${opponentId}`);
    if (!response.ok()) continue;
    const h2h = await response.json() as H2HResponse;
    if (h2h.encounters.length > 0) return { match, h2h };
    if (checked.size >= 20) break;
  }

  throw new Error('No match row with a verified direct H2H record was available for UI review.');
}

function recentMatchesSection(page: Page) {
  return page.locator('section.tt-player-section').filter({
    has: page.getByRole('heading', { name: 'Recent Matches' }),
  });
}

async function openPlayer(page: Page, previewUrl: string, playerId: string, opponentName: string) {
  await page.goto(`${previewUrl}/tabs/players/player/${playerId}`, { waitUntil: 'domcontentloaded' });
  const section = recentMatchesSection(page);
  await expect(section).toBeVisible({ timeout: 30_000 });
  await section.scrollIntoViewIfNeeded();
  const row = section.locator('.tt-player-match-row').filter({ hasText: opponentName }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  return row;
}

async function assertComfortableActions(row: Locator) {
  const layout = await row.evaluate((element) => {
    const rowRect = element.getBoundingClientRect();
    const titleRect = element.querySelector<HTMLElement>('.tt-list-item__title-action')?.getBoundingClientRect();
    const buttons = Array.from(element.querySelectorAll<HTMLElement>('.tt-match-record-action'))
      .map((button) => button.getBoundingClientRect());
    return {
      rowRight: rowRect.right,
      titleRight: titleRect?.right ?? 0,
      actionsLeft: buttons[0]?.left ?? rowRect.right,
      buttons: buttons.map((button) => ({ width: button.width, height: button.height, right: button.right })),
    };
  });

  expect(layout.titleRight).toBeLessThanOrEqual(layout.actionsLeft + 1);
  for (const button of layout.buttons) {
    expect(button.width).toBeGreaterThanOrEqual(36);
    expect(button.height).toBeGreaterThanOrEqual(36);
    expect(button.right).toBeLessThanOrEqual(layout.rowRight + 1);
  }
}

test.beforeAll(() => {
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(diagnosticsDir, { recursive: true });
});

test('reviews direct match, opponent, journal and H2H actions', async ({ page }, testInfo) => {
  const previewUrl = requirePreviewUrl();
  await prepareAppState(page);
  const player = await findPlayer(page, previewUrl);
  const rubbers = await loadRubbers(page, previewUrl, player.id);
  const { match, h2h: verifiedH2H } = await findMatchWithDirectH2H(
    page,
    previewUrl,
    player.id,
    rubbers.data,
  );

  const opponentId = match.opponent_id!;
  const opponentName = match.opponent;
  const destination = match.source === 'tournament' && match.event_id ? 'event' : 'fixture';
  const primaryLabel = `View ${destination} for match against ${opponentName}`;
  const profileLabel = `Open ${opponentName} profile`;
  const h2hLabel = `Open head to head with ${opponentName}`;

  await page.goto(`${previewUrl}/tabs/home`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ id, name }) => {
    localStorage.setItem('tt_players_my_player', JSON.stringify({ id, name }));
  }, player);

  let row = await openPlayer(page, previewUrl, player.id, opponentName);
  await expect(row.getByRole('button', { name: primaryLabel })).toBeVisible();
  await expect(row.getByRole('button', { name: profileLabel })).toBeVisible();
  await expect(row.getByRole('button', { name: `Journal match against ${opponentName}` })).toBeVisible();
  await expect(row.getByRole('button', { name: h2hLabel })).toBeVisible();
  await expect(row.locator('.tt-match-record-action')).toHaveCount(2);
  await expect(row.locator('.fa-calendar')).toHaveCount(0);
  await expect(row.locator('.fa-ellipsis-v')).toHaveCount(0);
  await assertComfortableActions(row);
  await capture(page, testInfo, 'player-match-direct-actions');

  await row.getByRole('button', { name: profileLabel }).click();
  await expect(page).toHaveURL(new RegExp(`/tabs/players/player/${opponentId}(?:$|[/?#])`));

  row = await openPlayer(page, previewUrl, player.id, opponentName);
  await row.getByRole('button', { name: primaryLabel }).click();
  const expectedMatchPath = match.source === 'tournament' && match.event_id
    ? `/tabs/players/event/${match.event_id}`
    : `/tabs/leagues/fixture/${match.fixture_id}`;
  await expect(page).toHaveURL(new RegExp(`${expectedMatchPath}(?:$|[/?#])`));

  row = await openPlayer(page, previewUrl, player.id, opponentName);
  const h2hResponsePromise = page.waitForResponse((response) => (
    new URL(response.url()).pathname.endsWith(`/api/players/${player.id}/h2h/${opponentId}`)
      && response.status() === 200
  ));
  await row.getByRole('button', { name: h2hLabel }).click();
  await expect(page).toHaveURL(new RegExp(`/tabs/h2h/h2h/${player.id}/${opponentId}(?:$|[/?#])`));
  const h2hResponse = await h2hResponsePromise;
  const directH2H = await h2hResponse.json() as H2HResponse;
  expect(directH2H.encounters.length).toBe(verifiedH2H.encounters.length);
  expect(directH2H.encounters.length).toBeGreaterThan(0);
  await expect(page.getByText(`${directH2H.encounters.length} meetings`, { exact: true }).first())
    .toBeVisible({ timeout: 30_000 });
  await capture(page, testInfo, 'direct-h2h-destination');

  await page.goto(`${previewUrl}/tabs/home`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.removeItem('tt_players_my_player'));
  row = await openPlayer(page, previewUrl, player.id, opponentName);
  await expect(row.getByRole('button', { name: /Journal match against/ })).toHaveCount(0);
  await expect(row.getByRole('button', { name: h2hLabel })).toBeVisible();
  await expect(row.locator('.tt-match-record-action')).toHaveCount(1);
  await assertComfortableActions(row);
  await capture(page, testInfo, 'other-player-h2h-action');

  writeReportIndex(previewUrl);
});
