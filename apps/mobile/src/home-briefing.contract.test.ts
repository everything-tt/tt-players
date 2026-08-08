import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./HomeTabContent.tsx', import.meta.url), 'utf8');

describe('Home briefing information architecture', () => {
  it('uses one adaptive personal hero instead of stacked identity and setup sections', () => {
    expect(source).toContain('tt-home-personal-hero');
    expect(source).toContain('Personal dashboard');
    expect(source).toContain('Open My TT');
    expect(source).toContain('usePlayerRatingHistoryQuery');
    expect(source).toContain('Latest rating move');
    expect(source).not.toContain('tt-home-your-tt-title');
    expect(source).not.toContain('tt-home-setup-title');
  });

  it('keeps Home as a briefing without restoring the old multi-mode league dashboard', () => {
    expect(source).toContain('Next up');
    expect(source).toContain('Highlights');
    expect(source).toContain('View leagues');

    expect(source).not.toContain('<TopRatingsSection');
    expect(source).not.toContain('title="Latest results"');
    expect(source).not.toContain('Players to watch');
    expect(source).not.toContain('Teams to watch');
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
    expect(source).not.toContain('Top rated ·');
  });

  it('lets a new user personalise the hero without leaving Home', () => {
    expect(source).toContain('Make TT Players yours');
    expect(source).toContain('Claim my player');
    expect(source).toContain('Choose leagues');
    expect(source).toContain('<PlayerSearchSheet');
    expect(source).toContain('setMyPlayer({ id: player.id, name: player.name })');
  });

  it('previews more than league data without embedding the Events browsing UI', () => {
    expect(source).toContain('useTournamentList');
    expect(source).toContain("navigateInTab('events', `event/${nextTournament.id}`)");
    expect(source).not.toContain('<SearchToolbar');
    expect(source).not.toContain('Tournament category filters');
  });
});