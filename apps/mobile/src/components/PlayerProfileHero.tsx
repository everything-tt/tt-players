import { useState } from 'react';
import { ratingConfidenceLabel, usePlayerRatingQuery } from '../rating-queries';
import type { ShareTarget } from '../share-target';
import { useShareTarget } from '../hooks/useShareTarget';
import { AppButton } from '../ui/appkit';
import { FavouriteButton } from './FavouriteButton';
import { FormResultPills } from './FormResultPills';
import type { FormResult } from './types';
import '../player-profile-hero.css';

interface PlayerProfileHeroProps {
  playerId: string;
  playerName: string;
  initials: string;
  totalMatches: number;
  wins: number;
  winRate: number;
  isFavourite: boolean;
  isCurrentUser: boolean;
  shareTarget: ShareTarget | null;
  rolling10WinRate: number | null;
  rolling20WinRate: number | null;
  momentum: string | null;
  recentResults: FormResult[];
  formLoading: boolean;
  formError: boolean;
  onToggleFavourite: () => void;
  onClearIdentity: () => void;
  onOpenInsights: () => void;
  onOpenRatingHistory: () => void;
}

function displayPercentage(value: number | null): string {
  return value == null ? '—' : `${value}%`;
}

export function PlayerProfileHero({
  playerId,
  playerName,
  initials,
  totalMatches,
  wins,
  winRate,
  isFavourite,
  isCurrentUser,
  shareTarget,
  rolling10WinRate,
  rolling20WinRate,
  momentum,
  recentResults,
  formLoading,
  formError,
  onToggleFavourite,
  onClearIdentity,
  onOpenInsights,
  onOpenRatingHistory,
}: PlayerProfileHeroProps) {
  const [isRangeOpen, setIsRangeOpen] = useState(false);
  const ratingQuery = usePlayerRatingQuery(playerId, Boolean(playerId));
  const rating = ratingQuery.data?.data ?? null;
  const { share, status: shareStatus } = useShareTarget(shareTarget);

  return (
    <section className="tt-player-profile-hero" aria-labelledby="tt-player-title">
      <div className="tt-player-profile-identity">
        <div className="tt-player-profile-avatar" aria-hidden="true">
          <span>{initials}</span>
          <i className="fa fa-table-tennis" />
        </div>
        <div className="tt-player-profile-copy">
          <p className="tt-player-profile-eyebrow">Player profile</p>
          <h1 id="tt-player-title">{playerName}</h1>
          <p>{totalMatches} matches · {wins} wins · {winRate}% win rate</p>
        </div>
      </div>

      <div className="tt-player-profile-actions" aria-label="Player actions">
        {isCurrentUser ? (
          <AppButton
            size="sm"
            tone="outline"
            className="tt-player-profile-action"
            onClick={onClearIdentity}
          >
            <i className="fa fa-user-xmark" aria-hidden="true" />
            This isn’t me
          </AppButton>
        ) : (
          <FavouriteButton
            saved={isFavourite}
            onToggle={onToggleFavourite}
            className="tt-player-profile-action tt-player-profile-save"
          />
        )}
        <AppButton
          size="sm"
          tone="ghost"
          className="tt-player-profile-action"
          onClick={(event) => { void share(event); }}
          disabled={!shareTarget}
        >
          <i className="fa fa-share-nodes" aria-hidden="true" />
          Share
        </AppButton>
        <AppButton
          size="sm"
          tone="ghost"
          className="tt-player-profile-action"
          onClick={onOpenRatingHistory}
        >
          <i className="fa fa-chart-line" aria-hidden="true" />
          View rating history
        </AppButton>
        <AppButton
          size="sm"
          tone="ghost"
          className="tt-player-profile-action"
          onClick={onOpenInsights}
        >
          <i className="fa fa-lightbulb" aria-hidden="true" />
          Insights
        </AppButton>
      </div>

      <div className="tt-player-profile-divider" />

      {ratingQuery.isLoading ? (
        <div className="tt-player-profile-rating-state" aria-label="Loading ability rating">
          <i className="fa fa-spinner fa-spin" aria-hidden="true" />
          Calculating ability rating…
        </div>
      ) : !rating ? (
        <div className="tt-player-profile-rating-state">
          <strong>Ability rating unavailable</strong>
          <span>A calculated rating will appear after enough rated matches are available.</span>
        </div>
      ) : (
        <>
          <div className="tt-player-profile-metrics" aria-label="Ability rating summary">
            <div className="tt-player-profile-metric">
              <span>Ability rating</span>
              <strong>{Math.round(rating.rating)}</strong>
              <small>{ratingConfidenceLabel(rating.confidence)} confidence</small>
            </div>
            <div className="tt-player-profile-metric">
              <span>Global rank</span>
              <strong>{rating.rank != null ? `#${rating.rank}` : '—'}</strong>
              <small>{rating.provisional ? 'Provisional' : 'Current standing'}</small>
            </div>
            <div className="tt-player-profile-metric">
              <span>Confidence</span>
              <strong className="tt-player-profile-confidence">{ratingConfidenceLabel(rating.confidence)}</strong>
              <small>{rating.rated_matches} rated matches</small>
            </div>

            <button
              type="button"
              className="tt-player-profile-range"
              aria-expanded={isRangeOpen}
              onClick={() => setIsRangeOpen((open) => !open)}
            >
              <span>
                <small>Likely range</small>
                <strong>{Math.round(rating.rating_low)}–{Math.round(rating.rating_high)}</strong>
                <em>{rating.rated_matches} rated matches</em>
              </span>
              <i className={`fa fa-chevron-${isRangeOpen ? 'up' : 'down'}`} aria-hidden="true" />
            </button>

            <div className="tt-player-profile-metric tt-player-profile-win-rate">
              <span>Win rate</span>
              <strong>{winRate}%</strong>
              <small>Career</small>
            </div>
          </div>

          {isRangeOpen ? (
            <div className="tt-player-profile-range-detail" aria-label="Rating range details">
              <div className="tt-player-profile-range-track" aria-hidden="true"><span /></div>
              <div className="tt-player-profile-range-values">
                <span><small>Low</small>{Math.round(rating.rating_low)}</span>
                <strong><small>Estimate</small>{Math.round(rating.rating)}</strong>
                <span><small>High</small>{Math.round(rating.rating_high)}</span>
              </div>
            </div>
          ) : null}

          {rating.provisional ? (
            <p className="tt-player-profile-note">Provisional rating: a global rank appears once confidence is high enough.</p>
          ) : null}
        </>
      )}

      <div className="tt-player-profile-form">
        <div className="tt-player-profile-form-heading">
          <span>Form</span>
          <small>Rolling performance</small>
        </div>

        {formLoading ? (
          <div className="tt-player-profile-form-state">
            <i className="fa fa-spinner fa-spin" aria-hidden="true" />
            Loading form…
          </div>
        ) : formError ? (
          <div className="tt-player-profile-form-state">Form insights are unavailable.</div>
        ) : (
          <div className="tt-player-profile-form-grid">
            <div>
              <strong>{displayPercentage(rolling10WinRate)}</strong>
              <span>Rolling 10</span>
            </div>
            <div>
              <strong>{displayPercentage(rolling20WinRate)}</strong>
              <span>Rolling 20</span>
            </div>
            <div>
              <strong className="text-capitalize">{momentum ?? '—'}</strong>
              <span>Momentum</span>
            </div>
          </div>
        )}

        <FormResultPills
          results={recentResults}
          label="Recent results"
          loading={formLoading}
          emptyText="No form yet"
        />
      </div>

      {shareStatus ? <span className="sr-only" aria-live="polite">{shareStatus}</span> : null}
    </section>
  );
}
