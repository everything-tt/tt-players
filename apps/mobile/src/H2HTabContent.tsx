import { useMemo, useState, type MouseEvent } from 'react';
import {
  formatMatchDate,
  getInitials,
  type PlayerSearchItem,
} from './player-shared';
import { AppListGroup, AppListItem } from './ui/appkit';
import { PlayerSearchSheet } from './PlayerSearchSheet';
import { usePageNavigation } from './hooks/usePageNavigation';
import { usePlayerH2HQuery } from './queries';


interface H2HTabContentProps {
  onOpenPlayer: (playerId: string) => void;
}

interface LeagueEncounterSummary {
  latestDate: string;
  league: string;
  played: number;
  playerAWins: number;
  playerBWins: number;
}


export function H2HTabContent({ onOpenPlayer }: H2HTabContentProps) {
  const { navigateInTab } = usePageNavigation();
  const [playerA, setPlayerA] = useState<PlayerSearchItem | null>(null);

  const openFixture = (fixtureId: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    navigateInTab('leagues', `fixture/${fixtureId}`);
  };
  const [playerB, setPlayerB] = useState<PlayerSearchItem | null>(null);

  const h2hQuery = usePlayerH2HQuery(
    playerA?.id ?? '',
    playerB?.id ?? '',
    Boolean(playerA && playerB),
  );
  const h2h = h2hQuery.data ?? null;
  const isH2HLoading = h2hQuery.isLoading;
  const h2hError = h2hQuery.error instanceof Error ? h2hQuery.error.message : null;

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [activePicker, setActivePicker] = useState<'A' | 'B' | null>(null);

  const openSearch = (picker: 'A' | 'B') => {
    setActivePicker(picker);
    setIsSheetOpen(true);
  };

  const onSelectPlayer = (player: PlayerSearchItem) => {
    if (activePicker === 'A') {
      setPlayerA(player);
    } else {
      setPlayerB(player);
    }
    setIsSheetOpen(false);
    setActivePicker(null);
  };

  const encounterCount = h2h?.encounters.length ?? 0;
  const playerAWinPct = encounterCount > 0 && h2h ? Math.round((h2h.player1_wins / encounterCount) * 100) : 0;
  const playerBWinPct = encounterCount > 0 && h2h ? Math.round((h2h.player2_wins / encounterCount) * 100) : 0;

  const leagueEncounterSummary = useMemo<LeagueEncounterSummary[]>(() => {
    if (!h2h) return [];
    const summaryByLeague = new Map<string, LeagueEncounterSummary>();

    for (const encounter of h2h.encounters) {
      const key = encounter.league || 'Unknown League';
      const current = summaryByLeague.get(key);
      if (!current) {
        summaryByLeague.set(key, {
          league: key,
          played: 1,
          playerAWins: encounter.isWin ? 1 : 0,
          playerBWins: encounter.isWin ? 0 : 1,
          latestDate: encounter.date,
        });
        continue;
      }
      current.played += 1;
      if (encounter.isWin) {
        current.playerAWins += 1;
      } else {
        current.playerBWins += 1;
      }
    }

    return Array.from(summaryByLeague.values())
      .sort((a, b) => b.played - a.played || b.playerAWins - a.playerAWins);
  }, [h2h]);


  const preventDefault = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
  };

  return (
    <>

      <section className="tt-h2h-panel" aria-label="Head to head matchup setup">
        <div className="tt-h2h-panel-top">
          <div className="tt-h2h-panel-copy">
            <p className="tt-player-eyebrow">Head to Head</p>
            {playerA && playerB ? (
              <>
                <h1 className="tt-player-title">{playerA.name} vs {playerB.name}</h1>
                <p className="tt-player-summary-line">{encounterCount} recorded encounters</p>
              </>
            ) : (
              <>
                <h1 className="tt-player-title">Build a Matchup</h1>
                <p className="tt-player-summary-line">Pick two players to unlock head-to-head analysis.</p>
              </>
            )}
          </div>
          <span className="tt-h2h-scope-pill">All leagues</span>
        </div>

        <div className="tt-h2h-panel-divider" />

        <div className="tt-h2h-picker-grid">
            <div className="tt-h2h-picker-vs">VS</div>

            {/* Player A Picker */}
            <div
              className={`tt-h2h-picker-card ${playerA ? 'tt-h2h-picker-card-selected tt-h2h-picker-card-selected-a' : 'tt-h2h-picker-card-empty'}`}
              onClick={() => openSearch('A')}
            >
              <p className={`font-11 text-uppercase mb-2 ${playerA ? 'color-white opacity-60' : 'opacity-60'}`}>Player A</p>
              {playerA ? (
                <div className="tt-h2h-selected-player">
                  <span
                    className="tt-h2h-selected-avatar"
                    onClick={(e) => { e.stopPropagation(); onOpenPlayer(playerA.id); }}
                    title="View Profile"
                  >
                    {getInitials(playerA.name)}
                  </span>
                  <div>
                    <h5 className="mb-1 font-700">{playerA.name}</h5>
                    <p className="font-12 mb-0">{playerA.wins}W · {playerA.played} played</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-2">
                  <i className="fa fa-plus-circle font-20 opacity-30 mb-1 d-block" />
                  <span className="font-12 opacity-50">Select Player</span>
                </div>
              )}
            </div>

            {/* Player B Picker */}
            <div
              className={`tt-h2h-picker-card ${playerB ? 'tt-h2h-picker-card-selected tt-h2h-picker-card-selected-b' : 'tt-h2h-picker-card-empty'}`}
              onClick={() => openSearch('B')}
            >
              <p className={`font-11 text-uppercase mb-2 ${playerB ? 'color-white opacity-60' : 'opacity-60'}`}>Player B</p>
              {playerB ? (
                <div className="tt-h2h-selected-player">
                  <span
                    className="tt-h2h-selected-avatar"
                    onClick={(e) => { e.stopPropagation(); onOpenPlayer(playerB.id); }}
                    title="View Profile"
                  >
                    {getInitials(playerB.name)}
                  </span>
                  <div>
                    <h5 className="mb-1 font-700">{playerB.name}</h5>
                    <p className="font-12 mb-0">{playerB.wins}W · {playerB.played} played</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-2">
                  <i className="fa fa-plus-circle font-20 opacity-30 mb-1 d-block" />
                  <span className="font-12 opacity-50">Select Player</span>
                </div>
              )}
            </div>
        </div>
      </section>

      {!playerA || !playerB ? (
        <section className="tt-player-section tt-h2h-empty-state" aria-label="Head to head empty state">
          <div className="tt-player-section-header">
            <h2 className="tt-player-section-title">Ready for the Duel?</h2>
            <span className="tt-player-section-note">2 players required</span>
          </div>
          <p className="tt-player-section-state mb-0">Complete the matchup setup above to unlock H2H analytics.</p>
        </section>
      ) : null}

      <PlayerSearchSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        onSelect={onSelectPlayer}
        excludePlayerId={activePicker === 'A' ? playerB?.id : playerA?.id}
        title={activePicker === 'A' ? 'Select Player A' : 'Select Player B'}
      />



      {isH2HLoading ? (
        <section className="tt-player-section" aria-label="Loading head to head">
          <p className="tt-player-section-state mb-0"><i className="fa fa-spinner fa-spin me-2" />Loading head-to-head...</p>
        </section>
      ) : null}

      {h2hError ? (
        <section className="tt-player-section" aria-label="Head to head error">
          <p className="tt-player-section-state tt-player-section-error mb-0">Failed to load H2H: {h2hError}</p>
        </section>
      ) : null}

      {h2h && playerA && playerB ? (
        <>
          {/* Matchup Score Section */}
          <section className="tt-player-section mt-2" aria-labelledby="tt-h2h-matchup-score-title">
            <div className="tt-player-section-header">
              <h2 id="tt-h2h-matchup-score-title" className="tt-player-section-title">Matchup Score</h2>
              <span className="tt-player-section-note">{encounterCount} total encounters</span>
            </div>

            <div className="tt-h2h-duel-grid mt-2">
              <div className="tt-h2h-duel-side">
                <span className="tt-h2h-duel-name">{playerA.name}</span>
                <strong className="tt-h2h-duel-score">{h2h.player1_wins}</strong>
                <span className="tt-h2h-duel-rate">{playerAWinPct}% wins</span>
              </div>
              <div className="tt-h2h-duel-vs">VS</div>
              <div className="tt-h2h-duel-side">
                <span className="tt-h2h-duel-name">{playerB.name}</span>
                <strong className="tt-h2h-duel-score">{h2h.player2_wins}</strong>
                <span className="tt-h2h-duel-rate">{playerBWinPct}% wins</span>
              </div>
            </div>

            <div className="tt-h2h-bar mt-3" role="img" aria-label="Win split">
              <div className="tt-h2h-bar-a" style={{ width: `${playerAWinPct}%` }} />
              <div className="tt-h2h-bar-b" style={{ width: `${playerBWinPct}%` }} />
            </div>
          </section>

          {/* Most Repeated Encounters Section */}
          <section className="tt-player-section mt-2" aria-labelledby="tt-h2h-repeated-title">
            <div className="tt-player-section-header">
              <h2 id="tt-h2h-repeated-title" className="tt-player-section-title">Repeated Encounters</h2>
              <span className="tt-player-section-note">{playerA.name} vs {playerB.name}</span>
            </div>

            {encounterCount === 0 ? (
              <p className="tt-player-section-state mb-0">No repeated encounters found across all leagues.</p>
            ) : (
              <>
                <p className="font-12 opacity-75 mb-3">
                  This matchup has been played <strong>{encounterCount}</strong> times.
                </p>
                <AppListGroup size="small" className="tt-h2h-repeated-list">
                  {leagueEncounterSummary.slice(0, 5).map((summary, index) => (
                    <AppListItem
                      key={`${summary.league}-${index}`}
                      iconClassName="fa fa-repeat rounded-xl tt-icon-repeat"
                      title={`${index + 1}. ${summary.league}`}
                      subtitle={`${summary.played} matches · ${summary.playerAWins}-${summary.playerBWins} · Latest ${formatMatchDate(summary.latestDate)}`}
                      onClick={preventDefault}
                      borderless={index === Math.min(leagueEncounterSummary.length, 5) - 1}
                    />
                  ))}
                </AppListGroup>
              </>
            )}
          </section>

          {/* Encounter History Section */}
          <section className="tt-player-section mt-2" aria-labelledby="tt-h2h-history-title">
            <div className="tt-player-section-header">
              <h2 id="tt-h2h-history-title" className="tt-player-section-title">Encounter History</h2>
              <span className="tt-player-section-note">Past Matches</span>
            </div>

            {h2h.encounters.length === 0 ? (
              <p className="tt-player-section-state mb-0">No past encounters found.</p>
            ) : (
              <AppListGroup size="small" className="tt-match-history-list tt-player-list">
                {h2h.encounters.map((encounter, index) => (
                  <AppListItem
                    key={encounter.id}
                    iconClassName={`fa ${encounter.isWin ? 'fa-check' : 'fa-times'} rounded-xl ${encounter.isWin ? 'tt-icon-win' : 'tt-icon-loss'}`}
                    title={encounter.result}
                    subtitle={`${formatMatchDate(encounter.date)} · ${encounter.league}`}
                    onClick={openFixture(encounter.fixture_id)}
                    borderless={index === h2h.encounters.length - 1}
                  />
                ))}
              </AppListGroup>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}
