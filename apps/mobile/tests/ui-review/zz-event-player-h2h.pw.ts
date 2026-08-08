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
    localStorage.setItem('tt_players_favourite_tournaments', JSON.stringify([]));
    localStorage.setItem('TTPlayers-Theme', 'light-mode');
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  });
}

function readManifest(): ScreenshotEntry[] {
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
    return Array.isArray(parsed) ? (parsed as ScreenshotEntry[]) : [];
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
  const groups = entries.reduce<Record<string, ScreenshotEntry[]>>((acc, entry) => {
    acc[entry.project] = acc[entry.project] ?? [];
    acc[entry.project].push(entry);
    return acc;
  }, {});
  const sections = Object.entries(groups)
    .map(
      ([project, items]) => `
    <section>
      <h2>${escapeHtml(project)}</h2>
      <div class="grid">
        ${items
          .map(
            (item) => `
          <article>
            <h3>${escapeHtml(item.title)}</h3>
            <a href="${escapeHtml(item.path)}"><img src="${escapeHtml(item.path)}" alt="${escapeHtml(`${project} ${item.title}`)}" /></a>
            <p><a href="${escapeHtml(item.url)}">${escapeHtml(new URL(item.url).pathname)}</a></p>
            <p><a href="${escapeHtml(item.diagnosticsPath)}">Diagnostics</a></p>
          </article>
        `,
          )
          .join('')}
      </div>
    </section>
  `,
    )
    .join('');
  writeFileSync(
    join(reportDir, 'index.html'),
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>TT Players UI Review</title><style>
body{margin:0;font-family:system-ui,sans-serif;background:#f7f8f7;color:#17211d}main{max-width:1180px;margin:0 auto;padding:24px}
h1,h2,h3{margin:0 0 12px}header,section{margin-bottom:28px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
article{background:white;border:1px solid #d9dfda;border-radius:8px;padding:12px}img{width:100%;height:auto;border:1px solid #d9dfda;border-radius:6px;display:block}a{color:#0f6655}code{background:#eef2ef;padding:2px 5px;border-radius:4px}
</style></head><body><main><header><h1>TT Players UI Review</h1><p>Preview: <a href="${escapeHtml(previewUrl)}">${escapeHtml(previewUrl)}</a></p><p>Commit: <code>${escapeHtml(process.env.GITHUB_SHA ?? 'local')}</code></p></header>${sections}</main></body></html>\n`,
  );
}

async function settleForScreenshot(page: Page) {
  await page.addStyleTag({
    content:
      '* { transition: none !important; animation: none !important; caret-color: transparent !important; }',
  });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
}

async function capture(page: Page, testInfo: TestInfo, title: string) {
  await settleForScreenshot(page);
  const screenshotPath = `screenshots/${testInfo.project.name}-${title}.png`;
  const diagnosticsPath = `diagnostics/${testInfo.project.name}-${title}.json`;
  await page.screenshot({ path: join(reportDir, screenshotPath), fullPage: false, timeout: 15_000 });
  writeFileSync(
    join(reportDir, diagnosticsPath),
    `${JSON.stringify({ route: page.url(), finalUrl: page.url(), events: [] }, null, 2)}\n`,
  );
  appendManifest({
    project: testInfo.project.name,
    title,
    url: page.url(),
    path: screenshotPath,
    diagnosticsPath,
  });
}

test.beforeAll(() => {
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(diagnosticsDir, { recursive: true });
});

test('reviews event detail selected player icon clear button and match H2H link action', async ({
  page,
}, testInfo) => {
  const previewUrl = requirePreviewUrl();
  await prepareAppState(page);

  const mockEventId = '749aa48a-8342-43c1-b0d2-0c1c957c6672';
  const playerAId = 'p1111111-1111-1111-1111-111111111111';
  const playerBId = 'p2222222-2222-2222-2222-222222222222';

  // Intercept event detail API request for a deterministic UI test.
  await page.route(`**/api/events/${mockEventId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        event: {
          id: mockEventId,
          platform_id: 'plat1',
          source: 'tt_leagues',
          external_id: 'ext1',
          name: 'Grand Prix Championship 2026',
          event_date: '2026-08-01T10:00:00Z',
          category: 'Open Singles',
          public_url: null,
          platform_name: 'TT Leagues',
          match_count: 2,
          status: 'completed',
        },
        results: [
          {
            id: 'm1',
            played_at: '2026-08-01T14:00:00Z',
            round_name: 'Group Stage',
            round_order: 1,
            home_player_name: 'Benjamin Willis',
            home_player_external_id: 'ext-p1',
            away_player_name: 'Alex Gough',
            away_player_external_id: 'ext-p2',
            home_games_won: 3,
            away_games_won: 1,
            winner_side: 'home',
            canonical_rubber_id: 'r1',
            home_player_resolved_id: playerAId,
            away_player_resolved_id: playerBId,
          },
        ],
      },
    });
  });

  await page.route(`**/api/players/${playerAId}/h2h/${playerBId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        player1_wins: 3,
        player2_wins: 1,
        encounters: [],
      },
    });
  });

  await page.goto(`${previewUrl}/tabs/events/event/${mockEventId}`, {
    waitUntil: 'domcontentloaded',
  });

  // Verify tournament title renders
  await expect(page.getByRole('heading', { name: 'Grand Prix Championship 2026' })).toBeVisible();

  // Select "Benjamin Willis" to filter
  const playerItem = page.getByText('Benjamin Willis').first();
  await expect(playerItem).toBeVisible();
  await playerItem.click();

  // 1. Verify selected player row displays both favourite button and clear icon button ('X' icon)
  const clearButton = page.getByRole('button', { name: 'Clear player' });
  await expect(clearButton).toBeVisible();
  await expect(clearButton.locator('i.fa.fa-times-circle')).toBeVisible();

  const favButton = page.getByRole('button', { name: 'Save to favourites' });
  await expect(favButton).toBeVisible();

  // 2. Verify selected player match displays the H2H icon button
  const h2hButton = page.getByRole('button', {
    name: 'Head-to-head between Benjamin Willis and Alex Gough',
  });
  await expect(h2hButton).toBeVisible();
  await expect(h2hButton.locator('i.fa.fa-code-compare')).toBeVisible();

  await capture(page, testInfo, 'event-selected-player-h2h');

  // 3. Click H2H icon button and verify navigation to H2H page
  await h2hButton.click();
  await expect(page).toHaveURL(new RegExp(`/h2h/${playerAId}/${playerBId}`));
  await expect(page.getByRole('heading', { name: 'Head to Head' })).toBeVisible();

  await capture(page, testInfo, 'event-h2h-navigation-target');

  writeReportIndex(previewUrl);
});
