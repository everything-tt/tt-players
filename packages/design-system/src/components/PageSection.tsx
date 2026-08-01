import type { ReactNode } from 'react';
import { cx } from '../utils/cx';
import { SectionHeader, type SectionHeaderEmphasis } from './States';

export type PageSectionEmphasis = SectionHeaderEmphasis;

export interface PageSectionProps {
  surface?: 'flat' | 'raised' | 'hero';
  density?: 'compact' | 'standard' | 'editorial';
  emphasis?: PageSectionEmphasis;
  title?: ReactNode;
  description?: ReactNode;
  /** @deprecated Use `description` for explanatory copy or `meta` for counts/status. */
  note?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  ariaLabelledby?: string;
  className?: string;
  children: ReactNode;
}

export function PageSection({
  surface = 'flat',
  density = 'standard',
  emphasis = 'standard',
  title,
  description,
  note,
  meta,
  action,
  ariaLabelledby,
  className,
  children,
}: PageSectionProps) {
  return (
    <section
      className={cx(
        'tt-section',
        `tt-section--${surface}`,
        `tt-section--${density}`,
        `tt-section--emphasis-${emphasis}`,
        className,
      )}
      aria-labelledby={ariaLabelledby}
    >
      {title ? (
        <SectionHeader
          title={title}
          description={description}
          note={note}
          meta={meta}
          action={action}
          density={density === 'compact' ? 'compact' : 'standard'}
          emphasis={emphasis}
        />
      ) : null}
      {children}
    </section>
  );
}
