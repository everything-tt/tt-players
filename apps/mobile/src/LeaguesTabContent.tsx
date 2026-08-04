import { useMemo, useState } from 'react';
import {
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
  Inline,
  ListItem,
  MatchRecordRow,
  MetricGrid,
  OutcomeBadge,
  PageSection,
  Pill,
  RankBadge,
  SegmentedToggle,
  Stack,
} from './ui/appkit';
import { FavouriteButton } from './components/FavouriteButton';
import { useFavouriteTeams } from './hooks/useFavouriteTeams';
import { useMyPlayer } from './hooks/useMyPlayer';
import { useAuth } from './lib/auth';

interface LeaguesTabContentProps {
  selectedLeagueIds: string[];
  onOpenLeagueSelector: () => void;
}

type PerformanceMode = 'players' | 'teams';
type PlayerMode = 'top' | 'form' | 'improving';
type UpcomingFixture = LeagueCollectionDashboard['upcoming_fixtures'][number];

function formatDate(value: string | null): string {
  if (!value) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
    .format(new Date(`${value}T12:00:00`));
}

function formatFixtureTeams(home: string | null, away: string | null): string {
  return `${home ?? 'Home'} vs ${away ?? 'Away'}`;
}

function fixtureHasTeam(fixture: UpcomingFixture, teamNames: Set<string>): boolean {
  return Boolean(
    (fixture.home_team_name && teamNames.has(fixture.home_team_name))
    || (fixture.away_team_name && teamNames.has(fixture.away_team_name)),
  );
}

export function LeaguesTabContent({
  selectedLeagueIds,
  onOpenLeagueSelector,
}: LeaguesTabContentProps) {
  const auth = useAuth();
  const { player: myPlayer } = useMyPlayer();
  const { navigateInTab } = useTabNavigation();
  const { teams: favouriteTeams, toggle: toggleFavouriteTeam } = useFavouriteTeams();
  const leaguesQuery = useLeaguesQuery();
  const allLeagues: LeagueWithDivisions[] = leaguesQuery.data?.data ?? [];
  const [performanceMode, setPerformanceMode] = useState<PerformanceMode>('players');
  const [playerMode, setPlayerMode] = useState<PlayerMode>('top');

  const visibleLeagues = useMemo(() => {
    if (selectedLeagueIds.length === 0) return allLeagues;
    const selected = new Set(selectedLeagueIds);
    return allLeagues.filter((league) => selected.has(league.id));
  }, [allLeagues, selectedLeagueIds]);
  const leagueIds = visibleLeagues.map((league) => league.id);

  const dashboardQuery = useLeagueCollectionDashboardQuery(leagueIds, leagueIds.length > 0);
  const overviewQuery = useLeagueOverviewQuery(leagueIds, leagueIds.length > 0);
  const profileQuery = usePlayerProfileOverviewQuery(
    myPlayer?.id ?? '',
    Boolean(auth.user && myPlayer),
  );
  const leadersQuery = useLeadersQuery({
    mode: playerMode === 'form'
      ? 'form'
      : playerMode === 'improving'
        ? 'improving'
        : 'combined',
    leagueIds,
    allLeaguesCount: allLeagues.length,
    limit: 5,
    minPlayed: playerMode === 'form' ? 5 : 3,
    enabled: leagueIds.length > 0 && performanceMode === 'players',
  });
  const personalSeasonQuery = useLeadersQuery({
    mode: 'combined',
    leagueIds,
    allLeaguesCount: allLeagues.length,
    limit: 100,
    minPlayed: 1,
    enabled: leagueIds.length > 0 && Boolean(auth.user && myPlayer),
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
    const playerIds = new Set([
      myPlayer?.id,
      profileQuery.data?.player_id,
    ].filter((id): id is string => Boolean(id)));
    return (personalSeasonQuery.data?.data ?? [])
      .find((player) => playerIds.has(player.player_id)) ?? null;
  }, [myPlayer?.id, personalSeasonQuery.data?.data, profileQuery.data?.player_id]);

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
      const leftPersonal = personalLeagueIds.has(left.id) ? 0 : 1;
      const rightPersonal = personalLeagueIds.has(right.id) ? 0 : 1;
      if (leftPersonal !== rightPersonal) return leftPersonal - rightPersonal;
      if (left.upcoming_fixtures !== right.upcoming_fixtures) {
        return right.upcoming_fixtures - left.upcoming_fixtures;
      }
      return left.name.localeCompare(right.name);
    });
  }, [leagues, personalLeagueIds]);

  const pulsePlayers = useMemo(() => {
    const visible = players.slice(0, 4);
    if (playerMode !== 'top' || !personalRecord) return visible;
    if (visible.some((player) => player.player_id === personalRecord.player_id)) return visible;
    return [...visible.slice(0, 3), personalRecord];
  }, [personalRecord, playerMode, players]);

  const primaryAffiliation = personalAffiliations[0] ?? null;
  const affiliationSummary = primaryAffiliation
    ? `${primaryAffiliation.team_name} · ${primaryAffiliation.competition_name}${personalAffiliations.length > 1 ? ` · +${personalAffiliations.length - 1} more` : ''}`
    : 'Current-season team and division';
  const recentForm = profileQuery.data?.form.recent_results.slice(0, 6) ?? [];
  const hasAnyCurrentAffiliation = (profileQuery.data?.current_season_affiliations.length ?? 0) > 0;

  return (
    <>
      <EntityHero
        eyebrow="Active season"
        title="Your leagues"
        subtitle={`${visibleLeagues.length} selected league${visibleLeagues.length === 1 ? '' : 's'} · Player and team performance`}
        actions={(
          <AppButton size="sm" tone="ghost" onClick={onOpenLeagueSelector}>
            <i className="fa fa-sliders-h" aria-hidden="true" />
            Manage leagues
          </AppButton>
        )}
        highlights={dashboard ? (
          <MetricGrid
            density="compact"
            columns={4}
            metrics={[
              { label: 'Divisions', value: dashboard.totals.divisions },
              { label: 'Teams', value: dashboard.totals.teams },
              { label: 'Played', value: dashboard.totals.matches_played },
              { label: 'Upcoming', value: dashboard.totals.upcoming_fixtures },
            ]}
          />
        ) : null}
      />

      {leaguesQuery.isLoading || dashboardQuery.isLoading ? (
        <PageSection surface="flat" density="compact"><SkeletonList rows={5} /></PageSection>
      ) : visibleLeagues.length === 0 ? (
        <PageSection surface="flat" density="compact">
          <EmptyState
            iconClassName="fa fa-table-tennis"
            title="No leagues selected"
            message="Choose leagues to build an active-season overview."
          />
        </PageSection>
      ) : error ? (
        <PageSection surface="flat" density="compact"><ErrorState message={error} /></PageSection>
      ) : (
        <>
          {!auth.loading && auth.user && !myPlayer ? (
            <PageSection
              surface="flat"
              density="compact"
              emphasis="primary"
              title="Make leagues personal"
              description="Claim your player to surface your team, current record and next fixture."
            >
              <DesignList density="compact" divider="none" paginate={false}>
                <ListItem
                  leading={<IconCircle iconClassName="fa fa-id-badge" tone="accent" />}
                  title="Find your player"
                  subtitle="Choose “This is me” from your indexed player profile."
                  trailing={<Pill size="xs" tone="neutral">Claim</Pill>}
                  onClick={() => navigateInTab('players')}
                />
              </DesignList>
            </PageSection>
          ) : null}

          {!auth.loading && auth.user && myPlayer ? (
            <PageSection
              surface="flat"
              density="compact"
              emphasis="primary"
              title="Your season"
              description={personalAffiliations.length > 0
                ? affiliationSummary
                : hasAnyCurrentAffiliation
                  ? 'Your current league is outside the selected scope.'
                  : 'We have not found a current-season team for this player yet.'}
              meta={<Pill size="xs" tone="success">You</Pill>}
              action={(
                <AppButton
                  size="s"
                  tone="ghost"
                  onClick={() => navigateInTab('players', `player/${myPlayer.id}`)}
                >
                  View profile
                </AppButton>
              )}
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
                      ? 'Manage your league scope to bring your team into this dashboard.'
                      : 'Your personal league summary will appear after a current-season team is found.'}
                    trailing={hasAnyCurrentAffiliation
                      ? <Pill size="xs" tone="neutral">Manage</Pill>
                      : <Pill size="xs" tone="neutral">Claimed</Pill>}
                    onClick={hasAnyCurrentAffiliation ? onOpenLeagueSelector : undefined}
                  />
                </DesignList>
              ) : (
                <Stack gap="sm">
                  <DesignList density="compact" divider="none" paginate={false}>
                    <ListItem
                      leading={(
                        <DesignAvatar
                          size="standard"
                          text={getInitials(profileQuery.data?.player_name ?? myPlayer.name)}
                        />
                      )}
                      title={profileQuery.data?.player_name ?? myPlayer.name}
                      subtitle={affiliationSummary}
                      trailing={personalRecord
                        ? <Pill size="xs" tone="neutral">#{personalRecord.rank}</Pill>
                        : <Pill size="xs" tone="neutral">Active</Pill>}
                      onClick={() => navigateInTab('players', `player/${myPlayer.id}`)}
                    />
                  </DesignList>

                  {personalRecord ? (
                    <MetricGrid
                      density="compact"
                      columns={4}
                      ariaLabel="Your active-season league record"
                      metrics={[
                        { label: 'Played', value: personalRecord.played },
                        { label: 'Wins', value: personalRecord.wins },
                        { label: 'Losses', value: personalRecord.losses },
                        { label: 'Win rate', value: `${Math.round(personalRecord.win_rate)}%` },
                      ]}
                    />
                  ) : (
                    <EmptyState
                      iconClassName="fa fa-chart-line"
                      title="No active-season singles yet"
                      message="Your record will appear after your first singles result in the selected leagues."
                    />
                  )}

                  {recentForm.length > 0 ? (
                    <DesignList density="compact" divider="none" paginate={false}>
                      <ListItem
                        title="Recent form"
                        subtitle="Latest singles across your profile"
                        hideChevron
                        trailing={(
                          <Inline gap="xs" wrap aria-label="Recent form">
                            {recentForm.map((result, index) => (
                              <OutcomeBadge key={`${result}-${index}`} result={result} variant="badge" />
                            ))}
                          </Inline>
                        )}
                      />
                    </DesignList>
                  ) : null}

                  {personalNextFixture ? (
                    <DesignList density="compact" divider="none" paginate={false}>
                      <ListItem
                        leading={<IconCircle iconClassName="fa fa-calendar-alt" tone="accent" />}
                        title={formatFixtureTeams(
                          personalNextFixture.home_team_name,
                          personalNextFixture.away_team_name,
                        )}
                        subtitle={`${personalNextFixture.league_name} · ${personalNextFixture.division_name} · Your team`}
                        trailing={<Pill size="xs" tone="success">{formatDate(personalNextFixture.date_played)}</Pill>}
                        onClick={() => navigateInTab('leagues', `fixture/${personalNextFixture.fixture_id}`)}
                      />
                    </DesignList>
                  ) : null}
                </Stack>
              )}
            </PageSection>
          ) : null}

          <PageSection
            surface="flat"
            density="compact"
            title="Coming up"
            description="Next fixtures across selected leagues"
          >
            {prioritizedUpcoming.length > 0 ? (
              <DesignList density="compact" divider="hairline" paginate={false}>
                {prioritizedUpcoming.slice(0, 3).map((fixture) => {
                  const isPersonal = fixtureHasTeam(fixture, personalTeamNames);
                  const isFavourite = fixtureHasTeam(fixture, favouriteTeamNames);
                  return (
                    <ListItem
                      key={fixture.fixture_id}
                      leading={<IconCircle iconClassName="fa fa-calendar-alt" tone={isPersonal ? 'success' : 'neutral'} />}
                      title={formatFixtureTeams(fixture.home_team_name, fixture.away_team_name)}
                      subtitle={`${fixture.league_name} · ${fixture.division_name}${isPersonal ? ' · Your team' : isFavourite ? ' · Favourite' : ''}`}
                      trailing={(
                        <Pill size="xs" tone={isPersonal ? 'success' : 'neutral'}>
                          {formatDate(fixture.date_played)}
                        </Pill>
                      )}
                      onClick={() => navigateInTab('leagues', `fixture/${fixture.fixture_id}`)}
                    />
                  );
                })}
              </DesignList>
            ) : (
              <EmptyState
                iconClassName="fa fa-calendar"
                title="No upcoming fixtures"
                message="New fixtures from your selected leagues will appear here."
              />
            )}
          </PageSection>

          <PageSection
            surface="flat"
            density="compact"
            title="League pulse"
            description="Across selected leagues"
          >
            <FilterBar ariaLabel="League pulse filters">
              <SegmentedToggle
                ariaLabel="Choose performance view"
                value={performanceMode}
                onChange={setPerformanceMode}
                options={[
                  { value: 'players', label: 'Players' },
                  { value: 'teams', label: 'Teams' },
                ]}
              />
              {performanceMode === 'players' ? (
                <SegmentedToggle
                  ariaLabel="Choose player ranking"
                  value={playerMode}
                  onChange={setPlayerMode}
                  options={[
                    { value: 'top', label: 'Top' },
                    { value: 'form', label: 'In form' },
                    { value: 'improving', label: 'Improving' },
                  ]}
                />
              ) : null}
            </FilterBar>

            {performanceMode === 'players' ? (
              leadersQuery.isLoading ? <SkeletonList rows={4} /> : pulsePlayers.length === 0 ? (
                <EmptyState
                  iconClassName="fa fa-chart-line"
                  title="Not enough results"
                  message="Player rankings will appear as active-season singles are completed."
                />
              ) : (
                <DesignList density="compact" divider="hairline" paginate={false}>
                  {pulsePlayers.map((player) => {
                    const isYou = player.player_id === myPlayer?.id
                      || player.player_id === profileQuery.data?.player_id;
                    return (
                      <ListItem
                        key={player.player_id}
                        active={isYou}
                        leading={<RankBadge>{player.rank}</RankBadge>}
                        title={(
                          <Inline gap="xs" wrap>
                            <span>{player.player_name}</span>
                            {isYou ? <Pill size="xs" tone="success">You</Pill> : null}
                          </Inline>
                        )}
                        subtitle={playerMode === 'form'
                          ? `${player.wins}W · ${player.losses}L · Latest ${player.played}`
                          : playerMode === 'improving'
                            ? `${player.wins}W · ${player.losses}L · Latest five`
                            : `${player.wins}W · ${player.losses}L · ${player.played} played`}
                        trailing={playerMode === 'improving'
                          ? <Pill tone={isYou ? 'success' : 'accent'}>+{Math.round(player.score ?? 0)} pts</Pill>
                          : <Pill tone={isYou ? 'success' : 'accent'}>{Math.round(player.win_rate)}%</Pill>}
                        onClick={() => navigateInTab('players', `player/${player.player_id}`)}
                      />
                    );
                  })}
                </DesignList>
              )
            ) : dashboard && dashboard.top_teams.length > 0 ? (
              <DesignList density="compact" divider="hairline" paginate={false}>
                {dashboard.top_teams.slice(0, 4).map((team, index) => (
                  <ListItem
                    key={team.team_id}
                    leading={<RankBadge>{index + 1}</RankBadge>}
                    title={team.team_name}
                    subtitle={`${team.league_name} · ${team.division_name} · ${team.won}W ${team.drawn}D ${team.lost}L`}
                    trailing={<Pill tone="accent">{Math.round(team.win_rate)}%</Pill>}
                    onClick={() => navigateInTab('leagues', `team/${team.team_id}`)}
                  />
                ))}
              </DesignList>
            ) : (
              <EmptyState
                iconClassName="fa fa-shield-alt"
                title="No team performance"
                message="Team standings are not available in the selected scope."
              />
            )}
          </PageSection>

          <PageSection
            surface="flat"
            density="compact"
            emphasis="secondary"
            title="Your selected leagues"
            description="Standings, fixtures and active-season history"
          >
            {overviewQuery.isLoading ? <SkeletonList rows={visibleLeagues.length} /> : (
              <DesignList
                density="compact"
                divider="hairline"
                initialVisibleCount={5}
              >
                {orderedLeagues.map((league) => {
                  const isPersonalLeague = personalLeagueIds.has(league.id);
                  return (
                    <ListItem
                      key={league.id}
                      leading={<IconCircle iconClassName="fa fa-table-tennis" tone={isPersonalLeague ? 'success' : 'accent'} />}
                      title={league.name}
                      subtitle={`${league.season} · ${league.divisions} divisions · ${league.teams} teams · ${league.matches_played} matches`}
                      trailing={isPersonalLeague
                        ? <Pill size="xs" tone="success">You play here</Pill>
                        : league.upcoming_fixtures > 0
                          ? <Pill size="xs" tone="neutral">{league.upcoming_fixtures} upcoming</Pill>
                          : <Pill size="xs" tone="neutral">Explore</Pill>}
                      onClick={() => navigateInTab('leagues', `league/${league.id}`)}
                    />
                  );
                })}
              </DesignList>
            )}
          </PageSection>

          {favouriteTeams.length > 0 ? (
            <PageSection
              surface="flat"
              density="compact"
              emphasis="secondary"
              title="Favourite teams"
              meta={<Pill size="xs" tone="neutral">{favouriteTeams.length} saved</Pill>}
            >
              <DesignList density="compact" divider="hairline" initialVisibleCount={3}>
                {favouriteTeams.map((team) => (
                  <ListItem
                    key={team.id}
                    leading={<IconCircle iconClassName="fa fa-shield-alt" tone="accent" />}
                    title={team.name}
                    subtitle={[team.leagueName, team.divisionName].filter(Boolean).join(' · ')}
                    trailing={(
                      <FavouriteButton
                        size="icon"
                        saved
                        onToggle={() => toggleFavouriteTeam(team)}
                      />
                    )}
                    onClick={() => navigateInTab('leagues', `team/${team.id}`)}
                  />
                ))}
              </DesignList>
            </PageSection>
          ) : null}

          <PageSection
            surface="flat"
            density="compact"
            emphasis="secondary"
            title="Latest results"
            description="Most recent completed fixtures"
          >
            {dashboard && dashboard.recent_results.length > 0 ? (
              <DesignList density="compact" divider="hairline" paginate={false}>
                {dashboard.recent_results.slice(0, 5).map((fixture) => {
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
              <EmptyState
                iconClassName="fa fa-calendar-check"
                title="No recent results"
                message="Completed active-season fixtures will appear here."
              />
            )}
          </PageSection>
        </>
      )}
    </>
  );
}
