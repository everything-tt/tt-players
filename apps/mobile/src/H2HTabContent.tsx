import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  formatMatchDate,
  getInitials,
  getQueryError,
  type PlayerSearchItem,
} from './player-shared';
import {
  AppButton,
  DesignAvatar,
  DesignList,
  EmptyState,
  ErrorState,
  Inline,
  ListItem,
  MatchRecordRow,
  MetricGrid,
  PageSection,
  Pill,
  Stack,
  Surface,
} from './ui/appkit';
import { PlayerSearchSheet } from './PlayerSearchSheet';
import { useTabNavigation } from './navigation/tab-navigation';
import { usePlayerExtendedStatsQuery, usePlayerH2HQuery } from './queries';
import { useFavouriteH2H } from './hooks/useFavouriteH2H';
import { FavouriteButton } from './components/FavouriteButton';
import { RatingPredictionPanel } from './components/RatingPredictionPanel';
import { buildH2HShareTarget } from './share-target';
import { useShareTarget } from './hooks/useShareTarget';
import type { H2HAnalysisResponse } from './h2h-analysis-types';
import type { RatingPredictionResponse } from './rating-queries';
import {
  h2hAnalysisQueryKey,
  h2hPredictionQueryKey,
  primeReverseMatchupCache,
} from './h2h-matchup-cache';
import { playerMatchScore } from './match-record';
import './h2h-ui.css';

function getWinRate(player: Pick<PlayerSearchItem, 'wins' | 'played'>): number {
  return player.played > 0 ? Math.round((player.wins / player.played) * 100) : 0;
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
  initialPlayerIds?: { playerAId: string; playerBId: string };
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
    <Surface tone={player ? 'accent' : 'raised'} padding="none" className={`tt-h2h-player-card tt-h2h-player-card--${tone}`}>
      <button
        type="button"
        className="tt-h2h-player-card__select"
        onClick={onSelect}
        aria-label={player ? `Change ${label}, currently ${player.name}` : `Select ${label}`}
      >
        <span className="tt-h2h-player-card__label">{label}</span>
        {player ? (
          <Inline gap="sm" align="center" className="tt-h2h-player-card__identity">
            <DesignAvatar size="standard" text={getInitials(player.name)} variant="onAccent" />
            <span className="tt-h2h-player-card__copy">
              <strong>{player.name}</strong>
              <small>{player.wins}W · {player.played} played · {getWinRate(player)}% win rate</small>
            </span>
          </Inline>
        ) : (
          <span className="tt-h2h-player-card__empty">
            <i className="fa fa-plus-circle" aria-hidden="true" />
            <strong>Select player</strong>
          </span>
        )}
      </button>
      {player ? (
        <button
          type="button"
          className="tt-h2h-player-card__profile"
          onClick={() => onOpenProfile(player.id)}
          aria-label={`View ${player.name} profile`}
        >
          <i className="fa fa-user" aria-hidden="true" />
        </button>
      ) : null}
    </Surface>
  );
}

export function H2HTabContent({ onOpenPlayer, initialPlayerIds }: H2HTabContentProps) {
  const { navigateInTab } = useTabNavigation();
  const queryClient = useQueryClient();
  const {
    items: favouriteH2Hs,
    isFavourite: isFavouriteMatchup,
    toggle: toggleFavouriteMatchup,
    remove: removeFavouriteMatchup,
  } = useFavouriteH2H();
  const [playerA, setPlayerA] = useState<PlayerSearchItem | null>(() => initialPlayerIds ? null : parseStoredActivePlayer(H2H_ACTIVE_PLAYER_A_KEY));
  const [playerB, setPlayerB] = useState<PlayerSearchItem | null>(() => initialPlayerIds ? null : parseStoredActivePlayer(H2H_ACTIVE_PLAYER_B_KEY));
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [activePicker, setActivePicker] = useState<'A' | 'B' | null>(null);

  const initialPlayerAQuery = usePlayerExtendedStatsQuery(initialPlayerIds?.playerAId ?? '', Boolean(initialPlayerIds?.playerAId));
  const initialPlayerBQuery = usePlayerExtendedStatsQuery(initialPlayerIds?.playerBId ?? '', Boolean(initialPlayerIds?.playerBId));

  useEffect(() => {
    const stats = initialPlayerAQuery.data;
    if (stats && !playerA) setPlayerA({ id: stats.player_id, name: stats.player_name, played: stats.total, wins: stats.wins });
  }, [initialPlayerAQuery.data, playerA]);

  useEffect(() => {
    const stats = initialPlayerBQuery.data;
    if (stats && !playerB) setPlayerB({ id: stats.player_id, name: stats.player_name, played: stats.total, wins: stats.wins });
  }, [initialPlayerBQuery.data, playerB]);

  useEffect(() => {
    if (playerA) localStorage.setItem(H2H_ACTIVE_PLAYER_A_KEY, JSON.stringify(playerA));
    else localStorage.removeItem(H2H_ACTIVE_PLAYER_A_KEY);
  }, [playerA]);

  useEffect(() => {
    if (playerB) localStorage.setItem(H2H_ACTIVE_PLAYER_B_KEY, JSON.stringify(playerB));
    else localStorage.removeItem(H2H_ACTIVE_PLAYER_B_KEY);
  }, [playerB]);

  const h2hQuery = usePlayerH2HQuery(playerA?.id ?? '', playerB?.id ?? '', Boolean(playerA && playerB));
  const h2h = h2hQuery.data ?? null;
  const h2hError = getQueryError(h2hQuery.error);
  const encounterCount = h2h?.encounters.length ?? 0;
  const playerAWinPct = encounterCount > 0 && h2h ? Math.round((h2h.player1_wins / encounterCount) * 100) : 0;
  const playerBWinPct = encounterCount > 0 && h2h ? Math.round((h2h.player2_wins / encounterCount) * 100) : 0;

  const isFavourite = playerA && playerB ? isFavouriteMatchup(playerA.id, playerB.id) : false;
  const shareTarget = useMemo(() => playerA && playerB ? buildH2HShareTarget(window.location.origin, playerA, playerB) : null, [playerA, playerB]);
  const { share, status: shareStatus } = useShareTarget(shareTarget);
  const hasCompleteMatchup = Boolean(playerA && playerB);

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

  const swapPlayers = () => {
    if (playerA && playerB) {
      primeReverseMatchupCache(queryClient, playerA, playerB, {
        direct: h2hQuery.data,
        prediction: queryClient.getQueryData<RatingPredictionResponse>(
          h2hPredictionQueryKey(playerA.id, playerB.id),
        ),
        analysis: queryClient.getQueryData<H2HAnalysisResponse>(
          h2hAnalysisQueryKey(playerA.id, playerB.id),
        ),
      });
    }
    setPlayerA(playerB);
    setPlayerB(playerA);
  };

  const clearMatchup = () => {
    setPlayerA(null);
    setPlayerB(null);
  };

  const matchupActions = playerA || playerB ? (
    <Inline gap="xs" align="center" wrap className="tt-h2h-action-row">
      {playerA && playerB ? (
        <>
          <AppButton size="s" tone="ghost" aria-label="Swap players" onClick={swapPlayers}>
            <i className="fa fa-exchange-alt" aria-hidden="true" />
            Swap
          </AppButton>
          <FavouriteButton saved={Boolean(isFavourite)} onToggle={() => toggleFavouriteMatchup({ player1: playerA, player2: playerB })} />
          <AppButton size="s" tone="ghost" aria-label={`Share ${playerA.name} versus ${playerB.name}`} onClick={share}>
            <i className="fa fa-share-alt" aria-hidden="true" />
            Share
          </AppButton>
        </>
      ) : null}
      <AppButton size="s" tone="ghost" aria-label="Clear matchup" onClick={clearMatchup}>
        <i className="fa fa-times" aria-hidden="true" />
        Clear
      </AppButton>
    </Inline>
  ) : null;

  return (
    <Stack gap="md" className="tt-h2h-page">
      {!hasCompleteMatchup ? (
        <PageSection
          surface="flat"
          density="compact"
          emphasis="primary"
          title="Compare players"
          description="Choose two players to see prediction, form, shared evidence and meeting history."
          action={matchupActions}
        >
          <div className="tt-h2h-picker-grid">
            <PlayerPicker label="Player A" player={playerA} tone="a" onSelect={() => openSearch('A')} onOpenProfile={onOpenPlayer} />
            <span className="tt-h2h-picker-vs" aria-hidden="true">VS</span>
            <PlayerPicker label="Player B" player={playerB} tone="b" onSelect={() => openSearch('B')} onOpenProfile={onOpenPlayer} />
          </div>
        </PageSection>
      ) : null}

      {favouriteH2Hs.length > 0 && !hasCompleteMatchup ? (
        <PageSection
          surface="flat"
          density="compact"
          emphasis="secondary"
          title="Saved matchups"
          meta={<Pill tone="neutral" size="sm">{favouriteH2Hs.length} saved</Pill>}
        >
          <DesignList density="compact" divider="hairline">
            {favouriteH2Hs.map((item) => {
              const name = `${item.player1.name} vs ${item.player2.name}`;
              return (
                <ListItem
                  key={`${item.player1.id}-${item.player2.id}`}
                  leading={<DesignAvatar size="compact" text="VS" />}
                  title={name}
                  subtitle={`${getWinRate(item.player1)}% vs ${getWinRate(item.player2)}% recorded win rate`}
                  onClick={() => { setPlayerA(item.player1); setPlayerB(item.player2); }}
                  trailing={(
                    <button
                      type="button"
                      className="tt-h2h-remove-action"
                      aria-label={`Remove ${name} from favourites`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        removeFavouriteMatchup(item.player1.id, item.player2.id);
                      }}
                    >
                      <i className="fa fa-trash-alt" aria-hidden="true" />
                    </button>
                  )}
                />
              );
            })}
          </DesignList>
        </PageSection>
      ) : null}

      {h2hQuery.isLoading ? (
        <PageSection surface="flat" density="compact"><EmptyState iconClassName="fa fa-spinner fa-spin" title="Loading head-to-head…" /></PageSection>
      ) : null}

      {h2hError ? (
        <PageSection surface="flat" density="compact"><ErrorState title="Couldn’t load this matchup" message={h2hError} onRetry={() => h2hQuery.refetch()} /></PageSection>
      ) : null}

      {playerA && playerB ? (
        <>
          <RatingPredictionPanel
            playerA={{ id: playerA.id, name: playerA.name }}
            playerB={{ id: playerB.id, name: playerB.name }}
            actions={matchupActions}
            encounterCount={encounterCount}
          />
          {shareStatus ? <span className="sr-only" aria-live="polite">{shareStatus}</span> : null}
        </>
      ) : null}

      {h2h && playerA && playerB && encounterCount > 0 ? (
        <>
          <PageSection
            surface="flat"
            density="compact"
            title="Direct record"
            meta={<Pill tone="neutral" size="sm">{encounterCount} meetings</Pill>}
          >
            <MetricGrid
              columns={3}
              density="compact"
              items={[
                { label: playerA.name, value: h2h.player1_wins, hint: `${playerAWinPct}% wins` },
                { label: 'Played', value: encounterCount, hint: 'recorded matches' },
                { label: playerB.name, value: h2h.player2_wins, hint: `${playerBWinPct}% wins` },
              ]}
            />
            <div className="tt-h2h-share-bar" role="img" aria-label={`${playerA.name} ${playerAWinPct} percent, ${playerB.name} ${playerBWinPct} percent`}>
              <span className="tt-h2h-share-bar__a" style={{ flexGrow: playerAWinPct || 1 }} />
              <span className="tt-h2h-share-bar__b" style={{ flexGrow: playerBWinPct || 1 }} />
            </div>
          </PageSection>

          <PageSection surface="flat" density="compact" title="Meeting history" description="Most recent first">
            <DesignList density="compact" divider="hairline">
              {h2h.encounters.map((encounter) => {
                const titleText = encounter.isWin
                  ? `${playerA.name} defeated ${encounter.opponent}`
                  : `${playerA.name} lost to ${encounter.opponent}`;

                return (
                  <MatchRecordRow
                    key={encounter.id}
                    score={playerMatchScore(encounter.result, encounter.isWin)}
                    title={titleText}
                    metadata={[formatMatchDate(encounter.date), encounter.league]}
                    onClick={() => navigateInTab('leagues', `fixture/${encounter.fixture_id}`)}
                  />
                );
              })}
            </DesignList>
          </PageSection>
        </>
      ) : null}

      <PlayerSearchSheet
        isOpen={isSheetOpen}
        onClose={() => { setIsSheetOpen(false); setActivePicker(null); }}
        onSelect={onSelectPlayer}
        excludePlayerId={activePicker === 'A' ? playerB?.id : playerA?.id}
        title={activePicker === 'A' ? 'Select Player A' : 'Select Player B'}
      />
    </Stack>
  );
}
