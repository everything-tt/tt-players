import {
  Children,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cx } from '../utils/cx';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

// ── Slot components (leading/trailing) ────────────────────────────────────────

export interface AvatarProps {
  text: string;
  size?: 'sm' | 'md' | 'lg';
  /** Deterministic colour class (e.g. from getPlayerAvatarColor) — overrides tone. */
  colorClassName?: string;
  /** Solid accent fill (default for hero) vs subtle tint (default for lists). */
  variant?: 'solid' | 'subtle' | 'onAccent';
  className?: string;
}

const avatarSizeClass: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'tt-avatar--sm',
  md: 'tt-avatar--md',
  lg: 'tt-avatar--lg',
};

/** Single avatar treatment. Replaces the 4 ad-hoc avatar implementations. */
export function Avatar({ text, size = 'md', colorClassName, variant = 'subtle', className }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'tt-avatar',
        avatarSizeClass[size],
        `tt-avatar--${variant}`,
        colorClassName ?? (variant === 'solid' ? 'bg-highlight color-white' : ''),
        className,
      )}
    >
      {text}
    </span>
  );
}

export function RankBadge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('tt-rank-badge', className)} aria-hidden="true">{children}</span>;
}

export function IconCircle({
  iconClassName,
  tone = 'accent',
  className,
}: {
  iconClassName: string;
  tone?: 'accent' | 'success' | 'danger' | 'warning' | 'neutral';
  className?: string;
}) {
  return (
    <span className={cx('tt-icon-circle', `tt-icon-circle--${tone}`, className)} aria-hidden="true">
      <i className={iconClassName} />
    </span>
  );
}

export interface PillProps {
  children: ReactNode;
  tone?: 'accent' | 'neutral' | 'success' | 'danger' | 'warning';
  size?: 'xs' | 'sm';
  active?: boolean;
  className?: string;
}

/** Single small labelled pill. Replaces 6 ad-hoc status/badge variants. */
export function Pill({ children, tone = 'neutral', size = 'sm', active, className }: PillProps) {
  return (
    <span
      className={cx(
        'tt-pill',
        `tt-pill--${tone}`,
        `tt-pill--${size}`,
        active && 'tt-pill--active',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Checkbox({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <span className={cx('tt-check', checked && 'tt-check--checked', className)} aria-hidden="true">
      {checked ? '✓' : ''}
    </span>
  );
}

// ── List / ListItem ────────────────────────────────────────────────────────────

export type ListVariant = 'row' | 'grid';
export type ListSize = 'sm' | 'md' | 'lg';
export type ListDivider = 'hairline' | 'gap' | 'none';

export interface InfiniteListFooterProps {
  hasMore: boolean;
  isLoading?: boolean;
  onLoadMore: () => void | Promise<unknown>;
  loadLabel?: string;
  loadingLabel?: string;
  endLabel?: string;
  /** Disable automatic loading after an error while retaining the retry button. */
  autoLoad?: boolean;
  className?: string;
}

/**
 * Shared scroll sentinel used by both client-paged lists and server-paged views.
 * The button remains available as a keyboard/accessibility fallback.
 */
export function InfiniteListFooter({
  hasMore,
  isLoading = false,
  onLoadMore,
  loadLabel = 'Show more',
  loadingLabel = 'Loading more…',
  endLabel,
  autoLoad = true,
  className,
}: InfiniteListFooterProps) {
  const targetRef = useRef<HTMLDivElement | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    const target = targetRef.current;
    if (!target || !autoLoad || !hasMore || isLoading) return;
    if (typeof IntersectionObserver === 'undefined') return;

    let requested = false;
    const observer = new IntersectionObserver((entries) => {
      if (!requested && entries.some((entry) => entry.isIntersecting)) {
        requested = true;
        void onLoadMoreRef.current();
      }
    }, { rootMargin: '240px 0px' });

    observer.observe(target);
    return () => observer.disconnect();
  }, [autoLoad, hasMore, isLoading]);

  if (!hasMore && !isLoading && !endLabel) return null;

  return (
    <div ref={targetRef} className={cx('tt-infinite-list-footer', className)} aria-live="polite">
      {isLoading ? (
        <span role="status">{loadingLabel}</span>
      ) : hasMore ? (
        <button type="button" onClick={() => void onLoadMoreRef.current()}>
          {loadLabel}
        </button>
      ) : (
        <span role="status">{endLabel}</span>
      )}
    </div>
  );
}

export interface ListProps {
  children: ReactNode;
  variant?: ListVariant;
  size?: ListSize;
  divider?: ListDivider;
  /** Columns for grid variant. */
  columns?: number;
  className?: string;
  /** Progressively render long in-memory lists. Disable for server-paged lists. */
  paginate?: boolean;
  /** Number of rows revealed per page when pagination is active. */
  pageSize?: number;
}

function childKey(child: ReactNode, index: number): string {
  return isValidElement(child) && child.key != null ? String(child.key) : `index:${index}`;
}

export function List({
  children,
  variant = 'row',
  size = 'md',
  divider = 'hairline',
  columns = 3,
  className,
  paginate = true,
  pageSize = 20,
}: ListProps) {
  const items = Children.toArray(children);
  const normalizedPageSize = Math.max(1, Math.floor(pageSize));
  const [visibleCount, setVisibleCount] = useState(normalizedPageSize);
  const previousKeysRef = useRef<string[]>([]);
  const itemKeys = items.map(childKey);
  const keySignature = itemKeys.join('\u001f');

  useIsomorphicLayoutEffect(() => {
    setVisibleCount(normalizedPageSize);
  }, [normalizedPageSize]);

  useIsomorphicLayoutEffect(() => {
    const previousKeys = previousKeysRef.current;
    const isAppendOnly = previousKeys.length > 0
      && previousKeys.length <= itemKeys.length
      && previousKeys.every((key, index) => itemKeys[index] === key);

    if (previousKeys.length > 0 && !isAppendOnly) {
      setVisibleCount(normalizedPageSize);
    }
    previousKeysRef.current = itemKeys;
  }, [keySignature, normalizedPageSize]);

  const shouldPaginate = paginate && items.length > normalizedPageSize;
  const visibleItems = shouldPaginate ? items.slice(0, visibleCount) : items;
  const remaining = Math.max(0, items.length - visibleItems.length);
  const hasMore = shouldPaginate && remaining > 0;

  return (
    <div
      className={cx(
        'tt-list',
        `tt-list--${variant}`,
        `tt-list--${size}`,
        `tt-list-divider--${divider}`,
        variant === 'grid' && `tt-list-cols--${columns}`,
        className,
      )}
    >
      {visibleItems}
      {shouldPaginate ? (
        <InfiniteListFooter
          hasMore={hasMore}
          onLoadMore={() => setVisibleCount((current) => Math.min(current + normalizedPageSize, items.length))}
          loadLabel={`Show ${Math.min(normalizedPageSize, remaining)} more · ${visibleItems.length} of ${items.length}`}
          endLabel={`All ${items.length} shown`}
        />
      ) : null}
    </div>
  );
}

export interface ListItemProps {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  href?: string;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  /** Hide the default chevron when no trailing slot is passed. */
  hideChevron?: boolean;
}

export function ListItem({
  leading,
  title,
  subtitle,
  trailing,
  onClick,
  href,
  active,
  disabled,
  className,
  hideChevron,
}: ListItemProps) {
  const content = (
    <span className="tt-list-item__content">
      <span className="tt-list-item__title">{title}</span>
      {subtitle ? <span className="tt-list-item__subtitle">{subtitle}</span> : null}
    </span>
  );

  const handleNavigate = (event: React.MouseEvent<HTMLElement>) => {
    if (disabled) { event.preventDefault(); return; }
    event.preventDefault();
    onClick?.();
  };

  const inner = (
    <>
      {leading ? <span className="tt-list-item__leading">{leading}</span> : null}
      {content}
    </>
  );

  const clickableEl = href ? (
    <a href={href} onClick={handleNavigate} className="tt-list-item__clickable" aria-disabled={disabled || undefined}>
      {inner}
    </a>
  ) : onClick ? (
    <button type="button" onClick={handleNavigate} className="tt-list-item__clickable" disabled={disabled}>
      {inner}
    </button>
  ) : (
    <div className="tt-list-item__clickable">{inner}</div>
  );

  const trailingEl = trailing !== undefined
    ? trailing
    : (hideChevron ? null : <span className="tt-list-item__trailing" aria-hidden="true"><i className="fa fa-angle-right" /></span>);

  return (
    <div className={cx('tt-list-item', active && 'tt-list-item--active', disabled && 'tt-list-item--disabled', className)}>
      {clickableEl}
      {trailingEl ? <span className="tt-list-item__trailing">{trailingEl}</span> : null}
    </div>
  );
}
