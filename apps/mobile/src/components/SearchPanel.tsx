import type { ReactNode } from 'react';
import { EmptyState, ErrorState, SegmentedToggle, cx } from '../ui/appkit';
import type { SegmentedToggleOption } from '../ui/appkit';

export interface SearchPanelProps<T extends string = string> {
  eyebrow?: string;
  title?: ReactNode;
  placeholder?: string;
  /** Controlled query value (parent owns useSearch). */
  query: string;
  onQueryChange: (value: string) => void;
  /** Optional scope control (All/Selected, etc.). */
  scope?: {
    ariaLabel: string;
    value: T;
    onChange: (value: T) => void;
    options: SegmentedToggleOption<T>[];
  };
  className?: string;
  /** Children render below the panel (the actual results and state rows). */
  children?: ReactNode;
}

/** Shared search surface for root-tab search screens. */
export function SearchPanel<T extends string = string>({
  eyebrow,
  title,
  placeholder = 'Search…',
  query,
  onQueryChange,
  scope,
  className,
  children,
}: SearchPanelProps<T>) {
  return (
    <>
      <section
        className={cx('tt-search-panel', className)}
        role="search"
        aria-label={eyebrow ? `${eyebrow} search` : 'Search'}
      >
        <div className="tt-search-panel__top">
          <div>
            {eyebrow ? <p className="tt-eyebrow">{eyebrow}</p> : null}
            {title ? <h2 className="tt-hero-title">{title}</h2> : null}
          </div>
        </div>

        <label className="tt-search-input">
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
              className="tt-search-input__clear"
              onClick={() => onQueryChange('')}
              aria-label="Clear search"
            >
              <i className="fa fa-times-circle" aria-hidden="true" />
            </button>
          ) : null}
        </label>

        {scope ? (
          <div className="tt-search-panel__scope">
            <SegmentedToggle
              ariaLabel={scope.ariaLabel}
              value={scope.value}
              onChange={scope.onChange}
              options={scope.options}
            />
          </div>
        ) : null}
      </section>
      {children}
    </>
  );
}

export { EmptyState, ErrorState };
