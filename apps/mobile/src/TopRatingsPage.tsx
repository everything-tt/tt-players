import { useMemo } from 'react';
import { DetailHeader } from './components/DetailHeader';
import { SkeletonList } from './components/Skeleton';
import { LEAGUES_STORAGE_KEY } from './local-persistence';
import { useTabNavigation } from './navigation/tab-navigation';
import { getQueryError } from './player-shared';
import { ratingConfidenceLabel, useInfiniteLeagueRatingsQuery } from './rating-queries';
import { TabShellPage } from './TabShellPage';
import {
  AppPageContent,
  DesignList,
  EmptyState,
  ErrorState,
  InfiniteListFooter,
  ListItem,
  PageSection,
  Pill,
  RankBadge,
} from './ui/appkit';
import './ratings-ui.css';

const PAGE_SIZE = 10;
const MAX_RATINGS = 100;

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
  const { navigateInTab, switchTab } = useTabNavigation();
  const leagueIds = useMemo(readSelectedLeagueIds, []);
  const ratingsQuery = useInfiniteLeagueRatingsQuery(leagueIds, PAGE_SIZE, MAX_RATINGS);
  const players = useMemo(
    () => (ratingsQuery.data?.pages.flatMap((page) => page.data) ?? []).slice(0, MAX_RATINGS),
    [ratingsQuery.data],
  );
  const total = ratingsQuery.data?.pages[0]?.total ?? 0;
  const cappedTotal = Math.min(total, MAX_RATINGS);
  const scopeLabel = leagueIds.length === 1 ? '1 selected league' : `${leagueIds.length} selected leagues`;
  const initialError = players.length === 0 ? getQueryError(ratingsQuery.error) : null;

  return (
    <TabShellPage>
      <DetailHeader title="Top Rated Players" backFallback="" />
      <AppPageContent className="tt-ratings-leaderboard-page">
        <PageSection
          surface="flat"
          density="compact"
          title="League leaderboard"
          note={leagueIds.length > 0 ? scopeLabel : 'No league scope'}
          className="tt-ratings-leaderboard"
        >
          <p className="tt-ratings-leaderboard-copy">
            Established players are ranked by conservative ability rating across your selected active leagues. Up to the top 100 are shown.
          </p>

          {leagueIds.length === 0 ? (
            <EmptyState
              iconClassName="fa fa-filter"
              title="Choose leagues first"
              message="Select at least one league from Home to build a scoped rating leaderboard."
              action={{ label: 'Back to Home', onClick: () => switchTab('home', 'root') }}
            />
          ) : ratingsQuery.isLoading ? (
            <SkeletonList rows={PAGE_SIZE} />
          ) : initialError ? (
            <ErrorState message={initialError} onRetry={() => ratingsQuery.refetch()} />
          ) : players.length === 0 ? (
            <EmptyState
              iconClassName="fa fa-ranking-star"
              title="No established ratings yet"
              message="Established players will appear after their rating history has been calculated."
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
                hasMore={Boolean(ratingsQuery.hasNextPage)}
                isLoading={ratingsQuery.isFetchingNextPage}
                autoLoad={!ratingsQuery.isError}
                onLoadMore={() => ratingsQuery.fetchNextPage()}
                loadLabel={ratingsQuery.isError ? 'Retry loading players' : 'Load 10 more'}
                loadingLabel="Loading 10 more players…"
                endLabel={cappedTotal >= MAX_RATINGS ? 'Top 100 loaded' : 'End of leaderboard'}
              />

              {players.length > 0 && ratingsQuery.isError ? (
                <ErrorState
                  title="Could not load more players"
                  message={getQueryError(ratingsQuery.error) || 'Please try again.'}
                  onRetry={() => void ratingsQuery.fetchNextPage()}
                />
              ) : null}
            </>
          )}
        </PageSection>
      </AppPageContent>
    </TabShellPage>
  );
}
