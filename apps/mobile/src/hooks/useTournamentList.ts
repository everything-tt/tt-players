import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, getQueryError, type EventItem } from '../player-shared';
import { buildTournamentListPath, mergePageById } from '../paged-search';

export type TournamentListStatus = 'upcoming' | 'completed';

export interface TournamentEventItem extends EventItem {
  start_date: string | null;
  end_date: string | null;
  status: string;
  venue_name: string | null;
  venue_town: string | null;
  venue_postcode: string | null;
  entry_deadline: string | null;
  entry_url: string | null;
  information_url: string | null;
  result_url: string | null;
  source_count: number;
}

interface TournamentEventsResponse {
  data: TournamentEventItem[];
  total: number;
  limit: number;
  offset: number;
}

interface UseTournamentListOptions {
  status: TournamentListStatus;
  search: string;
  savedIds?: string[];
  enabled?: boolean;
  pageSize?: number;
}

export function useTournamentList({
  status,
  search,
  savedIds = [],
  enabled = true,
  pageSize = 10,
}: UseTournamentListOptions) {
  const normalizedSearch = search.trim();
  const savedKey = useMemo(() => [...savedIds].sort().join(','), [savedIds]);
  const [items, setItems] = useState<TournamentEventItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setOffset(0);
    setItems([]);
    setTotal(0);
  }, [normalizedSearch, status, savedKey, pageSize]);

  const query = useQuery({
    queryKey: ['events', 'list', status, normalizedSearch, savedKey, pageSize, offset],
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<TournamentEventsResponse>(
      buildTournamentListPath({
        status,
        query: normalizedSearch,
        savedIds,
        limit: pageSize,
        offset,
      }),
      signal,
    ),
    enabled,
  });

  useEffect(() => {
    if (!query.data) return;
    setTotal(query.data.total);
    setItems((previous) => mergePageById(previous, query.data!.data, offset === 0));
  }, [offset, query.data]);

  const hasMore = items.length < total;
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
