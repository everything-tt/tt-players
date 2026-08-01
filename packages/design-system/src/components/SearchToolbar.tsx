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
      className={cx('tt-search-toolbar', className)}
      role="search"
      aria-label={ariaLabel}
    >
      <div className="tt-search-toolbar__input">{children}</div>
      {actions ? (
        <div className="tt-search-toolbar__actions">{actions}</div>
      ) : null}
    </section>
  );
}
diff --git a/packages/design-system/src/components/AppToggleButton.tsx b/packages/design-system/src/components/AppToggleButton.tsx
new file mode 100644
--- /dev/null
+++ b/packages/design-system/src/components/AppToggleButton.tsx
