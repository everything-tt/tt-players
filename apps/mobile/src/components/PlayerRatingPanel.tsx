import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTabNavigation } from '../navigation/tab-navigation';
import { ratingConfidenceLabel, usePlayerRatingQuery } from '../rating-queries';
import { AppButtonLink, MetricGrid, PageSection, Surface } from '../ui/appkit';
import { SkeletonBlock } from './Skeleton';
import '../ratings-ui.css';

interface PlayerRatingPanelProps {
  playerId: string;
}

function formatVolatility(value: number): string {
  return Number.isFinite(value) ? value.toFixed(4) : '—';
}

export function PlayerRatingPanel({ playerId }: PlayerRatingPanelProps) {
  const navigate = useNavigate();
  const { navigateInActiveTab } = useTabNavigation();
  const [isRangeOpen, setIsRangeOpen] = useState(false);
  const ratingQuery = usePlayerRatingQuery(playerId, Boolean(playerId));
  const rating = ratingQuery.data?.data ?? null;

  const metrics = rating ? [
    { label: 'Rating', value: Math.round(rating.rating) },
    ...(rating.rank != null ? [{ label: 'Global Rank', value: `#${rating.rank}` }] : []),
    { label: 'RD', value: rating.rating_deviation.toFixed(1) },
    { label: 'Volatility', value: formatVolatility(rating.volatility) },
    { label: 'Confidence', value: ratingConfidenceLabel(rating.confidence) },
  ] : [];

  return (
    <PageSection
      surface="flat"
      density="compact"
      title="Ability Rating"
      note={rating ? `${ratingConfidenceLabel(rating.confidence)} confidence` : 'Glicko-2'}
      className="tt-rating-panel"
    >
      {ratingQuery.isLoading ? (
        <MetricGrid
          density="compact"
          ariaLabel="Loading player rating"
          metrics={[
            { label: 'Rating', value: <SkeletonBlock className="tt-skeleton-stat" /> },
            { label: 'Rank', value: <SkeletonBlock className="tt-skeleton-stat" /> },
            { label: 'RD', value: <SkeletonBlock className="tt-skeleton-stat" /> },
            { label: 'Volatility', value: <SkeletonBlock className="tt-skeleton-stat" /> },
            { label: 'Confidence', value: <SkeletonBlock className="tt-skeleton-stat" /> },
          ]}
        />
      ) : !rating ? (
        <p className="tt-player-section-state">A calculated rating is not available for this player yet.</p>
      ) : (
        <>
          <MetricGrid density="compact" metrics={metrics} />

          <Surface variant="subtle" padding="none" className="tt-rating-range" aria-label="Estimated rating range">
            <button
              type="button"
              className="tt-rating-range-summary"
              aria-expanded={isRangeOpen}
              onClick={() => setIsRangeOpen((open) => !open)}
            >
              <span>
                <small>Likely range</small>
                <strong>{Math.round(rating.rating_low)}-{Math.round(rating.rating_high)}</strong>
              </span>
              <span>{rating.rated_matches} rated matches</span>
              <i className={`fa fa-chevron-${isRangeOpen ? 'up' : 'down'}`} aria-hidden="true" />
            </button>

            {isRangeOpen ? (
              <div className="tt-rating-range-detail">
                <div className="tt-rating-range-track" aria-hidden="true"><span /></div>
                <div className="tt-rating-range-values">
                  <span><small>Low</small>{Math.round(rating.rating_low)}</span>
                  <strong><small>Estimate</small>{Math.round(rating.rating)}</strong>
                  <span><small>High</small>{Math.round(rating.rating_high)}</span>
                </div>
              </div>
            ) : null}
          </Surface>

          {rating.provisional ? (
            <p className="tt-rating-note">Provisional rating: a global rank will appear once rating deviation is 110 or lower.</p>
          ) : null}

          <AppButtonLink
            href={`/rating-audit/player/${playerId}`}
            full
            size="sm"
            tone="primary"
            className="tt-rating-history-link"
            onClick={(event) => {
              event.preventDefault();
              navigate(`/rating-audit/player/${playerId}`);
            }}
          >
            <i className="fa fa-search" aria-hidden="true" />
            Why This Rating?
          </AppButtonLink>

          <AppButtonLink
            full
            size="sm"
            tone="outline"
            className="tt-rating-history-link"
            onClick={(event) => {
              event.preventDefault();
              navigateInActiveTab(`player/${playerId}/insights#rating-history`);
            }}
          >
            <i className="fa fa-chart-line" aria-hidden="true" />
            View Rating History
          </AppButtonLink>
        </>
      )}
    </PageSection>
  );
}
