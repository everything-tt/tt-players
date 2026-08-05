import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, getQueryError, type EventItem } from '../player-shared';
import {
  buildTournamentListPath,
  mergePageById,
  normalizePagedResponse,
  type PagedResponse,
} from '../paged-search';
import type { TournamentCategoryFilter } from '../tournament-category-filter';

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

type TournamentEventsResponse = PagedResponse<TournamentEventItem>;

interface UseTournamentListOptions {
  status: TournamentListStatus;
  search: string;
  savedIds?: string[];
  categories?: TournamentCategoryFilter[];
  enabled?: boolean;
  pageSize?: number;
}

export function useTournamentList({
  status,
  search,
  savedIds = [],
  categories = [],
  enabled = true,
  pageSize = 10,
}: UseTournamentListOptions) {
  const normalizedSearch = search.trim();
  const savedKey = useMemo(() => [...savedIds].sort().join(','), [savedIds]);
  const categoriesKey = useMemo(() => [...categories].sort().join(','), [categories]);
  const [items, setItems] = useState<TournamentEventItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    setOffset(0);
    setItems([]);
    setTotal(0);
    setHasMore(false);
  }, [categoriesKey, normalizedSearch, status, savedKey, pageSize]);

  const query = useQuery({
    queryKey: ['events', 'list', status, normalizedSearch, savedKey, categoriesKey, pageSize, offset],
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<TournamentEventsResponse>(
      buildTournamentListPath({
        status,
        query: normalizedSearch,
        savedIds,
        categories,
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
    setHasMore(page.hasMore);
    setTotal(page.total ?? offset + page.data.length + (page.hasMore ? 1 : 0));
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
