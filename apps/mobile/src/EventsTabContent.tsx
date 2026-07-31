import { useEffect, useMemo, useState } from 'react';
import { useEventsQuery } from './queries';
import { useTabNavigation } from './navigation/tab-navigation';
import { useFavouriteTournaments } from './hooks/useFavouriteTournaments';
import { useSearch } from './hooks/useSearch';
import { formatDateOrUnknown, getQueryError, type EventItem } from './player-shared';
import {
  DesignList,
  EmptyState,
  ErrorState,
  IconCircle,
  InfiniteListFooter,
  ListItem,
  PageSection,
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
    if (!eventsQuery.data) return;
    setTotal(eventsQuery.data.total);
    setEvents((previous) => {
      if (offset === 0) return eventsQuery.data!.data;
      const existingIds = new Set(previous.map((item) => item.id));
      return [...previous, ...eventsQuery.data!.data.filter((item) => !existingIds.has(item.id))];
    });
  }, [eventsQuery.data, offset]);

  const pageError = getQueryError(eventsQuery.error);
  const isLoadingInitial = eventsQuery.isLoading && offset === 0;
  const isLoadingMore = eventsQuery.isFetching && offset > 0;
  const hasMore = events.length < total;
  const displayedEvents = useMemo(() => isSearchActive ? events : events.slice(0, RECENT_LIMIT), [events, isSearchActive]);
  const handleLoadMore = () => {
    if (eventsQuery.isError) { void eventsQuery.refetch(); return; }
    if (!isLoadingMore && hasMore) setOffset((previous) => previous + PAGE_SIZE);
  };

  return (
    <SearchPanel eyebrow="Tournaments" title="Find a tournament" placeholder="Search tournaments by name…" query={query} onQueryChange={search.setQuery}>
      {favouriteTournaments.length > 0 && !isSearchActive ? (
        <PageSection surface="flat" density="compact" title="Saved Tournaments" note={`${favouriteTournaments.length} saved`}>
          <DesignList density="compact" divider="hairline" paginate={false}>
            {favouriteTournaments.map((event) => (
              <ListItem key={event.id} leading={<IconCircle iconClassName="fa fa-heart" tone="accent" />} title={event.name} subtitle={`${formatDateOrUnknown(event.event_date)} · ${event.category ?? 'Tournament'} · ${event.match_count} ${event.match_count === 1 ? 'match' : 'matches'}`} onClick={() => navigateInActiveTab(`event/${event.id}`)} trailing={<FavouriteButton size="icon" saved onToggle={() => toggleFavourite(event)} />} />
            ))}
          </DesignList>
        </PageSection>
      ) : null}

      {isLoadingInitial ? (
        <PageSection surface="flat" density="compact" title={isSearchActive ? 'Search Results' : 'Recent Tournaments'} note="Loading">
          <EmptyState iconClassName="fa fa-spinner fa-spin" title="Loading…" />
        </PageSection>
      ) : pageError && events.length === 0 ? (
        <PageSection surface="flat" density="compact"><ErrorState message={pageError} onRetry={() => eventsQuery.refetch()} /></PageSection>
      ) : events.length === 0 ? (
        <PageSection surface="flat" density="compact" title={isSearchActive ? 'Search Results' : 'Recent Tournaments'}>
          <EmptyState iconClassName="fa fa-trophy" title={isSearchActive ? 'No tournaments found' : 'No tournaments yet'} message={query ? `No tournaments matching “${query}”.` : 'No scraped tournament events in the database yet.'} />
        </PageSection>
      ) : (
        <PageSection surface="flat" density="compact" title={isSearchActive ? 'Search Results' : 'Recent Tournaments'} note={isSearchActive ? `${events.length} shown` : `Last ${RECENT_LIMIT}`}>
          <DesignList density="compact" divider="hairline" paginate={false}>
            {displayedEvents.map((event: EventItem) => (
              <ListItem key={event.id} leading={<IconCircle iconClassName="fa fa-trophy" tone="accent" />} title={event.name} subtitle={`${formatDateOrUnknown(event.event_date)} · ${event.category ?? 'Tournament'} · ${event.match_count} ${event.match_count === 1 ? 'match' : 'matches'}`} onClick={() => navigateInActiveTab(`event/${event.id}`)} trailing={<FavouriteButton size="icon" saved={isFavourite(event.id)} onToggle={() => toggleFavourite(event)} />} />
            ))}
          </DesignList>
          {isSearchActive ? (
            <>
              <InfiniteListFooter hasMore={hasMore} isLoading={isLoadingMore} autoLoad={!pageError} onLoadMore={handleLoadMore} loadLabel={pageError ? 'Retry loading tournaments' : 'Load more tournaments'} loadingLabel="Loading more tournaments…" endLabel={`All ${events.length} tournaments shown`} />
              <p className="tt-section-meta">Showing {events.length} of {total}</p>
            </>
          ) : null}
        </PageSection>
      )}
    </SearchPanel>
  );
}
