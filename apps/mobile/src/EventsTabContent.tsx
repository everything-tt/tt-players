import { useEffect, useMemo, useState } from 'react';
import { FavouriteButton } from './components/FavouriteButton';
import { useFavouriteTournaments } from './hooks/useFavouriteTournaments';
import {
  useTournamentList,
  type TournamentEventItem,
  type TournamentListStatus,
} from './hooks/useTournamentList';
import { useSearch } from './hooks/useSearch';
import { useAuth } from './lib/auth';
import { useTabNavigation } from './navigation/tab-navigation';
import { API_BASE_URL } from './player-shared';
import {
  TOURNAMENT_CATEGORY_OPTIONS,
  toggleTournamentCategory,
  type TournamentCategoryFilter,
} from './tournament-category-filter';
import {
  getTournamentDateParts,
  getTournamentDateValue,
  groupTournamentTimeline,
} from './tournament-timeline';
import {
  readTournamentPreferences,
  writeTournamentPreferences,
} from './tournament-preferences';
import {
  AppButton,
  AppSearchInput,
  AppToggleButton,
  DesignList,
  EmptyState,
  ErrorState,
  FilterBar,
  InfiniteListFooter,
  ListItem,
  PageSection,
  Pill,
  SearchToolbar,
  SectionHeader,
  SegmentedToggle,
} from './ui/appkit';

const PAGE_SIZE = 10;
type TournamentListState = ReturnType<typeof useTournamentList>;
type ManualSubmitState = 'idle' | 'submitting' | 'success' | 'error';

interface ManualSubmitResponse {
  competition_id: string;
  status: 'processing' | 'already_submitted';
  duplicate: boolean;
}

function formatVenue(event: TournamentEventItem): string | null {
  return event.venue_name ?? event.venue_town ?? event.venue_postcode;
}

function TournamentDateTile({
  event,
  status,
}: {
  event: TournamentEventItem;
  status: TournamentListStatus;
}) {
  const parts = getTournamentDateParts(getTournamentDateValue(event));
  const className = `tt-tournament-date-tile${status === 'completed' ? ' tt-tournament-date-tile--completed' : ''}`;

  if (!parts) {
    return (
      <span className={`${className} tt-tournament-date-tile--unknown`} aria-label="Date unavailable">
        <i className="fa fa-calendar" aria-hidden="true" />
      </span>
    );
  }

  return (
    <span className={className} aria-label={parts.fullLabel} title={parts.fullLabel}>
      <span className="tt-tournament-date-tile__month" aria-hidden="true">{parts.month}</span>
      <span className="tt-tournament-date-tile__day" aria-hidden="true">{parts.day}</span>
    </span>
  );
}

function TournamentMetadata({
  event,
  status,
}: {
  event: TournamentEventItem;
  status: TournamentListStatus;
}) {
  const details = [event.category ?? 'Tournament', formatVenue(event)].filter(Boolean).join(' · ');
  const isUpcoming = status === 'upcoming';
  const statusLabel = isUpcoming
    ? event.status === 'entries_open'
      ? 'Entries open'
      : event.status === 'entries_closed'
        ? 'Entries closed'
        : 'Upcoming'
    : 'Completed';
  const statusTone = isUpcoming
    ? event.status === 'entries_open'
      ? 'success'
      : event.status === 'entries_closed'
        ? 'neutral'
        : 'accent'
    : 'neutral';

  return (
    <span className="tt-tournament-timeline-item__metadata">
      <span className="tt-tournament-timeline-item__details">{details}</span>
      <span className="tt-tournament-timeline-item__status-row">
        <Pill tone={statusTone} size="xs">{statusLabel}</Pill>
        {!isUpcoming ? (
          <span className="tt-tournament-timeline-item__match-count">
            {event.match_count} {event.match_count === 1 ? 'match' : 'matches'}
          </span>
        ) : null}
      </span>
    </span>
  );
}

interface TournamentResultsProps {
  status: TournamentListStatus;
  list: TournamentListState;
  savedOnly: boolean;
  hasSavedTournaments: boolean;
  hasCategoryFilters: boolean;
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
  hasCategoryFilters,
  searchQuery,
  isFavourite,
  onToggleFavourite,
  onOpen,
}: TournamentResultsProps) {
  const isUpcoming = status === 'upcoming';
  const title = isUpcoming ? 'Upcoming tournaments' : 'Completed tournaments';
  const iconClassName = isUpcoming ? 'fa fa-calendar' : 'fa fa-trophy';
  const groups = useMemo(
    () => groupTournamentTimeline(list.items, status),
    [list.items, status],
  );

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
    const hasFilters = savedOnly || hasCategoryFilters;
    state = (
      <EmptyState
        iconClassName={savedOnly ? 'fa fa-heart-o' : iconClassName}
        title={savedOnly
          ? 'No saved tournaments found'
          : hasQuery || hasFilters
            ? 'No tournaments found'
            : isUpcoming
              ? 'No upcoming tournaments'
              : 'No completed tournaments with results'}
        message={hasQuery
          ? `No ${status} tournaments matching “${searchQuery.trim()}”.`
          : hasFilters
            ? 'Try changing or clearing the active filters.'
            : isUpcoming
              ? 'No published upcoming tournaments are available yet.'
              : 'Completed tournaments appear after results have been imported.'}
      />
    );
  }

  return (
    <PageSection
      surface="flat"
      density="compact"
      className={`tt-tournament-results-section tt-tournament-results-section--${status}`}
    >
      <h2 className="tt-visually-hidden">{title}</h2>
      {state ?? (
        <>
          <div className="tt-tournament-timeline-groups">
            {groups.map((group) => {
              const headingId = `tournament-${status}-${group.key.replace(/[^a-z0-9-]/gi, '-')}`;
              const groupCount = group.items.length;
              return (
                <section
                  key={group.key}
                  className="tt-tournament-timeline-group"
                  aria-labelledby={headingId}
                >
                  <SectionHeader
                    title={<span id={headingId}>{group.label}</span>}
                    meta={`${groupCount} ${groupCount === 1 ? 'tournament' : 'tournaments'}`}
                    density="compact"
                    emphasis="standard"
                    className="tt-tournament-timeline-group__header"
                  />
                  <DesignList
                    density="editorial"
                    surface="grouped"
                    textWrap="multiline"
                    divider="none"
                    paginate={false}
                    className="tt-tournament-timeline-list"
                  >
                    {group.items.map((event) => (
                      <ListItem
                        key={event.id}
                        leading={<TournamentDateTile event={event} status={status} />}
                        title={event.name}
                        subtitle={<TournamentMetadata event={event} status={status} />}
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
                </section>
              );
            })}
          </div>
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
  const auth = useAuth();
  const [initialPreferences] = useState(() => readTournamentPreferences());
  const [status, setStatus] = useState<TournamentListStatus>(initialPreferences.status);
  const [savedOnly, setSavedOnly] = useState(initialPreferences.savedOnly);
  const [categoryFiltersOpen, setCategoryFiltersOpen] = useState(false);
  const [categories, setCategories] = useState<TournamentCategoryFilter[]>(initialPreferences.categories);
  const [manualSubmitOpen, setManualSubmitOpen] = useState(false);
  const [manualSubmitUrl, setManualSubmitUrl] = useState('');
  const [manualSubmitState, setManualSubmitState] = useState<ManualSubmitState>('idle');
  const [manualSubmitMessage, setManualSubmitMessage] = useState('');
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
  const categoryFilterActive = categories.length > 0;

  useEffect(() => {
    writeTournamentPreferences({ status, savedOnly, categories });
  }, [categories, savedOnly, status]);

  useEffect(() => {
    if (!auth.session) setManualSubmitOpen(false);
  }, [auth.session]);

  const upcoming = useTournamentList({
    status: 'upcoming',
    search: search.debouncedQuery,
    savedIds,
    categories,
    enabled: status === 'upcoming' && mayFetch,
    pageSize: PAGE_SIZE,
  });
  const completed = useTournamentList({
    status: 'completed',
    search: search.debouncedQuery,
    savedIds,
    categories,
    enabled: status === 'completed' && mayFetch,
    pageSize: PAGE_SIZE,
  });

  const submitManualTournament = async () => {
    const session = auth.session;
    const url = manualSubmitUrl.trim();
    if (!session || !url || manualSubmitState === 'submitting') return;

    setManualSubmitState('submitting');
    setManualSubmitMessage('');
    try {
      const response = await fetch(`${API_BASE_URL}/events/manual-submit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });
      const payload = await response.json() as ManualSubmitResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);

      setManualSubmitUrl('');
      setManualSubmitState('success');
      setManualSubmitMessage(
        payload.status === 'already_submitted'
          ? 'This tournament has already been submitted.'
          : payload.duplicate
            ? 'This tournament was already submitted and is still being processed.'
            : 'Submitted. Tournament details are being extracted from the link.',
      );
    } catch (error) {
      setManualSubmitState('error');
      setManualSubmitMessage(
        error instanceof Error ? error.message : 'Could not submit this tournament link.',
      );
    }
  };

  return (
    <>
      <div className="tt-tournament-controls-panel">
        <div className="tt-browse-controls tt-tournament-status-toggle">
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
          className="tt-tournament-search-toolbar"
          actions={(
            <>
              {auth.session ? (
                <AppToggleButton
                  pressed={manualSubmitOpen}
                  variant="icon"
                  iconClassName="fa fa-plus"
                  className="tt-tournament-toolbar-icon"
                  onClick={() => {
                    setManualSubmitOpen((current) => !current);
                    setManualSubmitState('idle');
                    setManualSubmitMessage('');
                  }}
                  aria-label={manualSubmitOpen ? 'Hide tournament submission' : 'Post a tournament'}
                  aria-expanded={manualSubmitOpen}
                  aria-controls="tournament-manual-submit"
                  title="Post a tournament"
                >
                  <span className="tt-tournament-toolbar-icon__label">Post</span>
                </AppToggleButton>
              ) : null}
              <AppToggleButton
                pressed={savedOnly}
                variant="icon"
                iconClassName={savedOnly ? 'fa fa-heart' : 'fa fa-heart-o'}
                className="tt-tournament-toolbar-icon"
                onClick={() => setSavedOnly((current) => !current)}
                aria-label={savedOnly ? 'Show all tournaments' : 'Show saved tournaments only'}
                title={savedOnly ? 'Show all tournaments' : 'Show saved tournaments only'}
              >
                <span className="tt-tournament-toolbar-icon__label">Saved</span>
              </AppToggleButton>
              <AppToggleButton
                pressed={categoryFiltersOpen || categoryFilterActive}
                variant="icon"
                iconClassName="fa fa-filter"
                className="tt-tournament-toolbar-icon"
                onClick={() => setCategoryFiltersOpen((current) => !current)}
                aria-label={categoryFiltersOpen ? 'Hide tournament category filters' : 'Show tournament category filters'}
                aria-expanded={categoryFiltersOpen}
                aria-controls="tournament-category-filters"
                title={categoryFiltersOpen ? 'Hide category filters' : 'Show category filters'}
              >
                <span className="tt-tournament-toolbar-icon__label">Categories</span>
                {categoryFilterActive ? (
                  <span className="tt-tournament-toolbar-icon__count" aria-hidden="true">
                    {categories.length}
                  </span>
                ) : null}
              </AppToggleButton>
            </>
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

        {auth.session && manualSubmitOpen ? (
          <form
            id="tournament-manual-submit"
            className="tt-tournament-manual-submit"
            onSubmit={(event) => {
              event.preventDefault();
              void submitManualTournament();
            }}
          >
            <label className="tt-tournament-manual-submit__label" htmlFor="tournament-manual-submit-url">
              Post tournament
            </label>
            <p className="tt-tournament-manual-submit__hint">
              Paste the tournament entry form or information link. We’ll extract the tournament details automatically.
            </p>
            <div className="tt-tournament-manual-submit__row">
              <input
                id="tournament-manual-submit-url"
                className="tt-tournament-manual-submit__input"
                type="url"
                inputMode="url"
                autoComplete="url"
                required
                placeholder="https://…"
                value={manualSubmitUrl}
                onChange={(event) => {
                  setManualSubmitUrl(event.target.value);
                  if (manualSubmitState !== 'submitting') {
                    setManualSubmitState('idle');
                    setManualSubmitMessage('');
                  }
                }}
              />
              <AppButton
                type="submit"
                size="sm"
                loading={manualSubmitState === 'submitting'}
                disabled={!manualSubmitUrl.trim()}
              >
                Post
              </AppButton>
            </div>
            {manualSubmitMessage ? (
              <p
                className={`tt-tournament-manual-submit__message tt-tournament-manual-submit__message--${manualSubmitState}`}
                role={manualSubmitState === 'error' ? 'alert' : 'status'}
              >
                {manualSubmitMessage}
              </p>
            ) : null}
          </form>
        ) : null}

        {categoryFiltersOpen ? (
          <div id="tournament-category-filters" className="tt-tournament-category-filters">
            <FilterBar ariaLabel="Tournament category filters" className="tt-tournament-category-filters__options">
              {TOURNAMENT_CATEGORY_OPTIONS.map((option) => (
                <AppToggleButton
                  key={option.value}
                  pressed={categories.includes(option.value)}
                  size="sm"
                  variant="filter"
                  className="tt-tournament-category-filter"
                  onClick={() => setCategories((current) => toggleTournamentCategory(current, option.value))}
                >
                  {option.label}
                </AppToggleButton>
              ))}
            </FilterBar>
            {categoryFilterActive ? (
              <AppButton
                tone="ghost"
                size="s"
                className="tt-tournament-category-filters__clear"
                onClick={() => setCategories([])}
              >
                Clear
              </AppButton>
            ) : null}
          </div>
        ) : null}
      </div>

      <TournamentResults
        status={status}
        list={status === 'upcoming' ? upcoming : completed}
        savedOnly={savedOnly}
        hasSavedTournaments={favouriteTournaments.length > 0}
        hasCategoryFilters={categoryFilterActive}
        searchQuery={search.query}
        isFavourite={isFavourite}
        onToggleFavourite={toggleFavourite}
        onOpen={(id) => navigateInActiveTab(`event/${id}`)}
      />
    </>
  );
}
