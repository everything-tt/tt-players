import { PageSection } from '../ui/appkit';

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <span className={`tt-skeleton-block ${className}`} aria-hidden="true" />;
}

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="tt-skeleton-list" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="tt-skeleton-list-row">
          <SkeletonBlock className="tt-skeleton-list-icon" />
          <div className="tt-skeleton-list-copy">
            <SkeletonBlock />
            <SkeletonBlock />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SectionSkeleton({
  titleWidth = 'tt-skeleton-text',
  noteWidth = 'tt-skeleton-text app-skeleton-short',
  rows = 3,
}: {
  titleWidth?: string;
  noteWidth?: string;
  rows?: number;
}) {
  return (
    <PageSection
      surface="flat"
      density="compact"
      title={<SkeletonBlock className={titleWidth} />}
      meta={<SkeletonBlock className={noteWidth} />}
      className="tt-section-skeleton"
    >
      <SkeletonList rows={rows} />
    </PageSection>
  );
}
