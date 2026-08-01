import type { ReactNode } from 'react';
import { cx } from '../utils/cx';

export interface MetricItem {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
}

export interface MetricGridProps {
  metrics?: MetricItem[];
  /** @deprecated Use metrics. Kept while migrated screens converge on the canonical API. */
  items?: MetricItem[];
  density?: 'compact' | 'standard';
  columns?: 2 | 3 | 4;
  ariaLabel?: string;
  className?: string;
}

export function MetricGrid({
  metrics,
  items,
  density = 'standard',
  columns,
  ariaLabel = 'Key metrics',
  className,
}: MetricGridProps) {
  const resolvedMetrics = metrics ?? items ?? [];
  const resolvedColumns = columns ?? Math.min(4, Math.max(2, resolvedMetrics.length)) as 2 | 3 | 4;
  return (
    <div
      className={cx('tt-metric-grid', `tt-metric-grid--${density}`, `tt-metric-grid--cols-${resolvedColumns}`, className)}
      aria-label={ariaLabel}
    >
      {resolvedMetrics.map((metric, index) => (
        <div className="tt-metric" key={index}>
          <strong className="tt-metric__value">{metric.value}</strong>
          <span className="tt-metric__label">{metric.label}</span>
          {metric.hint ? <span className="tt-metric__hint">{metric.hint}</span> : null}
        </div>
      ))}
    </div>
  );
}
