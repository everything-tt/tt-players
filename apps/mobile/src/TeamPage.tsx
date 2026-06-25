import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FormResultPills } from './components/FormResultPills';
import { SectionSkeleton, SkeletonBlock, SkeletonList } from './components/Skeleton';
import { useTabNavigation } from './navigation/tab-navigation';
import { formatMatchDate, getInitials, getQueryError } from './player-shared';
import {
  useTeamFixturesQuery,
  useTeamFormQuery,
  useTeamRosterQuery,
  useTeamSummaryQuery,
} from './queries';
import { TabShellPage } from './TabShellPage';
import { DetailHeader } from './components/DetailHeader';
import { buildTeamShareTarget } from './share-target';
import { FavouriteButton } from './components/FavouriteButton';
import { useFavouritePlayers } from './hooks/useFavouritePlayers';
import { useFavouriteTeams } from './hooks/useFavouriteTeams';
import {
  List,
  ListItem,
  IconCircle,
  Avatar,
  EmptyState,
  ErrorState,
  SectionHeader,
  HeroCard,
  OutcomeBadge,
  Pill,
  SegmentedToggle,
} from './ui/appkit';

type RosterSort = 'played' | 'winRate';
type MatchFilter = 'all' | 'home' | 'away' | 'wins' | 'losses' | 'draws';

function TeamPageSkeleton() {
  return (
    <>
      <section className="tt-hero" aria-label="Loading team profile">
        <div className="tt-hero__top">
          <div className="tt-hero__copy">
            <SkeletonBlock className="tt-skeleton-eyebrow" />
            <SkeletonBlock className="tt-skeleton-title" />
            <SkeletonBlock className="tt-skeleton-text mt-2" />
          </div>
          <SkeletonBlock className="tt-skeleton-avatar" />
        </div>
      </section>
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
  const summaryError = teamId ? getQueryError(summaryQuery.error) : 'Missing team id';
  const summaryLoading = summaryQuery.isLoading;

  const form = formQuery.data ?? null;
  const formLoading = formQuery.isLoading;

  const roster = rosterQuery.data?.data ?? [];
  const sortedRoster = useMemo(
    () => [...roster].sort((a, b) => rosterSort === 'played'
      ? b.played - a.played || b.winRate - a.winRate || a.name.localeCompare(b.name)
      : b.winRate - a.winRate || b.played - a.played || a.name.localeCompare(b.name)),
    [roster, rosterSort],
  );
  const rosterLoading = rosterQuery.isLoading;
  const rosterError = getQueryError(rosterQuery.error);

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
  const fixturesLoading = fixturesQuery.isLoading;
  const fixturesError = getQueryError(fixturesQuery.error);
  const shareTarget = summary
    ? buildTeamShareTarget(window.location.origin, summary.id, summary.name)
    : null;

  return (
    <TabShellPage>
      <DetailHeader title={summary?.name ?? 'Team'} shareTarget={shareTarget} />
      <div className="page-content app-shell-content">
        {summaryLoading ? (
          <TeamPageSkeleton />
        ) : !summary ? (
          <ErrorState title="Team not available" message={summaryError || 'Failed to load this team profile.'} onRetry={() => switchTab('home', 'root')} />
        ) : (
          <>
            <HeroCard
              className="tt-team-hero"
              eyebrow="Team"
              title={summary.name}
              summary={`${summary.league_name ?? '—'} · ${summary.competition_name ?? '—'} · ${summary.season_name ?? '—'}`}
              actions={(
                <FavouriteButton
                  saved={isFavouriteTeam(summary.id)}
                  onToggle={() => toggleFavouriteTeam({
                    id: summary.id,
                    name: summary.name,
                    leagueName: summary.league_name,
                    divisionName: summary.competition_name,
                  })}
                />
              )}
            >
              {form ? (
                <div className="tt-team-spotlight">
                  <div className="tt-team-metric">
                    <span className="tt-team-metric-value">{form.position ?? '-'}</span>
                    <span className="tt-team-metric-label">Position</span>
                  </div>
                  <div className="tt-team-metric">
                    <span className="tt-team-metric-value">{form.points ?? '-'}</span>
                    <span className="tt-team-metric-label">Points</span>
                  </div>
                </div>
              ) : null}
              {form && form.form && form.form.length > 0 ? (
                <FormResultPills results={form.form} label={null} loading={formLoading} />
              ) : null}
            </HeroCard>

            <section className="tt-player-section" aria-labelledby="tt-team-roster-title">
              <SectionHeader title="Squad roster" note={`${roster.length} players`} />
              <div className="tt-team-roster-controls">
                <span>Sort by</span>
                <SegmentedToggle
                  ariaLabel="Sort squad roster"
                  value={rosterSort}
                  onChange={setRosterSort}
                  options={[
                    { value: 'played', label: 'Played' },
                    { value: 'winRate', label: 'Win rate' },
                  ]}
                />
              </div>
              {rosterLoading ? (
                <SkeletonList rows={4} />
              ) : rosterError ? (
                <ErrorState message="Unable to load squad roster." />
              ) : roster.length === 0 ? (
                <EmptyState iconClassName="fa fa-users" title="No players" message="No players found for this team yet." />
              ) : (
                <List divider="hairline">
                  {sortedRoster.map((player) => (
                    <ListItem
                      key={player.id}
                      leading={<Avatar text={getInitials(player.name)} />}
                      title={player.name}
                      subtitle={`${player.wins} wins · ${player.played} played`}
                      trailing={(
                        <span className="tt-team-roster-trailing">
                          <Pill tone="accent">{player.winRate ?? 0}%</Pill>
                          <FavouriteButton
                            size="icon"
                            saved={isFavouritePlayer(player.id)}
                            onToggle={() => toggleFavouritePlayer({
                              id: player.id,
                              name: player.name,
                              played: player.played,
                              wins: player.wins,
                            })}
                          />
                        </span>
                      )}
                      onClick={() => navigateInActiveTab(`player/${player.id}`)}
                      hideChevron
                    />
                  ))}
                </List>
              )}
            </section>

            <section className="tt-player-section" aria-labelledby="tt-team-matches-title">
              <SectionHeader title="Matches" note={`${filteredFixtures.length} of ${fixtureTotal}`} />
              <div className="tt-team-match-filters">
                <span>Filter by</span>
                <div className="tt-team-match-filters__scroll">
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
                </div>
              </div>
              {fixturesLoading ? (
                <SkeletonList rows={4} />
              ) : fixturesError ? (
                <ErrorState message="Unable to load recent matches." />
              ) : fixtures.length === 0 ? (
                <EmptyState iconClassName="fa fa-table-tennis" title="No recent matches" message="No recent matches found." />
              ) : filteredFixtures.length === 0 ? (
                <EmptyState iconClassName="fa fa-filter" title="No matching fixtures" message="No fixtures match this filter." />
              ) : (
                <List divider="hairline">
                  {filteredFixtures.map(({ fixture, isHome, teamScore, opponentScore, result }) => {
                    const opponent = isHome ? fixture.away_team_name : fixture.home_team_name;
                    const score = teamScore === null || opponentScore === null ? null : `${teamScore}–${opponentScore}`;
                    return (
                      <ListItem
                        key={fixture.id}
                        leading={result
                          ? <OutcomeBadge result={result} variant="icon" />
                          : <IconCircle iconClassName="fa fa-calendar" tone="neutral" />}
                        title={opponent ? `${isHome ? 'Home' : 'Away'} vs ${opponent}` : `${fixture.home_team_name} vs ${fixture.away_team_name}`}
                        subtitle={`${formatMatchDate(fixture.date_played)} · ${fixture.round_name ?? fixture.status}`}
                        trailing={score ? <Pill tone={result === 'W' ? 'accent' : 'neutral'}>{score}</Pill> : <Pill tone="neutral">{fixture.status}</Pill>}
                        onClick={() => navigateInActiveTab(`fixture/${fixture.id}`)}
                      />
                    );
                  })}
                </List>
              )}
            </section>
          </>
        )}
      </div>
    </TabShellPage>
  );
}
