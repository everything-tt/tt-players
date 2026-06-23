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
  List,
  ListItem,
  OutcomeBadge,
  EmptyState,
  ErrorState,
  SectionHeader,
  MoreButton,
} from './ui/appkit';

const PAGE_SIZE = 20;

export function PlayerMatchesPage() {
  const { goBackInActiveTab, navigateInTab } = useTabNavigation();
  const { playerId = '' } = useParams<{ playerId: string }>();

  const [matches, setMatches] = useState<RubberItem[]>([]);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);

  const statsQuery = usePlayerExtendedStatsQuery(playerId, Boolean(playerId));
  const matchesQuery = usePlayerRubbersQuery(playerId, PAGE_SIZE, offset, Boolean(playerId));
  const stats = statsQuery.data ?? null;
  const statsLoading = statsQuery.isLoading;
  const matchesLoading = matchesQuery.isLoading && offset === 0;
  const matchesLoadingMore = matchesQuery.isLoading && offset > 0;
  const hasMore = useMemo(() => matches.length < total, [matches.length, total]);

  const openFixtureInLeaguesTab = (fixtureId: string) => () => navigateInTab('leagues', `fixture/${fixtureId}`);

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
    setOffset(0); setMatches([]); setTotal(0); setMatchesError(null);
  }, [playerId]);

  return (
    <TabShellPage>
      <DetailHeader title={statsLoading ? 'Match History' : stats?.player_name ?? 'Match History'} backFallback={playerId ? `player/${playerId}` : ''} />
      <div className="page-content app-shell-content">
        <section className="tt-player-section" aria-labelledby="tt-player-matches-full-title">
          <SectionHeader title="Player Matches" note="Full match list" />
          {matchesLoading && matches.length === 0 ? (
            <SkeletonList rows={6} />
          ) : matchesError && matches.length === 0 ? (
            <ErrorState message="Failed to load match history." onRetry={() => goBackInActiveTab(playerId ? `player/${playerId}` : '')} />
          ) : matches.length === 0 ? (
            <EmptyState iconClassName="fa fa-table" title="No matches" message="No matches available for this player." />
          ) : (
            <>
              <List divider="hairline">
                {matches.map((match) => (
                  <ListItem
                    key={match.id}
                    leading={<OutcomeBadge result={match.isWin ? 'W' : 'L'} variant="icon" />}
                    title={`${match.opponent} · ${match.result}`}
                    subtitle={`${formatMatchDate(match.date)} · ${match.league}`}
                    onClick={openFixtureInLeaguesTab(match.fixture_id)}
                    hideChevron
                  />
                ))}
              </List>
              <p className="tt-section-meta mt-3">Showing {matches.length} of {total} matches</p>
            </>
          )}

          {matchesError && matches.length > 0 ? (
            <ErrorState message="Couldn’t load more matches. Try again." />
          ) : null}

          {hasMore && matches.length > 0 ? (
            <div className="mt-3">
              <MoreButton loading={matchesLoadingMore} hasMore={hasMore} onClick={() => setOffset((p) => p + PAGE_SIZE)}>
                Load more matches
              </MoreButton>
            </div>
          ) : null}
        </section>
      </div>
    </TabShellPage>
  );
}
