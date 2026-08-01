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
