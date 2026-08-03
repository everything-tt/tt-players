import type { TournamentListStatus } from './hooks/useTournamentList';

export interface TournamentTimelineDateLike {
  id: string;
  start_date?: string | null;
  event_date?: string | null;
}

export interface TournamentTimelineGroup<T> {
  key: string;
  label: string;
  items: T[];
}

export interface TournamentDateParts {
  day: string;
  month: string;
  fullLabel: string;
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, amount: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeek(value: Date): Date {
  const day = startOfDay(value);
  const daysSinceMonday = (day.getDay() + 6) % 7;
  return addDays(day, -daysSinceMonday);
}

function isSameMonth(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth();
}

function parseTournamentDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00`
    : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
}

export function getTournamentDateValue(item: TournamentTimelineDateLike): string | null {
  return item.start_date ?? item.event_date ?? null;
}

function monthGroup(date: Date): { key: string; label: string } {
  return {
    key: `month:${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
    label: date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
  };
}

function upcomingGroup(date: Date, now: Date): { key: string; label: string } {
  const thisWeekStart = startOfWeek(now);
  const nextWeekStart = addDays(thisWeekStart, 7);
  const afterNextWeek = addDays(nextWeekStart, 7);

  if (date < nextWeekStart) {
    return { key: 'relative:this-week', label: 'This week' };
  }
  if (date < afterNextWeek) {
    return { key: 'relative:next-week', label: 'Next week' };
  }
  if (isSameMonth(date, now)) {
    return { key: 'relative:later-this-month', label: 'Later this month' };
  }
  return monthGroup(date);
}

function completedGroup(date: Date, now: Date): { key: string; label: string } {
  const thisWeekStart = startOfWeek(now);
  const lastWeekStart = addDays(thisWeekStart, -7);

  if (date >= thisWeekStart) {
    return { key: 'relative:this-week', label: 'This week' };
  }
  if (date >= lastWeekStart) {
    return { key: 'relative:last-week', label: 'Last week' };
  }
  if (isSameMonth(date, now)) {
    return { key: 'relative:earlier-this-month', label: 'Earlier this month' };
  }
  return monthGroup(date);
}

export function groupTournamentTimeline<T extends TournamentTimelineDateLike>(
  items: T[],
  status: TournamentListStatus,
  now = new Date(),
): TournamentTimelineGroup<T>[] {
  const groups: TournamentTimelineGroup<T>[] = [];
  const byKey = new Map<string, TournamentTimelineGroup<T>>();
  const today = startOfDay(now);

  items.forEach((item) => {
    const date = parseTournamentDate(getTournamentDateValue(item));
    const descriptor = date
      ? status === 'upcoming'
        ? upcomingGroup(date, today)
        : completedGroup(date, today)
      : { key: 'unknown-date', label: 'Date unavailable' };

    let group = byKey.get(descriptor.key);
    if (!group) {
      group = { ...descriptor, items: [] };
      byKey.set(descriptor.key, group);
      groups.push(group);
    }
    group.items.push(item);
  });

  return groups;
}

export function getTournamentDateParts(
  value: string | null | undefined,
): TournamentDateParts | null {
  const parsed = parseTournamentDate(value);
  if (!parsed) return null;

  return {
    day: parsed.toLocaleDateString('en-GB', { day: '2-digit' }),
    month: parsed.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase(),
    fullLabel: parsed.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  };
}
