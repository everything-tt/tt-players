export type CommonOpponentSort = 'evidence' | 'recent' | 'edge' | 'closest';

export interface CommonOpponentRecord {
  played: number;
  wins: number;
  losses: number;
  win_rate: number;
}

export interface CommonOpponentItem {
  opponent_id: string;
  opponent_name: string;
  latest_played_at: string | null;
  combined_played: number;
  player1: CommonOpponentRecord;
  player2: CommonOpponentRecord;
  edge: number;
}

export interface CommonOpponentsResponse {
  players: {
    player1: { id: string; name: string };
    player2: { id: string; name: string };
  };
  total: number;
  data: CommonOpponentItem[];
  next_cursor: string | null;
}
