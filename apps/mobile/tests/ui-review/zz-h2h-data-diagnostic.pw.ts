import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface SearchResponse {
  data: Array<{ id: string; name: string; played: number; wins: number }>;
}

interface RubberItem {
  id: string;
  fixture_id: string;
  opponent: string;
  opponent_id: string | null;
  source: 'league' | 'tournament';
  event_id: string | null;
}

interface RubbersResponse {
  data: RubberItem[];
}

interface H2HResponse {
  player1_wins: number;
  player2_wins: number;
  encounters: RubberItem[];
}

const reportDir = process.env.UI_REVIEW_REPORT_DIR ?? 'ui-review-report';
const diagnosticsDir = join(reportDir, 'diagnostics');

function requirePreviewUrl(): string {
  const previewUrl = process.env.PREVIEW_URL;
  if (!previewUrl) throw new Error('PREVIEW_URL is required');
  return previewUrl.replace(/\/$/, '');
}

test.beforeAll(() => {
  mkdirSync(diagnosticsDir, { recursive: true });
});

test('diagnoses a match-derived H2H pair', async ({ page }) => {
  const previewUrl = requirePreviewUrl();
  const searchResponse = await page.request.get(`${previewUrl}/api/players/search?q=Wudong%20Liu&limit=10&offset=0`);
  expect(searchResponse.ok()).toBe(true);
  const search = await searchResponse.json() as SearchResponse;
  const player = search.data.find((item) => item.name === 'Wudong Liu') ?? search.data[0];
  expect(player).toBeTruthy();

  const rubbersResponse = await page.request.get(
    `${previewUrl}/api/players/${player!.id}/rubbers?limit=100&offset=0&source=all`,
  );
  expect(rubbersResponse.ok()).toBe(true);
  const rubbers = await rubbersResponse.json() as RubbersResponse;
  const match = rubbers.data.find((item) => Boolean(item.opponent_id));
  expect(match?.opponent_id).toBeTruthy();

  const opponentId = match!.opponent_id!;
  const [
    h2hResponse,
    reverseH2HResponse,
    opponentRubbersResponse,
    opponentSearchResponse,
    playerStatsResponse,
    opponentStatsResponse,
  ] = await Promise.all([
    page.request.get(`${previewUrl}/api/players/${player!.id}/h2h/${opponentId}`),
    page.request.get(`${previewUrl}/api/players/${opponentId}/h2h/${player!.id}`),
    page.request.get(`${previewUrl}/api/players/${opponentId}/rubbers?limit=100&offset=0&source=all`),
    page.request.get(`${previewUrl}/api/players/search?q=${encodeURIComponent(match!.opponent)}&limit=20&offset=0`),
    page.request.get(`${previewUrl}/api/players/${player!.id}/stats/extended`),
    page.request.get(`${previewUrl}/api/players/${opponentId}/stats/extended`),
  ]);

  const h2h = h2hResponse.ok() ? await h2hResponse.json() as H2HResponse : await h2hResponse.text();
  const reverseH2H = reverseH2HResponse.ok()
    ? await reverseH2HResponse.json() as H2HResponse
    : await reverseH2HResponse.text();
  const opponentRubbers = opponentRubbersResponse.ok()
    ? await opponentRubbersResponse.json() as RubbersResponse
    : await opponentRubbersResponse.text();
  const opponentSearch = opponentSearchResponse.ok()
    ? await opponentSearchResponse.json() as SearchResponse
    : await opponentSearchResponse.text();
  const playerStats = playerStatsResponse.ok() ? await playerStatsResponse.json() : await playerStatsResponse.text();
  const opponentStats = opponentStatsResponse.ok() ? await opponentStatsResponse.json() : await opponentStatsResponse.text();

  const opponentRowsAgainstPlayer = typeof opponentRubbers === 'string'
    ? []
    : opponentRubbers.data.filter((item) => item.opponent_id === player!.id || item.opponent === player!.name);

  const diagnostic = {
    player,
    selectedMatch: match,
    h2hStatus: h2hResponse.status(),
    h2h,
    reverseH2HStatus: reverseH2HResponse.status(),
    reverseH2H,
    opponentRubbersStatus: opponentRubbersResponse.status(),
    opponentRowsAgainstPlayer,
    opponentSearch,
    playerStats,
    opponentStats,
  };

  writeFileSync(
    join(diagnosticsDir, 'h2h-data-diagnostic.json'),
    `${JSON.stringify(diagnostic, null, 2)}\n`,
  );

  expect(
    typeof h2h === 'string' ? 0 : h2h.encounters.length,
    `Match-derived H2H returned no encounters. Diagnostic: ${JSON.stringify(diagnostic)}`,
  ).toBeGreaterThan(0);
});
