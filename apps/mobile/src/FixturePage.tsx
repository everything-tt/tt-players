import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { usePageNavigation } from './hooks/usePageNavigation';
import { formatDate } from './player-shared';
import { useFixtureRubbersQuery } from './queries';
import { TabShellPage } from './TabShellPage';
import {
  AppHeader,
  AppHeaderSpacer,
  AppLoadingCard,
  AppMessageCard,
  AppPageContent,
} from './ui/appkit';

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
        title="Fixture Details"
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
            action={{ label: 'Back Home', onClick: goHome }}
          />
        ) : rubbersQuery.isLoading && !fixtureMeta ? (
          <AppLoadingCard message="Loading fixture details..." />
        ) : !fixtureMeta ? (
          <AppMessageCard
            title="Fixture unavailable"
            message={pageError ?? 'Failed to load this fixture.'}
            action={{ label: 'Back Home', onClick: goHome }}
          />
        ) : (
          <>
            <section className="tt-fixture-hero" aria-labelledby="tt-fixture-title">
              <div className="tt-fixture-hero-top">
                <div className="tt-fixture-hero-copy">
                  <p className="tt-player-eyebrow">Fixture results</p>
                  <h1 id="tt-fixture-title" className="tt-fixture-title">{title}</h1>
                  <p className="tt-fixture-summary-line">
                    {fixtureMeta.league_name} · {fixtureMeta.division_name}
                  </p>
                  <p className="tt-fixture-date">{formatDate(fixtureMeta.played_at ?? '', { includeTime: true })}</p>
                </div>
                {fixtureMeta.source_url ? (
                  <a
                    href={fixtureMeta.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="tt-league-source-link"
                    aria-label="Open source fixture"
                  >
                    <i className="fa fa-globe" />
                  </a>
                ) : null}
              </div>

              {rubbers.length > 0 ? (
                <div className="tt-fixture-score" aria-label="Match score">
                  <div>
                    <span className="tt-fixture-score-value">{homeScore}</span>
                    <span className="tt-fixture-score-label">{fixtureMeta.home_team_name}</span>
                  </div>
                  <span className="tt-fixture-score-separator">-</span>
                  <div>
                    <span className="tt-fixture-score-value">{awayScore}</span>
                    <span className="tt-fixture-score-label">{fixtureMeta.away_team_name}</span>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="tt-player-section" aria-labelledby="tt-fixture-breakdown-title">
                <div className="tt-player-section-header">
                  <h2 id="tt-fixture-breakdown-title" className="tt-player-section-title">Match Breakdown</h2>
                  <span className="tt-player-section-note">{rubbers.length} rubbers</span>
                </div>

                {rubbersQuery.isLoading ? (
                  <p className="tt-player-section-state"><i className="fa fa-spinner fa-spin me-2" />Loading rubbers...</p>
                ) : rubbersQuery.error ? (
                  <p className="tt-player-section-state tt-player-section-error">Failed to load fixture details.</p>
                ) : rubbers.length === 0 ? (
                  <p className="tt-player-section-state">No matches found for this fixture.</p>
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

                      return (
                        <div key={rubber.id} className="tt-rubber-item">
                          <div className="tt-rubber-type-badge">
                            {rubber.is_doubles ? 'Doubles' : 'Singles'}
                          </div>
                          
                          <div className="tt-rubber-scorecard">
                            <div className="tt-rubber-side home">
                              {homePlayers.map((player: any, idx: number) => (
                                <span key={player.id ?? player.name}>
                                  {idx > 0 && <span className="tt-player-separator"> & </span>}
                                  {player.id ? (
                                    <a
                                      href="#"
                                      className="tt-rubber-player-link-text"
                                      onClick={openPlayer(player.id)}
                                    >
                                      {player.name}
                                    </a>
                                  ) : (
                                    <span className="tt-rubber-player-name">{player.name}</span>
                                  )}
                                </span>
                              ))}
                            </div>

                            <div className="tt-rubber-score-pill">
                              <span className="home-score">{rubber.home_games_won}</span>
                              <span className="score-divider">:</span>
                              <span className="away-score">{rubber.away_games_won}</span>
                            </div>

                            <div className="tt-rubber-side away">
                              {awayPlayers.map((player: any, idx: number) => (
                                <span key={player.id ?? player.name}>
                                  {idx > 0 && <span className="tt-player-separator"> & </span>}
                                  {player.id ? (
                                    <a
                                      href="#"
                                      className="tt-rubber-player-link-text"
                                      onClick={openPlayer(player.id)}
                                    >
                                      {player.name}
                                    </a>
                                  ) : (
                                    <span className="tt-rubber-player-name">{player.name}</span>
                                  )}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
            </section>
          </>
        )}
      </AppPageContent>
    </TabShellPage>
  );
}
