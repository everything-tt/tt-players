import type { ReactNode } from 'react';
import { AppButton } from './AppButton';
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
    <div className={cx('tt-empty-state', 'tt-state tt-state--empty', className)} role="status">
      <span className="tt-empty-state__icon tt-state__icon" aria-hidden="true">
        <i className={iconClassName} />
      </span>
      <h3 className="tt-empty-state__title tt-state__title">{title}</h3>
      {message ? <p className="tt-empty-state__message tt-state__message">{message}</p> : null}
      {action ? (
        <AppButton onClick={action.onClick} tone="primary" size="sm">
          {action.label}
        </AppButton>
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
    <div className={cx('tt-error-state', 'tt-state tt-state--error', className)} role="alert">
      <span className="tt-error-state__icon tt-state__icon" aria-hidden="true">
        <i className="fa fa-exclamation-triangle" />
      </span>
      <h3 className="tt-error-state__title tt-state__title">{title}</h3>
      <p className="tt-error-state__message tt-state__message">{message}</p>
      {onRetry ? (
        <AppButton onClick={onRetry} tone="outline" size="sm">
          <i className="fa fa-redo me-2" aria-hidden="true" />Retry
        </AppButton>
      ) : null}
    </div>
  );
}

export type SectionHeaderEmphasis = 'primary' | 'standard' | 'secondary';

export interface SectionHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** @deprecated Use `description` for explanatory copy or `meta` for counts/status. */
  note?: ReactNode;
  /** Count, status or confidence displayed in the trailing region. */
  meta?: ReactNode;
  /** Optional interactive control displayed after metadata. */
  action?: ReactNode;
  density?: 'compact' | 'standard';
  emphasis?: SectionHeaderEmphasis;
  className?: string;
}

/** Canonical section heading with separate copy, metadata and action regions. */
export function SectionHeader({
  title,
  description,
  note,
  meta,
  action,
  density = 'standard',
  emphasis = 'standard',
  className,
}: SectionHeaderProps) {
  const resolvedDescription = description ?? note;
  const hasTrailing = meta !== undefined || Boolean(action);

  return (
    <div className={cx(
      'tt-section-header',
      `tt-section-header--${density}`,
      `tt-section-header--emphasis-${emphasis}`,
      className,
    )}>
      <div className="tt-section-header__copy">
        <h2 className="tt-section-header__title">{title}</h2>
        {resolvedDescription !== undefined && resolvedDescription !== null ? (
          <div className="tt-section-header__description tt-section-header__note">{resolvedDescription}</div>
        ) : null}
      </div>
      {hasTrailing ? (
        <div className="tt-section-header__trailing">
          {meta !== undefined ? <span className="tt-section-header__meta">{meta}</span> : null}
          {action ? <span className="tt-section-header__action">{action}</span> : null}
        </div>
      ) : null}
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

/** Compatibility hero card; prefer EntityHero for new and migrated screens. */
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
