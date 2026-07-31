import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from '../utils/cx';

export interface SurfaceProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  as?: ElementType;
  variant?: 'canvas' | 'subtle' | 'raised' | 'accent';
  padding?: 'none' | 'compact' | 'standard' | 'editorial';
  children: ReactNode;
}

export function Surface({
  as: Component = 'div',
  variant = 'canvas',
  padding = 'none',
  className,
  children,
  ...rest
}: SurfaceProps) {
  return (
    <Component
      {...rest}
      className={cx('tt-surface', `tt-surface--${variant}`, `tt-surface--padding-${padding}`, className)}
    >
      {children}
    </Component>
  );
}
