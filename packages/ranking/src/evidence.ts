import type { Glicko2Config, RatingScore, RatingState } from './glicko2.js';

const PI_SQUARED = Math.PI * Math.PI;

export interface RatingMatchEvidence {
  expectedWinProbability: number;
  surpriseValue: number;
  attributedRatingDelta: number;
  informationContribution: number;
}

/**
 * Derives a single observation's evidence from the same Glicko-2 terms used by
 * the period update. The attributed deltas for every observation in a period
 * sum to the period's combined rating delta; no within-period ordering is needed.
 */
export function calculateRatingMatchEvidence(
  player: RatingState,
  opponent: RatingState,
  score: RatingScore,
  updatedDeviation: number,
  config: Glicko2Config,
): RatingMatchEvidence {
  const playerMu = (player.rating - config.initialRating) / config.ratingScale;
  const opponentMu = (opponent.rating - config.initialRating) / config.ratingScale;
  const opponentPhi = opponent.deviation / config.ratingScale;
  const g = 1 / Math.sqrt(1 + (3 * opponentPhi * opponentPhi) / PI_SQUARED);
  const expectedWinProbability = 1 / (1 + Math.exp(-g * (playerMu - opponentMu)));
  const surpriseValue = score - expectedWinProbability;
  const updatedPhi = updatedDeviation / config.ratingScale;

  return {
    expectedWinProbability,
    surpriseValue,
    attributedRatingDelta:
      config.ratingScale * updatedPhi * updatedPhi * g * surpriseValue,
    informationContribution:
      g * g * expectedWinProbability * (1 - expectedWinProbability),
  };
}
