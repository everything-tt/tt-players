import { useTabNavigation } from './navigation/tab-navigation';
import { useFavouriteTournaments } from './hooks/useFavouriteTournaments';
import { useSearch } from './hooks/useSearch';
import {
  useTournamentList,
  type TournamentEventItem,
} from './hooks/useTournamentList';
import { formatDateOrUnknown } from './player-shared';
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

const PAGE_SIZE = 20;

type TournamentListState = ReturnType<typeof useTournamentList>;

interface TournamentSectionProps {
  title: string;
  emptyTitle: string;
  emptyMessage: string;
  iconClassName: string;
  loadLabel: string;
  endLabel: string;
  list: TournamentListState;
  isSearchActive: boolean;
  searchQuery: string;
  isFavourite: (id: string) => boolean;
  onToggleFavourite: (event: TournamentEventItem) => void;
  onOpen: (id: string) => void;
  subtitle: (event: TournamentEventItem) => string;
}

function TournamentSection({
  title,
  emptyTitle,
  emptyMessage,
  iconClassName,
  loadLabel,
  endLabel,
  list,
  isSearchActive,
  searchQuery,
  isFavourite,
  onToggleFavourite,
  onOpen,
  subtitle,
}: TournamentSectionProps) {
  if (list.isLoadingInitial) {
    return (
      <PageSection surface="flat" density="compact" title={title} note="Loading">
        <EmptyState iconClassName="fa fa-spinner fa-spin" title="Loading…" />
      </PageSection>
    );
  }

  if (list.error && list.items.length === 0) {
    return (
      <PageSection surface="flat" density="compact" title={title}>
        <ErrorState message={list.error} onRetry={() => void list.retry()} />
      </PageSection>
    );
  }

  if (list.items.length === 0) {
    return (
      <PageSection surface="flat" density="compact" title={title}>
        <EmptyState
          iconClassName={iconClassName}
          title={isSearchActive ? `No ${title.toLowerCase()} found` : emptyTitle}
          message={isSearchActive
            ? `No ${title.toLowerCase()} matching “${searchQuery}”.`
            : emptyMessage}
        />
      </PageSection>
    );
  }

  return (
    <PageSection
      surface="flat"
      density="compact"
      title={title}
      note={`${list.items.length} shown`}
    >
      <DesignList density="compact" divider="hairline" paginate={false}>
        {list.items.map((event) => (
          <ListItem
            key={event.id}
            leading={<IconCircle iconClassName={iconClassName} tone="accent" />}
            title={event.name}
            subtitle={subtitle(event)}
            onClick={() => onOpen(event.id)}
            trailing={(
              <FavouriteButton
                size="icon"
                saved={isFavourite(event.id)}
                onToggle={() => onToggleFavourite(event)}
              />
            )}
          />
        ))}
      </DesignList>
      <InfiniteListFooter
        hasMore={list.hasMore}
        isLoading={list.isLoadingMore}
        autoLoad={!list.error}
        onLoadMore={list.loadMore}
        loadLabel={list.error ? `Retry loading ${title.toLowerCase()}` : loadLabel}
        loadingLabel={`Loading more ${title.toLowerCase()}…`}
        endLabel={`${endLabel} (${list.items.length})`}
      />
      <p className="tt-section-meta">Showing {list.items.length} of {list.total}</p>
    </PageSection>
  );
}

function formatVenue(event: TournamentEventItem): string | null {
  return event.venue_name ?? event.venue_town ?? event.venue_postcode;
}

function formatUpcomingSubtitle(event: TournamentEventItem): string {
  const parts = [
    formatDateOrUnknown(event.start_date ?? event.event_date),
    event.category ?? 'Tournament',
    formatVenue(event),
  ].filter(Boolean);

  if (event.status === 'entries_open') parts.push('Entries open');
  if (event.status === 'entries_closed') parts.push('Entries closed');
  return parts.join(' · ');
}

function formatResultSubtitle(event: TournamentEventItem): string {
  return [
    formatDateOrUnknown(event.start_date ?? event.event_date),
    event.category ?? 'Tournament',
    `${event.match_count} ${event.match_count === 1 ? 'match' : 'matches'}`,
  ].join(' · ');
}

export function EventsTabContent() {
  const { navigateInActiveTab } = useTabNavigation();
  const {
    items: favouriteTournaments,
    isFavourite,
    toggle: toggleFavourite,
  } = useFavouriteTournaments();
  const search = useSearch({ minLength: 0 });
  const { query, debouncedQuery, isActive } = search;

  const upcoming = useTournamentList({
    status: 'upcoming',
    search: debouncedQuery,
    pageSize: PAGE_SIZE,
  });
  const completed = useTournamentList({
    status: 'completed',
    search: debouncedQuery,
    pageSize: PAGE_SIZE,
  });

  return (
    <SearchPanel
      eyebrow="Tournaments"
      title="Find a tournament"
      placeholder="Search tournaments by name…"
      query={query}
      onQueryChange={search.setQuery}
    >
      {favouriteTournaments.length > 0 && !isActive ? (
        <PageSection
          surface="flat"
          density="compact"
          title="Saved Tournaments"
          note={`${favouriteTournaments.length} saved`}
        >
          <DesignList density="compact" divider="hairline" paginate={false}>
            {favouriteTournaments.map((event) => (
              <ListItem
                key={event.id}
                leading={<IconCircle iconClassName="fa fa-heart" tone="accent" />}
                title={event.name}
                subtitle={`${formatDateOrUnknown(event.event_date)} · ${event.category ?? 'Tournament'} · ${event.match_count} ${event.match_count === 1 ? 'match' : 'matches'}`}
                onClick={() => navigateInActiveTab(`event/${event.id}`)}
                trailing={(
                  <FavouriteButton
                    size="icon"
                    saved
                    onToggle={() => toggleFavourite(event)}
                  />
                )}
              />
            ))}
          </DesignList>
        </PageSection>
      ) : null}

      <TournamentSection
        title="Upcoming Tournaments"
        emptyTitle="No upcoming tournaments"
        emptyMessage="No published upcoming tournament events are available yet."
        iconClassName="fa fa-calendar"
        loadLabel="Load more upcoming tournaments"
        endLabel="All upcoming tournaments shown"
        list={upcoming}
        isSearchActive={isActive}
        searchQuery={query}
        isFavourite={isFavourite}
        onToggleFavourite={toggleFavourite}
        onOpen={(id) => navigateInActiveTab(`event/${id}`)}
        subtitle={formatUpcomingSubtitle}
      />

      <TournamentSection
        title="Recent Results"
        emptyTitle="No tournament results"
        emptyMessage="No completed tournament results are available yet."
        iconClassName="fa fa-trophy"
        loadLabel="Load more recent results"
        endLabel="All recent results shown"
        list={completed}
        isSearchActive={isActive}
        searchQuery={query}
        isFavourite={isFavourite}
        onToggleFavourite={toggleFavourite}
        onOpen={(id) => navigateInActiveTab(`event/${id}`)}
        subtitle={formatResultSubtitle}
      />
    </SearchPanel>
  );
}
