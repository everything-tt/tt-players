import { useMemo, useState, type KeyboardEvent } from 'react';
import {
  ratingConfidenceLabel,
  type PlayerRatingHistoryPoint,
  type RatingHistoryRange,
  usePlayerRatingHistoryQuery,
} from '../rating-queries';
import { buildRatingHistorySummary } from '../rating-history-summary';
import { FilterBar, PageSection } from '../ui/appkit';
import { FormResultPills } from './FormResultPills';
import { SkeletonBlock } from './Skeleton';

interface PlayerRatingHistoryChartProps {
  playerId: string;
  recentResults?: Array<'W' | 'L'>;
}

interface ChartPoint extends PlayerRatingHistoryPoint {
  x: number;
  y: number;
  lowY: number;
  highY: number;
}

const RANGE_OPTIONS: Array<{ value: RatingHistoryRange; label: string }> = [
  { value: '3m', label: '3M' },
  { value: '1y', label: '1Y' },
  { value: '3y', label: '3Y' },
  { value: '10y', label: '10Y' },
  { value: 'all', label: 'All' },
];

const CHART_WIDTH = 320;
const CHART_HEIGHT = 156;
const CHART_LEFT = 14;
const CHART_RIGHT = 8;
const CHART_TOP = 12;
const CHART_BOTTOM = 24;

export function PlayerRatingHistoryChart({
  playerId,
  recentResults = [],
}: PlayerRatingHistoryChartProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [range, setRange] = useState<RatingHistoryRange>('1y');
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const historyQuery = usePlayerRatingHistoryQuery(playerId, range, Boolean(playerId));
  const history = historyQuery.data?.data ?? [];
  const geometry = useMemo(() => buildChartGeometry(history), [history]);
  const summary = useMemo(() => buildRatingHistorySummary(history), [history]);
  const selected = history.find((point) => point.week_start === selectedWeek)
    ?? history[history.length - 1]
    ?? null;
  const contentId = `tt-rating-history-content-${playerId}`;

  const selectPoint = (point: PlayerRatingHistoryPoint) => setSelectedWeek(point.week_start);
  const selectPointFromKeyboard = (event: KeyboardEvent<SVGCircleElement>, point: PlayerRatingHistoryPoint) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    selectPoint(point);
  };

  return (
    <PageSection
      surface="flat"
      density="compact"
      className="tt-rating-history tt-insights-section"
      title="Rating & Form"
      note="Weekly calculated rating and the latest singles results"
      action={(
        <button
          type="button"
          className="tt-rating-history-toggle"
          aria-expanded={isOpen}
          aria-controls={contentId}
          onClick={() => setIsOpen((open) => !open)}
        >
          <span>{isOpen ? 'Hide' : 'Show'}</span>
          <i className={`fa fa-chevron-${isOpen ? 'up' : 'down'}`} aria-hidden="true" />
        </button>
      )}
    >
      {isOpen ? (
        <div id={contentId} className="tt-rating-history-content">
          <div className="tt-rating-history-toolbar">
            <FilterBar ariaLabel="Rating history range" className="tt-rating-history-ranges">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={range === option.value ? 'is-active' : undefined}
                  aria-pressed={range === option.value}
                  onClick={() => {
                    setRange(option.value);
                    setSelectedWeek(null);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </FilterBar>

            <FormResultPills
              results={recentResults.slice(0, 8)}
              label="Last 8"
              emptyText="No recent form"
            />
          </div>

          {historyQuery.isLoading ? (
            <div className="tt-rating-history-loading" aria-label="Loading rating history">
              <SkeletonBlock className="tt-skeleton-chart" />
            </div>
          ) : historyQuery.error ? (
            <div className="tt-rating-history-state">
              <span>Unable to load rating history.</span>
              <button type="button" onClick={() => historyQuery.refetch()}>Retry</button>
            </div>
          ) : history.length === 0 || !geometry || !summary ? (
            <p className="tt-rating-history-state">Weekly history will appear after the rating-history rebuild has processed this player.</p>
          ) : (
            <>
              <div className="tt-rating-history-summary" aria-label="Rating summary for selected range">
                <div>
                  <small>Current</small>
                  <strong>{summary.current.toLocaleString('en-GB')}</strong>
                </div>
                <div>
                  <small>Peak</small>
                  <strong>{summary.peak.toLocaleString('en-GB')}</strong>
                  <span>{formatShortDate(summary.peakDate)}</span>
                </div>
                <div>
                  <small>Range change</small>
                  <strong className={changeClassName(summary.rangeChange)}>{formatChange(summary.rangeChange)}</strong>
                  <span>{rangeLabel(range)}</span>
                </div>
              </div>

              <div className="tt-rating-history-chart-wrap">
                <svg className="tt-rating-history-chart" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label={`Weekly rating history with ${history.length} points`}>
                  <line className="tt-rating-history-gridline" x1={CHART_LEFT} x2={CHART_WIDTH - CHART_RIGHT} y1={CHART_TOP} y2={CHART_TOP} />
                  <line className="tt-rating-history-gridline" x1={CHART_LEFT} x2={CHART_WIDTH - CHART_RIGHT} y1={CHART_HEIGHT - CHART_BOTTOM} y2={CHART_HEIGHT - CHART_BOTTOM} />
                  <polygon className="tt-rating-history-band" points={geometry.bandPoints} />
                  <polyline className="tt-rating-history-line" points={geometry.linePoints} />
                  {geometry.points.map((point) => (
                    <circle
                      key={point.week_start}
                      className={`tt-rating-history-point${selected?.week_start === point.week_start ? ' is-selected' : ''}`}
                      cx={point.x}
                      cy={point.y}
                      r={selected?.week_start === point.week_start ? 4 : 2.5}
                      role="button"
                      tabIndex={0}
                      aria-label={`${formatWeek(point.snapshot_date)}, rating ${Math.round(point.rating)}`}
                      onClick={() => selectPoint(point)}
                      onKeyDown={(event) => selectPointFromKeyboard(event, point)}
                    />
                  ))}
                  <text className="tt-rating-history-axis-label" x={CHART_LEFT} y={CHART_HEIGHT - 7}>{formatShortDate(history[0]?.snapshot_date ?? '')}</text>
                  <text className="tt-rating-history-axis-label" x={CHART_WIDTH - CHART_RIGHT} y={CHART_HEIGHT - 7} textAnchor="end">{formatShortDate(history[history.length - 1]?.snapshot_date ?? '')}</text>
                </svg>
              </div>

              {selected ? (
                <div className="tt-rating-history-detail" aria-live="polite">
                  <div><small>Week</small><strong>{formatWeek(selected.snapshot_date)}</strong></div>
                  <div><small>Rating</small><strong>{Math.round(selected.rating)}</strong></div>
                  <div><small>Change</small><strong className={changeClassName(selected.rating_change)}>{formatChange(selected.rating_change)}</strong></div>
                  <div><small>Results</small><strong>{selected.week_wins}W · {selected.week_losses}L</strong></div>
                  <div><small>Confidence</small><strong>{ratingConfidenceLabel(selected.confidence)}</strong></div>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </PageSection>
  );
}

function buildChartGeometry(history: PlayerRatingHistoryPoint[]) {
  if (history.length === 0) return null;
  const dates = history.map((point) => new Date(`${point.snapshot_date}T12:00:00Z`).getTime());
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const ratings = history.flatMap((point) => [point.rating_low, point.rating_high]);
  let minRating = Math.min(...ratings);
  let maxRating = Math.max(...ratings);
  if (minRating === maxRating) { minRating -= 25; maxRating += 25; }
  const verticalPadding = Math.max(10, (maxRating - minRating) * 0.08);
  minRating -= verticalPadding;
  maxRating += verticalPadding;
  const plotWidth = CHART_WIDTH - CHART_LEFT - CHART_RIGHT;
  const plotHeight = CHART_HEIGHT - CHART_TOP - CHART_BOTTOM;
  const xFor = (date: number) => maxDate === minDate ? CHART_LEFT + plotWidth / 2 : CHART_LEFT + ((date - minDate) / (maxDate - minDate)) * plotWidth;
  const yFor = (rating: number) => CHART_TOP + ((maxRating - rating) / (maxRating - minRating)) * plotHeight;
  const points: ChartPoint[] = history.map((point, index) => ({ ...point, x: xFor(dates[index] ?? minDate), y: yFor(point.rating), lowY: yFor(point.rating_low), highY: yFor(point.rating_high) }));
  const highPoints = points.map((point) => `${point.x.toFixed(2)},${point.highY.toFixed(2)}`);
  const lowPoints = [...points].reverse().map((point) => `${point.x.toFixed(2)},${point.lowY.toFixed(2)}`);
  return { points, linePoints: points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' '), bandPoints: [...highPoints, ...lowPoints].join(' ') };
}

function formatWeek(value: string): string {
  if (!value) return 'Unknown week';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`));
}
function formatShortDate(value: string): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit' }).format(new Date(`${value}T12:00:00Z`));
}
function formatChange(value: number | null): string {
  if (value === null) return '—';
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}
function changeClassName(value: number | null): string | undefined {
  if (value === null || Math.round(value) === 0) return undefined;
  return value > 0 ? 'is-positive' : 'is-negative';
}
function rangeLabel(range: RatingHistoryRange): string {
  switch (range) {
    case '3m': return 'last 3 months';
    case '1y': return 'last year';
    case '3y': return 'last 3 years';
    case '10y': return 'last 10 years';
    default: return 'all recorded history';
  }
}
