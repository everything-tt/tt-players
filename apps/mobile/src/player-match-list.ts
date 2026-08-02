import type { RubberItem } from './player-shared';

export type MatchResultTone = 'success' | 'danger';
export type JournalPrefillOutcome = 'win' | 'loss';

export interface MatchDateParts {
  day: string;
  month: string;
  year: string;
}

export interface JournalPrefill {
  date: string;
  opponent: string;
  outcome: JournalPrefillOutcome;
}

export function mergePlayerMatchPage(
  previous: RubberItem[],
  incoming: RubberItem[],
  replace: boolean,
): RubberItem[] {
  if (replace) return incoming;
  const existing = new Set(previous.map((item) => item.id));
  return [...previous, ...incoming.filter((item) => !existing.has(item.id))];
}

export function formatMatchResult(
  result: string,
  isWin: boolean,
): { label: string; tone: MatchResultTone } {
  return {
    label: result,
    tone: isWin ? 'success' : 'danger',
  };
}

export function formatMatchDateParts(value: string): MatchDateParts {
  const isoDate = value.slice(0, 10);
  const parsed = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return { day: '--', month: '---', year: '----' };
  }

  return {
    day: new Intl.DateTimeFormat('en-GB', { day: '2-digit' }).format(parsed),
    month: new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(parsed),
    year: new Intl.DateTimeFormat('en-GB', { year: 'numeric' }).format(parsed),
  };
}

function isValidIsoDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function buildQuickJournalPath(playerId: string, match: RubberItem): string {
  const params = new URLSearchParams({
    date: match.date.slice(0, 10),
    opponent: match.opponent,
    outcome: match.isWin ? 'win' : 'loss',
  });
  return `player/${playerId}/journal?${params.toString()}`;
}

export function readJournalPrefill(
  searchParams: URLSearchParams,
  fallbackDate: string,
): JournalPrefill {
  const date = searchParams.get('date');
  const opponent = searchParams.get('opponent')?.trim() ?? '';
  const outcome = searchParams.get('outcome');

  return {
    date: isValidIsoDate(date) ? date : fallbackDate,
    opponent,
    outcome: outcome === 'loss' ? 'loss' : 'win',
  };
}
