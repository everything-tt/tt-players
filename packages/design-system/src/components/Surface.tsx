import type { ElementType, ReactNode } from 'react';
import { cx } from '../utils/cx';

export interface SurfaceProps {
  as?: ElementType;
  variant?: 'canvas' | 'subtle' | 'raised' | 'accent';
  padding?: 'none' | 'compact' | 'standard' | 'editorial';
  className?: string;
  children: ReactNode;
}

export function Surface({
  as: Component = 'div',
  variant = 'canvas',
  padding = 'none',
  className,
  children,
}: SurfaceProps) {
  return (
    <Component className={cx('tt-surface', `tt-surface--${variant}`, `tt-surface--padding-${padding}`, className)}>
      {children}
    </Component>
  );
}
