import { describe, expect, it } from 'vitest';
import {
    type RatingRow,
    predictMatch,
    presentPredictionPlayer,
    presentRating,
    ratingConfidence,
} from '../ratings/domain.js';
import { historyStartDate, presentHistoryPoint } from '../ratings/history.js';

function ratingRow(overrides: Partial<RatingRow> = {}): RatingRow {
    return {
        player_id: '00000000-0000-0000-0000-000000000001',
        player_name: 'Player One',
        rating: '1600',
        rating_deviation: '60',
        volatility: '0.059996',
        conservative_rating: '1480',
        rated_matches: '20',
        rated_wins: '14',
        rated_losses: '6',
        provisional: false,
        first_rated_at: '2026-01-01',
        last_rated_at: new Date('2026-07-01T12:00:00Z'),
        ...overrides,
    };
}

describe('shared rating domain', () => {
    it('uses stable confidence thresholds', () => {
        expect(ratingConfidence(70)).toBe('high');
        expect(ratingConfidence(71)).toBe('medium');
        expect(ratingConfidence(120)).toBe('medium');
        expect(ratingConfidence(121)).toBe('low');
    });

    it('normalizes database values into the public rating shape', () => {
        expect(presentRating(ratingRow(), 3)).toEqual({
            rank: 3,
            player_id: '00000000-0000-0000-0000-000000000001',
            player_name: 'Player One',
            rating: 1600,
            rating_deviation: 60,
            volatility: 0.059996,
            conservative_rating: 1480,
            rating_low: 1480,
            rating_high: 1720,
            confidence: 'high',
            rated_matches: 20,
            rated_wins: 14,
            rated_losses: 6,
            win_rate: 0.7,
            provisional: false,
            first_rated_at: '2026-01-01',
            last_rated_at: '2026-07-01',
        });
    });

    it('produces symmetric probabilities and lowers confidence for provisional players', () => {
        const player1 = ratingRow();
        const player2 = ratingRow({
            player_id: '00000000-0000-0000-0000-000000000002',
            player_name: 'Player Two',
            provisional: true,
        });

        const prediction = predictMatch(player1, player2);
        expect(prediction.player1Probability + prediction.player2Probability).toBeCloseTo(1, 12);
        expect(prediction.player1Probability).toBeCloseTo(0.5, 4);
        expect(prediction.confidence).toBe('low');
        expect(presentPredictionPlayer(player1, prediction.player1Probability)).toMatchObject({
            player_id: player1.player_id,
            volatility: 0.059996,
            win_probability: 0.5,
        });
    });
});

describe('rating history domain', () => {
    const now = new Date('2026-07-31T18:30:00Z');

    it('calculates deterministic range boundaries', () => {
        expect(historyStartDate('3m', now)).toBe('2026-05-01');
        expect(historyStartDate('1y', now)).toBe('2025-07-31');
        expect(historyStartDate('3y', now)).toBe('2023-07-31');
        expect(historyStartDate('10y', now)).toBe('2016-07-31');
        expect(historyStartDate('all', now)).toBeNull();
    });

    it('presents history points using the same rating rules', () => {
        expect(presentHistoryPoint({
            week_start: new Date('2026-07-20T00:00:00Z'),
            snapshot_date: '2026-07-26',
            rating: '1600',
            rating_deviation: '80',
            conservative_rating: '1440',
            previous_rating: '1575.25',
            rated_matches: '20',
            rated_wins: '14',
            rated_losses: '6',
            week_matches: '3',
            week_wins: '2',
            week_losses: '1',
            provisional: false,
        })).toMatchObject({
            week_start: '2026-07-20',
            snapshot_date: '2026-07-26',
            rating: 1600,
            rating_change: 24.75,
            confidence: 'medium',
            week_matches: 3,
        });
    });
});
