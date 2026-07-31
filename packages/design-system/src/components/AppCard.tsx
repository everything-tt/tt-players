import type { ReactNode } from 'react';
import { AppButton } from './AppButton';
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
  onClick: () => void;
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
    <div className={cx('card card-style', 'tt-card', className)} data-card-height={cardHeight}>
      {children}
    </div>
  );
}

export function AppCardContent({ children, className }: AppCardContentProps) {
  return <div className={cx('content', 'tt-card__content', className)}>{children}</div>;
}

export function AppLoadingCard({ message, className }: AppLoadingCardProps) {
  return (
    <AppCard className={cx('app-loading-card', 'tt-card--loading', className)}>
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
    <AppCard className={cx('tt-card--message', tone === 'danger' && 'tt-card--danger', className)}>
      <AppCardContent>
        {title ? <h3 className="mb-2">{title}</h3> : null}
        <p className={cx('mb-3', tone === 'danger' && 'color-red-dark')}>{message}</p>
        {action ? (
          <AppButton onClick={action.onClick} tone={action.tone ?? 'highlight'} full>
            {action.label}
          </AppButton>
        ) : null}
      </AppCardContent>
    </AppCard>
  );
}
