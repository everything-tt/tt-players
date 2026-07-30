import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './player-shared';

export type RatingConfidence = 'high' | 'medium' | 'low';

export interface PlayerRating {
  rank: number | null;
  player_id: string;
  player_name: string;
  rating: number;
  rating_deviation: number;
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

export interface PlayerRatingResponse {
  data: PlayerRating;
}

export interface RatingPredictionPlayer {
  player_id: string;
  player_name: string;
  rating: number;
  rating_deviation: number;
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

export function useTopRatingsQuery(limit = 5, enabled = true) {
  return useQuery({
    queryKey: ['ratings', 'top', limit],
    queryFn: ({ signal }: { signal: AbortSignal }) => {
      const params = new URLSearchParams({
        page: '1',
        page_size: String(limit),
        include_provisional: 'false',
      });
      return apiFetch<RatingsResponse>(`/ratings?${params.toString()}`, signal);
    },
    enabled,
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

export function ratingConfidenceLabel(confidence: RatingConfidence): string {
  return confidence === 'high' ? 'High' : confidence === 'medium' ? 'Medium' : 'Low';
}
