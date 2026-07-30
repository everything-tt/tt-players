import { useState } from 'react';
import { getQueryError } from '../player-shared';
import {
  type OfficialRankingPoint,
  usePlayerOfficialRankingHistoryQuery,
} from '../rating-queries';
import { SkeletonList } from './Skeleton';
import {
  AppButton,
  ErrorState,
  List,
  ListItem,
  Pill,
  SectionHeader,
} from '../ui/appkit';

interface OfficialRankingHistoryPanelProps {
  playerId: string;
}

function listKindLabel(point: OfficialRankingPoint): string {
  return point.list_kind === 'ranking' ? 'Official ranking' : 'Official rating';
}

function valueLabel(point: OfficialRankingPoint): string {
  if (point.list_kind === 'ranking' && point.rank !== null) return `#${point.rank}`;
  if (point.points !== null) return String(point.points);
  return '—';
}

function subtitle(point: OfficialRankingPoint): string {
  const details = [point.period_label, point.county_country].filter(Boolean);
  if (point.is_initial_rating) details.push('Initial rating');
  return details.join(' · ');
}

function rowKey(point: OfficialRankingPoint, index: number): string {
  return [
    point.source_name,
    point.category_name,
    point.list_kind,
    point.period_label,
    index,
  ].join(':');
}

export function OfficialRankingHistoryPanel({ playerId }: OfficialRankingHistoryPanelProps) {
  const [showHistory, setShowHistory] = useState(false);
  const query = usePlayerOfficialRankingHistoryQuery(playerId);
  const error = getQueryError(query.error);
  const latest = query.data?.latest ?? [];
  const history = query.data?.history ?? [];

  if (!query.isLoading && !error && latest.length === 0) return null;

  const visibleRows = showHistory ? history : latest;
  const sourceUrl = latest[0]?.source_url;

  return (
    <section className="tt-player-section" aria-labelledby="official-ranking-history-title">
      <SectionHeader title="Official TTE Lists" note="Sport:80 snapshots" />
      <p className="tt-section-meta">
        Published ranking and rating lists imported from Table Tennis England. These are separate from the calculated ability rating above.
      </p>

      {query.isLoading ? (
        <SkeletonList rows={2} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => { void query.refetch(); }} />
      ) : (
        <>
          <List divider="hairline">
            {visibleRows.map((point, index) => (
              <ListItem
                key={rowKey(point, index)}
                title={`${point.category_name} · ${listKindLabel(point)}`}
                subtitle={subtitle(point)}
                trailing={<Pill tone={point.list_kind === 'ranking' ? 'accent' : 'success'}>{valueLabel(point)}</Pill>}
                hideChevron
              />
            ))}
          </List>

          <div className="tt-confirm-actions mt-3">
            {history.length > latest.length ? (
              <AppButton tone="outline" full onClick={() => setShowHistory((value) => !value)}>
                {showHistory ? 'Show Latest' : `Show History (${history.length})`}
              </AppButton>
            ) : null}
            {sourceUrl ? (
              <AppButton
                tone="ghost"
                full
                onClick={() => window.open(sourceUrl, '_blank', 'noopener,noreferrer')}
              >
                Open Official Source
              </AppButton>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
