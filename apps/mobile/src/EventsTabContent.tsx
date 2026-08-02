import { useMemo, useState } from 'react';
import { FavouriteButton } from './components/FavouriteButton';
import { useFavouriteTournaments } from './hooks/useFavouriteTournaments';
import {
  useTournamentList,
  type TournamentEventItem,
  type TournamentListStatus,
} from './hooks/useTournamentList';
import { useSearch } from './hooks/useSearch';
import { useTabNavigation } from './navigation/tab-navigation';
import { formatDateOrUnknown } from './player-shared';
import {
  AppSearchInput,
  AppToggleButton,
  DesignList,
  EmptyState,
  ErrorState,
  IconCircle,
  InfiniteListFooter,
  ListItem,
  PageSection,
  SearchToolbar,
  SegmentedToggle,
} from './ui/appkit';

const PAGE_SIZE = 10;
type TournamentListState = ReturnType<typeof useTournamentList>;

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

function formatCompletedSubtitle(event: TournamentEventItem): string {
  return [
    formatDateOrUnknown(event.start_date ?? event.event_date),
    event.category ?? 'Tournament',
    `${event.match_count} ${event.match_count === 1 ? 'match' : 'matches'}`,
  ].join(' · ');
}

interface TournamentResultsProps {
  status: TournamentListStatus;
  list: TournamentListState;
  savedOnly: boolean;
  hasSavedTournaments: boolean;
  searchQuery: string;
  isFavourite: (id: string) => boolean;
  onToggleFavourite: (event: TournamentEventItem) => void;
  onOpen: (id: string) => void;
}

function TournamentResults({
  status,
  list,
  savedOnly,
  hasSavedTournaments,
  searchQuery,
  isFavourite,
  onToggleFavourite,
  onOpen,
}: TournamentResultsProps) {
  const isUpcoming = status === 'upcoming';
  const title = isUpcoming ? 'Upcoming tournaments' : 'Completed tournaments';
  const iconClassName = isUpcoming ? 'fa fa-calendar' : 'fa fa-trophy';

  let state = null;
  if (savedOnly && !hasSavedTournaments) {
    state = (
      <EmptyState
        iconClassName="fa fa-heart-o"
        title="No saved tournaments"
        message="Turn off Saved, then use the heart beside a tournament to keep it here."
      />
    );
  } else if (list.isLoadingInitial) {
    state = <EmptyState iconClassName="fa fa-spinner fa-spin" title="Loading tournaments…" />;
  } else if (list.error && list.items.length === 0) {
    state = <ErrorState message={list.error} onRetry={() => void list.retry()} />;
  } else if (list.items.length === 0) {
    const hasQuery = searchQuery.trim().length > 0;
    state = (
      <EmptyState
        iconClassName={savedOnly ? 'fa fa-heart-o' : iconClassName}
        title={savedOnly
          ? 'No saved tournaments found'
          : hasQuery
            ? 'No tournaments found'
            : isUpcoming
              ? 'No upcoming tournaments'
              : 'No completed tournaments'}
        message={hasQuery
          ? `No ${status} tournaments matching “${searchQuery.trim()}”.`
          : savedOnly
            ? `No saved ${status} tournaments are available.`
            : `No published ${status} tournaments are available yet.`}
      />
    );
  }

  return (
    <PageSection
      surface="flat"
      density="compact"
      title={title}
      meta={state ? undefined : `${list.items.length} of ${list.total}`}
    >
      {state ?? (
        <>
          <DesignList density="compact" divider="hairline" paginate={false}>
            {list.items.map((event) => (
              <ListItem
                key={event.id}
                leading={<IconCircle iconClassName={iconClassName} tone="accent" />}
                title={event.name}
                subtitle={isUpcoming ? formatUpcomingSubtitle(event) : formatCompletedSubtitle(event)}
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
            loadLabel={list.error ? 'Retry loading tournaments' : 'Load more tournaments'}
            loadingLabel="Loading more tournaments…"
            endLabel={`All ${list.items.length} tournaments shown`}
          />
        </>
      )}
    </PageSection>
  );
}

export function EventsTabContent() {
  const { navigateInActiveTab } = useTabNavigation();
  const [status, setStatus] = useState<TournamentListStatus>('upcoming');
  const [savedOnly, setSavedOnly] = useState(false);
  const search = useSearch({ minLength: 0, resetOnDisable: false });
  const {
    items: favouriteTournaments,
    isFavourite,
    toggle: toggleFavourite,
  } = useFavouriteTournaments();
  const savedIds = useMemo(
    () => savedOnly ? favouriteTournaments.map((event) => event.id) : [],
    [favouriteTournaments, savedOnly],
  );
  const mayFetch = !(savedOnly && favouriteTournaments.length === 0);

  const upcoming = useTournamentList({
    status: 'upcoming',
    search: search.debouncedQuery,
    savedIds,
    enabled: status === 'upcoming' && mayFetch,
    pageSize: PAGE_SIZE,
  });
  const completed = useTournamentList({
    status: 'completed',
    search: search.debouncedQuery,
    savedIds,
    enabled: status === 'completed' && mayFetch,
    pageSize: PAGE_SIZE,
  });

  return (
    <>
      <div className="tt-browse-controls">
        <SegmentedToggle
          full
          ariaLabel="Tournament status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'completed', label: 'Completed' },
          ]}
        />
      </div>

      <SearchToolbar
        ariaLabel={`Search ${status} tournaments`}
        actions={(
          <AppToggleButton
            pressed={savedOnly}
            iconClassName={savedOnly ? 'fa fa-heart' : 'fa fa-heart-o'}
            onClick={() => setSavedOnly((current) => !current)}
            aria-label={savedOnly ? 'Show all tournaments' : 'Show saved tournaments only'}
          >
            Saved
          </AppToggleButton>
        )}
      >
        <AppSearchInput
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder={`Search ${status} tournaments…`}
          aria-label={`Search ${status} tournaments`}
          value={search.query}
          onChange={(event) => search.setQuery(event.target.value)}
        />
      </SearchToolbar>

      <TournamentResults
        status={status}
        list={status === 'upcoming' ? upcoming : completed}
        savedOnly={savedOnly}
        hasSavedTournaments={favouriteTournaments.length > 0}
        searchQuery={search.query}
        isFavourite={isFavourite}
        onToggleFavourite={toggleFavourite}
        onOpen={(id) => navigateInActiveTab(`event/${id}`)}
      />
    </>
  );
}
