import { describe, expect, it } from 'vitest';
import {
  getTournamentDateParts,
  groupTournamentTimeline,
  type TournamentTimelineDateLike,
} from './tournament-timeline';

function event(id: string, date: string | null): TournamentTimelineDateLike {
  return { id, start_date: date, event_date: null };
}

describe('groupTournamentTimeline', () => {
  it('groups upcoming tournaments from nearest relative windows into future months', () => {
    const groups = groupTournamentTimeline([
      event('today', '2026-08-03'),
      event('sunday', '2026-08-09'),
      event('next-monday', '2026-08-10'),
      event('next-sunday', '2026-08-16'),
      event('later', '2026-08-20'),
      event('future-month', '2026-09-02'),
      event('unknown', null),
    ], 'upcoming', new Date(2026, 7, 3, 12));

    expect(groups.map((group) => group.label)).toEqual([
      'This week',
      'Next week',
      'Later this month',
      'September 2026',
      'Date unavailable',
    ]);
    expect(groups[0].items.map((item) => item.id)).toEqual(['today', 'sunday']);
    expect(groups[1].items.map((item) => item.id)).toEqual(['next-monday', 'next-sunday']);
  });

  it('groups completed tournaments in reverse chronological windows', () => {
    const groups = groupTournamentTimeline([
      event('this-week', '2026-08-17'),
      event('last-week', '2026-08-16'),
      event('earlier-month', '2026-08-05'),
      event('previous-month', '2026-07-31'),
    ], 'completed', new Date(2026, 7, 20, 12));

    expect(groups.map((group) => group.label)).toEqual([
      'This week',
      'Last week',
      'Earlier this month',
      'July 2026',
    ]);
  });
});

describe('getTournamentDateParts', () => {
  it('formats a compact date tile without shifting date-only values', () => {
    expect(getTournamentDateParts('2026-08-09')).toEqual({
      day: '09',
      month: 'AUG',
      fullLabel: '9 August 2026',
    });
  });

  it('returns null for missing or invalid dates', () => {
    expect(getTournamentDateParts(null)).toBeNull();
    expect(getTournamentDateParts('not-a-date')).toBeNull();
  });
});
