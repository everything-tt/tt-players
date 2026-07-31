import type { ReactNode } from 'react';
import { cx } from '../utils/cx';
import { SectionHeader } from './States';

export interface PageSectionProps {
  surface?: 'flat' | 'raised' | 'hero';
  density?: 'compact' | 'standard' | 'editorial';
  title?: ReactNode;
  note?: ReactNode;
  ariaLabelledby?: string;
  className?: string;
  children: ReactNode;
}

export function PageSection({
  surface = 'flat',
  density = 'standard',
  title,
  note,
  ariaLabelledby,
  className,
  children,
}: PageSectionProps) {
  return (
    <section
      className={cx('tt-section', `tt-section--${surface}`, `tt-section--${density}`, className)}
      aria-labelledby={ariaLabelledby}
    >
      {title ? <SectionHeader title={title} note={note} density={density === 'compact' ? 'compact' : 'standard'} /> : null}
      {children}
    </section>
  );
}
