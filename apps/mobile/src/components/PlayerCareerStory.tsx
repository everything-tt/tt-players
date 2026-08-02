import { formatInsightMonth } from '../player-insights-model';
import type { PlayerInsightsReport } from '../player-insights-types';
import {
  DesignList,
  ListItem,
  MetricGrid,
  PageSection,
  Pill,
} from '../ui/appkit';

interface PlayerCareerStoryProps {
  insights: PlayerInsightsReport;
}

export function PlayerCareerStory({ insights }: PlayerCareerStoryProps) {
  const mostActive = insights.peaks.most_active_season;
  const bestMonth = insights.peaks.best_month;
  const bestSeasonYear = insights.peaks.best_season?.year ?? null;
  const latestMilestone = insights.milestones.milestone_hits.at(-1) ?? null;

  return (
    <PageSection
      surface="flat"
      density="compact"
      className="tt-career-story"
      title="Career Story"
      description="Peak periods, milestones and season-by-season progress."
    >
      <MetricGrid
        ariaLabel="Career highlights"
        columns={4}
        density="compact"
        metrics={[
          {
            label: 'Most active year',
            value: mostActive?.year ?? '—',
            hint: mostActive ? `${mostActive.played} played` : 'No season history',
          },
          {
            label: 'Best month',
            value: formatInsightMonth(bestMonth?.month),
            hint: bestMonth
              ? `${bestMonth.win_rate}% WR · ${bestMonth.played} played`
              : 'Not enough monthly data',
          },
          {
            label: 'Longest streak',
            value: insights.milestones.longest_win_streak || '—',
            hint: insights.milestones.longest_win_streak
              ? 'consecutive wins'
              : 'No recorded streak',
          },
          {
            label: 'Latest milestone',
            value: latestMilestone ?? '—',
            hint: latestMilestone ? 'matches completed' : 'No milestone yet',
          },
        ]}
      />

      {insights.career_by_year.length === 0 ? (
        <p className="tt-insights-empty">Play more matches to build a season-by-season story.</p>
      ) : (
        <DesignList density="compact" divider="hairline" className="tt-career-season-list">
          {insights.career_by_year.map((year) => (
            <ListItem
              key={year.year}
              className="tt-career-season-row"
              title={year.year}
              subtitle={`${year.played} played · ${year.win_rate}% win rate · ${year.wins}W–${year.losses}L`}
              trailing={year.year === bestSeasonYear ? (
                <Pill tone="accent" size="xs">Best season</Pill>
              ) : undefined}
              hideChevron
            />
          ))}
        </DesignList>
      )}
    </PageSection>
  );
}
