import { useEffect, useMemo, useState } from 'react';
import { mergePlayerMatchPage } from '../player-match-list';
import { getQueryError, type RubberItem } from '../player-shared';
import { usePlayerRubbersQuery } from '../queries';

export type MatchSourceFilter = 'all' | 'league' | 'tournament';

interface UsePagedPlayerMatchesOptions {
  playerId: string;
  source?: MatchSourceFilter;
  enabled?: boolean;
  pageSize?: number;
}

export function usePagedPlayerMatches({
  playerId,
  source = 'all',
  enabled = true,
  pageSize = 20,
}: UsePagedPlayerMatchesOptions) {
  const [matches, setMatches] = useState<RubberItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const query = usePlayerRubbersQuery(playerId, pageSize, offset, enabled, source);

  useEffect(() => {
    setMatches([]);
    setOffset(0);
    setTotal(0);
  }, [playerId, source, pageSize]);

  useEffect(() => {
    if (!query.data) return;
    setTotal(query.data.total);
    setMatches((previous) => mergePlayerMatchPage(previous, query.data!.data, offset === 0));
  }, [offset, query.data]);

  const hasMore = useMemo(() => matches.length < total, [matches.length, total]);
  const error = getQueryError(query.error);
  const isLoadingInitial = enabled && query.isLoading && offset === 0;
  const isLoadingMore = enabled && query.isFetching && offset > 0;

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
    matches,
    total,
    hasMore,
    isLoadingInitial,
    isLoadingMore,
    error,
    loadMore,
    retry: query.refetch,
  };
}
