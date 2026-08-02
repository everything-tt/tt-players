import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('app-wide MatchRecordRow consumers', () => {
  it.each([
    './HomeTabContent.tsx',
    './LeaguesTabContent.tsx',
  ])('%s uses the shared component instead of the legacy score badge', (path) => {
    const content = source(path);
    expect(content).toContain('MatchRecordRow');
    expect(content).not.toContain('tt-score-badge');
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
    expect(content).toContain("playerMatchScore(encounter.result, encounter.isWin)");
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
