import type { ReactNode } from 'react';
import { cx } from '../utils/cx';

export interface EntityHeroProps {
  eyebrow?: ReactNode;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  highlights?: ReactNode;
  accent?: 'brand' | 'neutral' | 'success';
  className?: string;
}

export function EntityHero({
  eyebrow,
  leading,
  title,
  subtitle,
  actions,
  highlights,
  accent = 'brand',
  className,
}: EntityHeroProps) {
  return (
    <section className={cx('tt-entity-hero', `tt-entity-hero--${accent}`, className)}>
      <div className="tt-entity-hero__main">
        {leading ? <div className="tt-entity-hero__leading">{leading}</div> : null}
        <div className="tt-entity-hero__copy">
          {eyebrow ? <div className="tt-entity-hero__eyebrow">{eyebrow}</div> : null}
          <h1 className="tt-entity-hero__title">{title}</h1>
          {subtitle ? <div className="tt-entity-hero__subtitle">{subtitle}</div> : null}
        </div>
        {actions ? <div className="tt-entity-hero__actions">{actions}</div> : null}
      </div>
      {highlights ? <div className="tt-entity-hero__highlights">{highlights}</div> : null}
    </section>
  );
}
