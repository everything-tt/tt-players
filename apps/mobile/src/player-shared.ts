export type FavouritePlayer = {
  id: string;
  name: string;
  played: number;
  wins: number;
};

export type PlayerSearchItem = FavouritePlayer;

export type PlayerSearchResponse = {
  data: PlayerSearchItem[];
};

export type PlayerCountResponse = {
  players: number;
  matches: number;
};

export type StandingItem = {
  position: number;
  team_id: string;
  team_name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
};

export type StandingsResponse = {
  source_url: string | null;
  data: StandingItem[];
};

export type LeaderboardMode = 'win_pct' | 'most_played' | 'combined';

export type LeaderboardItem = {
  rank: number;
  player_id: string;
  player_name: string;
  played: number;
  wins: number;
  losses: number;
  win_rate: number;
  score: number | null;
};

export type LeadersResponse = {
  mode: LeaderboardMode;
  formula: string;
  min_played: number;
  data: LeaderboardItem[];
};

export type DivisionItem = {
  id: string;
  name: string;
  external_id?: string;
};

export type RegionItem = {
  id: string;
  slug: string;
  name: string;
};

export type LeagueWithDivisions = {
  id: string;
  name: string;
  platform?: string;
  season_id?: string;
  season?: string;
  regions?: RegionItem[];
  divisions: DivisionItem[];
};

export type LeaguesResponse = {
  data: LeagueWithDivisions[];
};

export type DivisionSnapshot = {
  divisionId: string;
  divisionName: string;
  teams: number;
  players: number;
  matches: number;
};

export type LeagueSnapshot = {
  divisions: DivisionSnapshot[];
  totals: {
    divisions: number;
    teams: number;
    players: number;
    matches: number;
  };
};

export type LeagueSeason = {
  id: string;
  name: string;
  is_active: boolean;
};

export type LeagueSeasonsResponse = {
  data: LeagueSeason[];
};

export type FixtureStatus = 'upcoming' | 'completed' | 'postponed';

export interface FixtureItem {
  id: string;
  competition_id: string;
  external_id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  home_score: number | null;
  away_score: number | null;
  date_played: string;
  status: FixtureStatus;
  round_name: string | null;
  round_order: number | null;
}

export interface FixturesResponse {
  availability: 'available' | 'no_matches_yet' | 'source_data_missing';
  total: number;
  limit: number;
  offset: number;
  data: FixtureItem[];
}

export type ExtendedPlayerStats = {
  player_id: string;
  player_name: string;
  wins: number;
  losses: number;
  total: number;
  nemesis: string;
  duo: string;
  streak: string;
};

export type PlayerInsights = {
  years_played?: number;
  first_match_date?: string | null;
  career_by_year: Array<{
    year: number;
    played: number;
    win_rate: number;
  }>;
  rivals: {
    toughest: { opponent_name: string; win_rate: number } | null;
    easiest: { opponent_name: string; win_rate: number } | null;
    improving_vs: { opponent_name: string; delta_points: number } | null;
  };
  form: {
    rolling_10_win_rate: number;
    rolling_20_win_rate: number;
    momentum: 'hot' | 'steady' | 'cold' | 'new';
    recent_results: Array<'W' | 'L'>;
  };
};

export type PlayerCurrentSeasonAffiliation = {
  team_id: string;
  team_name: string;
  league_id: string;
  league_name: string;
  season_id: string;
  competition_name: string;
  season_name: string;
};

export type PlayerCurrentSeasonAffiliationsResponse = {
  data: PlayerCurrentSeasonAffiliation[];
};

export type RubberItem = {
  id: string;
  fixture_id: string;
  date: string;
  league: string;
  opponent: string;
  opponent_id: string | null;
  result: string;
  isWin: boolean;
};

export type RubbersResponse = {
  total: number;
  limit: number;
  offset: number;
  data: RubberItem[];
};

export type H2HResponse = {
  player1_wins: number;
  player2_wins: number;
  encounters: RubberItem[];
};

export interface RosterItem {
  id: string;
  name: string;
  played: number;
  winRate: number;
  wins: number;
}

export interface RosterResponse {
  availability: 'available' | 'no_matches_yet' | 'source_data_missing';
  data: RosterItem[];
}

export interface TeamFormResponse {
  form: Array<'W' | 'L' | 'D'>;
  position: number | null;
  points: number | null;
}

export interface TeamSummaryResponse {
  id: string;
  name: string;
  league_id: string | null;
  league_name: string | null;
  season_id: string | null;
  season_name: string | null;
  competition_id: string | null;
  competition_name: string | null;
}

export interface FixtureRubberItem {
  id: string;
  fixture_id: string;
  is_doubles: boolean;
  home_player_1_id: string | null;
  home_player_2_id: string | null;
  away_player_1_id: string | null;
  away_player_2_id: string | null;
  home_player_1_name: string | null;
  home_player_2_name: string | null;
  away_player_1_name: string | null;
  away_player_2_name: string | null;
  home_games_won: number;
  away_games_won: number;
}

export interface FixtureMeta {
  id: string;
  played_at: string | null;
  league_name: string;
  division_name: string;
  home_team_name: string | null;
  away_team_name: string | null;
  source_url: string | null;
}

export interface FixtureRubbersResponse {
  fixture: FixtureMeta;
  data: FixtureRubberItem[];
}

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api';
export const FAVOURITES_STORAGE_KEY = 'tt_players_favourite_players';
export const FAVOURITES_UPDATED_EVENT = 'tt_players_favourite_players_updated';

export async function apiFetch<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function isValidFavouritePlayer(value: unknown): value is FavouritePlayer {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string'
    && typeof item.name === 'string'
    && typeof item.played === 'number'
    && typeof item.wins === 'number';
}

export function parseStoredFavouritePlayers(): FavouritePlayer[] {
  try {
    const raw = localStorage.getItem(FAVOURITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidFavouritePlayer);
  } catch {
    return [];
  }
}

export function persistFavouritePlayers(players: FavouritePlayer[]) {
  localStorage.setItem(FAVOURITES_STORAGE_KEY, JSON.stringify(players));
  window.dispatchEvent(new Event(FAVOURITES_UPDATED_EVENT));
}

export function getInitials(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return (parts[0] ?? 'P').slice(0, 2).toUpperCase();
}

export function calcWinRate(wins: number, played: number): number {
  if (!played || played <= 0) return 0;
  return Math.round((wins / played) * 100);
}

export function parseNamePair(text: string | null) {
  if (!text) return { name: 'N/A', meta: '' };
  const [name, meta] = text.split('(');
  return { name: name.trim(), meta: meta?.replace(')', '').trim() ?? '' };
}

export function formatMatchDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDate(value: string, options?: { includeTime?: boolean }): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  if (options?.includeTime) {
    return parsed.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatIsoDate(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
