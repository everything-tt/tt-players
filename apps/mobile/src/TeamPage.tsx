import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FormResultPills } from './components/FormResultPills';
import { SectionSkeleton, SkeletonBlock, SkeletonList } from './components/Skeleton';
import { useTabNavigation } from './navigation/tab-navigation';
import { formatMatchDate, getInitials, getQueryError } from './player-shared';
import { perspectiveScore } from './match-record';
import { useTeamFixturesQuery, useTeamFormQuery, useTeamRosterQuery, useTeamSummaryQuery } from './queries';
import { TabShellPage } from './TabShellPage';
import { DetailHeader } from './components/DetailHeader';
import { buildTeamShareTarget } from './share-target';
import { FavouriteButton } from './components/FavouriteButton';
import { useFavouritePlayers } from './hooks/useFavouritePlayers';
import { useFavouriteTeams } from './hooks/useFavouriteTeams';
import {
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
  PageSection,
  Pill,
  SegmentedToggle,
} from './ui/appkit';

type RosterSort = 'played' | 'winRate';
type MatchFilter = 'all' | 'home' | 'away' | 'wins' | 'losses' | 'draws';

function TeamPageSkeleton() {
  return (
    <>
      <EntityHero
        eyebrow="Team"
        title={<SkeletonBlock className="tt-skeleton-title" />}
        subtitle={<SkeletonBlock className="tt-skeleton-text" />}
        leading={<SkeletonBlock className="tt-skeleton-avatar" />}
      />
      <SectionSkeleton rows={4} />
      <SectionSkeleton rows={4} />
    </>
  );
}

export function TeamPage() {
  const { navigateInActiveTab, switchTab } = useTabNavigation();
  const { teamId = '' } = useParams<{ teamId: string }>();
  const [rosterSort, setRosterSort] = useState<RosterSort>('played');
  const [matchFilter, setMatchFilter] = useState<MatchFilter>('all');
  const { isFavourite: isFavouritePlayer, toggle: toggleFavouritePlayer } = useFavouritePlayers();
  const { isFavourite: isFavouriteTeam, toggle: toggleFavouriteTeam } = useFavouriteTeams();

  const summaryQuery = useTeamSummaryQuery(teamId, Boolean(teamId));
  const formQuery = useTeamFormQuery(teamId, Boolean(teamId));
  const rosterQuery = useTeamRosterQuery(teamId, Boolean(teamId));
  const fixturesQuery = useTeamFixturesQuery(teamId, 100, 0, Boolean(teamId));

  const summary = summaryQuery.data ?? null;
  const form = formQuery.data ?? null;
  const roster = rosterQuery.data?.data ?? [];
  const sortedRoster = useMemo(
    () => [...roster].sort((a, b) => rosterSort === 'played'
      ? b.played - a.played || b.winRate - a.winRate || a.name.localeCompare(b.name)
      : b.winRate - a.winRate || b.played - a.played || a.name.localeCompare(b.name)),
    [roster, rosterSort],
  );

  const fixtures = fixturesQuery.data?.data ?? [];
  const fixtureTotal = fixturesQuery.data?.total ?? fixtures.length;
  const fixturesWithContext = useMemo(() => fixtures.map((fixture) => {
    const isHome = fixture.home_team_id === teamId;
    const teamScore = isHome ? fixture.home_score : fixture.away_score;
    const opponentScore = isHome ? fixture.away_score : fixture.home_score;
    const result = fixture.status !== 'completed' || teamScore === null || opponentScore === null
      ? null
      : teamScore > opponentScore ? 'W' as const : teamScore < opponentScore ? 'L' as const : 'D' as const;
    return { fixture, isHome, teamScore, opponentScore, result };
  }), [fixtures, teamId]);
  const filteredFixtures = useMemo(() => fixturesWithContext.filter(({ isHome, result }) => {
    if (matchFilter === 'home') return isHome;
    if (matchFilter === 'away') return !isHome;
    if (matchFilter === 'wins') return result === 'W';
    if (matchFilter === 'losses') return result === 'L';
    if (matchFilter === 'draws') return result === 'D';
    return true;
  }), [fixturesWithContext, matchFilter]);

  const shareTarget = summary ? buildTeamShareTarget(window.location.origin, summary.id, summary.name) : null;

  return (
    <TabShellPage>
      <DetailHeader title={summary?.name ?? 'Team'} shareTarget={shareTarget} />
      <div className="page-content app-shell-content">
        {summaryQuery.isLoading ? (
          <TeamPageSkeleton />
        ) : !summary ? (
          <ErrorState title="Team not available" message={getQueryError(summaryQuery.error) || 'Failed to load this team profile.'} onRetry={() => switchTab('home', 'root')} />
        ) : (
          <>
            <EntityHero
              eyebrow="Team"
              title={summary.name}
              subtitle={`${summary.league_name ?? '—'} · ${summary.competition_name ?? '—'} · ${summary.season_name ?? '—'}`}
              actions={(
                <FavouriteButton
                  saved={isFavouriteTeam(summary.id)}
                  onToggle={() => toggleFavouriteTeam({ id: summary.id, name: summary.name, leagueName: summary.league_name, divisionName: summary.competition_name })}
                />
              )}
              highlights={(
                <>
                  {form ? (
                    <MetricGrid
                      density="compact"
                      metrics={[
                        { label: 'Position', value: form.position ?? '-' },
                        { label: 'Points', value: form.points ?? '-' },
                      ]}
                    />
                  ) : null}
                  {form?.form?.length ? <FormResultPills results={form.form} label={null} loading={formQuery.isLoading} /> : null}
                </>
              )}
            />

            <PageSection surface="flat" density="compact" title="Squad roster" note={`${roster.length} players`}>
              <FilterBar ariaLabel="Roster sort">
                <span>Sort by</span>
                <SegmentedToggle
                  ariaLabel="Sort squad roster"
                  value={rosterSort}
                  onChange={setRosterSort}
                  options={[{ value: 'played', label: 'Played' }, { value: 'winRate', label: 'Win rate' }]}
                />
              </FilterBar>
              {rosterQuery.isLoading ? (
                <SkeletonList rows={4} />
              ) : getQueryError(rosterQuery.error) ? (
                <ErrorState message="Unable to load squad roster." />
              ) : roster.length === 0 ? (
                <EmptyState iconClassName="fa fa-users" title="No players" message="No players found for this team yet." />
              ) : (
                <DesignList density="compact" divider="hairline" paginate={false}>
                  {sortedRoster.map((player) => (
                    <ListItem
                      key={player.id}
                      leading={<DesignAvatar size="compact" text={getInitials(player.name)} />}
                      title={player.name}
                      subtitle={`${player.wins} wins · ${player.played} played`}
                      trailing={(
                        <span className="tt-team-roster-trailing">
                          <Pill tone="accent">{player.winRate ?? 0}%</Pill>
                          <FavouriteButton size="icon" saved={isFavouritePlayer(player.id)} onToggle={() => toggleFavouritePlayer({ id: player.id, name: player.name, played: player.played, wins: player.wins })} />
                        </span>
                      )}
                      onClick={() => navigateInActiveTab(`player/${player.id}`)}
                      hideChevron
                    />
                  ))}
                </DesignList>
              )}
            </PageSection>

            <PageSection surface="flat" density="compact" title="Matches" note={`${filteredFixtures.length} of ${fixtureTotal}`}>
              <FilterBar ariaLabel="Team match filters">
                <span>Filter by</span>
                <SegmentedToggle
                  ariaLabel="Filter team matches"
                  value={matchFilter}
                  onChange={setMatchFilter}
                  options={[
                    { value: 'all', label: 'ALL' },
                    { value: 'home', label: 'H' },
                    { value: 'away', label: 'A' },
                    { value: 'wins', label: 'W' },
                    { value: 'draws', label: 'D' },
                    { value: 'losses', label: 'L' },
                  ]}
                />
              </FilterBar>
              {fixturesQuery.isLoading ? (
                <SkeletonList rows={4} />
              ) : getQueryError(fixturesQuery.error) ? (
                <ErrorState message="Unable to load recent matches." />
              ) : fixtures.length === 0 ? (
                <EmptyState iconClassName="fa fa-table-tennis" title="No recent matches" message="No recent matches found." />
              ) : filteredFixtures.length === 0 ? (
                <EmptyState iconClassName="fa fa-filter" title="No matching fixtures" message="No fixtures match this filter." />
              ) : (
                <DesignList density="compact" divider="hairline" paginate={false}>
                  {filteredFixtures.map(({ fixture, isHome, teamScore, opponentScore, result }) => {
                    const opponent = isHome ? fixture.away_team_name : fixture.home_team_name;
                    const title = opponent
                      ? `${isHome ? 'Home' : 'Away'} vs ${opponent}`
                      : `${fixture.home_team_name ?? 'Home'} vs ${fixture.away_team_name ?? 'Away'}`;
                    const score = perspectiveScore(teamScore, opponentScore, result);

                    if (fixture.status === 'completed' && score) {
                      return (
                        <MatchRecordRow
                          key={fixture.id}
                          score={score}
                          title={title}
                          metadata={[formatMatchDate(fixture.date_played), fixture.round_name ?? 'Completed']}
                          onClick={() => navigateInActiveTab(`fixture/${fixture.id}`)}
                        />
                      );
                    }

                    return (
                      <ListItem
                        key={fixture.id}
                        leading={<IconCircle iconClassName="fa fa-calendar" tone="neutral" />}
                        title={title}
                        subtitle={`${formatMatchDate(fixture.date_played)} · ${fixture.round_name ?? fixture.status}`}
                        trailing={<Pill tone="neutral">{fixture.status}</Pill>}
                        onClick={() => navigateInActiveTab(`fixture/${fixture.id}`)}
                      />
                    );
                  })}
                </DesignList>
              )}
            </PageSection>
          </>
        )}
      </div>
    </TabShellPage>
  );
}
