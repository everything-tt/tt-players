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

const calculationAudit = {
  run: {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    model_key: 'global-singles-glicko2-v1',
    model_version: 'v1',
    started_at: '2026-08-06T11:00:00.000Z',
    completed_at: '2026-08-06T11:03:00.000Z',
    source_data_cutoff: '2026-08-05',
    code_commit_sha: 'abc123def456',
    algorithm_parameters: {
      initialRating: 1500,
      initialDeviation: 350,
      initialVolatility: 0.06,
      tau: 0.5,
      rankingPenalty: 2,
    },
    input_hash: 'f00baa',
    run_status: 'complete',
    processed_periods: 412,
    processed_matches: 12480,
    failure_message: null,
  },
  summary: {
    included_matches: 12382,
    excluded_matches: 98,
    players: 1842,
    provisional_players: 238,
    exclusions_by_reason: [
      { reason: 'walkover', matches: 42 },
      { reason: 'doubles', matches: 31 },
      { reason: 'missing_identity', matches: 25 },
    ],
  },
  movers: {
    increases: [
      { player_id: '11111111-1111-4111-8111-111111111111', player_name: 'Fast Newcomer', change: 118.4, rating_before: 1500, rating_after: 1618.4, rating_deviation_after: 226.2, public_rank_after: 412 },
      { player_id: '22222222-2222-4222-8222-222222222222', player_name: 'Rising Player', change: 47.2, rating_before: 1680, rating_after: 1727.2, rating_deviation_after: 91.4, public_rank_after: 188 },
    ],
    decreases: [
      { player_id: '33333333-3333-4333-8333-333333333333', player_name: 'Falling Player', change: -36.8, rating_before: 1822, rating_after: 1785.2, rating_deviation_after: 64.8, public_rank_after: 142 },
    ],
  },
  exceptional_results: [
    {
      match_date: '2026-07-20',
      rubber_id: '44444444-4444-4444-8444-444444444444',
      player_id: '11111111-1111-4111-8111-111111111111',
      player_name: 'Fast Newcomer',
      opponent_id: '55555555-5555-4555-8555-555555555555',
      opponent_name: 'Established Favourite',
      result: 'win',
      game_score: '3-2',
      expected_win_probability: 0.18,
      surprise: 0.82,
      attributed_rating_delta: 96.5,
    },
  ],
  backtest: null,
};

test.beforeAll(() => {
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(diagnosticsDir, { recursive: true });
});

test('reviews player evidence and latest calculation run', async ({ page }, testInfo) => {
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
        toughest: [],
        easiest: [],
        improving: [],
      }),
    });
  });

  await page.route('**/api/ratings/*/audit-evidence*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        player_id: player!.id,
        player_name: player!.name,
        model: 'global-singles-glicko2-v1',
        data: [
          {
            rubber_id: '66666666-6666-4666-8666-666666666666',
            match_date: '2026-07-20',
            opponent_id: '77777777-7777-4777-8777-777777777777',
            opponent_name: 'Established Favourite',
            result: 'win',
            game_score: '3-2',
            player_rating_before: 1500,
            player_rating_deviation_before: 280,
            opponent_rating_before: 2100,
            opponent_rating_deviation_before: 55,
            expected_win_probability: 0.18,
            actual_score: 1,
            surprise: 0.82,
            attributed_rating_delta: 96.5,
            information_contribution: 0.74,
            rating_after: 1618.4,
            rating_deviation_after: 226.2,
            public_rank_after: 412,
            provisional_after: true,
            period_matches: 2,
            period_combined_delta: 118.4,
          },
          {
            rubber_id: '88888888-8888-4888-8888-888888888888',
            match_date: '2026-07-20',
            opponent_id: '99999999-9999-4999-8999-999999999999',
            opponent_name: 'Solid Opponent',
            result: 'win',
            game_score: '3-1',
            player_rating_before: 1500,
            player_rating_deviation_before: 280,
            opponent_rating_before: 1680,
            opponent_rating_deviation_before: 85,
            expected_win_probability: 0.44,
            actual_score: 1,
            surprise: 0.56,
            attributed_rating_delta: 21.9,
            information_contribution: 0.42,
            rating_after: 1618.4,
            rating_deviation_after: 226.2,
            public_rank_after: 412,
            provisional_after: true,
            period_matches: 2,
            period_combined_delta: 118.4,
          },
        ],
      }),
    });
  });

  const insightsResponse = page.waitForResponse((response) =>
    response.url().endsWith(`/api/players/${player!.id}/insights`) && response.status() === 200,
  );
  await page.goto(`${previewUrl}/tabs/players/player/${player!.id}/insights`, { waitUntil: 'domcontentloaded' });
  await insightsResponse;

  const evidenceHeading = page.getByRole('heading', { name: 'Why your rating moved' });
  await evidenceHeading.scrollIntoViewIfNeeded();
  await expect(evidenceHeading).toBeVisible({ timeout: 30_000 });
  const upsetRow = page.getByRole('button', { name: /Established Favourite/ });
  await expect(upsetRow).toBeVisible();
  await upsetRow.click();
  await expect(page.getByText(/18% chance/)).toBeVisible();
  await expect(page.getByText(/All 2 matches on this date use the same starting rating/)).toBeVisible();
  await expect(page.getByText(/Rating after 1,618/)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, 'player-rating-evidence');

  await page.route('**/api/ratings/audit/summary', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        model: {
          key: 'global-singles-glicko2-v1',
          status: 'idle',
          last_processed_date: '2026-08-05',
          processed_periods: 412,
          processed_matches: 12480,
          updated_at: '2026-08-06T11:03:00.000Z',
          rated_players: 1842,
          established_players: 1604,
          provisional_players: 238,
          average_deviation: 84.2,
          first_rated_date: '2022-09-01',
          last_rated_date: '2026-08-05',
        },
        data: {
          stored_rubbers: 15000,
          active_rubbers: 13000,
          eligible_singles: 12382,
          excluded_rubbers: 618,
          doubles: 400,
          non_normal_outcome: 100,
          missing_date: 20,
          missing_identity: 48,
          same_canonical_player: 25,
          tied_score: 25,
        },
        identities: {
          source_records: 3200,
          active_records: 3000,
          canonical_players: 2200,
          linked_aliases: 1000,
          active_aliases: 0,
          soft_deleted_aliases: 1000,
          unassigned_records: 2200,
          broken_targets: 0,
          chained_links: 0,
          deleted_targets: 0,
          same_name_candidate_groups: 5,
          multi_source_players: 800,
        },
        network: {
          eligible_matches: 12382,
          connected_players: 1842,
          unique_pairings: 8021,
          average_unique_opponents: 8.7,
          maximum_unique_opponents: 74,
          one_opponent_players: 12,
          three_or_fewer_opponent_players: 53,
          competitions: 61,
          first_match_date: '2022-09-01',
          last_match_date: '2026-08-05',
        },
        network_anomalies: [],
      }),
    });
  });
  await page.route('**/api/ratings/audit/calculation-runs/latest*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(calculationAudit),
    });
  });

  await page.goto(`${previewUrl}/rating-audit`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Latest calculation run' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Calculation run summary').getByText('12,382', { exact: true })).toBeVisible();
  await expect(page.getByText('Fast Newcomer')).toBeVisible();
  await expect(page.getByText('Established Favourite')).toBeVisible();
  await expect(page.getByText(/Backtest metrics are not attached/)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, 'rating-audit-latest-run');

  writeReportIndex(previewUrl);
});
