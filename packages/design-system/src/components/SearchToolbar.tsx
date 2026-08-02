import type { ReactNode } from 'react';
import { cx } from '../utils/cx';

export interface SearchToolbarProps {
  children: ReactNode;
  actions?: ReactNode;
  ariaLabel?: string;
  className?: string;
}

/** Compact native-style search row with optional trailing filter actions. */
export function SearchToolbar({
  children,
  actions,
  ariaLabel = 'Search',
  className,
}: SearchToolbarProps) {
  return (
    <section
      className={cx('tt-app-search-toolbar', className)}
      role="search"
      aria-label={ariaLabel}
    >
      <div className="tt-app-search-toolbar__input">{children}</div>
      {actions ? (
        <div className="tt-app-search-toolbar__actions">{actions}</div>
      ) : null}
    </section>
  );
}
