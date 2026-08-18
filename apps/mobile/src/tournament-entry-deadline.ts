export type TournamentEntryDeadlineState = 'open' | 'closing_soon' | 'closes_today' | 'closed';
export type TournamentEntryDeadlineTone = 'warning' | 'danger';

export interface TournamentEntryDeadlineStatus {
  state: TournamentEntryDeadlineState;
  daysRemaining: number | null;
  label: string | null;
  tone: TournamentEntryDeadlineTone | null;
  message: string | null;
  deadlineLabel: string | null;
}

type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function parseCalendarDate(value: string | null | undefined): CalendarDate | null {
  if (!value) return null;

  const trimmed = value.trim();
  const datePrefix = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (datePrefix) {
    const year = Number(datePrefix[1]);
    const month = Number(datePrefix[2]);
    const day = Number(datePrefix[3]);
    const test = new Date(Date.UTC(year, month - 1, day));
    if (
      test.getUTCFullYear() === year
      && test.getUTCMonth() === month - 1
      && test.getUTCDate() === day
    ) {
      return { year, month, day };
    }
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return {
    year: parsed.getFullYear(),
    month: parsed.getMonth() + 1,
    day: parsed.getDate(),
  };
}

function calendarDayIndex(value: CalendarDate): number {
  return Math.floor(Date.UTC(value.year, value.month - 1, value.day) / DAY_MS);
}

function calendarDateFromDate(value: Date): CalendarDate {
  return {
    year: value.getFullYear(),
    month: value.getMonth() + 1,
    day: value.getDate(),
  };
}

function formatCalendarDate(value: CalendarDate, style: 'short' | 'long'): string {
  const date = new Date(Date.UTC(value.year, value.month - 1, value.day));
  return date.toLocaleDateString('en-GB', style === 'short'
    ? { day: 'numeric', month: 'short', timeZone: 'UTC' }
    : { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function closedWithoutDate(): TournamentEntryDeadlineStatus {
  return {
    state: 'closed',
    daysRemaining: null,
    label: 'Entries closed',
    tone: 'danger',
    message: 'Entries are marked as closed. The organiser may not accept a late entry.',
    deadlineLabel: null,
  };
}

/**
 * Derive the user-facing entry-deadline state from the advertised closing date.
 *
 * Tournament feeds commonly provide a date without a reliable closing time. We
 * therefore compare calendar days rather than timestamps so a deadline such as
 * 18 August remains open for the whole of 18 August in the user's local day.
 */
export function getTournamentEntryDeadlineStatus(
  entryDeadline: string | null | undefined,
  eventStatus?: string | null,
  now: Date = new Date(),
): TournamentEntryDeadlineStatus {
  const normalizedStatus = eventStatus?.trim().toLowerCase() ?? '';
  const deadline = parseCalendarDate(entryDeadline);

  if (!deadline) {
    return normalizedStatus === 'entries_closed'
      ? closedWithoutDate()
      : {
          state: 'open',
          daysRemaining: null,
          label: null,
          tone: null,
          message: null,
          deadlineLabel: null,
        };
  }

  const deadlineLabel = formatCalendarDate(deadline, 'long');
  const shortDeadlineLabel = formatCalendarDate(deadline, 'short');
  const daysRemaining = calendarDayIndex(deadline) - calendarDayIndex(calendarDateFromDate(now));

  if (normalizedStatus === 'entries_closed' || daysRemaining < 0) {
    return {
      state: 'closed',
      daysRemaining,
      label: `Closed ${shortDeadlineLabel}`,
      tone: 'danger',
      message: `Entries closed on ${deadlineLabel}. The organiser may not accept a late entry.`,
      deadlineLabel,
    };
  }

  if (daysRemaining === 0) {
    return {
      state: 'closes_today',
      daysRemaining,
      label: 'Closes today',
      tone: 'warning',
      message: 'Entries close today. Submit the form before the deadline.',
      deadlineLabel,
    };
  }

  if (daysRemaining <= 7) {
    return {
      state: 'closing_soon',
      daysRemaining,
      label: `Closes in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}`,
      tone: 'warning',
      message: `Entries close on ${deadlineLabel}.`,
      deadlineLabel,
    };
  }

  return {
    state: 'open',
    daysRemaining,
    label: null,
    tone: null,
    message: null,
    deadlineLabel,
  };
}
