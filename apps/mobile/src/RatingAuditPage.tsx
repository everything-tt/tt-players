import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DetailHeader } from './components/DetailHeader';
import { SkeletonList } from './components/Skeleton';
import { usePlayerList } from './hooks/usePlayerList';
import { useSearch } from './hooks/useSearch';
import { useTabNavigation } from './navigation/tab-navigation';
import { getInitials, getQueryError } from './player-shared';
import {
  ratingConfidenceLabel,
  type PlayerRatingHistoryPoint,
  usePlayerRatingHistoryQuery,
  usePlayerRatingQuery,
} from './rating-queries';
import { TabShellPage } from './TabShellPage';
import {
  AppButtonLink,
  AppPageContent,
  AppSearchInput,
  DesignAvatar,
  DesignList,
  EmptyState,
  ErrorState,
  FilterBar,
  ListItem,
  MetricGrid,
  PageSection,
  Pill,
  SearchToolbar,
  SegmentedToggle,
  Surface,
} from './ui/appkit';

const SEARCH_PAGE_SIZE = 10;
const EMPTY_RATING_HISTORY: PlayerRatingHistoryPoint[] = [];

type HistoryAggregation = 'month' | 'quarter' | 'year';

interface AggregatedHistoryPoint {
  key: string;
  label: string;
  snapshotDate: string;
  rating: number;
  conservativeRating: number;
  matches: number;
  wins: number;
  losses: number;
  ratingChange: number | null;
}

const HISTORY_AGGREGATION_OPTIONS: Array<{ value: HistoryAggregation; label: string }> = [
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
];

function formatDate(value: string | null): string {
  if (!value) return 'Not available';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatRatingChange(value: number | null): string {
  if (value === null) return 'Starting point';
  const rounded = Math.round(value);
  if (rounded === 0) return 'No change';
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function historyBucket(point: PlayerRatingHistoryPoint, aggregation: HistoryAggregation) {
  const date = new Date(`${point.snapshot_date}T12:00:00Z`);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();

  if (aggregation === 'year') {
    return { key: String(year), label: String(year) };
  }

  if (aggregation === 'quarter') {
    const quarter = Math.floor(month / 3) + 1;
    return { key: `${year}-Q${quarter}`, label: `Q${quarter} ${year}` };
  }

  return {
    key: `${year}-${String(month + 1).padStart(2, '0')}`,
    label: new Intl.DateTimeFormat('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date),
  };
}

function aggregateHistory(
  history: PlayerRatingHistoryPoint[],
  aggregation: HistoryAggregation,
): AggregatedHistoryPoint[] {
  const buckets = new Map<string, Omit<AggregatedHistoryPoint, 'ratingChange'>>();
  const orderedHistory = [...history].sort((left, right) =>
    left.snapshot_date.localeCompare(right.snapshot_date));

  for (const point of orderedHistory) {
    const bucket = historyBucket(point, aggregation);
    const existing = buckets.get(bucket.key);

    if (!existing) {
      buckets.set(bucket.key, {
        key: bucket.key,
        label: bucket.label,
        snapshotDate: point.snapshot_date,
        rating: point.rating,
        conservativeRating: point.conservative_rating,
        matches: point.week_matches,
        wins: point.week_wins,
        losses: point.week_losses,
      });
      continue;
    }

    existing.snapshotDate = point.snapshot_date;
    existing.rating = point.rating;
    existing.conservativeRating = point.conservative_rating;
    existing.matches += point.week_matches;
    existing.wins += point.week_wins;
    existing.losses += point.week_losses;
  }

  const periods = Array.from(buckets.values()).sort((left, right) =>
    left.snapshotDate.localeCompare(right.snapshotDate));

  return periods
    .map((period, index) => ({
      ...period,
      ratingChange: index === 0 ? null : period.rating - (periods[index - 1]?.rating ?? period.rating),
    }))
    .reverse();
}

function aggregationLabel(aggregation: HistoryAggregation): string {
  if (aggregation === 'quarter') return 'quarterly';
  if (aggregation === 'year') return 'yearly';
  return 'monthly';
}

export function RatingAuditPage() {
  const navigate = useNavigate();
  const { playerId = '' } = useParams<{ playerId?: string }>();
  const { navigateInTab } = useTabNavigation();
  const [historyAggregation, setHistoryAggregation] = useState<HistoryAggregation>('month');
  const search = useSearch({ minLength: 3, resetOnDisable: false });
  const searchList = usePlayerList({
    search: search.debouncedQuery,
    leagueIds: [],
    savedIds: [],
    pageSize: SEARCH_PAGE_SIZE,
    enabled: search.isReady,
  });

  const ratingQuery = usePlayerRatingQuery(playerId, Boolean(playerId));
  const historyQuery = usePlayerRatingHistoryQuery(playerId, 'all', Boolean(playerId));
  const rating = ratingQuery.data?.data ?? null;
  const history = historyQuery.data?.data ?? EMPTY_RATING_HISTORY;
  const aggregatedHistory = useMemo(
    () => aggregateHistory(history, historyAggregation),
    [history, historyAggregation],
  );

  const selectPlayer = (id: string) => {
    navigate(`/rating-audit/${id}`);
  };

  const renderSearchResults = () => {
    if (!search.normalizedQuery) {
      return (
        <EmptyState
          iconClassName="fa fa-search"
          title="Choose a player"
          message="Search for any player to inspect how their public rating and rank are calculated."
        />
      );
    }

    if (!search.isReady) {
      return (
        <EmptyState
          iconClassName="fa fa-keyboard"
          title="Type at least 3 characters"
          message="Keep typing to search every player in TT Players."
        />
      );
    }

    if (searchList.isLoadingInitial) return <SkeletonList rows={5} />;

    if (searchList.error && searchList.items.length === 0) {
      return <ErrorState message={searchList.error} onRetry={() => void searchList.retry()} />;
    }

    if (searchList.items.length === 0) {
      return (
        <EmptyState
          iconClassName="fa fa-search"
          title="No players found"
          message={`No players match “${search.normalizedQuery}”.`}
        />
      );
    }

    return (
      <DesignList density="compact" divider="hairline" paginate={false}>
        {searchList.items.map((player) => (
          <ListItem
            key={player.id}
            leading={<DesignAvatar size="compact" text={getInitials(player.name)} />}
            title={player.name}
            subtitle={`${player.wins} wins · ${player.played} matches recorded`}
            trailing={player.id === playerId ? <Pill tone="accent">Selected</Pill> : undefined}
            onClick={() => selectPlayer(player.id)}
          />
        ))}
      </DesignList>
    );
  };

  const renderAudit = () => {
    if (!playerId) return null;

    if (ratingQuery.isLoading) {
      return (
        <PageSection surface="flat" density="compact" title="Rating audit">
          <SkeletonList rows={4} />
        </PageSection>
      );
    }

    if (ratingQuery.isError || !rating) {
      return (
        <PageSection surface="flat" density="compact" title="Rating audit">
          <EmptyState
            iconClassName="fa fa-chart-line"
            title="No calculated rating yet"
            message={getQueryError(ratingQuery.error) || 'This player does not yet have enough eligible singles results for a calculated rating.'}
          />
        </PageSection>
      );
    }

    const rankValue = rating.rank == null ? 'Not ranked' : `#${rating.rank}`;
    const statusLabel = rating.provisional ? 'Provisional' : 'Established';

    return (
      <>
        <PageSection
          surface="flat"
          density="compact"
          title={rating.player_name}
          note={`${statusLabel} · ${ratingConfidenceLabel(rating.confidence)} confidence`}
        >
          <MetricGrid
            density="compact"
            ariaLabel={`Rating audit summary for ${rating.player_name}`}
            metrics={[
              { label: 'Ability rating', value: Math.round(rating.rating) },
              { label: 'Ranking score', value: Math.round(rating.conservative_rating) },
              { label: 'Global rank', value: rankValue },
              { label: 'Rating deviation', value: Math.round(rating.rating_deviation) },
            ]}
          />

          <Surface variant="subtle">
            <p>
              The ability rating is the model&apos;s central estimate. Public ranking uses the more cautious score
              {' '}<strong>rating − 2 × rating deviation</strong>, so players with less evidence can rank below players
              with a lower central estimate.
            </p>
            <p>
              For this player: {Math.round(rating.rating)} − 2 × {Math.round(rating.rating_deviation)} = approximately
              {' '}{Math.round(rating.conservative_rating)}.
            </p>
          </Surface>

          <AppButtonLink
            full
            size="sm"
            tone="outline"
            onClick={(event) => {
              event.preventDefault();
              navigateInTab('players', `player/${rating.player_id}`);
            }}
          >
            <i className="fa fa-user" aria-hidden="true" />
            Open player profile
          </AppButtonLink>
        </PageSection>

        <PageSection
          surface="flat"
          density="compact"
          title="Evidence coverage"
          note={`${rating.rated_matches} eligible singles results`}
        >
          <MetricGrid
            density="compact"
            ariaLabel="Rating evidence coverage"
            metrics={[
              { label: 'Rated matches', value: rating.rated_matches },
              { label: 'Wins', value: rating.rated_wins },
              { label: 'Losses', value: rating.rated_losses },
              { label: 'Win rate', value: `${Math.round(rating.win_rate * 100)}%` },
            ]}
          />

          <DesignList density="compact" divider="hairline" paginate={false}>
            <ListItem title="First included result" trailing={formatDate(rating.first_rated_at)} />
            <ListItem title="Most recent included result" trailing={formatDate(rating.last_rated_at)} />
            <ListItem title="Confidence" trailing={ratingConfidenceLabel(rating.confidence)} />
            <ListItem title="Ranking status" trailing={statusLabel} />
          </DesignList>

          <Surface variant="subtle">
            <p>
              The model includes normal singles results with two known, distinct players, a valid date and a non-tied
              games score. Doubles, walkovers, retirements and void results do not affect this rating.
            </p>
          </Surface>
        </PageSection>

        <PageSection
          surface="flat"
          density="compact"
          title="Full rating history"
          note={history.length > 0
            ? `${aggregatedHistory.length} ${aggregationLabel(historyAggregation)} periods from ${history.length} weekly snapshots`
            : undefined}
        >
          <FilterBar ariaLabel="Rating history aggregation">
            <SegmentedToggle
              full
              ariaLabel="Aggregate rating history by month, quarter or year"
              value={historyAggregation}
              onChange={setHistoryAggregation}
              options={HISTORY_AGGREGATION_OPTIONS}
            />
          </FilterBar>

          {historyQuery.isLoading ? (
            <SkeletonList rows={8} />
          ) : historyQuery.isError ? (
            <ErrorState message={getQueryError(historyQuery.error)} onRetry={() => void historyQuery.refetch()} />
          ) : aggregatedHistory.length === 0 ? (
            <EmptyState
              iconClassName="fa fa-calendar-alt"
              title="No rating history yet"
              message="History will appear after the rating-history rebuild has processed this player."
            />
          ) : (
            <DesignList density="compact" divider="hairline" paginate={false}>
              {aggregatedHistory.map((period) => (
                <ListItem
                  key={period.key}
                  title={period.label}
                  subtitle={`${period.matches} rated matches · ${period.wins}W ${period.losses}L · rating ${Math.round(period.rating)} · ranking score ${Math.round(period.conservativeRating)}`}
                  trailing={<Pill tone="accent">{formatRatingChange(period.ratingChange)}</Pill>}
                />
              ))}
            </DesignList>
          )}

          <Surface variant="subtle">
            <p>
              Each row uses the final rating snapshot in that month, quarter or year. Match totals are summed across
              the weekly snapshots in the period. Historical global rank is not shown because complete all-player rank
              snapshots are not currently persisted; the historical conservative ranking score is shown instead.
            </p>
          </Surface>
        </PageSection>
      </>
    );
  };

  return (
    <TabShellPage>
      <DetailHeader title="Rating Audit" backFallback="/tabs/home" heading />
      <AppPageContent>
        <SearchToolbar ariaLabel="Search players for rating audit">
          <AppSearchInput
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Search players…"
            aria-label="Search players for rating audit"
            value={search.query}
            onChange={(event) => search.setQuery(event.target.value)}
          />
        </SearchToolbar>

        <PageSection
          surface="flat"
          density="compact"
          title="Find a player"
          meta={searchList.total == null || !search.isReady ? undefined : `${searchList.total} found`}
        >
          {renderSearchResults()}
        </PageSection>

        {renderAudit()}
      </AppPageContent>
    </TabShellPage>
  );
}
