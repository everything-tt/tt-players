import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { usePageNavigation } from './hooks/usePageNavigation';
import { formatDate } from './player-shared';
import { useFixtureRubbersQuery } from './queries';
import { TabShellPage } from './TabShellPage';
import {
  AppButtonLink,
  AppCard,
  AppCardContent,
  AppHeader,
  AppHeaderSpacer,
  AppLoadingCard,
  AppMessageCard,
  AppPageContent,
} from './ui/appkit';

function shortName(name: string | null): string {
  if (!name) return 'Player';
  return name.split(' ')[0] ?? name;
}

export function FixturePage() {
  const { goBack, goHome, navigate } = usePageNavigation();
  const { fixtureId = '' } = useParams<{ fixtureId: string }>();

  const rubbersQuery = useFixtureRubbersQuery(fixtureId, Boolean(fixtureId));
  const rubbers = rubbersQuery.data?.data ?? [];
  const fixtureMeta = rubbersQuery.data?.fixture;
  const pageError = rubbersQuery.error instanceof Error ? rubbersQuery.error.message : null;

  const [homeScore, awayScore] = useMemo(() => {
    let home = 0;
    let away = 0;
    for (const rubber of rubbers) {
      if (rubber.home_games_won > rubber.away_games_won) home += 1;
      if (rubber.away_games_won > rubber.home_games_won) away += 1;
    }
    return [home, away];
  }, [rubbers]);

  const title = `${fixtureMeta?.home_team_name ?? 'Home'} vs ${fixtureMeta?.away_team_name ?? 'Away'}`;

  const openPlayer = (playerId: string | null) => (event: React.MouseEvent) => {
    event.preventDefault();
    if (!playerId) return;
    navigate(`player/${playerId}`);
  };

  return (
    <TabShellPage>
      <AppHeader
        title={fixtureMeta ? title : 'Fixture'}
        onTitleClick={goHome}
        leftAction={{ iconClassName: 'fas fa-chevron-left', onClick: goBack, position: 1, ariaLabel: 'Back' }}
        rightAction={{ iconClassName: 'fas fa-home', onClick: goHome, position: 4, ariaLabel: 'Home' }}
      />
      <AppHeaderSpacer />

      <AppPageContent>
        {!fixtureId ? (
          <AppMessageCard
            title="Missing fixture"
            message="Fixture id is missing from the route."
            tone="outline-highlight"
            action={{ label: 'Back Home', onClick: goHome }}
          />
        ) : rubbersQuery.isLoading && !fixtureMeta ? (
          <AppLoadingCard message="Loading fixture details..." />
        ) : !fixtureMeta ? (
          <AppMessageCard
            title="Fixture unavailable"
            message={pageError ?? 'Failed to load this fixture.'}
            tone="outline-highlight"
            action={{ label: 'Back Home', onClick: goHome }}
          />
        ) : (
          <>
            <AppCard className="bg-6" cardHeight={230}>
              <div className="card-bottom ms-3 me-3 mb-3">
                <p className="color-white opacity-70 mb-1">Fixture Results</p>
                <h1 className="font-24 line-height-l color-white mb-1">{title}</h1>
                <p className="color-white opacity-80 mb-1">{fixtureMeta.league_name} · {fixtureMeta.division_name}</p>
                <p className="color-white opacity-60 mb-2">{formatDate(fixtureMeta.played_at ?? '', { includeTime: true })}</p>
                {rubbers.length > 0 ? (
                  <p className="color-white opacity-90 mb-0">Match score: {homeScore} - {awayScore}</p>
                ) : null}
              </div>
            </AppCard>

            {fixtureMeta.source_url ? (
              <AppCard>
                <AppCardContent className="mb-2">
                  <AppButtonLink href={fixtureMeta.source_url} target="_blank" rel="noreferrer" tone="outline-highlight">
                    <i className="fa fa-globe me-2" /> Source
                  </AppButtonLink>
                </AppCardContent>
              </AppCard>
            ) : null}

            <AppCard>
              <AppCardContent className="mb-2">
                <div className="d-flex mb-2">
                  <div className="align-self-center">
                    <h1 className="mb-0 font-16">Match Breakdown</h1>
                  </div>
                  <div className="ms-auto align-self-center">
                    <span className="font-11 opacity-60">{rubbers.length} rubbers</span>
                  </div>
                </div>

                {rubbersQuery.isLoading ? (
                  <p className="mb-0"><i className="fa fa-spinner fa-spin me-2" />Loading rubbers...</p>
                ) : rubbersQuery.error ? (
                  <p className="mb-0 color-red-dark">Failed to load fixture details.</p>
                ) : rubbers.length === 0 ? (
                  <p className="mb-0">No matches found for this fixture.</p>
                ) : (
                  <div className="tt-rubber-list">
                    {rubbers.map((rubber: any) => {
                      const homePlayers = [
                        { id: rubber.home_player_1_id, name: rubber.home_player_1_name },
                        ...(rubber.is_doubles ? [{ id: rubber.home_player_2_id, name: rubber.home_player_2_name }] : []),
                      ].filter((player) => Boolean(player.name));

                      const awayPlayers = [
                        { id: rubber.away_player_1_id, name: rubber.away_player_1_name },
                        ...(rubber.is_doubles ? [{ id: rubber.away_player_2_id, name: rubber.away_player_2_name }] : []),
                      ].filter((player) => Boolean(player.name));

                      const isHomeWin = rubber.home_games_won > rubber.away_games_won;

                      return (
                        <div key={rubber.id} className="tt-rubber-item">
                          <div className="d-flex mb-1">
                            <p className="font-12 mb-0 opacity-70">{rubber.is_doubles ? 'Doubles' : 'Singles'}</p>
                            <span className={`badge ms-auto ${isHomeWin ? 'bg-green-dark' : 'bg-red-dark'} color-white`}>
                              {rubber.home_games_won}-{rubber.away_games_won}
                            </span>
                          </div>
                          <p className="mb-2">
                            {(homePlayers.map((player: any) => player.name).join(' & ') || 'Unknown')} vs {(awayPlayers.map((player: any) => player.name).join(' & ') || 'Unknown')}
                          </p>
                          <div className="tt-rubber-player-links">
                            {homePlayers.map((player: any) => (
                              <AppButtonLink
                                key={`home-${player.id ?? player.name}`}
                                size="s"
                                tone="outline-highlight"
                                onClick={openPlayer(player.id)}
                              >
                                {shortName(player.name)}
                              </AppButtonLink>
                            ))}
                            {awayPlayers.map((player: any) => (
                              <AppButtonLink
                                key={`away-${player.id ?? player.name}`}
                                size="s"
                                tone="gray"
                                onClick={openPlayer(player.id)}
                              >
                                {shortName(player.name)}
                              </AppButtonLink>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </AppCardContent>
            </AppCard>
          </>
        )}
      </AppPageContent>
    </TabShellPage>
  );
}
