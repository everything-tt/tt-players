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
} from './ui/appkit';

export function EventDetailPage() {
  const { goBack, goHome } = usePageNavigation();
  const { eventId = '' } = useParams<{ eventId: string }>();

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
                        const timeLabel = match.played_at
                          ? new Date(match.played_at).toLocaleTimeString('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                          : null;

                        return (
                          <AppListItem
                            key={match.id}
                            iconClassName="fa fa-table-tennis rounded-xl tt-icon-result"
                            title={`${match.home_player_name} vs ${match.away_player_name}`}
                            subtitle={timeLabel ? `${timeLabel} · ${outcomeLabel}: ${winnerName}` : `${outcomeLabel}: ${winnerName}`}
                            onClick={(event) => event.preventDefault()}
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
