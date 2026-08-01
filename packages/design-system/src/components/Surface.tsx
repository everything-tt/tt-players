import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from '../utils/cx';

export interface SurfaceProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  as?: ElementType;
  variant?: 'canvas' | 'subtle' | 'raised' | 'accent';
  /** @deprecated Use variant. Kept while migrated screens converge on the canonical API. */
  tone?: 'canvas' | 'subtle' | 'raised' | 'accent';
  padding?: 'none' | 'compact' | 'standard' | 'editorial';
  children: ReactNode;
}

export function Surface({
  as: Component = 'div',
  variant,
  tone,
  padding = 'none',
  className,
  children,
  ...rest
}: SurfaceProps) {
  const resolvedVariant = variant ?? tone ?? 'canvas';
  return (
    <Component
      {...rest}
      className={cx('tt-surface', `tt-surface--${resolvedVariant}`, `tt-surface--padding-${padding}`, className)}
    >
      {children}
    </Component>
  );
}
