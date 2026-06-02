import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useParams } from 'react-router-dom';
import './app-shell.css';
import { useTabNavigation } from './navigation/tab-navigation';
import { formatMatchDate, type RubberItem } from './player-shared';
import { usePlayerExtendedStatsQuery, usePlayerRubbersQuery } from './queries';
import { TabShellPage } from './TabShellPage';
import {
  AppButtonLink,
  AppHeader,
  AppHeaderSpacer,
  AppListGroup,
  AppListItem,
  AppPageContent,
} from './ui/appkit';

const PAGE_SIZE = 20;

export function PlayerMatchesPage() {
  const { goBackInActiveTab, navigateInTab, switchTab } = useTabNavigation();
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

  const goBack = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    goBackInActiveTab(playerId ? `player/${playerId}` : '');
  };

  const goHome = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    switchTab('home', 'root');
  };

  const onLoadMore = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (matchesLoadingMore || !hasMore) return;
    setOffset((previous) => previous + PAGE_SIZE);
  };

  const openFixtureInLeaguesTab = (fixtureId: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    navigateInTab('leagues', `fixture/${fixtureId}`);
  };

  useEffect(() => {
    if (!playerId) {
      setMatches([]);
      setTotal(0);
      setMatchesError('Missing player id');
      return;
    }

    if (matchesQuery.error instanceof Error) {
      if (offset === 0) {
        setMatches([]);
        setTotal(0);
      }
      setMatchesError(matchesQuery.error.message || 'Failed to load matches');
      return;
    }

    if (!matchesQuery.data) return;

    setMatchesError(null);
    setTotal(matchesQuery.data.total);
    setMatches((previous) => {
      if (offset === 0) return matchesQuery.data.data;
      const existingIds = new Set(previous.map((item) => item.id));
      return [...previous, ...matchesQuery.data.data.filter((item) => !existingIds.has(item.id))];
    });
  }, [matchesQuery.data, matchesQuery.error, offset, playerId]);

  useEffect(() => {
    setOffset(0);
    setMatches([]);
    setTotal(0);
    setMatchesError(null);
  }, [playerId]);

  return (
    <TabShellPage>
      <AppHeader
        title={statsLoading ? 'Match History' : stats?.player_name ?? 'Match History'}
        onTitleClick={goHome}
        leftAction={{ iconClassName: 'fas fa-chevron-left', onClick: goBack, position: 1, ariaLabel: 'Back' }}
        rightAction={{ iconClassName: 'fas fa-home', onClick: goHome, position: 4, ariaLabel: 'Home' }}
      />
      <AppHeaderSpacer />

      <AppPageContent>
        <section className="tt-player-section" aria-labelledby="tt-player-matches-full-title">
          <div className="tt-player-section-header">
            <h2 id="tt-player-matches-full-title" className="tt-player-section-title">Player Matches</h2>
            <span className="tt-player-section-note">Full Match List</span>
          </div>
            {matchesLoading && matches.length === 0 ? (
              <p className="tt-player-section-state mb-0"><i className="fa fa-spinner fa-spin me-2" />Loading matches...</p>
            ) : matchesError && matches.length === 0 ? (
              <div>
                <p className="tt-player-section-state tt-player-section-error mb-3">Failed to load match history.</p>
                <AppButtonLink onClick={goBack}>Back to Player</AppButtonLink>
              </div>
            ) : matches.length === 0 ? (
              <p className="tt-player-section-state mb-0">No matches available for this player.</p>
            ) : (
              <>
                <AppListGroup size="large" className="tt-match-history-list">
                  {matches.map((match, index) => (
                    <AppListItem
                      key={match.id}
                      iconClassName={`fa ${match.isWin ? 'fa-check' : 'fa-times'} rounded-xl ${match.isWin ? 'tt-icon-win' : 'tt-icon-loss'}`}
                      title={`${match.opponent} · ${match.result}`}
                      subtitle={`${formatMatchDate(match.date)} · ${match.league}`}
                      onClick={openFixtureInLeaguesTab(match.fixture_id)}
                      borderless={index === matches.length - 1}
                    />
                  ))}
                </AppListGroup>
                <p className="tt-player-section-state font-11 mt-3 mb-0">Showing {matches.length} of {total} matches</p>
              </>
            )}

            {matchesError && matches.length > 0 ? (
              <p className="tt-player-section-state tt-player-section-error mt-3 mb-0 font-12">Could not load more matches. Try again.</p>
            ) : null}

            {hasMore && matches.length > 0 ? (
              <AppButtonLink
                full
                size="sm"
                className="font-13 mt-3"
                tone={matchesLoadingMore ? 'outline-highlight' : 'highlight'}
                onClick={onLoadMore}
              >
                {matchesLoadingMore ? 'Loading...' : 'Load More Matches'}
              </AppButtonLink>
            ) : null}
        </section>
      </AppPageContent>
    </TabShellPage>
  );
}
