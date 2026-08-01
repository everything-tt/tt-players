export type TournamentMatchDecision = 'automatic' | 'review' | 'none';

export interface TournamentMatchInput {
    name: string;
    startDate?: string | Date | null;
    endDate?: string | Date | null;
    venue?: string | null;
    category?: string | null;
}

export interface TournamentMatchScore {
    name: number;
    date: number;
    venue: number;
    category: number;
    total: number;
    decision: TournamentMatchDecision;
}

const GENERIC_NAME_WORDS = new Set([
    'result',
    'results',
    'entry',
    'entries',
    'draw',
    'draws',
    'tournament',
]);

function cleanText(value: string): string[] {
    return value
        .normalize('NFKD')
        .toLowerCase()
        .replace(/\b(19|20)\d{2}\b/g, ' ')
        .replace(/\bunder\s*([0-9]{1,2})\b/g, 'u$1')
        .replace(/\b([1-9])\s*[- ]?stars?\b/g, '$1 star')
        .replace(/\b([1-9])\s*\*/g, '$1 star')
        .replace(/\bchampionships\b/g, 'championship')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
}

export function normalizeTournamentName(value: string): string {
    return cleanText(value)
        .filter((token) => !GENERIC_NAME_WORDS.has(token))
        .join(' ');
}

export function normalizeVenue(value?: string | null): string {
    if (!value) return '';
    return cleanText(value).join(' ');
}

function tokenDice(left: string, right: string): number {
    if (!left || !right) return 0;
    if (left === right) return 1;

    const leftTokens = new Set(left.split(' '));
    const rightTokens = new Set(right.split(' '));
    let intersection = 0;
    for (const token of leftTokens) {
        if (rightTokens.has(token)) intersection += 1;
    }

    return (2 * intersection) / (leftTokens.size + rightTokens.size);
}

function toDay(value?: string | Date | null): number | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return null;
    return Math.floor(date.getTime() / 86_400_000);
}

function scoreDates(left: TournamentMatchInput, right: TournamentMatchInput): number {
    const leftStart = toDay(left.startDate);
    const leftEnd = toDay(left.endDate) ?? leftStart;
    const rightStart = toDay(right.startDate);
    const rightEnd = toDay(right.endDate) ?? rightStart;
    if (leftStart === null || leftEnd === null || rightStart === null || rightEnd === null) return 0;

    const overlaps = leftStart <= rightEnd && rightStart <= leftEnd;
    if (overlaps) return 1;

    const gap = Math.min(
        Math.abs(leftStart - rightEnd),
        Math.abs(rightStart - leftEnd),
    );
    if (gap === 1) return 0.8;
    if (gap <= 3) return 0.5;
    if (gap <= 7) return 0.2;
    return 0;
}

function roundScore(value: number): number {
    return Math.round(value * 10_000) / 10_000;
}

export function scoreTournamentMatch(
    incoming: TournamentMatchInput,
    candidate: TournamentMatchInput,
): TournamentMatchScore {
    const name = tokenDice(
        normalizeTournamentName(incoming.name),
        normalizeTournamentName(candidate.name),
    );
    const date = scoreDates(incoming, candidate);
    const venue = tokenDice(normalizeVenue(incoming.venue), normalizeVenue(candidate.venue));
    const category = tokenDice(
        normalizeTournamentName(incoming.category ?? ''),
        normalizeTournamentName(candidate.category ?? ''),
    );
    const total = roundScore(name * 0.5 + date * 0.3 + venue * 0.1 + category * 0.1);

    return {
        name: roundScore(name),
        date: roundScore(date),
        venue: roundScore(venue),
        category: roundScore(category),
        total,
        decision: total >= 0.92 ? 'automatic' : total >= 0.7 ? 'review' : 'none',
    };
}
