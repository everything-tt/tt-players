import { describe, expect, it } from 'vitest';
import {
    DEFAULT_GLICKO2_CONFIG,
    conservativeRating,
    defaultRatingState,
    inflateDeviationForInactivity,
    updateRating,
} from '../ratings/glicko2.js';
import { calculateRatingMatchEvidence } from '../ratings/rating-audit-evidence.js';

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

    it('attributes a newcomer upset to the same deterministic Glicko evidence', () => {
        const newcomer = defaultRatingState();
        const established = { rating: 2300, deviation: 50, volatility: 0.06 };
        const updated = updateRating(
            newcomer,
            [{ opponentRating: established.rating, opponentDeviation: established.deviation, score: 1 }],
        );
        const evidence = calculateRatingMatchEvidence(
            newcomer,
            established,
            1,
            updated.deviation,
            DEFAULT_GLICKO2_CONFIG,
        );

        expect(evidence.expectedWinProbability).toBeLessThan(0.02);
        expect(evidence.surpriseValue).toBeGreaterThan(0.98);
        expect(evidence.attributedRatingDelta).toBeCloseTo(updated.rating - newcomer.rating, 10);
        expect(evidence.informationContribution).toBeGreaterThan(0);
        expect(calculateRatingMatchEvidence(
            newcomer,
            established,
            1,
            updated.deviation,
            DEFAULT_GLICKO2_CONFIG,
        )).toEqual(evidence);
    });

    it('attributes same-day matches without inventing an ordering', () => {
        const player = { rating: 1600, deviation: 180, volatility: 0.06 };
        const opponents = [
            { rating: 1750, deviation: 60, volatility: 0.06, score: 1 as const },
            { rating: 1450, deviation: 80, volatility: 0.06, score: 0 as const },
            { rating: 1650, deviation: 100, volatility: 0.06, score: 1 as const },
        ];
        const updated = updateRating(
            player,
            opponents.map((opponent) => ({
                opponentRating: opponent.rating,
                opponentDeviation: opponent.deviation,
                score: opponent.score,
            })),
        );
        const contributions = opponents.map((opponent) =>
            calculateRatingMatchEvidence(
                player,
                opponent,
                opponent.score,
                updated.deviation,
                DEFAULT_GLICKO2_CONFIG,
            ).attributedRatingDelta
        );

        expect(contributions.reduce((sum, contribution) => sum + contribution, 0))
            .toBeCloseTo(updated.rating - player.rating, 10);
    });
});
