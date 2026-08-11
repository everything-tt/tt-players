export type FavouritePlayer = {
  id: string;
  name: string;
  played: number;
  wins: number;
};

export type FavouriteTeam = {
  id: string;
  name: string;
  leagueName: string | null;
  divisionName: string | null;
};

export const FAVOURITE_TEAMS_STORAGE_KEY = 'tt_players_favourite_teams';
export const FAVOURITE_TEAMS_UPDATED_EVENT = 'tt-players:favourite-teams-updated';

export function isValidFavouriteTeam(value: unknown): value is FavouriteTeam {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string'
    && typeof item.name === 'string'
    && (item.leagueName === null || typeof item.leagueName === 'string')
    && (item.divisionName === null || typeof item.divisionName === 'string');
}

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

export type LeaderboardMode = 'win_pct' | 'most_played' | 'combined' | 'form' | 'improving' | 'new_faces';

export type LeaderboardItem = {
  rank: number;
  player_id: string;
  player_name: string;
  played: number;
  wins: number;
  losses: number;
  win_rate: number;
  score: number | null;
  first_match_date: string | null;
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

export type LeagueOverviewItem = {
  id: string;
  name: string;
  season_id: string;
  season: string;
  divisions: number;
  teams: number;
  matches_played: number;
  upcoming_fixtures: number;
  last_scraped_at: string | null;
  status: 'no_data' | 'in_progress';
};

export type LeagueOverviewResponse = {
  data: LeagueOverviewItem[];
};

export type LeagueDashboard = {
  league: {
    id: string;
    name: string;
    season_id: string;
    season: string;
  };
  recent_results: Array<{
    fixture_id: string;
    competition_id: string;
    competition_name: string;
    date_played: string | null;
    home_team_id: string | null;
    home_team_name: string | null;
    away_team_id: string | null;
    away_team_name: string | null;
    home_score: number;
    away_score: number;
  }>;
  upcoming_fixtures: Array<{
    fixture_id: string;
    competition_id: string;
    competition_name: string;
    date_played: string | null;
    home_team_id: string | null;
    home_team_name: string | null;
    away_team_id: string | null;
    away_team_name: string | null;
  }>;
  title_races: Array<{
    competition_id: string;
    competition_name: string;
    leader_name: string;
    leader_points: number;
    points_gap: number | null;
  }>;
  history: Array<{
    season_id: string;
    season: string;
    is_active: boolean;
    divisions: number;
    teams: number;
    fixtures: number;
    champions: Array<{
      division_name: string;
      team_name: string;
    }>;
  }>;
};

export type LeagueCollectionDashboard = {
  totals: {
    leagues: number;
    divisions: number;
    teams: number;
    players: number;
    matches_played: number;
    upcoming_fixtures: number;
  };
  recent_results: Array<{
    fixture_id: string;
    league_id: string;
    league_name: string;
    competition_id: string;
    division_name: string;
    date_played: string | null;
    home_team_name: string | null;
    away_team_name: string | null;
    home_score: number;
    away_score: number;
  }>;
  upcoming_fixtures: Array<{
    fixture_id: string;
    league_id: string;
    league_name: string;
    competition_id: string;
    division_name: string;
    date_played: string | null;
    home_team_name: string | null;
    away_team_name: string | null;
  }>;
  top_teams: Array<{
    team_id: string;
    team_name: string;
    league_id: string;
    league_name: string;
    competition_id: string;
    division_name: string;
    position: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    points: number;
    win_rate: number;
  }>;
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

export type PlayerProfileOverview = {
  player_id: string;
  player_name: string;
  wins: number;
  losses: number;
  total: number;
  form: {
    rolling_10_win_rate: number;
    rolling_20_win_rate: number;
    momentum: 'hot' | 'steady' | 'cold' | 'new';
    recent_results: Array<'W' | 'L'>;
  };
  current_season_affiliations: PlayerCurrentSeasonAffiliation[];
};

export type RubberItem = {
  id: string;
  fixture_id: string;
  date: string;
  source: 'league' | 'tournament';
  source_label: string;
  event_id: string | null;
  event_name: string | null;
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
  home_team_id: string | null;
  home_team_name: string | null;
  away_team_id: string | null;
  away_team_name: string | null;
  source_url: string | null;
}

export interface FixtureRubbersResponse {
  fixture: FixtureMeta;
  data: FixtureRubberItem[];
}

// ── Tab metadata: single source of truth for labels, icons, descriptions ──
// Consumed by the footer bar, main menu, page title, and home navigation cards
// so the same tab always has the same name + icon everywhere.
export const TAB_METADATA = {
  home:     { label: 'Home',          icon: 'fa fa-home',            description: 'Your leagues at a glance' },
  players:  { label: 'Players',       icon: 'fa fa-user-friends',    description: 'Search players by name' },
  leagues:  { label: 'Leagues',       icon: 'fa fa-table-tennis',    description: 'Standings & divisions' },
  events:   { label: 'Tournaments',   icon: 'fa fa-trophy',          description: 'Event results' },
  h2h:      { label: 'H2H',           icon: 'fa fa-code-compare',    description: 'Compare two players' },
  about:    { label: 'About',         icon: 'fa fa-info-circle',     description: 'About this app' },
} as const;

export const H2H_FAVOURITES_STORAGE_KEY = 'tt_players_favourite_h2h';
export const H2H_FAVOURITES_UPDATED_EVENT = 'tt_players_favourite_h2h_updated';

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api';
export const FAVOURITES_STORAGE_KEY = 'tt_players_favourite_players';
export const FAVOURITES_UPDATED_EVENT = 'tt_players_favourite_players_updated';

// ── Tournament aggregation (was duplicated in PlayerPage + PlayerTournamentsPage) ──
export interface TournamentSummary {
  event_id: string;
  event_name: string;
  event_date: string | null;
  category: string | null;
  platform_name: string;
  played: number;
  wins: number;
}

export function groupTournamentMatches(matches: PlayerTournamentMatch[]): TournamentSummary[] {
  const events = new Map<string, TournamentSummary>();
  for (const match of matches) {
    const existing = events.get(match.event_id) ?? {
      event_id: match.event_id,
      event_name: match.event_name,
      event_date: match.event_date,
      category: match.category,
      platform_name: match.platform_name,
      played: 0,
      wins: 0,
    };
    const isWin = (match.winner_side === 'home' && match.player_side === 'home') ||
      (match.winner_side === 'away' && match.player_side === 'away');
    existing.played += 1;
    existing.wins += isWin ? 1 : 0;
    events.set(match.event_id, existing);
  }
  return Array.from(events.values());
}

// ── Friendly query-error mapping (replaces 26 copies of `instanceof Error ? … : null`) ──
export function getQueryError(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof Error) {
    // Never leak raw HTTP status codes to users; map to friendly copy.
    const msg = error.message || '';
    if (/^HTTP 4/.test(msg)) return 'We couldn\'t find that. It may have moved.';
    if (/^HTTP 5/.test(msg)) return 'Our servers hit a snag. Please try again.';
    return msg;
  }
  return 'Something went wrong. Please try again.';
}

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

// ── Date formatting (consolidated; formatMatchDate kept as an alias for compatibility) ──
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
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Alias of {@link formatDate} without time. Kept for call-site readability on match rows. */
export function formatMatchDate(value: string): string {
  return formatDate(value);
}

/** Formats just the time portion (e.g. "14:05"). Used by fixture/tournament result rows. */
export function formatTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
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

// ── Number / record formatting ──
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '–';
  return value.toLocaleString('en-GB');
}

export interface RecordSummary {
  wins: number;
  losses: number;
  draws?: number;
  played?: number;
}

/** Single W/L/D record format used everywhere (replaces 4 ad-hoc dialects). */
export function formatRecord(r: RecordSummary): string {
  const parts = [`${r.wins}W`, `${r.losses}L`];
  if (r.draws) parts.splice(1, 0, `${r.draws}D`);
  if (r.played !== undefined) parts.push(`${r.played}P`);
  return parts.join(' · ');
}

export function formatDateOrUnknown(value: string | null | undefined): string {
  return value ? formatDate(value) : 'Unknown Date';
}

export interface EventItem {
  id: string;
  platform_id: string;
  source: string;
  external_id: string;
  name: string;
  event_date: string | null;
  category: string | null;
  public_url: string | null;
  platform_name: string;
  match_count: number;
}

export interface EventsResponse {
  data: EventItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface EventResultRow {
  id: string;
  played_at: string | null;
  round_name: string | null;
  round_order: number | null;
  home_player_name: string;
  home_player_external_id: string;
  away_player_name: string;
  away_player_external_id: string;
  home_games_won: number | null;
  away_games_won: number | null;
  winner_side: string;
  canonical_rubber_id: string | null;
  home_player_resolved_id: string | null;
  away_player_resolved_id: string | null;
}

export interface EventDetailResponse {
  event: EventItem;
  results: EventResultRow[];
}

export interface PlayerTournamentMatch {
  event_id: string;
  event_name: string;
  event_date: string | null;
  category: string | null;
  platform_name: string;
  match_id: string;
  played_at: string | null;
  round_name: string | null;
  home_player_name: string;
  away_player_name: string;
  winner_side: string;
  player_side: 'home' | 'away';
}

export interface PlayerTournamentsResponse {
  data: PlayerTournamentMatch[];
}

export interface PlayerTournamentSummariesResponse {
  total: number;
  data: TournamentSummary[];
}

export const FAVOURITE_TOURNAMENTS_STORAGE_KEY = 'tt_players_favourite_tournaments';
export const FAVOURITE_TOURNAMENTS_UPDATED_EVENT = 'tt_players:favourite-tournaments-updated';

export interface FavouriteTournament {
  id: string;
  name: string;
  event_date: string | null;
  category: string | null;
  platform_name: string;
  match_count: number;
}

export function isValidFavouriteTournament(value: unknown): value is FavouriteTournament {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string'
    && typeof item.name === 'string'
    && (item.event_date === null || typeof item.event_date === 'string')
    && (item.category === null || typeof item.category === 'string')
    && typeof item.platform_name === 'string'
    && typeof item.match_count === 'number';
}
