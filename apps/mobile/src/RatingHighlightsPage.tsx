import { useSearchParams } from 'react-router-dom';
import { DetailHeader } from './components/DetailHeader';
import { RatingHighlightsList } from './components/RatingHighlightsList';
import { SkeletonList } from './components/Skeleton';
import { useTabNavigation } from './navigation/tab-navigation';
import {
  type RatingHighlightTab,
  useRatingHighlightsQuery,
} from './rating-highlights-queries';
import { TabShellPage } from './TabShellPage';
import {
  AppPageContent,
  EmptyState,
  ErrorState,
  FilterBar,
  PageSection,
  Pill,
  SegmentedToggle,
} from './ui/appkit';

const FULL_PAGE_LIMIT = 50;

function formatCutoff(value: string | null | undefined): string {
  if (!value) return 'Latest complete rating update';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return `Rating data through ${value}`;
  return `Rating data through ${new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)}`;
}

export function RatingHighlightsPage() {
  const { navigateInTab } = useTabNavigation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: RatingHighlightTab = searchParams.get('tab') === 'surprises' ? 'surprises' : 'jumps';
  const highlightsQuery = useRatingHighlightsQuery(FULL_PAGE_LIMIT);
  const data = highlightsQuery.data;
  const visibleCount = tab === 'jumps'
    ? data?.rating_jumps.length ?? 0
    : data?.surprise_wins.length ?? 0;

  return (
    <TabShellPage>
      <DetailHeader title="Rating highlights" />
      <AppPageContent>
        <PageSection
          surface="flat"
          density="compact"
          title="Latest update"
          description={formatCutoff(data?.run?.source_data_cutoff)}
          meta={data?.run ? <Pill size="xs" tone="neutral">{visibleCount} shown</Pill> : undefined}
        >
          <FilterBar ariaLabel="Rating highlights">
            <SegmentedToggle
              ariaLabel="Choose rating highlight type"
              value={tab}
              onChange={(nextTab) => setSearchParams({ tab: nextTab }, { replace: true })}
              options={[
                { value: 'jumps', label: 'Rating jumps' },
                { value: 'surprises', label: 'Surprise wins' },
              ]}
            />
          </FilterBar>

          {highlightsQuery.isLoading ? (
            <SkeletonList rows={8} />
          ) : highlightsQuery.isError ? (
            <ErrorState
              message="Rating highlights are unavailable right now."
              onRetry={() => void highlightsQuery.refetch()}
            />
          ) : !data?.run ? (
            <EmptyState
              iconClassName="fa fa-chart-line"
              title="No rating highlights yet"
              message="Highlights will appear after a complete rating update is available."
            />
          ) : (
            <RatingHighlightsList
              tab={tab}
              ratingJumps={data.rating_jumps}
              surpriseWins={data.surprise_wins}
              onOpenPlayer={(playerId) => navigateInTab('players', `player/${playerId}`)}
            />
          )}
        </PageSection>
      </AppPageContent>
    </TabShellPage>
  );
}
