import type { ReactNode } from 'react';
import { cx } from '../utils/cx';

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

export interface ListProps {
  children: ReactNode;
  variant?: ListVariant;
  size?: ListSize;
  divider?: ListDivider;
  /** Columns for grid variant. */
  columns?: number;
  className?: string;
}

export function List({
  children,
  variant = 'row',
  size = 'md',
  divider = 'hairline',
  columns = 3,
  className,
}: ListProps) {
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
      {children}
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
    <div className={cx("tt-list-item", active && "tt-list-item--active", disabled && "tt-list-item--disabled", className)}>
      {clickableEl}
      {trailingEl ? <span className="tt-list-item__trailing">{trailingEl}</span> : null}
    </div>
  );
}
