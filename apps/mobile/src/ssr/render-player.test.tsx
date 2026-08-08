import { describe, expect, it } from 'vitest';
import type { ApiFetcher } from '../player-profile-query';
import type { PlayerProfileOverview } from '../player-shared';
import { buildQueryStateScript } from './serialize';
import { renderPlayerRequest } from './render-player';
import { ServerApiError } from './server-api';

const profile: PlayerProfileOverview = {
  player_id: 'player-123',
  player_name: 'Alice </script><Example>',
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

function renderWith(fetcher: ApiFetcher) {
  return renderPlayerRequest({
    playerId: 'player-123',
    requestUrl: 'https://players.example.test/players/player-123',
    siteOrigin: 'https://players.example.test',
    apiFetcher: fetcher,
  });
}

describe('renderPlayerRequest', () => {
  it('server-renders the existing PlayerPage route with useful profile content', async () => {
    const fetcher: ApiFetcher = async <T,>(): Promise<T> => profile as unknown as T;
    const result = await renderWith(fetcher);

    expect(result.status).toBe(200);
    expect(result.appHtml).toContain('<h1 id="tt-player-title">Alice &lt;/script&gt;&lt;Example&gt;</h1>');
    expect(result.appHtml).toContain('24 matches');
    expect(result.appHtml).toContain('18 wins');
    expect(result.appHtml).toContain('75% win rate');
    expect(result.appHtml).toContain('Example TTC');
    expect(result.appHtml).toContain('Current season clubs and tournaments');
    expect(result.headHtml).toContain('<title>Alice &lt;/script&gt;&lt;Example&gt; | TT Players</title>');
    expect(result.headHtml).toContain('name="robots" content="index,follow"');
    expect(result.headHtml).toContain('rel="canonical" href="https://players.example.test/players/player-123"');
    expect(result.headHtml).toContain('property="og:title"');
    expect(result.headHtml).toContain('name="twitter:card" content="summary_large_image"');
    expect(result.dehydratedState).not.toBeNull();

    const stateScript = buildQueryStateScript(result.dehydratedState);
    expect(stateScript).toContain('id="__TT_QUERY_STATE__" type="application/json"');
    expect(stateScript).toContain('\\u003c/script\\u003e');
    expect(stateScript).not.toContain('</script><Example>');
  });

  it('returns a useful noindex 404 for an unknown player', async () => {
    const fetcher: ApiFetcher = async () => {
      throw new ServerApiError(404, 'https://backend.example.test/api/players/player-123/profile-overview');
    };
    const result = await renderWith(fetcher);

    expect(result.status).toBe(404);
    expect(result.headHtml).toContain('name="robots" content="noindex,follow"');
    expect(result.appHtml).toContain('<h1>Player not found</h1>');
    expect(result.dehydratedState).toBeNull();
  });

  it('returns a 5xx noindex response when the backend fails', async () => {
    const fetcher: ApiFetcher = async () => {
      throw new ServerApiError(503, 'https://backend.example.test/api/players/player-123/profile-overview');
    };
    const result = await renderWith(fetcher);

    expect(result.status).toBe(503);
    expect(result.headHtml).toContain('name="robots" content="noindex,follow"');
    expect(result.appHtml).toContain('Player profile unavailable');
  });
});
