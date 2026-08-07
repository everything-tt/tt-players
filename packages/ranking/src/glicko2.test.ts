import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GLICKO2_CONFIG,
  calculateRatingMatchEvidence,
  conservativeRating,
  defaultRatingState,
  expectedScore,
  inflateDeviationForInactivity,
  updateRating,
  type RatingObservation,
} from './index.js';

describe('Glicko-2 rating engine', () => {
  it('uses the TT Players default model parameters', () => {
    expect(defaultRatingState()).toEqual({
      rating: 1500,
      deviation: 350,
      volatility: 0.06,
    });
    expect(DEFAULT_GLICKO2_CONFIG).toMatchObject({
      tau: 0.5,
      conservativeDeviationMultiplier: 2,
      provisionalMatches: 10,
      provisionalDeviation: 110,
      inactivityPeriodDays: 28,
    });
  });

  it('matches the worked example from the Glicko-2 paper', () => {
    const updated = updateRating(
      { rating: 1500, deviation: 200, volatility: 0.06 },
      [
        { opponentRating: 1400, opponentDeviation: 30, score: 1 },
        { opponentRating: 1550, opponentDeviation: 100, score: 0 },
        { opponentRating: 1700, opponentDeviation: 300, score: 0 },
      ],
    );

    expect(updated.rating).toBeCloseTo(1464.06, 1);
    expect(updated.deviation).toBeCloseTo(151.52, 1);
    expect(updated.volatility).toBeCloseTo(0.059996, 5);
    expect(updated.conservativeRating).toBeCloseTo(
      conservativeRating(updated),
      10,
    );
  });

  it('is independent of observation ordering within a rating period', () => {
    const state = { rating: 1625, deviation: 145, volatility: 0.06 };
    const observations: RatingObservation[] = [
      { opponentRating: 1750, opponentDeviation: 80, score: 1 },
      { opponentRating: 1480, opponentDeviation: 120, score: 0 },
      { opponentRating: 1600, opponentDeviation: 65, score: 1 },
      { opponentRating: 1680, opponentDeviation: 100, score: 0.5 },
    ];

    const forward = updateRating(state, observations);
    const reversed = updateRating(state, [...observations].reverse());

    expect(reversed.rating).toBeCloseTo(forward.rating, 12);
    expect(reversed.deviation).toBeCloseTo(forward.deviation, 12);
    expect(reversed.volatility).toBeCloseTo(forward.volatility, 12);
  });

  it('supports draws as a first-class score', () => {
    const state = { rating: 1500, deviation: 100, volatility: 0.06 };
    const updated = updateRating(state, [
      { opponentRating: 1500, opponentDeviation: 100, score: 0.5 },
    ]);

    expect(updated.rating).toBeCloseTo(state.rating, 10);
    expect(updated.deviation).toBeLessThan(state.deviation);
  });

  it('converts inactive days to fractional periods and caps uncertainty', () => {
    const state = { rating: 1650, deviation: 50, volatility: 0.06 };
    const oneDay = inflateDeviationForInactivity(state, 1);
    const onePeriod = inflateDeviationForInactivity(state, 28);
    const twoPeriods = inflateDeviationForInactivity(state, 56);
    const longBreak = inflateDeviationForInactivity(state, 100000);

    expect(inflateDeviationForInactivity(state, 0)).toBe(state);
    expect(inflateDeviationForInactivity(state, -10)).toBe(state);
    expect(oneDay.deviation).toBeGreaterThan(state.deviation);
    expect(oneDay.deviation).toBeLessThan(onePeriod.deviation);
    expect(onePeriod.deviation).toBeCloseTo(51.07485043, 6);
    expect(twoPeriods.deviation).toBeGreaterThan(onePeriod.deviation);
    expect(longBreak.deviation).toBe(DEFAULT_GLICKO2_CONFIG.initialDeviation);
  });

  it('uses configurable conservative leaderboard scoring', () => {
    const state = { rating: 1700, deviation: 40, volatility: 0.06 };
    expect(conservativeRating(state)).toBe(1620);
    expect(conservativeRating(state, {
      ...DEFAULT_GLICKO2_CONFIG,
      conservativeDeviationMultiplier: 3,
    })).toBe(1580);
  });

  it('computes expected scores consistently for equal uncertainty', () => {
    const stronger = { rating: 1800, deviation: 80, volatility: 0.06 };
    const weaker = { rating: 1500, deviation: 80, volatility: 0.06 };
    const strongerExpected = expectedScore(stronger, weaker);
    const weakerExpected = expectedScore(weaker, stronger);

    expect(strongerExpected).toBeGreaterThan(0.5);
    expect(weakerExpected).toBeLessThan(0.5);
    expect(strongerExpected + weakerExpected).toBeCloseTo(1, 12);
  });

  it('keeps extreme but valid inputs finite', () => {
    const updated = updateRating(
      { rating: 3000, deviation: 30, volatility: 0.06 },
      [{ opponentRating: 500, opponentDeviation: 350, score: 0 }],
    );

    expect(Number.isFinite(updated.rating)).toBe(true);
    expect(Number.isFinite(updated.deviation)).toBe(true);
    expect(Number.isFinite(updated.volatility)).toBe(true);
    expect(updated.deviation).toBeGreaterThan(0);
    expect(updated.volatility).toBeGreaterThan(0);
  });
});

describe('rating match evidence', () => {
  it('attributes a newcomer upset deterministically', () => {
    const newcomer = defaultRatingState();
    const established = { rating: 2300, deviation: 50, volatility: 0.06 };
    const updated = updateRating(newcomer, [
      {
        opponentRating: established.rating,
        opponentDeviation: established.deviation,
        score: 1,
      },
    ]);
    const evidence = calculateRatingMatchEvidence(
      newcomer,
      established,
      1,
      updated.deviation,
      DEFAULT_GLICKO2_CONFIG,
    );

    expect(evidence.expectedWinProbability).toBeLessThan(0.02);
    expect(evidence.surpriseValue).toBeGreaterThan(0.98);
    expect(evidence.attributedRatingDelta).toBeCloseTo(
      updated.rating - newcomer.rating,
      10,
    );
    expect(evidence.informationContribution).toBeGreaterThan(0);
    expect(calculateRatingMatchEvidence(
      newcomer,
      established,
      1,
      updated.deviation,
      DEFAULT_GLICKO2_CONFIG,
    )).toEqual(evidence);
  });

  it('attributes same-period matches without inventing an ordering', () => {
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
    const attributedDelta = opponents
      .map((opponent) => calculateRatingMatchEvidence(
        player,
        opponent,
        opponent.score,
        updated.deviation,
        DEFAULT_GLICKO2_CONFIG,
      ).attributedRatingDelta)
      .reduce((sum, contribution) => sum + contribution, 0);

    expect(attributedDelta).toBeCloseTo(updated.rating - player.rating, 10);
  });
});
