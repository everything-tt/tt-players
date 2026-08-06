import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './player-shared';

export type RatingPlayerCoverageCategory =
  | 'covered'
  | 'no_raw_matches'
  | 'only_doubles'
  | 'only_non_normal'
  | 'only_invalid_singles'
  | 'only_before_model_window'
  | 'eligible_in_window_without_rating'
  | 'rating_without_eligible_evidence';

export interface RatingPlayerCoverageRow {
  player_id: string;
  player_name: string;
  category: RatingPlayerCoverageCategory;
  raw_matches: number;
  singles_matches: number;
  normal_singles_matches: number;
  eligible_matches_all_time: number;
  eligible_matches_in_window: number;
  unique_opponents_in_window: number;
  first_match_date: string | null;
  last_match_date: string | null;
  rating_exists: boolean;
  rated_matches: number | null;
  rating_deviation: number | null;
}

export interface RatingPlayerCoverageResponse {
  data: RatingPlayerCoverageRow[];
  summary: Array<{
    category: RatingPlayerCoverageCategory;
    count: number;
  }>;
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
  model: string;
  window_start_date: string | null;
}

export function useRatingPlayerCoverageQuery(
  category?: RatingPlayerCoverageCategory,
  pageSize = 50,
  enabled = true,
) {
  return useQuery({
    queryKey: ['ratings', 'audit', 'player-coverage', category ?? 'all', pageSize],
    queryFn: ({ signal }: { signal: AbortSignal }) => {
      const params = new URLSearchParams({ page_size: String(pageSize) });
      if (category) params.set('category', category);
      return apiFetch<RatingPlayerCoverageResponse>(
        `/ratings/audit/player-coverage?${params.toString()}`,
        signal,
      );
    },
    enabled,
  });
}
