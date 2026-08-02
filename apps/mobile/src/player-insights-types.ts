export type PlayerMomentum = 'hot' | 'steady' | 'cold' | 'new';

export interface PlayerCareerYear {
  year: number;
  played: number;
  wins: number;
  losses: number;
  win_rate: number;
}

export interface PlayerInsightMonth {
  month: string;
  played: number;
  win_rate: number;
}

export interface PlayerInsightsReport {
  player_id: string;
  player_name: string;
  years_played: number;
  first_match_date: string | null;
  latest_match_date: string | null;
  career_by_year: PlayerCareerYear[];
  peaks: {
    best_season: {
      year: number;
      played: number;
      win_rate: number;
    } | null;
    most_active_season: {
      year: number;
      played: number;
    } | null;
    best_month: PlayerInsightMonth | null;
    worst_month: PlayerInsightMonth | null;
  };
  form: {
    rolling_10_win_rate: number;
    rolling_20_win_rate: number;
    momentum: PlayerMomentum;
    recent_results: Array<'W' | 'L'>;
  };
  milestones: {
    total_matches: number;
    longest_win_streak: number;
    milestone_hits: number[];
  };
  projection: {
    current_season_matches: number;
    current_season_win_rate: number;
    projected_matches: number;
    on_track_for_70_win_rate: boolean;
  };
}

export interface PlayerRivalRecord {
  opponent_id: string;
  opponent_name: string;
  played: number;
  wins: number;
  losses: number;
  win_rate: number;
}

export interface PlayerImprovingRivalRecord {
  opponent_id: string;
  opponent_name: string;
  played: number;
  first_half_win_rate: number;
  second_half_win_rate: number;
  delta_points: number;
}

export interface PlayerRivalsResponse {
  player_id: string;
  toughest: PlayerRivalRecord[];
  easiest: PlayerRivalRecord[];
  improving: PlayerImprovingRivalRecord[];
}

export type PlayerRivalTab = 'toughest' | 'easiest' | 'improving';
export type PlayerRivalTabItem = PlayerRivalRecord | PlayerImprovingRivalRecord;
