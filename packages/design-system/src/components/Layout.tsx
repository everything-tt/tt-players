import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from '../utils/cx';

export type LayoutGap = 'none' | 'xs' | 'sm' | 'md' | 'lg';

interface BaseLayoutProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  children: ReactNode;
}

export interface StackProps extends BaseLayoutProps {
  as?: ElementType;
  gap?: LayoutGap;
}

export function Stack({ as: Component = 'div', gap = 'md', className, children, ...rest }: StackProps) {
  return (
    <Component {...rest} className={cx('tt-stack', `tt-stack--${gap}`, className)}>
      {children}
    </Component>
  );
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
  ...rest
}: InlineProps) {
  return (
    <Component
      {...rest}
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
