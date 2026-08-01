import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, getQueryError, type EventItem } from '../player-shared';
import { mergeTournamentPage } from '../tournament-list';

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
  pageSize?: number;
}

export function useTournamentList({
  status,
  search,
  pageSize = 20,
}: UseTournamentListOptions) {
  const normalizedSearch = search.trim();
  const [items, setItems] = useState<TournamentEventItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);

  const query = useQuery({
    queryKey: ['events', 'list', status, normalizedSearch, pageSize, offset],
    queryFn: ({ signal }: { signal: AbortSignal }) => {
      const params = new URLSearchParams({
        status,
        limit: String(pageSize),
        offset: String(offset),
      });
      if (normalizedSearch) params.set('q', normalizedSearch);
      return apiFetch<TournamentEventsResponse>(`/events?${params.toString()}`, signal);
    },
  });

  useEffect(() => {
    setOffset(0);
    setItems([]);
    setTotal(0);
  }, [normalizedSearch, status]);

  useEffect(() => {
    if (!query.data) return;
    setTotal(query.data.total);
    setItems((previous) => mergeTournamentPage(
      previous,
      query.data!.data,
      offset === 0,
    ));
  }, [offset, query.data]);

  const hasMore = items.length < total;
  const isLoadingInitial = query.isLoading && offset === 0;
  const isLoadingMore = query.isFetching && offset > 0;
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
