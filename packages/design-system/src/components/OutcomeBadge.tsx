import { cx } from '../utils/cx';

export type OutcomeResult = 'W' | 'L' | 'D';
export type OutcomeVariant = 'pill' | 'icon' | 'badge';

const resultLabel: Record<OutcomeResult, string> = { W: 'Win', L: 'Loss', D: 'Draw' };

export interface OutcomeBadgeProps {
  result: OutcomeResult;
  variant?: OutcomeVariant;
  className?: string;
}

/**
 * Unified win/loss/draw badge. Replaces 4 different W/L representations:
 * - Form pills (tt-form-result-win/loss)
 * - Match-list icons (tt-match-result-win/loss)
 * - H2H encounter avatars (tt-bg-success/warning)
 * - Icon-only variants (tt-icon-win/loss)
 *
 * Win = green (success), Loss = red (danger), Draw = amber (warning).
 */
export function OutcomeBadge({ result, variant = 'pill', className }: OutcomeBadgeProps) {
  const label = resultLabel[result];
  const resultClass = result === 'W'
    ? 'tt-outcome--win'
    : result === 'L'
      ? 'tt-outcome--loss'
      : 'tt-outcome--draw';

  if (variant === 'icon') {
    const icon = result === 'W' ? 'fa-check' : result === 'L' ? 'fa-times' : 'fa-minus';
    return (
      <span
        className={cx('tt-outcome', 'tt-outcome--icon', resultClass, className)}
        aria-label={label}
      >
        <i className={`fa ${icon}`} />
      </span>
    );
  }

  if (variant === 'badge') {
    return (
      <span
        className={cx('tt-outcome', resultClass, className)}
        aria-label={label}
      >
        {result}
      </span>
    );
  }

  // pill variant
  return (
    <span
      className={cx('tt-outcome', resultClass, className)}
      aria-label={label}
    >
      {result}
    </span>
  );
}
