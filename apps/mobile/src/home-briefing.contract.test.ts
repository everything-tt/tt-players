import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./HomeTabContent.tsx', import.meta.url), 'utf8');

describe('Home briefing information architecture', () => {
  it('uses one adaptive personal hero instead of stacked identity and setup sections', () => {
    expect(source).toContain('tt-home-personal-hero');
    expect(source).toContain('Personal dashboard');
    expect(source).toContain('Make TT Players yours');
    expect(source).toContain('Open My TT');
    expect(source).toContain('usePlayerRatingHistoryQuery');
    expect(source).toContain('Latest rating move');
    expect(source).toContain('Global rank');
    expect(source).toContain('Record');
    expect(source).not.toContain('tt-home-your-tt-title');
    expect(source).not.toContain('tt-home-setup-title');
  });

  it('turns returning Home into a change briefing backed by a local visit snapshot', () => {
    expect(source).toContain('Since your last visit');
    expect(source).toContain('HOME_VISIT_SNAPSHOT_STORAGE_KEY');
    expect(source).toContain('buildHomeScopeKey');
    expect(source).toContain('diffHomeVisit');
    expect(source).toContain('previousVisitSnapshot');
    expect(source).toContain('window.localStorage.setItem');
  });

  it('ranks league stories by relevance instead of rendering a fixed activity recipe', () => {
    expect(source).toContain('rankHomeStories');
    expect(source).toContain("kind: isPersonal ? 'personal-result' : 'result'");
    expect(source).toContain('priority: (isPersonal ? 120 : 80) - index');
    expect(source).toContain('Picked for relevance, not just recency');
    expect(source).toContain('set the pace');
    expect(source).not.toContain('Next up');
    expect(source).not.toContain('useTournamentList');

    expect(source).not.toContain('<TopRatingsSection');
    expect(source).not.toContain('title="Latest results"');
    expect(source).not.toContain('Players to watch');
    expect(source).not.toContain('Teams to watch');
  });

  it('keeps first-visit Home useful without population-wide analysis', () => {
    expect(source).toContain('TT Players pulse');
    expect(source).toContain('usePlayerCountQuery');
    expect(source).toContain('<MetricGrid');
    expect(source).toContain('Top players');
    expect(source).not.toContain('useLeadersQuery');
    expect(source).not.toContain("mode: 'improving'");
    expect(source).not.toContain("What&apos;s happening");
    expect(source).not.toContain('finding another gear');
  });

  it('keeps a compact player leaderboard on Home with global and league scopes', () => {
    expect(source).toContain('Top players');
    expect(source).toContain('<SegmentedToggle');
    expect(source).toContain("{ value: 'site', label: 'Global' }");
    expect(source).toContain("{ value: 'selected', label: 'Your leagues' }");
    expect(source).toContain('useTopSiteRatingsQuery');
    expect(source).toContain('useTopRatingsQuery');
    expect(source).toContain('View all rankings');
    expect(source).toContain("navigateInTab('players', `ratings?scope=${isSelectedRatingsScope ? 'selected' : 'site'}`)");
    expect(source).toContain('Math.round(player.win_rate * 100)');
    expect(source).not.toContain('Top rated ·');
  });

  it('lets a new user personalise the hero without leaving Home', () => {
    expect(source).toContain('Claim my player');
    expect(source).toContain('Choose leagues');
    expect(source).toContain('<PlayerSearchSheet');
    expect(source).toContain('setMyPlayer({ id: player.id, name: player.name })');
  });
});
