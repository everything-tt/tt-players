import { useEffect, useState } from 'react';
import type { AppTabId } from './navigation/tab-navigation';
import { useMyPlayer } from './hooks/useMyPlayer';
import { useTabNavigation } from './navigation/tab-navigation';
import { type LeagueWithDivisions, TAB_METADATA, getQueryError } from './player-shared';
import {
  useLeagueCollectionDashboardQuery,
  usePlayerCountQuery,
  usePlayerProfileOverviewQuery,
} from './queries';
import {
  useLeagueRisersQuery,
  usePlayerRatingHistoryQuery,
  usePlayerRatingQuery,
  useTopRatingsQuery,
  useTopSiteRatingsQuery,
} from './rating-queries';
import {
  HOME_VISIT_SNAPSHOT_STORAGE_KEY,
  buildHomeScopeKey,
  buildPersonalHomeStories,
  diffHomeVisit,
  parseHomeVisitSnapshot,
  rankHomeStories,
  type HomeVisitChange,
  type HomeVisitState,
} from './home-activity';
import {
  AppButton,
  DesignAvatar,
  EmptyState,
  ErrorState,
  FilterBar,
  IconCircle,
  List,
  ListItem,
  MetricGrid,
  Pill,
  RankBadge,
  SectionHeader,
  SegmentedToggle,
  Surface,
} from './ui/appkit';
import { SkeletonList } from './components/Skeleton';
import { PlayerSearchSheet } from './PlayerSearchSheet';
import './home-hero.css';

interface HomeTabContentProps {
  allLeagues: LeagueWithDivisions[];
  hasCompletedLeagueOnboarding: boolean;
  selectedLeagueIds: string[];
  onOpenLeagueSelector: () => void;
  onOpenTab: (tabId: DashboardTabId) => void;
}

type DashboardTabId = Exclude<AppTabId, 'home'>;
type HomeRatingsScope = 'site' | 'selected';
type HomeStoryTone = 'success' | 'accent' | 'neutral' | 'warning';
type HomeStoryKind =
  | 'personal-result'
  | 'personal-form'
  | 'recent-rating-high'
  | 'result'
  | 'riser'
  | 'leader';

type HomeStory = {
  id: string;
  kind: HomeStoryKind;
  priority: number;
  title: string;
  subtitle: string;
  trailing: string;
  iconClassName: string;
  tone: HomeStoryTone;
  targetTab: AppTabId;
  targetPath: string;
};

const HOME_RATINGS_LIMIT = 4;
const HOME_STORY_LIMIT = 4;

function formatDate(value: string | null): string {
  if (!value) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(`${value}T12:00:00`));
}

function formatVisitDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'your previous visit';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    .format(date);
}

function formatCompactCount(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-GB', {
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatMomentum(momentum: 'hot' | 'steady' | 'cold' | 'new' | undefined): string {
  if (momentum === 'hot') return 'In form';
  if (momentum === 'cold') return 'Building';
  if (momentum === 'new') return 'New';
  return 'Steady';
}

function formatRatingMove(value: number | null): string {
  if (value == null) return 'Latest rating move unavailable';
  const rounded = Math.round(value);
  return `Latest rating move ${rounded > 0 ? '+' : ''}${rounded}`;
}

function iconForVisitChange(change: HomeVisitChange): { iconClassName: string; tone: HomeStoryTone; label: string } {
  if (change.kind === 'personal-rating') {
    return { iconClassName: 'fa fa-arrow-trend-up', tone: 'success', label: 'You' };
  }
  if (change.kind === 'new-results') {
    return { iconClassName: 'fa fa-bolt', tone: 'accent', label: 'New' };
  }
  if (change.kind === 'leader-change') {
    return { iconClassName: 'fa fa-crown', tone: 'warning', label: 'Changed' };
  }
  return { iconClassName: 'fa fa-chart-line', tone: 'success', label: 'Now' };
}

export function HomeTabContent({
  allLeagues,
  hasCompletedLeagueOnboarding,
  selectedLeagueIds,
  onOpenLeagueSelector,
  onOpenTab,
}: HomeTabContentProps) {
  const { navigateInTab } = useTabNavigation();
  const { player: myPlayer, setMyPlayer } = useMyPlayer();
  const [claimSheetOpen, setClaimSheetOpen] = useState(false);
  const [previousVisitSnapshot] = useState(() => {
    if (typeof window === 'undefined') return null;
    return parseHomeVisitSnapshot(window.localStorage.getItem(HOME_VISIT_SNAPSHOT_STORAGE_KEY));
  });
  const hasLeagueScope = hasCompletedLeagueOnboarding && selectedLeagueIds.length > 0;
  const [ratingsScope, setRatingsScope] = useState<HomeRatingsScope>(hasLeagueScope ? 'selected' : 'site');
  const isSelectedRatingsScope = hasLeagueScope && ratingsScope === 'selected';
  const isAllLeagueScope = hasLeagueScope
    && allLeagues.length > 0
    && selectedLeagueIds.length === allLeagues.length;
  const scopedLeagueIds = isAllLeagueScope ? [] : selectedLeagueIds;

  useEffect(() => {
    setRatingsScope(hasLeagueScope ? 'selected' : 'site');
  }, [hasLeagueScope]);

  const dashboardQuery = useLeagueCollectionDashboardQuery(scopedLeagueIds, hasLeagueScope);
  const dashboard = dashboardQuery.data ?? null;
  const profileQuery = usePlayerProfileOverviewQuery(myPlayer?.id ?? '', Boolean(myPlayer));
  const ratingQuery = usePlayerRatingQuery(myPlayer?.id ?? '', Boolean(myPlayer));
  const ratingHistoryQuery = usePlayerRatingHistoryQuery(myPlayer?.id ?? '', '3m', Boolean(myPlayer));
  const topRatingsQuery = useTopRatingsQuery(
    selectedLeagueIds,
    HOME_RATINGS_LIMIT,
    isSelectedRatingsScope,
  );
  const risersQuery = useLeagueRisersQuery(selectedLeagueIds, 1, 42, hasLeagueScope);
  const topSiteRatingsQuery = useTopSiteRatingsQuery(HOME_RATINGS_LIMIT, !isSelectedRatingsScope);
  const playerCountQuery = usePlayerCountQuery();

  const topRiser = risersQuery.data?.data[0] ?? null;
  const topTeam = dashboard?.top_teams[0] ?? null;
  const dashboardError = getQueryError(dashboardQuery.error);
  const highlightsError = getQueryError(risersQuery.error) ?? dashboardError;
  const rankings = isSelectedRatingsScope
    ? topRatingsQuery.data?.data ?? []
    : topSiteRatingsQuery.data?.data ?? [];
  const rankingsLoading = isSelectedRatingsScope
    ? topRatingsQuery.isLoading
    : topSiteRatingsQuery.isLoading;
  const rankingsError = getQueryError(isSelectedRatingsScope
    ? topRatingsQuery.error
    : topSiteRatingsQuery.error);
  const setupReadyCount = Number(Boolean(myPlayer)) + Number(hasLeagueScope);
  const navItems: DashboardTabId[] = ['players', 'leagues', 'h2h', 'events'];
  const playerRating = ratingQuery.data?.data ?? null;
  const ratingHistory = ratingHistoryQuery.data?.data ?? [];
  const latestRatingMove = ratingHistory.length > 0
    ? ratingHistory[ratingHistory.length - 1]?.rating_change ?? null
    : null;
  const primaryAffiliation = (profileQuery.data?.current_season_affiliations ?? []).find(
    (affiliation) => selectedLeagueIds.includes(affiliation.league_id),
  ) ?? profileQuery.data?.current_season_affiliations?.[0] ?? null;
  const heroPlayerName = profileQuery.data?.player_name ?? myPlayer?.name ?? '';
  const personalTeamNames = new Set(
    (profileQuery.data?.current_season_affiliations ?? [])
      .filter((affiliation) => selectedLeagueIds.includes(affiliation.league_id))
      .map((affiliation) => affiliation.team_name),
  );

  const storyCandidates: HomeStory[] = [];
  if (myPlayer) {
    for (const story of buildPersonalHomeStories({
      recentResults: profileQuery.data?.form.recent_results ?? [],
      currentRating: playerRating?.rating ?? null,
      ratingHistory,
    })) {
      storyCandidates.push({
        ...story,
        iconClassName: story.kind === 'personal-form' ? 'fa fa-fire' : 'fa fa-arrow-trend-up',
        tone: 'success',
        targetTab: 'home',
        targetPath: 'my-tt',
      });
    }
  }

  if (topRiser) {
    storyCandidates.push({
      id: `riser:${topRiser.player_id}`,
      kind: 'riser',
      priority: 95,
      title: `${topRiser.player_name} surged +${Math.round(topRiser.change)}`,
      subtitle: `Biggest 6-week rating gain in your leagues · now #${topRiser.overall_rank} globally`,
      trailing: 'On the rise',
      iconClassName: 'fa fa-chart-line',
      tone: 'success',
      targetTab: 'players',
      targetPath: `player/${topRiser.player_id}`,
    });
  }

  for (const [index, result] of (dashboard?.recent_results ?? []).slice(0, 4).entries()) {
    const homeName = result.home_team_name ?? 'Home';
    const awayName = result.away_team_name ?? 'Away';
    const personalTeam = personalTeamNames.has(homeName)
      ? homeName
      : personalTeamNames.has(awayName)
        ? awayName
        : null;
    const isPersonal = Boolean(personalTeam);
    const personalIsHome = personalTeam === homeName;
    const ownScore = personalIsHome ? result.home_score : result.away_score;
    const opponentScore = personalIsHome ? result.away_score : result.home_score;
    const opponent = personalIsHome ? awayName : homeName;
    const outcome = ownScore > opponentScore ? 'beat' : ownScore < opponentScore ? 'lost to' : 'drew with';

    storyCandidates.push({
      id: `result:${result.fixture_id}`,
      kind: isPersonal ? 'personal-result' : 'result',
      priority: (isPersonal ? 120 : 80) - index,
      title: isPersonal
        ? `${personalTeam} ${outcome} ${opponent} ${ownScore}–${opponentScore}`
        : `${homeName} ${result.home_score}–${result.away_score} ${awayName}`,
      subtitle: `${isPersonal ? 'Your team' : index === 0 ? 'Latest result' : 'Recent result'} · ${result.division_name} · ${formatDate(result.date_played)}`,
      trailing: isPersonal ? 'Your team' : 'Result',
      iconClassName: isPersonal ? 'fa fa-bolt' : 'fa fa-table-tennis',
      tone: isPersonal ? 'accent' : 'neutral',
      targetTab: 'leagues',
      targetPath: `fixture/${result.fixture_id}`,
    });
  }

  if (topTeam) {
    const isPersonalLeader = personalTeamNames.has(topTeam.team_name);
    storyCandidates.push({
      id: `leader:${topTeam.team_id}`,
      kind: 'leader',
      priority: isPersonalLeader ? 90 : 70,
      title: isPersonalLeader ? `${topTeam.team_name} set the pace` : `${topTeam.team_name} lead ${topTeam.division_name}`,
      subtitle: `${isPersonalLeader ? 'Your team leads' : 'League leaders'} · ${topTeam.won}W ${topTeam.drawn}D ${topTeam.lost}L · ${Math.round(topTeam.win_rate)}% wins`,
      trailing: 'Leaders',
      iconClassName: 'fa fa-crown',
      tone: 'warning',
      targetTab: 'leagues',
      targetPath: `team/${topTeam.team_id}`,
    });
  }

  const highlightStories = rankHomeStories(storyCandidates, HOME_STORY_LIMIT);
  const highlightsLoading = dashboardQuery.isLoading
    || risersQuery.isLoading
    || Boolean(myPlayer && (profileQuery.isLoading || ratingQuery.isLoading || ratingHistoryQuery.isLoading));

  const homeScopeKey = buildHomeScopeKey(myPlayer?.id ?? null, hasLeagueScope ? selectedLeagueIds : []);
  const recentResultIds = (dashboard?.recent_results ?? []).slice(0, 5).map((result) => result.fixture_id);
  const currentVisitState: HomeVisitState = {
    scopeKey: homeScopeKey,
    rating: playerRating?.rating ?? null,
    rank: playerRating?.rank ?? null,
    recentResultIds,
    topTeamId: topTeam?.team_id ?? null,
    topTeamName: topTeam?.team_name ?? null,
    topRiserPlayerId: topRiser?.player_id ?? null,
    topRiserName: topRiser?.player_name ?? null,
  };
  const activityReady = hasLeagueScope
    && !dashboardQuery.isLoading
    && !risersQuery.isLoading
    && (!myPlayer || !ratingQuery.isLoading);
  const sinceLastVisitChanges = activityReady
    ? diffHomeVisit(previousVisitSnapshot, currentVisitState).slice(0, 4)
    : [];
  const recentResultIdsKey = recentResultIds.join('|');

  useEffect(() => {
    if (!activityReady || typeof window === 'undefined') return;
    const snapshot: HomeVisitState = {
      scopeKey: homeScopeKey,
      rating: playerRating?.rating ?? null,
      rank: playerRating?.rank ?? null,
      recentResultIds: recentResultIdsKey ? recentResultIdsKey.split('|') : [],
      topTeamId: topTeam?.team_id ?? null,
      topTeamName: topTeam?.team_name ?? null,
      topRiserPlayerId: topRiser?.player_id ?? null,
      topRiserName: topRiser?.player_name ?? null,
    };
    window.localStorage.setItem(HOME_VISIT_SNAPSHOT_STORAGE_KEY, JSON.stringify({
      ...snapshot,
      seenAt: new Date().toISOString(),
    }));
  }, [
    activityReady,
    homeScopeKey,
    playerRating?.rating,
    playerRating?.rank,
    recentResultIdsKey,
    topTeam?.team_id,
    topTeam?.team_name,
    topRiser?.player_id,
    topRiser?.player_name,
  ]);

  const divisionCount = allLeagues.reduce((total, league) => total + league.divisions.length, 0);
  const pulseMetrics = [
    { label: 'Players', value: formatCompactCount(playerCountQuery.data?.players) },
    { label: 'Matches', value: formatCompactCount(playerCountQuery.data?.matches) },
    { label: 'Leagues', value: formatCompactCount(allLeagues.length) },
    { label: 'Divisions', value: formatCompactCount(divisionCount) },
  ];

  return (
    <>
      <section className="tt-home-personal-hero-wrap" aria-labelledby="tt-home-personal-hero-title">
        <Surface
          tone="raised"
          padding="none"
          className={`tt-home-personal-hero ${myPlayer ? 'tt-home-personal-hero--claimed' : 'tt-home-personal-hero--setup'}`}
        >
          {!myPlayer ? (
            <div className="tt-home-personal-hero__setup">
              <div className="tt-home-personal-hero__eyebrow">Personal dashboard</div>
              <div className="tt-home-personal-hero__setup-heading">
                <div>
                  <h2 id="tt-home-personal-hero-title">Make TT Players yours</h2>
                  <p>Claim your player and choose the leagues you care about. Home will adapt around your table tennis.</p>
                </div>
                <div className="tt-home-personal-hero__setup-count" aria-label={`${setupReadyCount} of 2 setup steps complete`}>
                  <strong>{setupReadyCount}</strong>
                  <span>/ 2</span>
                </div>
              </div>
              <div className="tt-home-personal-hero__progress" aria-hidden="true">
                <span className={`tt-home-personal-hero__progress-fill tt-home-personal-hero__progress-fill--${setupReadyCount}`} />
              </div>
              <div className="tt-home-personal-hero__setup-actions">
                <AppButton tone="primary" onClick={() => setClaimSheetOpen(true)}>
                  <i className="fa fa-id-badge" aria-hidden="true" />
                  Claim my player
                </AppButton>
                {!hasLeagueScope ? (
                  <AppButton tone="outline" onClick={onOpenLeagueSelector}>
                    <i className="fa fa-filter" aria-hidden="true" />
                    Choose leagues
                  </AppButton>
                ) : (
                  <span className="tt-home-personal-hero__ready-note">
                    <i className="fa fa-check-circle" aria-hidden="true" />
                    Leagues ready
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="tt-home-personal-hero__claimed">
              <div className="tt-home-personal-hero__identity">
                <DesignAvatar size="hero" text={initials(heroPlayerName)} />
                <div className="tt-home-personal-hero__identity-copy">
                  <span className="tt-home-personal-hero__eyebrow">Personal dashboard</span>
                  <h2 id="tt-home-personal-hero-title">{heroPlayerName}</h2>
                  <p>{primaryAffiliation
                    ? `${primaryAffiliation.team_name} · ${primaryAffiliation.league_name}`
                    : 'Your claimed player profile'}</p>
                </div>
                <Pill tone="accent">{formatMomentum(profileQuery.data?.form.momentum)}</Pill>
              </div>

              {profileQuery.isLoading || ratingQuery.isLoading ? (
                <SkeletonList rows={1} />
              ) : (
                <div className="tt-home-personal-hero__metrics" aria-label="Your TT overview">
                  <div className="tt-home-personal-hero__metric tt-home-personal-hero__metric--rating">
                    <span>Rating</span>
                    <strong>{playerRating ? Math.round(playerRating.rating).toLocaleString('en-GB') : '—'}</strong>
                    <small>{formatRatingMove(latestRatingMove)}</small>
                  </div>
                  <div className="tt-home-personal-hero__metric">
                    <span>Global rank</span>
                    <strong>{playerRating?.rank ? `#${playerRating.rank}` : '—'}</strong>
                    <small>{playerRating ? `${playerRating.rated_matches} rated matches` : 'Rating rank unavailable'}</small>
                  </div>
                  <div className="tt-home-personal-hero__metric">
                    <span>Record</span>
                    <strong>{profileQuery.data ? `${profileQuery.data.wins}–${profileQuery.data.losses}` : '—'}</strong>
                    <small>{profileQuery.data ? `${profileQuery.data.total} played` : 'Match record unavailable'}</small>
                  </div>
                </div>
              )}

              <div className="tt-home-personal-hero__footer">
                {!hasLeagueScope ? (
                  <div className="tt-home-personal-hero__league-prompt">
                    <span>
                      <i className="fa fa-filter" aria-hidden="true" />
                      Choose leagues to personalise fixtures, results and rankings.
                    </span>
                    <AppButton size="s" tone="outline" onClick={onOpenLeagueSelector}>Choose leagues</AppButton>
                  </div>
                ) : (
                  <span className="tt-home-personal-hero__ready-note">
                    <i className="fa fa-check-circle" aria-hidden="true" />
                    Personalised to your leagues
                  </span>
                )}
                <AppButton size="s" tone="primary" onClick={() => navigateInTab('home', 'my-tt')}>
                  Open My TT
                  <i className="fa fa-angle-right" aria-hidden="true" />
                </AppButton>
              </div>
            </div>
          )}
        </Surface>
      </section>

      {hasLeagueScope && sinceLastVisitChanges.length > 0 ? (
        <section className="tt-home-section" aria-labelledby="tt-home-since-last-visit-title">
          <SectionHeader
            title={<span id="tt-home-since-last-visit-title">Since your last visit</span>}
            note={previousVisitSnapshot ? `Last seen ${formatVisitDate(previousVisitSnapshot.seenAt)}` : undefined}
          />
          <List divider="hairline">
            {sinceLastVisitChanges.map((change) => {
              const meta = iconForVisitChange(change);
              return (
                <ListItem
                  key={change.id}
                  leading={<IconCircle iconClassName={meta.iconClassName} tone={meta.tone} />}
                  title={change.title}
                  subtitle={change.subtitle}
                  trailing={<Pill size="xs">{meta.label}</Pill>}
                  onClick={
                    change.kind === 'personal-rating'
                      ? () => navigateInTab('home', 'my-tt')
                      : change.kind === 'riser-change' && topRiser
                        ? () => navigateInTab('players', `player/${topRiser.player_id}`)
                        : () => onOpenTab('leagues')
                  }
                />
              );
            })}
          </List>
        </section>
      ) : null}

      {hasLeagueScope ? (
        <section className="tt-home-section" aria-labelledby="tt-home-highlights-title">
          <SectionHeader
            title={<span id="tt-home-highlights-title">Highlights</span>}
            note="Picked for relevance, not just recency"
            action={(
              <AppButton size="s" tone="ghost" onClick={() => onOpenTab('leagues')}>
                View leagues
                <i className="fa fa-angle-right" aria-hidden="true" />
              </AppButton>
            )}
          />

          {highlightsLoading ? (
            <SkeletonList rows={HOME_STORY_LIMIT} />
          ) : highlightStories.length > 0 ? (
            <List divider="hairline">
              {highlightStories.map((story) => (
                <ListItem
                  key={story.id}
                  leading={<IconCircle iconClassName={story.iconClassName} tone={story.tone} />}
                  title={story.title}
                  subtitle={story.subtitle}
                  trailing={story.kind === 'riser' || story.kind === 'personal-form' || story.kind === 'recent-rating-high'
                    ? <Pill tone="success">{story.trailing}</Pill>
                    : story.kind === 'personal-result'
                      ? <Pill tone="accent">{story.trailing}</Pill>
                      : <Pill>{story.trailing}</Pill>}
                  onClick={() => navigateInTab(story.targetTab, story.targetPath)}
                />
              ))}
            </List>
          ) : highlightsError ? (
            <ErrorState message={highlightsError} />
          ) : (
            <EmptyState
              iconClassName="fa fa-bolt"
              title="No highlights yet"
              message="Personal form, noteworthy results, rating movement and league leaders will appear here."
            />
          )}
        </section>
      ) : null}

      <section className="tt-home-section" aria-labelledby="tt-home-top-players-title">
        <SectionHeader
          title={<span id="tt-home-top-players-title">Top players</span>}
          note={isSelectedRatingsScope ? 'Leading your leagues' : 'Across TT Players'}
          action={(
            <AppButton
              size="s"
              tone="ghost"
              onClick={() => navigateInTab('players', `ratings?scope=${isSelectedRatingsScope ? 'selected' : 'site'}`)}
            >
              View all rankings
              <i className="fa fa-angle-right" aria-hidden="true" />
            </AppButton>
          )}
        />

        {hasLeagueScope ? (
          <FilterBar ariaLabel="Home player ranking scope">
            <SegmentedToggle
              ariaLabel="Choose Home player ranking scope"
              value={ratingsScope}
              onChange={setRatingsScope}
              options={[
                { value: 'site', label: 'Global' },
                { value: 'selected', label: 'Your leagues' },
              ]}
            />
          </FilterBar>
        ) : null}

        {rankingsLoading ? (
          <SkeletonList rows={HOME_RATINGS_LIMIT} />
        ) : rankingsError ? (
          <ErrorState
            message={rankingsError}
            onRetry={() => void (isSelectedRatingsScope ? topRatingsQuery.refetch() : topSiteRatingsQuery.refetch())}
          />
        ) : rankings.length > 0 ? (
          <List divider="hairline">
            {rankings.map((player, index) => (
              <ListItem
                key={player.player_id}
                leading={<RankBadge>{player.rank ?? index + 1}</RankBadge>}
                title={player.player_name}
                subtitle={`${player.rated_matches} rated matches · ${Math.round(player.win_rate * 100)}% win rate`}
                trailing={<Pill tone="accent">{Math.round(player.rating).toLocaleString('en-GB')}</Pill>}
                onClick={() => navigateInTab('players', `player/${player.player_id}`)}
              />
            ))}
          </List>
        ) : (
          <EmptyState
            iconClassName="fa fa-ranking-star"
            title="No established ratings yet"
            message={isSelectedRatingsScope
              ? 'Established players from your selected leagues will appear here.'
              : 'Established players will appear here as rating data becomes available.'}
          />
        )}
      </section>

      {!hasLeagueScope ? (
        <section className="tt-home-section" aria-labelledby="tt-home-pulse-title">
          <SectionHeader
            title={<span id="tt-home-pulse-title">TT Players pulse</span>}
            note="The network at a glance"
          />
          {playerCountQuery.isLoading ? (
            <SkeletonList rows={1} />
          ) : (
            <MetricGrid
              metrics={pulseMetrics}
              columns={4}
              density="compact"
              separators
              valueSize="prominent"
              labelStyle="eyebrow"
              ariaLabel="TT Players pulse"
            />
          )}
        </section>
      ) : null}

      {!hasLeagueScope ? (
        <section className="tt-home-section" aria-labelledby="tt-home-explore-title">
          <SectionHeader
            title={<span id="tt-home-explore-title">Explore</span>}
            note="Jump into TT Players"
          />
          <nav className="tt-home-nav" aria-label="Explore TT Players">
            {navItems.map((tabId) => {
              const meta = TAB_METADATA[tabId];
              const description =
                tabId === 'players' ? 'Search players, profiles and ratings' :
                tabId === 'leagues' ? `${allLeagues.length} available leagues` :
                meta.description;

              return (
                <button
                  key={tabId}
                  type="button"
                  className="tt-home-nav-row"
                  onClick={() => onOpenTab(tabId)}
                >
                  <div className="tt-home-nav-icon">
                    <i className={meta.icon} aria-hidden="true" />
                  </div>
                  <div className="tt-home-nav-copy">
                    <span className="tt-home-nav-title">{meta.label}</span>
                    <span className="tt-home-nav-desc">{description}</span>
                  </div>
                  <i className="fa fa-angle-right tt-home-nav-chevron" aria-hidden="true" />
                </button>
              );
            })}
          </nav>
        </section>
      ) : null}

      <PlayerSearchSheet
        isOpen={claimSheetOpen}
        onClose={() => setClaimSheetOpen(false)}
        title="Claim your player"
        eyebrow="Make Home personal"
        resultHint="Tap to claim as you"
        onSelect={(player) => {
          setMyPlayer({ id: player.id, name: player.name });
          setClaimSheetOpen(false);
        }}
      />
    </>
  );
}
