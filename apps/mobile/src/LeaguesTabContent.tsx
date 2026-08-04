import { useMemo, useState } from 'react';
import {
  formatNumber,
  getInitials,
  getQueryError,
  type LeagueCollectionDashboard,
  type LeagueWithDivisions,
} from './player-shared';
import { SkeletonList } from './components/Skeleton';
import {
  useLeagueCollectionDashboardQuery,
  useLeagueOverviewQuery,
  useLeadersQuery,
  useLeaguesQuery,
  usePlayerProfileOverviewQuery,
} from './queries';
import { useTabNavigation } from './navigation/tab-navigation';
import {
  AppButton,
  DesignAvatar,
  DesignList,
  EmptyState,
  EntityHero,
  ErrorState,
  FilterBar,
  IconCircle,
  ListItem,
  MatchRecordRow,
  MetricGrid,
  OutcomeBadge,
  PageSection,
  Pill,
  RankBadge,
  SegmentedToggle,
} from './ui/appkit';
import { useFavouriteTeams } from './hooks/useFavouriteTeams';
import { useMyPlayer } from './hooks/useMyPlayer';
import './leagues-dashboard.css';

interface LeaguesTabContentProps {
  selectedLeagueIds: string[];
  onOpenLeagueSelector: () => void;
}

type PerformanceMode = 'players' | 'teams';
type PlayerMode = 'top' | 'form' | 'improving';
type UpcomingFixture = LeagueCollectionDashboard['upcoming_fixtures'][number];

type DateParts = {
  weekday: string;
  day: string;
  month: string;
};

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: string | null): string {
  const date = parseDate(value);
  if (!date) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date);
}

function formatDateParts(value: string | null): DateParts {
  const date = parseDate(value);
  if (!date) return { weekday: 'TBD', day: '—', month: '' };
  return {
    weekday: new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(date).toUpperCase(),
    day: new Intl.DateTimeFormat('en-GB', { day: 'numeric' }).format(date),
    month: new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(date).toUpperCase(),
  };
}

function fixtureHasTeam(fixture: UpcomingFixture, teamNames: Set<string>): boolean {
  return Boolean(
    (fixture.home_team_name && teamNames.has(fixture.home_team_name))
    || (fixture.away_team_name && teamNames.has(fixture.away_team_name)),
  );
}

function fixtureSide(fixture: UpcomingFixture, teamNames: Set<string>): 'Home' | 'Away' | null {
  if (fixture.home_team_name && teamNames.has(fixture.home_team_name)) return 'Home';
  if (fixture.away_team_name && teamNames.has(fixture.away_team_name)) return 'Away';
  return null;
}

function formatFixtureTeams(home: string | null, away: string | null): string {
  return `${home ?? 'Home'} vs ${away ?? 'Away'}`;
}

function SectionAction({
  expanded,
  total,
  collapsedCount,
  onClick,
}: {
  expanded: boolean;
  total: number;
  collapsedCount: number;
  onClick: () => void;
}) {
  if (total <= collapsedCount) return null;
  return (
    <AppButton size="s" tone="ghost" onClick={onClick}>
      {expanded ? 'Show less' : 'View all'}
    </AppButton>
  );
}

function UpcomingDate({ value }: { value: string | null }) {
  const parts = formatDateParts(value);
  return (
    <span className="tt-leagues-date" aria-label={formatDate(value)}>
      <span className="tt-leagues-date__weekday">{parts.weekday}</span>
      <strong className="tt-leagues-date__day">{parts.day}</strong>
      <span className="tt-leagues-date__month">{parts.month}</span>
    </span>
  );
}

function FixtureMetadata({
  division,
  side,
  personal,
  favourite,
}: {
  division: string;
  side: 'Home' | 'Away' | null;
  personal: boolean;
  favourite: boolean;
}) {
  return (
    <span className="tt-leagues-fixture-meta">
      <span>{division}</span>
      {side ? <span>{side}</span> : null}
      {personal ? <Pill size="xs" tone="success">Your team</Pill> : null}
      {!personal && favourite ? <Pill size="xs" tone="neutral">Favourite</Pill> : null}
    </span>
  );
}

function LeagueTrailing({
  personal,
  upcoming,
}: {
  personal: boolean;
  upcoming: number;
}) {
  return (
    <span className="tt-leagues-league-trailing">
      {personal ? <Pill size="xs" tone="success">You play here</Pill> : null}
      <span>{upcoming} upcoming</span>
      <i className="fa fa-angle-right" aria-hidden="true" />
    </span>
  );
}

function PulseTitle({ name, personal, rank }: { name: string; personal: boolean; rank: number }) {
  if (!personal) return name;
  return (
    <span className="tt-leagues-you-title">
      <strong>You</strong>
      <span>· #{rank}</span>
    </span>
  );
}

function PulseValue({
  mode,
  winRate,
  score,
}: {
  mode: PlayerMode;
  winRate: number;
  score: number | null;
}) {
  if (mode === 'improving') {
    const rounded = Math.round(score ?? 0);
    return <Pill tone={rounded >= 0 ? 'success' : 'neutral'}>{rounded >= 0 ? '+' : ''}{rounded} pts</Pill>;
  }
  return <Pill tone="accent">{Math.round(winRate)}%</Pill>;
}

export function LeaguesTabContent({
  selectedLeagueIds,
  onOpenLeagueSelector,
}: LeaguesTabContentProps) {
  const { player: myPlayer } = useMyPlayer();
  const { navigateInTab } = useTabNavigation();
  const { teams: favouriteTeams } = useFavouriteTeams();
  const leaguesQuery = useLeaguesQuery();
  const allLeagues: LeagueWithDivisions[] = leaguesQuery.data?.data ?? [];

  const [performanceMode, setPerformanceMode] = useState<PerformanceMode>('players');
  const [playerMode, setPlayerMode] = useState<PlayerMode>('top');
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [showAllPulse, setShowAllPulse] = useState(false);
  const [showAllLeagues, setShowAllLeagues] = useState(false);
  const [showAllResults, setShowAllResults] = useState(false);

  const visibleLeagues = useMemo(() => {
    if (selectedLeagueIds.length === 0) return [];
    const selected = new Set(selectedLeagueIds);
    return allLeagues.filter((league) => selected.has(league.id));
  }, [allLeagues, selectedLeagueIds]);
  const leagueIds = useMemo(() => visibleLeagues.map((league) => league.id), [visibleLeagues]);

  const dashboardQuery = useLeagueCollectionDashboardQuery(leagueIds, leagueIds.length > 0);
  const overviewQuery = useLeagueOverviewQuery(leagueIds, leagueIds.length > 0);
  const profileQuery = usePlayerProfileOverviewQuery(myPlayer?.id ?? '', Boolean(myPlayer) && leagueIds.length > 0);
  const leadersQuery = useLeadersQuery({
    mode: playerMode === 'form' ? 'form' : playerMode === 'improving' ? 'improving' : 'combined',
    leagueIds,
    allLeaguesCount: allLeagues.length,
    limit: 8,
    minPlayed: playerMode === 'form' ? 5 : 3,
    enabled: leagueIds.length > 0 && performanceMode === 'players',
  });
  const personalSeasonQuery = useLeadersQuery({
    mode: 'combined',
    leagueIds,
    allLeaguesCount: allLeagues.length,
    limit: 100,
    minPlayed: 1,
    enabled: leagueIds.length > 0 && Boolean(myPlayer),
  });

  const dashboard = dashboardQuery.data ?? null;
  const leagues = overviewQuery.data?.data ?? [];
  const players = leadersQuery.data?.data ?? [];
  const error = getQueryError(dashboardQuery.error) || getQueryError(overviewQuery.error);

  const personalAffiliations = useMemo(() => {
    const visibleLeagueIds = new Set(leagueIds);
    return (profileQuery.data?.current_season_affiliations ?? [])
      .filter((affiliation) => visibleLeagueIds.has(affiliation.league_id));
  }, [leagueIds, profileQuery.data?.current_season_affiliations]);
  const personalLeagueIds = useMemo(
    () => new Set(personalAffiliations.map((affiliation) => affiliation.league_id)),
    [personalAffiliations],
  );
  const personalTeamNames = useMemo(
    () => new Set(personalAffiliations.map((affiliation) => affiliation.team_name)),
    [personalAffiliations],
  );
  const favouriteTeamNames = useMemo(
    () => new Set(favouriteTeams.map((team) => team.name)),
    [favouriteTeams],
  );

  const personalRecord = useMemo(() => {
    if (!myPlayer) return null;
    const candidateIds = new Set(
      [myPlayer.id, profileQuery.data?.player_id].filter((id): id is string => Boolean(id)),
    );
    return (personalSeasonQuery.data?.data ?? [])
      .find((player) => candidateIds.has(player.player_id)) ?? null;
  }, [myPlayer, personalSeasonQuery.data?.data, profileQuery.data?.player_id]);

  const prioritizedUpcoming = useMemo(() => {
    return [...(dashboard?.upcoming_fixtures ?? [])].sort((left, right) => {
      const leftPriority = fixtureHasTeam(left, personalTeamNames)
        ? 0
        : fixtureHasTeam(left, favouriteTeamNames)
          ? 1
          : 2;
      const rightPriority = fixtureHasTeam(right, personalTeamNames)
        ? 0
        : fixtureHasTeam(right, favouriteTeamNames)
          ? 1
          : 2;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return (left.date_played ?? '').localeCompare(right.date_played ?? '');
    });
  }, [dashboard?.upcoming_fixtures, favouriteTeamNames, personalTeamNames]);

  const personalNextFixture = prioritizedUpcoming
    .find((fixture) => fixtureHasTeam(fixture, personalTeamNames)) ?? null;

  const orderedLeagues = useMemo(() => {
    return [...leagues].sort((left, right) => {
      const personalDifference = Number(personalLeagueIds.has(right.id)) - Number(personalLeagueIds.has(left.id));
      if (personalDifference !== 0) return personalDifference;
      if (left.upcoming_fixtures !== right.upcoming_fixtures) {
        return right.upcoming_fixtures - left.upcoming_fixtures;
      }
      return left.name.localeCompare(right.name);
    });
  }, [leagues, personalLeagueIds]);

  const pulsePlayers = useMemo(() => {
    const visible = players.slice(0, showAllPulse ? 8 : 4);
    if (playerMode !== 'top' || !personalRecord) return visible;
    if (visible.some((player) => player.player_id === personalRecord.player_id)) return visible;
    if (showAllPulse) return [...visible.slice(0, 7), personalRecord];
    return [...visible.slice(0, 3), personalRecord];
  }, [personalRecord, playerMode, players, showAllPulse]);

  const primaryAffiliation = personalAffiliations[0] ?? null;
  const hasAnyCurrentAffiliation = (profileQuery.data?.current_season_affiliations.length ?? 0) > 0;
  const personalPlayed = personalRecord?.played ?? profileQuery.data?.total ?? 0;
  const personalWins = personalRecord?.wins ?? profileQuery.data?.wins ?? 0;
  const personalLosses = personalRecord?.losses ?? profileQuery.data?.losses ?? 0;
  const personalWinRate = personalRecord?.win_rate
    ?? (personalPlayed > 0 ? (personalWins / personalPlayed) * 100 : 0);
  const recentForm = profileQuery.data?.form.recent_results.slice(0, 6) ?? [];

  const upcomingRows = prioritizedUpcoming.slice(0, showAllUpcoming ? prioritizedUpcoming.length : 3);
  const leagueRows = orderedLeagues.slice(0, showAllLeagues ? orderedLeagues.length : 3);
  const recentRows = (dashboard?.recent_results ?? []).slice(0, showAllResults ? 8 : 3);
  const teamRows = (dashboard?.top_teams ?? []).slice(0, showAllPulse ? 8 : 4);

  return (
    <div className="tt-leagues-dashboard">
      {visibleLeagues.length > 0 ? (
        <EntityHero
          className="tt-leagues-dashboard-hero"
          eyebrow="Active season"
          title="Your leagues"
          subtitle={`${visibleLeagues.length} selected league${visibleLeagues.length === 1 ? '' : 's'} · Player and team performance`}
          actions={(
            <AppButton size="s" tone="outline" onClick={onOpenLeagueSelector}>
              <i className="fa fa-cog" aria-hidden="true" />
              Manage leagues
            </AppButton>
          )}
          highlights={dashboard ? (
            <MetricGrid
              density="compact"
              columns={4}
              metrics={[
                { label: 'Divisions', value: formatNumber(dashboard.totals.divisions) },
                { label: 'Teams', value: formatNumber(dashboard.totals.teams) },
                { label: 'Played', value: formatNumber(dashboard.totals.matches_played) },
                { label: 'Upcoming', value: formatNumber(dashboard.totals.upcoming_fixtures) },
              ]}
            />
          ) : null}
        />
      ) : null}

      {selectedLeagueIds.length === 0 ? (
        <PageSection surface="flat" density="compact" className="tt-leagues-dashboard-empty">
          <EmptyState
            iconClassName="fa fa-table-tennis"
            title="Select your leagues"
            message="Choose the leagues you follow to see your season, fixtures, rankings and results here."
            action={{ label: 'Select leagues', onClick: onOpenLeagueSelector }}
          />
        </PageSection>
      ) : leaguesQuery.isLoading || dashboardQuery.isLoading ? (
        <PageSection surface="flat" density="compact" className="tt-leagues-dashboard-section">
          <SkeletonList rows={6} />
        </PageSection>
      ) : visibleLeagues.length === 0 ? (
        <PageSection surface="flat" density="compact" className="tt-leagues-dashboard-empty">
          <EmptyState
            iconClassName="fa fa-table-tennis"
            title="Selected leagues unavailable"
            message="Review your league selection to continue."
            action={{ label: 'Manage leagues', onClick: onOpenLeagueSelector }}
          />
        </PageSection>
      ) : error ? (
        <PageSection surface="flat" density="compact" className="tt-leagues-dashboard-section">
          <ErrorState message={error} />
        </PageSection>
      ) : (
        <>
          {myPlayer ? (
            <PageSection
              surface="flat"
              density="compact"
              title="Your season"
              meta={<Pill size="xs" tone="success">You</Pill>}
              action={(
                <AppButton size="s" tone="ghost" onClick={() => navigateInTab('players', `player/${myPlayer.id}`)}>
                  View your profile
                  <i className="fa fa-angle-right" aria-hidden="true" />
                </AppButton>
              )}
              className="tt-leagues-dashboard-section tt-leagues-season"
            >
              {profileQuery.isLoading || personalSeasonQuery.isLoading ? (
                <SkeletonList rows={2} />
              ) : profileQuery.error ? (
                <ErrorState message={getQueryError(profileQuery.error) ?? 'Your player summary is unavailable.'} />
              ) : personalAffiliations.length === 0 ? (
                <DesignList density="compact" divider="none" paginate={false}>
                  <ListItem
                    leading={<DesignAvatar size="standard" text={getInitials(myPlayer.name)} />}
                    title={hasAnyCurrentAffiliation ? 'Your league is not selected' : myPlayer.name}
                    subtitle={hasAnyCurrentAffiliation
                      ? 'Add your current league to show your team, record and upcoming fixtures here.'
                      : 'Your active-season summary will appear once a current team is found.'}
                    trailing={hasAnyCurrentAffiliation ? <Pill size="xs">Manage</Pill> : <Pill size="xs">Claimed</Pill>}
                    onClick={hasAnyCurrentAffiliation ? onOpenLeagueSelector : undefined}
                  />
                </DesignList>
              ) : (
                <>
                  <div className="tt-leagues-season__profile">
                    <DesignAvatar
                      size="hero"
                      text={getInitials(profileQuery.data?.player_name ?? myPlayer.name)}
                    />
                    <div className="tt-leagues-season__identity">
                      <strong>{profileQuery.data?.player_name ?? myPlayer.name}</strong>
                      <span>{primaryAffiliation?.team_name} · {primaryAffiliation?.competition_name}</span>
                      <span className="tt-leagues-season__team-tag">
                        <i className="fa fa-users" aria-hidden="true" />
                        Your team
                      </span>
                    </div>
                  </div>

                  <div className="tt-leagues-season__summary">
                    <MetricGrid
                      density="compact"
                      columns={4}
                      ariaLabel="Your selected-league season record"
                      metrics={[
                        { label: 'Played', value: personalPlayed },
                        { label: 'Wins', value: personalWins },
                        { label: 'Losses', value: personalLosses },
                        { label: 'Win rate', value: `${Math.round(personalWinRate)}%` },
                      ]}
                    />
                    <div className="tt-leagues-season__form">
                      <span>Recent form (last {recentForm.length || 0})</span>
                      {recentForm.length > 0 ? (
                        <div className="tt-leagues-form-strip" aria-label="Recent form">
                          {recentForm.map((result, index) => (
                            <OutcomeBadge key={`${result}-${index}`} result={result} variant="badge" />
                          ))}
                        </div>
                      ) : (
                        <span className="tt-leagues-muted">No recent singles</span>
                      )}
                    </div>
                  </div>

                  {personalNextFixture ? (
                    <div className="tt-leagues-season__next">
                      <DesignList density="compact" divider="none" paginate={false}>
                        <ListItem
                          leading={<IconCircle iconClassName="fa fa-calendar-alt" tone="success" />}
                          title={formatFixtureTeams(personalNextFixture.home_team_name, personalNextFixture.away_team_name)}
                          subtitle={`${formatDate(personalNextFixture.date_played)} · ${fixtureSide(personalNextFixture, personalTeamNames) ?? 'Fixture'} · ${personalNextFixture.division_name}`}
                          onClick={() => navigateInTab('leagues', `fixture/${personalNextFixture.fixture_id}`)}
                        />
                      </DesignList>
                    </div>
                  ) : null}
                </>
              )}
            </PageSection>
          ) : (
            <PageSection
              surface="flat"
              density="compact"
              title="Make leagues personal"
              description="Claim your player to see your team, form and next fixture at the top of this page."
              action={(
                <AppButton size="s" tone="ghost" onClick={() => navigateInTab('players')}>
                  Find my player
                  <i className="fa fa-angle-right" aria-hidden="true" />
                </AppButton>
              )}
              className="tt-leagues-dashboard-section"
            >
              <DesignList density="compact" divider="none" paginate={false}>
                <ListItem
                  leading={<IconCircle iconClassName="fa fa-id-badge" tone="accent" />}
                  title="Claim your indexed player"
                  subtitle="Open your player profile and choose “This is me”."
                  onClick={() => navigateInTab('players')}
                />
              </DesignList>
            </PageSection>
          )}

          <PageSection
            surface="flat"
            density="compact"
            title="Coming up"
            action={(
              <SectionAction
                expanded={showAllUpcoming}
                total={prioritizedUpcoming.length}
                collapsedCount={3}
                onClick={() => setShowAllUpcoming((value) => !value)}
              />
            )}
            className="tt-leagues-dashboard-section tt-leagues-upcoming"
          >
            {upcomingRows.length > 0 ? (
              <DesignList density="compact" divider="hairline" paginate={false}>
                {upcomingRows.map((fixture) => {
                  const personal = fixtureHasTeam(fixture, personalTeamNames);
                  const favourite = fixtureHasTeam(fixture, favouriteTeamNames);
                  return (
                    <ListItem
                      key={fixture.fixture_id}
                      className="tt-leagues-upcoming-row"
                      leading={<UpcomingDate value={fixture.date_played} />}
                      title={formatFixtureTeams(fixture.home_team_name, fixture.away_team_name)}
                      subtitle={(
                        <FixtureMetadata
                          division={fixture.division_name}
                          side={fixtureSide(fixture, personalTeamNames)}
                          personal={personal}
                          favourite={favourite}
                        />
                      )}
                      onClick={() => navigateInTab('leagues', `fixture/${fixture.fixture_id}`)}
                    />
                  );
                })}
              </DesignList>
            ) : (
              <EmptyState iconClassName="fa fa-calendar" title="Nothing scheduled" message="Upcoming fixtures from selected leagues will appear here." />
            )}
          </PageSection>

          <PageSection
            surface="flat"
            density="compact"
            title="League pulse"
            description="Across selected leagues"
            action={(
              <SectionAction
                expanded={showAllPulse}
                total={performanceMode === 'players' ? players.length : dashboard?.top_teams.length ?? 0}
                collapsedCount={4}
                onClick={() => setShowAllPulse((value) => !value)}
              />
            )}
            className="tt-leagues-dashboard-section tt-leagues-pulse"
          >
            <FilterBar ariaLabel="League pulse filters">
              <SegmentedToggle
                ariaLabel="Choose player or team performance"
                value={performanceMode}
                onChange={(value) => {
                  setPerformanceMode(value);
                  setShowAllPulse(false);
                }}
                options={[
                  { value: 'players', label: 'Players' },
                  { value: 'teams', label: 'Teams' },
                ]}
              />
              {performanceMode === 'players' ? (
                <SegmentedToggle
                  ariaLabel="Choose player ranking"
                  value={playerMode}
                  onChange={(value) => {
                    setPlayerMode(value);
                    setShowAllPulse(false);
                  }}
                  options={[
                    { value: 'top', label: 'Top' },
                    { value: 'form', label: 'In form' },
                    { value: 'improving', label: 'Improving' },
                  ]}
                />
              ) : null}
            </FilterBar>

            {performanceMode === 'players' ? (
              leadersQuery.isLoading ? (
                <SkeletonList rows={4} />
              ) : pulsePlayers.length === 0 ? (
                <EmptyState iconClassName="fa fa-chart-line" title="Not enough results" message="Player rankings will appear as results are recorded." />
              ) : (
                <DesignList density="compact" divider="hairline" paginate={false}>
                  {pulsePlayers.map((player, index) => {
                    const personal = Boolean(myPlayer && player.player_id === personalRecord?.player_id);
                    return (
                      <ListItem
                        key={player.player_id}
                        className={personal ? 'tt-leagues-pulse-you' : undefined}
                        leading={(
                          <span className="tt-leagues-pulse-leading">
                            <RankBadge>{player.rank || index + 1}</RankBadge>
                            <DesignAvatar size="compact" text={getInitials(player.player_name)} />
                          </span>
                        )}
                        title={<PulseTitle name={player.player_name} personal={personal} rank={player.rank || index + 1} />}
                        subtitle={`${player.wins}W · ${player.losses}L · ${player.played} played`}
                        trailing={<PulseValue mode={playerMode} winRate={player.win_rate} score={player.score} />}
                        onClick={() => navigateInTab('players', `player/${player.player_id}`)}
                      />
                    );
                  })}
                </DesignList>
              )
            ) : dashboard && teamRows.length > 0 ? (
              <DesignList density="compact" divider="hairline" paginate={false}>
                {teamRows.map((team, index) => (
                  <ListItem
                    key={team.team_id}
                    leading={<RankBadge>{team.position || index + 1}</RankBadge>}
                    title={team.team_name}
                    subtitle={`${team.league_name} · ${team.division_name} · ${team.won}W ${team.drawn}D ${team.lost}L`}
                    trailing={<Pill tone="accent">{Math.round(team.win_rate)}%</Pill>}
                    onClick={() => navigateInTab('leagues', `team/${team.team_id}`)}
                  />
                ))}
              </DesignList>
            ) : (
              <EmptyState iconClassName="fa fa-shield-alt" title="No team performance" message="Team standings are not available in the selected scope." />
            )}
          </PageSection>

          <PageSection
            surface="flat"
            density="compact"
            title="Your selected leagues"
            action={(
              <SectionAction
                expanded={showAllLeagues}
                total={orderedLeagues.length}
                collapsedCount={3}
                onClick={() => setShowAllLeagues((value) => !value)}
              />
            )}
            className="tt-leagues-dashboard-section tt-leagues-selected"
          >
            {overviewQuery.isLoading ? (
              <SkeletonList rows={3} />
            ) : (
              <DesignList density="compact" divider="hairline" paginate={false}>
                {leagueRows.map((league) => (
                  <ListItem
                    key={league.id}
                    leading={<IconCircle iconClassName="fa fa-table-tennis" tone={personalLeagueIds.has(league.id) ? 'success' : 'accent'} />}
                    title={league.name}
                    subtitle={`${league.season} · ${league.divisions} divisions · ${league.teams} teams`}
                    trailing={(
                      <LeagueTrailing
                        personal={personalLeagueIds.has(league.id)}
                        upcoming={league.upcoming_fixtures}
                      />
                    )}
                    onClick={() => navigateInTab('leagues', `league/${league.id}`)}
                  />
                ))}
              </DesignList>
            )}
          </PageSection>

          <PageSection
            surface="flat"
            density="compact"
            title="Latest results"
            action={(
              <SectionAction
                expanded={showAllResults}
                total={dashboard?.recent_results.length ?? 0}
                collapsedCount={3}
                onClick={() => setShowAllResults((value) => !value)}
              />
            )}
            className="tt-leagues-dashboard-section tt-leagues-results"
          >
            {recentRows.length > 0 ? (
              <DesignList density="compact" divider="hairline" paginate={false}>
                {recentRows.map((fixture) => {
                  const homeName = fixture.home_team_name ?? 'Home';
                  const awayName = fixture.away_team_name ?? 'Away';
                  return (
                    <MatchRecordRow
                      key={fixture.fixture_id}
                      score={{
                        value: `${fixture.home_score}–${fixture.away_score}`,
                        outcome: 'neutral',
                        ariaLabel: `${homeName} ${fixture.home_score}, ${awayName} ${fixture.away_score}`,
                      }}
                      title={`${homeName} vs ${awayName}`}
                      metadata={[fixture.league_name, fixture.division_name, formatDate(fixture.date_played)]}
                      onClick={() => navigateInTab('leagues', `fixture/${fixture.fixture_id}`)}
                    />
                  );
                })}
              </DesignList>
            ) : (
              <EmptyState iconClassName="fa fa-calendar-check" title="No recent results" message="Completed fixtures will appear here." />
            )}
          </PageSection>
        </>
      )}
    </div>
  );
}
