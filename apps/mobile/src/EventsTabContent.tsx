import { useEffect, useMemo, useState } from 'react';
import { FavouriteButton } from './components/FavouriteButton';
import { useFavouriteTournaments } from './hooks/useFavouriteTournaments';
import {
  useManualTournamentSubmissions,
  type ManualTournamentSubmissionItem,
} from './hooks/useManualTournamentSubmissions';
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
import { getTournamentEntryDeadlineStatus } from './tournament-entry-deadline';
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
  BottomSheet,
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
type TournamentListScope = 'all' | 'saved' | 'submitted';

interface ManualSubmitResponse {
  competition_id: string;
  status: 'processing' | 'already_submitted';
  duplicate: boolean;
}

const LIST_SCOPE_OPTIONS: Array<{
  value: TournamentListScope;
  label: string;
  iconClassName: string;
}> = [
  { value: 'all', label: 'All', iconClassName: 'fa fa-list-ul' },
  { value: 'saved', label: 'Saved', iconClassName: 'fa fa-heart' },
  { value: 'submitted', label: 'My submissions', iconClassName: 'fa fa-upload' },
];

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
  const deadlineStatus = getTournamentEntryDeadlineStatus(event.entry_deadline, event.status);
  const statusLabel = isUpcoming
    ? deadlineStatus.label
      ?? (event.status === 'entries_open'
        ? 'Entries open'
        : event.status === 'entries_closed'
          ? 'Entries closed'
          : 'Upcoming')
    : 'Completed';
  const statusTone = isUpcoming
    ? deadlineStatus.tone
      ?? (event.status === 'entries_open'
        ? 'success'
        : event.status === 'entries_closed'
          ? 'danger'
          : 'accent')
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
        message="Choose All in Filters, then use the heart beside a tournament to save it."
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

function submissionVenue(submission: ManualTournamentSubmissionItem): string | null {
  return submission.venue_name ?? submission.venue_town ?? submission.venue_postcode;
}

function submissionSourceLabel(sourceUrl: string): string {
  try {
    const hostname = new URL(sourceUrl).hostname.replace(/^www\./, '');
    return hostname === 'docs.google.com' ? 'Google Forms' : hostname;
  } catch {
    return 'Submitted link';
  }
}

function submissionDateLabel(submittedAt: string): string {
  const value = new Date(submittedAt);
  if (Number.isNaN(value.getTime())) return 'Submitted';
  return `Submitted ${value.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

function SubmissionDateTile({ submission }: { submission: ManualTournamentSubmissionItem }) {
  if (submission.status === 'processing') {
    return (
      <span className="tt-tournament-date-tile tt-tournament-date-tile--unknown" aria-label="Processing tournament details">
        <i className="fa fa-spinner fa-spin" aria-hidden="true" />
      </span>
    );
  }
  if (submission.status === 'failed') {
    return (
      <span className="tt-tournament-date-tile tt-tournament-date-tile--unknown" aria-label="Tournament processing failed">
        <i className="fa fa-exclamation" aria-hidden="true" />
      </span>
    );
  }

  const parts = submission.start_date ? getTournamentDateParts(submission.start_date) : null;
  if (!parts) {
    return (
      <span className="tt-tournament-date-tile tt-tournament-date-tile--unknown" aria-label="Date unavailable">
        <i className="fa fa-check" aria-hidden="true" />
      </span>
    );
  }

  return (
    <span className="tt-tournament-date-tile" aria-label={parts.fullLabel} title={parts.fullLabel}>
      <span className="tt-tournament-date-tile__month" aria-hidden="true">{parts.month}</span>
      <span className="tt-tournament-date-tile__day" aria-hidden="true">{parts.day}</span>
    </span>
  );
}

function SubmissionMetadata({ submission }: { submission: ManualTournamentSubmissionItem }) {
  const normalDetails = [
    submission.category,
    submissionVenue(submission),
    submissionSourceLabel(submission.source_url),
  ].filter(Boolean).join(' · ');
  const details = submission.status === 'failed' && submission.status_message
    ? submission.status_message
    : normalDetails || 'Submitted tournament';
  const statusLabel = submission.status === 'processing'
    ? 'Processing'
    : submission.status === 'failed'
      ? 'Couldn’t process'
      : submission.status === 'merged'
        ? 'Added to existing tournament'
        : 'Published';
  const statusTone = submission.status === 'published'
    ? 'success'
    : submission.status === 'failed'
      ? 'danger'
      : submission.status === 'processing'
        ? 'accent'
        : 'neutral';

  return (
    <span className="tt-tournament-timeline-item__metadata">
      <span className="tt-tournament-timeline-item__details">{details}</span>
      <span className="tt-tournament-timeline-item__status-row">
        <Pill tone={statusTone} size="xs">{statusLabel}</Pill>
        <span className="tt-tournament-timeline-item__match-count">
          {submissionDateLabel(submission.submitted_at)}
        </span>
      </span>
    </span>
  );
}

interface ManualSubmissionResultsProps {
  items: ManualTournamentSubmissionItem[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  onRetry: () => void;
  onOpen: (competitionId: string) => void;
}

function ManualSubmissionResults({
  items,
  isLoading,
  error,
  searchQuery,
  onRetry,
  onOpen,
}: ManualSubmissionResultsProps) {
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    if (!normalizedSearch) return items;
    return items.filter((submission) => [
      submission.name,
      submission.category,
      submissionVenue(submission),
      submission.source_url,
    ].some((value) => value?.toLowerCase().includes(normalizedSearch)));
  }, [items, normalizedSearch]);

  let state = null;
  if (isLoading) {
    state = <EmptyState iconClassName="fa fa-spinner fa-spin" title="Loading your submissions…" />;
  } else if (error && items.length === 0) {
    state = <ErrorState message={error} onRetry={onRetry} />;
  } else if (filteredItems.length === 0) {
    state = (
      <EmptyState
        iconClassName="fa fa-upload"
        title={normalizedSearch ? 'No submissions found' : 'No tournament submissions yet'}
        message={normalizedSearch
          ? `No submissions matching “${searchQuery.trim()}”.`
          : 'Use Post to add a tournament from its entry form or information link.'}
      />
    );
  }

  return (
    <PageSection surface="flat" density="compact" className="tt-tournament-results-section">
      <h2 className="tt-visually-hidden">My tournament submissions</h2>
      {state ?? (
        <DesignList
          density="editorial"
          surface="grouped"
          textWrap="multiline"
          divider="none"
          paginate={false}
          className="tt-tournament-timeline-list"
        >
          {filteredItems.map((submission) => {
            const resolved = submission.status === 'published' || submission.status === 'merged';
            return (
              <ListItem
                key={submission.submission_id}
                leading={<SubmissionDateTile submission={submission} />}
                title={submission.name ?? (submission.status === 'failed'
                  ? 'Couldn’t read tournament details'
                  : 'Processing tournament details…')}
                subtitle={<SubmissionMetadata submission={submission} />}
                onClick={resolved ? () => onOpen(submission.competition_id) : undefined}
                trailing={submission.status === 'processing'
                  ? <i className="fa fa-clock-o" aria-hidden="true" />
                  : submission.status === 'failed'
                    ? <i className="fa fa-exclamation-circle" aria-hidden="true" />
                    : <i className="fa fa-angle-right" aria-hidden="true" />}
              />
            );
          })}
        </DesignList>
      )}
    </PageSection>
  );
}

export function EventsTabContent() {
  const { navigateInActiveTab } = useTabNavigation();
  const auth = useAuth();
  const [initialPreferences] = useState(() => readTournamentPreferences());
  const [status, setStatus] = useState<TournamentListStatus>(initialPreferences.status);
  const [listScope, setListScope] = useState<TournamentListScope>(initialPreferences.savedOnly ? 'saved' : 'all');
  const [categoryFiltersOpen, setCategoryFiltersOpen] = useState(false);
  const [categories, setCategories] = useState<TournamentCategoryFilter[]>(initialPreferences.categories);
  const [searchOpen, setSearchOpen] = useState(false);
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
  const savedOnly = listScope === 'saved';
  const savedIds = useMemo(
    () => savedOnly ? favouriteTournaments.map((event) => event.id) : [],
    [favouriteTournaments, savedOnly],
  );
  const mayFetch = listScope !== 'submitted' && !(savedOnly && favouriteTournaments.length === 0);
  const categoryFilterActive = categories.length > 0;
  const activeFilterCount = categories.length + (listScope === 'all' ? 0 : 1);
  const manualSubmissions = useManualTournamentSubmissions(
    auth.session?.access_token,
    listScope === 'submitted',
  );

  useEffect(() => {
    writeTournamentPreferences({ status, savedOnly, categories });
  }, [categories, savedOnly, status]);

  useEffect(() => {
    if (!auth.session) {
      setManualSubmitOpen(false);
      if (listScope === 'submitted') setListScope('all');
    }
  }, [auth.session, listScope]);

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

  const chooseListScope = (scope: TournamentListScope) => {
    setListScope(scope);
  };

  const openManualSubmit = () => {
    setCategoryFiltersOpen(false);
    setManualSubmitOpen(true);
    setManualSubmitState('idle');
    setManualSubmitMessage('');
  };

  const closeSearch = () => {
    // Keep the active query so closing search only collapses the field;
    // results stay filtered until the user clears the query explicitly.
    setSearchOpen(false);
  };

  const clearFilters = () => {
    setListScope('all');
    setCategories([]);
  };

  const submitManualTournament = async () => {
    const session = auth.session;
    const url = manualSubmitUrl.trim();
    if (manualSubmitState === 'submitting') return;
    if (!session) {
      setManualSubmitState('error');
      setManualSubmitMessage('Your session expired. Please sign in again.');
      return;
    }
    if (!url) {
      setManualSubmitState('error');
      setManualSubmitMessage('Enter a tournament link.');
      return;
    }

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
          : 'Tournament submitted. Processing details…',
      );
      setManualSubmitOpen(false);
      setSearchOpen(false);
      search.setQuery('');
      setListScope('submitted');
    } catch (error) {
      setManualSubmitState('error');
      setManualSubmitMessage(
        error instanceof Error ? error.message : 'Could not submit this tournament link.',
      );
    }
  };

  const searchLabel = listScope === 'submitted'
    ? 'Search my tournament submissions'
    : `Search ${status} tournaments`;
  const searchPlaceholder = listScope === 'submitted'
    ? 'Search my submissions…'
    : `Search ${status} tournaments…`;
  const filterLabel = activeFilterCount > 0
    ? `Tournament filters, ${activeFilterCount} active`
    : 'Tournament filters';

  return (
    <>
      <div className="tt-tournament-controls-panel">
        {searchOpen ? (
          <SearchToolbar
            ariaLabel={searchLabel}
            className="tt-tournament-search-toolbar"
            actions={(
              <AppToggleButton
                pressed={false}
                variant="icon"
                iconClassName="fa fa-times"
                className="tt-tournament-toolbar-icon"
                onClick={closeSearch}
                aria-label="Close tournament search"
                title="Close search"
              >
                <span className="tt-tournament-toolbar-icon__label">Close</span>
              </AppToggleButton>
            )}
          >
            <AppSearchInput
              autoFocus
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              placeholder={searchPlaceholder}
              aria-label={searchLabel}
              value={search.query}
              onChange={(event) => search.setQuery(event.target.value)}
            />
          </SearchToolbar>
        ) : (
          <div className="tt-tournament-filter-rail" role="group" aria-label="Tournament browse controls">
            {listScope !== 'submitted' ? (
              <SegmentedToggle
                full
                ariaLabel="Tournament status"
                value={status}
                onChange={setStatus}
                className="tt-tournament-status-toggle"
                options={[
                  { value: 'upcoming', label: 'Upcoming' },
                  { value: 'completed', label: 'Completed' },
                ]}
              />
            ) : (
              <div className="tt-tournament-scope-summary" aria-label="Showing my tournament submissions">
                <i className="fa fa-upload" aria-hidden="true" />
                <span>My submissions</span>
              </div>
            )}

            <AppToggleButton
              pressed={categoryFiltersOpen || activeFilterCount > 0}
              variant="icon"
              iconClassName="fa fa-filter"
              className="tt-tournament-toolbar-icon tt-tournament-filter-button"
              onClick={() => setCategoryFiltersOpen(true)}
              aria-label={filterLabel}
              aria-expanded={categoryFiltersOpen}
              title="Tournament filters"
            >
              <span className="tt-tournament-toolbar-icon__label">Filters</span>
              {activeFilterCount > 0 ? (
                <span className="tt-tournament-toolbar-icon__count" aria-hidden="true">
                  {activeFilterCount}
                </span>
              ) : null}
            </AppToggleButton>

            <AppToggleButton
              pressed={Boolean(search.query.trim())}
              variant="icon"
              iconClassName="fa fa-search"
              className="tt-tournament-toolbar-icon"
              onClick={() => setSearchOpen(true)}
              aria-label={search.query.trim()
                ? `Search tournaments, active query ${search.query.trim()}`
                : 'Search tournaments'}
              title="Search tournaments"
            >
              <span className="tt-tournament-toolbar-icon__label">Search</span>
            </AppToggleButton>
          </div>
        )}

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
        {!manualSubmitOpen && manualSubmitMessage ? (
          <p
            className={`tt-tournament-manual-submit__message tt-tournament-manual-submit__message--${manualSubmitState}`}
            role={manualSubmitState === 'error' ? 'alert' : 'status'}
          >
            {manualSubmitMessage}
          </p>
        ) : null}
      </div>

      {listScope === 'submitted' ? (
        <ManualSubmissionResults
          items={manualSubmissions.items}
          isLoading={manualSubmissions.isLoading}
          error={manualSubmissions.error}
          searchQuery={search.query}
          onRetry={() => void manualSubmissions.retry()}
          onOpen={(id) => navigateInActiveTab(`event/${id}`)}
        />
      ) : (
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
      )}

      <BottomSheet
        isOpen={categoryFiltersOpen}
        onClose={() => setCategoryFiltersOpen(false)}
        title="Filters"
        description="Choose which tournaments you want to see."
        height="min(68dvh, 520px)"
      >
        <div className="tt-tournament-filter-sheet">
          <section className="tt-tournament-filter-sheet__section" aria-labelledby="tournament-filter-scope-title">
            <h3 id="tournament-filter-scope-title" className="tt-tournament-filter-sheet__heading">Show</h3>
            <FilterBar
              ariaLabel="Tournament list filters"
              className="tt-tournament-scope-filters"
            >
              {LIST_SCOPE_OPTIONS
                .filter((option) => option.value !== 'submitted' || Boolean(auth.session))
                .map((option) => (
                  <AppToggleButton
                    key={option.value}
                    pressed={listScope === option.value}
                    size="sm"
                    variant="filter"
                    className="tt-tournament-scope-filter"
                    onClick={() => chooseListScope(option.value)}
                  >
                    <i className={option.iconClassName} aria-hidden="true" />
                    {option.label}
                  </AppToggleButton>
                ))}
            </FilterBar>
            {auth.session ? (
              <AppButton
                tone="outline"
                size="sm"
                full
                className="tt-tournament-filter-sheet__post"
                onClick={openManualSubmit}
              >
                <i className="fa fa-plus" aria-hidden="true" />
                Post a tournament
              </AppButton>
            ) : null}
          </section>

          {listScope !== 'submitted' ? (
            <section className="tt-tournament-filter-sheet__section" aria-labelledby="tournament-filter-category-title">
              <h3 id="tournament-filter-category-title" className="tt-tournament-filter-sheet__heading">Category</h3>
              <FilterBar
                ariaLabel="Tournament category filters"
                className="tt-tournament-category-filters__options"
              >
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
            </section>
          ) : null}

          <div className="tt-tournament-filter-sheet__footer">
            {activeFilterCount > 0 ? (
              <AppButton
                tone="ghost"
                size="s"
                className="tt-tournament-category-filters__clear"
                onClick={clearFilters}
              >
                Clear filters
              </AppButton>
            ) : <span />}
            <AppButton
              size="s"
              onClick={() => setCategoryFiltersOpen(false)}
            >
              Done
            </AppButton>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
