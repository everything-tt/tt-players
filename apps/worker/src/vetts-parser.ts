import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import type { OutcomeType } from '@tt-players/db';
import type { ParsedFixture, ParsedPlayer, ParsedRubber, ParsedTTLeaguesData } from './parser.js';

export interface VettsTournamentLink {
    tournamentId: string;
    url: string;
    name: string | null;
}

export interface VettsTournamentMetadata {
    tournamentId: string;
    sourceUrl: string;
    name: string;
    organisation: string | null;
    location: string | null;
    startDate: string | null;
    endDate: string | null;
    venueName: string | null;
    venueAddress: string | null;
    venueTown: string | null;
    venuePostcode: string | null;
    eventCount: number | null;
    entryCount: number | null;
}

export interface VettsPlayer {
    externalId: string;
    name: string;
}

export interface VettsGameScore {
    home: number;
    away: number;
}

export interface VettsMatchResult {
    externalId: string;
    sourceUrl: string;
    eventExternalId: string;
    eventName: string;
    roundName: string | null;
    roundOrder: number | null;
    playedAt: string | null;
    homePlayers: VettsPlayer[];
    awayPlayers: VettsPlayer[];
    winnerSide: 'home' | 'away';
    homeGamesWon: number;
    awayGamesWon: number;
    gameScores: VettsGameScore[];
    outcomeType: OutcomeType;
    scoreSource: 'games' | 'win_loss_only';
    isDoubles: boolean;
    rawText: string;
}

export interface VettsParseIssue {
    rowIndex: number;
    reason: 'bye' | 'cancelled' | 'missing-player' | 'missing-winner' | 'invalid-score';
    message: string;
    rawText: string;
}

export interface VettsMatchesPage {
    matches: VettsMatchResult[];
    issues: VettsParseIssue[];
}

const MONTHS: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
};

const ROUND_ORDER: Array<[RegExp, number]> = [
    [/group/i, 10],
    [/prelim/i, 20],
    [/last\s*128/i, 30],
    [/last\s*64/i, 40],
    [/last\s*32/i, 50],
    [/last\s*16/i, 60],
    [/quarter/i, 70],
    [/semi/i, 80],
    [/final/i, 90],
];

function cleanText(value: string): string {
    return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function absoluteUrl(href: string, baseUrl: string): string {
    return new URL(href, baseUrl).toString();
}

export function extractVettsTournamentId(value: string): string | null {
    const match = value.match(/(?:\/tournament\/|[?&]id=)([0-9a-f]{8}-[0-9a-f-]{27,})/i);
    return match?.[1]?.toLowerCase() ?? null;
}

export function parseVettsTournamentLinks(
    html: string,
    baseUrl = 'https://vetts.tournamentsoftware.com',
): VettsTournamentLink[] {
    const $ = cheerio.load(html);
    const links = new Map<string, VettsTournamentLink>();

    $('a[href]').each((_index, element) => {
        const href = $(element).attr('href');
        if (!href) return;
        const tournamentId = extractVettsTournamentId(href);
        if (!tournamentId || links.has(tournamentId)) return;

        links.set(tournamentId, {
            tournamentId,
            url: absoluteUrl(href, baseUrl),
            name: cleanText($(element).text()) || null,
        });
    });

    return Array.from(links.values());
}

function isoDate(year: number, month: number, day: number): string {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseHumanDate(value: string, fallbackYear: number | null): string | null {
    const cleaned = cleanText(value).replace(/^(?:mon|tue|wed|thu|fri|sat|sun)(?:day)?\s+/i, '');
    const match = cleaned.match(/(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?/);
    if (!match) return null;
    const day = Number(match[1]);
    const month = MONTHS[match[2]!.toLowerCase()];
    const year = match[3] ? Number(match[3]) : fallbackYear;
    if (!month || !year || day < 1 || day > 31) return null;
    return isoDate(year, month, day);
}

function inferredYear(text: string): number | null {
    const match = text.match(/\b(20\d{2})\b/);
    return match ? Number(match[1]) : null;
}

function labeledValue($: cheerio.CheerioAPI, label: string): string | null {
    const normalizedLabel = label.toLowerCase();
    let result: string | null = null;
    $('dt, th, .label, [class*="label"]').each((_index, element) => {
        if (result) return;
        if (cleanText($(element).text()).toLowerCase() !== normalizedLabel) return;
        const sibling = $(element).next('dd, td, [class*="value"]').first();
        const value = cleanText(sibling.text());
        if (value) result = value;
    });
    return result;
}

function firstNumberAfterLabel(text: string, label: string): number | null {
    const match = text.match(new RegExp(`${label}\\s+(\\d+)`, 'i'));
    return match ? Number(match[1]) : null;
}

export function parseVettsTournamentOverview(
    html: string,
    sourceUrl: string,
): VettsTournamentMetadata {
    const tournamentId = extractVettsTournamentId(sourceUrl);
    if (!tournamentId) throw new Error(`Unable to derive VETTS tournament ID from ${sourceUrl}`);

    const $ = cheerio.load(html);
    const bodyText = cleanText($('body').text());
    const name = cleanText($('main h2, h2').first().text()) ||
        cleanText($('title').text()).replace(/\s*\|.*$/, '') ||
        `VETTS Tournament ${tournamentId}`;
    const year = inferredYear(`${name} ${bodyText}`);

    const summary = cleanText($('main h2, h2').first().parent().text());
    const pipeParts = summary.split('|').map(cleanText).filter(Boolean);
    const organisation = pipeParts.length > 1 ? pipeParts[0] ?? null : null;
    const locationAndDates = pipeParts.length > 1 ? pipeParts.slice(1).join(' | ') : summary;
    const rangeMatch = locationAndDates.match(/(\d{1,2}\s+[A-Za-z]+(?:\s+\d{4})?)\s+to\s+(\d{1,2}\s+[A-Za-z]+(?:\s+\d{4})?)/i);
    const singleDateMatch = locationAndDates.match(/(\d{1,2}\s+[A-Za-z]+(?:\s+\d{4})?)/i);
    const startDate = parseHumanDate(rangeMatch?.[1] ?? singleDateMatch?.[1] ?? '', year);
    const endDate = parseHumanDate(rangeMatch?.[2] ?? rangeMatch?.[1] ?? singleDateMatch?.[1] ?? '', year);
    const location = cleanText(locationAndDates.replace(rangeMatch?.[0] ?? singleDateMatch?.[0] ?? '', '')) || null;

    const venueHeading = $('h3, h4, h5').filter((_index, element) =>
        cleanText($(element).text()).toLowerCase() === 'venue'
    ).first();
    const venueContainer = venueHeading.length ? venueHeading.parent() : cheerio.load('<div></div>')('div');
    const venueLines = venueContainer
        .find('h4, h5, p, address, a')
        .map((_index, element) => cleanText($(element).text()))
        .get()
        .filter((value, index, values) => value && values.indexOf(value) === index)
        .filter((value) => !/^route$/i.test(value) && !/^venue$/i.test(value));
    const postcodeIndex = venueLines.findIndex((value) => /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i.test(value));
    const postcodeLine = postcodeIndex >= 0 ? venueLines[postcodeIndex]! : '';
    const postcodeMatch = postcodeLine.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i);
    const venuePostcode = postcodeMatch?.[1]?.toUpperCase() ?? null;
    const venueTown = postcodeLine.replace(postcodeMatch?.[0] ?? '', '').trim() || location;
    const venueName = venueLines[0] ?? labeledValue($, 'Venue') ?? null;
    const addressLines = venueLines.slice(1, postcodeIndex >= 0 ? postcodeIndex : undefined);

    return {
        tournamentId,
        sourceUrl,
        name,
        organisation,
        location,
        startDate,
        endDate,
        venueName,
        venueAddress: addressLines.join(', ') || null,
        venueTown,
        venuePostcode,
        eventCount: firstNumberAfterLabel(bodyText, 'Events'),
        entryCount: firstNumberAfterLabel(bodyText, 'Entries'),
    };
}

function queryParam(href: string, key: string): string | null {
    try {
        return new URL(href, 'https://vetts.tournamentsoftware.com').searchParams.get(key);
    } catch {
        return null;
    }
}

function playerFromAnchor($: cheerio.CheerioAPI, element: any): VettsPlayer | null {
    const href = $(element).attr('href') ?? '';
    const playerId = queryParam(href, 'player') ?? href.match(/\/player\/([^/?#]+)/i)?.[1] ?? null;
    const name = cleanText($(element).text()).replace(/\s+\[(?:\d+(?:\/\d+)?)\]\s*$/, '');
    if (!playerId || !name) return null;
    return { externalId: `tournamentsoftware:${playerId}`, name };
}

function roundOrder(roundName: string | null): number | null {
    if (!roundName) return null;
    return ROUND_ORDER.find(([pattern]) => pattern.test(roundName))?.[1] ?? null;
}

function validTableTennisGame(home: number, away: number): boolean {
    const winner = Math.max(home, away);
    const loser = Math.min(home, away);
    if (winner < 11) return false;
    if (winner === 11) return loser <= 9;
    return winner - loser === 2;
}

function scoreNumbers(
    $: cheerio.CheerioAPI,
    row: cheerio.Cheerio<any>,
    lastPlayerCellIndex: number,
): number[] {
    const explicit: number[] = [];
    row.find('[data-score], td.score, td[class*="score"], li[class*="score"]').each((_index, element) => {
        const value = $(element).attr('data-score') ?? cleanText($(element).text());
        for (const part of value.match(/\b\d{1,2}\b/g) ?? []) explicit.push(Number(part));
    });
    if (explicit.length >= 2) return explicit;

    const fallback: number[] = [];
    row.find('td').each((index, element) => {
        if (index <= lastPlayerCellIndex) return;
        const text = cleanText($(element).text());
        if (/^\d{1,2}$/.test(text)) fallback.push(Number(text));
        else if (/^(?:\d{1,2}\s+){1,8}\d{1,2}$/.test(text)) {
            fallback.push(...text.split(/\s+/).map(Number));
        }
    });
    return fallback;
}

function gameScores(numbers: number[]): VettsGameScore[] {
    const even = numbers.length % 2 === 0 ? numbers : numbers.slice(1);
    const result: VettsGameScore[] = [];
    for (let index = 0; index + 1 < even.length; index += 2) {
        result.push({ home: even[index]!, away: even[index + 1]! });
    }
    return result;
}

function detectOutcome(text: string): OutcomeType | 'bye' | 'cancelled' {
    if (/\bbye\b/i.test(text)) return 'bye';
    if (/cancel(?:led|ed)/i.test(text)) return 'cancelled';
    if (/walkover|\bw\.o\.?\b/i.test(text)) return 'walkover';
    if (/retir(?:ed|ement)|\brtd\b/i.test(text)) return 'retired';
    if (/void|not played|abandon/i.test(text)) return 'void';
    return 'normal';
}

function winnerFromMarkup(
    $: cheerio.CheerioAPI,
    row: cheerio.Cheerio<any>,
    playerCellIndexes: number[],
): 'home' | 'away' | null {
    const anchors = row.find('a[href*="player.aspx"], a[href*="/player/"]').toArray();
    for (let index = 0; index < anchors.length; index += 1) {
        const anchor = $(anchors[index]!);
        if (anchor.closest('.winner, [class*="winner"], strong, b').length > 0) {
            return index < anchors.length / 2 ? 'home' : 'away';
        }
    }

    let markerIndex: number | null = null;
    row.find('td').each((index, element) => {
        if (/^(?:W|Winner)$/i.test(cleanText($(element).text()))) markerIndex = index;
    });
    if (markerIndex == null) return null;
    const homeLast = playerCellIndexes[Math.max(0, Math.floor(playerCellIndexes.length / 2) - 1)] ?? -1;
    const awayFirst = playerCellIndexes[Math.floor(playerCellIndexes.length / 2)] ?? Number.MAX_SAFE_INTEGER;
    return markerIndex > homeLast && markerIndex <= awayFirst ? 'home' : 'away';
}

function stableMatchId(parts: string[]): string {
    return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24);
}

function roundNameFromRow($: cheerio.CheerioAPI, row: cheerio.Cheerio<any>): string | null {
    const explicit = cleanText(row.find('.round, [class*="round"]').first().text());
    if (explicit) return explicit;
    const text = cleanText(row.text());
    const match = text.match(/\b(Round\s+\d+|Quarter[- ]?final|Semi[- ]?final|Final|Last\s+\d+)\b/i);
    return match?.[1] ?? null;
}

function playedAtFromRow(
    $: cheerio.CheerioAPI,
    row: cheerio.Cheerio<any>,
    date: string | null,
): string | null {
    if (!date) return null;
    const datetime = row.find('time[datetime]').attr('datetime');
    if (datetime) return datetime;
    const match = cleanText(row.text()).match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    return match ? `${date} ${match[1]!.padStart(2, '0')}:${match[2]}:00` : `${date} 00:00:00`;
}

export function parseVettsMatchesPage(
    html: string,
    options: { tournamentId: string; sourceUrl: string; date: string | null },
): VettsMatchesPage {
    const $ = cheerio.load(html);
    const matches: VettsMatchResult[] = [];
    const issues: VettsParseIssue[] = [];

    $('table.matches > tbody > tr, div#table-matches table > tbody > tr').each((rowIndex, element) => {
        const row = $(element);
        const rawText = cleanText(row.text());
        if (!rawText || row.is('.dark, .header, .ruler')) return;

        const drawAnchor = row.find('a[href*="draw.aspx"], a[href*="/draw/"]').first();
        if (!drawAnchor.length) return;
        const drawHref = drawAnchor.attr('href') ?? '';
        const eventExternalId = queryParam(drawHref, 'draw') ?? drawHref.match(/\/draw\/([^/?#]+)/i)?.[1] ?? '';
        const eventName = cleanText(drawAnchor.text());
        if (!eventExternalId || !eventName) return;

        const outcome = detectOutcome(rawText);
        if (outcome === 'bye' || outcome === 'cancelled') {
            issues.push({ rowIndex, reason: outcome, message: `Skipped ${outcome} row`, rawText });
            return;
        }

        const playerAnchors = row.find('a[href*="player.aspx"], a[href*="/player/"]').toArray();
        const players = playerAnchors
            .map((anchor) => playerFromAnchor($, anchor))
            .filter((player): player is VettsPlayer => player !== null)
            .filter((player, index, values) => values.findIndex((item) => item.externalId === player.externalId) === index);
        if (players.length !== 2 && players.length !== 4) {
            issues.push({
                rowIndex,
                reason: 'missing-player',
                message: `Expected 2 or 4 players, found ${players.length}`,
                rawText,
            });
            return;
        }

        const isDoubles = players.length === 4;
        const split = players.length / 2;
        const homePlayers = players.slice(0, split);
        const awayPlayers = players.slice(split);
        const playerCellIndexes = playerAnchors.map((anchor) => row.find('td').index($(anchor).closest('td')));
        const scores = gameScores(scoreNumbers($, row, Math.max(...playerCellIndexes)));
        if (outcome === 'normal' && (scores.length === 0 || scores.some((score) => !validTableTennisGame(score.home, score.away)))) {
            issues.push({
                rowIndex,
                reason: 'invalid-score',
                message: scores.length === 0 ? 'Completed row has no game scores' : 'Invalid table-tennis game score',
                rawText,
            });
            return;
        }

        const homeGamesWon = scores.filter((score) => score.home > score.away).length;
        const awayGamesWon = scores.filter((score) => score.away > score.home).length;
        const scoreWinner = homeGamesWon > awayGamesWon ? 'home' : awayGamesWon > homeGamesWon ? 'away' : null;
        const winnerSide = scoreWinner ?? winnerFromMarkup($, row, playerCellIndexes);
        if (!winnerSide) {
            issues.push({ rowIndex, reason: 'missing-winner', message: 'Unable to identify winner', rawText });
            return;
        }

        const roundName = roundNameFromRow($, row);
        const matchInfoHref = row.find('a[href*="match-info"], a[href*="match.aspx"]').first().attr('href');
        const sourceUrl = matchInfoHref ? absoluteUrl(matchInfoHref, options.sourceUrl) : options.sourceUrl;
        const matchInfoId = matchInfoHref
            ? queryParam(matchInfoHref, 'match') ?? matchInfoHref.match(/\/match-info\/([^/?#]+)/i)?.[1]
            : null;
        const playedAt = playedAtFromRow($, row, options.date);
        const identity = matchInfoId ?? stableMatchId([
            options.tournamentId,
            eventExternalId,
            roundName ?? '',
            playedAt ?? options.date ?? '',
            ...homePlayers.map((player) => player.externalId),
            ...awayPlayers.map((player) => player.externalId),
        ]);

        matches.push({
            externalId: `vetts:match:${identity}`,
            sourceUrl,
            eventExternalId,
            eventName,
            roundName,
            roundOrder: roundOrder(roundName),
            playedAt,
            homePlayers,
            awayPlayers,
            winnerSide,
            homeGamesWon: scores.length > 0 ? homeGamesWon : winnerSide === 'home' ? 1 : 0,
            awayGamesWon: scores.length > 0 ? awayGamesWon : winnerSide === 'away' ? 1 : 0,
            gameScores: scores,
            outcomeType: outcome,
            scoreSource: scores.length > 0 ? 'games' : 'win_loss_only',
            isDoubles,
            rawText,
        });
    });

    return { matches, issues };
}

export function vettsMatchesToParsedData(
    tournament: VettsTournamentMetadata,
    matches: VettsMatchResult[],
): ParsedTTLeaguesData {
    const players = new Map<string, ParsedPlayer>();
    const fixtures = new Map<string, ParsedFixture>();
    const rubbers: ParsedRubber[] = [];

    for (const match of matches) {
        for (const player of [...match.homePlayers, ...match.awayPlayers]) {
            players.set(player.externalId, { externalId: player.externalId, name: player.name });
        }

        const date = match.playedAt?.slice(0, 10) ?? tournament.startDate;
        const fixtureExternalId = `vetts:event:${tournament.tournamentId}:${match.eventExternalId}:${date ?? 'unknown'}`;
        if (!fixtures.has(fixtureExternalId)) {
            fixtures.set(fixtureExternalId, {
                externalId: fixtureExternalId,
                homeTeamExternalId: null,
                awayTeamExternalId: null,
                datePlayed: date,
                status: 'completed',
                roundName: match.eventName,
                roundOrder: null,
            });
        }

        rubbers.push({
            externalId: match.externalId,
            matchExternalId: fixtureExternalId,
            isDoubles: match.isDoubles,
            homePlayers: match.homePlayers.map((player) => player.externalId),
            awayPlayers: match.awayPlayers.map((player) => player.externalId),
            homeGamesWon: match.homeGamesWon,
            awayGamesWon: match.awayGamesWon,
            outcomeType: match.outcomeType,
            scoreSource: match.scoreSource,
            playedAt: match.playedAt,
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

export function enumerateTournamentDates(
    startDate: string | null,
    endDate: string | null,
    maximumDays = 7,
): string[] {
    if (!startDate) return [];
    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate ?? startDate}T00:00:00Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [startDate];

    const dates: string[] = [];
    for (let date = start; date <= end && dates.length < maximumDays; date = new Date(date.getTime() + 86_400_000)) {
        dates.push(date.toISOString().slice(0, 10));
    }
    return dates;
}
