import { useState } from 'react';
import { useTabNavigation } from '../navigation/tab-navigation';
import {
  type RatingHighlightTab,
  useRatingHighlightsQuery,
} from '../rating-highlights-queries';
import {
  AppButton,
  FilterBar,
  PageSection,
  SegmentedToggle,
} from '../ui/appkit';
import { SkeletonList } from './Skeleton';
import { RatingHighlightsList } from './RatingHighlightsList';

interface RatingPulseProps {
  onOpenPlayer: (playerId: string) => void;
}

const PREVIEW_LIMIT = 5;

export function RatingPulse({ onOpenPlayer }: RatingPulseProps) {
  const { navigateInTab } = useTabNavigation();
  const [tab, setTab] = useState<RatingHighlightTab>('jumps');
  const highlightsQuery = useRatingHighlightsQuery(PREVIEW_LIMIT);
  const data = highlightsQuery.data;

  if (highlightsQuery.isError) return null;
  if (!highlightsQuery.isLoading && !data?.run) return null;

  return (
    <PageSection
      surface="flat"
      density="compact"
      title="Rating pulse"
      action={(
        <AppButton
          size="s"
          tone="ghost"
          onClick={() => navigateInTab('players', `rating-highlights?tab=${tab}`)}
        >
          View all
          <i className="fa fa-angle-right" aria-hidden="true" />
        </AppButton>
      )}
    >
      <FilterBar ariaLabel="Rating pulse highlights">
        <SegmentedToggle
          ariaLabel="Choose rating highlight type"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'jumps', label: 'Rating jumps' },
            { value: 'surprises', label: 'Surprise wins' },
          ]}
        />
      </FilterBar>

      {highlightsQuery.isLoading ? (
        <SkeletonList rows={PREVIEW_LIMIT} />
      ) : data ? (
        <RatingHighlightsList
          tab={tab}
          ratingJumps={data.rating_jumps}
          surpriseWins={data.surprise_wins}
          onOpenPlayer={onOpenPlayer}
        />
      ) : null}
    </PageSection>
  );
}
