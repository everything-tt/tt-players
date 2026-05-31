import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import {
  apiFetch,
  formatMatchDate,
  getInitials,
  type H2HResponse,
  type PlayerSearchItem,
} from './player-shared';
import { AppCard, AppCardContent, AppListGroup, AppListItem } from './ui/appkit';
import { PlayerSearchSheet } from './PlayerSearchSheet';
import { usePageNavigation } from './hooks/usePageNavigation';


interface H2HTabContentProps {
  selectedLeagueIds: string[];
  leagueScopeLabel: string;
  onOpenPlayer: (playerId: string) => void;
}

interface LeagueEncounterSummary {
  latestDate: string;
  league: string;
  played: number;
  playerAWins: number;
  playerBWins: number;
}


function buildH2HPath(playerId: string, opponentId: string, leagueIds: string[]): string {
  const params = new URLSearchParams();
  if (leagueIds.length > 0) {
    params.set('league_ids', leagueIds.join(','));
  }
  const queryString = params.toString();
  return queryString.length > 0
    ? `/players/${playerId}/h2h/${opponentId}?${queryString}`
    : `/players/${playerId}/h2h/${opponentId}`;
}

export function H2HTabContent({ selectedLeagueIds, leagueScopeLabel, onOpenPlayer }: H2HTabContentProps) {
  const { navigateInTab } = usePageNavigation();
  const [playerA, setPlayerA] = useState<PlayerSearchItem | null>(null);

  const openFixture = (fixtureId: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    navigateInTab('leagues', `fixture/${fixtureId}`);
  };
  const [playerB, setPlayerB] = useState<PlayerSearchItem | null>(null);

  const [h2h, setH2h] = useState<H2HResponse | null>(null);
  const [isH2HLoading, setIsH2HLoading] = useState(false);
  const [h2hError, setH2hError] = useState<string | null>(null);

  const sortedLeagueIds = useMemo(() => [...selectedLeagueIds].sort(), [selectedLeagueIds]);
  const selectedLeagueIdsKey = sortedLeagueIds.join(',');

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


  useEffect(() => {
    if (!playerA || !playerB) {
      setH2h(null);
      setH2hError(null);
      setIsH2HLoading(false);
      return;
    }

    const abortController = new AbortController();

    const loadH2H = async () => {
      try {
        setIsH2HLoading(true);
        setH2hError(null);
        const h2hPayload = await apiFetch<H2HResponse>(
          buildH2HPath(playerA.id, playerB.id, sortedLeagueIds),
          abortController.signal,
        );
        setH2h(h2hPayload);
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setH2h(null);
        setH2hError((error as Error).message || 'Failed to load H2H data');
      } finally {
        setIsH2HLoading(false);
      }
    };

    loadH2H();
    return () => abortController.abort();
  }, [playerA, playerB, selectedLeagueIdsKey, sortedLeagueIds]);

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

      <AppCard className="tt-h2h-hero-card bg-6 mt-2" cardHeight={220}>
        <div className="card-top px-3 pt-3">
          <span className="badge bg-white color-black font-11">H2H Arena</span>
        </div>
        <div className="card-bottom px-3 pb-3">
          <p className="color-white opacity-70 mb-1">League scope: {leagueScopeLabel}</p>
          {playerA && playerB ? (
            <>
              <h1 className="font-24 line-height-l color-white mb-1">{playerA.name} vs {playerB.name}</h1>
              <p className="color-white opacity-85 mb-0">{encounterCount} recorded encounters</p>
            </>
          ) : (
            <>
              <h1 className="font-24 line-height-l color-white mb-1">Build a Matchup</h1>
              <p className="color-white opacity-85 mb-0">Pick two players to unlock head-to-head analysis.</p>
            </>
          )}
        </div>
      </AppCard>

      <div className="mt-2">
        <div className="mb-1">
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
        </div>
      </div>

      {!playerA || !playerB ? (
        <AppCard className="mt-2 text-center" cardHeight={140}>
          <AppCardContent className="d-flex flex-column justify-content-center h-100">
            <i className="fa fa-bolt font-30 color-yellow-dark mb-2" />
            <h5 className="mb-1">Ready for the Duel?</h5>
            <p className="mb-0 px-4 font-12 opacity-70">Complete the matchup setup above to unlock deep H2H analytics.</p>
          </AppCardContent>
        </AppCard>
      ) : null}

      <PlayerSearchSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        onSelect={onSelectPlayer}
        selectedLeagueIds={sortedLeagueIds}
        excludePlayerId={activePicker === 'A' ? playerB?.id : playerA?.id}
        title={activePicker === 'A' ? 'Select Player A' : 'Select Player B'}
      />



      {isH2HLoading ? (
        <AppCard className="mt-2">
          <AppCardContent>
            <p className="mb-0"><i className="fa fa-spinner fa-spin me-2" />Loading head-to-head...</p>
          </AppCardContent>
        </AppCard>
      ) : null}

      {h2hError ? (
        <AppCard className="mt-2">
          <AppCardContent>
            <p className="mb-0 color-red-dark">Failed to load H2H: {h2hError}</p>
          </AppCardContent>
        </AppCard>
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
              <p className="tt-player-section-state mb-0">No repeated encounters found in the selected league scope.</p>
            ) : (
              <>
                <p className="font-12 opacity-75 mb-3">
                  This matchup has been played <strong>{encounterCount}</strong> times.
                </p>
                <AppListGroup size="small" className="tt-h2h-repeated-list">
                  {leagueEncounterSummary.slice(0, 5).map((summary, index) => (
                    <AppListItem
                      key={`${summary.league}-${index}`}
                      iconClassName="fa fa-repeat rounded-xl bg-blue-dark color-white"
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
                    iconClassName={`fa ${encounter.isWin ? 'fa-check' : 'fa-times'} rounded-xl ${encounter.isWin ? 'bg-green-dark' : 'bg-red-dark'} color-white`}
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
