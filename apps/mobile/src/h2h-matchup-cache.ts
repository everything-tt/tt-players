import type { QueryClient } from '@tanstack/react-query';
import type { H2HAnalysisResponse } from './h2h-analysis-types';
import type { H2HResponse, PlayerSearchItem, RubberItem } from './player-shared';
import type { RatingPredictionResponse } from './rating-queries';

export const h2hDirectQueryKey = (playerId1: string, playerId2: string) =>
  ['players', 'h2h', playerId1, playerId2] as const;

export const h2hPredictionQueryKey = (playerId1: string, playerId2: string) =>
  ['ratings', 'prediction', playerId1, playerId2] as const;

export const h2hAnalysisQueryKey = (playerId1: string, playerId2: string) =>
  ['players', 'h2h', playerId1, playerId2, 'analysis'] as const;

function reverseResult(result: string): string {
  const match = /^(Won|Lost)(?:\s+(\d+)-(\d+))?$/.exec(result.trim());
  if (!match) return result;

  const outcome = match[1] === 'Won' ? 'Lost' : 'Won';
  const firstScore = match[2];
  const secondScore = match[3];
  return firstScore && secondScore
    ? `${outcome} ${secondScore}-${firstScore}`
    : outcome;
}

function reverseEncounter(encounter: RubberItem, newOpponent: PlayerSearchItem): RubberItem {
  return {
    ...encounter,
    opponent: newOpponent.name,
    opponent_id: newOpponent.id,
    result: reverseResult(encounter.result),
    isWin: !encounter.isWin,
  };
}

export function reverseH2HResponse(
  response: H2HResponse,
  newOpponent: PlayerSearchItem,
): H2HResponse {
  return {
    player1_wins: response.player2_wins,
    player2_wins: response.player1_wins,
    encounters: response.encounters.map((encounter) => reverseEncounter(encounter, newOpponent)),
  };
}

export function reverseRatingPredictionResponse(
  response: RatingPredictionResponse,
): RatingPredictionResponse {
  return {
    ...response,
    player1: response.player2,
    player2: response.player1,
  };
}

export function reverseH2HAnalysisResponse(
  response: H2HAnalysisResponse,
): H2HAnalysisResponse {
  return {
    ...response,
    players: {
      player1: response.players.player2,
      player2: response.players.player1,
    },
    common_opponents: {
      ...response.common_opponents,
      player1_advantage: response.common_opponents.player2_advantage,
      player2_advantage: response.common_opponents.player1_advantage,
      aggregate_edge: -response.common_opponents.aggregate_edge,
      data: response.common_opponents.data.map((opponent) => ({
        ...opponent,
        player1: opponent.player2,
        player2: opponent.player1,
        edge: -opponent.edge,
      })),
    },
    form: {
      player1: response.form.player2,
      player2: response.form.player1,
    },
    rating: {
      player1: response.rating.player2,
      player2: response.rating.player1,
    },
  };
}

interface MatchupCacheData {
  direct?: H2HResponse | null;
  prediction?: RatingPredictionResponse | null;
  analysis?: H2HAnalysisResponse | null;
}

export function primeReverseMatchupCache(
  queryClient: QueryClient,
  playerA: PlayerSearchItem,
  playerB: PlayerSearchItem,
  data: MatchupCacheData,
): void {
  if (data.direct) {
    queryClient.setQueryData(
      h2hDirectQueryKey(playerB.id, playerA.id),
      reverseH2HResponse(data.direct, playerA),
    );
  }

  if (data.prediction) {
    queryClient.setQueryData(
      h2hPredictionQueryKey(playerB.id, playerA.id),
      reverseRatingPredictionResponse(data.prediction),
    );
  }

  if (data.analysis) {
    queryClient.setQueryData(
      h2hAnalysisQueryKey(playerB.id, playerA.id),
      reverseH2HAnalysisResponse(data.analysis),
    );
  }
}
