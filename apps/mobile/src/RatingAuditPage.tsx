import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DetailHeader } from './components/DetailHeader';
import { SkeletonList } from './components/Skeleton';
import { usePlayerList } from './hooks/usePlayerList';
import { useSearch } from './hooks/useSearch';
import { useTabNavigation } from './navigation/tab-navigation';
import { getInitials, getQueryError } from './player-shared';
import {
  ratingConfidenceLabel,
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
  ListItem,
  MetricGrid,
  PageSection,
  Pill,
  SearchToolbar,
  Surface,
} from './ui/appkit';

const SEARCH_PAGE_SIZE = 10;
const RECENT_HISTORY_LIMIT = 12;

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

export function RatingAuditPage() {
  const navigate = useNavigate();
  const { playerId = '' } = useParams<{ playerId?: string }>();
  const { navigateInTab } = useTabNavigation();
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
  const history = historyQuery.data?.data ?? [];
  const recentHistory = useMemo(
    () => [...history].reverse().slice(0, RECENT_HISTORY_LIMIT),
    [history],
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
          title="Recent rating periods"
          note={history.length > 0 ? `${history.length} weekly snapshots available` : undefined}
        >
          {historyQuery.isLoading ? (
            <SkeletonList rows={5} />
          ) : historyQuery.isError ? (
            <ErrorState message={getQueryError(historyQuery.error)} onRetry={() => void historyQuery.refetch()} />
          ) : recentHistory.length === 0 ? (
            <EmptyState
              iconClassName="fa fa-calendar-alt"
              title="No weekly history yet"
              message="Weekly snapshots will appear after this player has processed rating history."
            />
          ) : (
            <DesignList density="compact" divider="hairline" paginate={false}>
              {recentHistory.map((point) => (
                <ListItem
                  key={point.week_start}
                  title={formatDate(point.snapshot_date)}
                  subtitle={`${point.week_matches} rated matches · ${point.week_wins}W ${point.week_losses}L · rating ${Math.round(point.rating)}`}
                  trailing={<Pill tone="accent">{formatRatingChange(point.rating_change)}</Pill>}
                />
              ))}
            </DesignList>
          )}

          <Surface variant="subtle">
            <p>
              These are persisted weekly snapshots. Exact per-match rating changes are not stored yet, so this audit
              does not claim a precise rating impact for an individual result.
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
