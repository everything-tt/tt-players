import type { AppTabId } from './navigation/tab-navigation';
import { useMyPlayer } from './hooks/useMyPlayer';
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
  const { player: myPlayer } = useMyPlayer();
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

  const topRated = topRatingsQuery.data?.data[0] ?? null;
  const topRiser = risersQuery.data?.data[0] ?? null;
  const latestResult = dashboard?.recent_results[0] ?? null;
  const topTeam = dashboard?.top_teams[0] ?? null;
  const dashboardError = getQueryError(dashboardQuery.error);
  const scopeLabel = isAllLeagueScope
    ? `All ${allLeagues.length} leagues`
    : `${selectedLeagueIds.length} selected league${selectedLeagueIds.length === 1 ? '' : 's'}`;
  const navItems: DashboardTabId[] = ['players', 'leagues', 'h2h', 'events'];

  return (
    <>
      <section className="tt-home-section" aria-labelledby="tt-home-your-tt-title">
        <SectionHeader
          title={<span id="tt-home-your-tt-title">Your TT</span>}
          note={myPlayer ? 'Your quick snapshot' : 'Make Home personal'}
          action={myPlayer ? (
            <AppButton size="s" tone="ghost" onClick={() => navigateInTab('home', 'my-tt')}>
              Open My TT
              <i className="fa fa-angle-right" aria-hidden="true" />
            </AppButton>
          ) : undefined}
        />

        {!myPlayer ? (
          <EmptyState
            iconClassName="fa fa-id-badge"
            title="Make TT Players yours"
            message="Claim your player to put your form, rating and next team fixture on Home."
            action={{ label: 'Find my player', onClick: () => onOpenTab('players') }}
          />
        ) : profileQuery.isLoading ? (
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

      {!hasLeagueScope ? (
        <>
          <section className="tt-home-section">
            <div className="tt-home-onboarding">
              <div className="tt-home-onboarding-icon">
                <i className="fa fa-filter" aria-hidden="true" />
              </div>
              <h2 className="tt-home-onboarding-title">Choose leagues to follow</h2>
              <p className="tt-home-onboarding-copy">
                Home will then surface only the next fixture and a few useful highlights. Full tables, results and rankings stay in Leagues.
              </p>
              <AppButton size="m" rounded="m" full onClick={onOpenLeagueSelector}>
                Select leagues
              </AppButton>
            </div>
          </section>

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
        </>
      ) : (
        <>
          <section className="tt-home-section" aria-labelledby="tt-home-next-up-title">
            <SectionHeader
              title={<span id="tt-home-next-up-title">Next up</span>}
              note={nextFixtureIsPersonal ? 'Your team' : scopeLabel}
              action={(
                <AppButton size="s" tone="ghost" onClick={() => onOpenTab('leagues')}>
                  Fixtures
                  <i className="fa fa-angle-right" aria-hidden="true" />
                </AppButton>
              )}
            />

            {dashboardQuery.isLoading ? (
              <SkeletonList rows={1} />
            ) : dashboardError ? (
              <ErrorState message={dashboardError} />
            ) : nextFixture ? (
              <List divider="none" size="lg">
                <ListItem
                  leading={<IconCircle iconClassName="fa fa-calendar-alt" tone={nextFixtureIsPersonal ? 'success' : 'accent'} />}
                  title={formatFixtureTeams(nextFixture.home_team_name, nextFixture.away_team_name)}
                  subtitle={`${formatDate(nextFixture.date_played)} · ${nextFixture.division_name} · ${nextFixture.league_name}`}
                  trailing={nextFixtureIsPersonal ? <Pill size="xs" tone="success">Your team</Pill> : undefined}
                  onClick={() => navigateInTab('leagues', `fixture/${nextFixture.fixture_id}`)}
                />
              </List>
            ) : (
              <EmptyState
                iconClassName="fa fa-calendar"
                title="Nothing scheduled"
                message="The next fixture from your selected leagues will appear here."
              />
            )}
          </section>

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
        </>
      )}
    </>
  );
}
