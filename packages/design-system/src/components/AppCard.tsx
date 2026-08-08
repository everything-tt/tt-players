import type { MouseEvent as ReactMouseEvent, MouseEventHandler, ReactNode } from 'react';
import { AppButton } from './AppButton';
import { cn } from '../lib/utils';
import { Card, CardContent } from './ui/card';

export interface AppCardProps {
  children: ReactNode;
  className?: string;
  cardHeight?: number;
}

export interface AppCardContentProps {
  children: ReactNode;
  className?: string;
}

export interface AppLoadingCardProps {
  message: string;
  className?: string;
}

export interface AppMessageCardAction {
  label: string;
  onClick: MouseEventHandler<HTMLAnchorElement>;
  tone?: 'highlight' | 'outline-highlight';
}

export interface AppMessageCardProps {
  title?: string;
  message: string;
  tone?: 'neutral' | 'danger';
  action?: AppMessageCardAction;
  className?: string;
}

export function AppCard({ children, className, cardHeight }: AppCardProps) {
  return (
    <Card unstyled className={cn('card card-style', 'tt-card', className)} data-card-height={cardHeight}>
      {children}
    </Card>
  );
}

export function AppCardContent({ children, className }: AppCardContentProps) {
  return <CardContent className={cn('content', 'tt-card__content', className)}>{children}</CardContent>;
}

export function AppLoadingCard({ message, className }: AppLoadingCardProps) {
  return (
    <AppCard className={cn('app-loading-card', 'tt-card--loading', className)}>
      <AppCardContent>
        <div className="app-loading-card-body" role="status" aria-live="polite">
          <span className="app-loading-dot" aria-hidden="true" />
          <span>{message}</span>
        </div>
        <div className="app-loading-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </AppCardContent>
    </AppCard>
  );
}

export function AppMessageCard({ title, message, tone = 'neutral', action, className }: AppMessageCardProps) {
  return (
    <AppCard className={cn('tt-card--message', tone === 'danger' && 'tt-card--danger', className)}>
      <AppCardContent>
        {title ? <h4 className="mb-2">{title}</h4> : null}
        <p className={cn('mb-3', tone === 'danger' && 'color-red-dark')}>{message}</p>
        {action ? (
          <AppButton
            onClick={(event) => action.onClick(event as unknown as ReactMouseEvent<HTMLAnchorElement>)}
            tone={action.tone ?? 'highlight'}
            full
          >
            {action.label}
          </AppButton>
        ) : null}
      </AppCardContent>
    </AppCard>
  );
}
