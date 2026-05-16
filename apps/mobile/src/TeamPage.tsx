import { type MouseEvent } from 'react';
import { useParams } from 'react-router-dom';
import { FormResultPills } from './components/FormResultPills';
import { PlayerList } from './components/PlayerList';
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
  AppCard,
  AppCardContent,
  AppHeader,
  AppHeaderSpacer,
  AppListGroup,
  AppListItem,
  AppLoadingCard,
  AppMessageCard,
  AppPageContent,
} from './ui/appkit';

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
          <AppLoadingCard message="Loading team profile..." />
        ) : !summary ? (
          <AppMessageCard
            title="Team not available"
            message={summaryError || 'Failed to load this team profile.'}
            action={{ label: 'Back Home', onClick: goHome }}
          />
        ) : (
          <>
            <AppCard>
              <AppCardContent className="mb-2">
                <div className="d-flex mb-1">
                  <div className="flex-grow-1">
                    <h2 className="mb-1">{summary.name}</h2>
                    <p className="font-11 opacity-60 mb-3">
                      {summary.league_name} · {summary.competition_name} · {summary.season_name}
                    </p>
                  </div>
                  <div className="align-self-center ps-3">
                    <i className="fa fa-shield-alt color-blue-dark font-40" />
                  </div>
                </div>

                {form && (
                  <div className="row text-center row-cols-2 mb-0">
                    <div className="col mb-3">
                      <div className="tt-player-chip">
                        <h5 className="mb-0">{form.position ?? '-'}</h5>
                        <p className="font-12 mb-0">Position</p>
                      </div>
                    </div>
                    <div className="col mb-3">
                      <div className="tt-player-chip">
                        <h5 className="mb-0">{form.points ?? '-'}</h5>
                        <p className="font-12 mb-0">Points</p>
                      </div>
                    </div>
                  </div>
                )}

                {form && form.form && form.form.length > 0 && (
                  <>
                    <p className="font-11 font-700 color-highlight text-uppercase mb-1">Recent Form</p>
                    <FormResultPills
                      results={form.form}
                      loading={formLoading}
                    />
                  </>
                )}
              </AppCardContent>
            </AppCard>

            <AppCard>
              <AppCardContent className="mb-2">
                <div className="d-flex mb-2">
                  <div className="align-self-center">
                    <h1 className="mb-0 font-16">Squad Roster</h1>
                  </div>
                  <div className="ms-auto align-self-center">
                    <span className="font-11 opacity-60">{roster.length} players</span>
                  </div>
                </div>
                {rosterLoading ? (
                  <p className="mb-0"><i className="fa fa-spinner fa-spin me-2" />Loading roster...</p>
                ) : rosterError ? (
                  <p className="mb-0 color-red-dark">Unable to load squad roster.</p>
                ) : roster.length === 0 ? (
                  <p className="mb-0 opacity-60">No players found for this team yet.</p>
                ) : (
                  <PlayerList
                    players={roster.map((p: any) => ({
                      id: p.id,
                      name: p.name,
                      played: p.played,
                      wins: Math.round((p.winRate / 100) * p.played)
                    }))}
                    listClassName="tt-player-search-list"
                    onSelectPlayer={(player) => openPlayer(player.id)}
                    getSubtitle={(player) => {
                      const rosterItem = roster.find((r: any) => r.id === player.id);
                      return `${rosterItem?.winRate ?? 0}% WR • ${player.played} matches`;
                    }}
                  />
                )}
              </AppCardContent>
            </AppCard>

            <AppCard>
              <AppCardContent className="mb-2">
                <div className="d-flex mb-2">
                  <div className="align-self-center">
                    <h1 className="mb-0 font-16">Recent Matches</h1>
                  </div>
                  <div className="ms-auto align-self-center">
                    <span className="font-11 opacity-60">{fixtures.length} matches</span>
                  </div>
                </div>
                {fixturesLoading ? (
                  <p className="mb-0"><i className="fa fa-spinner fa-spin me-2" />Loading matches...</p>
                ) : fixturesError ? (
                  <p className="mb-0 color-red-dark">Unable to load recent matches.</p>
                ) : fixtures.length === 0 ? (
                  <p className="mb-0 opacity-60">No recent matches found.</p>
                ) : (
                  <AppListGroup size="large" className="tt-match-history-list">
                    {fixtures.map((fixture: any, index: number) => (
                      <AppListItem
                        key={fixture.id}
                        iconClassName="fa fa-table-tennis rounded-xl bg-blue-dark color-white"
                        title={`${fixture.home_team_name} v ${fixture.away_team_name}`}
                        subtitle={`${formatMatchDate(fixture.date_played)} · ${fixture.round_name ?? fixture.status}`}
                        onClick={() => openFixture(fixture.id)}
                        borderless={index === fixtures.length - 1}
                      />
                    ))}
                  </AppListGroup>
                )}
              </AppCardContent>
            </AppCard>
          </>
        )}
      </AppPageContent>
    </TabShellPage>
  );
}
