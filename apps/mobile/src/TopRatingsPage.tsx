import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DetailHeader } from './components/DetailHeader';
import { SkeletonList } from './components/Skeleton';
import { LEAGUES_STORAGE_KEY } from './local-persistence';
import { useTabNavigation } from './navigation/tab-navigation';
import { getQueryError } from './player-shared';
import {
  ratingConfidenceLabel,
  useInfiniteLeagueRatingsQuery,
  useInfiniteSiteRatingsQuery,
} from './rating-queries';
import { TabShellPage } from './TabShellPage';
import {
  AppPageContent,
  DesignList,
  EmptyState,
  ErrorState,
  FilterBar,
  InfiniteListFooter,
  ListItem,
  PageSection,
  Pill,
  RankBadge,
  SegmentedToggle,
} from './ui/appkit';
import './ratings-ui.css';

const PAGE_SIZE = 10;
const MAX_RATINGS = 100;

type RatingsScope = 'site' | 'selected';

function readSelectedLeagueIds(): string[] {
  try {
    const raw = window.localStorage.getItem(LEAGUES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return [];
  }
}

export function TopRatingsPage() {
  const { navigateInTab } = useTabNavigation();
  const [searchParams, setSearchParams] = useSearchParams();
  const leagueIds = useMemo(readSelectedLeagueIds, []);
  const hasSelectedLeagues = leagueIds.length > 0;
  const requestedScope = searchParams.get('scope');
  const scope: RatingsScope = requestedScope === 'site'
    ? 'site'
    : requestedScope === 'selected' && hasSelectedLeagues
      ? 'selected'
      : hasSelectedLeagues
        ? 'selected'
        : 'site';
  const isSelectedScope = scope === 'selected';

  const selectedRatingsQuery = useInfiniteLeagueRatingsQuery(
    leagueIds,
    PAGE_SIZE,
    MAX_RATINGS,
    isSelectedScope,
  );
  const siteRatingsQuery = useInfiniteSiteRatingsQuery(
    PAGE_SIZE,
    MAX_RATINGS,
    !isSelectedScope,
  );

  const players = useMemo(() => {
    const pages = isSelectedScope ? selectedRatingsQuery.data?.pages : siteRatingsQuery.data?.pages;
    return (pages?.flatMap((page) => page.data) ?? []).slice(0, MAX_RATINGS);
  }, [isSelectedScope, selectedRatingsQuery.data?.pages, siteRatingsQuery.data?.pages]);

  const total = isSelectedScope
    ? selectedRatingsQuery.data?.pages[0]?.total ?? 0
    : siteRatingsQuery.data?.pages[0]?.pagination.total ?? 0;
  const cappedTotal = Math.min(total, MAX_RATINGS);
  const isLoading = isSelectedScope ? selectedRatingsQuery.isLoading : siteRatingsQuery.isLoading;
  const queryError = isSelectedScope ? selectedRatingsQuery.error : siteRatingsQuery.error;
  const isError = isSelectedScope ? selectedRatingsQuery.isError : siteRatingsQuery.isError;
  const hasNextPage = isSelectedScope ? selectedRatingsQuery.hasNextPage : siteRatingsQuery.hasNextPage;
  const isFetchingNextPage = isSelectedScope
    ? selectedRatingsQuery.isFetchingNextPage
    : siteRatingsQuery.isFetchingNextPage;
  const initialError = players.length === 0 ? getQueryError(queryError) : null;
  const scopeLabel = isSelectedScope
    ? leagueIds.length === 1
      ? '1 selected league'
      : `${leagueIds.length} selected leagues`
    : 'All TT Players';

  const loadMore = () => isSelectedScope
    ? selectedRatingsQuery.fetchNextPage()
    : siteRatingsQuery.fetchNextPage();
  const retryInitial = () => isSelectedScope
    ? selectedRatingsQuery.refetch()
    : siteRatingsQuery.refetch();

  return (
    <TabShellPage>
      <DetailHeader title="Top Rated Players" backFallback="" />
      <AppPageContent className="tt-ratings-leaderboard-page">
        <PageSection
          surface="flat"
          density="compact"
          title="Rating leaderboard"
          note={scopeLabel}
          className="tt-ratings-leaderboard"
        >
          <p className="tt-ratings-leaderboard-copy">
            {isSelectedScope
              ? 'Established players are ranked by conservative ability rating across your selected active leagues. Up to the top 100 are shown.'
              : 'Established players are ranked by conservative ability rating across the full TT Players index. Up to the top 100 are shown.'}
          </p>

          {hasSelectedLeagues ? (
            <FilterBar ariaLabel="Rating leaderboard scope">
              <SegmentedToggle
                ariaLabel="Choose rating leaderboard scope"
                value={scope}
                onChange={(value) => setSearchParams({ scope: value }, { replace: true })}
                options={[
                  { value: 'site', label: 'All site' },
                  { value: 'selected', label: 'Selected leagues' },
                ]}
              />
            </FilterBar>
          ) : null}

          {isLoading ? (
            <SkeletonList rows={PAGE_SIZE} />
          ) : initialError ? (
            <ErrorState message={initialError} onRetry={() => void retryInitial()} />
          ) : players.length === 0 ? (
            <EmptyState
              iconClassName="fa fa-ranking-star"
              title="No established ratings yet"
              message={isSelectedScope
                ? 'Established players from your selected leagues will appear after their rating history has been calculated.'
                : 'Established players will appear after their site-wide rating history has been calculated.'}
            />
          ) : (
            <>
              <div className="tt-ratings-leaderboard-count" aria-live="polite">
                Showing {players.length} of {cappedTotal}
              </div>
              <DesignList density="compact" divider="hairline" paginate={false}>
                {players.map((player, index) => (
                  <ListItem
                    key={player.player_id}
                    leading={<RankBadge>{player.rank ?? index + 1}</RankBadge>}
                    title={player.player_name}
                    subtitle={`${ratingConfidenceLabel(player.confidence)} confidence · ${player.rated_matches} rated matches`}
                    trailing={<Pill tone="accent">{Math.round(player.rating)}</Pill>}
                    onClick={() => navigateInTab('players', `player/${player.player_id}`)}
                  />
                ))}
              </DesignList>

              <InfiniteListFooter
                hasMore={Boolean(hasNextPage)}
                isLoading={isFetchingNextPage}
                autoLoad={!isError}
                onLoadMore={loadMore}
                loadLabel={isError ? 'Retry loading players' : 'Load 10 more'}
                loadingLabel="Loading 10 more players…"
                endLabel={cappedTotal >= MAX_RATINGS ? 'Top 100 loaded' : 'End of leaderboard'}
              />

              {players.length > 0 && isError ? (
                <ErrorState
                  title="Could not load more players"
                  message={getQueryError(queryError) || 'Please try again.'}
                  onRetry={() => void loadMore()}
                />
              ) : null}
            </>
          )}
        </PageSection>
      </AppPageContent>
    </TabShellPage>
  );
}
