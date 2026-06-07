import type { Task } from 'graphile-worker';
import { db } from '@tt-players/db';
import { parseTTLeaguesData } from '../parser.js';
import {
    parseTT365FixtureMatchCards,
    parseTT365MatchCard,
    parseTT365PlayerResultsForMatch,
    parseTT365PlayerStatsTargets,
    parseTT365Standings,
} from '../tt365-parser.js';
import { fetchWithTT365Policy } from '../tt365-http.js';
import { loadTTLeaguesData } from '../loader.js';
import { reconcilePlayersByName } from '../player-reconciler.js';

const TT365_RECHECK_UPCOMING_MS = 12 * 60 * 60 * 1000; // 12h
const TT365_RECHECK_POSTPONED_MS = 2 * 24 * 60 * 60 * 1000; // 2d
const TT365_RECHECK_COMPLETED_MS = 14 * 24 * 60 * 60 * 1000; // 14d
const TT365_FORCE_FIXTURES_REFRESH = process.env['TT365_FORCE_FIXTURES_REFRESH'] === '1';
const SCRAPE_JOB_SPEC = { maxAttempts: 1 };
const TT365_PLAYER_STATS_FETCH_RETRIES = Number(
    process.env['TT365_PLAYER_STATS_FETCH_RETRIES'] ?? '2',
);
const TT365_PLAYER_STATS_RETRY_DELAY_MS = Number(
    process.env['TT365_PLAYER_STATS_RETRY_DELAY_MS'] ?? '1000',
);
const TT365_PLAYER_STATS_FETCH_TIMEOUT_MS = Number(
    process.env['TT365_PLAYER_STATS_FETCH_TIMEOUT_MS'] ?? '15000',
);
type TT365PlayerStatsCacheEntry = {
    body: string;
};

const tt365PlayerStatsCache = new Map<string, TT365PlayerStatsCacheEntry>();
const tt365PlayerStatsInFlight = new Map<string, Promise<string>>();

export function __resetTT365PlayerStatsCacheForTests(): void {
    tt365PlayerStatsCache.clear();
    tt365PlayerStatsInFlight.clear();
}

type AddJobSpec = {
    maxAttempts?: number;
    jobKey?: string;
};

export interface ProcessLogPayload {
    logId: string;
    competitionId: string;
    platformId: string;
    platformType: 'tt365' | 'ttleagues' | 'ttleagues-bundle';
    tt365DataType?: 'standings' | 'fixtures' | 'matchcard' | 'playerstats';
    matchExternalId?: string;
    playerExternalId?: string;
}

/**
 * Graphile Worker task: Phase 2 (Transform + Load).
 *
 * Reads raw_payload from raw_scrape_logs and processes it based
 * on the platform type:
 * - "ttleagues": standalone standings JSON array
 * - "ttleagues-bundle": bundled {standings, matches, sets} from scrapeMatchesTask
 * - "tt365" standings: parses standings HTML, upserts teams + standings
 * - "tt365" fixtures: extracts MatchCard links and queues scrapeUrlTask jobs
 * - "tt365" matchcard: parses match card HTML, upserts fixture/rubbers from game scores
 * - "tt365" playerstats: compatibility no-op; logs are marked processed
 */
export const processLogTask: Task = async (payload, helpers) => {
    const {
        logId,
        competitionId,
        platformId,
        platformType,
        tt365DataType,
        matchExternalId,
        playerExternalId,
    } = payload as ProcessLogPayload;

    helpers.logger.info(`processLogTask: processing log ${logId} (${platformType})`);

    // 1. Read the raw scrape log
    const log = await db
        .selectFrom('staging.raw_scrape_logs')
        .select(['id', 'raw_payload', 'status', 'endpoint_url'])
        .where('id', '=', logId)
        .executeTakeFirst();

    if (!log) {
        throw new Error(`processLogTask: raw_scrape_logs row not found for id=${logId}`);
    }

    if (log.status === 'processed') {
        helpers.logger.info(`processLogTask: log ${logId} already processed, skipping`);
        return;
    }

    let processedSuccessfully = false;

    if (platformType === 'ttleagues' || platformType === 'ttleagues-bundle') {
        processedSuccessfully = await processTTLeagues(
            log,
            competitionId,
            platformId,
            logId,
            helpers,
        );
    } else {
        const mode = tt365DataType ?? 'standings';

        if (mode === 'fixtures') {
            processedSuccessfully = await processTT365Fixtures(
                log,
                competitionId,
                platformId,
                logId,
                helpers,
            );
        } else if (mode === 'matchcard') {
            processedSuccessfully = await processTT365MatchCard(
                log,
                competitionId,
                platformId,
                logId,
                matchExternalId,
                helpers,
            );
        } else if (mode === 'playerstats') {
            processedSuccessfully = await processTT365PlayerStats(
                log,
                competitionId,
                platformId,
                logId,
                matchExternalId,
                playerExternalId,
                helpers,
            );
        } else {
            processedSuccessfully = await processTT365Standings(
                log,
                competitionId,
                platformId,
                logId,
                helpers,
            );
        }
    }

    if (processedSuccessfully) {
        await db
            .updateTable('competitions')
            .set({ last_scraped_at: new Date() })
            .where('id', '=', competitionId)
            .execute();
    }
};

// ─── TT Leagues (JSON API) ───────────────────────────────────────────────────

async function processTTLeagues(
    log: { id: string; raw_payload: string; endpoint_url: string },
    competitionId: string,
    platformId: string,
    logId: string,
    helpers: { logger: { info: (msg: string) => void } },
): Promise<boolean> {
    const rawJson = JSON.parse(log.raw_payload);

    // The standings API returns a flat array; the full bundle has {standings, matches, sets}
    if (Array.isArray(rawJson)) {
        // Standalone standings response — build a minimal ParsedTTLeaguesData
        const { StandingsResponseSchema } = await import('../zod-schemas.js');
        const standings = StandingsResponseSchema.parse(rawJson);

        const teams = new Map<string, { externalId: string; name: string }>();
        for (const s of standings) {
            const extId = String(s.teamId);
            if (!teams.has(extId)) {
                teams.set(extId, { externalId: extId, name: s.name });
            }
        }

        await loadTTLeaguesData(db, {
            competitionId,
            platformId,
            parsedData: {
                teams: Array.from(teams.values()),
                players: [],
                fixtures: [],
                rubbers: [],
                standings: standings.map((s) => ({
                    teamExternalId: String(s.teamId),
                    position: s.position,
                    played: s.played,
                    won: s.won,
                    drawn: s.drawn,
                    lost: s.lost,
                    points: s.points,
                })),
            },
            scrapeLogIds: [logId],
        });
    } else {
        // Full bundled response with standings + matches + sets
        const parsedData = parseTTLeaguesData({
            standings: rawJson.standings,
            matches: rawJson.matches,
            sets: rawJson.sets ?? {},
        });

        await loadTTLeaguesData(db, {
            competitionId,
            platformId,
            parsedData,
            scrapeLogIds: [logId],
        });

        if (parsedData.players.length > 0) {
            await reconcilePlayersByName(db, helpers.logger);
        }
    }

    helpers.logger.info(`processLogTask: TT Leagues log ${logId} processed successfully`);
    return true;
}

// ─── TT365 (HTML Cheerio) ────────────────────────────────────────────────────

async function processTT365Standings(
    log: { id: string; raw_payload: string; endpoint_url: string },
    competitionId: string,
    platformId: string,
    logId: string,
    helpers: { logger: { info: (msg: string) => void } },
): Promise<boolean> {
    // Parse standings HTML
    const { teams, standings } = parseTT365Standings(log.raw_payload);

    if (standings.length === 0) {
        helpers.logger.info(`processLogTask: TT365 log ${logId} has no standings, marking failed`);
        await db
            .updateTable('staging.raw_scrape_logs')
            .set({ status: 'failed' })
            .where('id', '=', logId)
            .execute();
        return false;
    }

    // Load via the same loader by building a compatible ParsedTTLeaguesData
    await loadTTLeaguesData(db, {
        competitionId,
        platformId,
        parsedData: {
            teams: teams.map((t) => ({
                externalId: t.externalId,
                name: t.name,
            })),
            players: [],
            fixtures: [],
            rubbers: [],
            standings: standings.map((s) => ({
                teamExternalId: s.teamExternalId,
                position: s.position,
                played: s.played,
                won: s.won,
                drawn: s.drawn,
                lost: s.lost,
                points: s.points,
            })),
        },
        scrapeLogIds: [logId],
    });

    helpers.logger.info(
        `processLogTask: TT365 log ${logId} processed (${standings.length} standings)`,
    );
    return true;
}

async function processTT365Fixtures(
    log: { id: string; raw_payload: string; endpoint_url: string },
    competitionId: string,
    platformId: string,
    logId: string,
    helpers: {
        addJob: (
            identifier: string,
            payload: unknown,
            spec?: AddJobSpec,
        ) => Promise<unknown>;
        logger: { info: (msg: string) => void };
    },
): Promise<boolean> {
    const targets = parseTT365FixtureMatchCards(log.raw_payload, log.endpoint_url);
    const targetExternalIds = targets.map((t) => t.matchExternalId);
    const season = await db
        .selectFrom('competitions as c')
        .innerJoin('seasons as s', 's.id', 'c.season_id')
        .select(['s.is_active'])
        .where('c.id', '=', competitionId)
        .executeTakeFirst();
    const isActiveSeason = season?.is_active === true;

    const existingFixtures = targetExternalIds.length
        ? await db
            .selectFrom('fixtures')
            .select(['external_id', 'status', 'updated_at'])
            .where('competition_id', '=', competitionId)
            .where('external_id', 'in', targetExternalIds)
            .execute()
        : [];

    const existingByExternalId = new Map(
        existingFixtures.map((f) => [f.external_id, f]),
    );

    const nowMs = Date.now();
    const shouldRefresh = (externalId: string): boolean => {
        if (TT365_FORCE_FIXTURES_REFRESH) return true;

        const existing = existingByExternalId.get(externalId);
        if (!existing) return true;

        // Historical seasons are one-off snapshots unless manually forced.
        if (!isActiveSeason) return false;

        const updatedAtMs = new Date(existing.updated_at).getTime();
        const ageMs = nowMs - updatedAtMs;

        if (existing.status === 'upcoming') {
            return ageMs >= TT365_RECHECK_UPCOMING_MS;
        }
        if (existing.status === 'postponed') {
            return ageMs >= TT365_RECHECK_POSTPONED_MS;
        }
        // completed
        return ageMs >= TT365_RECHECK_COMPLETED_MS;
    };

    const queueTargets = targets.filter((t) => shouldRefresh(t.matchExternalId));

    helpers.logger.info(
        `processLogTask: TT365 fixtures log ${logId} extracted ${targets.length} match cards, queuing ${queueTargets.length}`,
    );

    for (const target of queueTargets) {
        await helpers.addJob('scrapeUrlTask', {
            url: target.url,
            platformId,
            platformType: 'tt365',
            competitionId,
            tt365DataType: 'matchcard',
            matchExternalId: target.matchExternalId,
        }, SCRAPE_JOB_SPEC);
    }

    await db
        .updateTable('staging.raw_scrape_logs')
        .set({ status: 'processed' })
        .where('id', '=', logId)
        .execute();

    return true;
}

function extractMatchIdFromEndpoint(endpointUrl: string): string | null {
    const match = endpointUrl.match(/\/matchcard\/(\d+)(?:[/?#]|$)/i);
    return match?.[1] ?? null;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTT365PlayerStatsCacheKey(target: {
    seasonToken: string;
    playerExternalId: string;
}): string {
    return `${target.seasonToken}|${target.playerExternalId}`;
}

function extractTT365FooterScore(
    html: string,
): { homeRubbersWon: number; awayRubbersWon: number } | null {
    const match = html.match(
        /<td[^>]*class=["'][^"']*\bresult\b[^"']*["'][^>]*>\s*(\d+)\s*-\s*(\d+)\s*<\/td>/i,
    );
    if (!match) return null;
    return {
        homeRubbersWon: Number.parseInt(match[1], 10),
        awayRubbersWon: Number.parseInt(match[2], 10),
    };
}

function aggregateTT365RubberWins(parsed: ReturnType<typeof parseTT365MatchCard>): {
    homeRubbersWon: number;
    awayRubbersWon: number;
} {
    let homeRubbersWon = 0;
    let awayRubbersWon = 0;

    for (const rubber of parsed.rubbers) {
        if (rubber.homeGamesWon > rubber.awayGamesWon) homeRubbersWon += 1;
        else if (rubber.awayGamesWon > rubber.homeGamesWon) awayRubbersWon += 1;
    }

    return { homeRubbersWon, awayRubbersWon };
}

function isTT365MatchCardConsistent(
    html: string,
    parsed: ReturnType<typeof parseTT365MatchCard>,
): boolean {
    const footerScore = extractTT365FooterScore(html);
    if (!footerScore) return true;

    const aggregateScore = aggregateTT365RubberWins(parsed);
    return (
        aggregateScore.homeRubbersWon === footerScore.homeRubbersWon
        && aggregateScore.awayRubbersWon === footerScore.awayRubbersWon
    );
}

function hasImpossibleTT365RubberScores(
    parsed: ReturnType<typeof parseTT365MatchCard>,
): boolean {
    return parsed.rubbers.some(
        (rubber) => rubber.homeGamesWon > 3 || rubber.awayGamesWon > 3,
    );
}

function isTT365WalkoverOnlyMatchCard(
    parsed: ReturnType<typeof parseTT365MatchCard>,
): boolean {
    return parsed.rubbers.length > 0
        && parsed.rubbers.every((rubber) => rubber.outcomeType === 'walkover');
}

async function fetchTextWithRetry(url: string): Promise<string> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= TT365_PLAYER_STATS_FETCH_RETRIES; attempt += 1) {
        try {
            const response = await fetchWithTT365Policy(
                url,
                undefined,
                {
                    maxAttempts: 1,
                    timeoutMs: TT365_PLAYER_STATS_FETCH_TIMEOUT_MS,
                },
            );
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }
            return await response.text();
        } catch (error) {
            lastError = error;
            if (attempt < TT365_PLAYER_STATS_FETCH_RETRIES) {
                await sleep(TT365_PLAYER_STATS_RETRY_DELAY_MS);
            }
        }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function getCachedTT365PlayerStatsBody(target: {
    seasonToken: string;
    playerExternalId: string;
}): string | null {
    const entry = tt365PlayerStatsCache.get(getTT365PlayerStatsCacheKey(target));
    return entry?.body ?? null;
}

async function fetchTT365PlayerStatsBody(target: {
    seasonToken: string;
    playerExternalId: string;
    url: string;
}): Promise<string> {
    const cacheKey = getTT365PlayerStatsCacheKey(target);
    const cached = getCachedTT365PlayerStatsBody(target);
    if (cached !== null) return cached;

    const existingInFlight = tt365PlayerStatsInFlight.get(cacheKey);
    if (existingInFlight) return existingInFlight;

    const inFlight = (async () => {
        const body = await fetchTextWithRetry(target.url);
        tt365PlayerStatsCache.set(cacheKey, { body });
        return body;
    })().finally(() => {
        tt365PlayerStatsInFlight.delete(cacheKey);
    });

    tt365PlayerStatsInFlight.set(cacheKey, inFlight);
    return inFlight;
}

function isUsablePlayerStatsScore(
    homeGamesWon: number,
    awayGamesWon: number,
): boolean {
    return homeGamesWon >= 0
        && awayGamesWon >= 0
        && homeGamesWon <= 3
        && awayGamesWon <= 3
        && (homeGamesWon > awayGamesWon || awayGamesWon > homeGamesWon);
}

type TT365FallbackStatsResult = {
    playerExternalId: string;
    opponentExternalId: string;
    playerGamesWon: number;
    opponentGamesWon: number;
};

async function buildTT365PlayerStatsLookup(
    parsed: ReturnType<typeof parseTT365MatchCard>,
    rawMatchCardHtml: string,
    matchCardUrl: string,
    matchExternalId: string,
    fixtureDatePlayed: string | null,
    helpers: { logger: { info: (msg: string) => void } },
): Promise<Map<string, TT365FallbackStatsResult>> {
    const targets = parseTT365PlayerStatsTargets(rawMatchCardHtml, matchCardUrl);
    const lookup = new Map<string, TT365FallbackStatsResult>();

    for (const target of targets) {
        try {
            const playerStatsHtml = await fetchTT365PlayerStatsBody(target);
            const rows = parseTT365PlayerResultsForMatch(
                playerStatsHtml,
                matchExternalId,
            );

            for (const row of rows) {
                if (fixtureDatePlayed && row.matchDate !== fixtureDatePlayed) {
                    continue;
                }
                if (!isUsablePlayerStatsScore(row.playerGamesWon, row.opponentGamesWon)) {
                    continue;
                }

                const key = `${target.playerExternalId}|${row.opponentExternalId}`;
                if (!lookup.has(key)) {
                    lookup.set(key, {
                        playerExternalId: target.playerExternalId,
                        opponentExternalId: row.opponentExternalId,
                        playerGamesWon: row.playerGamesWon,
                        opponentGamesWon: row.opponentGamesWon,
                    });
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            helpers.logger.info(
                `processLogTask: TT365 player-stats fetch failed for ${target.url}: ${message}`,
            );
        }
    }

    return lookup;
}

function findTT365FallbackRubberScore(
    rubber: ReturnType<typeof parseTT365MatchCard>['rubbers'][number],
    lookup: Map<string, TT365FallbackStatsResult>,
): { homeGamesWon: number; awayGamesWon: number } | null {
    const tryPair = (
        homePlayerExternalId: string,
        awayPlayerExternalId: string,
    ): { homeGamesWon: number; awayGamesWon: number } | null => {
        const direct = lookup.get(`${homePlayerExternalId}|${awayPlayerExternalId}`);
        if (direct) {
            return {
                homeGamesWon: direct.playerGamesWon,
                awayGamesWon: direct.opponentGamesWon,
            };
        }

        const reverse = lookup.get(`${awayPlayerExternalId}|${homePlayerExternalId}`);
        if (reverse) {
            return {
                homeGamesWon: reverse.opponentGamesWon,
                awayGamesWon: reverse.playerGamesWon,
            };
        }

        return null;
    };

    for (const homePlayerExternalId of rubber.homePlayers) {
        for (const awayPlayerExternalId of rubber.awayPlayers) {
            const score = tryPair(homePlayerExternalId, awayPlayerExternalId);
            if (score) return score;
        }
    }

    return null;
}

async function applyTT365PlayerStatsFallback(
    parsed: ReturnType<typeof parseTT365MatchCard>,
    rawMatchCardHtml: string,
    matchCardUrl: string,
    matchExternalId: string,
    helpers: { logger: { info: (msg: string) => void } },
): Promise<{ parsed: ReturnType<typeof parseTT365MatchCard>; replacements: number }> {
    const lookup = await buildTT365PlayerStatsLookup(
        parsed,
        rawMatchCardHtml,
        matchCardUrl,
        matchExternalId,
        parsed.fixture.datePlayed,
        helpers,
    );

    let replacements = 0;
    const rubbers = parsed.rubbers.map((rubber) => {
        const fallback = findTT365FallbackRubberScore(rubber, lookup);
        if (!fallback) return rubber;
        replacements += 1;
        return {
            ...rubber,
            homeGamesWon: fallback.homeGamesWon,
            awayGamesWon: fallback.awayGamesWon,
        };
    });

    return {
        parsed: {
            ...parsed,
            rubbers,
        },
        replacements,
    };
}

async function processTT365MatchCard(
    log: { id: string; raw_payload: string; endpoint_url: string },
    competitionId: string,
    platformId: string,
    logId: string,
    payloadMatchExternalId: string | undefined,
    helpers: { logger: { info: (msg: string) => void } },
): Promise<boolean> {
    const matchExternalId =
        payloadMatchExternalId ?? extractMatchIdFromEndpoint(log.endpoint_url);
    if (!matchExternalId) {
        throw new Error(
            `processLogTask: TT365 match-card log ${logId} missing matchExternalId`,
        );
    }

    let parsed = parseTT365MatchCard(log.raw_payload, matchExternalId);

    const matchCardConsistent = isTT365MatchCardConsistent(log.raw_payload, parsed);
    const hasImpossibleScores = hasImpossibleTT365RubberScores(parsed);

    if (!matchCardConsistent || hasImpossibleScores) {
        helpers.logger.info(
            `processLogTask: TT365 match-card log ${logId} failed validation (consistent=${matchCardConsistent}, impossible_scores=${hasImpossibleScores}); attempting player-stats fallback`,
        );

        const fallback = await applyTT365PlayerStatsFallback(
            parsed,
            log.raw_payload,
            log.endpoint_url,
            matchExternalId,
            helpers,
        );
        parsed = fallback.parsed;
        const fallbackConsistent = isTT365MatchCardConsistent(log.raw_payload, parsed);
        const fallbackHasImpossibleScores = hasImpossibleTT365RubberScores(parsed);
        let usedWalkoverBypass = false;

        if (
            fallback.replacements === 0
            || fallbackHasImpossibleScores
        ) {
            if (
                fallback.replacements === 0
                && !fallbackHasImpossibleScores
                && isTT365WalkoverOnlyMatchCard(parsed)
            ) {
                usedWalkoverBypass = true;
                helpers.logger.info(
                    `processLogTask: TT365 match-card log ${logId} fallback unresolved but payload is walkover-only; bypassing strict consistency checks`,
                );
            } else {
                helpers.logger.info(
                    `processLogTask: TT365 match-card log ${logId} fallback failed (replacements=${fallback.replacements}, impossible_scores=${fallbackHasImpossibleScores}), marking failed`,
                );
                await db
                    .updateTable('staging.raw_scrape_logs')
                    .set({ status: 'failed' })
                    .where('id', '=', logId)
                    .execute();
                return false;
            }
        }

        if (!fallbackConsistent && fallback.replacements > 0) {
            helpers.logger.info(
                `processLogTask: TT365 match-card log ${logId} footer remains inconsistent after fallback; trusting player-stats scores`,
            );
        }

        if (fallback.replacements > 0) {
            helpers.logger.info(
                `processLogTask: TT365 match-card log ${logId} recovered via player-stats fallback (${fallback.replacements} rubbers patched)`,
            );
        } else if (usedWalkoverBypass) {
            helpers.logger.info(
                `processLogTask: TT365 match-card log ${logId} processed using walkover-only bypass`,
            );
        }
    }

    if (
        !parsed.fixture.homeTeamExternalId ||
        !parsed.fixture.awayTeamExternalId
    ) {
        helpers.logger.info(
            `processLogTask: TT365 match-card log ${logId} invalid team data, marking failed`,
        );
        await db
            .updateTable('staging.raw_scrape_logs')
            .set({ status: 'failed' })
            .where('id', '=', logId)
            .execute();
        return false;
    }

    await loadTTLeaguesData(db, {
        competitionId,
        platformId,
        parsedData: {
            teams: parsed.teams.map((t) => ({
                externalId: t.externalId,
                name: t.name,
            })),
            players: parsed.players.map((p) => ({
                externalId: p.externalId,
                name: p.name,
            })),
            fixtures: [parsed.fixture],
            rubbers: parsed.rubbers,
            standings: [],
        },
        scrapeLogIds: [logId],
    });

    helpers.logger.info(
        `processLogTask: TT365 match-card log ${logId} processed (${parsed.rubbers.length} rubbers)`,
    );
    return true;
}

async function processTT365PlayerStats(
    _log: { id: string; raw_payload: string; endpoint_url: string },
    _competitionId: string,
    _platformId: string,
    logId: string,
    _payloadMatchExternalId: string | undefined,
    _payloadPlayerExternalId: string | undefined,
    helpers: { logger: { info: (msg: string) => void } },
): Promise<boolean> {
    await db
        .updateTable('staging.raw_scrape_logs')
        .set({ status: 'processed' })
        .where('id', '=', logId)
        .execute();

    helpers.logger.info(
        `processLogTask: TT365 player-stats log ${logId} processed as no-op (score overrides disabled)`,
    );
    return true;
}
