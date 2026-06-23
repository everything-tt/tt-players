import type { ReactNode } from 'react';
import { AppButtonLink } from './AppButton';
import { cx } from '../utils/cx';

export interface EmptyStateProps {
  iconClassName?: string;
  title: string;
  message?: ReactNode;
  action?: { label: string; onClick: () => void };
  className?: string;
}

/** Single empty-state treatment. Replaces ~20 bare `<p>No X found</p>` sentences. */
export function EmptyState({ iconClassName = 'fa fa-inbox', title, message, action, className }: EmptyStateProps) {
  return (
    <div className={cx('tt-empty-state', className)} role="status">
      <span className="tt-empty-state__icon" aria-hidden="true">
        <i className={iconClassName} />
      </span>
      <h3 className="tt-empty-state__title">{title}</h3>
      {message ? <p className="tt-empty-state__message">{message}</p> : null}
      {action ? (
        <AppButtonLink onClick={(e) => { e.preventDefault(); action.onClick(); }} tone="primary" size="sm">
          {action.label}
        </AppButtonLink>
      ) : null}
    </div>
  );
}

export interface ErrorStateProps {
  title?: string;
  message: ReactNode;
  onRetry?: () => void;
  className?: string;
}

/** Single error-state treatment. Replaces inline `tt-player-section-error` + raw exceptions. */
export function ErrorState({ title = 'Something went wrong', message, onRetry, className }: ErrorStateProps) {
  return (
    <div className={cx('tt-error-state', className)} role="alert">
      <span className="tt-error-state__icon" aria-hidden="true">
        <i className="fa fa-exclamation-triangle" />
      </span>
      <h3 className="tt-error-state__title">{title}</h3>
      <p className="tt-error-state__message">{message}</p>
      {onRetry ? (
        <AppButtonLink onClick={(e) => { e.preventDefault(); onRetry(); }} tone="outline" size="sm">
          <i className="fa fa-redo me-2" />Retry
        </AppButtonLink>
      ) : null}
    </div>
  );
}

export interface SectionHeaderProps {
  title: ReactNode;
  note?: ReactNode;
  /** Optional action on the right (e.g. a source link or count pill). */
  action?: ReactNode;
  className?: string;
}

/** Replaces the 51 hand-rolled `tt-player-section-header` blocks. */
export function SectionHeader({ title, note, action, className }: SectionHeaderProps) {
  return (
    <div className={cx('tt-section-header', className)}>
      <h2 className="tt-section-header__title">{title}</h2>
      {note !== undefined ? <span className="tt-section-header__note">{note}</span> : null}
      {action}
    </div>
  );
}

export interface HeroCardProps {
  eyebrow?: string;
  title: ReactNode;
  summary?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Replaces the 7 duplicated hero cards (player/team/fixture/insights/h2h/search/leagues). */
export function HeroCard({ eyebrow, title, summary, actions, children, className }: HeroCardProps) {
  return (
    <section className={cx('tt-hero', className)}>
      <div className="tt-hero__top">
        <div className="tt-hero__copy">
          {eyebrow ? <p className="tt-eyebrow">{eyebrow}</p> : null}
          <h1 className="tt-hero-title">{title}</h1>
          {summary ? <div className="tt-hero__summary">{summary}</div> : null}
        </div>
        {actions ? <div className="tt-hero__actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
