import { useMemo, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useEventDetailQuery } from './queries';
import { usePageNavigation } from './hooks/usePageNavigation';
import { TabShellPage } from './TabShellPage';
import { formatDate, parseStoredFavouriteTournaments, persistFavouriteTournaments, FAVOURITE_TOURNAMENTS_UPDATED_EVENT, type FavouriteTournament } from './player-shared';
import {
  AppHeader,
  AppHeaderSpacer,
  AppLoadingCard,
  AppMessageCard,
  AppPageContent,
  AppButtonLink,
  AppListGroup,
  AppListItem,
  AppSearchInput,
} from './ui/appkit';

type EventPlayerSummary = {
  key: string;
  playerId: string | null;
  name: string;
  played: number;
  wins: number;
  losses: number;
  winRate: number;
};

export function EventDetailPage() {
  const { goBack, goHome, navigateInTab } = usePageNavigation();
  const { eventId = '' } = useParams<{ eventId: string }>();
  const [playerQuery, setPlayerQuery] = useState('');

  const detailQuery = useEventDetailQuery(eventId, Boolean(eventId));
  const event = detailQuery.data?.event;
  const results = detailQuery.data?.results ?? [];
  const pageError = detailQuery.error instanceof Error ? detailQuery.error.message : null;

  const groupedResults = useMemo(() => {
    const groups: Record<string, typeof results> = {};
    for (const match of results) {
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
  }, [results]);

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
    const normalizedQuery = playerQuery.trim().toLowerCase();
    if (!normalizedQuery) return tournamentPlayers;
    return tournamentPlayers.filter((player) => player.name.toLowerCase().includes(normalizedQuery));
  }, [playerQuery, tournamentPlayers]);

  const [favouriteTournaments, setFavouriteTournaments] = useState<FavouriteTournament[]>(() => parseStoredFavouriteTournaments());

  const isFavourite = useMemo(() => {
    if (!event) return false;
    return favouriteTournaments.some((t) => t.id === event.id);
  }, [favouriteTournaments, event]);

  const onToggleFavourite = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (!event) return;

    setFavouriteTournaments((previous) => {
      const exists = previous.some((t) => t.id === event.id);
      const next = exists
        ? previous.filter((t) => t.id !== event.id)
        : [{
          id: event.id,
          name: event.name,
          event_date: event.event_date,
          category: event.category,
          platform_name: event.platform_name,
          match_count: event.match_count,
        }, ...previous.filter((t) => t.id !== event.id)];

      persistFavouriteTournaments(next);
      return next;
    });
  };

  useEffect(() => {
    const syncFromStorage = () => {
      setFavouriteTournaments(parseStoredFavouriteTournaments());
    };

    window.addEventListener('storage', syncFromStorage);
    window.addEventListener(FAVOURITE_TOURNAMENTS_UPDATED_EVENT, syncFromStorage);
    return () => {
      window.removeEventListener('storage', syncFromStorage);
      window.removeEventListener(FAVOURITE_TOURNAMENTS_UPDATED_EVENT, syncFromStorage);
    };
  }, []);

  const openPlayer = (playerId: string | null) => (clickEvent: React.MouseEvent<HTMLAnchorElement>) => {
    clickEvent.preventDefault();
    clickEvent.stopPropagation();
    if (!playerId) return;
    navigateInTab('players', `player/${playerId}`);
  };

  return (
    <TabShellPage>
      <AppHeader
        title={event?.name ?? 'Tournament Details'}
        onTitleClick={goHome}
        leftAction={{ iconClassName: 'fas fa-chevron-left', onClick: goBack, position: 1, ariaLabel: 'Back' }}
        rightAction={{ iconClassName: 'fas fa-home', onClick: goHome, position: 4, ariaLabel: 'Home' }}
      />
      <AppHeaderSpacer />

      <AppPageContent>
        {!eventId ? (
          <AppMessageCard
            title="Missing Tournament ID"
            message="Tournament ID is missing from the route."
            action={{ label: 'Back Home', onClick: goHome }}
          />
        ) : detailQuery.isLoading && !event ? (
          <AppLoadingCard message="Loading tournament details..." />
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
                <span><i className="fa fa-calendar-alt" />{event.event_date ? formatDate(event.event_date) : 'Unknown Date'}</span>
                <span><i className="fa fa-table-tennis" />{event.match_count} matches</span>
                <span><i className="fa fa-database" />{event.platform_name}</span>
              </div>

              <div className="tt-player-actions">
                <AppButtonLink
                  size="sm"
                  className="tt-player-action-pill tt-favourite-action-button"
                  tone={isFavourite ? 'highlight' : 'outline-highlight'}
                  aria-label={isFavourite ? 'Remove favourite' : 'Save favourite'}
                  onClick={onToggleFavourite}
                >
                  <i className={`fa fa-heart ${isFavourite ? 'color-white' : 'color-highlight'}`} />
                  <span>{isFavourite ? 'Saved' : 'Save'}</span>
                </AppButtonLink>
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
                      className={player.playerId ? 'tt-event-top-player-card' : 'tt-event-top-player-card disabled'}
                      onClick={openPlayer(player.playerId)}
                      aria-disabled={!player.playerId}
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
                <span className="tt-player-section-note">{tournamentPlayers.length} players</span>
              </div>
              <AppSearchInput
                placeholder="Search tournament players..."
                value={playerQuery}
                onChange={(inputEvent) => setPlayerQuery(inputEvent.target.value)}
              />
              {filteredTournamentPlayers.length === 0 ? (
                <p className="tt-player-section-state mt-3">No players match this search.</p>
              ) : (
                <AppListGroup size="large" className="tt-player-list mt-3">
                  {filteredTournamentPlayers.map((player, index) => (
                    <AppListItem
                      key={player.key}
                      iconClassName="fa fa-user rounded-xl tt-icon-player"
                      title={player.name}
                      subtitle={`${player.wins}-${player.losses} · ${player.winRate}% · ${player.played} matches`}
                      onClick={openPlayer(player.playerId)}
                      trailingIconClassName={player.playerId ? undefined : ''}
                      borderless={index === filteredTournamentPlayers.length - 1}
                    />
                  ))}
                </AppListGroup>
              )}
            </section>

            <section className="tt-player-section" aria-labelledby="tt-matches-list-title">
              <div className="tt-player-section-header">
                <h2 id="tt-matches-list-title" className="tt-player-section-title">Tournament Results</h2>
                <span className="tt-player-section-note">{results.length} matches</span>
              </div>

              {groupedResults.length === 0 ? (
                <p className="tt-player-section-state">No match results available for this tournament.</p>
              ) : (
                groupedResults.map(([roundName, matches]) => (
                  <div key={roundName} className="tt-tournament-round">
                    <div className="tt-tournament-round-heading">
                      <h3>{roundName}</h3>
                      <span>{matches.length} matches</span>
                    </div>

                    <AppListGroup size="large" className="tt-player-list">
                      {matches.map((match) => {
                        const isHomeWinner = match.winner_side === 'home';
                        const winnerName = isHomeWinner ? match.home_player_name : match.away_player_name;
                        const outcomeLabel = isHomeWinner ? 'Home win' : 'Away win';
                        const homeTone = isHomeWinner ? 'winner' : 'loser';
                        const awayTone = isHomeWinner ? 'loser' : 'winner';
                        const timeLabel = match.played_at
                          ? new Date(match.played_at).toLocaleTimeString('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                          : null;

                        return (
                          <AppListItem
                            key={match.id}
                            href={null}
                            className="tt-event-match-row"
                            iconClassName="fa fa-table-tennis rounded-xl tt-icon-result"
                            title={(
                              <span className="tt-event-match-players">
                                <a
                                  href="#"
                                  className={`tt-event-player-link ${homeTone}`}
                                  onClick={openPlayer(match.home_player_resolved_id)}
                                  aria-disabled={!match.home_player_resolved_id}
                                >
                                  {match.home_player_name}
                                </a>
                                <span className="tt-event-match-vs">vs</span>
                                <a
                                  href="#"
                                  className={`tt-event-player-link ${awayTone}`}
                                  onClick={openPlayer(match.away_player_resolved_id)}
                                  aria-disabled={!match.away_player_resolved_id}
                                >
                                  {match.away_player_name}
                                </a>
                              </span>
                            )}
                            subtitle={timeLabel ? `${timeLabel} · ${outcomeLabel}: ${winnerName}` : `${outcomeLabel}: ${winnerName}`}
                            trailingIconClassName=""
                          />
                        );
                      })}
                    </AppListGroup>
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
