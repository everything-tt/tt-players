import { calcWinRate, type ExtendedPlayerStats } from '../player-shared';
import {
  buildInsightTakeaway,
  momentumIcon,
  momentumLabel,
} from '../player-insights-model';
import type { PlayerInsightsReport } from '../player-insights-types';
import { MetricGrid, PageSection } from '../ui/appkit';
import { FormResultPills } from './FormResultPills';

interface PlayerInsightsSummaryProps {
  stats: ExtendedPlayerStats;
  insights: PlayerInsightsReport;
}

export function PlayerInsightsSummary({ stats, insights }: PlayerInsightsSummaryProps) {
  const winRate = calcWinRate(stats.wins, stats.total);
  const bestSeason = insights.peaks.best_season;
  const momentum = insights.form.momentum;
  const recentCount = Math.min(10, insights.form.recent_results.length);
  const recentResults = insights.form.recent_results.slice(0, recentCount);
  const recentWins = recentResults.filter((result) => result === 'W').length;
  const recentLosses = recentCount - recentWins;
  const takeaway = buildInsightTakeaway(momentum, bestSeason?.win_rate ?? null);

  return (
    <PageSection
      surface="hero"
      density="compact"
      className="tt-insights-summary"
      ariaLabelledby="tt-insights-summary-title"
    >
      <p className="tt-insights-summary-eyebrow">Performance snapshot</p>

      <div className="tt-insights-summary-lead">
        <div className="tt-insights-summary-copy">
          <span>Current form</span>
          <h1 id="tt-insights-summary-title" className="tt-insights-summary-verdict">
            {momentumLabel(momentum)} form
          </h1>
          <p className="tt-insights-takeaway">{takeaway}</p>
        </div>

        <div className={`tt-insights-momentum tt-insights-momentum--${momentum}`} aria-hidden="true">
          <i className={momentumIcon(momentum)} />
        </div>
      </div>

      <div className="tt-insights-recent">
        <div className="tt-insights-recent-copy">
          <span>Recent record</span>
          <strong>{recentCount > 0 ? `${recentWins}–${recentLosses}` : '—'}</strong>
          <small>{recentCount > 0 ? `Last ${recentCount} matches` : 'No recent matches'}</small>
        </div>
        <FormResultPills results={recentResults} label={null} emptyText="No recent form" />
      </div>

      <MetricGrid
        ariaLabel="Insights summary metrics"
        columns={3}
        density="compact"
        className="tt-insights-summary-metrics"
        metrics={[
          {
            label: 'Overall win rate',
            value: `${winRate}%`,
            hint: `${stats.wins} wins from ${stats.total}`,
          },
          {
            label: 'Matches',
            value: stats.total.toLocaleString('en-GB'),
            hint: `${insights.years_played} active ${insights.years_played === 1 ? 'year' : 'years'}`,
          },
          {
            label: 'Best season',
            value: bestSeason?.year ?? '—',
            hint: bestSeason
              ? `${bestSeason.win_rate}% WR · ${bestSeason.played} played`
              : 'Not enough history',
          },
        ]}
      />
    </PageSection>
  );
}
