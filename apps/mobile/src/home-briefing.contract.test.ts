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

  it('claims a player in-place from Home instead of sending onboarding into Players', () => {
    expect(source).toContain('<PlayerSearchSheet');
    expect(source).toContain("action={{ label: 'Claim my player', onClick: () => setClaimSheetOpen(true) }}");
    expect(source).toContain('title="Claim your player"');
    expect(source).toContain('resultHint="Tap to claim as you"');
    expect(source).toContain('setMyPlayer({ id: player.id, name: player.name });');
    expect(source).not.toContain("action={{ label: 'Find my player', onClick: () => onOpenTab('players') }}");
  });

  it('previews more than league data without embedding the Events browsing UI', () => {
    expect(source).toContain('useTournamentList');
    expect(source).toContain("navigateInTab('events', `event/${nextTournament.id}`)");
    expect(source).not.toContain('<SearchToolbar');
    expect(source).not.toContain('Tournament category filters');
  });
});
