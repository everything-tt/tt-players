import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./HomeTabContent.tsx', import.meta.url), 'utf8');

describe('Home briefing information architecture', () => {
  it('keeps Home as a concise briefing instead of a second leagues dashboard', () => {
    expect(source).toContain('Your TT');
    expect(source).toContain('Next up');
    expect(source).toContain('Highlights');
    expect(source).toContain('View leagues');

    expect(source).not.toContain('<TopRatingsSection');
    expect(source).not.toContain('<SegmentedToggle');
    expect(source).not.toContain('title="Latest results"');
    expect(source).not.toContain('Players to watch');
    expect(source).not.toContain('Teams to watch');
  });

  it('lets a new user personalise and discover useful content without leaving Home', () => {
    expect(source).toContain('Make Home yours');
    expect(source).toContain('Claim my player');
    expect(source).toContain('Choose leagues to follow');
    expect(source).toContain('Discover');
    expect(source).toContain('useTopSiteRatingsQuery');
    expect(source).toContain('Browse players');
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