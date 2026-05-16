import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useParams } from 'react-router-dom';
import './app-shell.css';
import { useTabNavigation } from './navigation/tab-navigation';
import { apiFetch, formatMatchDate, type ExtendedPlayerStats, type RubberItem, type RubbersResponse } from './player-shared';
import { TabShellPage } from './TabShellPage';
import {
  AppButtonLink,
  AppCard,
  AppCardContent,
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

  const [stats, setStats] = useState<ExtendedPlayerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [matches, setMatches] = useState<RubberItem[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [matchesLoadingMore, setMatchesLoadingMore] = useState(false);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);

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
      setStats(null);
      setStatsLoading(false);
      return;
    }

    const abortController = new AbortController();

    const loadStats = async () => {
      try {
        setStatsLoading(true);
        const payload = await apiFetch<ExtendedPlayerStats>(`/players/${playerId}/stats/extended`, abortController.signal);
        setStats(payload);
      } catch {
        setStats(null);
      } finally {
        setStatsLoading(false);
      }
    };

    loadStats();

    return () => {
      abortController.abort();
    };
  }, [playerId]);

  useEffect(() => {
    if (!playerId) {
      setMatches([]);
      setTotal(0);
      setMatchesError('Missing player id');
      setMatchesLoading(false);
      setMatchesLoadingMore(false);
      return;
    }

    const abortController = new AbortController();

    const loadMatches = async () => {
      try {
        if (offset === 0) {
          setMatchesLoading(true);
        } else {
          setMatchesLoadingMore(true);
        }
        setMatchesError(null);

        const payload = await apiFetch<RubbersResponse>(
          `/players/${playerId}/rubbers?limit=${PAGE_SIZE}&offset=${offset}`,
          abortController.signal,
        );

        setTotal(payload.total);
        setMatches((previous) => {
          if (offset === 0) return payload.data;
          const existingIds = new Set(previous.map((item) => item.id));
          return [...previous, ...payload.data.filter((item) => !existingIds.has(item.id))];
        });
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        if (offset === 0) {
          setMatches([]);
          setTotal(0);
        }
        setMatchesError((error as Error).message || 'Failed to load matches');
      } finally {
        setMatchesLoading(false);
        setMatchesLoadingMore(false);
      }
    };

    loadMatches();

    return () => {
      abortController.abort();
    };
  }, [offset, playerId]);

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
        <AppCard>
          <AppCardContent className="mb-2">
            <p className="mb-n1 color-highlight font-600">Player Matches</p>
            <h4>Full Match List</h4>
            {matchesLoading && matches.length === 0 ? (
              <p className="mb-0"><i className="fa fa-spinner fa-spin me-2" />Loading matches...</p>
            ) : matchesError && matches.length === 0 ? (
              <div>
                <p className="mb-3 color-red-dark">Failed to load match history.</p>
                <AppButtonLink onClick={goBack}>Back to Player</AppButtonLink>
              </div>
            ) : matches.length === 0 ? (
              <p className="mb-0">No matches available for this player.</p>
            ) : (
              <>
                <AppListGroup size="large" className="tt-match-history-list">
                  {matches.map((match, index) => (
                    <AppListItem
                      key={match.id}
                      iconClassName={`fa ${match.isWin ? 'fa-check' : 'fa-times'} rounded-xl ${match.isWin ? 'bg-green-dark' : 'bg-red-dark'} color-white`}
                      title={`${match.opponent} · ${match.result}`}
                      subtitle={`${formatMatchDate(match.date)} · ${match.league}`}
                      onClick={openFixtureInLeaguesTab(match.fixture_id)}
                      borderless={index === matches.length - 1}
                    />
                  ))}
                </AppListGroup>
                <p className="font-11 opacity-70 mt-3 mb-0">Showing {matches.length} of {total} matches</p>
              </>
            )}

            {matchesError && matches.length > 0 ? (
              <p className="mt-3 mb-0 color-red-dark font-12">Could not load more matches. Try again.</p>
            ) : null}

            {hasMore && matches.length > 0 ? (
              <AppButtonLink
                full
                size="sm"
                className="font-13 mt-3"
                tone={matchesLoadingMore ? 'gray' : 'highlight'}
                onClick={onLoadMore}
              >
                {matchesLoadingMore ? 'Loading...' : 'Load More Matches'}
              </AppButtonLink>
            ) : null}
          </AppCardContent>
        </AppCard>
      </AppPageContent>
    </TabShellPage>
  );
}
