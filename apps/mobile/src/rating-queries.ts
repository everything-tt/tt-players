import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { apiFetch } from './player-shared';

export type RatingConfidence = 'high' | 'medium' | 'low';
export type RatingHistoryRange = '3m' | '1y' | '3y' | '10y' | 'all';

export interface PlayerRating {
  rank: number | null;
  player_id: string;
  player_name: string;
  rating: number;
  rating_deviation: number;
  volatility: number;
  conservative_rating: number;
  rating_low: number;
  rating_high: number;
  confidence: RatingConfidence;
  rated_matches: number;
  rated_wins: number;
  rated_losses: number;
  win_rate: number;
  provisional: boolean;
  first_rated_at: string | null;
  last_rated_at: string | null;
}

export interface RatingsResponse {
  data: PlayerRating[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
  model: string;
  processing: {
    status: string;
    last_processed_date: string | null;
    processed_periods: number;
    processed_matches: number;
    updated_at: string | null;
  } | null;
}

export interface LeagueRatingsResponse {
  data: PlayerRating[];
  total: number;
  page: number;
  page_size: number;
  model: string;
  league_ids: string[];
}

export interface PlayerRatingResponse {
  data: PlayerRating;
}

export interface PlayerRatingHistoryPoint {
  week_start: string;
  snapshot_date: string;
  rating: number;
  rating_deviation: number;
  conservative_rating: number;
  rating_low: number;
  rating_high: number;
  rating_change: number | null;
  confidence: RatingConfidence;
  rated_matches: number;
  rated_wins: number;
  rated_losses: number;
  week_matches: number;
  week_wins: number;
  week_losses: number;
  provisional: boolean;
}

export interface PlayerRatingHistoryResponse {
  player_id: string;
  player_name: string;
  model: string;
  range: RatingHistoryRange;
  data: PlayerRatingHistoryPoint[];
}

export interface RatingPredictionPlayer {
  player_id: string;
  player_name: string;
  rating: number;
  rating_deviation: number;
  volatility: number;
  provisional: boolean;
  win_probability: number;
}

export interface RatingPredictionResponse {
  model: string;
  confidence: RatingConfidence;
  combined_deviation: number;
  player1: RatingPredictionPlayer;
  player2: RatingPredictionPlayer;
}

export interface RatingAuditSummaryResponse {
  model: {
    key: string;
    status: string | null;
    last_processed_date: string | null;
    processed_periods: number;
    processed_matches: number;
    updated_at: string | null;
    rated_players: number;
    established_players: number;
    provisional_players: number;
    average_deviation: number;
    first_rated_date: string | null;
    last_rated_date: string | null;
  };
  data: {
    stored_rubbers: number;
    active_rubbers: number;
    eligible_singles: number;
    excluded_rubbers: number;
    doubles: number;
    non_normal_outcome: number;
    missing_date: number;
    missing_identity: number;
    same_canonical_player: number;
    tied_score: number;
  };
  identities: {
    source_records: number;
    active_records: number;
    canonical_players: number;
    linked_aliases: number;
    active_aliases: number;
    soft_deleted_aliases: number;
    unassigned_records: number;
    broken_targets: number;
    chained_links: number;
    deleted_targets: number;
    same_name_candidate_groups: number;
    multi_source_players: number;
  };
  network: {
    eligible_matches: number;
    connected_players: number;
    unique_pairings: number;
    average_unique_opponents: number;
    maximum_unique_opponents: number;
    one_opponent_players: number;
    three_or_fewer_opponent_players: number;
    competitions: number;
    first_match_date: string | null;
    last_match_date: string | null;
  };
  network_anomalies: Array<{
    player_id: string;
    player_name: string;
    rating: number;
    rating_deviation: number;
    rated_matches: number;
    unique_opponents: number;
    provisional: boolean;
  }>;
}

function buildLeagueRatingsParams(leagueIds: string[], page: number, pageSize: number) {
  return new URLSearchParams({
    league_ids: leagueIds.join(','),
    page: String(page),
    page_size: String(pageSize),
    include_provisional: 'false',
  });
}

function buildSiteRatingsParams(page: number, pageSize: number) {
  return new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    include_provisional: 'false',
  });
}

export function useTopSiteRatingsQuery(limit = 5, enabled = true) {
  return useQuery({
    queryKey: ['ratings', 'top', 'site', limit],
    queryFn: ({ signal }: { signal: AbortSignal }) => {
      const params = buildSiteRatingsParams(1, limit);
      return apiFetch<RatingsResponse>(`/ratings?${params.toString()}`, signal);
    },
    enabled,
  });
}

export function useTopRatingsQuery(leagueIds: string[], limit = 5, enabled = true) {
  const sortedLeagueIds = [...leagueIds].sort();

  return useQuery({
    queryKey: ['ratings', 'top', 'leagues', sortedLeagueIds.join(','), limit],
    queryFn: ({ signal }: { signal: AbortSignal }) => {
      const params = buildLeagueRatingsParams(sortedLeagueIds, 1, limit);
      return apiFetch<LeagueRatingsResponse>(`/ratings/league?${params.toString()}`, signal);
    },
    enabled: enabled && sortedLeagueIds.length > 0,
  });
}

export function useInfiniteSiteRatingsQuery(
  pageSize = 10,
  maxResults = 100,
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: ['ratings', 'top', 'site', 'infinite', pageSize, maxResults],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }: { pageParam: number; signal: AbortSignal }) => {
      const params = buildSiteRatingsParams(pageParam, pageSize);
      return apiFetch<RatingsResponse>(`/ratings?${params.toString()}`, signal);
    },
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.data.length, 0);
      const cappedTotal = Math.min(lastPage.pagination.total, maxResults);
      return loaded < cappedTotal ? pages.length + 1 : undefined;
    },
    enabled,
  });
}

export function useInfiniteLeagueRatingsQuery(
  leagueIds: string[],
  pageSize = 10,
  maxResults = 100,
  enabled = true,
) {
  const sortedLeagueIds = [...leagueIds].sort();

  return useInfiniteQuery({
    queryKey: ['ratings', 'top', 'leagues', sortedLeagueIds.join(','), 'infinite', pageSize, maxResults],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }: { pageParam: number; signal: AbortSignal }) => {
      const params = buildLeagueRatingsParams(sortedLeagueIds, pageParam, pageSize);
      return apiFetch<LeagueRatingsResponse>(`/ratings/league?${params.toString()}`, signal);
    },
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.data.length, 0);
      const cappedTotal = Math.min(lastPage.total, maxResults);
      return loaded < cappedTotal ? pages.length + 1 : undefined;
    },
    enabled: enabled && sortedLeagueIds.length > 0,
  });
}

export function usePlayerRatingQuery(playerId: string, enabled = true) {
  return useQuery({
    queryKey: ['ratings', 'player', playerId],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      apiFetch<PlayerRatingResponse>(`/ratings/${playerId}`, signal),
    enabled: enabled && Boolean(playerId),
    retry: false,
  });
}

export function usePlayerRatingHistoryQuery(
  playerId: string,
  range: RatingHistoryRange = '1y',
  enabled = true,
) {
  return useQuery({
    queryKey: ['ratings', 'player', playerId, 'history', range],
    queryFn: ({ signal }: { signal: AbortSignal }) => {
      const params = new URLSearchParams({ range });
      return apiFetch<PlayerRatingHistoryResponse>(`/ratings/${playerId}/history?${params.toString()}`, signal);
    },
    enabled: enabled && Boolean(playerId),
    retry: false,
  });
}

export function useRatingPredictionQuery(player1Id: string, player2Id: string, enabled = true) {
  return useQuery({
    queryKey: ['ratings', 'prediction', player1Id, player2Id],
    queryFn: ({ signal }: { signal: AbortSignal }) => {
      const params = new URLSearchParams({
        player1_id: player1Id,
        player2_id: player2Id,
      });
      return apiFetch<RatingPredictionResponse>(`/ratings/predict?${params.toString()}`, signal);
    },
    enabled: enabled && Boolean(player1Id) && Boolean(player2Id) && player1Id !== player2Id,
    retry: false,
  });
}

export function useRatingAuditSummaryQuery(enabled = true) {
  return useQuery({
    queryKey: ['ratings', 'audit', 'summary'],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      apiFetch<RatingAuditSummaryResponse>('/ratings/audit/summary', signal),
    enabled,
  });
}

export function ratingConfidenceLabel(confidence: RatingConfidence): string {
  return confidence === 'high' ? 'High' : confidence === 'medium' ? 'Medium' : 'Low';
}
