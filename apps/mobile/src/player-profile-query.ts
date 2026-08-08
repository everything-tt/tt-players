import { useQuery } from '@tanstack/react-query';
import {
  apiFetch,
  type PlayerProfileOverview,
} from './player-shared';

export type ApiFetcher = <T>(path: string, signal?: AbortSignal) => Promise<T>;

export function playerProfileOverviewQueryOptions(
  playerId: string,
  fetcher: ApiFetcher = apiFetch,
) {
  return {
    queryKey: ['players', playerId, 'profile-overview'] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetcher<PlayerProfileOverview>(`/players/${playerId}/profile-overview`, signal),
  };
}

export function useSsrPlayerProfileOverviewQuery(playerId: string, enabled = true) {
  return useQuery({
    ...playerProfileOverviewQueryOptions(playerId),
    enabled: enabled && Boolean(playerId),
  });
}
