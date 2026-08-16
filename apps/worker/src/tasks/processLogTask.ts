import type { Task } from 'graphile-worker';
import { db } from '@tt-players/db';
import { parseTTLeaguesData } from '../parser.js';
import {
    parseTT365FixtureMatchCards,
    parseTT365MatchCard,
    parseTT365Standings,
} from '../tt365-parser.js';
import { loadTTLeaguesData } from '../loader.js';
import { RETRYABLE_JOB_SPEC, stableJobKey } from '../job-policy.js';
import {
    applyTT365PlayerStatsEvidenceFallback,
    ensureTT365PlayerStatsEvidenceDependencies,
    pinTT365PlayerStatsEvidence,
} from '../tt365-player-stats-evidence.js';

const TT365_RECHECK_UPCOMING_MS = 12 * 60 * 60 * 1000;
const TT365_RECHECK_POSTPONED_MS = 2 * 24 * 60 * 60 * 1000;
const TT365_RECHECK_COMPLETED_MS = 14 * 24 * 60 * 60 * 1000;
const TT365_FORCE_FIXTURES_REFRESH = process.env['TT365_FORCE_FIXTURES_REFRESH'] === '1';
const SCRAPE_JOB_SPEC = { maxAttempts: 1 };

/** @deprecated Transform processing no longer owns a player-stats memory cache. */
export function __resetTT365PlayerStatsCacheForTests(): void {}

type AddJobSpec = Record<string, unknown>;

export interface ProcessLogPayload {
    logId: string;
    competitionId: string;
    platformId: string;
    platformType: 'tt365' | 'ttleagues' | 'ttleagues-bundle';
    tt365DataType?: 'standings' | 'fixtures' | 'matchcard' | 'playerstats';
    matchExternalId?: string;
    playerExternalId?: string;
    parentLogId?: string;
    evidenceRequirementKey?: string;
}

export const processLogTask: Task = async (payload, helpers) => {
    const {
        logId,
        competitionId,
        platformId,
        platformType,
        tt365DataType,
        matchExternalId,
        playerExternalId,
        parentLogId,
        evidenceRequirementKey,
    } = payload as ProcessLogPayload;

    helpers.logger.info(`processLogTask: processing log ${logId} (${platformType})`);

    const log = await db
        .selectFrom('staging.raw_scrape_logs')
        .select(['id', 'raw_payload', 'status', 'endpoint_url'])
        .where('id', '=', logId)
        .executeTakeFirst();

    if (!log) {
        throw new Error(`processLogTask: raw_scrape_logs row not found for id=${logId}`);
    }

    const linkedPlayerStats =
        platformType === 'tt365'
        && tt365DataType === 'playerstats'
        && Boolean(parentLogId)
        && Boolean(evidenceRequirementKey);

    // Linked player-stat processing is deliberately idempotent even after the
    // evidence log is marked processed. This closes the crash window between
    // marking/pinning evidence and scheduling the parent transform.
    if (log.status === 'processed' && !linkedPlayerStats) {
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
                logId,
                competitionId,
                platformId,
                matchExternalId,
                parentLogId,
                evidenceRequirementKey,
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

async function processTTLeagues(
    log: { id: string; raw_payload: string; endpoint_url: string },
    competitionId: string,
    platformId: string,
    logId: string,
    helpers: { logger: { info: (msg: string) => void } },
): Promise<boolean> {
    const rawJson = JSON.parse(log.raw_payload);

    if (Array.isArray(rawJson)) {
        const { StandingsResponseSchema } = await import('../zod-schemas.js');
        const standings = StandingsResponseSchema.parse(rawJson);
        const teams = new Map<string, { externalId: string; name: string }>();
        for (const standing of standings) {
            const externalId = String(standing.teamId);
            if (!teams.has(externalId)) {
                teams.set(externalId, { externalId, name: standing.name });
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
                standings: standings.map((standing) => ({
                    teamExternalId: String(standing.teamId),
                    position: standing.position,
                    played: standing.played,
                    won: standing.won,
                    drawn: standing.drawn,
                    lost: standing.lost,
                    points: standing.points,
                })),
            },
            scrapeLogIds: [logId],
        });
    } else {
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
    }

    helpers.logger.info(`processLogTask: TT Leagues log ${logId} processed successfully`);
    return true;
}

async function processTT365Standings(
    log: { id: string; raw_payload: string; endpoint_url: string },
    competitionId: string,
    platformId: string,
    logId: string,
    helpers: { logger: { info: (msg: string) => void } },
): Promise<boolean> {
    const { teams, standings } = parseTT365Standings(log.raw_payload);
    if (standings.length === 0) {
        helpers.logger.info(`processLogTask: TT365 log ${logId} has no standings, marking failed`);
        await db
            .updateTable('staging.raw_scrape_logs')
            .set({ status: 'failed', updated_at: new Date() })
            .where('id', '=', logId)
            .execute();
        return false;
    }

    await loadTTLeaguesData(db, {
        competitionId,
        platformId,
        parsedData: {
            teams: teams.map((team) => ({ externalId: team.externalId, name: team.name })),
            players: [],
            fixtures: [],
            rubbers: [],
            standings: standings.map((standing) => ({
                teamExternalId: standing.teamExternalId,
                position: standing.position,
                played: standing.played,
                won: standing.won,
                drawn: standing.drawn,
                lost: standing.lost,
                points: standing.points,
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
        addJob: (identifier: string, payload: unknown, spec?: AddJobSpec) => Promise<unknown>;
        logger: { info: (msg: string) => void };
    },
): Promise<boolean> {
    const targets = parseTT365FixtureMatchCards(log.raw_payload, log.endpoint_url);
    const targetExternalIds = targets.map((target) => target.matchExternalId);
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
        existingFixtures.map((fixture) => [fixture.external_id, fixture]),
    );
    const nowMs = Date.now();
    const shouldRefresh = (externalId: string): boolean => {
        if (TT365_FORCE_FIXTURES_REFRESH) return true;
        const existing = existingByExternalId.get(externalId);
        if (!existing) return true;
        if (!isActiveSeason) return false;

        const ageMs = nowMs - new Date(existing.updated_at).getTime();
        if (existing.status === 'upcoming') return ageMs >= TT365_RECHECK_UPCOMING_MS;
        if (existing.status === 'postponed') return ageMs >= TT365_RECHECK_POSTPONED_MS;
        return ageMs >= TT365_RECHECK_COMPLETED_MS;
    };

    const queueTargets = targets.filter((target) => shouldRefresh(target.matchExternalId));
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
        .set({ status: 'processed', updated_at: new Date() })
        .where('id', '=', logId)
        .execute();
    return true;
}

function extractMatchIdFromEndpoint(endpointUrl: string): string | null {
    const match = endpointUrl.match(/\/matchcard\/(\d+)(?:[/?#]|$)/i);
    return match?.[1] ?? null;
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

async function processTT365MatchCard(
    log: { id: string; raw_payload: string; endpoint_url: string },
    competitionId: string,
    platformId: string,
    logId: string,
    payloadMatchExternalId: string | undefined,
    helpers: {
        addJob: (identifier: string, payload: unknown, spec?: AddJobSpec) => Promise<unknown>;
        logger: { info: (msg: string) => void };
    },
): Promise<boolean> {
    const matchExternalId =
        payloadMatchExternalId ?? extractMatchIdFromEndpoint(log.endpoint_url);
    if (!matchExternalId) {
        throw new Error(`processLogTask: TT365 match-card log ${logId} missing matchExternalId`);
    }

    let parsed = parseTT365MatchCard(log.raw_payload, matchExternalId);
    const matchCardConsistent = isTT365MatchCardConsistent(log.raw_payload, parsed);
    const hasImpossibleScores = hasImpossibleTT365RubberScores(parsed);

    if (!matchCardConsistent || hasImpossibleScores) {
        if (!hasImpossibleScores && isTT365WalkoverOnlyMatchCard(parsed)) {
            helpers.logger.info(
                `processLogTask: TT365 match-card log ${logId} is walkover-only; bypassing strict footer consistency checks`,
            );
        } else {
            const dependencies = await ensureTT365PlayerStatsEvidenceDependencies(
                db,
                logId,
                log.raw_payload,
                log.endpoint_url,
            );
            const missing = dependencies.filter((dependency) => !dependency.ready);

            if (missing.length > 0) {
                await db
                    .updateTable('staging.raw_scrape_logs')
                    .set({ status: 'pending', updated_at: new Date() })
                    .where('id', '=', logId)
                    .execute();

                for (const dependency of missing) {
                    await helpers.addJob('scrapeUrlTask', {
                        url: dependency.url,
                        platformId,
                        platformType: 'tt365',
                        competitionId,
                        tt365DataType: 'playerstats',
                        matchExternalId,
                        playerExternalId: dependency.playerExternalId,
                        parentLogId: logId,
                        evidenceRequirementKey: dependency.requirementKey,
                    }, {
                        ...RETRYABLE_JOB_SPEC,
                        jobKey: stableJobKey(
                            'tt365-playerstats-evidence',
                            logId,
                            dependency.requirementKey,
                        ),
                    });
                }

                helpers.logger.info(
                    `processLogTask: TT365 match-card log ${logId} needs ${missing.length} staged player-stats evidence resources; transform deferred`,
                );
                return false;
            }

            const fallback = applyTT365PlayerStatsEvidenceFallback(
                parsed,
                matchExternalId,
                dependencies,
            );
            parsed = fallback.parsed;
            const fallbackConsistent = isTT365MatchCardConsistent(log.raw_payload, parsed);
            const fallbackHasImpossibleScores = hasImpossibleTT365RubberScores(parsed);

            if (fallback.replacements === 0 || fallbackHasImpossibleScores) {
                helpers.logger.info(
                    `processLogTask: TT365 match-card log ${logId} staged fallback failed (replacements=${fallback.replacements}, impossible_scores=${fallbackHasImpossibleScores}), marking failed`,
                );
                await db
                    .updateTable('staging.raw_scrape_logs')
                    .set({ status: 'failed', updated_at: new Date() })
                    .where('id', '=', logId)
                    .execute();
                return false;
            }

            if (!fallbackConsistent) {
                helpers.logger.info(
                    `processLogTask: TT365 match-card log ${logId} footer remains inconsistent after staged fallback; trusting pinned player-stats evidence`,
                );
            }
            helpers.logger.info(
                `processLogTask: TT365 match-card log ${logId} recovered from pinned player-stats evidence (${fallback.replacements} rubbers patched)`,
            );
        }
    }

    if (!parsed.fixture.homeTeamExternalId || !parsed.fixture.awayTeamExternalId) {
        helpers.logger.info(
            `processLogTask: TT365 match-card log ${logId} invalid team data, marking failed`,
        );
        await db
            .updateTable('staging.raw_scrape_logs')
            .set({ status: 'failed', updated_at: new Date() })
            .where('id', '=', logId)
            .execute();
        return false;
    }

    await loadTTLeaguesData(db, {
        competitionId,
        platformId,
        parsedData: {
            teams: parsed.teams.map((team) => ({ externalId: team.externalId, name: team.name })),
            players: parsed.players.map((player) => ({
                externalId: player.externalId,
                name: player.name,
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
    logId: string,
    competitionId: string,
    platformId: string,
    matchExternalId: string | undefined,
    parentLogId: string | undefined,
    evidenceRequirementKey: string | undefined,
    helpers: {
        addJob: (identifier: string, payload: unknown, spec?: AddJobSpec) => Promise<unknown>;
        logger: { info: (msg: string) => void };
    },
): Promise<boolean> {
    await db
        .updateTable('staging.raw_scrape_logs')
        .set({ status: 'processed', updated_at: new Date() })
        .where('id', '=', logId)
        .execute();

    if (parentLogId && evidenceRequirementKey) {
        await pinTT365PlayerStatsEvidence(
            db,
            parentLogId,
            evidenceRequirementKey,
            logId,
        );

        await helpers.addJob('processLogTask', {
            logId: parentLogId,
            competitionId,
            platformId,
            platformType: 'tt365',
            tt365DataType: 'matchcard',
            matchExternalId,
        }, {
            ...RETRYABLE_JOB_SPEC,
            jobKey: stableJobKey('process-log', parentLogId),
        });

        helpers.logger.info(
            `processLogTask: TT365 player-stats log ${logId} pinned to parent ${parentLogId}; parent transform resumed`,
        );
    } else {
        helpers.logger.info(
            `processLogTask: TT365 player-stats log ${logId} processed as compatibility no-op`,
        );
    }
    return true;
}
