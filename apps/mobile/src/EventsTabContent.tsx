import { useState, useEffect } from 'react';
import { useEventsQuery } from './queries';
import { usePageNavigation } from './hooks/usePageNavigation';
import { formatDate, type EventItem, parseStoredFavouriteTournaments, persistFavouriteTournaments, FAVOURITE_TOURNAMENTS_UPDATED_EVENT, type FavouriteTournament } from './player-shared';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import {
  AppListGroup,
  AppListItem,
  AppLoadingCard,
  AppMessageCard,
  AppSearchInput,
} from './ui/appkit';

const PAGE_SIZE = 25;

export function EventsTabContent() {
  const { navigateInActiveTab } = usePageNavigation();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 250);

  const [events, setEvents] = useState<EventItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [favouriteTournaments, setFavouriteTournaments] = useState<FavouriteTournament[]>(() => parseStoredFavouriteTournaments());

  const eventsQuery = useEventsQuery(debouncedQuery, PAGE_SIZE, offset);

  // Reset pagination state when query changes
  useEffect(() => {
    setOffset(0);
    setEvents([]);
    setTotal(0);
  }, [debouncedQuery]);

  // Append data when page loads
  useEffect(() => {
    if (eventsQuery.data) {
      setTotal(eventsQuery.data.total);
      setEvents((prev) => {
        if (offset === 0) return eventsQuery.data.data;
        const existingIds = new Set(prev.map((item) => item.id));
        return [...prev, ...eventsQuery.data.data.filter((item) => !existingIds.has(item.id))];
      });
    }
  }, [eventsQuery.data, offset]);

  // Sync saved tournaments from localStorage reactively
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

  const pageError = eventsQuery.error instanceof Error ? eventsQuery.error.message : null;
  const isLoadingInitial = eventsQuery.isLoading && offset === 0;
  const isLoadingMore = eventsQuery.isLoading && offset > 0;
  const hasMore = events.length < total;

  const handleLoadMore = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (isLoadingMore || !hasMore) return;
    setOffset((prev) => prev + PAGE_SIZE);
  };

  return (
    <>
      <section className="tt-players-search-panel" aria-label="Tournament search">
        <div className="tt-players-search-top">
          <div>
            <p className="tt-player-eyebrow">Tournaments</p>
            <h1 className="tt-players-search-title">Find a tournament</h1>
          </div>
        </div>
        <AppSearchInput
          placeholder="Search tournaments by name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </section>

      {/* Saved Tournaments Section */}
      {favouriteTournaments.length > 0 && !query ? (
        <section className="tt-player-section mb-4" aria-labelledby="tt-favourite-tournaments-title">
          <div className="tt-player-section-header">
            <h2 id="tt-favourite-tournaments-title" className="tt-player-section-title">Saved Tournaments</h2>
            <span className="tt-player-section-note">{favouriteTournaments.length} saved</span>
          </div>

          <AppListGroup size="large" className="tt-player-list">
            {favouriteTournaments.map((event, index) => {
              const dateStr = event.event_date ? formatDate(event.event_date) : 'Unknown Date';
              const matchLabel = event.match_count === 1 ? '1 match' : `${event.match_count} matches`;

              return (
                <AppListItem
                  key={event.id}
                  iconClassName="fa fa-heart rounded-xl tt-icon-tournament"
                  title={event.name}
                  subtitle={`${dateStr} · ${event.category ?? 'Tournament'} · ${matchLabel}`}
                  trailingElement={
                    <button
                      type="button"
                      className="tt-player-remove-badge"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const next = favouriteTournaments.filter((t) => t.id !== event.id);
                        setFavouriteTournaments(next);
                        persistFavouriteTournaments(next);
                      }}
                    >
                      Remove
                    </button>
                  }
                  onClick={(e) => {
                    e.preventDefault();
                    navigateInActiveTab(`event/${event.id}`);
                  }}
                  borderless={index === favouriteTournaments.length - 1}
                />
              );
            })}
          </AppListGroup>
        </section>
      ) : null}

      {isLoadingInitial ? (
        <AppLoadingCard message="Loading tournaments list..." />
      ) : pageError && events.length === 0 ? (
        <AppMessageCard
          title="Failed to load events"
          message={pageError}
          action={{ label: 'Retry', onClick: () => eventsQuery.refetch() }}
        />
      ) : events.length === 0 ? (
        <AppMessageCard
          title="No events found"
          message={query ? `No tournaments found matching "${query}"` : "No scraped tournament events found in the database."}
        />
      ) : (
        <>
          <section className="tt-player-section" aria-labelledby="tt-tournament-results-title">
            <div className="tt-player-section-header">
              <h2 id="tt-tournament-results-title" className="tt-player-section-title">
                {query ? 'Search Results' : 'Recent Tournaments'}
              </h2>
              <span className="tt-player-section-note">{events.length} shown</span>
            </div>
            <AppListGroup size="large" className="tt-player-list">
              {events.map((event, index) => {
                const dateStr = event.event_date ? formatDate(event.event_date) : 'Unknown Date';
                const matchLabel = event.match_count === 1 ? '1 match' : `${event.match_count} matches`;

                return (
                  <AppListItem
                    key={event.id}
                    iconClassName="fa fa-trophy rounded-xl tt-icon-tournament"
                    title={event.name}
                    subtitle={`${dateStr} · ${event.category ?? 'Tournament'} · ${matchLabel}`}
                    onClick={(e) => {
                      e.preventDefault();
                      navigateInActiveTab(`event/${event.id}`);
                    }}
                    borderless={index === events.length - 1}
                  />
                );
              })}
            </AppListGroup>
          </section>

          <div className="content mt-0 mb-4 text-center">
            <p className="color-theme opacity-50 font-11 mb-2">
              Showing {events.length} of {total} tournaments
            </p>
            {hasMore && (
              <a
                href="#"
                onClick={handleLoadMore}
                className="btn btn-sm btn-full btn-border border-highlight color-highlight font-12 font-600 rounded-sm"
                style={{ width: '100%', display: 'block' }}
              >
                {isLoadingMore ? (
                  <>
                    <i className="fa fa-spinner fa-spin me-2" />
                    Loading more...
                  </>
                ) : (
                  'Load More Tournaments'
                )}
              </a>
            )}
          </div>
        </>
      )}
    </>
  );
}
