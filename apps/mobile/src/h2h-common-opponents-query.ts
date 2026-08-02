import { useInfiniteQuery } from '@tanstack/react-query';
import { apiFetch } from './player-shared';
import type { CommonOpponentSort, CommonOpponentsResponse } from './h2h-common-opponents-types';

const PAGE_SIZE = 20;

export function h2hCommonOpponentsQueryKey(
  playerId1: string,
  playerId2: string,
  sort: CommonOpponentSort,
) {
  return ['players', 'h2h', playerId1, playerId2, 'common-opponents', sort] as const;
}

export function buildH2HCommonOpponentsPath(
  playerId1: string,
  playerId2: string,
  sort: CommonOpponentSort,
  cursor: string | null,
): string {
  const params = new URLSearchParams({
    sort,
    limit: String(PAGE_SIZE),
  });
  if (cursor) params.set('cursor', cursor);
  return `/players/${playerId1}/h2h/${playerId2}/common-opponents?${params.toString()}`;
}

export function useH2HCommonOpponentsQuery(
  playerId1: string,
  playerId2: string,
  sort: CommonOpponentSort,
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: h2hCommonOpponentsQueryKey(playerId1, playerId2, sort),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }: { pageParam: string | null; signal: AbortSignal }) =>
      apiFetch<CommonOpponentsResponse>(
        buildH2HCommonOpponentsPath(playerId1, playerId2, sort, pageParam),
        signal,
      ),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: enabled && Boolean(playerId1) && Boolean(playerId2) && playerId1 !== playerId2,
    retry: false,
  });
}
