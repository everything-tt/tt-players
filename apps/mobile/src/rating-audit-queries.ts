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
  pagination: Pagination;
  model: string;
  window_start_date: string | null;
}

export interface Pagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface RatingQualityMetrics {
  total_rubbers: number;
  eligible_rubbers: number;
  missing_identity_rubbers: number;
  missing_date_rubbers: number;
  invalid_single_rubbers: number;
  suspicious_date_rubbers: number;
  duplicate_candidate_groups: number;
  conflicting_candidate_groups: number;
  first_match_date: string | null;
  last_match_date: string | null;
}

export interface RatingSourceQualityRow extends RatingQualityMetrics {
  source_id: string;
  source_name: string;
  base_url: string;
}

export interface RatingSourceQualityResponse {
  data: RatingSourceQualityRow[];
  pagination: Pagination;
  model: string;
}

export interface RatingDuplicateCandidateRow {
  id: string;
  candidate_type: 'exact_score_candidate' | 'conflicting_score_candidate';
  competition_id: string | null;
  competition_name: string | null;
  match_date: string;
  player_a_id: string;
  player_a_name: string;
  player_b_id: string;
  player_b_name: string;
  rubber_count: number;
  rubber_ids: unknown;
  source_ids: unknown;
  score_signatures: unknown;
}

export interface RatingDuplicateCandidateResponse {
  data: RatingDuplicateCandidateRow[];
  pagination: Pagination;
  model: string;
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

export function useRatingSourceQualityQuery(pageSize = 50, enabled = true) {
  return useQuery({
    queryKey: ['ratings', 'audit', 'sources', pageSize],
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<RatingSourceQualityResponse>(
      `/ratings/audit/sources?page_size=${pageSize}`,
      signal,
    ),
    enabled,
  });
}

export function useRatingDuplicateCandidatesQuery(pageSize = 25, enabled = true) {
  return useQuery({
    queryKey: ['ratings', 'audit', 'duplicate-candidates', pageSize],
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<RatingDuplicateCandidateResponse>(
      `/ratings/audit/duplicate-candidates?page_size=${pageSize}`,
      signal,
    ),
    enabled,
  });
}
