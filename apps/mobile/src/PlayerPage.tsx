import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import './app-shell.css';
import { useTabNavigation } from './navigation/tab-navigation';
import {
  formatDateOrUnknown,
  getInitials,
  type RubberItem,
} from './player-shared';
import {
  usePlayerProfileOverviewQuery,
  usePlayerTournamentSummariesQuery,
} from './queries';
import { SegmentedToggle } from './components/SegmentedToggle';
import { useFavouritePlayers } from './hooks/useFavouritePlayers';
import { useMyPlayer } from './hooks/useMyPlayer';
import { usePagedPlayerMatches } from './hooks/usePagedPlayerMatches';
import { SkeletonBlock, SkeletonList } from './components/Skeleton';
import { PlayerMatchList } from './components/PlayerMatchList';
import { PlayerProfileHero } from './components/PlayerProfileHero';
import { PlayerRivalryOrbit } from './components/PlayerRivalryOrbit';
import { TabShellPage } from './TabShellPage';
import {
  AppButton,
  AppButtonLink,
  AppMessageCard,
  AppPageContent,
  FilterBar,
  IconCircle,
  List,
  ListItem,
  Pill,
} from './ui/appkit';
import { DetailHeader } from './components/DetailHeader';
import { buildPlayerShareTarget } from './share-target';
import { buildQuickJournalPath } from './player-match-list';

const APP_NAME = 'TT Players';

type PlayerMatchFilter =
  | {
      kind: 'team';
      id: string;
      label: string;
      sourceLabel: string;
    }
  | {
      kind: 'tournament';
      id: string;
      label: string;
    };

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
      <section className="tt-player-profile-hero" aria-label="Loading player profile">
        <div className="tt-player-profile-identity">
          <div className="tt-player-profile-copy">
            <SkeletonBlock className="tt-skeleton-eyebrow" />
            <SkeletonBlock className="tt-skeleton-title" />
            <SkeletonBlock className="tt-skeleton-text mt-2" />
          </div>
          <SkeletonBlock className="tt-skeleton-avatar" />
        </div>

        <div className="tt-player-profile-actions">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock key={index} className="tt-skeleton-button" />
          ))}
        </div>

        <div className="tt-player-profile-divider" />

        <div className="tt-player-profile-metrics" aria-label="Loading ability rating">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="tt-player-profile-metric">
              <SkeletonBlock className="tt-skeleton-stat" />
            </div>
          ))}
        </div>
        <div className="tt-player-profile-range">
          <SkeletonBlock className="tt-skeleton-text" />
        </div>

        <div className="tt-player-profile-form">
          <div className="tt-player-profile-form-grid">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index}><SkeletonBlock className="tt-skeleton-stat" /></div>
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
  const navigate = useNavigate();
  const { navigateInActiveTab, navigateInTab, switchTab } = useTabNavigation();
  const { playerId = '' } = useParams<{ playerId: string }>();

  const { isFavourite: isFavouritePlayer, toggle: toggleFavouritePlayer } = useFavouritePlayers();
  const { isMyPlayer, clear: clearMyPlayer } = useMyPlayer();
  const [seasonPanelMode, setSeasonPanelMode] = useState<'clubs' | 'tournaments'>('clubs');
  const [matchFilter, setMatchFilter] = useState<PlayerMatchFilter | null>(null);

  const overviewQuery = usePlayerProfileOverviewQuery(playerId, Boolean(playerId));
  const recentMatchesState = usePagedPlayerMatches({
    playerId,
    source: 'all',
    enabled: Boolean(playerId),
    pageSize: 20,
  });
  const filteredMatchesState = usePagedPlayerMatches({
    playerId,
    source: matchFilter?.kind === 'tournament' ? 'tournament' : 'league',
    enabled: Boolean(playerId) && Boolean(matchFilter),
    pageSize: 100,
  });
  const tournamentsQuery = usePlayerTournamentSummariesQuery(
    playerId,
    5,
    Boolean(playerId) && seasonPanelMode === 'tournaments',
  );

  const stats = overviewQuery.data ?? null;
  const statsError = playerId
    ? (overviewQuery.error instanceof Error ? overviewQuery.error.message : null)
    : 'Missing player id';
  const statsLoading = overviewQuery.isLoading;

  const affiliations = overviewQuery.data?.current_season_affiliations ?? [];
  const affiliationsError = overviewQuery.error instanceof Error ? overviewQuery.error.message : null;
  const affiliationsLoading = overviewQuery.isLoading;

  const tournamentSummaries = tournamentsQuery.data?.data ?? [];
  const tournamentTotal = tournamentsQuery.data?.total ?? 0;
  const tournamentSummariesLoading = tournamentsQuery.isLoading;
  const tournamentSummariesError = tournamentsQuery.error instanceof Error ? tournamentsQuery.error.message : null;

  const filteredMatches = useMemo(() => {
    if (!matchFilter) return [];

    if (matchFilter.kind === 'team') {
      return filteredMatchesState.matches.filter((match) => (
        match.source === 'league'
        && (match.source_label ?? match.league) === matchFilter.sourceLabel
      ));
    }

    return filteredMatchesState.matches.filter((match) => match.event_id === matchFilter.id);
  }, [filteredMatchesState.matches, matchFilter]);

  const displayedMatches = matchFilter ? filteredMatches : recentMatchesState.matches;
  const displayedMatchesState = matchFilter ? filteredMatchesState : recentMatchesState;

  const winRate = useMemo(() => {
    if (!stats || stats.total <= 0) return 0;
    return Math.round((stats.wins / stats.total) * 100);
  }, [stats]);

  const isFavourite = stats ? isFavouritePlayer(stats.player_id) : false;
  const isCurrentUser = isMyPlayer(playerId);
  const recentResults = useMemo(() => (stats?.form.recent_results ?? []).slice(0, 10), [stats]);
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

  const focusMatches = (filter: PlayerMatchFilter) => {
    setMatchFilter(filter);
    window.requestAnimationFrame(() => {
      document.getElementById('tt-player-matches-title')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
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
            <PlayerProfileHero
              playerId={stats.player_id}
              playerName={stats.player_name}
              initials={getInitials(stats.player_name)}
              totalMatches={stats.total}
              wins={stats.wins}
              winRate={winRate}
              isFavourite={Boolean(isFavourite)}
              isCurrentUser={isCurrentUser}
              shareTarget={shareTarget}
              rolling10WinRate={stats.form.rolling_10_win_rate}
              rolling20WinRate={stats.form.rolling_20_win_rate}
              momentum={stats.form.momentum}
              recentResults={recentResults}
              formLoading={statsLoading}
              formError={false}
              onToggleFavourite={() => {
                toggleFavouritePlayer({
                  id: stats.player_id,
                  name: stats.player_name,
                  played: stats.total,
                  wins: stats.wins,
                });
              }}
              onClearIdentity={clearMyPlayer}
              onOpenInsights={() => navigateInActiveTab(`player/${playerId}/insights`)}
              onOpenRatingHistory={() => navigateInActiveTab(`player/${playerId}/insights#rating-history`)}
            />

            <PlayerRivalryOrbit
              playerId={stats.player_id}
              playerName={stats.player_name}
              recentMatches={recentMatchesState.matches}
              onOpenPlayer={(opponentId) => navigate(`/h2h/${stats.player_id}/${opponentId}`)}
            />

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
                  {seasonPanelMode === 'clubs' ? `${affiliations.length} teams` : `${tournamentTotal} events`}
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
                    {affiliations.map((affiliation: any) => {
                      const sourceLabel = `${affiliation.league_name} · ${affiliation.competition_name}`;
                      const isActive = matchFilter?.kind === 'team'
                        && matchFilter.id === affiliation.team_id
                        && matchFilter.sourceLabel === sourceLabel;

                      return (
                        <ListItem
                          key={`${affiliation.team_id}-${affiliation.competition_name}-${affiliation.season_id}`}
                          leading={<IconCircle iconClassName="fa fa-table-tennis" tone="accent" />}
                          title={affiliation.team_name}
                          subtitle={`${sourceLabel} · ${affiliation.season_name}`}
                          active={isActive}
                          onClick={() => focusMatches({
                            kind: 'team',
                            id: affiliation.team_id,
                            label: affiliation.team_name,
                            sourceLabel,
                          })}
                          trailing={(
                            <AppButton
                              size="s"
                              tone="ghost"
                              iconOnly
                              aria-label={`Open ${affiliation.team_name} team`}
                              title={`Open ${affiliation.team_name} team`}
                              onClick={() => navigateInTab('leagues', `team/${affiliation.team_id}`)}
                            >
                              <i className="fa fa-angle-right" aria-hidden="true" />
                            </AppButton>
                          )}
                        />
                      );
                    })}
                  </List>
                )
              ) : tournamentSummariesLoading ? (
                <SkeletonList rows={3} />
              ) : tournamentSummariesError ? (
                <p className="tt-player-section-state tt-player-section-error">Unable to load tournaments.</p>
              ) : tournamentSummaries.length === 0 ? (
                <p className="tt-player-section-state">No tournament appearances found.</p>
              ) : (
                <>
                  <List divider="hairline" size="lg" className="tt-player-list">
                    {tournamentSummaries.map((event) => {
                      const dateStr = formatDateOrUnknown(event.event_date);
                      const lossCount = event.played - event.wins;
                      const isActive = matchFilter?.kind === 'tournament' && matchFilter.id === event.event_id;
                      return (
                        <ListItem
                          key={event.event_id}
                          leading={<IconCircle iconClassName="fa fa-trophy" tone="accent" />}
                          title={event.event_name}
                          subtitle={`${dateStr} · ${event.category ?? 'Tournament'} · ${event.wins}-${lossCount} from ${event.played}`}
                          active={isActive}
                          onClick={() => focusMatches({
                            kind: 'tournament',
                            id: event.event_id,
                            label: event.event_name,
                          })}
                          trailing={(
                            <AppButton
                              size="s"
                              tone="ghost"
                              iconOnly
                              aria-label={`Open ${event.event_name} tournament`}
                              title={`Open ${event.event_name} tournament`}
                              onClick={() => navigateInActiveTab(`event/${event.event_id}`)}
                            >
                              <i className="fa fa-angle-right" aria-hidden="true" />
                            </AppButton>
                          )}
                        />
                      );
                    })}
                  </List>
                  {tournamentTotal > 0 ? (
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

            <section className="tt-player-section" aria-labelledby="tt-player-matches-title">
              <div className="tt-player-section-header">
                <h2 id="tt-player-matches-title" className="tt-player-section-title">
                  {matchFilter ? 'Filtered Matches' : 'Recent Matches'}
                </h2>
                <span className="tt-player-section-note">
                  {matchFilter
                    ? `${displayedMatches.length} matching`
                    : recentMatchesState.total > 0
                      ? `${recentMatchesState.matches.length} of ${recentMatchesState.total}`
                      : 'Latest results'}
                </span>
              </div>

              {matchFilter ? (
                <FilterBar ariaLabel="Active match filter" scrollable={false}>
                  <Pill tone="accent" active>
                    {matchFilter.kind === 'team' ? 'Team' : 'Tournament'} · {matchFilter.label}
                  </Pill>
                  <AppButton size="s" tone="ghost" onClick={() => setMatchFilter(null)}>
                    Clear
                  </AppButton>
                </FilterBar>
              ) : null}

              <PlayerMatchList
                playerId={playerId}
                matches={displayedMatches}
                total={displayedMatchesState.total}
                hasMore={displayedMatchesState.hasMore}
                isLoadingInitial={displayedMatchesState.isLoadingInitial}
                isLoadingMore={displayedMatchesState.isLoadingMore}
                error={displayedMatchesState.error}
                quickJournalEnabled={isCurrentUser}
                showCount={!matchFilter}
                onOpenMatch={openMatch}
                onOpenOpponent={openOpponent}
                onQuickJournal={openQuickJournal}
                onLoadMore={displayedMatchesState.loadMore}
                onRetry={displayedMatchesState.retry}
              />
            </section>
          </>
        )}
      </AppPageContent>
    </TabShellPage>
  );
}
