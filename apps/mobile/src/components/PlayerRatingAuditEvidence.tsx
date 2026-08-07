import { useMemo, useState } from 'react';
import {
  type RatingPlayerAuditEvidenceRow,
  useRatingPlayerAuditEvidenceQuery,
} from '../rating-calculation-audit-queries';
import { PageSection, Pill } from '../ui/appkit';

function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatRating(value: number): string {
  return Math.round(value).toLocaleString('en-GB');
}

function formatDelta(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString('en-GB')}`;
}

function resultTone(result: string) {
  return result === 'win' ? 'success' as const : 'danger' as const;
}

function movementExplanation(row: RatingPlayerAuditEvidenceRow): string[] {
  const expectedPercent = Math.round(row.expected_win_probability * 100);
  const lines: string[] = [];

  if (row.result === 'win') {
    if (row.expected_win_probability < 0.35) {
      lines.push(`You were given an ${expectedPercent}% chance and won. That upset added strong positive evidence to your rating.`);
    } else if (row.expected_win_probability < 0.5) {
      lines.push(`You were the slight underdog at ${expectedPercent}% and won, so the result pushed your rating upward more than an expected win would.`);
    } else {
      lines.push(`You were expected to win at ${expectedPercent}%. The win still added positive evidence, but less than a surprise result would.`);
    }
  } else if (row.expected_win_probability > 0.65) {
    lines.push(`You were given a ${expectedPercent}% chance to win but lost, so the unexpected result pulled your rating downward.`);
  } else if (row.expected_win_probability > 0.5) {
    lines.push(`You were a slight favourite at ${expectedPercent}% but lost, creating negative evidence for the model.`);
  } else {
    lines.push(`The model expected this to be difficult at ${expectedPercent}%. The loss still counted, but its negative effect was smaller than an upset loss.`);
  }

  if (row.player_rating_deviation_before >= 150 && Math.abs(row.attributed_rating_delta) >= 25) {
    lines.push(`Your rating was still uncertain before the match (RD ${Math.round(row.player_rating_deviation_before)}), so new evidence could move the estimate quickly.`);
  }

  if (row.opponent_rating_deviation_before <= 90) {
    lines.push(`${row.opponent_name} had a comparatively established rating (RD ${Math.round(row.opponent_rating_deviation_before)}), making the result more informative.`);
  }

  if (row.period_matches > 1) {
    lines.push(`All ${row.period_matches} matches on this date use the same starting rating. The ${formatDelta(row.attributed_rating_delta)} shown here is an attribution within the combined ${formatDelta(row.period_combined_delta)} daily update, not a sequential recalculation.`);
  }

  return lines;
}

export function PlayerRatingAuditEvidence({ playerId }: { playerId: string }) {
  const evidenceQuery = useRatingPlayerAuditEvidenceQuery(playerId, 12, Boolean(playerId));
  const rows = evidenceQuery.data?.data ?? [];
  const [selectedRubberId, setSelectedRubberId] = useState<string | null>(null);
  const selected = useMemo(
    () => rows.find((row) => row.rubber_id === selectedRubberId) ?? null,
    [rows, selectedRubberId],
  );

  return (
    <PageSection
      surface="flat"
      density="compact"
      title="Why your rating moved"
      description="Audited match evidence behind the rating update. Tap a result for a plain-language explanation."
      className="tt-insights-supporting-section tt-rating-evidence"
    >
      {evidenceQuery.isLoading ? (
        <p className="tt-insights-state">Loading audited rating evidence…</p>
      ) : evidenceQuery.isError ? (
        <p className="tt-insights-state">Audited match evidence is not available right now.</p>
      ) : rows.length === 0 ? (
        <p className="tt-insights-empty">No audited match evidence has been published for this player yet.</p>
      ) : (
        <div className="tt-rating-evidence-list">
          {rows.map((row) => {
            const expanded = row.rubber_id === selectedRubberId;
            const rankLabel = row.provisional_after
              ? 'Provisional'
              : row.public_rank_after
                ? `Rank #${row.public_rank_after}`
                : 'Unranked';

            return (
              <article key={row.rubber_id} className={`tt-rating-evidence-entry${expanded ? ' is-expanded' : ''}`}>
                <button
                  type="button"
                  className="tt-rating-evidence-row"
                  aria-expanded={expanded}
                  onClick={() => setSelectedRubberId(expanded ? null : row.rubber_id)}
                >
                  <span className="tt-rating-evidence-main">
                    <span className="tt-rating-evidence-meta">
                      <span>{formatDate(row.match_date)}</span>
                      <Pill tone={resultTone(row.result)}>{row.result === 'win' ? 'Win' : 'Loss'}</Pill>
                    </span>
                    <strong>{row.opponent_name}</strong>
                    <span className="tt-rating-evidence-score">
                      {row.game_score ?? 'Score unavailable'} · Expected {Math.round(row.expected_win_probability * 100)}%
                    </span>
                  </span>

                  <span className="tt-rating-evidence-trailing">
                    <strong className={row.attributed_rating_delta >= 0 ? 'is-positive' : 'is-negative'}>
                      {formatDelta(row.attributed_rating_delta)}
                    </strong>
                    <small>contribution</small>
                    <i className={`fa fa-angle-${expanded ? 'up' : 'down'}`} aria-hidden="true" />
                  </span>
                </button>

                <div className="tt-rating-evidence-stats" aria-label={`Rating state after ${row.opponent_name}`}>
                  <span>Rating after <strong>{formatRating(row.rating_after)}</strong></span>
                  <span>RD <strong>{Math.round(row.rating_deviation_after)}</strong></span>
                  <span><strong>{rankLabel}</strong></span>
                </div>

                {expanded ? (
                  <div className="tt-rating-evidence-explanation">
                    {movementExplanation(row).map((line) => <p key={line}>{line}</p>)}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {selected && selected.period_matches > 1 ? (
        <p className="tt-rating-evidence-period-note">
          Same-day matches are calculated together from the same starting rating; the individual contributions reconcile to the combined daily movement.
        </p>
      ) : null}
    </PageSection>
  );
}
