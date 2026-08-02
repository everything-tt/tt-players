import { calcWinRate, type ExtendedPlayerStats } from '../player-shared';
import {
  buildInsightTakeaway,
  momentumLabel,
} from '../player-insights-model';
import type { PlayerInsightsReport } from '../player-insights-types';
import { MetricGrid, PageSection } from '../ui/appkit';

interface PlayerInsightsSummaryProps {
  stats: ExtendedPlayerStats;
  insights: PlayerInsightsReport;
}

export function PlayerInsightsSummary({ stats, insights }: PlayerInsightsSummaryProps) {
  const winRate = calcWinRate(stats.wins, stats.total);
  const bestSeason = insights.peaks.best_season;
  const momentum = insights.form.momentum;
  const recentCount = Math.min(10, insights.form.recent_results.length);
  const takeaway = buildInsightTakeaway(momentum, bestSeason?.win_rate ?? null);

  return (
    <PageSection
      surface="flat"
      density="compact"
      className="tt-insights-summary"
      title="Insights Summary"
      description="The headline view of form and career performance."
    >
      <MetricGrid
        ariaLabel="Insights summary metrics"
        columns={4}
        density="compact"
        metrics={[
          {
            label: 'Overall WR',
            value: `${winRate}%`,
            hint: `${stats.wins} wins from ${stats.total}`,
          },
          {
            label: 'Current form',
            value: momentumLabel(momentum),
            hint: `Last ${recentCount} ${recentCount === 1 ? 'match' : 'matches'}`,
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

      <p className="tt-insights-takeaway">{takeaway}</p>
    </PageSection>
  );
}
