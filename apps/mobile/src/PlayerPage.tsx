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
import { SectionSkeleton, SkeletonBlock, SkeletonList } from './components/Skeleton';
import { PlayerMatchList } from './components/PlayerMatchList';
import { TabShellPage } from './TabShellPage';
import {
  AppButton,
  AppButtonLink,
  AppMessageCard,
  AppPageContent,
  DesignAvatar,
  DesignList,
  EmptyState,
  EntityHero,
  ErrorState,
  IconCircle,
  Inline,
  ListItem,
  MetricGrid,
  PageSection,
  Stack,
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
  const loadingMetric = <SkeletonBlock className="tt-skeleton-stat" />;

  return (
    <Stack gap="md" aria-label="Loading player profile">
      <EntityHero
        eyebrow={<SkeletonBlock className="tt-skeleton-eyebrow" />}
        leading={<SkeletonBlock className="tt-skeleton-avatar" />}
        title={<SkeletonBlock className="tt-skeleton-title" />}
        subtitle={<SkeletonBlock className="tt-skeleton-text" />}
        actionPlacement="below"
        actions={(
          <Inline gap="xs" align="center" wrap>
            <SkeletonBlock className="tt-skeleton-button" />
            <SkeletonBlock className="tt-skeleton-button" />
          </Inline>
        )}
        highlights={(
          <MetricGrid
            density="compact"
            columns={4}
            ariaLabel="Loading player summary"
            metrics={[
              { label: 'Win rate', value: loadingMetric },
              { label: 'Wins', value: loadingMetric },
              { label: 'Losses', value: loadingMetric },
              { label: 'Streak', value: loadingMetric },
            ]}
          />
        )}
      />

      <SectionSkeleton rows={3} />
      <SectionSkeleton rows={3} />

      <PageSection
        surface="flat"
        density="compact"
        title={<SkeletonBlock className="tt-skeleton-text" />}
        meta={<SkeletonBlock className="tt-skeleton-text app-skeleton-short" />}
      >
        <MetricGrid
          density="compact"
          columns={3}
          ariaLabel="Loading form insights"
          metrics={[
            { label: 'Rolling 10', value: loadingMetric },
            { label: 'Rolling 20', value: loadingMetric },
            { label: 'Momentum', value: loadingMetric },
          ]}
        />
      </PageSection>

      <SectionSkeleton rows={4} />
    </Stack>
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
          <Stack gap="md" className="tt-player-profile-page">
            <EntityHero
              eyebrow="Player profile"
              leading={<DesignAvatar size="hero" text={getInitials(stats.player_name)} />}
              title={stats.player_name}
              subtitle={`${stats.total} matches · ${stats.wins} wins · ${winRate}% win rate`}
              actionPlacement="below"
              actions={(
                <Inline gap="xs" align="center" wrap>
                  <FavouriteButton
                    saved={Boolean(isFavourite)}
                    onToggle={() => toggleFavouritePlayer({
                      id: stats.player_id,
                      name: stats.player_name,
                      played: stats.total,
                      wins: stats.wins,
                    })}
                  />
                  <AppButtonLink
                    size="sm"
                    tone="outline-highlight"
                    onClick={openSection(`player/${playerId}/insights`)}
                  >
                    Insights
                  </AppButtonLink>
                  {isCurrentUser ? (
                    <AppButton size="sm" tone="outline" onClick={clearMyPlayer}>
                      This isn’t me
                    </AppButton>
                  ) : null}
                </Inline>
              )}
              highlights={(
                <Stack gap="sm">
                  <MetricGrid
                    density="compact"
                    columns={4}
                    ariaLabel="Player summary"
                    metrics={[
                      { label: 'Win rate', value: `${winRate}%` },
                      { label: 'Wins', value: stats.wins },
                      { label: 'Losses', value: stats.losses },
                      { label: 'Streak', value: stats.streak || '—' },
                    ]}
                  />
                  <FormResultPills
                    results={recentResults}
                    label={null}
                    loading={insightsLoading}
                    emptyText="No form yet"
                  />
                </Stack>
              )}
            />

            <PlayerRatingPanel playerId={stats.player_id} />

            <PageSection
              surface="flat"
              density="compact"
              title="Current season"
              meta={seasonPanelMode === 'clubs'
                ? `${affiliations.length} ${affiliations.length === 1 ? 'team' : 'teams'}`
                : `${tournamentsPlayed.length} ${tournamentsPlayed.length === 1 ? 'event' : 'events'}`}
              action={(
                <SegmentedToggle
                  ariaLabel="Choose current season view"
                  value={seasonPanelMode}
                  onChange={setSeasonPanelMode}
                  options={[
                    { value: 'clubs', label: 'Clubs' },
                    { value: 'tournaments', label: 'Tournaments' },
                  ]}
                />
              )}
            >
              {seasonPanelMode === 'clubs' ? (
                affiliationsLoading ? (
                  <SkeletonList rows={3} />
                ) : affiliationsError ? (
                  <ErrorState
                    title="Couldn’t load current-season clubs"
                    message={affiliationsError}
                    onRetry={() => void affiliationsQuery.refetch()}
                  />
                ) : affiliations.length === 0 ? (
                  <EmptyState
                    iconClassName="fa fa-table-tennis"
                    title="No active-season clubs"
                    message="No club affiliations are recorded for the current season."
                  />
                ) : (
                  <DesignList density="compact" divider="hairline" paginate={false}>
                    {affiliations.map((affiliation) => (
                      <ListItem
                        key={`${affiliation.team_id}-${affiliation.competition_name}-${affiliation.season_id}`}
                        leading={<IconCircle iconClassName="fa fa-table-tennis" tone="accent" />}
                        title={affiliation.team_name}
                        subtitle={`${affiliation.league_name} · ${affiliation.competition_name} · ${affiliation.season_name}`}
                        onClick={() => navigateInTab('leagues', `team/${affiliation.team_id}`)}
                      />
                    ))}
                  </DesignList>
                )
              ) : tournamentMatchesLoading ? (
                <SkeletonList rows={3} />
              ) : tournamentMatchesError ? (
                <ErrorState
                  title="Couldn’t load tournaments"
                  message={tournamentMatchesError}
                  onRetry={() => void tournamentsQuery.refetch()}
                />
              ) : recentTournaments.length === 0 ? (
                <EmptyState
                  iconClassName="fa fa-trophy"
                  title="No tournament appearances"
                  message="No tournament results are recorded for this player yet."
                />
              ) : (
                <Stack gap="sm">
                  <DesignList density="compact" divider="hairline" paginate={false}>
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
                  </DesignList>
                  <AppButtonLink
                    full
                    size="sm"
                    tone="outline"
                    onClick={openSection(`player/${playerId}/tournaments`)}
                  >
                    View all tournaments
                  </AppButtonLink>
                </Stack>
              )}
            </PageSection>

            <PageSection
              surface="flat"
              density="compact"
              title="Form"
              description="Rolling performance"
            >
              {insightsLoading ? (
                <MetricGrid
                  density="compact"
                  columns={3}
                  ariaLabel="Loading form insights"
                  metrics={[
                    { label: 'Rolling 10', value: <SkeletonBlock className="tt-skeleton-stat" /> },
                    { label: 'Rolling 20', value: <SkeletonBlock className="tt-skeleton-stat" /> },
                    { label: 'Momentum', value: <SkeletonBlock className="tt-skeleton-stat" /> },
                  ]}
                />
              ) : insightsError || !insights ? (
                <ErrorState
                  title="Couldn’t load form insights"
                  message={insightsError ?? 'Form insights are not available for this player yet.'}
                  onRetry={() => void insightsQuery.refetch()}
                />
              ) : (
                <MetricGrid
                  density="compact"
                  columns={3}
                  ariaLabel="Rolling player form"
                  metrics={[
                    { label: 'Rolling 10', value: `${insights.form.rolling_10_win_rate}%` },
                    { label: 'Rolling 20', value: `${insights.form.rolling_20_win_rate}%` },
                    { label: 'Momentum', value: insights.form.momentum },
                  ]}
                />
              )}
            </PageSection>

            <PageSection
              surface="flat"
              density="compact"
              title="Recent matches"
              meta={recentMatchesState.total > 0
                ? `${recentMatchesState.matches.length} of ${recentMatchesState.total}`
                : 'Latest results'}
            >
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
            </PageSection>
          </Stack>
        )}
      </AppPageContent>
    </TabShellPage>
  );
}
