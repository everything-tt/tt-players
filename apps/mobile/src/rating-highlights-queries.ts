import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './player-shared';

export type RatingHighlightTab = 'jumps' | 'surprises';

export interface RatingHighlightRun {
  id: string;
  completed_at: string | null;
  source_data_cutoff: string | null;
}

export interface RatingJumpHighlight {
  player_id: string;
  player_name: string;
  change: number;
  rating_before: number;
  rating_after: number;
  rating_deviation_after: number;
  public_rank_after: number | null;
}

export interface SurpriseWinHighlight {
  match_date: string;
  rubber_id: string;
  player_id: string;
  player_name: string;
  opponent_id: string;
  opponent_name: string;
  game_score: string | null;
  expected_win_probability: number;
  surprise: number;
  attributed_rating_delta: number;
}

export interface RatingHighlightsResponse {
  run: RatingHighlightRun | null;
  rating_jumps: RatingJumpHighlight[];
  surprise_wins: SurpriseWinHighlight[];
}

export function useRatingHighlightsQuery(limit = 5, enabled = true) {
  return useQuery({
    queryKey: ['ratings', 'highlights', limit],
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<RatingHighlightsResponse>(
      `/ratings/highlights?limit=${limit}`,
      signal,
    ),
    enabled,
  });
}
