import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../utils/cx';

// ── MoreButton: single "Load More / View All" control ─────────────────────────

export interface MoreButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  loading?: boolean;
  hasMore?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}

/** Single pagination affordance. Replaces 3 different Load-More/View-All styles. */
export function MoreButton({ loading = false, hasMore = true, onClick, children, className, disabled, ...rest }: MoreButtonProps) {
  return (
    <button
      type="button"
      onClick={() => { if (!loading && hasMore) onClick(); }}
      className={cx('tt-btn tt-btn--sm tt-btn-rounded--full tt-btn-weight--semibold', loading ? 'tt-btn--outline' : 'tt-btn--primary', 'tt-btn--full', className)}
      disabled={disabled || loading || !hasMore}
      {...rest}
    >
      {loading ? (<><i className="fa fa-spinner fa-spin me-2" />Loading…</>) : children}
    </button>
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
