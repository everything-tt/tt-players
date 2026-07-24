import { useEffect, useMemo, useState } from 'react';
import {
  formatMatchDate,
  getInitials,
  getQueryError,
  type PlayerSearchItem,
} from './player-shared';
import {
  AppButton,
  Avatar,
  EmptyState,
  ErrorState,
  List,
  ListItem,
  OutcomeBadge,
  SectionHeader,
} from './ui/appkit';
import { PlayerSearchSheet } from './PlayerSearchSheet';
import { useTabNavigation } from './navigation/tab-navigation';
import { usePlayerExtendedStatsQuery, usePlayerH2HQuery } from './queries';
import { useFavouriteH2H } from './hooks/useFavouriteH2H';
import { FavouriteButton } from './components/FavouriteButton';
import { buildH2HShareTarget } from './share-target';
import { useShareTarget } from './hooks/useShareTarget';

function getWinRate(player: Pick<PlayerSearchItem, 'wins' | 'played'>): number {
  if (player.played <= 0) return 0;
  return Math.round((player.wins / player.played) * 100);
}

const H2H_ACTIVE_PLAYER_A_KEY = 'tt_players_h2h_active_player_a';
const H2H_ACTIVE_PLAYER_B_KEY = 'tt_players_h2h_active_player_b';

function isValidPlayerSearchItem(value: unknown): value is PlayerSearchItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string'
    && typeof item.name === 'string'
    && typeof item.played === 'number'
    && typeof item.wins === 'number';
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
  initialPlayerIds?: {
    playerAId: string;
    playerBId: string;
  };
}

interface LeagueEncounterSummary {
  latestDate: string;
  league: string;
  played: number;
  playerAWins: number;
  playerBWins: number;
}

interface PlayerPickerProps {
  label: string;
  player: PlayerSearchItem | null;
  tone: 'a' | 'b';
  onSelect: () => void;
  onOpenProfile: (playerId: string) => void;
}

function PlayerPicker({ label, player, tone, onSelect, onOpenProfile }: PlayerPickerProps) {
  return (
    <div
      className={`tt-h2h-picker-card ${player
        ? `tt-h2h-picker-card-selected tt-h2h-picker-card-selected-${tone}`
        : 'tt-h2h-picker-card-empty'}`}
    >
      <button
        type="button"
        className="tt-h2h-picker-select"
        onClick={onSelect}
        aria-label={player ? `Change ${label}, currently ${player.name}` : `Select ${label}`}
      >
        <p className={`font-11 text-uppercase mb-2 ${player ? 'color-white opacity-60' : 'opacity-60'}`}>
          {label}
        </p>
        {player ? (
          <div className="tt-h2h-selected-player">
            <Avatar text={getInitials(player.name)} variant="onAccent" className="tt-h2h-selected-avatar" />
            <div>
              <h3 className="mb-1 font-700">{player.name}</h3>
              <p className="font-12 mb-0">{player.wins}W · {player.played} played</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-2">
            <i className="fa fa-plus-circle font-20 opacity-30 mb-1 d-block" aria-hidden="true" />
            <span className="font-12 opacity-50">Select Player</span>
          </div>
        )}
      </button>
      {player ? (
        <button
          type="button"
          className="tt-h2h-profile-button"
          onClick={() => onOpenProfile(player.id)}
          aria-label={`View ${player.name} profile`}
        >
          <i className="fa fa-user" aria-hidden="true" />
          Profile
        </button>
      ) : null}
    </div>
  );
}

export function H2HTabContent({ onOpenPlayer, initialPlayerIds }: H2HTabContentProps) {
  const { navigateInTab } = useTabNavigation();
  const {
    items: favouriteH2Hs,
    isFavourite: isFavouriteMatchup,
    toggle: toggleFavouriteMatchup,
    remove: removeFavouriteMatchup,
  } = useFavouriteH2H();
  const [playerA, setPlayerA] = useState<PlayerSearchItem | null>(() =>
    initialPlayerIds ? null : parseStoredActivePlayer(H2H_ACTIVE_PLAYER_A_KEY));
  const [playerB, setPlayerB] = useState<PlayerSearchItem | null>(() =>
    initialPlayerIds ? null : parseStoredActivePlayer(H2H_ACTIVE_PLAYER_B_KEY));
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [activePicker, setActivePicker] = useState<'A' | 'B' | null>(null);

  const initialPlayerAQuery = usePlayerExtendedStatsQuery(
    initialPlayerIds?.playerAId ?? '',
    Boolean(initialPlayerIds?.playerAId),
  );
  const initialPlayerBQuery = usePlayerExtendedStatsQuery(
    initialPlayerIds?.playerBId ?? '',
    Boolean(initialPlayerIds?.playerBId),
  );

  useEffect(() => {
    const stats = initialPlayerAQuery.data;
    if (!stats || playerA) return;
    setPlayerA({ id: stats.player_id, name: stats.player_name, played: stats.total, wins: stats.wins });
  }, [initialPlayerAQuery.data, playerA]);

  useEffect(() => {
    const stats = initialPlayerBQuery.data;
    if (!stats || playerB) return;
    setPlayerB({ id: stats.player_id, name: stats.player_name, played: stats.total, wins: stats.wins });
  }, [initialPlayerBQuery.data, playerB]);

  useEffect(() => {
    if (playerA) localStorage.setItem(H2H_ACTIVE_PLAYER_A_KEY, JSON.stringify(playerA));
    else localStorage.removeItem(H2H_ACTIVE_PLAYER_A_KEY);
  }, [playerA]);

  useEffect(() => {
    if (playerB) localStorage.setItem(H2H_ACTIVE_PLAYER_B_KEY, JSON.stringify(playerB));
    else localStorage.removeItem(H2H_ACTIVE_PLAYER_B_KEY);
  }, [playerB]);

  const isFavourite = playerA && playerB ? isFavouriteMatchup(playerA.id, playerB.id) : false;
  const shareTarget = useMemo(
    () => playerA && playerB
      ? buildH2HShareTarget(window.location.origin, playerA, playerB)
      : null,
    [playerA, playerB],
  );
  const { share, status: shareStatus } = useShareTarget(shareTarget);

  const h2hQuery = usePlayerH2HQuery(
    playerA?.id ?? '',
    playerB?.id ?? '',
    Boolean(playerA && playerB),
  );
  const h2h = h2hQuery.data ?? null;
  const h2hError = getQueryError(h2hQuery.error);

  const openSearch = (picker: 'A' | 'B') => {
    setActivePicker(picker);
    setIsSheetOpen(true);
  };

  const onSelectPlayer = (player: PlayerSearchItem) => {
    if (activePicker === 'A') setPlayerA(player);
    else setPlayerB(player);
    setIsSheetOpen(false);
    setActivePicker(null);
  };

  const clearMatchup = () => {
    setPlayerA(null);
    setPlayerB(null);
  };

  const encounterCount = h2h?.encounters.length ?? 0;
  const playerAWinPct = encounterCount > 0 && h2h
    ? Math.round((h2h.player1_wins / encounterCount) * 100)
    : 0;
  const playerBWinPct = encounterCount > 0 && h2h
    ? Math.round((h2h.player2_wins / encounterCount) * 100)
    : 0;

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
      if (encounter.isWin) current.playerAWins += 1;
      else current.playerBWins += 1;
      if (encounter.date > current.latestDate) current.latestDate = encounter.date;
    }

    return Array.from(summaryByLeague.values())
      .sort((a, b) => b.played - a.played || b.playerAWins - a.playerAWins);
  }, [h2h]);

  return (
    <>
      <section className="tt-h2h-panel" aria-labelledby="tt-h2h-title">
        <div className="tt-h2h-panel-top">
          <div className="tt-h2h-panel-copy">
            <p className="tt-player-eyebrow">Head to Head</p>
            <h2 id="tt-h2h-title" className="tt-player-title">
              {playerA && playerB ? `${playerA.name} vs ${playerB.name}` : 'Build a Matchup'}
            </h2>
            <p className="tt-player-summary-line">
              {playerA && playerB
                ? `${encounterCount} recorded encounters`
                : 'Pick two players to unlock head-to-head analysis.'}
            </p>
          </div>
          <div className="tt-h2h-actions">
            {playerA && playerB ? (
              <>
                <FavouriteButton
                  saved={Boolean(isFavourite)}
                  onToggle={() => toggleFavouriteMatchup({ player1: playerA, player2: playerB })}
                />
                <AppButton
                  size="sm"
                  className="tt-player-action-pill"
                  tone="outline"
                  aria-label={`Share ${playerA.name} versus ${playerB.name}`}
                  onClick={share}
                >
                  <i className="fa fa-share-alt" aria-hidden="true" />
                  <span>Share</span>
                </AppButton>
              </>
            ) : null}
            {playerA || playerB ? (
              <AppButton
                size="sm"
                className="tt-player-action-pill tt-clear-action-button"
                tone="outline"
                aria-label="Clear matchup"
                onClick={clearMatchup}
              >
                <i className="fa fa-times-circle" aria-hidden="true" />
                <span>Clear</span>
              </AppButton>
            ) : null}
          </div>
        </div>

        <div className="tt-h2h-panel-divider" />

        <div className="tt-h2h-picker-grid">
          <div className="tt-h2h-picker-vs" aria-hidden="true">VS</div>
          <PlayerPicker
            label="Player A"
            player={playerA}
            tone="a"
            onSelect={() => openSearch('A')}
            onOpenProfile={onOpenPlayer}
          />
          <PlayerPicker
            label="Player B"
            player={playerB}
            tone="b"
            onSelect={() => openSearch('B')}
            onOpenProfile={onOpenPlayer}
          />
        </div>
        {shareStatus ? <span className="sr-only" aria-live="polite">{shareStatus}</span> : null}
      </section>

      {!playerA || !playerB ? (
        <section className="tt-h2h-section" aria-label="Head to head empty state">
          <EmptyState
            iconClassName="fa fa-code-compare"
            title="Ready for the duel?"
            message="Select two players above to unlock H2H analytics."
          />
        </section>
      ) : null}

      {favouriteH2Hs.length > 0 && (!playerA || !playerB) ? (
        <section className="tt-player-section mt-2" aria-labelledby="tt-favourite-h2h-title">
          <SectionHeader title="Favourite Matchups" note={`${favouriteH2Hs.length} saved`} />
          <List divider="hairline" size="lg">
            {favouriteH2Hs.map((item) => {
              const name = `${item.player1.name} vs ${item.player2.name}`;
              return (
                <ListItem
                  key={`${item.player1.id}-${item.player2.id}`}
                  leading={<Avatar text="VS" />}
                  title={name}
                  subtitle={`${getWinRate(item.player1)}% WR (${item.player1.wins}W) vs ${getWinRate(item.player2)}% WR (${item.player2.wins}W)`}
                  onClick={() => {
                    setPlayerA(item.player1);
                    setPlayerB(item.player2);
                  }}
                  trailing={(
                    <button
                      type="button"
                      className="tt-player-remove-badge"
                      aria-label={`Remove ${name} from favourites`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        removeFavouriteMatchup(item.player1.id, item.player2.id);
                      }}
                    >
                      Remove
                    </button>
                  )}
                />
              );
            })}
          </List>
        </section>
      ) : null}

      <PlayerSearchSheet
        isOpen={isSheetOpen}
        onClose={() => {
          setIsSheetOpen(false);
          setActivePicker(null);
        }}
        onSelect={onSelectPlayer}
        excludePlayerId={activePicker === 'A' ? playerB?.id : playerA?.id}
        title={activePicker === 'A' ? 'Select Player A' : 'Select Player B'}
      />

      {h2hQuery.isLoading ? (
        <section className="tt-h2h-section" aria-label="Loading head to head">
          <EmptyState iconClassName="fa fa-spinner fa-spin" title="Loading head-to-head…" />
        </section>
      ) : null}

      {h2hError ? (
        <section className="tt-h2h-section">
          <ErrorState
            title="Couldn’t load this matchup"
            message={h2hError}
            onRetry={() => h2hQuery.refetch()}
          />
        </section>
      ) : null}

      {h2h && playerA && playerB ? (
        <>
          <section className="tt-player-section mt-2" aria-labelledby="tt-h2h-matchup-score-title">
            <SectionHeader title="Matchup Score" note={`${encounterCount} total encounters`} />
            <div className="tt-h2h-duel-grid mt-2">
              <div className="tt-h2h-duel-side">
                <span className="tt-h2h-duel-name">{playerA.name}</span>
                <strong className="tt-h2h-duel-score">{h2h.player1_wins}</strong>
                <span className="tt-h2h-duel-rate">{playerAWinPct}% wins</span>
              </div>
              <div className="tt-h2h-duel-vs" aria-hidden="true">VS</div>
              <div className="tt-h2h-duel-side">
                <span className="tt-h2h-duel-name">{playerB.name}</span>
                <strong className="tt-h2h-duel-score">{h2h.player2_wins}</strong>
                <span className="tt-h2h-duel-rate">{playerBWinPct}% wins</span>
              </div>
            </div>
            <div className="tt-h2h-bar mt-3" role="img" aria-label={`${playerA.name} ${playerAWinPct} percent, ${playerB.name} ${playerBWinPct} percent`}>
              <div className="tt-h2h-bar-a" style={{ width: `${playerAWinPct}%` }} />
              <div className="tt-h2h-bar-b" style={{ width: `${playerBWinPct}%` }} />
            </div>
          </section>

          <section className="tt-player-section mt-2" aria-labelledby="tt-h2h-repeated-title">
            <SectionHeader title="Encounters by Event" note="Event-level aggregation" />
            {encounterCount === 0 ? (
              <EmptyState iconClassName="fa fa-calendar-times" title="No encounters found" message="No matches were found across recorded events." />
            ) : (
              <List divider="hairline">
                {leagueEncounterSummary.slice(0, 5).map((summary) => (
                  <ListItem
                    key={summary.league}
                    leading={<Avatar text={getInitials(summary.league)} />}
                    title={summary.league}
                    subtitle={`${summary.played} matches · ${summary.playerAWins}-${summary.playerBWins} · Latest ${formatMatchDate(summary.latestDate)}`}
                    hideChevron
                  />
                ))}
              </List>
            )}
          </section>

          <section className="tt-player-section mt-2" aria-labelledby="tt-h2h-history-title">
            <SectionHeader title="Encounter History" note="Past matches" />
            {h2h.encounters.length === 0 ? (
              <EmptyState iconClassName="fa fa-history" title="No past encounters" />
            ) : (
              <List divider="hairline">
                {h2h.encounters.map((encounter) => (
                  <ListItem
                    key={encounter.id}
                    leading={<OutcomeBadge result={encounter.isWin ? 'W' : 'L'} variant="badge" />}
                    title={encounter.result}
                    subtitle={`${formatMatchDate(encounter.date)} · ${encounter.league}`}
                    onClick={() => navigateInTab('leagues', `fixture/${encounter.fixture_id}`)}
                  />
                ))}
              </List>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}
