import type { ElementType, ReactNode } from 'react';
import { cx } from '../utils/cx';

export type LayoutGap = 'none' | 'xs' | 'sm' | 'md' | 'lg';

interface BaseLayoutProps {
  children: ReactNode;
  className?: string;
}

export interface StackProps extends BaseLayoutProps {
  as?: ElementType;
  gap?: LayoutGap;
}

export function Stack({ as: Component = 'div', gap = 'md', className, children }: StackProps) {
  return <Component className={cx('tt-stack', `tt-stack--${gap}`, className)}>{children}</Component>;
}

export interface InlineProps extends BaseLayoutProps {
  as?: ElementType;
  gap?: LayoutGap;
  align?: 'start' | 'center' | 'end' | 'baseline' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between';
  wrap?: boolean;
}

export function Inline({
  as: Component = 'div',
  gap = 'sm',
  align = 'center',
  justify = 'start',
  wrap = false,
  className,
  children,
}: InlineProps) {
  return (
    <Component
      className={cx(
        'tt-inline',
        `tt-inline--${gap}`,
        `tt-inline--align-${align}`,
        `tt-inline--${justify}`,
        wrap && 'tt-inline--wrap',
        className,
      )}
    >
      {children}
    </Component>
  );
}
