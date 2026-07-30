import { ratingConfidenceLabel, usePlayerRatingQuery } from '../rating-queries';
import { SkeletonBlock } from './Skeleton';
import '../ratings-ui.css';

interface PlayerRatingPanelProps {
  playerId: string;
}

export function PlayerRatingPanel({ playerId }: PlayerRatingPanelProps) {
  const ratingQuery = usePlayerRatingQuery(playerId, Boolean(playerId));
  const rating = ratingQuery.data?.data ?? null;

  return (
    <section className="tt-player-section tt-rating-panel" aria-labelledby="tt-player-rating-title">
      <div className="tt-player-section-header">
        <h2 id="tt-player-rating-title" className="tt-player-section-title">Ability Rating</h2>
        <span className="tt-player-section-note">
          {rating ? `${ratingConfidenceLabel(rating.confidence)} confidence` : 'Glicko-2'}
        </span>
      </div>

      {ratingQuery.isLoading ? (
        <div className="tt-player-metric-grid" aria-label="Loading player rating">
          <div className="tt-player-metric"><SkeletonBlock className="tt-skeleton-stat" /></div>
          <div className="tt-player-metric"><SkeletonBlock className="tt-skeleton-stat" /></div>
          <div className="tt-player-metric"><SkeletonBlock className="tt-skeleton-stat" /></div>
        </div>
      ) : !rating ? (
        <p className="tt-player-section-state">
          A calculated rating is not available for this player yet.
        </p>
      ) : (
        <>
          <div className="tt-player-metric-grid">
            <div className="tt-player-metric">
              <span className="tt-player-metric-value">{Math.round(rating.rating)}</span>
              <span className="tt-player-metric-label">Rating</span>
            </div>
            <div className="tt-player-metric">
              <span className="tt-player-metric-value">
                {rating.rank ? `#${rating.rank}` : '—'}
              </span>
              <span className="tt-player-metric-label">Global Rank</span>
            </div>
            <div className="tt-player-metric">
              <span className="tt-player-metric-value text-capitalize">
                {ratingConfidenceLabel(rating.confidence)}
              </span>
              <span className="tt-player-metric-label">Confidence</span>
            </div>
          </div>

          <div className="tt-rating-range" aria-label="Estimated rating range">
            <div>
              <span className="tt-rating-range-label">Likely rating range</span>
              <strong>{Math.round(rating.rating_low)}–{Math.round(rating.rating_high)}</strong>
            </div>
            <span>{rating.rated_matches} rated matches</span>
          </div>

          {rating.provisional ? (
            <p className="tt-rating-note">
              Provisional rating: more results are needed before a global rank is shown.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
