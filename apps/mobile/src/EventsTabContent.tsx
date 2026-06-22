import { useState, useEffect } from 'react';
import { useEventsQuery } from './queries';
import { usePageNavigation } from './hooks/usePageNavigation';
import { formatDate, type EventItem, parseStoredFavouriteTournaments, persistFavouriteTournaments, FAVOURITE_TOURNAMENTS_UPDATED_EVENT, type FavouriteTournament } from './player-shared';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { SkeletonList } from './components/Skeleton';
import {
  AppListGroup,
  AppListItem,
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

  const isSearchActive = query.trim().length > 0;
  const currentLimit = isSearchActive ? PAGE_SIZE : 10;

  const eventsQuery = useEventsQuery(debouncedQuery, currentLimit, isSearchActive ? offset : 0);

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

  const toggleFavourite = (event: EventItem | FavouriteTournament) => {
    const isFav = favouriteTournaments.some((t) => t.id === event.id);
    let next;
    if (isFav) {
      next = favouriteTournaments.filter((t) => t.id !== event.id);
    } else {
      const fav: FavouriteTournament = {
        id: event.id,
        name: event.name,
        event_date: event.event_date,
        category: event.category,
        platform_name: event.platform_name,
        match_count: event.match_count,
      };
      next = [fav, ...favouriteTournaments];
    }
    setFavouriteTournaments(next);
    persistFavouriteTournaments(next);
  };

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
      {favouriteTournaments.length > 0 && !isSearchActive ? (
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
        <section className="tt-player-section" aria-label="Loading tournaments">
          <div className="tt-player-section-header">
            <h2 className="tt-player-section-title">
              {isSearchActive ? 'Search Results' : 'Recent Tournaments'}
            </h2>
            <span className="tt-player-section-note">Loading</span>
          </div>
          <SkeletonList rows={isSearchActive ? 6 : 4} />
        </section>
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
                {isSearchActive ? 'Search Results' : 'Recent Tournaments'}
              </h2>
              <span className="tt-player-section-note">
                {isSearchActive ? `${events.length} shown` : 'Last 10'}
              </span>
            </div>
            <AppListGroup size="large" className="tt-player-list">
              {events.slice(0, isSearchActive ? undefined : 10).map((event, index) => {
                const dateStr = event.event_date ? formatDate(event.event_date) : 'Unknown Date';
                const matchLabel = event.match_count === 1 ? '1 match' : `${event.match_count} matches`;
                const isFav = favouriteTournaments.some((t) => t.id === event.id);

                return (
                  <AppListItem
                    key={event.id}
                    iconClassName="fa fa-trophy rounded-xl tt-icon-tournament"
                    title={event.name}
                    subtitle={`${dateStr} · ${event.category ?? 'Tournament'} · ${matchLabel}`}
                    trailingElement={
                      <button
                        type="button"
                        className={`tt-tournament-favourite-icon ${isFav ? 'active' : ''}`}
                        style={{
                          position: 'absolute',
                          right: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          color: isFav ? '#ff3b30' : 'rgba(255,255,255,0.3)',
                          cursor: 'pointer',
                          fontSize: '16px',
                          padding: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 10,
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleFavourite(event);
                        }}
                        aria-label={isFav ? `Remove ${event.name} from saved` : `Save ${event.name}`}
                      >
                        <i className={isFav ? 'fa fa-heart' : 'far fa-heart'} />
                      </button>
                    }
                    onClick={(e) => {
                      e.preventDefault();
                      navigateInActiveTab(`event/${event.id}`);
                    }}
                    borderless={index === Math.min(events.length, isSearchActive ? events.length : 10) - 1}
                  />
                );
              })}
            </AppListGroup>
          </section>

          {isSearchActive && (
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
          )}
        </>
      )}
    </>
  );
}
