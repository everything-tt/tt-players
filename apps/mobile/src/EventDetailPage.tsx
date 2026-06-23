import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useEventDetailQuery } from './queries';
import { useTabNavigation } from './navigation/tab-navigation';
import { TabShellPage } from './TabShellPage';
import { SectionSkeleton, SkeletonBlock } from './components/Skeleton';
import { formatDateOrUnknown, formatTime, getInitials } from './player-shared';
import {
  AppMessageCard,
  AppPageContent,
  AppButtonLink,
  AppSearchInput,
  List,
  ListItem,
  IconCircle,
  Avatar,
  Pill,
} from './ui/appkit';
import { useFavouriteTournaments } from './hooks/useFavouriteTournaments';
import { useFavouritePlayers } from './hooks/useFavouritePlayers';
import { DetailHeader } from './components/DetailHeader';
import { FavouriteButton } from './components/FavouriteButton';

type EventPlayerSummary = {
  key: string;
  playerId: string | null;
  name: string;
  played: number;
  wins: number;
  losses: number;
  winRate: number;
};

function EventDetailSkeleton() {
  return (
    <>
      <section className="tt-players-search-panel tt-tournament-summary" aria-label="Loading tournament details">
        <div className="tt-players-search-top">
          <div>
            <SkeletonBlock className="tt-skeleton-eyebrow" />
            <SkeletonBlock className="tt-skeleton-title" />
          </div>
        </div>

        <div className="tt-tournament-summary-meta">
          <SkeletonBlock className="tt-skeleton-text" />
          <SkeletonBlock className="tt-skeleton-text" />
          <SkeletonBlock className="tt-skeleton-text" />
        </div>

        <div className="tt-player-actions">
          <SkeletonBlock className="tt-skeleton-button" />
          <SkeletonBlock className="tt-skeleton-button" />
        </div>
      </section>

      <section className="tt-player-section" aria-label="Loading top players">
        <div className="tt-player-section-header">
          <SkeletonBlock className="tt-skeleton-text" />
          <SkeletonBlock className="tt-skeleton-text app-skeleton-short" />
        </div>
        <div className="tt-event-top-player-grid">
          <SkeletonBlock className="tt-skeleton-event-card" />
          <SkeletonBlock className="tt-skeleton-event-card" />
          <SkeletonBlock className="tt-skeleton-event-card" />
        </div>
      </section>

      <SectionSkeleton rows={4} />
      <SectionSkeleton rows={4} />
    </>
  );
}

export function EventDetailPage() {
  const { switchTab } = useTabNavigation();
  const goHome = (event: React.MouseEvent<HTMLAnchorElement>) => { event.preventDefault(); switchTab('home', 'root'); };
  const { eventId = '' } = useParams<{ eventId: string }>();
  const [playerQuery, setPlayerQuery] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<EventPlayerSummary | null>(null);

  const detailQuery = useEventDetailQuery(eventId, Boolean(eventId));
  const event = detailQuery.data?.event;
  const results = detailQuery.data?.results ?? [];
  const pageError = detailQuery.error instanceof Error ? detailQuery.error.message : null;

  const filteredResults = useMemo(() => {
    if (!selectedPlayer) return results;
    return results.filter((match) => {
      const homeKey = match.home_player_resolved_id ?? `external:${match.home_player_external_id}`;
      const awayKey = match.away_player_resolved_id ?? `external:${match.away_player_external_id}`;
      return homeKey === selectedPlayer.key || awayKey === selectedPlayer.key;
    });
  }, [results, selectedPlayer]);

  const groupedResults = useMemo(() => {
    const groups: Record<string, typeof filteredResults> = {};
    for (const match of filteredResults) {
      const groupKey = match.round_name || 'General';
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(match);
    }
    return Object.entries(groups).sort((a, b) => {
      const aOrder = a[1][0]?.round_order ?? 9999;
      const bOrder = b[1][0]?.round_order ?? 9999;
      return aOrder - bOrder;
    });
  }, [filteredResults]);

  const tournamentPlayers = useMemo(() => {
    const players = new Map<string, EventPlayerSummary>();

    const addPlayer = (input: { key: string; playerId: string | null; name: string; won: boolean }) => {
      const existing = players.get(input.key) ?? {
        key: input.key,
        playerId: input.playerId,
        name: input.name,
        played: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
      };

      existing.played += 1;
      if (input.won) {
        existing.wins += 1;
      } else {
        existing.losses += 1;
      }
      existing.winRate = existing.played > 0 ? Math.round((existing.wins / existing.played) * 100) : 0;
      players.set(input.key, existing);
    };

    for (const match of results) {
      addPlayer({
        key: match.home_player_resolved_id ?? `external:${match.home_player_external_id}`,
        playerId: match.home_player_resolved_id,
        name: match.home_player_name,
        won: match.winner_side === 'home',
      });
      addPlayer({
        key: match.away_player_resolved_id ?? `external:${match.away_player_external_id}`,
        playerId: match.away_player_resolved_id,
        name: match.away_player_name,
        won: match.winner_side === 'away',
      });
    }

    return Array.from(players.values()).sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      if (b.played !== a.played) return b.played - a.played;
      return a.name.localeCompare(b.name);
    });
  }, [results]);

  const topPlayers = useMemo(() => tournamentPlayers.slice(0, 3), [tournamentPlayers]);

  const filteredTournamentPlayers = useMemo(() => {
    if (selectedPlayer) return [selectedPlayer];
    const normalizedQuery = playerQuery.trim().toLowerCase();
    if (!normalizedQuery) return tournamentPlayers;
    return tournamentPlayers.filter((player) => player.name.toLowerCase().includes(normalizedQuery));
  }, [playerQuery, selectedPlayer, tournamentPlayers]);

  const { isFavourite: isFavouriteTournament, toggle: toggleFavouriteTournament } = useFavouriteTournaments();
  const { isFavourite: isFavouritePlayer, toggle: toggleFavouritePlayer } = useFavouritePlayers();
  const isFavourite = event ? isFavouriteTournament(event.id) : false;

  const selectPlayerFilter = (player: EventPlayerSummary | null) => (clickEvent?: React.MouseEvent<HTMLElement>) => {
    clickEvent?.preventDefault();
    clickEvent?.stopPropagation();
    setSelectedPlayer(player);
    if (player) setPlayerQuery('');
  };

  const selectPlayerById = (playerId: string | null) => (clickEvent: React.MouseEvent<HTMLElement>) => {
    clickEvent.preventDefault();
    clickEvent.stopPropagation();
    const player = tournamentPlayers.find((item) => item.playerId === playerId) ?? null;
    setSelectedPlayer(player);
    if (player) setPlayerQuery('');
  };

  return (
    <TabShellPage>
      <DetailHeader title="Tournament" />

      <AppPageContent>
        {!eventId ? (
          <AppMessageCard
            title="Missing Tournament ID"
            message="Tournament ID is missing from the route."
            action={{ label: 'Back Home', onClick: goHome }}
          />
        ) : detailQuery.isLoading && !event ? (
          <EventDetailSkeleton />
        ) : !event ? (
          <AppMessageCard
            title="Tournament Unavailable"
            message={pageError ?? 'Failed to load this tournament.'}
            action={{ label: 'Back Home', onClick: goHome }}
          />
        ) : (
          <>
            <section className="tt-players-search-panel tt-tournament-summary" aria-labelledby="tt-event-title">
              <div className="tt-players-search-top">
                <div>
                  <p className="tt-player-eyebrow">{event.category || 'Tournament'}</p>
                  <h1 id="tt-event-title" className="tt-players-search-title">{event.name}</h1>
                </div>
              </div>

              <div className="tt-tournament-summary-meta">
                <span><i className="fa fa-calendar-alt" />{formatDateOrUnknown(event.event_date)}</span>
                <span><i className="fa fa-table-tennis" />{event.match_count} matches</span>
                <span><i className="fa fa-database" />{event.platform_name}</span>
              </div>

              <div className="tt-player-actions">
                <FavouriteButton saved={Boolean(isFavourite)} onToggle={() => toggleFavouriteTournament(event)} />
                {event.public_url ? (
                  <AppButtonLink
                    href={event.public_url}
                    target="_blank"
                    rel="noreferrer"
                    size="sm"
                    className="tt-player-action-pill"
                    tone="outline-highlight"
                  >
                    Source
                  </AppButtonLink>
                ) : null}
              </div>
            </section>

            {topPlayers.length > 0 ? (
              <section className="tt-player-section" aria-labelledby="tt-event-top-players-title">
                <div className="tt-player-section-header">
                  <h2 id="tt-event-top-players-title" className="tt-player-section-title">Top Players</h2>
                  <span className="tt-player-section-note">By wins</span>
                </div>
                <div className="tt-event-top-player-grid">
                  {topPlayers.map((player, index) => (
                    <a
                      key={player.key}
                      href="#"
                      className={`tt-event-top-player-card${selectedPlayer?.key === player.key ? ' active' : ''}`}
                      onClick={selectPlayerFilter(player)}
                      aria-pressed={selectedPlayer?.key === player.key}
                    >
                      <span className="tt-event-top-player-rank">{index + 1}</span>
                      <span className="tt-event-top-player-name">{player.name}</span>
                      <span className="tt-event-top-player-record">{player.wins}-{player.losses}</span>
                      <span className="tt-event-top-player-meta">{player.winRate}% from {player.played}</span>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="tt-player-section" aria-labelledby="tt-event-players-title">
              <div className="tt-player-section-header">
                <h2 id="tt-event-players-title" className="tt-player-section-title">Players</h2>
                <span className="tt-player-section-note">{selectedPlayer ? `Filtering ${selectedPlayer.name}` : `${tournamentPlayers.length} players`}</span>
              </div>
              <AppSearchInput
                placeholder="Search tournament players..."
                value={playerQuery}
                onChange={(inputEvent) => setPlayerQuery(inputEvent.target.value)}
              />
              {selectedPlayer ? (
                <div className="tt-active-filter">
                  <span>Showing matches for <strong>{selectedPlayer.name}</strong></span>
                  <button type="button" onClick={() => setSelectedPlayer(null)}>Clear</button>
                </div>
              ) : null}
              {filteredTournamentPlayers.length === 0 ? (
                <p className="tt-player-section-state mt-3">No players match this search.</p>
              ) : (
                <List divider="hairline" size="lg" className="mt-3">
                  {filteredTournamentPlayers.map((player) => {
                    const saved = player.playerId ? isFavouritePlayer(player.playerId) : false;
                    return (
                      <ListItem
                        key={player.key}
                        leading={<Avatar text={getInitials(player.name)} />}
                        title={player.name}
                        subtitle={`${player.wins}-${player.losses} · ${player.winRate}% · ${player.played} matches`}
                        active={selectedPlayer?.key === player.key}
                        onClick={() => setSelectedPlayer(player)}
                        trailing={player.playerId ? (
                          <FavouriteButton
                            size="icon"
                            saved={saved}
                            onToggle={() => toggleFavouritePlayer({ id: player.playerId!, name: player.name, played: player.played, wins: player.wins })}
                          />
                        ) : null}
                        hideChevron
                      />
                    );
                  })}
                </List>
              )}
            </section>

            <section className="tt-player-section" aria-labelledby="tt-matches-list-title">
              <div className="tt-player-section-header">
                <h2 id="tt-matches-list-title" className="tt-player-section-title">Tournament Results</h2>
                <span className="tt-player-section-note">{filteredResults.length}{selectedPlayer ? ` of ${results.length}` : ''} matches</span>
              </div>

              {groupedResults.length === 0 ? (
                <p className="tt-player-section-state">{selectedPlayer ? 'No matches found for this player.' : 'No match results available for this tournament.'}</p>
              ) : (
                groupedResults.map(([roundName, matches]) => (
                  <div key={roundName} className="tt-tournament-round">
                    <div className="tt-tournament-round-heading">
                      <h3>{roundName}</h3>
                      <span>{matches.length} matches</span>
                    </div>

                    <List divider="hairline" size="lg" className="tt-tournament-results-list">
                      {matches.map((match) => {
                        const isHomeWinner = match.winner_side === 'home';
                        const homeOutcome = isHomeWinner ? 'W' : 'L';
                        const actionLabel = isHomeWinner ? 'defeated' : 'lost to';
                        const timeLabel = match.played_at ? formatTime(match.played_at) : null;

                        return (
                          <ListItem
                            key={match.id}
                            hideChevron
                            className="tt-tournament-result-item"
                            leading={<IconCircle iconClassName={isHomeWinner ? 'fa fa-check' : 'fa fa-times'} tone={isHomeWinner ? 'success' : 'danger'} />}
                            title={(
                              <a
                                href="#"
                                className={`tt-tournament-result-name ${isHomeWinner ? 'is-winner' : 'is-loser'}`}
                                onClick={selectPlayerById(match.home_player_resolved_id)}
                                aria-disabled={!match.home_player_resolved_id}
                              >
                                {match.home_player_name}
                              </a>
                            )}
                            subtitle={(
                              <span className="tt-tournament-result-subtitle">
                                <span>{actionLabel}</span>
                                <a
                                  href="#"
                                  className={`tt-tournament-result-name ${isHomeWinner ? 'is-loser' : 'is-winner'}`}
                                  onClick={selectPlayerById(match.away_player_resolved_id)}
                                  aria-disabled={!match.away_player_resolved_id}
                                >
                                  {match.away_player_name}
                                </a>
                                {timeLabel ? <span>· Played {timeLabel}</span> : null}
                              </span>
                            )}
                            trailing={<Pill size="xs" tone={isHomeWinner ? 'success' : 'danger'}>{homeOutcome}</Pill>}
                          />
                        );
                      })}
                    </List>
                  </div>
                ))
              )}
            </section>
          </>
        )}
      </AppPageContent>
    </TabShellPage>
  );
}
