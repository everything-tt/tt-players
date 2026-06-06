import { useMemo, useState, useEffect, type MouseEvent } from 'react';
import {
  formatMatchDate,
  getInitials,
  type PlayerSearchItem,
} from './player-shared';
import { AppButtonLink, AppPlayerList } from './ui/appkit';
import { PlayerSearchSheet } from './PlayerSearchSheet';
import { usePageNavigation } from './hooks/usePageNavigation';
import { usePlayerH2HQuery } from './queries';

interface FavouriteH2H {
  player1: PlayerSearchItem;
  player2: PlayerSearchItem;
}

const H2H_FAVOURITES_STORAGE_KEY = 'tt_players_favourite_h2h';
const H2H_FAVOURITES_UPDATED_EVENT = 'tt_players_favourite_h2h_updated';

function isValidFavouriteH2H(value: unknown): value is FavouriteH2H {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return !!item.player1 && typeof item.player1 === 'object' &&
         !!item.player2 && typeof item.player2 === 'object' &&
         typeof (item.player1 as Record<string, unknown>).id === 'string' &&
         typeof (item.player1 as Record<string, unknown>).name === 'string' &&
         typeof (item.player2 as Record<string, unknown>).id === 'string' &&
         typeof (item.player2 as Record<string, unknown>).name === 'string';
}

function parseStoredFavouriteH2H(): FavouriteH2H[] {
  try {
    const raw = localStorage.getItem(H2H_FAVOURITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidFavouriteH2H);
  } catch {
    return [];
  }
}

function persistFavouriteH2H(h2hs: FavouriteH2H[]) {
  localStorage.setItem(H2H_FAVOURITES_STORAGE_KEY, JSON.stringify(h2hs));
  window.dispatchEvent(new Event(H2H_FAVOURITES_UPDATED_EVENT));
}

function getWinRate(player: Pick<PlayerSearchItem, 'wins' | 'played'>): number {
  if (player.played <= 0) return 0;
  return Math.round((player.wins / player.played) * 100);
}

const H2H_ACTIVE_PLAYER_A_KEY = 'tt_players_h2h_active_player_a';
const H2H_ACTIVE_PLAYER_B_KEY = 'tt_players_h2h_active_player_b';

function isValidPlayerSearchItem(value: unknown): value is PlayerSearchItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' &&
         typeof item.name === 'string' &&
         typeof item.played === 'number' &&
         typeof item.wins === 'number';
}

function parseStoredActivePlayer(key: string): PlayerSearchItem | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isValidPlayerSearchItem(parsed) ? parsed : null;
  } catch {
    return null;
  }
}



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
  const [favouriteH2Hs, setFavouriteH2Hs] = useState<FavouriteH2H[]>(() => parseStoredFavouriteH2H());
  const [playerA, setPlayerA] = useState<PlayerSearchItem | null>(() => parseStoredActivePlayer(H2H_ACTIVE_PLAYER_A_KEY));
  const [playerB, setPlayerB] = useState<PlayerSearchItem | null>(() => parseStoredActivePlayer(H2H_ACTIVE_PLAYER_B_KEY));

  useEffect(() => {
    if (playerA) {
      localStorage.setItem(H2H_ACTIVE_PLAYER_A_KEY, JSON.stringify(playerA));
    } else {
      localStorage.removeItem(H2H_ACTIVE_PLAYER_A_KEY);
    }
  }, [playerA]);

  useEffect(() => {
    if (playerB) {
      localStorage.setItem(H2H_ACTIVE_PLAYER_B_KEY, JSON.stringify(playerB));
    } else {
      localStorage.removeItem(H2H_ACTIVE_PLAYER_B_KEY);
    }
  }, [playerB]);

  const isFavourite = useMemo(() => {
    if (!playerA || !playerB) return false;
    return favouriteH2Hs.some(
      (item) =>
        (item.player1.id === playerA.id && item.player2.id === playerB.id) ||
        (item.player1.id === playerB.id && item.player2.id === playerA.id)
    );
  }, [favouriteH2Hs, playerA, playerB]);

  const toggleFavourite = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (!playerA || !playerB) return;

    setFavouriteH2Hs((previous) => {
      const exists = previous.some(
        (item) =>
          (item.player1.id === playerA.id && item.player2.id === playerB.id) ||
          (item.player1.id === playerB.id && item.player2.id === playerA.id)
      );

      let next;
      if (exists) {
        next = previous.filter(
          (item) =>
            !((item.player1.id === playerA.id && item.player2.id === playerB.id) ||
              (item.player1.id === playerB.id && item.player2.id === playerA.id))
        );
      } else {
        next = [...previous, { player1: playerA, player2: playerB }];
      }

      persistFavouriteH2H(next);
      return next;
    });
  };

  useEffect(() => {
    const syncFromStorage = () => {
      setFavouriteH2Hs(parseStoredFavouriteH2H());
    };
    window.addEventListener(H2H_FAVOURITES_UPDATED_EVENT, syncFromStorage);
    return () => {
      window.removeEventListener(H2H_FAVOURITES_UPDATED_EVENT, syncFromStorage);
    };
  }, []);



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
          <div className="tt-h2h-actions">
            {playerA && playerB && (
              <AppButtonLink
                size="sm"
                className="tt-player-action-pill tt-favourite-action-button"
                tone={isFavourite ? 'highlight' : 'outline-highlight'}
                aria-label={isFavourite ? 'Remove favourite' : 'Save favourite'}
                onClick={toggleFavourite}
              >
                <i className={`fa fa-heart ${isFavourite ? 'color-white' : 'color-highlight'}`} />
                <span>{isFavourite ? 'Saved' : 'Save'}</span>
              </AppButtonLink>
            )}
            {(playerA || playerB) && (
              <AppButtonLink
                size="sm"
                className="tt-player-action-pill tt-clear-action-button"
                tone="outline-highlight"
                aria-label="Clear matchup"
                onClick={(e) => {
                  e.preventDefault();
                  setPlayerA(null);
                  setPlayerB(null);
                }}
              >
                <i className="fa fa-times-circle color-highlight" />
                <span>Clear</span>
              </AppButtonLink>
            )}
          </div>
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

      {favouriteH2Hs.length > 0 && (!playerA || !playerB) ? (
        <section className="tt-player-section mt-2" aria-labelledby="tt-favourite-h2h-title">
          <div className="tt-player-section-header">
            <h2 id="tt-favourite-h2h-title" className="tt-player-section-title">Favourite Matchups</h2>
            <span className="tt-player-section-note">{favouriteH2Hs.length} saved</span>
          </div>
          <div className="favourites-scroll">
            <AppPlayerList
              items={favouriteH2Hs.map((item) => ({
                id: `${item.player1.id}-${item.player2.id}`,
                name: `${item.player1.name} vs ${item.player2.name}`,
                avatarText: 'VS',
                subtitle: `${getWinRate(item.player1)}% WR (${item.player1.wins}W) vs ${getWinRate(item.player2)}% WR (${item.player2.wins}W)`,
                player1: item.player1,
                player2: item.player2,
              }))}
              onSelectItem={(item) => {
                setPlayerA(item.player1);
                setPlayerB(item.player2);
              }}
              renderTrailing={(item) => (
                <button
                  type="button"
                  className="tt-player-remove-badge"
                  aria-label={`Remove ${item.name} from favourites`}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setFavouriteH2Hs((previous) => {
                      const next = previous.filter(
                        (x) =>
                          !((x.player1.id === item.player1.id && x.player2.id === item.player2.id) ||
                            (x.player1.id === item.player2.id && x.player2.id === item.player1.id))
                      );
                      persistFavouriteH2H(next);
                      return next;
                    });
                  }}
                >
                  Remove
                </button>
              )}
            />
          </div>
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

          {/* Encounters by League Section */}
          <section className="tt-player-section mt-2" aria-labelledby="tt-h2h-repeated-title">
            <div className="tt-player-section-header">
              <h2 id="tt-h2h-repeated-title" className="tt-player-section-title">Encounters by League</h2>
              <span className="tt-player-section-note">League-level aggregation</span>
            </div>

            {encounterCount === 0 ? (
              <p className="tt-player-section-state mb-0">No encounters found across all leagues.</p>
            ) : (
              <>
                <p className="font-12 opacity-75 mb-3">
                  This matchup has been played <strong>{encounterCount}</strong> times.
                </p>
                <AppPlayerList
                  compact
                  items={leagueEncounterSummary.slice(0, 5).map((summary) => ({
                    id: summary.league,
                    name: summary.league,
                    avatarText: getInitials(summary.league),
                    subtitle: `${summary.played} matches · ${summary.playerAWins}-${summary.playerBWins} · Latest ${formatMatchDate(summary.latestDate)}`,
                  }))}
                />
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
              <AppPlayerList
                compact
                items={h2h.encounters.map((encounter) => ({
                  id: encounter.id,
                  name: encounter.result,
                  avatarText: encounter.isWin ? 'W' : 'L',
                  avatarColor: encounter.isWin ? 'tt-bg-success' : 'tt-bg-warning',
                  subtitle: `${formatMatchDate(encounter.date)} · ${encounter.league}`,
                  fixture_id: encounter.fixture_id,
                }))}
                onSelectItem={(item) => navigateInTab('leagues', `fixture/${item.fixture_id}`)}
              />
            )}
          </section>
        </>
      ) : null}
    </>
  );
}
