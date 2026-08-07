import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './player-shared';

export interface RatingCalculationRun {
  id: string;
  model_key: string;
  model_version: string;
  started_at: string;
  completed_at: string | null;
  source_data_cutoff: string | null;
  code_commit_sha: string;
  algorithm_parameters: unknown;
  input_hash: string;
  run_status: string;
  processed_periods: number;
  processed_matches: number;
  failure_message: string | null;
}

export interface RatingCalculationMover {
  player_id: string;
  player_name: string;
  change: number;
  rating_before: number;
  rating_after: number;
  rating_deviation_after: number;
  public_rank_after: number | null;
}

export interface RatingExceptionalResult {
  match_date: string;
  rubber_id: string;
  player_id: string;
  player_name: string;
  opponent_id: string;
  opponent_name: string;
  result: string;
  game_score: string | null;
  expected_win_probability: number;
  surprise: number;
  attributed_rating_delta: number;
}

export interface RatingCalculationAuditResponse {
  run: RatingCalculationRun | null;
  summary: {
    included_matches: number;
    excluded_matches: number;
    players: number;
    provisional_players: number;
    exclusions_by_reason: Array<{
      reason: string;
      matches: number;
    }>;
  };
  movers: {
    increases: RatingCalculationMover[];
    decreases: RatingCalculationMover[];
  };
  exceptional_results: RatingExceptionalResult[];
  backtest: {
    generated_at: string;
    evaluation_start_date: string;
    evaluation_end_date: string;
    evaluated_matches: number;
    brier_score: number;
    log_loss: number;
  } | null;
}

export interface RatingPlayerAuditEvidenceRow {
  rubber_id: string;
  match_date: string;
  opponent_id: string;
  opponent_name: string;
  result: string;
  game_score: string | null;
  expected_win_probability: number;
  actual_score: number;
  surprise: number;
  attributed_rating_delta: number;
  information_contribution: number | null;
  rating_after: number;
  rating_deviation_after: number;
  public_rank_after: number | null;
  provisional_after: boolean;
  period_matches: number;
  period_combined_delta: number;
}

export interface RatingPlayerAuditEvidenceResponse {
  player_id: string;
  player_name: string;
  model: string;
  data: RatingPlayerAuditEvidenceRow[];
}

export function useRatingCalculationAuditQuery(enabled = true) {
  return useQuery({
    queryKey: ['ratings', 'audit', 'calculation-runs', 'latest'],
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<RatingCalculationAuditResponse>(
      '/ratings/audit/calculation-runs/latest',
      signal,
    ),
    enabled,
  });
}

export function useRatingPlayerAuditEvidenceQuery(
  playerId: string,
  limit = 20,
  enabled = true,
) {
  return useQuery({
    queryKey: ['ratings', 'player', playerId, 'audit-evidence', limit],
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<RatingPlayerAuditEvidenceResponse>(
      `/ratings/${playerId}/audit-evidence?limit=${limit}`,
      signal,
    ),
    enabled: enabled && Boolean(playerId),
    retry: false,
  });
}
