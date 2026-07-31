import { useMemo, useState } from 'react';
import { getQueryError, type LeagueWithDivisions } from './player-shared';
import { SkeletonList } from './components/Skeleton';
import { useLeagueCollectionDashboardQuery, useLeagueOverviewQuery, useLeadersQuery, useLeaguesQuery } from './queries';
import { useTabNavigation } from './navigation/tab-navigation';
import {
  DesignList,
  EmptyState,
  EntityHero,
  ErrorState,
  FilterBar,
  IconCircle,
  ListItem,
  MetricGrid,
  PageSection,
  Pill,
  RankBadge,
  SegmentedToggle,
} from './ui/appkit';
import { FavouriteButton } from './components/FavouriteButton';
import { useFavouriteTeams } from './hooks/useFavouriteTeams';

interface LeaguesTabContentProps { selectedLeagueIds: string[]; }
type PerformanceMode = 'players' | 'teams';
type PlayerMode = 'best' | 'active';

function formatDate(value: string | null): string {
  if (!value) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`));
}

export function LeaguesTabContent({ selectedLeagueIds }: LeaguesTabContentProps) {
  const { navigateInTab } = useTabNavigation();
  const { teams: favouriteTeams, toggle: toggleFavouriteTeam } = useFavouriteTeams();
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
  const leadersQuery = useLeadersQuery({ mode: playerMode === 'best' ? 'win_pct' : 'most_played', leagueIds, limit: 5, minPlayed: 5, enabled: leagueIds.length > 0 && performanceMode === 'players' });

  const dashboard = dashboardQuery.data ?? null;
  const leagues = overviewQuery.data?.data ?? [];
  const players = leadersQuery.data?.data ?? [];
  const error = getQueryError(dashboardQuery.error) || getQueryError(overviewQuery.error);

  return (
    <>
      <EntityHero
        eyebrow="Active season"
        title="Your leagues"
        subtitle={`${visibleLeagues.length} selected league${visibleLeagues.length === 1 ? '' : 's'} · Player and team performance`}
        highlights={dashboard ? (
          <MetricGrid
            density="compact"
            columns={4}
            metrics={[
              { label: 'Divisions', value: dashboard.totals.divisions },
              { label: 'Teams', value: dashboard.totals.teams },
              { label: 'Matches', value: dashboard.totals.matches_played },
              { label: 'Upcoming', value: dashboard.totals.upcoming_fixtures },
            ]}
          />
        ) : null}
      />

      {leaguesQuery.isLoading || dashboardQuery.isLoading ? (
        <PageSection surface="flat" density="compact"><SkeletonList rows={5} /></PageSection>
      ) : visibleLeagues.length === 0 ? (
        <PageSection surface="flat" density="compact"><EmptyState iconClassName="fa fa-table-tennis" title="No leagues selected" message="Choose leagues to build an active-season overview." /></PageSection>
      ) : error ? (
        <PageSection surface="flat" density="compact"><ErrorState message={error} /></PageSection>
      ) : (
        <>
          {favouriteTeams.length > 0 ? (
            <PageSection surface="flat" density="compact" title="Favourite teams" note={`${favouriteTeams.length} saved`}>
              <DesignList density="compact" divider="hairline" paginate={false}>
                {favouriteTeams.map((team) => (
                  <ListItem
                    key={team.id}
                    leading={<IconCircle iconClassName="fa fa-shield-alt" tone="accent" />}
                    title={team.name}
                    subtitle={[team.leagueName, team.divisionName].filter(Boolean).join(' · ')}
                    trailing={<FavouriteButton size="icon" saved onToggle={() => toggleFavouriteTeam(team)} />}
                    onClick={() => navigateInTab('leagues', `team/${team.id}`)}
                  />
                ))}
              </DesignList>
            </PageSection>
          ) : null}

          <PageSection surface="flat" density="compact" title="Performance" note="Across selected leagues">
            <FilterBar ariaLabel="Performance filters">
              <SegmentedToggle ariaLabel="Choose performance view" value={performanceMode} onChange={setPerformanceMode} options={[{ value: 'players', label: 'Players' }, { value: 'teams', label: 'Teams' }]} />
              {performanceMode === 'players' ? (
                <SegmentedToggle ariaLabel="Choose player ranking" value={playerMode} onChange={setPlayerMode} options={[{ value: 'best', label: 'Best' }, { value: 'active', label: 'Active' }]} />
              ) : null}
            </FilterBar>

            {performanceMode === 'players' ? (
              leadersQuery.isLoading ? <SkeletonList rows={5} /> : players.length === 0 ? (
                <EmptyState iconClassName="fa fa-chart-line" title="Not enough results" message="Players appear after at least five singles." />
              ) : (
                <DesignList density="compact" divider="hairline" paginate={false}>
                  {players.slice(0, 5).map((player, index) => (
                    <ListItem key={player.player_id} leading={<RankBadge>{index + 1}</RankBadge>} title={player.player_name} subtitle={`${player.wins}W · ${player.losses}L · ${player.played} played`} trailing={<Pill tone="accent">{Math.round(player.win_rate)}%</Pill>} onClick={() => navigateInTab('players', `player/${player.player_id}`)} />
                  ))}
                </DesignList>
              )
            ) : dashboard && dashboard.top_teams.length > 0 ? (
              <DesignList density="compact" divider="hairline" paginate={false}>
                {dashboard.top_teams.slice(0, 5).map((team, index) => (
                  <ListItem key={team.team_id} leading={<RankBadge>{index + 1}</RankBadge>} title={team.team_name} subtitle={`${team.league_name} · ${team.division_name} · ${team.won}W ${team.drawn}D ${team.lost}L`} trailing={<Pill tone="accent">{Math.round(team.win_rate)}%</Pill>} onClick={() => navigateInTab('leagues', `team/${team.team_id}`)} />
                ))}
              </DesignList>
            ) : (
              <EmptyState iconClassName="fa fa-shield-alt" title="No team performance" message="Team standings are not available in the selected scope." />
            )}
          </PageSection>

          <PageSection surface="flat" density="compact" title="Across your leagues" note="Latest active-season results">
            {dashboard && dashboard.recent_results.length > 0 ? (
              <DesignList density="compact" divider="hairline" paginate={false}>
                {dashboard.recent_results.slice(0, 6).map((fixture) => (
                  <ListItem key={fixture.fixture_id} leading={<span className="tt-score-badge">{fixture.home_score}–{fixture.away_score}</span>} title={`${fixture.home_team_name ?? 'Home'} vs ${fixture.away_team_name ?? 'Away'}`} subtitle={`${fixture.league_name} · ${fixture.division_name} · ${formatDate(fixture.date_played)}`} onClick={() => navigateInTab('leagues', `fixture/${fixture.fixture_id}`)} />
                ))}
              </DesignList>
            ) : (
              <EmptyState iconClassName="fa fa-calendar-check" title="No recent results" message="Completed active-season fixtures will appear here." />
            )}
          </PageSection>

          <PageSection surface="flat" density="compact" title="League breakdown" note="Standings and history">
            {overviewQuery.isLoading ? <SkeletonList rows={visibleLeagues.length} /> : (
              <DesignList density="compact" divider="hairline" paginate={false}>
                {leagues.map((league) => (
                  <ListItem key={league.id} leading={<IconCircle iconClassName="fa fa-table-tennis" tone="accent" />} title={league.name} subtitle={`${league.season} · ${league.divisions} divisions · ${league.teams} teams · ${league.matches_played} matches`} trailing={<Pill tone="neutral">Explore</Pill>} onClick={() => navigateInTab('leagues', `league/${league.id}`)} />
                ))}
              </DesignList>
            )}
          </PageSection>
        </>
      )}
    </>
  );
}
