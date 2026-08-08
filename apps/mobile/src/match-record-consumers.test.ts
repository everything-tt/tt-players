import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('app-wide MatchRecordRow consumers', () => {
  it('keeps the full league results feed on the shared MatchRecordRow component', () => {
    const content = source('./LeaguesTabContent.tsx');
    expect(content).toContain('MatchRecordRow');
    expect(content).not.toContain('tt-score-badge');
  });

  it('keeps Home result information compact instead of recreating the league results feed', () => {
    const content = source('./HomeTabContent.tsx');
    expect(content).not.toContain('MatchRecordRow');
    expect(content).not.toContain('tt-score-badge');
    expect(content).toContain('Latest result');
    expect(content).toContain('View leagues');
  });

  it('uses MatchRecordRow for completed team fixtures while retaining schedule rows', () => {
    const content = source('./TeamPage.tsx');
    expect(content).toContain('MatchRecordRow');
    expect(content).toContain("fixture.status === 'completed'");
    expect(content).toContain('IconCircle iconClassName="fa fa-calendar"');
  });

  it('uses MatchRecordRow for H2H meeting history without a separate outcome badge', () => {
    const content = source('./H2HTabContent.tsx');
    expect(content).toContain('MatchRecordRow');
    expect(content).not.toContain('<OutcomeBadge result={encounter.isWin');
    expect(content).toContain('playerMatchScore(encounter.result, encounter.isWin)');
    expect(content).toContain('defeated');
    expect(content).toContain('lost to');
  });

  it('uses MatchRecordRow for tournament result rows with score fallback', () => {
    const content = source('./EventDetailPage.tsx');
    expect(content).toContain('MatchRecordRow');
    expect(content).toContain('tournamentScore');
    expect(content).toContain('home_games_won');
    expect(content).not.toContain('leading={<OutcomeBadge result={primaryWon');
  });

  it('keeps the detailed fixture rubber scorecard specialised', () => {
    const content = source('./FixturePage.tsx');
    expect(content).toContain('tt-rubber-scorecard');
    expect(content).not.toContain('MatchRecordRow');
  });
});

describe('H2H common opponent exploration', () => {
  it('requests only five opponents for the H2H preview', () => {
    const content = source('./h2h-analysis-query.ts');
    expect(content).toContain('common_limit=5');
  });

  it('renders a fixed five-row preview without the in-memory list footer', () => {
    const content = source('./components/RatingPredictionPanel.tsx');
    expect(content).toContain('analysis.common_opponents.data.slice(0, 5)');
    expect(content).toContain('divider="hairline" paginate={false}');
    expect(content).toContain('View all');
    expect(content).not.toContain('initialVisibleCount={5}');
    expect(content).not.toContain('pageSize={5}');
  });

  it('registers the full common-opponents page and all approved sort options', () => {
    const page = source('./CommonOpponentsPage.tsx');
    const router = source('./AppRouter.tsx');
    expect(router).toContain('h2h/:playerAId/:playerBId/common-opponents');
    expect(page).toContain("value: 'evidence', label: 'Most evidence'");
    expect(page).toContain("value: 'recent', label: 'Most recent'");
    expect(page).toContain("value: 'edge', label: 'Largest edge'");
    expect(page).toContain("value: 'closest', label: 'Closest record'");
    expect(page).not.toContain('All ${');
  });
});
