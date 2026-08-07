import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_GLICKO2_CONFIG,
  calculateRatingMatchEvidence,
  conservativeRating,
  defaultRatingState,
  inflateDeviationForInactivity,
  updateRating,
} from '../dist/index.js';

function closeTo(actual, expected, tolerance, message) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message ?? 'values differ'}: expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test('uses the TT Players Glicko-2 defaults', () => {
  assert.deepEqual(defaultRatingState(), {
    rating: 1500,
    deviation: 350,
    volatility: 0.06,
  });
  assert.equal(DEFAULT_GLICKO2_CONFIG.tau, 0.5);
  assert.equal(DEFAULT_GLICKO2_CONFIG.provisionalMatches, 10);
  assert.equal(DEFAULT_GLICKO2_CONFIG.provisionalDeviation, 110);
  assert.equal(DEFAULT_GLICKO2_CONFIG.inactivityPeriodDays, 28);
});

test('matches the worked example from the Glicko-2 paper', () => {
  const updated = updateRating(
    { rating: 1500, deviation: 200, volatility: 0.06 },
    [
      { opponentRating: 1400, opponentDeviation: 30, score: 1 },
      { opponentRating: 1550, opponentDeviation: 100, score: 0 },
      { opponentRating: 1700, opponentDeviation: 300, score: 0 },
    ],
  );

  closeTo(updated.rating, 1464.06, 0.1, 'rating');
  closeTo(updated.deviation, 151.52, 0.1, 'deviation');
  closeTo(updated.volatility, 0.059996, 0.00001, 'volatility');
});

test('moves winner and loser ratings in the expected directions', () => {
  const equal = { rating: 1500, deviation: 80, volatility: 0.06 };
  const winner = updateRating(equal, [{ opponentRating: 1500, opponentDeviation: 80, score: 1 }]);
  const loser = updateRating(equal, [{ opponentRating: 1500, opponentDeviation: 80, score: 0 }]);

  assert.ok(winner.rating > equal.rating);
  assert.ok(loser.rating < equal.rating);
  closeTo(winner.rating - 1500, 1500 - loser.rating, 0.000001, 'symmetric rating movement');
});

test('supports draws', () => {
  const equal = { rating: 1500, deviation: 80, volatility: 0.06 };
  const updated = updateRating(equal, [{ opponentRating: 1500, opponentDeviation: 80, score: 0.5 }]);

  closeTo(updated.rating, 1500, 0.000001, 'draw rating');
  assert.ok(updated.deviation < equal.deviation);
});

test('inflates inactivity by fractional periods and caps uncertainty', () => {
  const state = { rating: 1650, deviation: 50, volatility: 0.06 };
  assert.equal(inflateDeviationForInactivity(state, 0), state);

  const oneDay = inflateDeviationForInactivity(state, 1);
  const onePeriod = inflateDeviationForInactivity(state, 28);
  const twoPeriods = inflateDeviationForInactivity(state, 56);
  const longBreak = inflateDeviationForInactivity(state, 100000);

  assert.ok(oneDay.deviation > state.deviation);
  assert.ok(oneDay.deviation < onePeriod.deviation);
  closeTo(onePeriod.deviation, 51.07485043, 0.000001, 'one-period deviation');
  assert.ok(twoPeriods.deviation > onePeriod.deviation);
  assert.equal(longBreak.deviation, DEFAULT_GLICKO2_CONFIG.initialDeviation);
});

test('an empty rating period grows uncertainty and recomputes conservative score', () => {
  const state = { rating: 1650, deviation: 50, volatility: 0.06 };
  const updated = updateRating(state, []);

  assert.equal(updated.rating, state.rating);
  assert.ok(updated.deviation > state.deviation);
  closeTo(updated.conservativeRating, conservativeRating(updated), 0.000001);
});

test('uses conservative rating for leaderboard ordering and respects custom config', () => {
  assert.equal(conservativeRating({ rating: 1700, deviation: 40, volatility: 0.06 }), 1620);
  assert.equal(conservativeRating({ rating: 1750, deviation: 180, volatility: 0.06 }), 1390);

  const custom = {
    ...DEFAULT_GLICKO2_CONFIG,
    initialRating: 1200,
    initialDeviation: 250,
    initialVolatility: 0.08,
    conservativeDeviationMultiplier: 1.5,
  };
  assert.deepEqual(defaultRatingState(custom), {
    rating: 1200,
    deviation: 250,
    volatility: 0.08,
  });
  assert.equal(conservativeRating({ rating: 1500, deviation: 100, volatility: 0.08 }, custom), 1350);
});

test('attributes a newcomer upset deterministically', () => {
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

  assert.ok(evidence.expectedWinProbability < 0.02);
  assert.ok(evidence.surpriseValue > 0.98);
  closeTo(evidence.attributedRatingDelta, updated.rating - newcomer.rating, 0.000000001);
  assert.ok(evidence.informationContribution > 0);
  assert.deepEqual(
    calculateRatingMatchEvidence(
      newcomer,
      established,
      1,
      updated.deviation,
      DEFAULT_GLICKO2_CONFIG,
    ),
    evidence,
  );
});

test('same-period evidence contributions sum to the combined rating delta', () => {
  const player = { rating: 1600, deviation: 180, volatility: 0.06 };
  const opponents = [
    { rating: 1750, deviation: 60, volatility: 0.06, score: 1 },
    { rating: 1450, deviation: 80, volatility: 0.06, score: 0 },
    { rating: 1650, deviation: 100, volatility: 0.06, score: 1 },
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
    ).attributedRatingDelta,
  );

  closeTo(
    contributions.reduce((sum, contribution) => sum + contribution, 0),
    updated.rating - player.rating,
    0.000000001,
  );
});
