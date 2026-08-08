import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CURRENT_RANKING_POLICY,
  classifyRankingEligibility,
  evaluateCurrentRanking,
  rankCurrentPlayers,
  type CurrentRankingInput,
} from './index.js';

describe('current ranking policy', () => {
  it('matches the TT Players default active-ranking thresholds', () => {
    expect(DEFAULT_CURRENT_RANKING_POLICY).toEqual({
      activeDays: 365,
      minimumMatches: 10,
      minimumUniqueOpponents: 5,
      maximumDeviation: 110,
    });
  });

  it('preserves the production eligibility precedence', () => {
    expect(classifyRankingEligibility({
      hasCriticalIssue: true,
      ratedMatches: 0,
      uniqueOpponents: 0,
      daysInactive: 1000,
      effectiveDeviation: 350,
    })).toBe('critical_data_issue');

    expect(classifyRankingEligibility({
      hasCriticalIssue: false,
      ratedMatches: 9,
      uniqueOpponents: 20,
      daysInactive: 0,
      effectiveDeviation: 50,
    })).toBe('insufficient_matches');

    expect(classifyRankingEligibility({
      hasCriticalIssue: false,
      ratedMatches: 20,
      uniqueOpponents: 4,
      daysInactive: 0,
      effectiveDeviation: 50,
    })).toBe('insufficient_opponents');

    expect(classifyRankingEligibility({
      hasCriticalIssue: false,
      ratedMatches: 20,
      uniqueOpponents: 10,
      daysInactive: 366,
      effectiveDeviation: 50,
    })).toBe('inactive');

    expect(classifyRankingEligibility({
      hasCriticalIssue: false,
      ratedMatches: 20,
      uniqueOpponents: 10,
      daysInactive: 0,
      effectiveDeviation: 111,
    })).toBe('high_uncertainty');
  });

  it('uses present-day inactivity inflation for the active leaderboard', () => {
    const evaluated = evaluateCurrentRanking({
      playerId: 'player-a',
      state: { rating: 1800, deviation: 70, volatility: 0.06 },
      ratedMatches: 40,
      uniqueOpponents: 20,
      daysInactive: 180,
    });

    expect(evaluated.effectiveDeviation).toBeGreaterThan(70);
    expect(evaluated.effectiveConservativeRating).toBeLessThan(
      evaluated.historicalConservativeRating,
    );
  });

  it('reproduces current and historical ordering deterministically', () => {
    const players: CurrentRankingInput[] = [
      {
        playerId: 'active-b',
        state: { rating: 1810, deviation: 70, volatility: 0.06 },
        ratedMatches: 35,
        uniqueOpponents: 20,
        daysInactive: 10,
      },
      {
        playerId: 'inactive-best-history',
        state: { rating: 2100, deviation: 65, volatility: 0.06 },
        ratedMatches: 80,
        uniqueOpponents: 35,
        daysInactive: 700,
      },
      {
        playerId: 'active-a',
        state: { rating: 1800, deviation: 60, volatility: 0.06 },
        ratedMatches: 40,
        uniqueOpponents: 20,
        daysInactive: 10,
      },
    ];

    const ranked = rankCurrentPlayers(players);
    const byId = new Map(ranked.map((player) => [player.playerId, player]));

    expect(byId.get('inactive-best-history')?.historicalRank).toBe(1);
    expect(byId.get('inactive-best-history')?.currentRank).toBeNull();
    expect(byId.get('active-a')?.currentRank).toBe(1);
    expect(byId.get('active-b')?.currentRank).toBe(2);
  });

  it('uses rated matches and player id as stable tie breakers', () => {
    const players: CurrentRankingInput[] = [
      {
        playerId: 'b',
        state: { rating: 1700, deviation: 50, volatility: 0.06 },
        ratedMatches: 20,
        uniqueOpponents: 10,
        daysInactive: 0,
      },
      {
        playerId: 'c',
        state: { rating: 1700, deviation: 50, volatility: 0.06 },
        ratedMatches: 30,
        uniqueOpponents: 10,
        daysInactive: 0,
      },
      {
        playerId: 'a',
        state: { rating: 1700, deviation: 50, volatility: 0.06 },
        ratedMatches: 20,
        uniqueOpponents: 10,
        daysInactive: 0,
      },
    ];

    const ranked = rankCurrentPlayers(players);
    const byId = new Map(ranked.map((player) => [player.playerId, player]));

    expect(byId.get('c')?.currentRank).toBe(1);
    expect(byId.get('a')?.currentRank).toBe(2);
    expect(byId.get('b')?.currentRank).toBe(3);
  });
});
