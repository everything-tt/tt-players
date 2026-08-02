import { describe, expect, it } from 'vitest';
import { buildLeaderboardQuery, shouldRetryLeaderboardQuery } from './leaderboard-query';

const baseOptions = {
  mode: 'win_pct' as const,
  limit: 5,
  minPlayed: 5,
};

describe('buildLeaderboardQuery', () => {
  it('omits the league scope when every available league is selected', () => {
    const query = buildLeaderboardQuery({
      ...baseOptions,
      leagueIds: ['league-c', 'league-a', 'league-b'],
      allLeaguesCount: 3,
    });

    expect(query.scopeKey).toBe('all');
    expect(query.path).toBe('/players/leaders?mode=win_pct&limit=5&min_played=5');
  });

  it('sorts, deduplicates, and includes an explicit league subset', () => {
    const query = buildLeaderboardQuery({
      ...baseOptions,
      leagueIds: ['league-c', 'league-a', 'league-c'],
      allLeaguesCount: 4,
    });

    expect(query.scopeKey).toBe('league-a,league-c');
    expect(new URLSearchParams(query.path.split('?')[1]).get('league_ids')).toBe('league-a,league-c');
  });
});

describe('shouldRetryLeaderboardQuery', () => {
  it('does not retry deterministic HTTP failures', () => {
    expect(shouldRetryLeaderboardQuery(0, new Error('HTTP 500'))).toBe(false);
    expect(shouldRetryLeaderboardQuery(0, new Error('HTTP 429'))).toBe(false);
  });

  it('allows at most two retries for transient network failures', () => {
    expect(shouldRetryLeaderboardQuery(0, new TypeError('fetch failed'))).toBe(true);
    expect(shouldRetryLeaderboardQuery(1, new TypeError('fetch failed'))).toBe(true);
    expect(shouldRetryLeaderboardQuery(2, new TypeError('fetch failed'))).toBe(false);
  });
});
