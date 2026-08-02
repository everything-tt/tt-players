import { useQuery } from '@tanstack/react-query';
import {
  apiFetch,
  type ExtendedPlayerStats,
  type FixtureRubbersResponse,
  type FixturesResponse,
  type H2HResponse,
  type LeadersResponse,
  type LeagueSnapshot,
  type LeagueDashboard,
  type LeagueCollectionDashboard,
  type LeagueOverviewResponse,
  type LeagueSeasonsResponse,
  type LeaguesResponse,
  type PlayerCountResponse,
  type PlayerCurrentSeasonAffiliationsResponse,
  type PlayerSearchResponse,
  type RosterResponse,
  type RubbersResponse,
  type StandingsResponse,
  type TeamFormResponse,
  type TeamSummaryResponse,
  type EventsResponse,
  type EventDetailResponse,
  type PlayerTournamentsResponse,
} from './player-shared';
import type {
  PlayerInsightsReport,
  PlayerRivalsResponse,
} from './player-insights-types';

export function useLeaguesQuery(seasonId?: string, enabled = true) {
  return useQuery({
    queryKey: ['leagues', seasonId ?? 'active'],
    queryFn: ({ signal }: { signal: AbortSignal }) => {
      if (!seasonId) {
        return apiFetch<LeaguesResponse>('/leagues', signal);
      }
      const params = new URLSearchParams({ season_id: seasonId });
      return apiFetch<LeaguesResponse>(`/leagues?${params.toString()}`, signal);
    },
    enabled,
  });
}

export function usePlayerCountQuery() {
  return useQuery({
    queryKey: ['players', 'count'],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      apiFetch<PlayerCountResponse>('/players/count', signal),
  });
}

export function useLeagueSeasonsQuery() {
  return useQuery({
    queryKey: ['leagues', 'seasons'],
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<LeagueSeasonsResponse>('/leagues/seasons', signal),
  });
}

interface PlayerSearchQueryOptions {
  enabled: boolean;
  allLeaguesCount?: number;
}

export function usePlayerSearchQuery(query: string, leagueIds: string[], options: PlayerSearchQueryOptions) {
  const normalized = query.trim();
  const sortedLeagueIds = [...leagueIds].sort();

  return useQuery({
    queryKey: ['players', 'search', normalized, sortedLeagueIds.join(','), options.allLeaguesCount ?? -1],
    queryFn: ({ signal }: { signal: AbortSignal }) => {
      const params = new URLSearchParams();
      if (normalized.length > 0) {
        params.set('q', normalized);
      }

      const shouldIncludeLeagueIds = options.allLeaguesCount === undefined
        ? sortedLeagueIds.length > 0
        : sortedLeagueIds.length > 0 && sortedLeagueIds.length < options.allLeaguesCount;

      if (shouldIncludeLeagueIds) {
        params.set('league_ids', sortedLeagueIds.join(','));
      }

      const path = params.size > 0
        ? `/players/search?${params.toString()}`
        : '/players/search';

      return apiFetch<PlayerSearchResponse>(path, signal);
    },
    enabled: options.enabled,
  });
}

export function useStandingsQuery(competitionId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['standings', competitionId],
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<StandingsResponse>(`/competitions/${competitionId}/standings`, signal),
    enabled,
  });
}

interface LeadersQueryOptions {
  mode: 'win_pct' | 'most_played' | 'combined' | 'form' | 'improving' | 'new_faces';
  leagueIds: string[];
  limit: number;
  minPlayed: number;
  seasonId?: string;
  enabled: boolean;
}

export function useLeadersQuery(options: LeadersQueryOptions) {
  const sortedLeagueIds = [...options.leagueIds].sort();
  return useQuery({
    queryKey: [
      'players',
      'leaders',
      options.mode,
      sortedLeagueIds.join(','),
      options.limit,
      options.minPlayed,
      options.seasonId ?? '',
    ],
    queryFn: ({ signal }: { signal: AbortSignal }) => {
      const params = new URLSearchParams({
        mode: options.mode,
        limit: String(options.limit),
        min_played: String(options.minPlayed),
      });
      if (sortedLeagueIds.length > 0) {
        params.set('league_ids', sortedLeagueIds.join(','));
      }
      if (options.seasonId) {
        params.set('season_id', options.seasonId);
      }
      return apiFetch<LeadersResponse>(`/players/leaders?${params.toString()}`, signal);
    },
    enabled: options.enabled,
  });
}

export function usePlayerExtendedStatsQuery(playerId: string, enabled = true) {
  return useQuery({
    queryKey: ['players', playerId, 'stats', 'extended'],
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<ExtendedPlayerStats>(`/players/${playerId}/stats/extended`, signal),
    enabled: enabled && Boolean(playerId),
  });
}

export function usePlayerCurrentSeasonAffiliationsQuery(playerId: string, enabled = true) {
  return useQuery({
    queryKey: ['players', playerId, 'affiliations', 'current-season'],
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<PlayerCurrentSeasonAffiliationsResponse>(`/players/${playerId}/affiliations/current-season`, signal),
    enabled: enabled && Boolean(playerId),
  });
}

export function usePlayerRubbersQuery(
  playerId: string,
  limit: number,
  offset: number,
  enabled = true,
  source: 'league' | 'tournament' | 'all' = 'league',
) {
  return useQuery({
    queryKey: ['players', playerId, 'rubbers', source, limit, offset],
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<RubbersResponse>(`/players/${playerId}/rubbers?limit=${limit}&offset=${offset}&source=${source}`, signal),
    enabled: enabled && Boolean(playerId),
  });
}

export function usePlayerInsightsQuery(playerId: string, enabled = true) {
  return useQuery({
    queryKey: ['players', playerId, 'insights'],
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<PlayerInsightsReport>(`/players/${playerId}/insights`, signal),
    enabled: enabled && Boolean(playerId),
  });
}

export function usePlayerRivalsQuery(playerId: string, enabled = true) {
  return useQuery({
    queryKey: ['players', playerId, 'rivals'],
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<PlayerRivalsResponse>(`/players/${playerId}/rivals`, signal),
    enabled: enabled && Boolean(playerId),
  });
}

export function usePlayerH2HQuery(playerId1: string, playerId2: string, enabled = true) {
  return useQuery({
    queryKey: ['players', 'h2h', playerId1, playerId2],
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<H2HResponse>(`/players/${playerId1}/h2h/${playerId2}`, signal),
    enabled: enabled && Boolean(playerId1) && Boolean(playerId2),
  });
}

export function usePlayerScopedH2HQuery(playerId1: string, playerId2: string, leagueIds: string[], enabled = true) {
  const sortedLeagueIds = [...leagueIds].sort();
  return useQuery({
    queryKey: ['players', 'h2h', playerId1, playerId2, sortedLeagueIds.join(',')],
    queryFn: ({ signal }: { signal: AbortSignal }) => {
      const params = new URLSearchParams();
      if (sortedLeagueIds.length > 0) {
        params.set('league_ids', sortedLeagueIds.join(','));
      }
      const queryString = params.toString();
      const path = queryString.length > 0
        ? `/players/${playerId1}/h2h/${playerId2}?${queryString}`
        : `/players/${playerId1}/h2h/${playerId2}`;
      return apiFetch<H2HResponse>(path, signal);
    },
    enabled: enabled && Boolean(playerId1) && Boolean(playerId2),
  });
}

export function useLeagueSnapshotQuery(leagueId: string, enabled = true) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'snapshot'],
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<LeagueSnapshot>(`/leagues/${leagueId}/snapshot`, signal),
    enabled: enabled && Boolean(leagueId),
  });
}

export function useLeagueOverviewQuery(leagueIds: string[], enabled = true) {
  const sortedLeagueIds = [...leagueIds].sort();
  return useQuery({
    queryKey: ['leagues', 'overview', sortedLeagueIds.join(',')],
    queryFn: ({ signal }: { signal: AbortSignal }) => {
      const params = new URLSearchParams();
      if (sortedLeagueIds.length > 0) {
        params.set('league_ids', sortedLeagueIds.join(','));
      }
      const query = params.toString();
      return apiFetch<LeagueOverviewResponse>(`/leagues/overview${query ? `?${query}` : ''}`, signal);
    },
    enabled,
  });
}

export function useLeagueDashboardQuery(leagueId: string, enabled = true) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'dashboard'],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      apiFetch<LeagueDashboard>(`/leagues/${leagueId}/dashboard`, signal),
    enabled: enabled && Boolean(leagueId),
  });
}

export function useLeagueCollectionDashboardQuery(leagueIds: string[], enabled = true) {
  const sortedLeagueIds = [...leagueIds].sort();
  return useQuery({
    queryKey: ['leagues', 'dashboard', sortedLeagueIds.join(',')],
    queryFn: ({ signal }: { signal: AbortSignal }) => {
      const params = new URLSearchParams();
      if (sortedLeagueIds.length > 0) params.set('league_ids', sortedLeagueIds.join(','));
      const query = params.toString();
      return apiFetch<LeagueCollectionDashboard>(`/leagues/dashboard${query ? `?${query}` : ''}`, signal);
    },
    enabled,
  });
}

export function useTeamSummaryQuery(teamId: string, enabled = true) {
  return useQuery({
    queryKey: ['teams', teamId, 'summary'],
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<TeamSummaryResponse>(`/teams/${teamId}/summary`, signal),
    enabled: enabled && Boolean(teamId),
  });
}

export function useTeamFormQuery(teamId: string, enabled = true) {
  return useQuery({
    queryKey: ['teams', teamId, 'form'],
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<TeamFormResponse>(`/teams/${teamId}/form`, signal),
    enabled: enabled && Boolean(teamId),
  });
}

export function useTeamRosterQuery(teamId: string, enabled = true) {
  return useQuery({
    queryKey: ['teams', teamId, 'roster'],
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<RosterResponse>(`/teams/${teamId}/roster`, signal),
    enabled: enabled && Boolean(teamId),
  });
}

export function useTeamFixturesQuery(teamId: string, limit = 20, offset = 0, enabled = true) {
  return useQuery({
    queryKey: ['teams', teamId, 'fixtures', limit, offset],
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<FixturesResponse>(`/teams/${teamId}/fixtures?limit=${limit}&offset=${offset}`, signal),
    enabled: enabled && Boolean(teamId),
  });
}

export function useFixtureRubbersQuery(fixtureId: string, enabled = true) {
  return useQuery({
    queryKey: ['fixtures', fixtureId, 'rubbers'],
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<FixtureRubbersResponse>(`/fixtures/${fixtureId}/rubbers`, signal),
    enabled: enabled && Boolean(fixtureId),
  });
}

export function useEventsQuery(query?: string, limit = 20, offset = 0, enabled = true) {
  const normalized = query?.trim() ?? '';
  return useQuery({
    queryKey: ['events', 'list', normalized, limit, offset],
    queryFn: ({ signal }: { signal: AbortSignal }) => {
      const params = new URLSearchParams();
      if (normalized) {
        params.set('q', normalized);
      }
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      return apiFetch<EventsResponse>(`/events?${params.toString()}`, signal);
    },
    enabled,
  });
}

export function useEventDetailQuery(eventId: string, enabled = true) {
  return useQuery({
    queryKey: ['events', eventId, 'detail'],
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<EventDetailResponse>(`/events/${eventId}`, signal),
    enabled: enabled && Boolean(eventId),
  });
}

export function usePlayerTournamentsQuery(playerId: string, enabled = true) {
  return useQuery({
    queryKey: ['players', playerId, 'tournaments'],
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<PlayerTournamentsResponse>(`/players/${playerId}/tournaments`, signal),
    enabled: enabled && Boolean(playerId),
  });
}
