import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_CURRENT_RANKING_POLICY,
  DEFAULT_GLICKO2_CONFIG,
  calculateRatingMatchEvidence,
  classifyRankingEligibility,
  compareCurrentRanking,
  compareHistoricalRanking,
  conservativeRating,
  defaultRatingState,
  evaluateCurrentRanking,
  expectedScore,
  inflateDeviationForInactivity,
  rankCurrentPlayers,
  updateRating,
} from '../dist/index.js';

const CUSTOM_CONFIG = {
  ...DEFAULT_GLICKO2_CONFIG,
  initialRating: 1400,
  initialDeviation: 300,
  initialVolatility: 0.08,
  tau: 0.7,
  ratingScale: 180,
  conservativeDeviationMultiplier: 3,
  provisionalMatches: 12,
  provisionalDeviation: 100,
  inactivityPeriodDays: 14,
};

function rankingInput(overrides = {}) {
  return {
    playerId: 'player-a',
    state: { rating: 1700, deviation: 60, volatility: 0.06 },
    ratedMatches: 20,
    uniqueOpponents: 10,
    daysInactive: 0,
    ...overrides,
  };
}

function evaluation(overrides = {}) {
  return {
    ...rankingInput(),
    effectiveDeviation: 60,
    effectiveConservativeRating: 1580,
    historicalConservativeRating: 1580,
    eligible: true,
    eligibilityReason: 'ranked',
    ...overrides,
  };
}

test('covers defaults and configurable rating helpers', () => {
  assert.deepEqual(defaultRatingState(), {
    rating: 1500,
    deviation: 350,
    volatility: 0.06,
  });
  assert.deepEqual(defaultRatingState(CUSTOM_CONFIG), {
    rating: 1400,
    deviation: 300,
    volatility: 0.08,
  });

  const state = { rating: 1700, deviation: 40, volatility: 0.06 };
  assert.equal(conservativeRating(state), 1620);
  assert.equal(conservativeRating(state, CUSTOM_CONFIG), 1580);

  const stronger = { rating: 1800, deviation: 80, volatility: 0.06 };
  const weaker = { rating: 1500, deviation: 80, volatility: 0.06 };
  assert.ok(expectedScore(stronger, weaker) > 0.5);
  assert.ok(expectedScore(stronger, weaker, CUSTOM_CONFIG) > 0.5);
});

test('covers inactivity identity, growth, cap, and invalid period normalization', () => {
  const state = { rating: 1650, deviation: 50, volatility: 0.06 };
  assert.equal(inflateDeviationForInactivity(state, 0), state);
  assert.equal(inflateDeviationForInactivity(state, -1, CUSTOM_CONFIG), state);

  const grown = inflateDeviationForInactivity(state, 14, CUSTOM_CONFIG);
  assert.ok(grown.deviation > state.deviation);
  assert.equal(grown.rating, state.rating);
  assert.equal(grown.volatility, state.volatility);

  const capped = inflateDeviationForInactivity(state, 100000);
  assert.equal(capped.deviation, DEFAULT_GLICKO2_CONFIG.initialDeviation);

  const normalized = inflateDeviationForInactivity(state, 2, {
    ...CUSTOM_CONFIG,
    inactivityPeriodDays: 0,
  });
  assert.ok(normalized.deviation > grown.deviation);
});

test('covers empty periods and both volatility-search paths', () => {
  const state = { rating: 1650, deviation: 50, volatility: 0.06 };
  const empty = updateRating(state, []);
  assert.equal(empty.rating, state.rating);
  assert.ok(empty.deviation > state.deviation);
  assert.equal(empty.conservativeRating, conservativeRating(empty));

  // The published Glicko-2 worked example takes the delta^2 <= phi^2 + v path.
  const worked = updateRating(
    { rating: 1500, deviation: 200, volatility: 0.06 },
    [
      { opponentRating: 1400, opponentDeviation: 30, score: 1 },
      { opponentRating: 1550, opponentDeviation: 100, score: 0 },
      { opponentRating: 1700, opponentDeviation: 300, score: 0 },
    ],
    DEFAULT_GLICKO2_CONFIG,
  );
  assert.ok(Math.abs(worked.rating - 1464.06) < 0.2);

  // A very surprising result takes the delta^2 > phi^2 + v path.
  const upset = updateRating(
    defaultRatingState(),
    [{ opponentRating: 2300, opponentDeviation: 50, score: 1 }],
  );
  assert.ok(upset.rating > DEFAULT_GLICKO2_CONFIG.initialRating);

  // Balanced, very high-information observations with a wide volatility search
  // exercise the iterative B-search branch before convergence.
  const balanced = Array.from({ length: 400 }, (_, index) => ({
    opponentRating: 1500,
    opponentDeviation: 0.0001,
    score: index % 2 === 0 ? 1 : 0,
  }));
  const searched = updateRating(
    { rating: 1500, deviation: DEFAULT_GLICKO2_CONFIG.ratingScale * 0.01, volatility: 1 },
    balanced,
    { ...DEFAULT_GLICKO2_CONFIG, tau: 5 },
  );
  assert.ok(Number.isFinite(searched.volatility));
  assert.ok(searched.volatility > 0);
});

test('covers evidence calculations for win, draw, and loss scores', () => {
  const player = { rating: 1600, deviation: 180, volatility: 0.06 };
  const opponent = { rating: 1750, deviation: 60, volatility: 0.06 };
  const updated = updateRating(player, [
    { opponentRating: opponent.rating, opponentDeviation: opponent.deviation, score: 1 },
  ]);

  const win = calculateRatingMatchEvidence(
    player,
    opponent,
    1,
    updated.deviation,
    DEFAULT_GLICKO2_CONFIG,
  );
  const draw = calculateRatingMatchEvidence(
    player,
    opponent,
    0.5,
    updated.deviation,
    DEFAULT_GLICKO2_CONFIG,
  );
  const loss = calculateRatingMatchEvidence(
    player,
    opponent,
    0,
    updated.deviation,
    DEFAULT_GLICKO2_CONFIG,
  );

  assert.ok(win.surpriseValue > draw.surpriseValue);
  assert.ok(draw.surpriseValue > loss.surpriseValue);
  assert.ok(win.informationContribution > 0);
});

test('covers every ranking eligibility result and exact boundaries', () => {
  const base = {
    hasCriticalIssue: false,
    ratedMatches: DEFAULT_CURRENT_RANKING_POLICY.minimumMatches,
    uniqueOpponents: DEFAULT_CURRENT_RANKING_POLICY.minimumUniqueOpponents,
    daysInactive: DEFAULT_CURRENT_RANKING_POLICY.activeDays,
    effectiveDeviation: DEFAULT_CURRENT_RANKING_POLICY.maximumDeviation,
  };

  assert.equal(classifyRankingEligibility(base), 'ranked');
  assert.equal(classifyRankingEligibility({ ...base, hasCriticalIssue: true }), 'critical_data_issue');
  assert.equal(classifyRankingEligibility({ ...base, ratedMatches: 9 }), 'insufficient_matches');
  assert.equal(classifyRankingEligibility({ ...base, uniqueOpponents: 4 }), 'insufficient_opponents');
  assert.equal(classifyRankingEligibility({ ...base, daysInactive: 366 }), 'inactive');
  assert.equal(classifyRankingEligibility({ ...base, effectiveDeviation: 111 }), 'high_uncertainty');

  const permissive = {
    activeDays: 1000,
    minimumMatches: 0,
    minimumUniqueOpponents: 0,
    maximumDeviation: 500,
  };
  assert.equal(classifyRankingEligibility({ ...base, ratedMatches: 0 }, permissive), 'ranked');
});

test('covers ranking evaluation defaults, explicit config, and negative inactivity', () => {
  const defaultEvaluation = evaluateCurrentRanking(rankingInput());
  assert.equal(defaultEvaluation.eligibilityReason, 'ranked');
  assert.equal(defaultEvaluation.eligible, true);

  const negative = evaluateCurrentRanking(
    rankingInput({ daysInactive: -20, hasCriticalIssue: false }),
    DEFAULT_CURRENT_RANKING_POLICY,
    CUSTOM_CONFIG,
  );
  assert.equal(negative.daysInactive, 0);
  assert.equal(negative.effectiveDeviation, negative.state.deviation);

  const critical = evaluateCurrentRanking(rankingInput({ hasCriticalIssue: true }));
  assert.equal(critical.eligible, false);
  assert.equal(critical.eligibilityReason, 'critical_data_issue');
});

test('covers ranking list defaults, explicit policy/config, empty input, and null current rank', () => {
  assert.deepEqual(rankCurrentPlayers([]), []);

  const players = [
    rankingInput({ playerId: 'a', ratedMatches: 30 }),
    rankingInput({ playerId: 'b', ratedMatches: 20 }),
    rankingInput({ playerId: 'c', daysInactive: 1000, state: { rating: 2200, deviation: 60, volatility: 0.06 } }),
  ];
  const ranked = rankCurrentPlayers(players);
  const byId = new Map(ranked.map((entry) => [entry.playerId, entry]));
  assert.equal(byId.get('a').currentRank, 1);
  assert.equal(byId.get('b').currentRank, 2);
  assert.equal(byId.get('c').currentRank, null);
  assert.equal(byId.get('c').historicalRank, 1);

  const explicit = rankCurrentPlayers(
    [rankingInput({ playerId: 'only' })],
    DEFAULT_CURRENT_RANKING_POLICY,
    CUSTOM_CONFIG,
  );
  assert.equal(explicit[0].currentRank, 1);
});

test('covers every comparator tie-break branch including equal player ids', () => {
  const highCurrent = evaluation({ playerId: 'z', effectiveConservativeRating: 1700 });
  const lowCurrent = evaluation({ playerId: 'a', effectiveConservativeRating: 1600 });
  assert.ok(compareCurrentRanking(highCurrent, lowCurrent) < 0);

  const manyMatches = evaluation({ playerId: 'z', ratedMatches: 30 });
  const fewMatches = evaluation({ playerId: 'a', ratedMatches: 20 });
  assert.ok(compareCurrentRanking(manyMatches, fewMatches) < 0);

  const idA = evaluation({ playerId: 'a' });
  const idB = evaluation({ playerId: 'b' });
  assert.ok(compareCurrentRanking(idA, idB) < 0);
  assert.ok(compareCurrentRanking(idB, idA) > 0);
  assert.equal(compareCurrentRanking(idA, idA), 0);

  const highHistorical = evaluation({ playerId: 'z', historicalConservativeRating: 1700 });
  const lowHistorical = evaluation({ playerId: 'a', historicalConservativeRating: 1600 });
  assert.ok(compareHistoricalRanking(highHistorical, lowHistorical) < 0);
  assert.ok(compareHistoricalRanking(manyMatches, fewMatches) < 0);
  assert.ok(compareHistoricalRanking(idA, idB) < 0);
  assert.ok(compareHistoricalRanking(idB, idA) > 0);
  assert.equal(compareHistoricalRanking(idA, idA), 0);
});
