import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useParams } from 'react-router-dom';
import './app-shell.css';
import { useTabNavigation } from './navigation/tab-navigation';
import {
  formatDateOrUnknown,
  getInitials,
  groupTournamentMatches,
  type RubberItem,
} from './player-shared';
import {
  usePlayerCurrentSeasonAffiliationsQuery,
  usePlayerExtendedStatsQuery,
  usePlayerInsightsQuery,
  usePlayerTournamentsQuery,
} from './queries';
import { SegmentedToggle } from './components/SegmentedToggle';
import { useFavouritePlayers } from './hooks/useFavouritePlayers';
import { useMyPlayer } from './hooks/useMyPlayer';
import { usePagedPlayerMatches } from './hooks/usePagedPlayerMatches';
import { SkeletonBlock, SkeletonList } from './components/Skeleton';
import { PlayerMatchList } from './components/PlayerMatchList';
import { TabShellPage } from './TabShellPage';
import {
  AppButton,
  AppButtonLink,
  AppMessageCard,
  AppPageContent,
  IconCircle,
  List,
  ListItem,
} from './ui/appkit';
import { DetailHeader } from './components/DetailHeader';
import { FavouriteButton } from './components/FavouriteButton';
import { FormResultPills } from './components/FormResultPills';
import { PlayerRatingPanel } from './components/PlayerRatingPanel';
import { buildPlayerShareTarget } from './share-target';
import { buildQuickJournalPath } from './player-match-list';

const APP_NAME = 'TT Players';
function setPageMeta(name: string, content: string): void {
  let tag = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.name = name;
    document.head.appendChild(tag);
  }
  tag.content = content;
}

function setPropertyMeta(property: string, content: string): void {
  let tag = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('property', property);
    document.head.appendChild(tag);
  }
  tag.content = content;
}

function setCanonicalLink(href: string): void {
  let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = href;
}

function PlayerProfileSkeleton() {
  return (
    <>
      <section className="tt-player-hero" aria-label="Loading player profile">
        <div className="tt-player-hero-top">
          <div className="tt-player-hero-copy">
            <SkeletonBlock className="tt-skeleton-eyebrow" />
            <SkeletonBlock className="tt-skeleton-title" />
            <SkeletonBlock className="tt-skeleton-text mt-2" />
          </div>
          <SkeletonBlock className="tt-skeleton-avatar" />
        </div>

        <div className="tt-player-spotlight">
          <div className="tt-player-winrate">
            <SkeletonBlock className="tt-skeleton-title" />
            <SkeletonBlock className="tt-skeleton-text mt-2" />
          </div>
          <div className="tt-player-hero-stats">
            <div className="tt-player-hero-stat"><SkeletonBlock className="tt-skeleton-stat" /></div>
            <div className="tt-player-hero-stat"><SkeletonBlock className="tt-skeleton-stat" /></div>
            <div className="tt-player-hero-stat"><SkeletonBlock className="tt-skeleton-stat" /></div>
          </div>
        </div>

        <div className="tt-player-actions">
          <SkeletonBlock className="tt-skeleton-button" />
          <SkeletonBlock className="tt-skeleton-button" />
        </div>

        <div className="tt-form-recent">
          <div className="tt-form-recent-list">
            {Array.from({ length: 8 }).map((_, index) => (
              <SkeletonBlock key={index} className="tt-skeleton-pill" />
            ))}
          </div>
        </div>
      </section>

      <section className="tt-player-section" aria-label="Loading current season">
        <div className="tt-player-section-header">
          <SkeletonBlock className="tt-skeleton-text" />
          <SkeletonBlock className="tt-skeleton-text app-skeleton-short" />
        </div>
        <SkeletonList rows={3} />
      </section>

      <section className="tt-player-section" aria-label="Loading form">
        <div className="tt-player-section-header">
          <SkeletonBlock className="tt-skeleton-text" />
          <SkeletonBlock className="tt-skeleton-text app-skeleton-short" />
        </div>
        <div className="tt-player-metric-grid">
          <div className="tt-player-metric"><SkeletonBlock className="tt-skeleton-stat" /></div>
          <div className="tt-player-metric"><SkeletonBlock className="tt-skeleton-stat" /></div>
          <div className="tt-player-metric"><SkeletonBlock className="tt-skeleton-stat" /></div>
        </div>
      </section>

      <section className="tt-player-section" aria-label="Loading recent matches">
        <div className="tt-player-section-header">
          <SkeletonBlock className="tt-skeleton-text" />
          <SkeletonBlock className="tt-skeleton-text app-skeleton-short" />
        </div>
        <SkeletonList rows={4} />
      </section>
    </>
  );
}

export function PlayerPage() {
  const { navigateInActiveTab, navigateInTab, switchTab } = useTabNavigation();
  const { playerId = '' } = useParams<{ playerId: string }>();

  const { isFavourite: isFavouritePlayer, toggle: toggleFavouritePlayer } = useFavouritePlayers();
  const { isMyPlayer, clear: clearMyPlayer } = useMyPlayer();
  const [seasonPanelMode, setSeasonPanelMode] = useState<'clubs' | 'tournaments'>('clubs');

  const statsQuery = usePlayerExtendedStatsQuery(playerId, Boolean(playerId));
  const affiliationsQuery = usePlayerCurrentSeasonAffiliationsQuery(playerId, Boolean(playerId));
  const recentMatchesState = usePagedPlayerMatches({
    playerId,
    source: 'all',
    enabled: Boolean(playerId),
    pageSize: 20,
  });
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

  const isFavourite = stats ? isFavouritePlayer(stats.player_id) : false;
  const isCurrentUser = isMyPlayer(playerId);
  const recentResults = useMemo(() => (insights?.form.recent_results ?? []).slice(0, 10), [insights]);
  const tournamentsPlayed = useMemo(() => groupTournamentMatches(tournamentMatches), [tournamentMatches]);
  const recentTournaments = useMemo(() => tournamentsPlayed.slice(0, 5), [tournamentsPlayed]);
  const shareTarget = useMemo(
    () => stats ? buildPlayerShareTarget(window.location.origin, stats.player_id, stats.player_name) : null,
    [stats],
  );

  useEffect(() => {
    if (!stats || !shareTarget) return;

    const title = shareTarget.title;
    const description = `${stats.player_name}: ${stats.total} matches, ${stats.wins} wins, ${winRate}% win rate.`;
    const imageUrl = `${window.location.origin}/images/thumb-players.png`;

    document.title = title;
    setPageMeta('description', description);
    setPageMeta('robots', 'index,follow');
    setPageMeta('theme-color', '#0f172a');
    setCanonicalLink(shareTarget.url);
    setPropertyMeta('og:type', 'profile');
    setPropertyMeta('og:site_name', APP_NAME);
    setPropertyMeta('og:title', title);
    setPropertyMeta('og:description', description);
    setPropertyMeta('og:url', shareTarget.url);
    setPropertyMeta('og:image', imageUrl);
    setPropertyMeta('twitter:card', 'summary_large_image');
    setPropertyMeta('twitter:title', title);
    setPropertyMeta('twitter:description', description);
    setPropertyMeta('twitter:image', imageUrl);
  }, [shareTarget, stats, winRate]);

  const goHome = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    switchTab('home', 'root');
  };

  const openSection =
    (relativePath: string) =>
    (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      navigateInActiveTab(relativePath);
    };

  const openMatch = (match: RubberItem) => {
    if (match.source === 'tournament' && match.event_id) {
      navigateInActiveTab(`event/${match.event_id}`);
      return;
    }
    navigateInTab('leagues', `fixture/${match.fixture_id}`);
  };

  const openOpponent = (opponentId: string) => {
    navigateInActiveTab(`player/${opponentId}`);
  };

  const openQuickJournal = (match: RubberItem) => {
    navigateInActiveTab(buildQuickJournalPath(playerId, match));
  };

  return (
    <TabShellPage>
      <DetailHeader title={stats?.player_name ?? 'Player'} shareTarget={shareTarget} />

      <AppPageContent>
        {statsLoading ? (
          <PlayerProfileSkeleton />
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
                <FavouriteButton
                  saved={Boolean(isFavourite)}
                  onToggle={() => {
                    if (!stats) return;
                    toggleFavouritePlayer({ id: stats.player_id, name: stats.player_name, played: stats.total, wins: stats.wins });
                  }}
                />
                <AppButtonLink
                  size="sm"
                  className="tt-player-action-pill"
                  tone="outline-highlight"
                  onClick={openSection(`player/${playerId}/insights`)}
                >
                  Insights
                </AppButtonLink>
                {isCurrentUser ? (
                  <AppButton
                    size="sm"
                    className="tt-player-action-pill"
                    tone="outline"
                    onClick={clearMyPlayer}
                  >
                    This isn’t me
                  </AppButton>
                ) : null}
              </div>

              <FormResultPills
                results={recentResults}
                label={null}
                loading={insightsLoading}
                emptyText="No form yet"
              />
            </section>

            <PlayerRatingPanel playerId={stats.player_id} />

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
                  <SkeletonList rows={3} />
                ) : affiliationsError ? (
                  <p className="tt-player-section-state tt-player-section-error">Unable to load current season clubs.</p>
                ) : affiliations.length === 0 ? (
                  <p className="tt-player-section-state">No active-season clubs found.</p>
                ) : (
                  <List divider="hairline" size="lg" className="tt-player-list">
                    {affiliations.map((affiliation: any) => (
                      <ListItem
                        key={`${affiliation.team_id}-${affiliation.competition_name}-${affiliation.season_id}`}
                        leading={<IconCircle iconClassName="fa fa-table-tennis" tone="accent" />}
                        title={affiliation.team_name}
                        subtitle={`${affiliation.league_name} · ${affiliation.competition_name} · ${affiliation.season_name}`}
                        onClick={() => navigateInTab('leagues', `team/${affiliation.team_id}`)}
                      />
                    ))}
                  </List>
                )
              ) : tournamentMatchesLoading ? (
                <SkeletonList rows={3} />
              ) : tournamentMatchesError ? (
                <p className="tt-player-section-state tt-player-section-error">Unable to load tournaments.</p>
              ) : recentTournaments.length === 0 ? (
                <p className="tt-player-section-state">No tournament appearances found.</p>
              ) : (
                <>
                  <List divider="hairline" size="lg" className="tt-player-list">
                    {recentTournaments.map((event) => {
                      const dateStr = formatDateOrUnknown(event.event_date);
                      const lossCount = event.played - event.wins;
                      return (
                        <ListItem
                          key={event.event_id}
                          leading={<IconCircle iconClassName="fa fa-trophy" tone="accent" />}
                          title={event.event_name}
                          subtitle={`${dateStr} · ${event.category ?? 'Tournament'} · ${event.wins}-${lossCount} from ${event.played}`}
                          onClick={() => navigateInActiveTab(`event/${event.event_id}`)}
                        />
                      );
                    })}
                  </List>
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
                <div className="tt-player-metric-grid" aria-label="Loading form insights">
                  <div className="tt-player-metric"><SkeletonBlock className="tt-skeleton-stat" /></div>
                  <div className="tt-player-metric"><SkeletonBlock className="tt-skeleton-stat" /></div>
                  <div className="tt-player-metric"><SkeletonBlock className="tt-skeleton-stat" /></div>
                </div>
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
                <h2 id="tt-player-matches-title" className="tt-player-section-title">Recent Matches</h2>
                <span className="tt-player-section-note">
                  {recentMatchesState.total > 0
                    ? `${recentMatchesState.matches.length} of ${recentMatchesState.total}`
                    : 'Latest results'}
                </span>
              </div>
              <PlayerMatchList
                playerId={playerId}
                matches={recentMatchesState.matches}
                total={recentMatchesState.total}
                hasMore={recentMatchesState.hasMore}
                isLoadingInitial={recentMatchesState.isLoadingInitial}
                isLoadingMore={recentMatchesState.isLoadingMore}
                error={recentMatchesState.error}
                quickJournalEnabled={isCurrentUser}
                onOpenMatch={openMatch}
                onOpenOpponent={openOpponent}
                onQuickJournal={openQuickJournal}
                onLoadMore={recentMatchesState.loadMore}
                onRetry={recentMatchesState.retry}
              />
            </section>
          </>
        )}
      </AppPageContent>
    </TabShellPage>
  );
}
