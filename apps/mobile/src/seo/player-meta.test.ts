import { describe, expect, it } from 'vitest';
import type { PlayerProfileOverview } from '../player-shared';
import { buildPlayerMeta } from './player-meta';

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

describe('buildPlayerMeta', () => {
  it('builds player-specific canonical and social metadata', () => {
    expect(buildPlayerMeta('https://ttplayers.example/', profile)).toEqual({
      title: 'Alice Example | TT Players',
      description: 'Alice Example: 24 matches, 18 wins, 75% win rate.',
      canonicalUrl: 'https://ttplayers.example/players/player-123',
      imageUrl: 'https://ttplayers.example/images/thumb-players.png',
    });
  });
});
