import { describe, expect, it } from 'vitest';
import type { PlayerProfileOverview } from './player-shared';
import {
  playerProfileOverviewQueryOptions,
  type ApiFetcher,
} from './player-profile-query';

const profile: PlayerProfileOverview = {
  player_id: 'player-123',
  player_name: 'Alice Example',
  wins: 18,
  losses: 6,
  total: 24,
  form: {
    rolling_10_win_rate: 70,
    rolling_20_win_rate: 65,
    momentum: 'hot',
    recent_results: ['W', 'W', 'L'],
  },
  current_season_affiliations: [],
};

describe('playerProfileOverviewQueryOptions', () => {
  it('keeps the canonical query key and API path together', async () => {
    const paths: string[] = [];
    const fetcher: ApiFetcher = async <T,>(path) => {
      paths.push(path);
      return profile as unknown as T;
    };

    const options = playerProfileOverviewQueryOptions('player-123', fetcher);

    expect(options.queryKey).toEqual(['players', 'player-123', 'profile-overview']);
    await options.queryFn({ signal: new AbortController().signal });
    expect(paths).toEqual(['/players/player-123/profile-overview']);
  });
});
