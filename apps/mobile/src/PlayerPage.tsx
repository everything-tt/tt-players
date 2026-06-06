import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useParams } from 'react-router-dom';
import './app-shell.css';
import { useTabNavigation } from './navigation/tab-navigation';
import {
  FAVOURITES_UPDATED_EVENT,
  formatMatchDate,
  formatDate,
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
  usePlayerTournamentsQuery,
} from './queries';
import { SegmentedToggle } from './components/SegmentedToggle';
import { TabShellPage } from './TabShellPage';
import {
  AppButtonLink,
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
  const [seasonPanelMode, setSeasonPanelMode] = useState<'clubs' | 'tournaments'>('clubs');

  const statsQuery = usePlayerExtendedStatsQuery(playerId, Boolean(playerId));
  const affiliationsQuery = usePlayerCurrentSeasonAffiliationsQuery(playerId, Boolean(playerId));
  const recentMatchesQuery = usePlayerRubbersQuery(playerId, 10, 0, Boolean(playerId));
  const insightsQuery = usePlayerInsightsQuery(playerId, Boolean(playerId));
  const tournamentsQuery = usePlayerTournamentsQuery(playerId, Boolean(playerId));

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

  const tournamentMatches = tournamentsQuery.data?.data ?? [];
  const tournamentMatchesLoading = tournamentsQuery.isLoading;
  const tournamentMatchesError = tournamentsQuery.error instanceof Error ? tournamentsQuery.error.message : null;

  const winRate = useMemo(() => {
    if (!stats || stats.total <= 0) return 0;
    return Math.round((stats.wins / stats.total) * 100);
  }, [stats]);

  const isFavourite = useMemo(() => {
    if (!stats) return false;
    return favouritePlayers.some((player) => player.id === stats.player_id);
  }, [favouritePlayers, stats]);
  const recentResults = useMemo(() => (insights?.form.recent_results ?? []).slice(0, 10), [insights]);
  const tournamentsPlayed = useMemo(() => {
    const events = new Map<string, {
      event_id: string;
      event_name: string;
      event_date: string | null;
      category: string | null;
      platform_name: string;
      played: number;
      wins: number;
    }>();

    for (const match of tournamentMatches as any[]) {
      const existing = events.get(match.event_id) ?? {
        event_id: match.event_id,
        event_name: match.event_name,
        event_date: match.event_date,
        category: match.category,
        platform_name: match.platform_name,
        played: 0,
        wins: 0,
      };
      const isWin = (match.winner_side === 'home' && match.player_side === 'home') ||
        (match.winner_side === 'away' && match.player_side === 'away');
      existing.played += 1;
      existing.wins += isWin ? 1 : 0;
      events.set(match.event_id, existing);
    }

    return Array.from(events.values());
  }, [tournamentMatches]);
  const recentTournaments = useMemo(() => tournamentsPlayed.slice(0, 5), [tournamentsPlayed]);

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
            <section className="tt-player-hero" aria-labelledby="tt-player-title">
              <div className="tt-player-hero-top">
                <div className="tt-player-hero-copy">
                  <p className="tt-player-eyebrow">Player profile</p>
                  <h1 id="tt-player-title" className="tt-player-title">{stats.player_name}</h1>
                  <p className="tt-player-summary-line">
                    {stats.total} matches, {stats.wins} wins, {winRate}% win rate
                  </p>
                </div>
                <div className="tt-player-summary-avatar" aria-hidden="true">
                  <span className="tt-player-summary-initials">{getInitials(stats.player_name)}</span>
                </div>
              </div>

              <div className="tt-player-spotlight" aria-label="Player summary">
                <div className="tt-player-winrate">
                  <span className="tt-player-winrate-value">{winRate}%</span>
                  <span className="tt-player-winrate-label">Win Rate</span>
                </div>
                <div className="tt-player-hero-stats">
                  <div className="tt-player-hero-stat">
                    <span className="tt-player-hero-stat-value">{stats.wins}</span>
                    <span className="tt-player-hero-stat-label">Wins</span>
                  </div>
                  <div className="tt-player-hero-stat">
                    <span className="tt-player-hero-stat-value">{stats.losses}</span>
                    <span className="tt-player-hero-stat-label">Losses</span>
                  </div>
                  <div className="tt-player-hero-stat">
                    <span className="tt-player-hero-stat-value">{stats.streak || '-'}</span>
                    <span className="tt-player-hero-stat-label">Streak</span>
                  </div>
                </div>
              </div>

              <div className="tt-player-actions">
                <AppButtonLink
                  size="sm"
                  className="tt-player-action-pill tt-favourite-action-button"
                  tone={isFavourite ? 'highlight' : 'outline-highlight'}
                  aria-label={isFavourite ? 'Remove favourite' : 'Save favourite'}
                  onClick={onToggleFavourite}
                >
                  <i className={`fa fa-heart ${isFavourite ? 'color-white' : 'color-highlight'}`} />
                  <span>{isFavourite ? 'Saved' : 'Save'}</span>
                </AppButtonLink>
                <AppButtonLink
                  size="sm"
                  className="tt-player-action-pill"
                  tone="outline-highlight"
                  onClick={openSection(`player/${playerId}/insights`)}
                >
                  Insights
                </AppButtonLink>
              </div>

              <div className="tt-form-recent">
                <span className="tt-form-recent-label">Recent</span>
                {insightsLoading ? (
                  <span className="tt-form-recent-empty">Loading...</span>
                ) : recentResults.length === 0 ? (
                  <span className="tt-form-recent-empty">No form yet</span>
                ) : (
                  <div className="tt-form-recent-list" aria-label="Recent results">
                    {recentResults.map((result: any, index: number) => (
                      <span
                        key={`${result}-${index}`}
                        className={`tt-form-result-pill ${result === 'W' ? 'tt-form-result-win' : 'tt-form-result-loss'}`}
                        aria-label={result === 'W' ? 'Win' : 'Loss'}
                      >
                        {result}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="tt-player-section" aria-label="Current season clubs and tournaments">
              <div className="tt-home-leaders-header">
                <SegmentedToggle
                  ariaLabel="Choose current season view"
                  value={seasonPanelMode}
                  onChange={setSeasonPanelMode}
                  options={[
                    { value: 'clubs', label: 'Clubs' },
                    { value: 'tournaments', label: 'Tournaments' },
                  ]}
                />
                <span className="tt-home-leaders-desc">
                  {seasonPanelMode === 'clubs' ? `${affiliations.length} teams` : `${tournamentsPlayed.length} events`}
                </span>
              </div>

              {seasonPanelMode === 'clubs' ? (
                affiliationsLoading ? (
                  <p className="tt-player-section-state"><i className="fa fa-spinner fa-spin me-2" />Loading current season clubs...</p>
                ) : affiliationsError ? (
                  <p className="tt-player-section-state tt-player-section-error">Unable to load current season clubs.</p>
                ) : affiliations.length === 0 ? (
                  <p className="tt-player-section-state">No active-season clubs found.</p>
                ) : (
                  <AppListGroup size="large" className="tt-player-list">
                    {affiliations.map((affiliation: any, index: number) => (
                      <AppListItem
                        key={`${affiliation.team_id}-${affiliation.competition_name}-${affiliation.season_id}`}
                        iconClassName="fa fa-table-tennis rounded-xl tt-icon-team"
                        title={affiliation.team_name}
                        subtitle={`${affiliation.league_name} · ${affiliation.competition_name} · ${affiliation.season_name}`}
                        onClick={openInLeaguesTab(`team/${affiliation.team_id}`)}
                        borderless={index === affiliations.length - 1}
                      />
                    ))}
                  </AppListGroup>
                )
              ) : tournamentMatchesLoading ? (
                <p className="tt-player-section-state"><i className="fa fa-spinner fa-spin me-2" />Loading tournaments...</p>
              ) : tournamentMatchesError ? (
                <p className="tt-player-section-state tt-player-section-error">Unable to load tournaments.</p>
              ) : recentTournaments.length === 0 ? (
                <p className="tt-player-section-state">No tournament appearances found.</p>
              ) : (
                <>
                  <AppListGroup size="large" className="tt-player-list">
                    {recentTournaments.map((event, index) => {
                    const dateStr = event.event_date ? formatDate(event.event_date) : 'Unknown Date';
                    const lossCount = event.played - event.wins;
                    return (
                      <AppListItem
                        key={event.event_id}
                        iconClassName="fa fa-trophy rounded-xl tt-icon-tournament"
                        title={event.event_name}
                        subtitle={`${dateStr} · ${event.category ?? 'Tournament'} · ${event.wins}-${lossCount} from ${event.played}`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigateInActiveTab(`event/${event.event_id}`);
                        }}
                        borderless={index === recentTournaments.length - 1}
                      />
                    );
                  })}
                  </AppListGroup>
                  {tournamentsPlayed.length > 0 ? (
                    <AppButtonLink
                      full
                      size="sm"
                      className="tt-player-full-list-button"
                      onClick={openSection(`player/${playerId}/tournaments`)}
                    >
                      View All Tournaments
                    </AppButtonLink>
                  ) : null}
                </>
              )}
            </section>

            <section className="tt-player-section" aria-labelledby="tt-player-form-title">
              <div className="tt-player-section-header">
                <h2 id="tt-player-form-title" className="tt-player-section-title">Form</h2>
                <span className="tt-player-section-note">Rolling performance</span>
              </div>
              {insightsLoading ? (
                <p className="tt-player-section-state"><i className="fa fa-spinner fa-spin me-2" />Loading form insights...</p>
              ) : insightsError || !insights ? (
                <p className="tt-player-section-state tt-player-section-error">Unable to load form insights.</p>
              ) : (
                <div className="tt-player-metric-grid">
                  <div className="tt-player-metric">
                    <span className="tt-player-metric-value">{insights.form.rolling_10_win_rate}%</span>
                    <span className="tt-player-metric-label">Rolling 10</span>
                  </div>
                  <div className="tt-player-metric">
                    <span className="tt-player-metric-value">{insights.form.rolling_20_win_rate}%</span>
                    <span className="tt-player-metric-label">Rolling 20</span>
                  </div>
                  <div className="tt-player-metric">
                    <span className="tt-player-metric-value text-capitalize">{insights.form.momentum}</span>
                    <span className="tt-player-metric-label">Momentum</span>
                  </div>
                </div>
              )}
            </section>

            <section className="tt-player-section" aria-labelledby="tt-player-matches-title">
              <div className="tt-player-section-header">
                <h2 id="tt-player-matches-title" className="tt-player-section-title">Last 10 League Matches</h2>
                <span className="tt-player-section-note">{recentMatches.length} matches</span>
              </div>
              {recentMatchesLoading ? (
                <p className="tt-player-section-state"><i className="fa fa-spinner fa-spin me-2" />Loading recent matches...</p>
              ) : recentMatchesError ? (
                <p className="tt-player-section-state tt-player-section-error">Unable to load recent matches.</p>
              ) : recentMatches.length === 0 ? (
                <p className="tt-player-section-state">No recent league matches found.</p>
              ) : (
                <>
                  <AppListGroup size="large" className="tt-player-list">
                    {recentMatches.map((match: any, index: number) => (
                      <AppListItem
                        key={match.id}
                        iconClassName={`fa ${match.isWin ? 'fa-check' : 'fa-times'} rounded-xl tt-match-result-icon ${match.isWin ? 'tt-match-result-win' : 'tt-match-result-loss'}`}
                        title={`${match.isWin ? 'Win' : 'Loss'} vs ${match.opponent} · ${match.result}`}
                        subtitle={`${formatMatchDate(match.date)} · ${match.league}`}
                        onClick={openInLeaguesTab(`fixture/${match.fixture_id}`)}
                        borderless={index === recentMatches.length - 1}
                      />
                    ))}
                  </AppListGroup>
                  <AppButtonLink
                    full
                    size="sm"
                    className="tt-player-full-list-button"
                    onClick={openSection(`player/${playerId}/matches`)}
                  >
                    View Full Match List
                  </AppButtonLink>
                </>
              )}
            </section>
          </>
        )}
      </AppPageContent>
    </TabShellPage>
  );
}
