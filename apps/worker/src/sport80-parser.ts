import type { ParsedFixture, ParsedPlayer, ParsedRubber, ParsedTTLeaguesData } from './parser.js';

export interface Sport80PlayerCell {
    category: string | null;
    name: string;
    membershipNo: string | null;
    isWinner: boolean;
}

export interface Sport80EventResultRow {
    id: number | string;
    date_and_time: string | null;
    round: string | { type?: string } | null;
    home: string;
    away: string;
}

export interface Sport80ParsedEvent {
    eventId: string;
    eventName: string;
    eventDate: string | null;
    rows: Sport80EventResultRow[];
}

export interface Sport80EventNameParts {
    displayName: string;
    dateFromName: string | null;
    category: string | null;
}

export interface Sport80RankingPlayerName {
    name: string;
    membershipNo: string | null;
}

export interface Sport80RankingAction {
    route?: string;
}

export interface Sport80RankingRow {
    id: number | string;
    rank: number | string | null;
    name: unknown;
    county_country?: string | null;
    points?: number | string | null;
    inactive_periods?: number | string | null;
    is_initial_rating?: string | boolean | null;
    action?: unknown;
}

const ROUND_ORDER: Record<string, number> = {
    group: 10,
    preliminary: 20,
    last_128: 30,
    last_64: 40,
    last_32: 50,
    last_16: 60,
    quarter_final: 70,
    semi_final: 80,
    final: 90,
};

export function parseSport80PlayerCell(value: string): Sport80PlayerCell {
    let text = value.replace(/\s+/g, ' ').trim();

    const isWinner = /(?:\s*-\s*)?WINNER\s*$/i.test(text);
    text = text.replace(/(?:\s*-\s*)?WINNER\s*$/i, '').trim();

    const categoryMatch = text.match(/^([^-]+?)\s+-\s+(.+)$/);
    const category = categoryMatch ? categoryMatch[1]!.trim() : null;
    text = categoryMatch ? categoryMatch[2]!.trim() : text;

    const membershipMatch = text.match(/\((\d+)\)\s*$/);
    const membershipNo = membershipMatch?.[1] ?? null;
    const name = text.replace(/\s*\(\d+\)\s*$/, '').trim();

    return { category, name, membershipNo, isWinner };
}

export function sport80PlayerExternalId(player: Sport80PlayerCell): string {
    if (player.membershipNo) return `tte:${player.membershipNo}`;

    const normalizedName = player.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    const category = player.category
        ? player.category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        : 'unknown';

    return `name:${category}:${normalizedName}`;
}

export function sport80CellText(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (value == null) return '';
    if (Array.isArray(value)) return value.map(sport80CellText).filter(Boolean).join(' ');
    if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        for (const key of ['text', 'label', 'name', 'value', 'display', 'html']) {
            const text = sport80CellText(record[key]);
            if (text) return text;
        }
    }
    return String(value);
}

export function parseSport80RankingPlayerName(value: unknown): Sport80RankingPlayerName {
    const text = sport80CellText(value)
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const membershipMatch = text.match(/\((\d+)\)\s*$/);
    const membershipNo = membershipMatch?.[1] ?? null;
    const name = text.replace(/\s*\(\d+\)\s*$/, '').trim();
    return { name, membershipNo };
}

export function sport80RankingPlayerExternalId(player: Sport80RankingPlayerName): string {
    if (player.membershipNo) return `tte:${player.membershipNo}`;

    const normalizedName = player.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return `name:ranking:${normalizedName}`;
}

export function extractSport80AthleteId(action: unknown): string | null {
    const actions = Array.isArray(action) ? action : action == null ? [] : [action];
    const route = actions
        .map((item) => (item as Sport80RankingAction).route)
        .find((value): value is string => typeof value === 'string');
    const match = route?.match(/\/member\/(\d+)\//);
    return match?.[1] ?? null;
}

export function numberOrNull(value: number | string | null | undefined): number | null {
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

export function booleanFromSport80(value: string | boolean | null | undefined): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value !== 'string') return false;
    return value.trim().length > 0;
}

export function parseSport80Round(value: Sport80EventResultRow['round']): {
    roundName: string | null;
    roundOrder: number | null;
} {
    if (typeof value === 'string' && value.trim()) {
        const roundName = value.trim();
        return {
            roundName,
            roundOrder: ROUND_ORDER[roundName] ?? null,
        };
    }

    if (value && typeof value === 'object' && value.type === 'unset') {
        return { roundName: 'group', roundOrder: ROUND_ORDER['group'] ?? null };
    }

    return { roundName: null, roundOrder: null };
}

export function dateOnly(value: string | null): string | null {
    if (!value) return null;
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    return match?.[1] ?? null;
}

export function sport80Timestamp(value: string | null): string | null {
    if (!value) return null;
    const match = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?/);
    if (!match) return null;
    return `${match[1]} ${match[2]}:${match[3] ?? '00'}`;
}

export function parseSport80EventName(value: string): Sport80EventNameParts {
    const trimmed = value.replace(/\s+/g, ' ').trim();
    const match = trimmed.match(/^(.*?)\s+-\s+(\d{4}-\d{2}-\d{2})(?::\s*(.*))?$/);
    if (!match) {
        return {
            displayName: trimmed,
            dateFromName: null,
            category: null,
        };
    }

    const displayName = match[1]?.trim() || trimmed;
    const category = match[3]?.trim() || null;
    return {
        displayName,
        dateFromName: match[2] ?? null,
        category,
    };
}

export function parseSport80EventResults(event: Sport80ParsedEvent): ParsedTTLeaguesData {
    const players = new Map<string, ParsedPlayer>();
    const fixtures = new Map<string, ParsedFixture>();
    const rubbers: ParsedRubber[] = [];

    for (const row of event.rows) {
        const home = parseSport80PlayerCell(row.home);
        const away = parseSport80PlayerCell(row.away);

        if (home.isWinner === away.isWinner) {
            throw new Error(`Sport80 result row ${row.id} does not contain exactly one winner`);
        }

        const homeExternalId = sport80PlayerExternalId(home);
        const awayExternalId = sport80PlayerExternalId(away);
        players.set(homeExternalId, { externalId: homeExternalId, name: home.name });
        players.set(awayExternalId, { externalId: awayExternalId, name: away.name });

        const { roundName, roundOrder } = parseSport80Round(row.round);
        const roundKey = roundName ?? 'unknown';
        const fixtureExternalId = `sport80:event:${event.eventId}:round:${roundKey}`;

        if (!fixtures.has(fixtureExternalId)) {
            fixtures.set(fixtureExternalId, {
                externalId: fixtureExternalId,
                homeTeamExternalId: null,
                awayTeamExternalId: null,
                datePlayed: dateOnly(row.date_and_time) ?? event.eventDate,
                status: 'completed',
                roundName,
                roundOrder,
            });
        }

        rubbers.push({
            externalId: `sport80:result:${row.id}`,
            matchExternalId: fixtureExternalId,
            isDoubles: false,
            homePlayers: [homeExternalId],
            awayPlayers: [awayExternalId],
            homeGamesWon: home.isWinner ? 1 : 0,
            awayGamesWon: away.isWinner ? 1 : 0,
            outcomeType: 'normal',
            scoreSource: 'win_loss_only',
            playedAt: sport80Timestamp(row.date_and_time),
        });
    }

    return {
        teams: [],
        players: Array.from(players.values()),
        fixtures: Array.from(fixtures.values()),
        rubbers,
        standings: [],
    };
}
