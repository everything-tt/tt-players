import type { ReactNode } from 'react';
import { EmptyState, ErrorState, SearchHeader, SegmentedToggle } from '../ui/appkit';
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
  /** Children render below the search header (the actual results and state rows). */
  children?: ReactNode;
}

/**
 * Shared browse-page search treatment. The root toolbar already carries the
 * page title, so search remains compact, flat and sticky instead of being
 * wrapped in a second hero card.
 */
export function SearchPanel<T extends string = string>({
  eyebrow,
  placeholder = 'Search…',
  query,
  onQueryChange,
  scope,
  className,
  children,
}: SearchPanelProps<T>) {
  return (
    <>
      <SearchHeader
        ariaLabel={eyebrow ? `${eyebrow} search` : 'Search'}
        placeholder={placeholder}
        query={query}
        onQueryChange={onQueryChange}
        className={className}
        filters={scope ? (
          <SegmentedToggle
            ariaLabel={scope.ariaLabel}
            value={scope.value}
            onChange={scope.onChange}
            options={scope.options}
          />
        ) : undefined}
      />
      {children}
    </>
  );
}

export { EmptyState, ErrorState };
