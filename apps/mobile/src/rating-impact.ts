import type { RatingPredictionPlayer } from './rating-queries';

export interface RatingWinProjection {
  projectedRating: number;
  ratingChange: number;
}

type PredictionPlayerWithProjection = RatingPredictionPlayer & Partial<{
  projected_rating_if_win: number;
  rating_change_if_win: number;
}>;

export function getRatingWinProjection(
  player: RatingPredictionPlayer | null | undefined,
): RatingWinProjection | null {
  if (!player) return null;

  const candidate = player as PredictionPlayerWithProjection;
  if (
    typeof candidate.projected_rating_if_win !== 'number'
    || !Number.isFinite(candidate.projected_rating_if_win)
    || typeof candidate.rating_change_if_win !== 'number'
    || !Number.isFinite(candidate.rating_change_if_win)
  ) {
    return null;
  }

  return {
    projectedRating: candidate.projected_rating_if_win,
    ratingChange: candidate.rating_change_if_win,
  };
}

export function formatRatingPointChange(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const formatted = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${rounded >= 0 ? '+' : ''}${formatted}`;
}
