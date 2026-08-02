import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, getQueryError, type PlayerSearchItem } from '../player-shared';
import {
  buildPlayerSearchPath,
  mergePageById,
  normalizePagedResponse,
  type PagedResponse,
} from '../paged-search';

type PlayerSearchPage = PagedResponse<PlayerSearchItem>;

interface UsePlayerListOptions {
  search: string;
  leagueIds: string[];
  savedIds: string[];
  allLeaguesCount?: number;
  enabled?: boolean;
  pageSize?: number;
}

export function usePlayerList({
  search,
  leagueIds,
  savedIds,
  allLeaguesCount,
  enabled = true,
  pageSize = 10,
}: UsePlayerListOptions) {
  const normalizedSearch = search.trim();
  const leagueKey = useMemo(() => [...leagueIds].sort().join(','), [leagueIds]);
  const savedKey = useMemo(() => [...savedIds].sort().join(','), [savedIds]);
  const [items, setItems] = useState<PlayerSearchItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    setOffset(0);
    setItems([]);
    setTotal(null);
    setHasMore(false);
  }, [normalizedSearch, leagueKey, savedKey, pageSize]);

  const query = useQuery({
    queryKey: [
      'players',
      'paged-search',
      normalizedSearch,
      leagueKey,
      savedKey,
      allLeaguesCount ?? -1,
      pageSize,
      offset,
    ],
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<PlayerSearchPage>(
      buildPlayerSearchPath({
        query: normalizedSearch,
        leagueIds,
        savedIds,
        allLeaguesCount,
        limit: pageSize,
        offset,
      }),
      signal,
    ),
    enabled,
  });

  useEffect(() => {
    if (!query.data) return;
    const page = normalizePagedResponse(query.data, offset);
    setTotal(page.total);
    setHasMore(page.hasMore);
    setItems((previous) => mergePageById(previous, page.data, offset === 0));
  }, [offset, query.data]);

  const isLoadingInitial = enabled && query.isLoading && offset === 0;
  const isLoadingMore = enabled && query.isFetching && offset > 0;
  const error = getQueryError(query.error);

  const loadMore = () => {
    if (query.isError) {
      void query.refetch();
      return;
    }
    if (!isLoadingMore && hasMore) {
      setOffset((previous) => previous + pageSize);
    }
  };

  return {
    items,
    total,
    hasMore,
    isLoadingInitial,
    isLoadingMore,
    error,
    loadMore,
    retry: query.refetch,
  };
}
