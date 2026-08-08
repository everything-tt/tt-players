import { describe, expect, it } from 'vitest';
import type { RatingPredictionPlayer } from './rating-queries';
import { formatRatingPointChange, getRatingWinProjection } from './rating-impact';

function predictionPlayer(overrides: Partial<RatingPredictionPlayer> = {}): RatingPredictionPlayer {
  return {
    player_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    player_name: 'Player A',
    rating: 1700,
    rating_deviation: 70,
    volatility: 0.06,
    provisional: false,
    win_probability: 0.6,
    ...overrides,
  };
}

describe('H2H rating impact helpers', () => {
  it('reads finite win projections from an enriched prediction response', () => {
    const player = predictionPlayer() as RatingPredictionPlayer & {
      projected_rating_if_win: number;
      rating_change_if_win: number;
    };
    player.projected_rating_if_win = 1712.34;
    player.rating_change_if_win = 12.34;

    expect(getRatingWinProjection(player)).toEqual({
      projectedRating: 1712.34,
      ratingChange: 12.34,
    });
  });

  it('fails closed for missing or invalid projection fields', () => {
    expect(getRatingWinProjection(null)).toBeNull();
    expect(getRatingWinProjection(predictionPlayer())).toBeNull();

    const invalid = predictionPlayer() as RatingPredictionPlayer & {
      projected_rating_if_win: number;
      rating_change_if_win: number;
    };
    invalid.projected_rating_if_win = Number.NaN;
    invalid.rating_change_if_win = 8;
    expect(getRatingWinProjection(invalid)).toBeNull();
  });

  it('formats rating-point changes without hiding small gains', () => {
    expect(formatRatingPointChange(12.04)).toBe('+12');
    expect(formatRatingPointChange(0.34)).toBe('+0.3');
    expect(formatRatingPointChange(-4.26)).toBe('-4.3');
  });
});
