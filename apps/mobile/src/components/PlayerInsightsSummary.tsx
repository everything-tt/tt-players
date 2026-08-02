import { calcWinRate, type ExtendedPlayerStats } from '../player-shared';
import {
  buildInsightTakeaway,
  momentumIcon,
  momentumLabel,
} from '../player-insights-model';
import type { PlayerInsightsReport } from '../player-insights-types';

interface PlayerInsightsSummaryProps {
  stats: ExtendedPlayerStats;
  insights: PlayerInsightsReport;
}

export function PlayerInsightsSummary({ stats, insights }: PlayerInsightsSummaryProps) {
  const winRate = calcWinRate(stats.wins, stats.total);
  const bestSeason = insights.peaks.best_season;
  const momentum = insights.form.momentum;
  const takeaway = buildInsightTakeaway(momentum, bestSeason?.win_rate ?? null);

  return (
    <section className="tt-insights-card tt-insights-summary" aria-labelledby="tt-insights-summary-title">
      <div className="tt-insights-section-heading">
        <div>
          <h2 id="tt-insights-summary-title">Insights Summary</h2>
          <p>The headline view of form and career performance.</p>
        </div>
      </div>

      <div className="tt-insights-summary-grid">
        <article className="tt-insights-metric tt-insights-metric-success">
          <span>Overall WR</span>
          <strong>{winRate}%</strong>
          <small>{stats.wins} wins from {stats.total}</small>
        </article>
        <article className={`tt-insights-metric tt-insights-momentum tt-insights-momentum-${momentum}`}>
          <span>Current form</span>
          <strong><i className={momentumIcon(momentum)} aria-hidden="true" /> {momentumLabel(momentum)}</strong>
          <small>Last {Math.min(10, insights.form.recent_results.length)} matches</small>
        </article>
        <article className="tt-insights-metric">
          <span>Matches</span>
          <strong>{stats.total.toLocaleString('en-GB')}</strong>
          <small>{insights.years_played} active {insights.years_played === 1 ? 'year' : 'years'}</small>
        </article>
        <article className="tt-insights-metric tt-insights-metric-success">
          <span>Best season</span>
          <strong>{bestSeason?.year ?? '—'}</strong>
          <small>{bestSeason ? `${bestSeason.win_rate}% WR · ${bestSeason.played} played` : 'Not enough history'}</small>
        </article>
      </div>

      <p className="tt-insights-takeaway">
        <i className="fa fa-check-circle" aria-hidden="true" />
        <span>{takeaway}</span>
      </p>
    </section>
  );
}
