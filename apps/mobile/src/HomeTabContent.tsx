import { useEffect, useState } from 'react';
import type { AppTabId } from './navigation/tab-navigation';
import { useMyPlayer } from './hooks/useMyPlayer';
import { useTournamentList } from './hooks/useTournamentList';
import { useTabNavigation } from './navigation/tab-navigation';
import { type LeagueWithDivisions, TAB_METADATA, getQueryError } from './player-shared';
import {
  useLeagueCollectionDashboardQuery,
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
  AppButton,
  DesignAvatar,
  EmptyState,
  ErrorState,
  FilterBar,
  IconCircle,
  List,
  ListItem,
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

const HOME_RATINGS_LIMIT = 4;

function formatDate(value: string | null): string {
  if (!value) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(`${value}T12:00:00`));
}

function formatFixtureTeams(home: string | null, away: string | null): string {
  return `${home ?? 'Home'} vs ${away ?? 'Away'}`;
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
  const upcomingTournaments = useTournamentList({
    status: 'upcoming',
    search: '',
    pageSize: 1,
  });

  const personalTeamNames = new Set(
    (profileQuery.data?.current_season_affiliations ?? [])
      .filter((affiliation) => selectedLeagueIds.includes(affiliation.league_id))
      .map((affiliation) => affiliation.team_name),
  );
  const upcomingFixtures = [...(dashboard?.upcoming_fixtures ?? [])]
    .sort((left, right) => (left.date_played ?? '').localeCompare(right.date_played ?? ''));
  const personalNextFixture = upcomingFixtures.find((fixture) =>
    Boolean(
      (fixture.home_team_name && personalTeamNames.has(fixture.home_team_name))
      || (fixture.away_team_name && personalTeamNames.has(fixture.away_team_name)),
    ));
  const nextFixture = personalNextFixture ?? upcomingFixtures[0] ?? null;
  const nextFixtureIsPersonal = Boolean(personalNextFixture && nextFixture?.fixture_id === personalNextFixture.fixture_id);
  const nextTournament = upcomingTournaments.items[0] ?? null;
  const nextTournamentVenue = nextTournament
    ? nextTournament.venue_name ?? nextTournament.venue_town ?? nextTournament.venue_postcode
    : null;

  const topRiser = risersQuery.data?.data[0] ?? null;
  const latestResult = dashboard?.recent_results[0] ?? null;
  const topTeam = dashboard?.top_teams[0] ?? null;
  const dashboardError = getQueryError(dashboardQuery.error);
  const nextUpError = upcomingTournaments.error ?? (hasLeagueScope ? dashboardError : null);
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
                      <i className="fa fa-sparkles" aria-hidden="true" />
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

      <section className="tt-home-section" aria-labelledby="tt-home-next-up-title">
        <SectionHeader
          title={<span id="tt-home-next-up-title">Next up</span>}
          note={nextFixtureIsPersonal
            ? 'Your team and tournaments'
            : hasLeagueScope
              ? 'Fixtures and tournaments'
              : 'Upcoming tournaments'}
        />

        {(hasLeagueScope && dashboardQuery.isLoading) || upcomingTournaments.isLoadingInitial ? (
          <SkeletonList rows={hasLeagueScope ? 2 : 1} />
        ) : nextFixture || nextTournament ? (
          <List divider="hairline" size="lg">
            {nextFixture ? (
              <ListItem
                leading={<IconCircle iconClassName="fa fa-calendar-alt" tone={nextFixtureIsPersonal ? 'success' : 'accent'} />}
                title={formatFixtureTeams(nextFixture.home_team_name, nextFixture.away_team_name)}
                subtitle={`${formatDate(nextFixture.date_played)} · ${nextFixture.division_name} · ${nextFixture.league_name}`}
                trailing={nextFixtureIsPersonal ? <Pill size="xs" tone="success">Your team</Pill> : undefined}
                onClick={() => navigateInTab('leagues', `fixture/${nextFixture.fixture_id}`)}
              />
            ) : null}

            {nextTournament ? (
              <ListItem
                leading={<IconCircle iconClassName="fa fa-trophy" tone="warning" />}
                title={nextTournament.name}
                subtitle={`${formatDate(nextTournament.start_date ?? nextTournament.event_date)} · ${nextTournament.category ?? 'Tournament'}${nextTournamentVenue ? ` · ${nextTournamentVenue}` : ''}`}
                trailing={nextTournament.status === 'entries_open'
                  ? <Pill size="xs" tone="success">Entries open</Pill>
                  : undefined}
                onClick={() => navigateInTab('events', `event/${nextTournament.id}`)}
              />
            ) : null}
          </List>
        ) : nextUpError ? (
          <ErrorState message={nextUpError} />
        ) : (
          <EmptyState
            iconClassName="fa fa-calendar"
            title="Nothing scheduled"
            message={hasLeagueScope
              ? 'The next fixture or tournament will appear here.'
              : 'Upcoming tournaments will appear here. Choose leagues to add relevant fixtures.'}
          />
        )}
      </section>

      {hasLeagueScope ? (
        <section className="tt-home-section" aria-labelledby="tt-home-highlights-title">
          <SectionHeader
            title={<span id="tt-home-highlights-title">Highlights</span>}
            note="Worth a quick look"
            action={(
              <AppButton size="s" tone="ghost" onClick={() => onOpenTab('leagues')}>
                View leagues
                <i className="fa fa-angle-right" aria-hidden="true" />
              </AppButton>
            )}
          />

          {dashboardQuery.isLoading && risersQuery.isLoading ? (
            <SkeletonList rows={2} />
          ) : topRiser || latestResult || topTeam ? (
            <List divider="hairline">
              {topRiser ? (
                <ListItem
                  leading={<IconCircle iconClassName="fa fa-chart-line" tone="success" />}
                  title={`${topRiser.player_name} is moving up`}
                  subtitle={`Biggest 6-week riser in your leagues · #${topRiser.overall_rank} overall`}
                  trailing={<Pill tone="success">+{Math.round(topRiser.change)}</Pill>}
                  onClick={() => navigateInTab('players', `player/${topRiser.player_id}`)}
                />
              ) : null}

              {latestResult ? (
                <ListItem
                  leading={<IconCircle iconClassName="fa fa-table-tennis" tone="neutral" />}
                  title={formatFixtureTeams(latestResult.home_team_name, latestResult.away_team_name)}
                  subtitle={`Latest result · ${latestResult.division_name} · ${formatDate(latestResult.date_played)}`}
                  trailing={<Pill>{latestResult.home_score}–{latestResult.away_score}</Pill>}
                  onClick={() => navigateInTab('leagues', `fixture/${latestResult.fixture_id}`)}
                />
              ) : null}

              {!latestResult && topTeam ? (
                <ListItem
                  leading={<IconCircle iconClassName="fa fa-shield-alt" tone="neutral" />}
                  title={topTeam.team_name}
                  subtitle={`Leading team · ${topTeam.division_name} · ${topTeam.won}W ${topTeam.drawn}D ${topTeam.lost}L`}
                  trailing={<Pill>{Math.round(topTeam.win_rate)}%</Pill>}
                  onClick={() => navigateInTab('leagues', `team/${topTeam.team_id}`)}
                />
              ) : null}
            </List>
          ) : (
            <EmptyState
              iconClassName="fa fa-bolt"
              title="No highlights yet"
              message="Notable rating movement and recent league activity will appear here."
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
                subtitle={`${player.rated_matches} rated matches · ${Math.round(player.win_rate)}% win rate`}
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