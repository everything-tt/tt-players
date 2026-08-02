import {
  formatInsightMonth,
  formatMilestoneHits,
} from '../player-insights-model';
import type { PlayerInsightsReport } from '../player-insights-types';

interface PlayerCareerStoryProps {
  insights: PlayerInsightsReport;
}

export function PlayerCareerStory({ insights }: PlayerCareerStoryProps) {
  const mostActive = insights.peaks.most_active_season;
  const bestMonth = insights.peaks.best_month;
  const maxPlayed = Math.max(1, ...insights.career_by_year.map((year) => year.played));

  return (
    <section className="tt-insights-card tt-career-story" aria-labelledby="tt-career-story-title">
      <div className="tt-insights-section-heading">
        <div>
          <h2 id="tt-career-story-title">Career Story</h2>
          <p>Peak periods, milestones and season-by-season progress.</p>
        </div>
      </div>

      <div className="tt-career-highlights">
        <CareerHighlight
          icon="fa fa-star"
          tone="blue"
          label="Most active year"
          value={mostActive?.year ?? '—'}
          detail={mostActive ? `${mostActive.played} played` : 'No season history'}
        />
        <CareerHighlight
          icon="fa fa-calendar-alt"
          tone="green"
          label="Best month"
          value={formatInsightMonth(bestMonth?.month)}
          detail={bestMonth ? `${bestMonth.win_rate}% WR · ${bestMonth.played} played` : 'Not enough monthly data'}
        />
        <CareerHighlight
          icon="fa fa-fire"
          tone="purple"
          label="Longest win streak"
          value={insights.milestones.longest_win_streak || '—'}
          detail={insights.milestones.longest_win_streak ? 'consecutive matches' : 'No recorded streak'}
        />
        <CareerHighlight
          icon="fa fa-trophy"
          tone="gold"
          label="Milestones"
          value={formatMilestoneHits(insights.milestones.milestone_hits)}
          detail="matches completed"
        />
      </div>

      {insights.career_by_year.length === 0 ? (
        <p className="tt-career-empty">Play more matches to build a season-by-season story.</p>
      ) : (
        <div className="tt-career-table" role="table" aria-label="Career performance by year">
          <div className="tt-career-table-header" role="row">
            <span role="columnheader">Season</span>
            <span role="columnheader">Played</span>
            <span role="columnheader">Win rate</span>
            <span role="columnheader">Record</span>
          </div>
          {insights.career_by_year.map((year) => (
            <div className="tt-career-row" role="row" key={year.year}>
              <strong role="cell">{year.year}</strong>
              <span role="cell">{year.played}</span>
              <span className="tt-career-rate" role="cell">
                <span className="tt-career-rate-track" aria-hidden="true">
                  <span style={{ width: `${Math.max(7, (year.played / maxPlayed) * 100)}%` }} />
                </span>
                <strong>{year.win_rate}%</strong>
              </span>
              <span className="tt-career-record" role="cell">{year.wins}W · {year.losses}L</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CareerHighlight({
  icon,
  tone,
  label,
  value,
  detail,
}: {
  icon: string;
  tone: 'blue' | 'green' | 'purple' | 'gold';
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <article className={`tt-career-highlight tt-career-highlight-${tone}`}>
      <span className="tt-career-highlight-icon"><i className={icon} aria-hidden="true" /></span>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{detail}</em>
      </span>
    </article>
  );
}
