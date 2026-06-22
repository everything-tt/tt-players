import { type MouseEvent } from 'react';
import { useParams } from 'react-router-dom';
import { FormResultPills } from './components/FormResultPills';
import { SectionSkeleton, SkeletonBlock, SkeletonList } from './components/Skeleton';
import { usePageNavigation } from './hooks/usePageNavigation';
import { formatMatchDate } from './player-shared';
import {
  useTeamFixturesQuery,
  useTeamFormQuery,
  useTeamRosterQuery,
  useTeamSummaryQuery,
} from './queries';
import { TabShellPage } from './TabShellPage';
import {
  AppHeader,
  AppHeaderSpacer,
  AppListGroup,
  AppListItem,
  AppMessageCard,
  AppPageContent,
  AppPlayerList,
} from './ui/appkit';

function TeamPageSkeleton() {
  return (
    <>
      <section className="tt-team-hero" aria-label="Loading team profile">
        <div className="tt-team-hero-top">
          <div className="tt-team-hero-copy">
            <SkeletonBlock className="tt-skeleton-eyebrow" />
            <SkeletonBlock className="tt-skeleton-title" />
            <SkeletonBlock className="tt-skeleton-text mt-2" />
          </div>
          <SkeletonBlock className="tt-skeleton-avatar" />
        </div>
        <div className="tt-team-spotlight">
          <div className="tt-team-metric"><SkeletonBlock className="tt-skeleton-stat" /></div>
          <div className="tt-team-metric"><SkeletonBlock className="tt-skeleton-stat" /></div>
        </div>
      </section>

      <SectionSkeleton rows={4} />
      <SectionSkeleton rows={4} />
    </>
  );
}

export function TeamPage() {
  const { goBackInActiveTab, navigateInActiveTab, switchTab } = usePageNavigation();
  const { teamId = '' } = useParams<{ teamId: string }>();

  const summaryQuery = useTeamSummaryQuery(teamId, Boolean(teamId));
  const formQuery = useTeamFormQuery(teamId, Boolean(teamId));
  const rosterQuery = useTeamRosterQuery(teamId, Boolean(teamId));
  const fixturesQuery = useTeamFixturesQuery(teamId, 20, 0, Boolean(teamId));

  const summary = summaryQuery.data ?? null;
  const summaryError = teamId
    ? (summaryQuery.error instanceof Error ? summaryQuery.error.message : null)
    : 'Missing team id';
  const summaryLoading = summaryQuery.isLoading;

  const form = formQuery.data ?? null;
  const formLoading = formQuery.isLoading;

  const roster = rosterQuery.data?.data ?? [];
  const rosterLoading = rosterQuery.isLoading;
  const rosterError = rosterQuery.error instanceof Error ? rosterQuery.error.message : null;

  const fixtures = fixturesQuery.data?.data ?? [];
  const fixturesLoading = fixturesQuery.isLoading;
  const fixturesError = fixturesQuery.error instanceof Error ? fixturesQuery.error.message : null;

  const goBack = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    goBackInActiveTab();
  };

  const goHome = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    switchTab('home', 'root');
  };

  const openPlayer = (playerId: string) => {
    navigateInActiveTab(`player/${playerId}`);
  };

  const openFixture = (fixtureId: string) => {
    navigateInActiveTab(`fixture/${fixtureId}`);
  };

  return (
    <TabShellPage>
      <AppHeader
        title={summary?.name ?? 'Team Hub'}
        onTitleClick={goHome}
        leftAction={{ iconClassName: 'fas fa-chevron-left', onClick: goBack, position: 1, ariaLabel: 'Back' }}
        rightAction={{ iconClassName: 'fas fa-home', onClick: goHome, position: 4, ariaLabel: 'Home' }}
      />
      <AppHeaderSpacer />

      <AppPageContent>
        {summaryLoading ? (
          <TeamPageSkeleton />
        ) : !summary ? (
          <AppMessageCard
            title="Team not available"
            message={summaryError || 'Failed to load this team profile.'}
            action={{ label: 'Back Home', onClick: goHome }}
          />
        ) : (
          <>
            <section className="tt-team-hero" aria-labelledby="tt-team-title">
              <div className="tt-team-hero-top">
                <div className="tt-team-hero-copy">
                  <p className="tt-player-eyebrow">Team profile</p>
                  <h1 id="tt-team-title" className="tt-team-title">{summary.name}</h1>
                  <p className="tt-team-summary-line">
                    {summary.league_name} · {summary.competition_name} · {summary.season_name}
                  </p>
                </div>
                <div className="tt-team-icon" aria-hidden="true">
                  <i className="fa fa-shield-alt" />
                </div>
              </div>

              {form ? (
                <div className="tt-team-spotlight" aria-label="Team summary">
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
                <FormResultPills
                  results={form.form}
                  loading={formLoading}
                />
              ) : null}
            </section>

            <section className="tt-player-section" aria-labelledby="tt-team-roster-title">
                <div className="tt-player-section-header">
                  <h2 id="tt-team-roster-title" className="tt-player-section-title">Squad Roster</h2>
                  <span className="tt-player-section-note">{roster.length} players</span>
                </div>
                {rosterLoading ? (
                  <SkeletonList rows={4} />
                ) : rosterError ? (
                  <p className="tt-player-section-state tt-player-section-error">Unable to load squad roster.</p>
                ) : roster.length === 0 ? (
                  <p className="tt-player-section-state">No players found for this team yet.</p>
                ) : (
                  <AppPlayerList
                    items={roster.map((player: any) => ({
                      id: player.id,
                      name: player.name,
                      subtitle: `${player.winRate ?? 0}% WR · ${player.played} matches`,
                    }))}
                    onSelectItem={(item) => openPlayer(item.id)}
                    listClassName="tt-player-search-list"
                  />
                )}
            </section>

            <section className="tt-player-section" aria-labelledby="tt-team-matches-title">
                <div className="tt-player-section-header">
                  <h2 id="tt-team-matches-title" className="tt-player-section-title">Recent Matches</h2>
                  <span className="tt-player-section-note">{fixtures.length} matches</span>
                </div>
                {fixturesLoading ? (
                  <SkeletonList rows={4} />
                ) : fixturesError ? (
                  <p className="tt-player-section-state tt-player-section-error">Unable to load recent matches.</p>
                ) : fixtures.length === 0 ? (
                  <p className="tt-player-section-state">No recent matches found.</p>
                ) : (
                  <AppListGroup size="large" className="tt-player-list">
                    {fixtures.map((fixture: any, index: number) => (
                      <AppListItem
                        key={fixture.id}
                        iconClassName="fa fa-table-tennis rounded-xl tt-icon-team"
                        title={`${fixture.home_team_name} v ${fixture.away_team_name}`}
                        subtitle={`${formatMatchDate(fixture.date_played)} · ${fixture.round_name ?? fixture.status}`}
                        onClick={(event) => {
                          event.preventDefault();
                          openFixture(fixture.id);
                        }}
                        borderless={index === fixtures.length - 1}
                      />
                    ))}
                  </AppListGroup>
                )}
            </section>
          </>
        )}
      </AppPageContent>
    </TabShellPage>
  );
}
