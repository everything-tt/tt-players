import { describe, expect, it } from 'vitest';
import type { ApiFetcher } from './player-profile-query';
import type { PlayerProfileOverview } from './player-shared';
import { renderPlayerHtml } from './entry-server';
import { ServerApiError } from './ssr/server-api';

const template = `<!doctype html>
<html lang="en">
  <head>
    <!--app-head-->
    <title>TT Players</title>
  </head>
  <body>
    <div id="root"><!--app-html--></div>
    <!--ssr-state-->
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;

const profile: PlayerProfileOverview = {
  player_id: 'player-123',
  player_name: 'Alice <Example>',
  wins: 18,
  losses: 6,
  total: 24,
  form: {
    rolling_10_win_rate: 70,
    rolling_20_win_rate: 65,
    momentum: 'hot',
    recent_results: ['W', 'W', 'L'],
  },
  current_season_affiliations: [
    {
      team_id: 'team-1',
      team_name: 'Example TTC',
      league_id: 'league-1',
      league_name: 'Example League',
      season_id: 'season-1',
      competition_name: 'Division One',
      season_name: '2026/27',
    },
  ],
};

describe('renderPlayerHtml', () => {
  it('renders useful raw player HTML, metadata and dehydrated query state', async () => {
    const fetcher: ApiFetcher = async <T,>(): Promise<T> => profile as unknown as T;

    const result = await renderPlayerHtml({
      url: '/players/player-123',
      requestOrigin: 'https://players.example.test',
      template,
      fetcher,
    });

    expect(result).not.toBeNull();
    if (!result) throw new Error('Expected canonical player route to render');

    expect(result.status).toBe(200);
    expect(result.html).toContain('<h1 id="tt-player-title">Alice &lt;Example&gt;</h1>');
    expect(result.html).toContain('24 matches');
    expect(result.html).toContain('18 wins');
    expect(result.html).toContain('75% win rate');
    expect(result.html).toContain('Example TTC');
    expect(result.html).toContain('<title>Alice &lt;Example&gt; | TT Players</title>');
    expect(result.html).toContain('name="description"');
    expect(result.html).toContain('name="robots" content="index,follow"');
    expect(result.html).toContain('rel="canonical" href="https://players.example.test/players/player-123"');
    expect(result.html).toContain('property="og:title"');
    expect(result.html).toContain('name="twitter:card" content="summary_large_image"');
    expect(result.html).toContain('id="__TT_QUERY_STATE__" type="application/json"');
    expect(result.html).toContain('\\u003cExample\\u003e');
    expect(result.html).not.toContain('"player_name":"Alice <Example>"');
  });

  it('returns null for non-canonical player routes so they stay SPA-only', async () => {
    const fetcher: ApiFetcher = async <T,>(): Promise<T> => profile as unknown as T;

    await expect(renderPlayerHtml({
      url: '/players/player-123/matches',
      requestOrigin: 'https://players.example.test',
      template,
      fetcher,
    })).resolves.toBeNull();

    await expect(renderPlayerHtml({
      url: '/tabs/players/player/player-123',
      requestOrigin: 'https://players.example.test',
      template,
      fetcher,
    })).resolves.toBeNull();
  });

  it('returns an HTTP 404 noindex page when the player does not exist', async () => {
    const fetcher: ApiFetcher = async () => {
      throw new ServerApiError(404, 'https://api.example.test/api/players/missing/profile-overview');
    };

    const result = await renderPlayerHtml({
      url: '/players/missing',
      requestOrigin: 'https://players.example.test',
      template,
      fetcher,
    });

    expect(result).not.toBeNull();
    if (!result) throw new Error('Expected missing player route to render');

    expect(result.status).toBe(404);
    expect(result.html).toContain('<h1>Player not found</h1>');
    expect(result.html).toContain('name="robots" content="noindex,follow"');
    expect(result.html).not.toContain('id="__TT_QUERY_STATE__"');
  });
});
