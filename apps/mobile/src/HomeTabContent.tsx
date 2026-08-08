import { useState } from 'react';
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
  usePlayerRatingQuery,
  useTopRatingsQuery,
  useTopSiteRatingsQuery,
} from './rating-queries';
import {
  AppButton,
  Avatar,
  EmptyState,
  ErrorState,
  IconCircle,
  List,
  ListItem,
  Pill,
  SectionHeader,
} from './ui/appkit';
import { SkeletonList } from './components/Skeleton';
import { PlayerSearchSheet } from './PlayerSearchSheet';

interface HomeTabContentProps {
  allLeagues: LeagueWithDivisions[];
  hasCompletedLeagueOnboarding: boolean;
  selectedLeagueIds: string[];
  onOpenLeagueSelector: () => void;
  onOpenTab: (tabId: DashboardTabId) => void;
}

type DashboardTabId = Exclude<AppTabId, 'home'>;

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
  const isAllLeagueScope = hasLeagueScope
    && allLeagues.length > 0
    && selectedLeagueIds.length === allLeagues.length;
  const scopedLeagueIds = isAllLeagueScope ? [] : selectedLeagueIds;

  const dashboardQuery = useLeagueCollectionDashboardQuery(scopedLeagueIds, hasLeagueScope);
  const dashboard = dashboardQuery.data ?? null;
  const profileQuery = usePlayerProfileOverviewQuery(myPlayer?.id ?? '', Boolean(myPlayer));
  const ratingQuery = usePlayerRatingQuery(myPlayer?.id ?? '', Boolean(myPlayer));
  const topRatingsQuery = useTopRatingsQuery(selectedLeagueIds, 1, hasLeagueScope);
  const risersQuery = useLeagueRisersQuery(selectedLeagueIds, 1, 42, hasLeagueScope);
  const topSiteRatingsQuery = useTopSiteRatingsQuery(2, !hasLeagueScope);
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

  const topRated = topRatingsQuery.data?.data[0] ?? null;
  const topRiser = risersQuery.data?.data[0] ?? null;
  const siteTopRatings = topSiteRatingsQuery.data?.data.slice(0, 2) ?? [];
  const latestResult = dashboard?.recent_results[0] ?? null;
  const topTeam = dashboard?.top_teams[0] ?? null;
  const dashboardError = getQueryError(dashboardQuery.error);
  const nextUpError = upcomingTournaments.error ?? (hasLeagueScope ? dashboardError : null);
  const setupReadyCount = Number(Boolean(myPlayer)) + Number(hasLeagueScope);
  const navItems: DashboardTabId[] = ['players', 'leagues', 'h2h', 'events'];

  return (
    <>
      {myPlayer ? (
        <section className="tt-home-section" aria-labelledby="tt-home-your-tt-title">
          <SectionHeader
            title={<span id="tt-home-your-tt-title">Your TT</span>}
            note="Your quick snapshot"
            action={(
              <AppButton size="s" tone="ghost" onClick={() => navigateInTab('home', 'my-tt')}>
                Open My TT
                <i className="fa fa-angle-right" aria-hidden="true" />
              </AppButton>
            )}
          />

          {profileQuery.isLoading ? (
            <SkeletonList rows={1} />
          ) : (
            <List divider="none" size="lg">
              <ListItem
                leading={<Avatar text={initials(profileQuery.data?.player_name ?? myPlayer.name)} />}
                title={profileQuery.data?.player_name ?? myPlayer.name}
                subtitle={profileQuery.data
                  ? `${profileQuery.data.wins}W · ${profileQuery.data.losses}L · ${profileQuery.data.total} played${ratingQuery.data?.data ? ` · Rating ${Math.round(ratingQuery.data.data.rating).toLocaleString('en-GB')}` : ''}`
                  : 'Your claimed player profile'}
                trailing={<Pill tone="accent">{formatMomentum(profileQuery.data?.form.momentum)}</Pill>}
                onClick={() => navigateInTab('home', 'my-tt')}
              />
            </List>
          )}
        </section>
      ) : null}

      {!myPlayer || !hasLeagueScope ? (
        <section className="tt-home-section" aria-labelledby="tt-home-setup-title">
          <SectionHeader
            title={<span id="tt-home-setup-title">Make Home yours</span>}
            note={`${setupReadyCount} of 2 ready`}
          />
          <List divider="hairline" size="lg">
            {!myPlayer ? (
              <ListItem
                leading={<IconCircle iconClassName="fa fa-id-badge" tone="accent" />}
                title="Claim my player"
                subtitle="Find your name to add your form, rating and team fixtures."
                trailing={<Pill size="xs" tone="accent">Start</Pill>}
                onClick={() => setClaimSheetOpen(true)}
              />
            ) : null}
            {!hasLeagueScope ? (
              <ListItem
                leading={<IconCircle iconClassName="fa fa-filter" tone="neutral" />}
                title="Choose leagues to follow"
                subtitle="Add the leagues you care about so Home can prioritise their fixtures and results."
                trailing={<Pill size="xs">Choose</Pill>}
                onClick={onOpenLeagueSelector}
              />
            ) : null}
          </List>
        </section>
      ) : null}

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

          {dashboardQuery.isLoading && topRatingsQuery.isLoading && risersQuery.isLoading ? (
            <SkeletonList rows={3} />
          ) : topRiser || topRated || latestResult || topTeam ? (
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

              {topRated ? (
                <ListItem
                  leading={<IconCircle iconClassName="fa fa-star" tone="accent" />}
                  title={`Top rated · ${topRated.player_name}`}
                  subtitle={`#${topRated.overall_rank} overall · ${topRated.rated_matches} rated matches`}
                  trailing={<Pill tone="accent">{Math.round(topRated.rating).toLocaleString('en-GB')}</Pill>}
                  onClick={() => navigateInTab('players', `player/${topRated.player_id}`)}
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
      ) : (
        <>
          <section className="tt-home-section" aria-labelledby="tt-home-discover-title">
            <SectionHeader
              title={<span id="tt-home-discover-title">Discover</span>}
              note="A little to explore right now"
              action={(
                <AppButton size="s" tone="ghost" onClick={() => onOpenTab('players')}>
                  Browse players
                  <i className="fa fa-angle-right" aria-hidden="true" />
                </AppButton>
              )}
            />

            {topSiteRatingsQuery.isLoading ? (
              <SkeletonList rows={2} />
            ) : siteTopRatings.length > 0 ? (
              <List divider="hairline">
                {siteTopRatings.map((player, index) => (
                  <ListItem
                    key={player.player_id}
                    leading={<IconCircle iconClassName={index === 0 ? 'fa fa-star' : 'fa fa-chart-line'} tone={index === 0 ? 'accent' : 'neutral'} />}
                    title={`${player.rank != null ? `#${player.rank}` : `Top ${index + 1}`} overall · ${player.player_name}`}
                    subtitle={`${player.rated_matches} rated matches · ${Math.round(player.win_rate)}% win rate`}
                    trailing={<Pill tone={index === 0 ? 'accent' : 'neutral'}>{Math.round(player.rating).toLocaleString('en-GB')}</Pill>}
                    onClick={() => navigateInTab('players', `player/${player.player_id}`)}
                  />
                ))}
              </List>
            ) : (
              <EmptyState
                iconClassName="fa fa-star"
                title="Ratings are getting ready"
                message="Top players will appear here as rating data becomes available."
              />
            )}
          </section>

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
        </>
      )}

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