import type { PlayerRatingHistoryPoint } from './rating-queries';

export interface RatingHistorySummary {
  current: number;
  peak: number;
  peakDate: string;
  rangeChange: number;
}

export function buildRatingHistorySummary(
  history: PlayerRatingHistoryPoint[],
): RatingHistorySummary | null {
  if (history.length === 0) return null;

  const first = history[0]!;
  const latest = history[history.length - 1]!;
  const peak = history.reduce((highest, point) =>
    point.rating > highest.rating ? point : highest,
  first);

  return {
    current: Math.round(latest.rating),
    peak: Math.round(peak.rating),
    peakDate: peak.snapshot_date,
    rangeChange: Math.round(latest.rating - first.rating),
  };
}
