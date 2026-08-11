import { type ReactNode, useMemo, useState } from 'react';
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
import { useLeagueRisersQuery, useTopRatingsQuery } from './rating-queries';
import { useTabNavigation } from './navigation/tab-navigation';
import {
  AppButton,
  DesignAvatar,
  DesignList,
  EmptyState,
  ErrorState,
  FilterBar,
  IconCircle,
  ListItem,
  MatchRecordRow,
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
type PlayerMode = 'ranked' | 'risers' | 'form';
type UpcomingFixture = LeagueCollectionDashboard['upcoming_fixtures'][number];

interface PulsePlayerView {
  player_id: string;
  player_name: string;
  rank: number;
  subtitle: string;
  trailing: ReactNode;
}

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

function formatRating(value: number): string {
  return Math.round(value).toLocaleString('en-GB');
}

function formatRatingDelta(value: number): string {
  const rounded = Math.round(value);
  return `${rounded >= 0 ? '+' : ''}${rounded.toLocaleString('en-GB')}`;
}

function prioritizePersonalRows<T extends { player_id: string }>(
  rows: T[],
  personalPlayerIds: Set<string>,
  limit: number,
): T[] {
  const visible = rows.slice(0, limit);
  const personal = rows.find((row) => personalPlayerIds.has(row.player_id));
  if (!personal || visible.some((row) => row.player_id === personal.player_id)) return visible;
  return [...visible.slice(0, Math.max(0, limit - 1)), personal];
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

function PulseTitle({ name, personal }: { name: string; personal: boolean; rank?: number }) {
  if (!personal) return <>{name}</>;
  return (
    <span className="tt-leagues-you-title">
      <span>{name}</span>
      <Pill size="xs" tone="accent">You</Pill>
    </span>
  );
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
  const [playerMode, setPlayerMode] = useState<PlayerMode>('ranked');
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
    mode: 'form',
    leagueIds,
    allLeaguesCount: allLeagues.length,
    limit: 8,
    minPlayed: 5,
    enabled: leagueIds.length > 0 && performanceMode === 'players' && playerMode === 'form',
  });
  const rankingsQuery = useTopRatingsQuery(
    leagueIds,
    100,
    leagueIds.length > 0 && performanceMode === 'players' && playerMode === 'ranked',
  );
  const risersQuery = useLeagueRisersQuery(
    leagueIds,
    100,
    42,
    leagueIds.length > 0 && performanceMode === 'players' && playerMode === 'risers',
  );
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
  const formPlayers = leadersQuery.data?.data ?? [];
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
  const personalPlayerIds = useMemo(
    () => new Set(
      [myPlayer?.id, profileQuery.data?.player_id].filter((id): id is string => Boolean(id)),
    ),
    [myPlayer?.id, profileQuery.data?.player_id],
  );

  const personalRecord = useMemo(() => {
    if (!myPlayer) return null;
    return (personalSeasonQuery.data?.data ?? [])
      .find((player) => personalPlayerIds.has(player.player_id)) ?? null;
  }, [myPlayer, personalPlayerIds, personalSeasonQuery.data?.data]);

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

  const pulseLimit = showAllPulse ? 8 : 4;
  const pulsePlayers = useMemo<PulsePlayerView[]>(() => {
    if (playerMode === 'ranked') {
      return prioritizePersonalRows(rankingsQuery.data?.data ?? [], personalPlayerIds, pulseLimit)
        .map((player) => ({
          player_id: player.player_id,
          player_name: player.player_name,
          rank: player.rank,
          subtitle: `RD ${Math.round(player.rating_deviation)} · #${player.overall_rank} overall · ${player.rated_matches} rated`,
          trailing: <Pill tone="accent">{formatRating(player.rating)}</Pill>,
        }));
    }

    if (playerMode === 'risers') {
      return prioritizePersonalRows(risersQuery.data?.data ?? [], personalPlayerIds, pulseLimit)
        .map((player) => ({
          player_id: player.player_id,
          player_name: player.player_name,
          rank: player.rank,
          subtitle: `${formatRating(player.rating_before)} → ${formatRating(player.rating_after)} · #${player.overall_rank} overall`,
          trailing: <Pill tone="success">{formatRatingDelta(player.change)}</Pill>,
        }));
    }

    return formPlayers.slice(0, pulseLimit).map((player) => ({
      player_id: player.player_id,
      player_name: player.player_name,
      rank: player.rank,
      subtitle: `${player.wins}W · ${player.losses}L · ${player.played} played`,
      trailing: <Pill tone="accent">{Math.round(player.win_rate)}%</Pill>,
    }));
  }, [formPlayers, personalPlayerIds, playerMode, pulseLimit, rankingsQuery.data?.data, risersQuery.data?.data]);

  const playerPulseLoading = playerMode === 'ranked'
    ? rankingsQuery.isLoading
    : playerMode === 'risers'
      ? risersQuery.isLoading
      : leadersQuery.isLoading;
  const playerPulseTotal = playerMode === 'ranked'
    ? rankingsQuery.data?.total ?? 0
    : playerMode === 'risers'
      ? risersQuery.data?.total ?? 0
      : formPlayers.length;
  const emptyPulseTitle = playerMode === 'ranked'
    ? 'No calculated ratings yet'
    : playerMode === 'risers'
      ? 'No established risers yet'
      : 'Not enough recent results';
  const emptyPulseMessage = playerMode === 'ranked'
    ? 'Established player ratings will appear as eligible results are processed.'
    : playerMode === 'risers'
      ? 'Six-week rating risers will appear once established players have enough history.'
      : 'Recent-form rankings will appear as results are recorded.';

  const primaryAffiliation = personalAffiliations[0] ?? null;
  const hasAnyCurrentAffiliation = (profileQuery.data?.current_season_affiliations.length ?? 0) > 0;
  const personalPlayed = personalRecord?.played ?? profileQuery.data?.total ?? 0;
  const personalWins = personalRecord?.wins ?? profileQuery.data?.wins ?? 0;
  const personalLosses = personalRecord?.losses ?? profileQuery.data?.losses ?? 0;
  const personalWinRate = personalRecord?.win_rate
    ?? (personalPlayed > 0 ? (personalWins / personalPlayed) * 100 : 0);
  const recentForm = profileQuery.data?.form.recent_results.slice(0, 6) ?? [];

  const leagueRows = orderedLeagues.slice(0, showAllLeagues ? orderedLeagues.length : 3);
  const recentRows = (dashboard?.recent_results ?? []).slice(0, showAllResults ? 8 : 3);
  const teamRows = (dashboard?.top_teams ?? []).slice(0, showAllPulse ? 8 : 4);

  return (
    <div className="tt-leagues-dashboard">
      {visibleLeagues.length > 0 ? (
        <div className="tt-leagues-hero-card">
          <div className="tt-leagues-hero-card__header">
            <div className="tt-leagues-hero-card__main">
              <span className="tt-leagues-hero-card__eyebrow">Active season</span>
              <h2>Your leagues</h2>
              <p>{visibleLeagues.length} selected league{visibleLeagues.length === 1 ? '' : 's'} · Player and team performance</p>
            </div>
            <AppButton size="s" tone="outline" onClick={onOpenLeagueSelector}>
              <i className="fa fa-cog" aria-hidden="true" />
              Manage leagues
            </AppButton>
          </div>

          {dashboard ? (
            <div className="tt-leagues-hero-card__stats">
              <div className="tt-leagues-hero-stat">
                <i className="fa fa-sitemap" aria-hidden="true" />
                <div className="tt-leagues-hero-stat__body">
                  <strong>{formatNumber(dashboard.totals.divisions)}</strong>
                  <span>Divisions</span>
                </div>
              </div>
              <div className="tt-leagues-hero-stat">
                <i className="fa fa-shield-alt" aria-hidden="true" />
                <div className="tt-leagues-hero-stat__body">
                  <strong>{formatNumber(dashboard.totals.teams)}</strong>
                  <span>Teams</span>
                </div>
              </div>
              <div className="tt-leagues-hero-stat">
                <i className="fa fa-table-tennis" aria-hidden="true" />
                <div className="tt-leagues-hero-stat__body">
                  <strong>{formatNumber(dashboard.totals.matches_played)}</strong>
                  <span>Played</span>
                </div>
              </div>
              <div className="tt-leagues-hero-stat">
                <i className="fa fa-users" aria-hidden="true" />
                <div className="tt-leagues-hero-stat__body">
                  <strong>{formatNumber(dashboard.totals.players)}</strong>
                  <span>Players</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
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
                <div className="tt-leagues-season-card">
                  <div className="tt-leagues-season__profile">
                    <DesignAvatar
                      size="hero"
                      text={getInitials(profileQuery.data?.player_name ?? myPlayer.name)}
                    />
                    <div className="tt-leagues-season__identity">
                      <strong>{profileQuery.data?.player_name ?? myPlayer.name}</strong>
                      <span>{primaryAffiliation?.team_name} · {primaryAffiliation?.competition_name}</span>
                    </div>
                    <div className="tt-leagues-season__badge">
                      <Pill tone="accent">{Math.round(personalWinRate)}% Win Rate</Pill>
                    </div>
                  </div>

                  <div className="tt-leagues-season__stat-bar">
                    <div className="tt-leagues-season__stat-item">
                      <strong>{personalPlayed}</strong>
                      <span>Played</span>
                    </div>
                    <div className="tt-leagues-season__stat-item">
                      <strong className="tt-text-success">{personalWins}</strong>
                      <span>Wins</span>
                    </div>
                    <div className="tt-leagues-season__stat-item">
                      <strong className="tt-text-danger">{personalLosses}</strong>
                      <span>Losses</span>
                    </div>
                  </div>

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
                </div>
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
            title="League pulse"
            description={performanceMode === 'players'
              ? 'Strength, movement and recent form across selected leagues'
              : 'Team performance across selected leagues'}
            action={(
              <SectionAction
                expanded={showAllPulse}
                total={performanceMode === 'players' ? playerPulseTotal : dashboard?.top_teams.length ?? 0}
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
                    { value: 'ranked', label: 'Ranked' },
                    { value: 'risers', label: 'Risers' },
                    { value: 'form', label: 'Form' },
                  ]}
                />
              ) : null}
            </FilterBar>

            {performanceMode === 'players' ? (
              playerPulseLoading ? (
                <SkeletonList rows={4} />
              ) : pulsePlayers.length === 0 ? (
                <EmptyState iconClassName="fa fa-chart-line" title={emptyPulseTitle} message={emptyPulseMessage} />
              ) : (
                <DesignList density="compact" divider="hairline" paginate={false}>
                  {pulsePlayers.map((player) => {
                    const personal = personalPlayerIds.has(player.player_id);
                    return (
                      <ListItem
                        key={player.player_id}
                        className={personal ? 'tt-leagues-pulse-you' : undefined}
                        leading={<RankBadge>{player.rank}</RankBadge>}
                        title={<PulseTitle name={player.player_name} personal={personal} rank={player.rank} />}
                        subtitle={player.subtitle}
                        trailing={player.trailing}
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
