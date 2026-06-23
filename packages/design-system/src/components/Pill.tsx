import type { ButtonHTMLAttributes } from 'react';
import { cx } from '../utils/cx';

export type PillTone = 'accent' | 'neutral' | 'success' | 'danger' | 'warning';
export type PillSize = 'xs' | 'sm';

const toneClassName: Record<PillTone, string> = {
  accent: 'tt-pill-accent',
  neutral: 'tt-pill-neutral',
  success: 'tt-pill-success',
  danger: 'tt-pill-danger',
  warning: 'tt-pill-warning',
};

const sizeClassName: Record<PillSize, string> = {
  xs: 'tt-pill-xs',
  sm: 'tt-pill-sm',
};

interface PillProps {
  label: string;
  tone?: PillTone;
  size?: PillSize;
  className?: string;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>['onClick'];
  'aria-label'?: string;
}

/**
 * Unified small labelled pill. Replaces tt-league-list-status,
 * tt-league-division-status, tt-player-remove-badge, tt-rubber-type-badge,
 * tt-picker-tab-badge, tt-page-league-count, and tt-form-result-pill.
 */
export function Pill({
  label,
  tone = 'neutral',
  size = 'sm',
  className,
  onClick,
  'aria-label': ariaLabel,
}: PillProps) {
  const shared = cx('tt-pill', sizeClassName[size], toneClassName[tone], className);

  if (onClick) {
    return (
      <button type="button" className={shared} onClick={onClick} aria-label={ariaLabel ?? label}>
        {label}
      </button>
    );
  }

  return <span className={shared}>{label}</span>;
}
