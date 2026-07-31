import type { ReactNode } from 'react';
import { cx } from '../utils/cx';

export interface FilterBarProps {
  children: ReactNode;
  ariaLabel?: string;
  scrollable?: boolean;
  className?: string;
}

export function FilterBar({ children, ariaLabel = 'Filters', scrollable = true, className }: FilterBarProps) {
  return (
    <div
      className={cx('tt-filter-bar', scrollable && 'tt-filter-bar--scrollable', className)}
      role="group"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}
