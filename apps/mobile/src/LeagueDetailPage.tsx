import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DetailHeader } from './components/DetailHeader';
import { SkeletonList } from './components/Skeleton';
import { useLeagueDashboardQuery, useLeaguesQuery, useStandingsQuery } from './queries';
import { TabShellPage } from './TabShellPage';
import { EmptyState, ErrorState, HeroCard, IconCircle, List, ListItem, Pill, SectionHeader } from './ui/appkit';
import { formatRecord, getQueryError } from './player-shared';
import { useTabNavigation } from './navigation/tab-navigation';
import { FavouriteButton } from './components/FavouriteButton';
import { useFavouriteTeams } from './hooks/useFavouriteTeams';

export function LeagueDetailPage() {
  const { leagueId = '' } = useParams<{ leagueId: string }>();
  const { navigateInTab } = useTabNavigation();
  const { isFavourite: isFavouriteTeam, toggle: toggleFavouriteTeam } = useFavouriteTeams();
  const leaguesQuery = useLeaguesQuery();
  const dashboardQuery = useLeagueDashboardQuery(leagueId, Boolean(leagueId));
  const league = useMemo(
    () => leaguesQuery.data?.data.find((item) => item.id === leagueId) ?? null,
    [leagueId, leaguesQuery.data],
  );
  const [divisionId, setDivisionId] = useState('');
  const [historySeasonId, setHistorySeasonId] = useState('');

  useEffect(() => {
    setDivisionId(league?.divisions[0]?.id ?? '');
  }, [league]);

  const standingsQuery = useStandingsQuery(divisionId, Boolean(divisionId));
  const dashboard = dashboardQuery.data ?? null;
  const selectedSeason = dashboard?.history.find((season) => season.season_id === historySeasonId)
    ?? dashboard?.history[0]
    ?? null;
  const error = getQueryError(dashboardQuery.error) || getQueryError(leaguesQuery.error);

  return (
    <TabShellPage>
      <DetailHeader title={league?.name ?? dashboard?.league.name ?? 'League'} />
      <div className="page-content app-shell-content">
        {dashboardQuery.isLoading || leaguesQuery.isLoading ? (
          <section className="tt-player-section"><SkeletonList rows={6} /></section>
        ) : error || !dashboard || !league ? (
          <ErrorState title="League unavailable" message={error || 'This league could not be loaded.'} />
        ) : (
          <>
            <HeroCard
              eyebrow="League"
              title={league.name}
              summary={`${league.season ?? 'Active season'} · ${league.divisions.length} divisions`}
            />

            <section className="tt-player-section">
              <SectionHeader title="Standings" note="Choose a division" />
              <div className="tt-season-picker" role="group" aria-label="Choose division">
                {league.divisions.map((division) => (
                  <button
                    key={division.id}
                    type="button"
                    className={`tt-season-picker__button${division.id === divisionId ? ' active' : ''}`}
                    aria-pressed={division.id === divisionId}
                    onClick={() => setDivisionId(division.id)}
                  >
                    {division.name}
                  </button>
                ))}
              </div>
              {standingsQuery.isLoading ? <SkeletonList rows={6} /> : standingsQuery.error ? (
                <ErrorState message="Standings are unavailable." />
              ) : (standingsQuery.data?.data ?? []).length === 0 ? (
                <EmptyState iconClassName="fa fa-table" title="No standings" message="This division does not have a table available." />
              ) : (
                <List divider="hairline">
                  {(standingsQuery.data?.data ?? []).map((row) => (
                    <ListItem
                      key={row.team_id}
                      leading={<span className="tt-rank-badge">{row.position}</span>}
                      title={row.team_name}
                      subtitle={formatRecord({ wins: row.won, losses: row.lost, draws: row.drawn ?? 0, played: row.played })}
                      trailing={(
                        <span className="tt-team-roster-trailing">
                          <Pill tone="accent">{row.points} pts</Pill>
                          <FavouriteButton
                            size="icon"
                            saved={isFavouriteTeam(row.team_id)}
                            onToggle={() => toggleFavouriteTeam({
                              id: row.team_id,
                              name: row.team_name,
                              leagueName: league.name,
                              divisionName: league.divisions.find((division) => division.id === divisionId)?.name ?? null,
                            })}
                          />
                        </span>
                      )}
                      onClick={() => navigateInTab('leagues', `team/${row.team_id}`)}
                    />
                  ))}
                </List>
              )}
            </section>

            <section className="tt-player-section">
              <SectionHeader title="Season history" note="Division winners" />
              <div className="tt-season-picker" role="group" aria-label="Choose historical season">
                {dashboard.history.map((season) => (
                  <button
                    key={season.season_id}
                    type="button"
                    className={`tt-season-picker__button${season.season_id === selectedSeason?.season_id ? ' active' : ''}`}
                    aria-pressed={season.season_id === selectedSeason?.season_id}
                    onClick={() => setHistorySeasonId(season.season_id)}
                  >
                    {season.season}
                  </button>
                ))}
              </div>
              {selectedSeason ? (
                <div className="tt-league-history">
                  <div className="tt-league-history__header">
                    <strong>{selectedSeason.season}</strong>
                    {selectedSeason.is_active ? <Pill tone="accent">Current</Pill> : null}
                  </div>
                  <p>{selectedSeason.divisions} divisions · {selectedSeason.teams} teams · {selectedSeason.fixtures} fixtures</p>
                  {selectedSeason.champions.length > 0 ? (
                    <List divider="hairline">
                      {selectedSeason.champions.map((champion) => (
                        <ListItem
                          key={`${selectedSeason.season_id}-${champion.division_name}`}
                          leading={<IconCircle iconClassName="fa fa-trophy" tone="accent" />}
                          title={champion.division_name}
                          subtitle={champion.team_name}
                          hideChevron
                        />
                      ))}
                    </List>
                  ) : <p className="tt-section-meta">Division winners are unavailable.</p>}
                </div>
              ) : null}
            </section>
          </>
        )}
      </div>
    </TabShellPage>
  );
}
