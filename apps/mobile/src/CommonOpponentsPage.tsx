import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DetailHeader } from './components/DetailHeader';
import { useH2HCommonOpponentsQuery } from './h2h-common-opponents-query';
import type { CommonOpponentSort } from './h2h-common-opponents-types';
import { useTabNavigation } from './navigation/tab-navigation';
import { getInitials, getQueryError } from './player-shared';
import { TabShellPage } from './TabShellPage';
import {
  AppPageContent,
  DesignAvatar,
  DesignList,
  EmptyState,
  ErrorState,
  InfiniteListFooter,
  ListItem,
  PageSection,
  Pill,
} from './ui/appkit';
import './CommonOpponentsPage.css';

const SORT_OPTIONS: Array<{ value: CommonOpponentSort; label: string }> = [
  { value: 'evidence', label: 'Most evidence' },
  { value: 'recent', label: 'Most recent' },
  { value: 'edge', label: 'Largest edge' },
  { value: 'closest', label: 'Closest record' },
];

function formatLatestDate(value: string | null): string {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function edgeClassName(edge: number): string {
  if (edge > 0) return 'tt-common-opponents-edge tt-common-opponents-edge--positive';
  if (edge < 0) return 'tt-common-opponents-edge tt-common-opponents-edge--negative';
  return 'tt-common-opponents-edge';
}

export function CommonOpponentsPage() {
  const { playerAId = '', playerBId = '' } = useParams<{
    playerAId: string;
    playerBId: string;
  }>();
  const { navigateInTab } = useTabNavigation();
  const [sort, setSort] = useState<CommonOpponentSort>('evidence');
  const commonQuery = useH2HCommonOpponentsQuery(playerAId, playerBId, sort);
  const opponents = useMemo(
    () => commonQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [commonQuery.data],
  );
  const firstPage = commonQuery.data?.pages[0] ?? null;
  const total = firstPage?.total ?? 0;
  const initialError = opponents.length === 0 ? getQueryError(commonQuery.error) : null;

  useEffect(() => {
    if (typeof window.scrollTo === 'function') window.scrollTo({ top: 0, behavior: 'auto' });
  }, [sort]);

  const playerContext = firstPage
    ? `${firstPage.players.player1.name} vs ${firstPage.players.player2.name}`
    : 'Shared-opponent comparison';

  return (
    <TabShellPage>
      <DetailHeader title="Common opponents" heading />
      <AppPageContent className="tt-common-opponents-page">
        <PageSection
          surface="flat"
          density="compact"
          title="Shared records"
          meta={<Pill tone="neutral" size="sm">{total} shared</Pill>}
        >
          <div className="tt-common-opponents-controls">
            <p className="tt-common-opponents-context">{playerContext}</p>
            <label className="tt-common-opponents-sort">
              <span>Sort by</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as CommonOpponentSort)}
                aria-label="Sort common opponents"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          {commonQuery.isLoading ? (
            <EmptyState iconClassName="fa fa-spinner fa-spin" title="Loading common opponents…" />
          ) : initialError ? (
            <ErrorState
              title="Couldn’t load common opponents"
              message={initialError}
              onRetry={() => commonQuery.refetch()}
            />
          ) : opponents.length === 0 ? (
            <EmptyState
              iconClassName="fa fa-people-arrows"
              title="No shared opponents yet"
              message="This comparison will appear once both players have faced at least one of the same opponents."
            />
          ) : (
            <>
              <span className="sr-only" aria-live="polite">
                {SORT_OPTIONS.find((option) => option.value === sort)?.label}: {opponents.length} of {total} loaded
              </span>
              <DesignList density="compact" divider="hairline" paginate={false}>
                {opponents.map((opponent) => (
                  <ListItem
                    key={opponent.opponent_id}
                    leading={<DesignAvatar size="compact" text={getInitials(opponent.opponent_name)} />}
                    title={opponent.opponent_name}
                    subtitle={(
                      <span className="tt-common-opponents-row-meta">
                        <span>{firstPage?.players.player1.name}: {opponent.player1.wins}-{opponent.player1.losses} ({opponent.player1.win_rate}%)</span>
                        <span>{firstPage?.players.player2.name}: {opponent.player2.wins}-{opponent.player2.losses} ({opponent.player2.win_rate}%)</span>
                        <span>{opponent.combined_played} matches</span>
                        <span>Latest {formatLatestDate(opponent.latest_played_at)}</span>
                      </span>
                    )}
                    trailing={(
                      <strong className={edgeClassName(opponent.edge)}>
                        {opponent.edge > 0 ? '+' : ''}{opponent.edge}
                      </strong>
                    )}
                    onClick={() => navigateInTab('players', `player/${opponent.opponent_id}`)}
                  />
                ))}
              </DesignList>

              <InfiniteListFooter
                hasMore={Boolean(commonQuery.hasNextPage)}
                isLoading={commonQuery.isFetchingNextPage}
                autoLoad={!commonQuery.isError}
                onLoadMore={() => commonQuery.fetchNextPage()}
                loadLabel={commonQuery.isError ? 'Retry loading opponents' : 'Load more opponents'}
                loadingLabel="Loading more opponents…"
              />

              {opponents.length > 0 && commonQuery.isError ? (
                <ErrorState
                  title="Couldn’t load more opponents"
                  message={getQueryError(commonQuery.error) || 'Please try again.'}
                  onRetry={() => void commonQuery.fetchNextPage()}
                />
              ) : null}
            </>
          )}
        </PageSection>
      </AppPageContent>
    </TabShellPage>
  );
}
