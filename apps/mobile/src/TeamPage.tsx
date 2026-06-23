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
import {
  List,
  ListItem,
  IconCircle,
  Avatar,
  EmptyState,
  ErrorState,
  SectionHeader,
  HeroCard,
} from './ui/appkit';

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

  const summaryQuery = useTeamSummaryQuery(teamId, Boolean(teamId));
  const formQuery = useTeamFormQuery(teamId, Boolean(teamId));
  const rosterQuery = useTeamRosterQuery(teamId, Boolean(teamId));
  const fixturesQuery = useTeamFixturesQuery(teamId, 20, 0, Boolean(teamId));

  const summary = summaryQuery.data ?? null;
  const summaryError = teamId ? getQueryError(summaryQuery.error) : 'Missing team id';
  const summaryLoading = summaryQuery.isLoading;

  const form = formQuery.data ?? null;
  const formLoading = formQuery.isLoading;

  const roster = rosterQuery.data?.data ?? [];
  const rosterLoading = rosterQuery.isLoading;
  const rosterError = getQueryError(rosterQuery.error);

  const fixtures = fixturesQuery.data?.data ?? [];
  const fixturesLoading = fixturesQuery.isLoading;
  const fixturesError = getQueryError(fixturesQuery.error);

  return (
    <TabShellPage>
      <DetailHeader title={summary?.name ?? 'Team'} />
      <div className="page-content app-shell-content">
        {summaryLoading ? (
          <TeamPageSkeleton />
        ) : !summary ? (
          <ErrorState title="Team not available" message={summaryError || 'Failed to load this team profile.'} onRetry={() => switchTab('home', 'root')} />
        ) : (
          <>
            <HeroCard
              eyebrow="Team"
              title={summary.name}
              summary={`${summary.league_name ?? '—'} · ${summary.competition_name ?? '—'} · ${summary.season_name ?? '—'}`}
              actions={<span className="tt-team-icon"><i className="fa fa-shield-alt" /></span>}
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
              {form && form.form && form.form.length > 0 ? <FormResultPills results={form.form} loading={formLoading} /> : null}
            </HeroCard>

            <section className="tt-player-section" aria-labelledby="tt-team-roster-title">
              <SectionHeader title="Squad Roster" note={`${roster.length} players`} />
              {rosterLoading ? (
                <SkeletonList rows={4} />
              ) : rosterError ? (
                <ErrorState message="Unable to load squad roster." />
              ) : roster.length === 0 ? (
                <EmptyState iconClassName="fa fa-users" title="No players" message="No players found for this team yet." />
              ) : (
                <List divider="hairline">
                  {roster.map((player: any) => (
                    <ListItem
                      key={player.id}
                      leading={<Avatar text={getInitials(player.name)} />}
                      title={player.name}
                      subtitle={`${player.winRate ?? 0}% WR · ${player.played} matches`}
                      onClick={() => navigateInActiveTab(`player/${player.id}`)}
                      hideChevron
                    />
                  ))}
                </List>
              )}
            </section>

            <section className="tt-player-section" aria-labelledby="tt-team-matches-title">
              <SectionHeader title="Recent Matches" note={`${fixtures.length} matches`} />
              {fixturesLoading ? (
                <SkeletonList rows={4} />
              ) : fixturesError ? (
                <ErrorState message="Unable to load recent matches." />
              ) : fixtures.length === 0 ? (
                <EmptyState iconClassName="fa fa-table-tennis" title="No recent matches" message="No recent matches found." />
              ) : (
                <List divider="hairline">
                  {fixtures.map((fixture: any) => (
                    <ListItem
                      key={fixture.id}
                      leading={<IconCircle iconClassName="fa fa-table-tennis" tone="accent" />}
                      title={`${fixture.home_team_name} v ${fixture.away_team_name}`}
                      subtitle={`${formatMatchDate(fixture.date_played)} · ${fixture.round_name ?? fixture.status}`}
                      onClick={() => navigateInActiveTab(`fixture/${fixture.id}`)}
                      hideChevron
                    />
                  ))}
                </List>
              )}
            </section>
          </>
        )}
      </div>
    </TabShellPage>
  );
}
