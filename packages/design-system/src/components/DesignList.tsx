import type { ComponentProps } from 'react';
import { cx } from '../utils/cx';
import { Avatar, List } from './List';

export type DesignListDensity = 'compact' | 'comfortable' | 'editorial';
export type DesignListSurface = 'flat' | 'grouped';
export type DesignListTextWrap = 'single-line' | 'multiline' | 'rich';

export interface DesignListProps extends ComponentProps<typeof List> {
  density?: DesignListDensity;
  surface?: DesignListSurface;
  textWrap?: DesignListTextWrap;
  /** Alias for the first client-rendered page size. */
  initialVisibleCount?: number;
}

export function DesignList({
  density = 'compact',
  surface = 'flat',
  textWrap = 'single-line',
  className,
  initialVisibleCount,
  pageSize,
  ...props
}: DesignListProps) {
  return (
    <List
      {...props}
      pageSize={initialVisibleCount ?? pageSize}
      className={cx(
        `tt-list--${density}`,
        `tt-list--surface-${surface}`,
        `tt-list--text-${textWrap}`,
        className,
      )}
    />
  );
}

export interface DesignAvatarProps extends Omit<ComponentProps<typeof Avatar>, 'size'> {
  size?: 'compact' | 'standard' | 'hero';
}

const legacySize: Record<NonNullable<DesignAvatarProps['size']>, 'sm' | 'md' | 'lg'> = {
  compact: 'sm',
  standard: 'md',
  hero: 'lg',
};

export function DesignAvatar({ size = 'standard', className, ...props }: DesignAvatarProps) {
  return <Avatar {...props} size={legacySize[size]} className={cx(`tt-avatar--${size}`, className)} />;
}
