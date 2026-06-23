import { useEffect, useMemo, useState } from 'react';
import { useEventsQuery } from './queries';
import { useTabNavigation } from './navigation/tab-navigation';
import { useFavouriteTournaments } from './hooks/useFavouriteTournaments';
import { useSearch } from './hooks/useSearch';
import {
  formatDateOrUnknown,
  getQueryError,
  type EventItem,
} from './player-shared';
import {
  List,
  ListItem,
  IconCircle,
  EmptyState,
  ErrorState,
  SectionHeader,
  MoreButton,
} from './ui/appkit';
import { SearchPanel } from './components/SearchPanel';
import { FavouriteButton } from './components/FavouriteButton';

const PAGE_SIZE = 25;
const RECENT_LIMIT = 10;

export function EventsTabContent() {
  const { navigateInActiveTab } = useTabNavigation();
  const { items: favouriteTournaments, isFavourite, toggle: toggleFavourite } = useFavouriteTournaments();
  const search = useSearch({ minLength: 0 });
  const { query, debouncedQuery, isActive } = search;

  const [events, setEvents] = useState<EventItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);

  const isSearchActive = isActive;
  const currentLimit = isSearchActive ? PAGE_SIZE : RECENT_LIMIT;

  const eventsQuery = useEventsQuery(debouncedQuery, currentLimit, isSearchActive ? offset : 0);

  useEffect(() => { setOffset(0); setEvents([]); setTotal(0); }, [debouncedQuery]);

  useEffect(() => {
    if (eventsQuery.data) {
      setTotal(eventsQuery.data.total);
      setEvents((prev) => {
        if (offset === 0) return eventsQuery.data!.data;
        const existingIds = new Set(prev.map((i) => i.id));
        return [...prev, ...eventsQuery.data!.data.filter((i) => !existingIds.has(i.id))];
      });
    }
  }, [eventsQuery.data, offset]);

  const pageError = getQueryError(eventsQuery.error);
  const isLoadingInitial = eventsQuery.isLoading && offset === 0;
  const isLoadingMore = eventsQuery.isLoading && offset > 0;
  const hasMore = events.length < total;

  const displayedEvents = useMemo(
    () => (isSearchActive ? events : events.slice(0, RECENT_LIMIT)),
    [events, isSearchActive],
  );

  const handleLoadMore = () => { if (!isLoadingMore && hasMore) setOffset((p) => p + PAGE_SIZE); };

  return (
    <>
      <SearchPanel
        eyebrow="Tournaments"
        title="Find a tournament"
        placeholder="Search tournaments by name…"
        query={query}
        onQueryChange={search.setQuery}
      >
        {favouriteTournaments.length > 0 && !isSearchActive ? (
          <section className="tt-player-section" aria-labelledby="tt-favourite-tournaments-title">
            <SectionHeader title="Saved Tournaments" note={`${favouriteTournaments.length} saved`} />
            <List divider="hairline" size="lg">
              {favouriteTournaments.map((event) => (
                <ListItem
                  key={event.id}
                  leading={<IconCircle iconClassName="fa fa-heart" tone="accent" />}
                  title={event.name}
                  subtitle={`${formatDateOrUnknown(event.event_date)} · ${event.category ?? 'Tournament'} · ${event.match_count} ${event.match_count === 1 ? 'match' : 'matches'}`}
                  onClick={() => navigateInActiveTab(`event/${event.id}`)}
                  trailing={<FavouriteButton size="icon" saved onToggle={() => toggleFavourite(event)} />}
                />
              ))}
            </List>
          </section>
        ) : null}

        {isLoadingInitial ? (
          <section className="tt-player-section">
            <SectionHeader title={isSearchActive ? 'Search Results' : 'Recent Tournaments'} note="Loading" />
            <EmptyState iconClassName="fa fa-spinner fa-spin" title="Loading…" />
          </section>
        ) : pageError && events.length === 0 ? (
          <section className="tt-player-section">
            <ErrorState message={pageError} onRetry={() => eventsQuery.refetch()} />
          </section>
        ) : events.length === 0 ? (
          <section className="tt-player-section">
            <SectionHeader title={isSearchActive ? 'Search Results' : 'Recent Tournaments'} />
            <EmptyState
              iconClassName="fa fa-trophy"
              title={isSearchActive ? 'No tournaments found' : 'No tournaments yet'}
              message={query ? `No tournaments matching “${query}”.` : 'No scraped tournament events in the database yet.'}
            />
          </section>
        ) : (
          <section className="tt-player-section" aria-labelledby="tt-tournament-results-title">
            <SectionHeader
              title={isSearchActive ? 'Search Results' : 'Recent Tournaments'}
              note={isSearchActive ? `${events.length} shown` : `Last ${RECENT_LIMIT}`}
            />
            <List divider="hairline" size="lg">
              {displayedEvents.map((event: EventItem) => (
                <ListItem
                  key={event.id}
                  leading={<IconCircle iconClassName="fa fa-trophy" tone="accent" />}
                  title={event.name}
                  subtitle={`${formatDateOrUnknown(event.event_date)} · ${event.category ?? 'Tournament'} · ${event.match_count} ${event.match_count === 1 ? 'match' : 'matches'}`}
                  onClick={() => navigateInActiveTab(`event/${event.id}`)}
                  trailing={<FavouriteButton size="icon" saved={isFavourite(event.id)} onToggle={() => toggleFavourite(event)} />}
                />
              ))}
            </List>
            {isSearchActive && hasMore ? (
              <div className="mt-3">
                <MoreButton loading={isLoadingMore} hasMore={hasMore} onClick={handleLoadMore}>
                  Load more tournaments
                </MoreButton>
                <p className="tt-section-meta mt-2">Showing {events.length} of {total}</p>
              </div>
            ) : null}
          </section>
        )}
      </SearchPanel>
    </>
  );
}
