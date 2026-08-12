import * as cheerio from 'cheerio';
import type { FixtureStatus, OutcomeType } from '@tt-players/db';
import {
    normalizePlayerName,
    type ParsedTeam,
    type ParsedPlayer,
    type ParsedFixture,
    type ParsedRubber,
    type ParsedStanding,
} from './parser.js';

/**
 * Collapse internal whitespace (newlines, tabs, multiple spaces) into a single space.
 */
function normalizeText(raw: string): string {
    return raw.replace(/\s+/g, ' ').trim();
}

function isForfeitCellText(text: string): boolean {
    return normalizeText(text).toLowerCase().includes('forfeit');
}

function hasExplicitTT365FinalEvidence($: cheerio.CheerioAPI): boolean {
    const text = normalizeText($.root().text());
    return /adjudicated match card/i.test(text) && /\bscore\s*:/i.test(text);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the last two segments of a TT365 player URL as the external ID.
 * URL pattern: /Brentwood/Results/Player/Statistics/Winter_2025/Arron_Chandler/401745
 * Returns the numeric ID (last segment), e.g. '401745'.
 */
function extractPlayerIdFromHref(href: string): string {
    const segments = href.replace(/\/$/, '').split('/');
    // Last segment is the numeric ID
    return segments[segments.length - 1];
}

/**
 * Extract team slug from a TT365 team URL.
 * URL pattern: /Brentwood/Results/Team/Statistics/Winter_2025/Premier_Division/Billericay_B
 * Returns the last segment, e.g. 'Billericay_B'.
 */
function extractTeamSlugFromHref(href: string): string {
    const segments = href.replace(/\/$/, '').split('/');
    return segments[segments.length - 1];
}

/**
 * Extract TT365 numeric match ID from a MatchCard URL path.
 * URL pattern: /Brentwood/Results/Winter_2025/Premier_Division/MatchCard/458829
 */
function extractMatchIdFromHref(href: string): string | null {
    const match = href.match(/\/matchcard\/(\d+)(?:[/?#]|$)/i);
    return match?.[1] ?? null;
}

/**
 * Parse TT365 game-by-game scores and return won game counts.
 * Input examples:
 * - "11-9 9-11 11-7 11-8"
 * - "<div>11-9</div><div>9-11</div>..."
 */
function parseGameCountsFromCellText(cellText: string): { homeGamesWon: number; awayGamesWon: number } | null {
    const gamePattern = /(\d+)\s*-\s*(\d+)/g;
    let homeGamesWon = 0;
    let awayGamesWon = 0;
    let gameCount = 0;
    const winningGames = 3;

    for (const match of cellText.matchAll(gamePattern)) {
        const home = parseInt(match[1], 10);
        const away = parseInt(match[2], 10);
        if (Number.isNaN(home) || Number.isNaN(away)) continue;
        gameCount += 1;
        if (home > away) homeGamesWon += 1;
        else if (away > home) awayGamesWon += 1;

        // TT365 can include extra trailing game tokens in some cards; treat rubbers as first-to-3.
        if (homeGamesWon >= winningGames || awayGamesWon >= winningGames) {
            break;
        }
    }

    if (gameCount === 0) return null;
    return { homeGamesWon, awayGamesWon };
}

function parseGameCountsFromSetNode(
    $: cheerio.CheerioAPI,
    node: any,
): { homeGamesWon: number; awayGamesWon: number } | null {
    const gameText = $(node)
        .find('.gameScore')
        .toArray()
        .map((el) => normalizeText($(el).text()))
        .join(' ');

    return parseGameCountsFromCellText(gameText);
}

function collectTT365PlayerIds(
    $: cheerio.CheerioAPI,
    container: cheerio.Cheerio<any>,
    playerMap: Map<string, ParsedPlayer>,
): string[] {
    const playerIds: string[] = [];

    container.find('a[href*="/Results/Player/Statistics/"], a[href*="/results/player/statistics/"]').each(
        (_i, a) => {
            const href = $(a).attr('href') || '';
            const name = normalizeText($(a).text());
            const extId = extractPlayerIdFromHref(href);
            playerIds.push(extId);
            if (!playerMap.has(extId)) {
                playerMap.set(extId, { externalId: extId, name: normalizePlayerName(name) });
            }
        },
    );

    return playerIds;
}

function parseTT365TypeAMatchCard(
    $: cheerio.CheerioAPI,
    matchExternalId: string,
    playerMap: Map<string, ParsedPlayer>,
): ParsedRubber[] {
    const rubbers: ParsedRubber[] = [];

    $('table tbody tr').each((_i, row) => {
        const cells = $(row).find('td');
        if (cells.length < 4) return;

        const firstCell = $(cells[0]);
        if (firstCell.attr('colspan') || firstCell.text().includes('Submitted By')) {
            return;
        }

        const rubberIndex = rubbers.length + 1;

        const homeCell = $(cells[0]);
        const homePlayers = collectTT365PlayerIds($, homeCell, playerMap);
        const homeIsForfeit = homePlayers.length === 0 && isForfeitCellText(homeCell.text());

        const awayCell = $(cells[1]);
        const awayPlayers = collectTT365PlayerIds($, awayCell, playerMap);
        const awayIsForfeit = awayPlayers.length === 0 && isForfeitCellText(awayCell.text());

        const gamesCellText = normalizeText($(cells[2]).text());
        const parsedGames = parseGameCountsFromCellText(gamesCellText);
        const scoreText = normalizeText($(cells[3]).text());
        const scoreParts = scoreText.split('-').map((s) => parseInt(s.trim(), 10));
        const homeGamesWon = parsedGames?.homeGamesWon ?? scoreParts[0] ?? 0;
        const awayGamesWon = parsedGames?.awayGamesWon ?? scoreParts[1] ?? 0;

        rubbers.push({
            externalId: `${matchExternalId}-${rubberIndex}`,
            matchExternalId,
            isDoubles: homePlayers.length > 1 || awayPlayers.length > 1,
            homePlayers,
            awayPlayers,
            homeGamesWon,
            awayGamesWon,
            outcomeType: homeIsForfeit || awayIsForfeit ? 'walkover' : 'normal',
        });
    });

    return rubbers;
}

function parseTT365TypeBMatchCard(
    $: cheerio.CheerioAPI,
    matchExternalId: string,
    playerMap: Map<string, ParsedPlayer>,
): ParsedRubber[] {
    const rubbers: ParsedRubber[] = [];
    const rows = $('#CardResults .table-row.rowX').toArray();
    if (rows.length === 0) return rubbers;

    const headerRow = $(rows[0]!);
    const awaySlots = headerRow.children('div').toArray().slice(1).map((cell) => {
        const $cell = $(cell);
        const playerIds = collectTT365PlayerIds($, $cell, playerMap);
        const isForfeit = playerIds.length === 0 && isForfeitCellText($cell.text());
        return { playerIds, isForfeit };
    });

    for (const row of rows.slice(1)) {
        const $row = $(row);
        const rowClass = $row.attr('class') ?? '';

        if (rowClass.includes('row5') || $row.find('.doublesSet').length > 0) {
            const doublesCell = $row.children('div').first();
            const doublesBlocks = doublesCell.children('div').toArray();
            const homePlayers = doublesBlocks[0]
                ? collectTT365PlayerIds($, $(doublesBlocks[0]), playerMap)
                : [];
            const awayPlayers = doublesBlocks[1]
                ? collectTT365PlayerIds($, $(doublesBlocks[1]), playerMap)
                : [];
            const parsedGames = parseGameCountsFromSetNode($, $row.find('.doublesSet').get(0)!);
            if (!parsedGames) continue;

            rubbers.push({
                externalId: `${matchExternalId}-${rubbers.length + 1}`,
                matchExternalId,
                isDoubles: true,
                homePlayers,
                awayPlayers,
                homeGamesWon: parsedGames.homeGamesWon,
                awayGamesWon: parsedGames.awayGamesWon,
                outcomeType: homePlayers.length === 0 || awayPlayers.length === 0 ? 'walkover' : 'normal',
            });
            continue;
        }

        const homeCell = $row.children('div').first();
        const homePlayers = collectTT365PlayerIds($, homeCell, playerMap);
        const homeIsForfeit = homePlayers.length === 0 && isForfeitCellText(homeCell.text());
        const setNodes = $row.children('.set').toArray();

        setNodes.forEach((setNode, index) => {
            const awaySlot = awaySlots[index];
            if (!awaySlot) return;

            const parsedGames = parseGameCountsFromSetNode($, setNode);
            if (!parsedGames) return;

            rubbers.push({
                externalId: `${matchExternalId}-${rubbers.length + 1}`,
                matchExternalId,
                isDoubles: false,
                homePlayers,
                awayPlayers: awaySlot.playerIds,
                homeGamesWon: parsedGames.homeGamesWon,
                awayGamesWon: parsedGames.awayGamesWon,
                outcomeType: homeIsForfeit || awaySlot.isForfeit ? 'walkover' : 'normal',
            });
        });
    }

    return rubbers;
}

function parseTT365ScorecardMatchCard(
    $: cheerio.CheerioAPI,
    matchExternalId: string,
    playerMap: Map<string, ParsedPlayer>,
): ParsedRubber[] {
    const homeSingles = new Map<string, string[]>();
    const awaySingles = new Map<string, string[]>();
    let homeDoubles: string[] = [];
    let awayDoubles: string[] = [];

    const registerNamedPlayers = (
        container: cheerio.Cheerio<any>,
        target: Map<string, string[]>,
    ): void => {
        container.find('.row.cell-border.cell-space').each((_i, row) => {
            const label = normalizeText($(row).find('strong').first().text())
                .replace(/\s+/g, ' ')
                .trim();
            const scoreCell = $(row).find('.score').first();
            if (label.toLowerCase().startsWith('doubles') || label.toLowerCase().startsWith('final score')) {
                return;
            }
            const ids = collectTT365PlayerIds($, $(row), playerMap);
            if (ids.length === 0) return;
            const key = label.replace('Player ', '').trim();
            target.set(key, ids);
        });
    };

    registerNamedPlayers($('.fixtureDetails > .col-lg-6').first(), homeSingles);
    registerNamedPlayers($('.fixtureDetails > .col-lg-6').last(), awaySingles);

    const homeDoublesRow = $('.fixtureDetails > .col-lg-6').first().find('.row.cell-border.cell-space.doubles').first();
    const awayDoublesRow = $('.fixtureDetails > .col-lg-6').last().find('.row.cell-border.cell-space.doubles').first();
    if (homeDoublesRow.length > 0) {
        homeDoubles = collectTT365PlayerIds($, homeDoublesRow, playerMap);
    }
    if (awayDoublesRow.length > 0) {
        awayDoubles = collectTT365PlayerIds($, awayDoublesRow, playerMap);
    }

    const rubbers: ParsedRubber[] = [];
    $('.resultCard .results').each((_i, row) => {
        const schedule = normalizeText($(row).find('.schedule').text());
        const gameText = $(row)
            .find('.setResult .game')
            .toArray()
            .map((el) => normalizeText($(el).text()))
            .join(' ');
        const parsedGames = parseGameCountsFromCellText(gameText);
        if (!parsedGames) return;

        let homePlayers: string[] = [];
        let awayPlayers: string[] = [];
        let isDoubles = false;

        if (/^Dbls$/i.test(schedule)) {
            homePlayers = homeDoubles;
            awayPlayers = awayDoubles;
            isDoubles = true;
        } else {
            const match = schedule.match(/^([A-Z])\s+v\s+([A-Z])$/i);
            if (!match) return;
            homePlayers = homeSingles.get(match[1].toUpperCase()) ?? [];
            awayPlayers = awaySingles.get(match[2].toUpperCase()) ?? [];
        }

        rubbers.push({
            externalId: `${matchExternalId}-${rubbers.length + 1}`,
            matchExternalId,
            isDoubles,
            homePlayers,
            awayPlayers,
            homeGamesWon: parsedGames.homeGamesWon,
            awayGamesWon: parsedGames.awayGamesWon,
            outcomeType: homePlayers.length === 0 || awayPlayers.length === 0 ? 'walkover' : 'normal',
        });
    });

    return rubbers;
}

// ─── Standings Parser ─────────────────────────────────────────────────────────

export function parseTT365Standings(html: string): {
    teams: ParsedTeam[];
    standings: ParsedStanding[];
} {
    const $ = cheerio.load(html);

    const teams: ParsedTeam[] = [];
    const standings: ParsedStanding[] = [];
    const seenTeams = new Set<string>();
    const seenStandingTeams = new Set<string>();

    const readNumericCell = (
        cells: cheerio.Cheerio<any>,
        classSelector: string,
        fallbackIndex: number,
    ): number => {
        const classMatch = cells.filter(classSelector).first();
        const rawText = classMatch.length > 0
            ? classMatch.text()
            : $(cells[fallbackIndex] ?? []).text();
        return parseInt(normalizeText(rawText), 10);
    };

    // TT365 standings layouts vary by tenant.
    // Some expose 8 cells (#, Team, P, W, D, L, PA, Points),
    // while others include extra for/against ratio columns.
    $('table tbody tr').each((rowIndex, row) => {
        const cells = $(row).find('td');
        if (cells.length < 7) return; // skip non-data rows

        const rawPosition = parseInt($(cells[0]).text().trim(), 10);

        // Team cell contains an <a> with the team name and URL slug
        const teamLink = $(cells[1]).find('a').first();
        const teamName = normalizeText(teamLink.text());
        const teamHref = teamLink.attr('href') || '';
        const teamSlug = extractTeamSlugFromHref(teamHref);
        if (!teamSlug || !teamName) return;

        const position = Number.isNaN(rawPosition)
            ? seenStandingTeams.size + 1 || rowIndex + 1
            : rawPosition;

        if (!seenTeams.has(teamSlug)) {
            seenTeams.add(teamSlug);
            teams.push({
                externalId: teamSlug,
                name: teamName,
            });
        }

        if (seenStandingTeams.has(teamSlug)) {
            return;
        }
        seenStandingTeams.add(teamSlug);

        standings.push({
            teamExternalId: teamSlug,
            position,
            played: readNumericCell(cells, '.played', 2),
            won: readNumericCell(cells, '.won', 3),
            drawn: readNumericCell(cells, '.drawn', 4),
            lost: readNumericCell(cells, '.lost', 5),
            points: readNumericCell(cells, '.points', cells.length - 1),
        });
    });

    return { teams, standings };
}

// ─── Fixtures Page Parser ────────────────────────────────────────────────────

export interface TT365MatchCardTarget {
    matchExternalId: string;
    url: string;
}

export interface TT365PlayerStatsTarget {
    playerExternalId: string;
    seasonToken: string;
    url: string;
}

export interface TT365PlayerMatchResult {
    opponentExternalId: string;
    matchDate: string | null;
    playerGamesWon: number;
    opponentGamesWon: number;
}

export function parseTT365FixtureMatchCards(
    html: string,
    fixturesPageUrl: string,
): TT365MatchCardTarget[] {
    const $ = cheerio.load(html);

    const seenMatchIds = new Set<string>();
    const targets: TT365MatchCardTarget[] = [];

    // Scope to the fixtures container and pull every MatchCard link.
    $('#Fixtures a[href*="/MatchCard/"], #Fixtures a[href*="/matchcard/"]').each((_i, a) => {
        const href = $(a).attr('href');
        if (!href) return;

        const matchExternalId = extractMatchIdFromHref(href);
        if (!matchExternalId || seenMatchIds.has(matchExternalId)) return;

        const url = new URL(href, fixturesPageUrl).toString();
        seenMatchIds.add(matchExternalId);
        targets.push({ matchExternalId, url });
    });

    return targets;
}

function extractSeasonTokenFromPlayerStatsHref(href: string): string | null {
    const match = href.match(/\/results\/player\/statistics\/([^/]+)\//i);
    return match?.[1] ?? null;
}

export function parseTT365PlayerStatsTargets(
    html: string,
    matchCardUrl: string,
): TT365PlayerStatsTarget[] {
    const $ = cheerio.load(html);

    const targets: TT365PlayerStatsTarget[] = [];
    const seenPlayerIds = new Set<string>();

    $('a[href*="/Results/Player/Statistics/"], a[href*="/results/player/statistics/"]').each(
        (_i, a) => {
            const href = $(a).attr('href');
            if (!href) return;

            const playerExternalId = extractPlayerIdFromHref(href);
            const seasonToken = extractSeasonTokenFromPlayerStatsHref(href);
            if (!playerExternalId || !seasonToken || seenPlayerIds.has(playerExternalId)) {
                return;
            }

            seenPlayerIds.add(playerExternalId);
            targets.push({
                playerExternalId,
                seasonToken,
                url: new URL(href, matchCardUrl).toString(),
            });
        },
    );

    return targets;
}

export function parseTT365PlayerResultsForMatch(
    html: string,
    matchExternalId: string,
): TT365PlayerMatchResult[] {
    const $ = cheerio.load(html);

    const results: TT365PlayerMatchResult[] = [];

    $('table tbody tr').each((_i, row) => {
        const cells = $(row).find('td');
        if (cells.length < 6) return;

        const resultLink = $(cells[cells.length - 1]).find(
            'a[href*="/MatchCard/"], a[href*="/matchcard/"]',
        ).first();
        const resultHref = resultLink.attr('href') ?? '';
        const rowMatchExternalId = extractMatchIdFromHref(resultHref);
        if (rowMatchExternalId !== matchExternalId) return;

        const opponentLink = $(cells[0]).find(
            'a[href*="/Results/Player/Statistics/"], a[href*="/results/player/statistics/"]',
        ).first();
        const opponentHref = opponentLink.attr('href') ?? '';
        const opponentExternalId = extractPlayerIdFromHref(opponentHref);
        if (!opponentExternalId) return;

        const matchDate = normalizeText($(row).find('time[datetime]').first().attr('datetime') ?? '') || null;

        const gamesCell = $(cells[cells.length - 2]);
        const gameSpans = gamesCell.find('.game').toArray();
        const gamesCellText = gameSpans.length > 0
            ? gameSpans.map((el) => normalizeText($(el).text())).join(' ')
            : normalizeText(gamesCell.text());
        const parsedGames = parseGameCountsFromCellText(gamesCellText);
        let playerGamesWon = parsedGames?.homeGamesWon ?? 0;
        let opponentGamesWon = parsedGames?.awayGamesWon ?? 0;

        // Rare fallback: some rows can have no per-game spans but still indicate win/loss.
        if (!parsedGames) {
            const resultText = normalizeText(resultLink.text()).toLowerCase();
            if (resultText === 'win') {
                playerGamesWon = 1;
                opponentGamesWon = 0;
            } else if (resultText === 'loss') {
                playerGamesWon = 0;
                opponentGamesWon = 1;
            }
        }

        results.push({
            opponentExternalId,
            matchDate,
            playerGamesWon,
            opponentGamesWon,
        });
    });

    return results;
}

// ─── Match Card Parser ────────────────────────────────────────────────────────

export function parseTT365MatchCard(
    html: string,
    matchExternalId: string,
): {
    teams: ParsedTeam[];
    players: ParsedPlayer[];
    fixture: ParsedFixture;
    rubbers: ParsedRubber[];
} {
    const $ = cheerio.load(html);

    // ── Extract teams from the fixture header ─────────────────────────────
    // TT365 has at least two variants:
    // 1) static .fixture-header (used in local fixtures)
    // 2) ajax fragment under #CardSummary .teamNames
    let teamLinks = $('.fixture-header').find('a');
    if (teamLinks.length < 2) {
        teamLinks = $('#CardSummary .teamNames a');
    }
    if (teamLinks.length < 2) {
        teamLinks = $('.fixtureDetails .teamBg a');
    }

    const homeTeamName = normalizeText($(teamLinks[0]).text());
    const homeTeamHref = $(teamLinks[0]).attr('href') || '';
    const homeTeamSlug = extractTeamSlugFromHref(homeTeamHref);

    const awayTeamName = normalizeText($(teamLinks[1]).text());
    const awayTeamHref = $(teamLinks[1]).attr('href') || '';
    const awayTeamSlug = extractTeamSlugFromHref(awayTeamHref);

    const teams: ParsedTeam[] = [
        { externalId: homeTeamSlug, name: homeTeamName },
        { externalId: awayTeamSlug, name: awayTeamName },
    ];

    // ── Extract the match date ────────────────────────────────────────────
    const timeEl = $('time[datetime]');
    const datePlayed = timeEl.attr('datetime') || '';

    const playerMap = new Map<string, ParsedPlayer>();
    const rubbers = $('#PublicMatchCardTypeB').length > 0
        ? parseTT365TypeBMatchCard($, matchExternalId, playerMap)
        : $('.resultCard .results').length > 0
            ? parseTT365ScorecardMatchCard($, matchExternalId, playerMap)
            : parseTT365TypeAMatchCard($, matchExternalId, playerMap);

    // ── Build fixture ─────────────────────────────────────────────────────
    const hasScores = rubbers.length > 0;
    const hasExplicitFinalEvidence = hasExplicitTT365FinalEvidence($);
    const status: FixtureStatus = hasScores || hasExplicitFinalEvidence
        ? 'completed'
        : 'upcoming';

    const fixture: ParsedFixture = {
        externalId: matchExternalId,
        homeTeamExternalId: homeTeamSlug,
        awayTeamExternalId: awayTeamSlug,
        datePlayed,
        status,
        roundName: null,
        roundOrder: null,
    };

    return {
        teams,
        players: Array.from(playerMap.values()),
        fixture,
        rubbers,
    };
}