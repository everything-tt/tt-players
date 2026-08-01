import type { ReactNode } from 'react';
import { cx } from '../utils/cx';

export interface SearchHeaderProps {
  ariaLabel: string;
  placeholder?: string;
  query: string;
  onQueryChange: (value: string) => void;
  filters?: ReactNode;
  sticky?: boolean;
  className?: string;
}

/**
 * Compact browse-page search treatment. Search is the primary action, so this
 * intentionally avoids a surrounding hero/card and can remain below a
 * collapsed browse toolbar while results scroll.
 */
export function SearchHeader({
  ariaLabel,
  placeholder = 'Search…',
  query,
  onQueryChange,
  filters,
  sticky = true,
  className,
}: SearchHeaderProps) {
  return (
    <section
      className={cx('tt-search-header', sticky && 'tt-search-header--sticky', className)}
      role="search"
      aria-label={ariaLabel}
    >
      <label className="tt-search-header__field">
        <i className="fa fa-search" aria-hidden="true" />
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          aria-label={placeholder}
        />
        {query ? (
          <button
            type="button"
            className="tt-search-header__clear"
            onClick={() => onQueryChange('')}
            aria-label="Clear search"
          >
            <i className="fa fa-times-circle" aria-hidden="true" />
          </button>
        ) : null}
      </label>
      {filters ? <div className="tt-search-header__filters">{filters}</div> : null}
    </section>
  );
}
