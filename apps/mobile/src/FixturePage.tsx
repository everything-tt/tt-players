import { useMemo, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { SkeletonBlock } from './components/Skeleton';
import { useTabNavigation } from './navigation/tab-navigation';
import { formatDate, getQueryError } from './player-shared';
import { useFixtureRubbersQuery } from './queries';
import { TabShellPage } from './TabShellPage';
import { DetailHeader } from './components/DetailHeader';
import {
  AppPageContent,
  EmptyState,
  EntityHero,
  ErrorState,
  ExternalLinkButton,
  MetricGrid,
  PageSection,
} from './ui/appkit';

function FixturePageSkeleton() {
  return (
    <>
      <EntityHero
        eyebrow="Fixture"
        title={<SkeletonBlock className="tt-skeleton-title" />}
        subtitle={<SkeletonBlock className="tt-skeleton-text" />}
      />
      <PageSection surface="flat" density="compact" title={<SkeletonBlock className="tt-skeleton-text" />} note={<SkeletonBlock className="tt-skeleton-text app-skeleton-short" />}>
        <div className="tt-rubber-list">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="tt-rubber-item">
              <SkeletonBlock className="tt-skeleton-text app-skeleton-short" />
              <div className="tt-rubber-scorecard">
                <SkeletonBlock className="tt-skeleton-text" />
                <SkeletonBlock className="tt-skeleton-pill" />
                <SkeletonBlock className="tt-skeleton-text" />
              </div>
            </div>
          ))}
        </div>
      </PageSection>
    </>
  );
}

export function FixturePage() {
  const { navigateInActiveTab } = useTabNavigation();
  const { fixtureId = '' } = useParams<{ fixtureId: string }>();
  const rubbersQuery = useFixtureRubbersQuery(fixtureId, Boolean(fixtureId));
  const rubbers = rubbersQuery.data?.data ?? [];
  const fixtureMeta = rubbersQuery.data?.fixture;
  const pageError = getQueryError(rubbersQuery.error);

  const [homeScore, awayScore] = useMemo(() => {
    let home = 0;
    let away = 0;
    for (const rubber of rubbers) {
      if (rubber.home_games_won > rubber.away_games_won) home += 1;
      if (rubber.away_games_won > rubber.home_games_won) away += 1;
    }
    return [home, away];
  }, [rubbers]);

  const openPlayer = (playerId: string | null) => playerId && navigateInActiveTab(`player/${playerId}`);
  const openTeam = (teamId: string | null) => teamId && navigateInActiveTab(`team/${teamId}`);
  const winnerName = homeScore > awayScore ? fixtureMeta?.home_team_name : awayScore > homeScore ? fixtureMeta?.away_team_name : null;
  const resultSummary = rubbers.length === 0 ? 'Result unavailable' : winnerName ? `${winnerName} won ${Math.max(homeScore, awayScore)}–${Math.min(homeScore, awayScore)}` : `Drawn ${homeScore}–${awayScore}`;

  const renderPlayers = (players: Array<{ id: string | null; name: string | null }>, winner: boolean): ReactNode => players.map((player, index) => (
    <span key={player.id ?? player.name ?? index}>
      {index > 0 ? <span className="tt-player-separator"> &amp; </span> : null}
      {player.id ? (
        <button type="button" className={`tt-rubber-player-link-text${winner ? ' is-winner' : ''}`} onClick={() => openPlayer(player.id)}>{player.name}</button>
      ) : (
        <span className={`tt-rubber-player-name${winner ? ' is-winner' : ''}`}>{player.name}</span>
      )}
    </span>
  ));

  return (
    <TabShellPage>
      <DetailHeader title="Fixture Details" />
      <AppPageContent>
        {!fixtureId ? (
          <ErrorState title="Missing fixture" message="Fixture id is missing from the route." />
        ) : rubbersQuery.isLoading && !fixtureMeta ? (
          <FixturePageSkeleton />
        ) : !fixtureMeta ? (
          <ErrorState title="Fixture unavailable" message={pageError ?? 'Failed to load this fixture.'} />
        ) : (
          <>
            <EntityHero
              eyebrow="Fixture"
              title={`${fixtureMeta.home_team_name ?? 'Home'} vs ${fixtureMeta.away_team_name ?? 'Away'}`}
              subtitle={<>{fixtureMeta.league_name} · {fixtureMeta.division_name}<br />{formatDate(fixtureMeta.played_at ?? '')}</>}
              actions={fixtureMeta.source_url ? <ExternalLinkButton href={fixtureMeta.source_url} iconClassName="fa fa-globe" aria-label="Open source fixture" /> : null}
              highlights={rubbers.length > 0 ? (
                <>
                  <MetricGrid
                    density="compact"
                    ariaLabel={`Match score. ${resultSummary}`}
                    metrics={[
                      { label: fixtureMeta.home_team_name, value: <button type="button" className={homeScore > awayScore ? 'is-winner' : ''} onClick={() => openTeam(fixtureMeta.home_team_id)} disabled={!fixtureMeta.home_team_id}>{homeScore}</button> },
                      { label: fixtureMeta.away_team_name, value: <button type="button" className={awayScore > homeScore ? 'is-winner' : ''} onClick={() => openTeam(fixtureMeta.away_team_id)} disabled={!fixtureMeta.away_team_id}>{awayScore}</button> },
                    ]}
                  />
                  <p className="tt-fixture-result-summary">{resultSummary}</p>
                </>
              ) : null}
            />

            <PageSection surface="flat" density="compact" title="Rubbers" note={`${rubbers.length} played`}>
              {rubbersQuery.isLoading ? (
                <FixturePageSkeleton />
              ) : rubbersQuery.error ? (
                <ErrorState message="Failed to load fixture details." />
              ) : rubbers.length === 0 ? (
                <EmptyState iconClassName="fa fa-table-tennis" title="No matches" message="No matches found for this fixture." />
              ) : (
                <div className="tt-rubber-list">
                  {rubbers.map((rubber: any, index: number) => {
                    const homePlayers = [{ id: rubber.home_player_1_id, name: rubber.home_player_1_name }, ...(rubber.is_doubles ? [{ id: rubber.home_player_2_id, name: rubber.home_player_2_name }] : [])].filter((player) => Boolean(player.name));
                    const awayPlayers = [{ id: rubber.away_player_1_id, name: rubber.away_player_1_name }, ...(rubber.is_doubles ? [{ id: rubber.away_player_2_id, name: rubber.away_player_2_name }] : [])].filter((player) => Boolean(player.name));
                    const homeWon = rubber.home_games_won > rubber.away_games_won;
                    const awayWon = rubber.away_games_won > rubber.home_games_won;
                    return (
                      <div key={rubber.id} className="tt-rubber-item">
                        <div className="tt-rubber-heading"><span>Rubber {index + 1}</span><span>{rubber.is_doubles ? 'Doubles' : 'Singles'}</span></div>
                        <div className="tt-rubber-scorecard">
                          <div className={`tt-rubber-side home${homeWon ? ' is-winner' : ''}`}>{renderPlayers(homePlayers, homeWon)}</div>
                          <div className="tt-rubber-score-pill" aria-label={`${rubber.home_games_won} games to ${rubber.away_games_won}`}>
                            <span className={homeWon ? 'is-winner' : ''}>{rubber.home_games_won}</span><span className="score-divider">:</span><span className={awayWon ? 'is-winner' : ''}>{rubber.away_games_won}</span>
                          </div>
                          <div className={`tt-rubber-side away${awayWon ? ' is-winner' : ''}`}>{renderPlayers(awayPlayers, awayWon)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </PageSection>
          </>
        )}
      </AppPageContent>
    </TabShellPage>
  );
}
