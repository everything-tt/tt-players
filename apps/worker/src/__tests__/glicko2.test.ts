import { describe, expect, it } from 'vitest';
import {
    DEFAULT_GLICKO2_CONFIG,
    conservativeRating,
    defaultRatingState,
    inflateDeviationForInactivity,
    updateRating,
} from '../ratings/glicko2.js';

describe('Glicko-2', () => {
    it('uses the required initial state and convergence configuration', () => {
        expect(defaultRatingState()).toEqual({
            rating: 1500,
            deviation: 350,
            volatility: 0.06,
        });
        expect(DEFAULT_GLICKO2_CONFIG.tau).toBe(0.5);
        expect(DEFAULT_GLICKO2_CONFIG.provisionalMatches).toBe(10);
        expect(DEFAULT_GLICKO2_CONFIG.provisionalDeviation).toBe(110);
        expect(DEFAULT_GLICKO2_CONFIG.inactivityPeriodDays).toBe(28);
    });

    it('matches the worked example from the Glicko-2 paper', () => {
        const updated = updateRating(
            { rating: 1500, deviation: 200, volatility: 0.06 },
            [
                { opponentRating: 1400, opponentDeviation: 30, score: 1 },
                { opponentRating: 1550, opponentDeviation: 100, score: 0 },
                { opponentRating: 1700, opponentDeviation: 300, score: 0 },
            ],
            DEFAULT_GLICKO2_CONFIG,
        );

        expect(updated.rating).toBeCloseTo(1464.06, 1);
        expect(updated.deviation).toBeCloseTo(151.52, 1);
        expect(updated.volatility).toBeCloseTo(0.059996, 5);
    });

    it('converts inactive days to fractional 28-day periods and caps uncertainty', () => {
        const state = { rating: 1650, deviation: 50, volatility: 0.06 };
        const oneDay = inflateDeviationForInactivity(state, 1);
        const onePeriod = inflateDeviationForInactivity(state, 28);
        const twoPeriods = inflateDeviationForInactivity(state, 56);
        const longBreak = inflateDeviationForInactivity(state, 100000);

        expect(oneDay.deviation).toBeGreaterThan(state.deviation);
        expect(oneDay.deviation).toBeLessThan(onePeriod.deviation);
        expect(onePeriod.deviation).toBeCloseTo(51.07485043, 6);
        expect(twoPeriods.deviation).toBeGreaterThan(onePeriod.deviation);
        expect(longBreak.deviation).toBe(DEFAULT_GLICKO2_CONFIG.initialDeviation);
    });

    it('uses a conservative score for leaderboard ordering', () => {
        expect(conservativeRating({ rating: 1700, deviation: 40, volatility: 0.06 })).toBe(1620);
        expect(conservativeRating({ rating: 1750, deviation: 180, volatility: 0.06 })).toBe(1390);
    });
});
