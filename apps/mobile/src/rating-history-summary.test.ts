import { describe, expect, it } from 'vitest';
import type { PlayerRatingHistoryPoint } from './rating-queries';
import { buildRatingHistorySummary } from './rating-history-summary';

function point(snapshotDate: string, rating: number): PlayerRatingHistoryPoint {
  return {
    week_start: snapshotDate,
    snapshot_date: snapshotDate,
    rating,
    rating_deviation: 50,
    conservative_rating: rating - 100,
    rating_low: rating - 50,
    rating_high: rating + 50,
    rating_change: null,
    confidence: 'high',
    rated_matches: 10,
    rated_wins: 6,
    rated_losses: 4,
    week_matches: 2,
    week_wins: 1,
    week_losses: 1,
    provisional: false,
  };
}

describe('buildRatingHistorySummary', () => {
  it('returns current, peak and first-to-latest change for the selected range', () => {
    const summary = buildRatingHistorySummary([
      point('2026-01-01', 1512.4),
      point('2026-02-01', 1620.7),
      point('2026-03-01', 1580.2),
    ]);

    expect(summary).toEqual({
      current: 1580,
      peak: 1621,
      peakDate: '2026-02-01',
      rangeChange: 68,
    });
  });

  it('returns null when the selected range has no history', () => {
    expect(buildRatingHistorySummary([])).toBeNull();
  });
});
