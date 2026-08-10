import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('player affiliation match filtering', () => {
  it('uses team and tournament rows as match filters while keeping detail navigation secondary', () => {
    const page = source('./PlayerPage.tsx');

    expect(page).toContain("kind: 'team'");
    expect(page).toContain("kind: 'tournament'");
    expect(page).toContain('onClick={() => focusMatches({');
    expect(page).toContain("onClick={() => navigateInTab('leagues', `team/${affiliation.team_id}`)}");
    expect(page).toContain("onClick={() => navigateInActiveTab(`event/${event.event_id}`)}");
    expect(page).toContain('aria-label={`Open ${affiliation.team_name} team`}');
    expect(page).toContain('aria-label={`Open ${event.event_name} tournament`}');
  });

  it('shows the active filter and can clear it without changing the player page', () => {
    const page = source('./PlayerPage.tsx');

    expect(page).toContain('ariaLabel="Active match filter"');
    expect(page).toContain("{matchFilter.kind === 'team' ? 'Team' : 'Tournament'} · {matchFilter.label}");
    expect(page).toContain('onClick={() => setMatchFilter(null)}');
    expect(page).toContain('showCount={!matchFilter}');
  });
});
