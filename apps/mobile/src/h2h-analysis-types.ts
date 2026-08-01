export interface H2HFormSummary {
  played: number;
  wins: number;
  losses: number;
  win_rate: number;
  recent_results: Array<'W' | 'L'>;
}

export interface H2HRatingSummary {
  current: number | null;
  change_12_weeks: number | null;
  confidence: 'high' | 'medium' | 'low' | null;
  provisional: boolean | null;
}

export interface H2HCommonOpponent {
  opponent_id: string;
  opponent_name: string;
  player1: H2HFormSummary;
  player2: H2HFormSummary;
  edge: number;
}

export interface H2HAnalysisResponse {
  players: {
    player1: { id: string; name: string };
    player2: { id: string; name: string };
  };
  common_opponents: {
    total: number;
    player1_advantage: number;
    player2_advantage: number;
    even: number;
    aggregate_edge: number;
    data: H2HCommonOpponent[];
  };
  form: {
    player1: H2HFormSummary;
    player2: H2HFormSummary;
  };
  rating: {
    player1: H2HRatingSummary;
    player2: H2HRatingSummary;
  };
  evidence: {
    confidence: 'high' | 'medium' | 'low';
    sample_size: number;
    reasons: string[];
  };
}
