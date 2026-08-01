import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { H2HAnalysisResponse } from './h2h-analysis-types';
import type { H2HResponse, PlayerSearchItem } from './player-shared';
import type { RatingPredictionResponse } from './rating-queries';
import {
  h2hAnalysisQueryKey,
  h2hDirectQueryKey,
  h2hPredictionQueryKey,
  primeReverseMatchupCache,
} from './h2h-matchup-cache';

const playerA: PlayerSearchItem = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Player A',
  played: 10,
  wins: 6,
};

const playerB: PlayerSearchItem = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  name: 'Player B',
  played: 12,
  wins: 8,
};

const direct: H2HResponse = {
  player1_wins: 2,
  player2_wins: 1,
  encounters: [
    {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      fixture_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      date: '2026-07-01',
      source: 'league',
      source_label: 'Test League',
      event_id: null,
      event_name: null,
      league: 'Test League · Division 1',
      opponent: playerB.name,
      opponent_id: playerB.id,
      result: 'Won 3-1',
      isWin: true,
    },
  ],
};

const prediction: RatingPredictionResponse = {
  model: 'test-model',
  confidence: 'medium',
  combined_deviation: 100,
  player1: {
    player_id: playerA.id,
    player_name: playerA.name,
    rating: 1900,
    rating_deviation: 70,
    provisional: false,
    win_probability: 0.4,
  },
  player2: {
    player_id: playerB.id,
    player_name: playerB.name,
    rating: 2000,
    rating_deviation: 72,
    provisional: false,
    win_probability: 0.6,
  },
};

const analysis: H2HAnalysisResponse = {
  players: {
    player1: { id: playerA.id, name: playerA.name },
    player2: { id: playerB.id, name: playerB.name },
  },
  common_opponents: {
    total: 3,
    player1_advantage: 1,
    player2_advantage: 2,
    even: 0,
    aggregate_edge: -20,
    data: [
      {
        opponent_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        opponent_name: 'Shared Opponent',
        player1: { played: 2, wins: 1, losses: 1, win_rate: 50, recent_results: [] },
        player2: { played: 2, wins: 2, losses: 0, win_rate: 100, recent_results: [] },
        edge: -50,
      },
    ],
  },
  form: {
    player1: { played: 5, wins: 2, losses: 3, win_rate: 40, recent_results: ['L', 'W', 'L', 'W', 'L'] },
    player2: { played: 5, wins: 4, losses: 1, win_rate: 80, recent_results: ['W', 'W', 'L', 'W', 'W'] },
  },
  rating: {
    player1: { current: 1900, change_12_weeks: 20, confidence: 'high', provisional: false },
    player2: { current: 2000, change_12_weeks: 10, confidence: 'high', provisional: false },
  },
  evidence: {
    confidence: 'medium',
    sample_size: 18,
    reasons: ['Player B has the stronger aggregate record against shared opponents.'],
  },
};

describe('H2H reverse matchup cache', () => {
  it('primes all reverse query keys with correctly reoriented data', () => {
    const queryClient = new QueryClient();

    primeReverseMatchupCache(queryClient, playerA, playerB, {
      direct,
      prediction,
      analysis,
    });

    expect(queryClient.getQueryData<H2HResponse>(h2hDirectQueryKey(playerB.id, playerA.id))).toEqual({
      player1_wins: 1,
      player2_wins: 2,
      encounters: [
        expect.objectContaining({
          opponent: playerA.name,
          opponent_id: playerA.id,
          result: 'Lost 1-3',
          isWin: false,
        }),
      ],
    });

    expect(queryClient.getQueryData<RatingPredictionResponse>(h2hPredictionQueryKey(playerB.id, playerA.id))).toEqual({
      ...prediction,
      player1: prediction.player2,
      player2: prediction.player1,
    });

    expect(queryClient.getQueryData<H2HAnalysisResponse>(h2hAnalysisQueryKey(playerB.id, playerA.id))).toEqual({
      ...analysis,
      players: {
        player1: analysis.players.player2,
        player2: analysis.players.player1,
      },
      common_opponents: {
        ...analysis.common_opponents,
        player1_advantage: 2,
        player2_advantage: 1,
        aggregate_edge: 20,
        data: [
          {
            ...analysis.common_opponents.data[0],
            player1: analysis.common_opponents.data[0]!.player2,
            player2: analysis.common_opponents.data[0]!.player1,
            edge: 50,
          },
        ],
      },
      form: {
        player1: analysis.form.player2,
        player2: analysis.form.player1,
      },
      rating: {
        player1: analysis.rating.player2,
        player2: analysis.rating.player1,
      },
    });
  });
});
