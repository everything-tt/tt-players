import { useMemo, useState } from 'react';
import { getQueryError, type LeagueWithDivisions } from './player-shared';
import { SkeletonList } from './components/Skeleton';
import {
  useLeagueCollectionDashboardQuery,
  useLeagueOverviewQuery,
  useLeadersQuery,
  useLeaguesQuery,
} from './queries';
import { useTabNavigation } from './navigation/tab-navigation';
import {
  EmptyState,
  ErrorState,
  HeroCard,
  IconCircle,
  List,
  ListItem,
  Pill,
  RankBadge,
  SectionHeader,
  SegmentedToggle,
} from './ui/appkit';
import { FavouriteButton } from './components/FavouriteButton';
import { useFavouriteTeams } from './hooks/useFavouriteTeams';

interface LeaguesTabContentProps {
  selectedLeagueIds: string[];
}

type PerformanceMode = 'players' | 'teams';
type PlayerMode = 'best' | 'active';

function formatDate(value: string | null): string {
  if (!value) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
    .format(new Date(`${value}T12:00:00`));
}

export function LeaguesTabContent({ selectedLeagueIds }: LeaguesTabContentProps) {
  const { navigateInTab } = useTabNavigation();
  const { isFavourite: isFavouriteTeam, toggle: toggleFavouriteTeam } = useFavouriteTeams();
  const leaguesQuery = useLeaguesQuery();
  const allLeagues: LeagueWithDivisions[] = leaguesQuery.data?.data ?? [];
  const [performanceMode, setPerformanceMode] = useState<PerformanceMode>('players');
  const [playerMode, setPlayerMode] = useState<PlayerMode>('best');

  const visibleLeagues = useMemo(() => {
    if (selectedLeagueIds.length === 0) return allLeagues;
    const selected = new Set(selectedLeagueIds);
    return allLeagues.filter((league) => selected.has(league.id));
  }, [allLeagues, selectedLeagueIds]);
  const leagueIds = visibleLeagues.map((league) => league.id);

  const dashboardQuery = useLeagueCollectionDashboardQuery(leagueIds, leagueIds.length > 0);
  const overviewQuery = useLeagueOverviewQuery(leagueIds, leagueIds.length > 0);
  const leadersQuery = useLeadersQuery({
    mode: playerMode === 'best' ? 'win_pct' : 'most_played',
    leagueIds,
    limit: 5,
    minPlayed: 5,
    enabled: leagueIds.length > 0 && performanceMode === 'players',
  });

  const dashboard = dashboardQuery.data ?? null;
  const leagues = overviewQuery.data?.data ?? [];
  const players = leadersQuery.data?.data ?? [];
  const error = getQueryError(dashboardQuery.error) || getQueryError(overviewQuery.error);

  return (
    <>
      <HeroCard
        eyebrow="Active season"
        title="Your leagues"
        summary={`${visibleLeagues.length} selected league${visibleLeagues.length === 1 ? '' : 's'} · Player and team performance`}
      >
        {dashboard ? (
          <div className="tt-league-collection-stats">
            <div><strong>{dashboard.totals.divisions}</strong><span>Divisions</span></div>
            <div><strong>{dashboard.totals.teams}</strong><span>Teams</span></div>
            <div><strong>{dashboard.totals.matches_played}</strong><span>Matches</span></div>
            <div><strong>{dashboard.totals.upcoming_fixtures}</strong><span>Upcoming</span></div>
          </div>
        ) : null}
      </HeroCard>

      {leaguesQuery.isLoading || dashboardQuery.isLoading ? (
        <section className="tt-player-section"><SkeletonList rows={5} /></section>
      ) : visibleLeagues.length === 0 ? (
        <section className="tt-player-section">
          <EmptyState iconClassName="fa fa-table-tennis" title="No leagues selected" message="Choose leagues to build an active-season overview." />
        </section>
      ) : error ? (
        <section className="tt-player-section"><ErrorState message={error} /></section>
      ) : (
        <>
          <section className="tt-player-section" aria-labelledby="tt-scope-performance-title">
            <SectionHeader title="Performance" note="Across selected leagues" />
            <div className="tt-home-leaders-header">
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
                    { value: 'best', label: 'Best' },
                    { value: 'active', label: 'Active' },
                  ]}
                />
              ) : <span className="tt-home-leaders-desc">By win rate</span>}
            </div>

            {performanceMode === 'players' ? (
              leadersQuery.isLoading ? <SkeletonList rows={5} /> :
                players.length === 0 ? (
                  <EmptyState iconClassName="fa fa-chart-line" title="Not enough results" message="Players appear after at least five singles." />
                ) : (
                  <List divider="hairline">
                    {players.slice(0, 5).map((player, index) => (
                      <ListItem
                        key={player.player_id}
                        leading={<RankBadge>{index + 1}</RankBadge>}
                        title={player.player_name}
                        subtitle={`${player.wins}W · ${player.losses}L · ${player.played} played`}
                        trailing={<Pill tone="accent">{Math.round(player.win_rate)}%</Pill>}
                        onClick={() => navigateInTab('players', `player/${player.player_id}`)}
                      />
                    ))}
                  </List>
                )
            ) : dashboard && dashboard.top_teams.length > 0 ? (
              <List divider="hairline">
                {dashboard.top_teams.slice(0, 5).map((team, index) => (
                  <ListItem
                    key={team.team_id}
                    leading={<RankBadge>{index + 1}</RankBadge>}
                    title={team.team_name}
                    subtitle={`${team.league_name} · ${team.division_name} · ${team.won}W ${team.drawn}D ${team.lost}L`}
                    trailing={(
                      <span className="tt-team-roster-trailing">
                        <Pill tone="accent">{Math.round(team.win_rate)}%</Pill>
                        <FavouriteButton
                          size="icon"
                          saved={isFavouriteTeam(team.team_id)}
                          onToggle={() => toggleFavouriteTeam({
                            id: team.team_id,
                            name: team.team_name,
                            leagueName: team.league_name,
                            divisionName: team.division_name,
                          })}
                        />
                      </span>
                    )}
                    onClick={() => navigateInTab('leagues', `team/${team.team_id}`)}
                  />
                ))}
              </List>
            ) : (
              <EmptyState iconClassName="fa fa-shield-alt" title="No team performance" message="Team standings are not available in the selected scope." />
            )}
          </section>

          <section className="tt-player-section" aria-labelledby="tt-scope-activity-title">
            <SectionHeader title="Across your leagues" note="Latest active-season results" />
            {dashboard && dashboard.recent_results.length > 0 ? (
              <List divider="hairline">
                {dashboard.recent_results.slice(0, 6).map((fixture) => (
                  <ListItem
                    key={fixture.fixture_id}
                    leading={<span className="tt-score-badge">{fixture.home_score}–{fixture.away_score}</span>}
                    title={`${fixture.home_team_name ?? 'Home'} vs ${fixture.away_team_name ?? 'Away'}`}
                    subtitle={`${fixture.league_name} · ${fixture.division_name} · ${formatDate(fixture.date_played)}`}
                    onClick={() => navigateInTab('leagues', `fixture/${fixture.fixture_id}`)}
                  />
                ))}
              </List>
            ) : (
              <EmptyState iconClassName="fa fa-calendar-check" title="No recent results" message="Completed active-season fixtures will appear here." />
            )}
          </section>

          <section className="tt-player-section" aria-labelledby="tt-scope-leagues-title">
            <SectionHeader title="League breakdown" note="Standings and history" />
            {overviewQuery.isLoading ? <SkeletonList rows={visibleLeagues.length} /> : (
              <List divider="hairline">
                {leagues.map((league) => (
                  <ListItem
                    key={league.id}
                    leading={<IconCircle iconClassName="fa fa-table-tennis" tone="accent" />}
                    title={league.name}
                    subtitle={`${league.season} · ${league.divisions} divisions · ${league.teams} teams · ${league.matches_played} matches`}
                    trailing={<Pill tone="neutral">Explore</Pill>}
                    onClick={() => navigateInTab('leagues', `league/${league.id}`)}
                  />
                ))}
              </List>
            )}
          </section>
        </>
      )}
    </>
  );
}
