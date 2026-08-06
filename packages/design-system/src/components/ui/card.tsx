import * as React from 'react';
import { cn } from '../../lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  unstyled?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, unstyled = false, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card"
      className={cn(!unstyled && 'flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm', className)}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="card-content" className={cn('px-6', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';
