import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('polished player insights hierarchy', () => {
  it('opens with one dominant performance snapshot instead of a report grid', () => {
    const summary = source('./components/PlayerInsightsSummary.tsx');

    expect(summary).toContain('surface="hero"');
    expect(summary).toContain('Performance snapshot');
    expect(summary).toContain('tt-insights-summary-verdict');
    expect(summary).toContain('momentumIcon(momentum)');
    expect(summary).toContain('Recent record');
    expect(summary).toContain('columns={3}');
    expect(summary).not.toContain('columns={4}');
  });

  it('keeps the rating chart focused on rating movement after form moves into the snapshot', () => {
    const page = source('./PlayerInsightsPage.tsx');
    const rating = source('./components/PlayerRatingHistoryChart.tsx');

    expect(page).toContain('<PlayerRatingHistoryChart playerId={playerId} />');
    expect(rating).toContain('title="Rating trend"');
    expect(rating).not.toContain('recentResults');
    expect(rating).not.toContain('<FormResultPills');
  });

  it('uses calm supporting sections and separates milestones from the metric grid', () => {
    const rivals = source('./components/PlayerRivalIntelligence.tsx');
    const career = source('./components/PlayerCareerStory.tsx');

    expect(rivals).toContain('title="Key matchups"');
    expect(career).toContain('title="Career highlights"');
    expect(career).toContain('columns={3}');
    expect(career).toContain('tt-career-milestone');
    expect(career).toContain('Season record');
  });

  it('applies the same raised-card vocabulary as the polished profile', () => {
    const styles = source('./player-insights.css');

    expect(styles).toContain('.tt-insights-summary.tt-section--hero');
    expect(styles).toContain('border-radius: 22px;');
    expect(styles).toContain('box-shadow: 0 12px 30px');
    expect(styles).toContain('.tt-insights-summary-metrics');
    expect(styles).toContain('.tt-insights-supporting-section');
  });
});
