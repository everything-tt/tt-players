import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useParams } from 'react-router-dom';
import './app-shell.css';
import { useTabNavigation } from './navigation/tab-navigation';
import {
  FAVOURITES_UPDATED_EVENT,
  formatMatchDate,
  getInitials,
  parseStoredFavouritePlayers,
  persistFavouritePlayers,
  type FavouritePlayer,
} from './player-shared';
import {
  usePlayerCurrentSeasonAffiliationsQuery,
  usePlayerExtendedStatsQuery,
  usePlayerInsightsQuery,
  usePlayerRubbersQuery,
} from './queries';
import { TabShellPage } from './TabShellPage';
import {
  AppButtonLink,
  AppCard,
  AppCardContent,
  AppHeader,
  AppHeaderSpacer,
  AppListGroup,
  AppListItem,
  AppLoadingCard,
  AppMessageCard,
  AppPageContent,
} from './ui/appkit';

export function PlayerPage() {
  const { goBackInActiveTab, navigateInActiveTab, navigateInTab, switchTab } = useTabNavigation();
  const { playerId = '' } = useParams<{ playerId: string }>();

  const [favouritePlayers, setFavouritePlayers] = useState<FavouritePlayer[]>(() => parseStoredFavouritePlayers());

  const statsQuery = usePlayerExtendedStatsQuery(playerId, Boolean(playerId));
  const affiliationsQuery = usePlayerCurrentSeasonAffiliationsQuery(playerId, Boolean(playerId));
  const recentMatchesQuery = usePlayerRubbersQuery(playerId, 10, 0, Boolean(playerId));
  const insightsQuery = usePlayerInsightsQuery(playerId, Boolean(playerId));

  const stats = statsQuery.data ?? null;
  const statsError = playerId
    ? (statsQuery.error instanceof Error ? statsQuery.error.message : null)
    : 'Missing player id';
  const statsLoading = statsQuery.isLoading;

  const affiliations = affiliationsQuery.data?.data ?? [];
  const affiliationsError = affiliationsQuery.error instanceof Error ? affiliationsQuery.error.message : null;
  const affiliationsLoading = affiliationsQuery.isLoading;

  const recentMatches = recentMatchesQuery.data?.data ?? [];
  const recentMatchesError = recentMatchesQuery.error instanceof Error ? recentMatchesQuery.error.message : null;
  const recentMatchesLoading = recentMatchesQuery.isLoading;

  const insights = insightsQuery.data ?? null;
  const insightsError = insightsQuery.error instanceof Error ? insightsQuery.error.message : null;
  const insightsLoading = insightsQuery.isLoading;

  const winRate = useMemo(() => {
    if (!stats || stats.total <= 0) return 0;
    return Math.round((stats.wins / stats.total) * 100);
  }, [stats]);

  const isFavourite = useMemo(() => {
    if (!stats) return false;
    return favouritePlayers.some((player) => player.id === stats.player_id);
  }, [favouritePlayers, stats]);
  const recentResults = useMemo(() => (insights?.form.recent_results ?? []).slice(0, 10), [insights]);

  const goBack = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    goBackInActiveTab();
  };

  const goHome = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    switchTab('home', 'root');
  };

  const onToggleFavourite = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (!stats) return;

    setFavouritePlayers((previous) => {
      const exists = previous.some((player) => player.id === stats.player_id);
      const next = exists
        ? previous.filter((player) => player.id !== stats.player_id)
        : [{
          id: stats.player_id,
          name: stats.player_name,
          played: stats.total,
          wins: stats.wins,
        }, ...previous.filter((player) => player.id !== stats.player_id)];

      persistFavouritePlayers(next);
      return next;
    });
  };

  const openSection =
    (relativePath: string) =>
    (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      navigateInActiveTab(relativePath);
    };

  const openInLeaguesTab =
    (relativePath: string) =>
    (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      navigateInTab('leagues', relativePath);
    };

  useEffect(() => {
    const syncFromStorage = () => {
      setFavouritePlayers(parseStoredFavouritePlayers());
    };

    window.addEventListener('storage', syncFromStorage);
    window.addEventListener(FAVOURITES_UPDATED_EVENT, syncFromStorage);
    return () => {
      window.removeEventListener('storage', syncFromStorage);
      window.removeEventListener(FAVOURITES_UPDATED_EVENT, syncFromStorage);
    };
  }, []);

  return (
    <TabShellPage>
      <AppHeader
        title={stats?.player_name ?? 'Player'}
        onTitleClick={goHome}
        leftAction={{ iconClassName: 'fas fa-chevron-left', onClick: goBack, position: 1, ariaLabel: 'Back' }}
        rightAction={{ iconClassName: 'fas fa-home', onClick: goHome, position: 4, ariaLabel: 'Home' }}
      />
      <AppHeaderSpacer />

      <AppPageContent>
        {statsLoading ? (
          <AppLoadingCard message="Loading player profile..." />
        ) : !stats ? (
          <AppMessageCard
            title="Player not available"
            message={statsError || 'Failed to load this player profile.'}
            action={{ label: 'Back Home', onClick: goHome }}
          />
        ) : (
          <>
            <AppCard>
              <AppCardContent className="d-flex mb-1">
                <div className="flex-grow-1">
                  <h2>{stats.player_name}<i className="fa fa-check-circle color-blue-dark font-16 ms-2" /></h2>
                  <p className="mb-2 mt-3 me-3">
                    Profile summary for quick access to insights, match history and season affiliations.
                  </p>
                  <p className="font-10 mb-0">
                    <strong className="color-theme pe-1">{winRate}%</strong>Win Rate
                    <strong className="color-theme ps-3 pe-1">{stats.total}</strong>Matches
                  </p>
                </div>
                <div className="tt-player-summary-avatar align-self-center">
                  <span className="tt-player-summary-initials">{getInitials(stats.player_name)}</span>
                </div>
              </AppCardContent>
              <AppCardContent className="mb-0">
                <div className="row mb-0">
                  <div className="col-3">
                    <AppButtonLink
                      full
                      size="sm"
                      className="tt-favourite-action-button"
                      tone={isFavourite ? 'highlight' : 'outline-highlight'}
                      aria-label={isFavourite ? 'Remove favourite' : 'Save favourite'}
                      onClick={onToggleFavourite}
                    >
                      <i className={`fa fa-heart ${isFavourite ? 'color-white' : 'color-highlight'}`} />
                    </AppButtonLink>
                  </div>
                  <div className="col-9">
                    <AppButtonLink
                      full
                      size="sm"
                      className="font-13"
                      tone="outline-highlight"
                      onClick={openSection(`player/${playerId}/insights`)}
                    >
                      Insights
                    </AppButtonLink>
                  </div>
                </div>
              </AppCardContent>
              <div className="tt-player-summary-divider" />
              <AppCardContent className="mb-2">
                <div className="row text-center row-cols-3 mb-n1">
                  <div className="col mb-3">
                    <div className="tt-player-chip">
                      <h5 className="mb-0">{stats.wins}</h5>
                      <p className="font-10 mb-0">Wins</p>
                    </div>
                  </div>
                  <div className="col mb-3">
                    <div className="tt-player-chip">
                      <h5 className="mb-0">{stats.losses}</h5>
                      <p className="font-10 mb-0">Losses</p>
                    </div>
                  </div>
                  <div className="col mb-3">
                    <div className="tt-player-chip">
                      <h5 className="mb-0">{stats.streak || '-'}</h5>
                      <p className="font-10 mb-0">Streak</p>
                    </div>
                  </div>
                </div>
                <div className="tt-form-recent mt-1">
                  <span className="tt-form-recent-label">Recent</span>
                  {insightsLoading ? (
                    <span className="tt-form-recent-empty">Loading...</span>
                  ) : recentResults.length === 0 ? (
                    <span className="tt-form-recent-empty">-</span>
                  ) : (
                    <div className="tt-form-recent-list">
                      {recentResults.map((result: any, index: number) => (
                        <span
                          key={`${result}-${index}`}
                          className={`tt-form-result-pill ${result === 'W' ? 'tt-form-result-win' : 'tt-form-result-loss'}`}
                        >
                          {result}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </AppCardContent>
            </AppCard>

            <AppCard>
              <AppCardContent className="mb-2">
                <div className="d-flex mb-2">
                  <div className="align-self-center">
                    <h1 className="mb-0 font-16">Current Season</h1>
                  </div>
                  <div className="ms-auto align-self-center">
                    <span className="font-11 opacity-60">{affiliations.length} teams</span>
                  </div>
                </div>
                {affiliationsLoading ? (
                  <p className="mb-0"><i className="fa fa-spinner fa-spin me-2" />Loading current season clubs...</p>
                ) : affiliationsError ? (
                  <p className="mb-0 color-red-dark">Unable to load current season clubs.</p>
                ) : affiliations.length === 0 ? (
                  <p className="mb-0">No active-season clubs found.</p>
                ) : (
                  <AppListGroup size="large" className="tt-season-list">
                    {affiliations.map((affiliation: any, index: number) => (
                      <AppListItem
                        key={`${affiliation.team_id}-${affiliation.competition_name}-${affiliation.season_id}`}
                        iconClassName="fa fa-table-tennis rounded-xl bg-blue-dark color-white"
                        title={affiliation.team_name}
                        subtitle={`${affiliation.league_name} · ${affiliation.competition_name} · ${affiliation.season_name}`}
                        onClick={openInLeaguesTab(`team/${affiliation.team_id}`)}
                        borderless={index === affiliations.length - 1}
                      />
                    ))}
                  </AppListGroup>
                )}
              </AppCardContent>
            </AppCard>

            <AppCard>
              <AppCardContent className="mb-2">
                <div className="d-flex mb-2">
                  <div className="align-self-center">
                    <h1 className="mb-0 font-16">Form</h1>
                  </div>
                  <div className="ms-auto align-self-center">
                    <span className="font-11 opacity-60">Rolling performance</span>
                  </div>
                </div>
                {insightsLoading ? (
                  <p className="mb-0"><i className="fa fa-spinner fa-spin me-2" />Loading form insights...</p>
                ) : insightsError || !insights ? (
                  <p className="mb-0 color-red-dark">Unable to load form insights.</p>
                ) : (
                  <div className="row text-center row-cols-3 mb-0">
                    <div className="col mb-3">
                      <div className="tt-player-chip">
                        <h5 className="mb-0">{insights.form.rolling_10_win_rate}%</h5>
                        <p className="font-10 mb-0">Rolling 10</p>
                      </div>
                    </div>
                    <div className="col mb-3">
                      <div className="tt-player-chip">
                        <h5 className="mb-0">{insights.form.rolling_20_win_rate}%</h5>
                        <p className="font-10 mb-0">Rolling 20</p>
                      </div>
                    </div>
                    <div className="col mb-3">
                      <div className="tt-player-chip">
                        <h5 className="mb-0 text-capitalize">{insights.form.momentum}</h5>
                        <p className="font-10 mb-0">Momentum</p>
                      </div>
                    </div>
                  </div>
                )}
              </AppCardContent>
            </AppCard>

            <AppCard>
              <AppCardContent className="mb-2">
                <div className="d-flex mb-2">
                  <div className="align-self-center">
                    <h1 className="mb-0 font-16">Last 10 Matches</h1>
                  </div>
                  <div className="ms-auto align-self-center">
                    <span className="font-11 opacity-60">{recentMatches.length} matches</span>
                  </div>
                </div>
                {recentMatchesLoading ? (
                  <p className="mb-0"><i className="fa fa-spinner fa-spin me-2" />Loading recent matches...</p>
                ) : recentMatchesError ? (
                  <p className="mb-0 color-red-dark">Unable to load recent matches.</p>
                ) : recentMatches.length === 0 ? (
                  <p className="mb-3">No recent matches found.</p>
                ) : (
                  <>
                    <AppListGroup size="large" className="tt-match-history-list">
                      {recentMatches.map((match: any, index: number) => (
                        <AppListItem
                          key={match.id}
                          iconClassName={`fa ${match.isWin ? 'fa-check' : 'fa-times'} rounded-xl ${match.isWin ? 'bg-green-dark' : 'bg-red-dark'} color-white`}
                          title={`${match.opponent} · ${match.result}`}
                          subtitle={`${formatMatchDate(match.date)} · ${match.league}`}
                          onClick={openInLeaguesTab(`fixture/${match.fixture_id}`)}
                          borderless={index === recentMatches.length - 1}
                        />
                      ))}
                    </AppListGroup>
                    <AppButtonLink
                      full
                      size="sm"
                      className="font-13 mt-3"
                      onClick={openSection(`player/${playerId}/matches`)}
                    >
                      View Full Match List
                    </AppButtonLink>
                  </>
                )}
              </AppCardContent>
            </AppCard>
          </>
        )}
      </AppPageContent>
    </TabShellPage>
  );
}
