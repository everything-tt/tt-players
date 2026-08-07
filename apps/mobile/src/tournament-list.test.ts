import { describe, expect, it } from 'vitest';
import { mergeTournamentPage } from './tournament-list';

describe('mergeTournamentPage', () => {
  it('replaces accumulated items when loading the first page', () => {
    expect(mergeTournamentPage(
      [{ id: 'old', name: 'Old event' }],
      [{ id: 'new', name: 'New event' }],
      true,
    )).toEqual([{ id: 'new', name: 'New event' }]);
  });

  it('appends later pages without duplicating existing tournaments', () => {
    expect(mergeTournamentPage(
      [
        { id: 'one', name: 'Event one' },
        { id: 'two', name: 'Event two' },
      ],
      [
        { id: 'two', name: 'Event two duplicate' },
        { id: 'three', name: 'Event three' },
      ],
      false,
    )).toEqual([
      { id: 'one', name: 'Event one' },
      { id: 'two', name: 'Event two' },
      { id: 'three', name: 'Event three' },
    ]);
  });
});

describe('tournament filter persistence', () => {
  it('registers TOURNAMENT_FILTERS_STORAGE_KEY in local-persistence and EventsTabContent', () => {
    const { readFileSync } = require('node:fs');
    const persistence = readFileSync(new URL('./local-persistence.ts', import.meta.url), 'utf8');
    const eventsTab = readFileSync(new URL('./EventsTabContent.tsx', import.meta.url), 'utf8');

    expect(persistence).toContain("TOURNAMENT_FILTERS_STORAGE_KEY = 'tt_players_tournament_filters'");
    expect(eventsTab).toContain('TOURNAMENT_FILTERS_STORAGE_KEY');
    expect(eventsTab).toContain('loadStoredTournamentFilters');
    expect(eventsTab).toContain('localStorage.setItem(TOURNAMENT_FILTERS_STORAGE_KEY');
  });
});
