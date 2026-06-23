import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { cx } from '../utils/cx';

// ── MoreButton: single "Load More / View All" control ─────────────────────────

export interface MoreButtonProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'onClick'> {
  loading?: boolean;
  hasMore?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}

/** Single pagination affordance. Replaces 3 different Load-More/View-All styles. */
export function MoreButton({ loading = false, hasMore = true, onClick, children, className, ...rest }: MoreButtonProps) {
  return (
    <a
      href="#"
      onClick={(event) => { event.preventDefault(); if (!loading && hasMore) onClick(); }}
      className={cx('tt-btn tt-btn--sm tt-btn-rounded--full tt-btn-weight--semibold', loading ? 'tt-btn--outline' : 'tt-btn--primary', 'tt-btn--full', className)}
      aria-disabled={loading || !hasMore || undefined}
      {...rest}
    >
      {loading ? (<><i className="fa fa-spinner fa-spin me-2" />Loading…</>) : children}
    </a>
  );
}

// ── OutcomeBadge: single W/L/D representation ────────────────────────────────

export type Outcome = 'W' | 'L' | 'D';

export interface OutcomeBadgeProps {
  outcome: Outcome;
  /** When true, renders as an icon (fa-check / fa-times / fa-minus); else a letter. */
  icon?: boolean;
  className?: string;
}

const outcomeTone: Record<Outcome, string> = {
  W: 'tt-outcome--win',
  L: 'tt-outcome--loss',
  D: 'tt-outcome--draw',
};

const outcomeIcon: Record<Outcome, string> = {
  W: 'fa fa-check',
  L: 'fa fa-times',
  D: 'fa fa-minus',
};

/** Single win/loss/draw badge. Replaces 4 ad-hoc icon+colour combos. */
export function OutcomeBadge({ outcome, icon = false, className }: OutcomeBadgeProps) {
  return (
    <span
      className={cx('tt-outcome', outcomeTone[outcome], icon && 'tt-outcome--icon', className)}
      aria-label={outcome === 'W' ? 'Win' : outcome === 'L' ? 'Loss' : 'Draw'}
    >
      {icon ? <i className={outcomeIcon[outcome]} /> : outcome}
    </span>
  );
}

// ── ExternalLinkButton ────────────────────────────────────────────────────────

export interface ExternalLinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  iconClassName?: string;
  className?: string;
  children?: ReactNode;
}

/** Single external-link affordance (always noopener+noreferrer, globe icon). */
export function ExternalLinkButton({ iconClassName = 'fa fa-external-link-alt', className, children, ...rest }: ExternalLinkButtonProps) {
  return (
    <a
      target="_blank"
      rel="noopener noreferrer"
      className={cx('tt-external-link', className)}
      {...rest}
    >
      <i className={iconClassName} aria-hidden="true" />
      {children}
    </a>
  );
}
