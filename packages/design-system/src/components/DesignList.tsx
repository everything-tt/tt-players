import type { ComponentProps } from 'react';
import { cx } from '../utils/cx';
import { Avatar, List } from './List';

export type DesignListDensity = 'compact' | 'comfortable';

export interface DesignListProps extends ComponentProps<typeof List> {
  density?: DesignListDensity;
}

export function DesignList({ density = 'compact', className, ...props }: DesignListProps) {
  return <List {...props} className={cx(`tt-list--${density}`, className)} />;
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
