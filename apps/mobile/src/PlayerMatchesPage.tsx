import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import './app-shell.css';
import { SkeletonList } from './components/Skeleton';
import { useTabNavigation } from './navigation/tab-navigation';
import { formatMatchDate, getQueryError, type RubberItem } from './player-shared';
import { usePlayerExtendedStatsQuery, usePlayerRubbersQuery } from './queries';
import { TabShellPage } from './TabShellPage';
import { DetailHeader } from './components/DetailHeader';
import {
  DesignList,
  EmptyState,
  ErrorState,
  FilterBar,
  InfiniteListFooter,
  ListItem,
  OutcomeBadge,
  PageSection,
  SegmentedToggle,
} from './ui/appkit';

const PAGE_SIZE = 20;
type MatchSourceFilter = 'all' | 'league' | 'tournament';

export function PlayerMatchesPage() {
  const { goBackInActiveTab, navigateInActiveTab, navigateInTab } = useTabNavigation();
  const { playerId = '' } = useParams<{ playerId: string }>();
  const [matches, setMatches] = useState<RubberItem[]>([]);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [sourceFilter, setSourceFilter] = useState<MatchSourceFilter>('all');

  const statsQuery = usePlayerExtendedStatsQuery(playerId, Boolean(playerId));
  const matchesQuery = usePlayerRubbersQuery(playerId, PAGE_SIZE, offset, Boolean(playerId), sourceFilter);
  const stats = statsQuery.data ?? null;
  const statsLoading = statsQuery.isLoading;
  const matchesLoading = matchesQuery.isLoading && offset === 0;
  const matchesLoadingMore = matchesQuery.isFetching && offset > 0;
  const hasMore = useMemo(() => matches.length < total, [matches.length, total]);

  const openMatch = (match: RubberItem) => () => {
    if (match.source === 'tournament' && match.event_id) {
      navigateInActiveTab(`event/${match.event_id}`);
      return;
    }
    navigateInTab('leagues', `fixture/${match.fixture_id}`);
  };

  const handleLoadMore = () => {
    if (matchesQuery.isError) {
      void matchesQuery.refetch();
      return;
    }
    if (!matchesLoadingMore && hasMore) setOffset((previous) => previous + PAGE_SIZE);
  };

  useEffect(() => {
    if (!playerId) {
      setMatches([]);
      setTotal(0);
      setMatchesError('Missing player id');
      return;
    }
    const error = getQueryError(matchesQuery.error);
    if (error) {
      if (offset === 0) { setMatches([]); setTotal(0); }
      setMatchesError(error);
      return;
    }
    if (!matchesQuery.data) return;
    setMatchesError(null);
    setTotal(matchesQuery.data.total);
    setMatches((previous) => {
      if (offset === 0) return matchesQuery.data!.data;
      const existingIds = new Set(previous.map((item) => item.id));
      return [...previous, ...matchesQuery.data!.data.filter((item) => !existingIds.has(item.id))];
    });
  }, [matchesQuery.data, matchesQuery.error, offset, playerId]);

  useEffect(() => {
    setOffset(0);
    setMatches([]);
    setTotal(0);
    setMatchesError(null);
  }, [playerId, sourceFilter]);

  return (
    <TabShellPage>
      <DetailHeader title={statsLoading ? 'Match History' : stats?.player_name ?? 'Match History'} backFallback={playerId ? `player/${playerId}` : ''} />
      <div className="page-content app-shell-content">
        <PageSection surface="flat" density="compact" title="Player Matches" note="Full match list">
          <FilterBar ariaLabel="Choose match source">
            <SegmentedToggle
              ariaLabel="Choose match source"
              value={sourceFilter}
              onChange={setSourceFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'league', label: 'League' },
                { value: 'tournament', label: 'Tournaments' },
              ]}
              full
            />
          </FilterBar>

          {matchesLoading && matches.length === 0 ? (
            <SkeletonList rows={6} />
          ) : matchesError && matches.length === 0 ? (
            <ErrorState message="Failed to load match history." onRetry={() => goBackInActiveTab(playerId ? `player/${playerId}` : '')} />
          ) : matches.length === 0 ? (
            <EmptyState iconClassName="fa fa-table" title="No matches" message="No matches available for this player." />
          ) : (
            <>
              <DesignList density="compact" divider="hairline" paginate={false}>
                {matches.map((match) => (
                  <ListItem
                    key={match.id}
                    leading={<OutcomeBadge result={match.isWin ? 'W' : 'L'} variant="icon" />}
                    title={`${match.opponent} · ${match.result}`}
                    subtitle={`${formatMatchDate(match.date)} · ${match.source_label}`}
                    onClick={openMatch(match)}
                    hideChevron
                  />
                ))}
              </DesignList>
              <p className="tt-section-meta">Showing {matches.length} of {total} matches</p>
              <InfiniteListFooter
                hasMore={hasMore}
                isLoading={matchesLoadingMore}
                autoLoad={!matchesError}
                onLoadMore={handleLoadMore}
                loadLabel={matchesError ? 'Retry loading matches' : 'Load more matches'}
                loadingLabel="Loading more matches…"
                endLabel="End of match history"
              />
            </>
          )}

          {matchesError && matches.length > 0 ? (
            <ErrorState message="Couldn’t load more matches. Try again." onRetry={() => void matchesQuery.refetch()} />
          ) : null}
        </PageSection>
      </div>
    </TabShellPage>
  );
}
