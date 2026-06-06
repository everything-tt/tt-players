import type { MouseEventHandler, ReactNode } from 'react';
import { AppButtonLink } from './AppButton';
import { cx } from '../utils/cx';

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
    <div className={cx('card card-style', className)} data-card-height={cardHeight}>
      {children}
    </div>
  );
}

export function AppCardContent({ children, className }: AppCardContentProps) {
  return <div className={cx('content', className)}>{children}</div>;
}

export function AppLoadingCard({ message, className }: AppLoadingCardProps) {
  return (
    <AppCard className={className}>
      <AppCardContent>
        <p className="mb-0">
          <i className="fa fa-spinner fa-spin me-2" />
          {message}
        </p>
      </AppCardContent>
    </AppCard>
  );
}

export function AppMessageCard({ title, message, tone = 'neutral', action, className }: AppMessageCardProps) {
  return (
    <AppCard className={className}>
      <AppCardContent>
        {title ? <h4 className="mb-2">{title}</h4> : null}
        <p className={cx('mb-3', tone === 'danger' && 'color-red-dark')}>{message}</p>
        {action ? (
          <AppButtonLink onClick={action.onClick} tone={action.tone ?? 'highlight'}>
            {action.label}
          </AppButtonLink>
        ) : null}
      </AppCardContent>
    </AppCard>
  );
}
