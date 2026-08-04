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
  /** Heading level for the title. Defaults to 1 (page title). Use 2 when the route already exposes an <h1> (e.g. the root tab header). */
  headingLevel?: 1 | 2;
  className?: string;
  actionPlacement?: 'auto' | 'inline' | 'below';
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
  actionPlacement = 'auto',
  headingLevel = 1,
}: EntityHeroProps) {
  const inlineActions = actions && actionPlacement !== 'below';

  return (
    <section className={cx(
      'tt-entity-hero',
      `tt-entity-hero--${accent}`,
      `tt-entity-hero--actions-${actionPlacement}`,
      className,
    )}>
      <div className="tt-entity-hero__main">
        {leading ? <div className="tt-entity-hero__leading">{leading}</div> : null}
        <div className="tt-entity-hero__copy">
          {eyebrow ? <div className="tt-entity-hero__eyebrow">{eyebrow}</div> : null}
          {headingLevel === 2 ? (
            <h2 className="tt-entity-hero__title">{title}</h2>
          ) : (
            <h1 className="tt-entity-hero__title">{title}</h1>
          )}
          {subtitle ? <div className="tt-entity-hero__subtitle">{subtitle}</div> : null}
        </div>
        {inlineActions ? <div className="tt-entity-hero__actions">{actions}</div> : null}
      </div>
      {actions && actionPlacement === 'below' ? (
        <div className="tt-entity-hero__actions">{actions}</div>
      ) : null}
      {highlights ? <div className="tt-entity-hero__highlights">{highlights}</div> : null}
    </section>
  );
}
