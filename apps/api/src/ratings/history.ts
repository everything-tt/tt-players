import { ratingConfidence, round, toDateString } from './domain.js';

export type HistoryRange = '3m' | '1y' | '3y' | '10y' | 'all';

export interface HistoryRow {
    week_start: string | Date;
    snapshot_date: string | Date;
    rating: number | string;
    rating_deviation: number | string;
    conservative_rating: number | string;
    previous_rating: number | string | null;
    rated_matches: number | string;
    rated_wins: number | string;
    rated_losses: number | string;
    week_matches: number | string;
    week_wins: number | string;
    week_losses: number | string;
    provisional: boolean;
}

export function historyStartDate(range: HistoryRange, now = new Date()): string | null {
    if (range === 'all') return null;

    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (range === '3m') date.setUTCMonth(date.getUTCMonth() - 3);
    if (range === '1y') date.setUTCFullYear(date.getUTCFullYear() - 1);
    if (range === '3y') date.setUTCFullYear(date.getUTCFullYear() - 3);
    if (range === '10y') date.setUTCFullYear(date.getUTCFullYear() - 10);
    return date.toISOString().slice(0, 10);
}

export function presentHistoryPoint(row: HistoryRow) {
    const rating = Number(row.rating);
    const deviation = Number(row.rating_deviation);
    const previousRating = row.previous_rating === null
        ? null
        : Number(row.previous_rating);

    return {
        week_start: toDateString(row.week_start)!,
        snapshot_date: toDateString(row.snapshot_date)!,
        rating,
        rating_deviation: deviation,
        conservative_rating: Number(row.conservative_rating),
        rating_low: round(rating - 2 * deviation, 2),
        rating_high: round(rating + 2 * deviation, 2),
        rating_change: previousRating === null ? null : round(rating - previousRating, 2),
        confidence: ratingConfidence(deviation),
        rated_matches: Number(row.rated_matches),
        rated_wins: Number(row.rated_wins),
        rated_losses: Number(row.rated_losses),
        week_matches: Number(row.week_matches),
        week_wins: Number(row.week_wins),
        week_losses: Number(row.week_losses),
        provisional: row.provisional,
    };
}
