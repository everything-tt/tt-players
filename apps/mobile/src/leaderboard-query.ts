export interface LeaderboardQueryOptions {
  mode: 'win_pct' | 'most_played' | 'combined' | 'form' | 'improving' | 'new_faces';
  leagueIds: string[];
  limit: number;
  minPlayed: number;
  seasonId?: string;
  allLeaguesCount?: number;
}

export interface BuiltLeaderboardQuery {
  path: string;
  scopeKey: string;
}

export function buildLeaderboardQuery(options: LeaderboardQueryOptions): BuiltLeaderboardQuery {
  const normalizedLeagueIds = [...new Set(options.leagueIds)].sort();
  const includesEveryLeague = options.allLeaguesCount !== undefined
    && normalizedLeagueIds.length >= options.allLeaguesCount;
  const scopedLeagueIds = includesEveryLeague ? [] : normalizedLeagueIds;

  const params = new URLSearchParams({
    mode: options.mode,
    limit: String(options.limit),
    min_played: String(options.minPlayed),
  });
  if (scopedLeagueIds.length > 0) {
    params.set('league_ids', scopedLeagueIds.join(','));
  }
  if (options.seasonId) {
    params.set('season_id', options.seasonId);
  }

  return {
    path: `/players/leaders?${params.toString()}`,
    scopeKey: scopedLeagueIds.length > 0 ? scopedLeagueIds.join(',') : 'all',
  };
}

export function shouldRetryLeaderboardQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof Error && /^HTTP [45]\d{2}$/.test(error.message)) {
    return false;
  }
  return failureCount < 2;
}
