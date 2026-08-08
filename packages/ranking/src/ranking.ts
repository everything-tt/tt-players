import {
  DEFAULT_GLICKO2_CONFIG,
  conservativeRating,
  inflateDeviationForInactivity,
  type Glicko2Config,
  type RatingState,
} from './glicko2.js';

export interface CurrentRankingPolicy {
  activeDays: number;
  minimumMatches: number;
  minimumUniqueOpponents: number;
  maximumDeviation: number;
}

export const DEFAULT_CURRENT_RANKING_POLICY: CurrentRankingPolicy = {
  activeDays: 365,
  minimumMatches: 10,
  minimumUniqueOpponents: 5,
  maximumDeviation: 110,
};

export type RankingEligibilityReason =
  | 'ranked'
  | 'insufficient_matches'
  | 'insufficient_opponents'
  | 'inactive'
  | 'high_uncertainty'
  | 'critical_data_issue';

export interface CurrentRankingInput {
  playerId: string;
  state: RatingState;
  ratedMatches: number;
  uniqueOpponents: number;
  daysInactive: number;
  hasCriticalIssue?: boolean;
}

export interface CurrentRankingEvaluation extends CurrentRankingInput {
  effectiveDeviation: number;
  effectiveConservativeRating: number;
  historicalConservativeRating: number;
  eligible: boolean;
  eligibilityReason: RankingEligibilityReason;
}

export interface RankedCurrentPlayer extends CurrentRankingEvaluation {
  currentRank: number | null;
  historicalRank: number;
}

export function evaluateCurrentRanking(
  input: CurrentRankingInput,
  policy: CurrentRankingPolicy = DEFAULT_CURRENT_RANKING_POLICY,
  config: Glicko2Config = DEFAULT_GLICKO2_CONFIG,
): CurrentRankingEvaluation {
  const currentState = inflateDeviationForInactivity(
    input.state,
    Math.max(0, input.daysInactive),
    config,
  );
  const eligibilityReason = classifyRankingEligibility(
    {
      ratedMatches: input.ratedMatches,
      uniqueOpponents: input.uniqueOpponents,
      daysInactive: Math.max(0, input.daysInactive),
      effectiveDeviation: currentState.deviation,
      hasCriticalIssue: input.hasCriticalIssue ?? false,
    },
    policy,
  );

  return {
    ...input,
    daysInactive: Math.max(0, input.daysInactive),
    effectiveDeviation: currentState.deviation,
    effectiveConservativeRating: conservativeRating(currentState, config),
    historicalConservativeRating: conservativeRating(input.state, config),
    eligible: eligibilityReason === 'ranked',
    eligibilityReason,
  };
}

export function classifyRankingEligibility(
  evidence: Pick<
    CurrentRankingEvaluation,
    'ratedMatches' | 'uniqueOpponents' | 'daysInactive' | 'effectiveDeviation'
  > & { hasCriticalIssue: boolean },
  policy: CurrentRankingPolicy = DEFAULT_CURRENT_RANKING_POLICY,
): RankingEligibilityReason {
  if (evidence.hasCriticalIssue) return 'critical_data_issue';
  if (evidence.ratedMatches < policy.minimumMatches) return 'insufficient_matches';
  if (evidence.uniqueOpponents < policy.minimumUniqueOpponents) return 'insufficient_opponents';
  if (evidence.daysInactive > policy.activeDays) return 'inactive';
  if (evidence.effectiveDeviation > policy.maximumDeviation) return 'high_uncertainty';
  return 'ranked';
}

export function rankCurrentPlayers(
  inputs: readonly CurrentRankingInput[],
  policy: CurrentRankingPolicy = DEFAULT_CURRENT_RANKING_POLICY,
  config: Glicko2Config = DEFAULT_GLICKO2_CONFIG,
): RankedCurrentPlayer[] {
  const evaluated = inputs.map((input) => evaluateCurrentRanking(input, policy, config));

  const historicalOrder = [...evaluated].sort(compareHistoricalRanking);
  const historicalRanks = new Map(
    historicalOrder.map((entry, index) => [entry.playerId, index + 1]),
  );

  const currentOrder = evaluated.filter((entry) => entry.eligible).sort(compareCurrentRanking);
  const currentRanks = new Map(
    currentOrder.map((entry, index) => [entry.playerId, index + 1]),
  );

  return evaluated.map((entry) => ({
    ...entry,
    currentRank: currentRanks.get(entry.playerId) ?? null,
    historicalRank: historicalRanks.get(entry.playerId)!,
  }));
}

export function compareCurrentRanking(
  left: CurrentRankingEvaluation,
  right: CurrentRankingEvaluation,
): number {
  return (
    right.effectiveConservativeRating - left.effectiveConservativeRating
    || right.ratedMatches - left.ratedMatches
    || comparePlayerIds(left.playerId, right.playerId)
  );
}

export function compareHistoricalRanking(
  left: CurrentRankingEvaluation,
  right: CurrentRankingEvaluation,
): number {
  return (
    right.historicalConservativeRating - left.historicalConservativeRating
    || right.ratedMatches - left.ratedMatches
    || comparePlayerIds(left.playerId, right.playerId)
  );
}

function comparePlayerIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
