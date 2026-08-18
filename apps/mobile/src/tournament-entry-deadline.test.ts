import { describe, expect, it } from 'vitest';
import { getTournamentEntryDeadlineStatus } from './tournament-entry-deadline';

const NOW = new Date(2026, 7, 18, 22, 0, 0);

describe('tournament entry deadline status', () => {
  it('marks deadlines seven days away as closing soon', () => {
    const status = getTournamentEntryDeadlineStatus('2026-08-25', 'entries_open', NOW);

    expect(status.state).toBe('closing_soon');
    expect(status.daysRemaining).toBe(7);
    expect(status.label).toBe('Closes in 7 days');
    expect(status.tone).toBe('warning');
  });

  it('uses the singular label for a deadline tomorrow', () => {
    expect(getTournamentEntryDeadlineStatus('2026-08-19', 'entries_open', NOW).label)
      .toBe('Closes in 1 day');
  });

  it('keeps a date-only deadline open for the whole closing day', () => {
    const status = getTournamentEntryDeadlineStatus('2026-08-18T00:00:00.000Z', 'entries_open', NOW);

    expect(status.state).toBe('closes_today');
    expect(status.label).toBe('Closes today');
  });

  it('marks a past advertised deadline as closed even if the feed status is stale', () => {
    const status = getTournamentEntryDeadlineStatus('2026-08-17', 'entries_open', NOW);

    expect(status.state).toBe('closed');
    expect(status.label).toBe('Closed 17 Aug');
    expect(status.tone).toBe('danger');
  });

  it('respects an explicit entries-closed status when no deadline is available', () => {
    const status = getTournamentEntryDeadlineStatus(null, 'entries_closed', NOW);

    expect(status.state).toBe('closed');
    expect(status.label).toBe('Entries closed');
  });

  it('does not add urgency more than seven days before the deadline', () => {
    const status = getTournamentEntryDeadlineStatus('2026-08-26', 'entries_open', NOW);

    expect(status.state).toBe('open');
    expect(status.label).toBeNull();
    expect(status.tone).toBeNull();
  });
});
