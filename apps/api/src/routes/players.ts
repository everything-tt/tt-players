import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Kysely, RawBuilder } from 'kysely';
import type { Database } from '@tt-players/db';
import { sql } from 'kysely';

const ParamsSchema = z.object({
    id: z.string().uuid(),
});

const PaginationQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
    cursor: z.string().optional(),
    source: z.enum(['league', 'tournament', 'all']).default('league'),
});

const CursorMetaSchema = z.object({
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
});

const RubberCursorSchema = z.object({
    date: z.string(),
    id: z.string().uuid(),
    total: z.number().int().nonnegative().optional(),
});
const SavedIdsSchema = z.string().refine((value) => {
    const ids = value.split(',').map((id) => id.trim()).filter(Boolean);
    return ids.length <= 200 && ids.every((id) => z.string().uuid().safeParse(id).success);
}, 'saved_ids must contain at most 200 comma-separated UUIDs');

const SearchQuerySchema = z.object({
    q: z.string().optional(),
    league_ids: z.string().optional(),
    saved_ids: SavedIdsSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    offset: z.coerce.number().int().min(0).default(0),
});

const H2HQuerySchema = z.object({
    league_ids: z.string().optional(),
});

const LeadersQuerySchema = z.object({
    mode: z.enum(['win_pct', 'most_played', 'combined', 'form', 'improving', 'new_faces']).default('combined'),
    league_ids: z.string().optional(),
    season_id: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    min_played: z.coerce.number().int().min(1).max(100).default(3),
});

const SearchResponseSchema = z.object({
    data: z.array(
        z.object({
            id: z.string().uuid(),
            name: z.string(),
            played: z.number().int(),
            wins: z.number().int(),
        })
    ),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    has_more: z.boolean(),
});

const ResponseSchema = z.object({
    player_id: z.string().uuid(),
    player_name: z.string(),
    wins: z.number().int(),
    losses: z.number().int(),
    total: z.number().int(),
});

const ExtendedResponseSchema = ResponseSchema.extend({
    nemesis_id: z.string().uuid().nullable(),
    nemesis: z.string(),
    duo: z.string(),
    streak: z.string(),
});

const CareerByYearItemSchema = z.object({
    year: z.number().int(),
    played: z.number().int(),
    wins: z.number().int(),
    losses: z.number().int(),
    win_rate: z.number().int(),
});

const RivalItemSchema = z.object({
    opponent_id: z.string().uuid(),
    opponent_name: z.string(),
    played: z.number().int(),
    wins: z.number().int(),
    losses: z.number().int(),
    win_rate: z.number().int(),
});

const PlayerInsightsResponseSchema = z.object({
    player_id: z.string().uuid(),
    player_name: z.string(),
    years_played: z.number().int(),
    first_match_date: z.string().nullable(),
    latest_match_date: z.string().nullable(),
    career_by_year: z.array(CareerByYearItemSchema),
    peaks: z.object({
        best_season: z.object({
            year: z.number().int(),
            played: z.number().int(),
            win_rate: z.number().int(),
        }).nullable(),
        most_active_season: z.object({
            year: z.number().int(),
            played: z.number().int(),
        }).nullable(),
        best_month: z.object({
            month: z.string(),
            played: z.number().int(),
            win_rate: z.number().int(),
        }).nullable(),
        worst_month: z.object({
            month: z.string(),
            played: z.number().int(),
            win_rate: z.number().int(),
        }).nullable(),
    }),
    rivals: z.object({
        toughest: RivalItemSchema.nullable(),
        easiest: RivalItemSchema.nullable(),
        improving_vs: z.object({
            opponent_id: z.string().uuid(),
            opponent_name: z.string(),
            first_half_win_rate: z.number().int(),
            second_half_win_rate: z.number().int(),
            delta_points: z.number().int(),
        }).nullable(),
    }),
    style: z.object({
        singles: z.object({
            played: z.number().int(),
            wins: z.number().int(),
            losses: z.number().int(),
            win_rate: z.number().int(),
        }),
        doubles: z.object({
            played: z.number().int(),
            wins: z.number().int(),
            losses: z.number().int(),
            win_rate: z.number().int(),
        }),
        score_patterns: z.array(z.object({
            score: z.string(),
            count: z.number().int(),
        })),
    }),
    form: z.object({
        rolling_10_win_rate: z.number().int(),
        rolling_20_win_rate: z.number().int(),
        momentum: z.enum(['hot', 'steady', 'cold', 'new']),
        recent_results: z.array(z.enum(['W', 'L'])),
    }),
    context: z.object({
        home: z.object({
            played: z.number().int(),
            wins: z.number().int(),
            win_rate: z.number().int(),
        }),
        away: z.object({
            played: z.number().int(),
            wins: z.number().int(),
            win_rate: z.number().int(),
        }),
        by_league: z.array(z.object({
            league: z.string(),
            played: z.number().int(),
            win_rate: z.number().int(),
        })),
        by_division: z.array(z.object({
            division: z.string(),
            played: z.number().int(),
            win_rate: z.number().int(),
        })),
    }),
    milestones: z.object({
        total_matches: z.number().int(),
        longest_win_streak: z.number().int(),
        milestone_hits: z.array(z.number().int()),
    }),
    projection: z.object({
        current_season_matches: z.number().int(),
        current_season_win_rate: z.number().int(),
        projected_matches: z.number().int(),
        on_track_for_70_win_rate: z.boolean(),
    }),
});

const CurrentSeasonAffiliationSchema = z.object({
    team_id: z.string().uuid(),
    team_name: z.string(),
    league_id: z.string().uuid(),
    league_name: z.string(),
    season_id: z.string().uuid(),
    season_name: z.string(),
    competition_name: z.string(),
});

const RubberItemSchema = z.object({
    id: z.string().uuid(),
    fixture_id: z.string().uuid(),
    date: z.string(),
    source: z.enum(['league', 'tournament']).optional(),
    source_label: z.string().optional(),
    event_id: z.string().uuid().nullable().optional(),
    event_name: z.string().nullable().optional(),
    league: z.string(),
    opponent: z.string(),
    opponent_id: z.string().uuid().nullable(),
    result: z.string(),
    isWin: z.boolean(),
});

const ErrorSchema = z.object({
    error: z.string(),
    statusCode: z.number(),
});

const LeaderItemSchema = z.object({
    rank: z.number().int(),
    player_id: z.string().uuid(),
    player_name: z.string(),
    played: z.number().int(),
    wins: z.number().int(),
    losses: z.number().int(),
    win_rate: z.number(),
    score: z.number().nullable(),
    first_match_date: z.string().nullable(),
});

const PLAYER_INSIGHTS_CACHE_TTL_MS = Number(
    process.env['PLAYER_INSIGHTS_CACHE_TTL_MS'] ?? `${24 * 60 * 60 * 1000}`,
);

const DEFAULT_CACHE_TTL_MS = Number(
    process.env['DEFAULT_CACHE_TTL_MS'] ?? `${24 * 60 * 60 * 1000}`,
);

const PLAYER_INSIGHTS_CACHE_TYPE = 'player-insights';
const PLAYER_LEADERS_CACHE_TYPE = 'player-leaders';
const PLAYER_COUNT_CACHE_TYPE = 'player-count';

interface ResolvedPlayerIdentity {
    canonicalId: string;
    playerName: string;
    sourceIds: string[];
}

function uuidArray(ids: string[]): RawBuilder<string[]> {
    if (ids.length === 0) {
        return sql`ARRAY[]::uuid[]`;
    }
    return sql`ARRAY[${sql.join(ids.map((id) => sql`${id}::uuid`))}]::uuid[]`;
}

function encodeRubberCursor(date: Date | string | null, id: string, total?: number): string {
    const dateValue = date instanceof Date ? date.toISOString() : String(date);
    return Buffer.from(JSON.stringify({ date: dateValue, id, total })).toString('base64');
}

function decodeRubberCursor(cursor: string | undefined): { date: string; id: string; total?: number } | null {
    if (!cursor) return null;
    try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
        return RubberCursorSchema.parse(decoded);
    } catch {
        return null;
    }
}

async function resolvePlayerIdentity(
    db: Kysely<Database>,
    requestedId: string,
): Promise<ResolvedPlayerIdentity | null> {
    const result = await sql<{
        canonical_id: string;
        canonical_name: string;
        source_ids: string[];
    }>`
        WITH player_info AS (
            SELECT
                ep.id,
                COALESCE(ep.canonical_player_id, ep.id) AS canonical_id,
                COALESCE(cp.name, ep.name) AS canonical_name
            FROM external_players ep
            LEFT JOIN external_players cp ON cp.id = COALESCE(ep.canonical_player_id, ep.id)
                                      AND cp.deleted_at IS NULL
            WHERE ep.id = ${requestedId}::uuid
              AND ep.deleted_at IS NULL
        )
        SELECT
            pi.canonical_id,
            pi.canonical_name,
            ARRAY_AGG(DISTINCT ep2.id) AS source_ids
        FROM player_info pi
        JOIN external_players ep2 ON COALESCE(ep2.canonical_player_id, ep2.id) = pi.canonical_id
        WHERE ep2.deleted_at IS NULL
        GROUP BY pi.canonical_id, pi.canonical_name
    `.execute(db);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
        canonicalId: row.canonical_id,
        playerName: row.canonical_name,
        sourceIds: row.source_ids,
    };
}

function toEpochMs(value: Date | string | null | undefined): number {
    if (!value) return 0;
    const date = value instanceof Date ? value : new Date(String(value));
    const time = date.getTime();
    return Number.isNaN(time) ? 0 : time;
}

async function readCache<T>(
    db: Kysely<Database>,
    type: string,
    cacheKey: string,
    dataVersion: string,
): Promise<T | null> {
    const cached = await db
        .selectFrom('cache_entries')
        .select(['content', 'source_version', 'expires_at'])
        .where('type', '=', type)
        .where('cache_key', '=', cacheKey)
        .executeTakeFirst();

    if (
        cached
        && toEpochMs(cached.expires_at) > Date.now()
        && cached.source_version === dataVersion
    ) {
        return cached.content as T;
    }
    return null;
}

async function writeCache(
    db: Kysely<Database>,
    type: string,
    cacheKey: string,
    payload: unknown,
    dataVersion: string,
    ttlMs: number = DEFAULT_CACHE_TTL_MS,
): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);
    await db
        .insertInto('cache_entries')
        .values({
            type,
            cache_key: cacheKey,
            content: payload,
            source_version: dataVersion,
            expires_at: expiresAt,
            updated_at: now,
        })
        .onConflict((oc) =>
            oc.columns(['type', 'cache_key']).doUpdateSet({
                content: payload,
                source_version: dataVersion,
                expires_at: expiresAt,
                updated_at: now,
            }),
        )
        .execute();

}

export function playersRoutes(db: Kysely<Database>): FastifyPluginAsync {
    return async function (fastify) {
        const app = fastify.withTypeProvider<ZodTypeProvider>();

        app.get(
            '/count',
            {
                schema: {
                    response: {
                        200: z.object({
                            players: z.number().int(),
                            matches: z.number().int(),
                        }),
                        500: ErrorSchema,
                    },
                },
            },
            async (_request, reply) => {
                const cachedCount = await readCache<{ players: number; matches: number }>(
                    db, PLAYER_COUNT_CACHE_TYPE, 'global', 'v1',
                );
                if (cachedCount) {
                    return reply.send(cachedCount);
                }

                const [playerResult, matchResult] = await Promise.all([
                    db
                        .selectFrom('external_players')
                        .select(sql<number>`COUNT(*)`.as('count'))
                        .where('deleted_at', 'is', null)
                        .executeTakeFirstOrThrow(),
                    db
                        .selectFrom('rubbers')
                        .select(sql<number>`COUNT(*)`.as('count'))
                        .where('deleted_at', 'is', null)
                        .executeTakeFirstOrThrow(),
                ]);

                const payload = {
                    players: Number(playerResult.count),
                    matches: Number(matchResult.count),
                };
                await writeCache(db, PLAYER_COUNT_CACHE_TYPE, 'global', payload, 'v1');
                return reply.send(payload);
            },
        );

        app.get(
            '/leaders',
            {
                schema: {
                    querystring: LeadersQuerySchema,
                    response: {
                        200: z.object({
                            mode: z.enum(['win_pct', 'most_played', 'combined', 'form', 'improving', 'new_faces']),
                            formula: z.string(),
                            min_played: z.number().int(),
                            data: z.array(LeaderItemSchema),
                        }),
                        500: ErrorSchema,
                    },
                },
            },
            async (request, reply) => {
                const { mode, limit, min_played: minPlayed, season_id: seasonId } = request.query;
                const effectiveLimit = mode === 'win_pct' ? Math.max(limit, 10) : limit;
                const leagueIds = (request.query.league_ids ?? '')
                    .split(',')
                    .map((id) => id.trim())
                    .filter((id) => id.length > 0);
                const leagueCsv = leagueIds.join(',');
                const leagueIdArray = uuidArray(leagueIds);

                // Compute data version for leaders cache
                const versionRes = await sql<{ data_version: Date | null }>`
                    SELECT GREATEST(
                        COALESCE((
                            SELECT MAX(updated_at)
                            FROM rubbers
                            WHERE deleted_at IS NULL
                        ), '-infinity'::timestamp),
                        COALESCE((
                            SELECT MAX(updated_at)
                            FROM fixtures
                            WHERE deleted_at IS NULL
                        ), '-infinity'::timestamp),
                        COALESCE((
                            SELECT MAX(updated_at)
                            FROM external_players
                            WHERE deleted_at IS NULL
                        ), '-infinity'::timestamp)
                    ) AS data_version
                `.execute(db);
                const versionRaw = versionRes.rows[0]?.data_version ?? null;
                const dataVersion = versionRaw instanceof Date
                    ? versionRaw.toISOString()
                    : versionRaw ? new Date(String(versionRaw)).toISOString() : 'none';

                const cacheKey = `${mode}:${leagueCsv}:${seasonId ?? 'active'}:${limit}:${minPlayed}`;
                const cachedLeaders = await readCache<any>(db, PLAYER_LEADERS_CACHE_TYPE, cacheKey, dataVersion);
                if (cachedLeaders) {
                    return reply.send(cachedLeaders);
                }

                const leadersRes = await sql<{
                    player_id: string;
                    player_name: string;
                    played: number;
                    wins: number;
                    losses: number;
                    win_rate: number;
                    score: number | null;
                    first_match_date: string | null;
                }>`
                    WITH singles AS (
                        SELECT
                            COALESCE(ep.canonical_player_id, ep.id) AS player_id,
                            CASE WHEN r.home_games_won > r.away_games_won THEN 1 ELSE 0 END AS is_win,
                            COALESCE(f.date_played::timestamp, r.played_at, f.created_at) AS played_at,
                            r.id AS rubber_id
                        FROM rubbers r
                        JOIN external_players ep ON ep.id = r.home_player_1_id
                        JOIN fixtures f ON f.id = r.fixture_id
                        JOIN competitions c ON c.id = f.competition_id
                        JOIN seasons s ON s.id = c.season_id
                        WHERE r.is_doubles = false
                          AND r.deleted_at IS NULL
                          AND r.outcome_type != 'walkover'
                          AND r.home_player_1_id IS NOT NULL
                          AND ep.deleted_at IS NULL
                          AND (
                              (${seasonId ?? null}::uuid IS NULL AND s.is_active = true)
                              OR s.id = ${seasonId ?? null}::uuid
                          )
                          AND (${leagueIds.length} = 0 OR s.league_id = ANY(${leagueIdArray}))

                        UNION ALL

                        SELECT
                            COALESCE(ep.canonical_player_id, ep.id) AS player_id,
                            CASE WHEN r.away_games_won > r.home_games_won THEN 1 ELSE 0 END AS is_win,
                            COALESCE(f.date_played::timestamp, r.played_at, f.created_at) AS played_at,
                            r.id AS rubber_id
                        FROM rubbers r
                        JOIN external_players ep ON ep.id = r.away_player_1_id
                        JOIN fixtures f ON f.id = r.fixture_id
                        JOIN competitions c ON c.id = f.competition_id
                        JOIN seasons s ON s.id = c.season_id
                        WHERE r.is_doubles = false
                          AND r.deleted_at IS NULL
                          AND r.outcome_type != 'walkover'
                          AND r.away_player_1_id IS NOT NULL
                          AND ep.deleted_at IS NULL
                          AND (
                              (${seasonId ?? null}::uuid IS NULL AND s.is_active = true)
                              OR s.id = ${seasonId ?? null}::uuid
                          )
                          AND (${leagueIds.length} = 0 OR s.league_id = ANY(${leagueIdArray}))
                    ),
                    sequenced AS (
                        SELECT
                            player_id,
                            is_win,
                            played_at,
                            ROW_NUMBER() OVER (
                                PARTITION BY player_id
                                ORDER BY played_at DESC, rubber_id DESC
                            ) AS recent_rank
                        FROM singles
                    ),
                    aggregated AS (
                        SELECT
                            player_id,
                            COUNT(*)::int AS played,
                            SUM(is_win)::int AS wins,
                            COUNT(*) FILTER (WHERE recent_rank <= 10)::int AS recent_10_played,
                            SUM(is_win) FILTER (WHERE recent_rank <= 10)::int AS recent_10_wins,
                            COUNT(*) FILTER (WHERE recent_rank <= 5)::int AS recent_5_played,
                            SUM(is_win) FILTER (WHERE recent_rank <= 5)::int AS recent_5_wins,
                            COUNT(*) FILTER (WHERE recent_rank BETWEEN 6 AND 10)::int AS previous_5_played,
                            SUM(is_win) FILTER (WHERE recent_rank BETWEEN 6 AND 10)::int AS previous_5_wins,
                            MIN(played_at)::date AS first_match_date
                        FROM sequenced
                        GROUP BY player_id
                    ),
                    ranked AS (
                        SELECT
                            canonical_ep.id AS player_id,
                            canonical_ep.name AS player_name,
                            a.played AS season_played,
                            a.wins AS season_wins,
                            a.recent_10_played,
                            a.recent_10_wins,
                            a.recent_5_played,
                            a.recent_5_wins,
                            a.previous_5_played,
                            a.previous_5_wins,
                            a.first_match_date,
                            ROUND((a.wins::numeric / NULLIF(a.played, 0)) * 100, 2)::float8 AS season_win_rate,
                            ROUND((a.recent_10_wins::numeric / NULLIF(a.recent_10_played, 0)) * 100, 2)::float8 AS recent_10_win_rate,
                            ROUND((a.recent_5_wins::numeric / NULLIF(a.recent_5_played, 0)) * 100, 2)::float8 AS recent_5_win_rate,
                            ROUND((
                                (a.recent_5_wins::numeric / NULLIF(a.recent_5_played, 0))
                                - (a.previous_5_wins::numeric / NULLIF(a.previous_5_played, 0))
                            ) * 100, 2)::float8 AS improvement_score,
                            ROUND((
                                (
                                    ((a.wins::numeric / NULLIF(a.played, 0)) * 100) * 0.7
                                    + (LEAST(a.played, 30)::numeric / 30) * 100 * 0.3
                                ) * 100
                            )) / 100::numeric AS combined_score
                        FROM aggregated a
                        JOIN external_players canonical_ep ON canonical_ep.id = a.player_id
                        WHERE canonical_ep.deleted_at IS NULL
                    )
                    SELECT
                        player_id,
                        player_name,
                        CASE
                            WHEN ${mode} = 'form' THEN recent_10_played
                            WHEN ${mode} = 'improving' THEN recent_5_played
                            ELSE season_played
                        END::int AS played,
                        CASE
                            WHEN ${mode} = 'form' THEN recent_10_wins
                            WHEN ${mode} = 'improving' THEN recent_5_wins
                            ELSE season_wins
                        END::int AS wins,
                        CASE
                            WHEN ${mode} = 'form' THEN recent_10_played - recent_10_wins
                            WHEN ${mode} = 'improving' THEN recent_5_played - recent_5_wins
                            ELSE season_played - season_wins
                        END::int AS losses,
                        CASE
                            WHEN ${mode} = 'form' THEN recent_10_win_rate
                            WHEN ${mode} = 'improving' THEN recent_5_win_rate
                            ELSE season_win_rate
                        END::float8 AS win_rate,
                        CASE
                            WHEN ${mode} = 'combined' THEN combined_score::float8
                            WHEN ${mode} = 'improving' THEN improvement_score
                            ELSE NULL
                        END AS score,
                        TO_CHAR(first_match_date, 'YYYY-MM-DD') AS first_match_date
                    FROM ranked
                    WHERE
                        ${mode} = 'most_played'
                        OR (${mode} IN ('combined', 'win_pct') AND season_played >= ${minPlayed})
                        OR (${mode} = 'form' AND recent_10_played >= ${minPlayed})
                        OR (
                            ${mode} = 'improving'
                            AND recent_5_played = 5
                            AND previous_5_played = 5
                            AND improvement_score > 0
                        )
                        OR ${mode} = 'new_faces'
                    ORDER BY
                        CASE WHEN ${mode} = 'combined' THEN combined_score END DESC NULLS LAST,
                        CASE WHEN ${mode} = 'win_pct' THEN season_win_rate END DESC NULLS LAST,
                        CASE WHEN ${mode} = 'most_played' THEN season_played END DESC NULLS LAST,
                        CASE WHEN ${mode} = 'form' THEN recent_10_win_rate END DESC NULLS LAST,
                        CASE WHEN ${mode} = 'improving' THEN improvement_score END DESC NULLS LAST,
                        CASE WHEN ${mode} = 'new_faces' THEN first_match_date END DESC NULLS LAST,
                        season_played DESC,
                        season_wins DESC,
                        CASE WHEN ${mode} = 'most_played' THEN season_win_rate END DESC NULLS LAST,
                        player_name ASC
                    LIMIT ${effectiveLimit}
                `.execute(db);

                const data = leadersRes.rows.map((row, index) => ({
                    rank: index + 1,
                    player_id: row.player_id,
                    player_name: row.player_name,
                    played: Number(row.played),
                    wins: Number(row.wins),
                    losses: Number(row.losses),
                    win_rate: Number(row.win_rate),
                    score: row.score === null ? null : Number(row.score),
                    first_match_date: row.first_match_date,
                }));

                let formula = 'Ranked by combined score: 70% win rate + 30% match volume (capped at 30 matches).';

                if (mode === 'win_pct') {
                    formula = `Ranked by win rate, minimum ${minPlayed} matches, tie-breakers: played then wins.`;
                } else if (mode === 'most_played') {
                    formula = 'Ranked by matches played, tie-breakers: wins then win rate.';
                } else if (mode === 'form') {
                    formula = `Ranked by win rate across each player's latest 10 singles, minimum ${minPlayed} recent matches.`;
                } else if (mode === 'improving') {
                    formula = 'Ranked by win-rate change from the previous 5 singles to the latest 5 singles.';
                } else if (mode === 'new_faces') {
                    formula = 'Ranked by most recent first singles appearance in the selected active-season scope.';
                }

                const payload = {
                    mode,
                    formula,
                    min_played: minPlayed,
                    data,
                };
                await writeCache(db, PLAYER_LEADERS_CACHE_TYPE, cacheKey, payload, dataVersion);
                return reply.send(payload);
            },
        );

        app.get(
            '/search',
            {
                schema: {
                    querystring: SearchQuerySchema,
                    response: {
                        200: SearchResponseSchema,
                        500: ErrorSchema,
                    },
                },
            },
            async (request, reply) => {
                const normalizedQuery = request.query.q?.trim() ?? '';
                const leagueIds = (request.query.league_ids ?? '')
                    .split(',')
                    .map((id) => id.trim())
                    .filter(Boolean);
                const savedIds = (request.query.saved_ids ?? '')
                    .split(',')
                    .map((id) => id.trim())
                    .filter(Boolean);
                const { limit, offset } = request.query;
                const leagueIdArray = uuidArray(leagueIds);
                const savedIdArray = uuidArray(savedIds);
                const searchPattern = `%${normalizedQuery}%`;
                const requireActivity = normalizedQuery.length === 0 || leagueIds.length > 0;
                const recentOnly = normalizedQuery.length === 0 && savedIds.length === 0;

                // The active global name-search path pages candidates before touching rubbers.
                // Legacy blank/saved/league requests retain their existing ordering semantics below.
                const executeSearch = () => {
                    if (normalizedQuery.length > 0 && leagueIds.length === 0) {
                        return sql<{
                            id: string;
                            name: string;
                            played: number | string;
                            wins: number | string;
                            total: number | string;
                        }>`
                            WITH matching_players AS (
                                SELECT cp.id, cp.name
                                FROM external_players ep
                                JOIN external_players cp ON cp.id = COALESCE(ep.canonical_player_id, ep.id)
                                WHERE ep.deleted_at IS NULL
                                  AND cp.deleted_at IS NULL
                                  AND ep.name ILIKE ${searchPattern}
                                  AND (${savedIds.length} = 0 OR cp.id = ANY(${savedIdArray}))
                                GROUP BY cp.id, cp.name
                            ),
                            paged_players AS MATERIALIZED (
                                SELECT id, name, COUNT(*) OVER()::int AS total
                                FROM matching_players
                                ORDER BY name ASC, id ASC
                                LIMIT ${limit}
                                OFFSET ${offset}
                            ),
                            source_players AS MATERIALIZED (
                                SELECT
                                    pp.id AS player_id,
                                    ep.id AS source_player_id
                                FROM paged_players pp
                                JOIN external_players ep
                                  ON COALESCE(ep.canonical_player_id, ep.id) = pp.id
                                WHERE ep.deleted_at IS NULL
                            ),
                            player_matches AS (
                                SELECT
                                    sp.player_id,
                                    CASE WHEN r.home_games_won > r.away_games_won THEN 1 ELSE 0 END AS win
                                FROM source_players sp
                                JOIN rubbers r ON r.home_player_1_id = sp.source_player_id
                                JOIN fixtures f ON f.id = r.fixture_id
                                JOIN competitions c ON c.id = f.competition_id
                                JOIN seasons s ON s.id = c.season_id
                                WHERE r.is_doubles = false
                                  AND r.deleted_at IS NULL
                                  AND r.outcome_type != 'walkover'
                                  AND r.home_player_1_id IS NOT NULL
                                  AND f.deleted_at IS NULL
                                  AND c.deleted_at IS NULL
                                  AND s.deleted_at IS NULL

                                UNION ALL

                                SELECT
                                    sp.player_id,
                                    CASE WHEN r.away_games_won > r.home_games_won THEN 1 ELSE 0 END AS win
                                FROM source_players sp
                                JOIN rubbers r ON r.away_player_1_id = sp.source_player_id
                                JOIN fixtures f ON f.id = r.fixture_id
                                JOIN competitions c ON c.id = f.competition_id
                                JOIN seasons s ON s.id = c.season_id
                                WHERE r.is_doubles = false
                                  AND r.deleted_at IS NULL
                                  AND r.outcome_type != 'walkover'
                                  AND r.away_player_1_id IS NOT NULL
                                  AND f.deleted_at IS NULL
                                  AND c.deleted_at IS NULL
                                  AND s.deleted_at IS NULL
                            ),
                            player_stats AS (
                                SELECT
                                    player_id,
                                    COUNT(*)::int AS played,
                                    COALESCE(SUM(win), 0)::int AS wins
                                FROM player_matches
                                GROUP BY player_id
                            )
                            SELECT
                                pp.id,
                                pp.name,
                                COALESCE(ps.played, 0)::int AS played,
                                COALESCE(ps.wins, 0)::int AS wins,
                                pp.total
                            FROM paged_players pp
                            LEFT JOIN player_stats ps ON ps.player_id = pp.id
                            ORDER BY pp.name ASC, pp.id ASC
                        `.execute(db);
                    }

                    return sql<{
                        id: string;
                        name: string;
                        played: number | string;
                        wins: number | string;
                        total: number | string;
                    }>`
                        WITH canonical_players AS (
                            SELECT cp.id, cp.name
                            FROM external_players ep
                            JOIN external_players cp ON cp.id = COALESCE(ep.canonical_player_id, ep.id)
                            WHERE ep.deleted_at IS NULL
                              AND cp.deleted_at IS NULL
                              AND (${normalizedQuery} = '' OR ep.name ILIKE ${searchPattern})
                              AND (${savedIds.length} = 0 OR cp.id = ANY(${savedIdArray}))
                            GROUP BY cp.id, cp.name
                        ),
                        player_matches AS (
                            SELECT
                                COALESCE(ep.canonical_player_id, ep.id) AS player_id,
                                CASE WHEN r.home_games_won > r.away_games_won THEN 1 ELSE 0 END AS win
                            FROM rubbers r
                            JOIN external_players ep ON ep.id = r.home_player_1_id
                            JOIN fixtures f ON f.id = r.fixture_id
                            JOIN competitions c ON c.id = f.competition_id
                            JOIN seasons s ON s.id = c.season_id
                            WHERE r.is_doubles = false
                              AND r.deleted_at IS NULL
                              AND r.outcome_type != 'walkover'
                              AND ep.deleted_at IS NULL
                              AND f.deleted_at IS NULL
                              AND c.deleted_at IS NULL
                              AND s.deleted_at IS NULL
                              AND (${leagueIds.length} = 0 OR s.league_id = ANY(${leagueIdArray}))
                              AND (${recentOnly} = false OR f.date_played >= NOW() - INTERVAL '100 days')

                            UNION ALL

                            SELECT
                                COALESCE(ep.canonical_player_id, ep.id) AS player_id,
                                CASE WHEN r.away_games_won > r.home_games_won THEN 1 ELSE 0 END AS win
                            FROM rubbers r
                            JOIN external_players ep ON ep.id = r.away_player_1_id
                            JOIN fixtures f ON f.id = r.fixture_id
                            JOIN competitions c ON c.id = f.competition_id
                            JOIN seasons s ON s.id = c.season_id
                            WHERE r.is_doubles = false
                              AND r.deleted_at IS NULL
                              AND r.outcome_type != 'walkover'
                              AND ep.deleted_at IS NULL
                              AND f.deleted_at IS NULL
                              AND c.deleted_at IS NULL
                              AND s.deleted_at IS NULL
                              AND (${leagueIds.length} = 0 OR s.league_id = ANY(${leagueIdArray}))
                              AND (${recentOnly} = false OR f.date_played >= NOW() - INTERVAL '100 days')
                        ),
                        player_stats AS (
                            SELECT player_id, COUNT(*)::int AS played, COALESCE(SUM(win), 0)::int AS wins
                            FROM player_matches
                            GROUP BY player_id
                        ),
                        filtered AS (
                            SELECT
                                cp.id,
                                cp.name,
                                COALESCE(ps.played, 0)::int AS played,
                                COALESCE(ps.wins, 0)::int AS wins
                            FROM canonical_players cp
                            LEFT JOIN player_stats ps ON ps.player_id = cp.id
                            WHERE (${requireActivity} = false OR COALESCE(ps.played, 0) > 0)
                        )
                        SELECT id, name, played, wins, COUNT(*) OVER()::int AS total
                        FROM filtered
                        ORDER BY
                            CASE WHEN ${recentOnly} THEN played END DESC NULLS LAST,
                            CASE WHEN ${recentOnly} THEN wins END DESC NULLS LAST,
                            name ASC,
                            id ASC
                        LIMIT ${limit}
                        OFFSET ${offset}
                    `.execute(db);
                };

                const result = await executeSearch();
                const data = result.rows.map((row) => ({
                    id: row.id,
                    name: row.name,
                    played: Number(row.played),
                    wins: Number(row.wins),
                }));
                const total = result.rows.length > 0 ? Number(result.rows[0]!.total) : 0;

                return reply.send({
                    data,
                    total,
                    limit,
                    offset,
                    has_more: offset + data.length < total,
                });
            },
        );

        app.get(
            '/:id/stats',
            {
                schema: {
                    params: ParamsSchema,
                    response: {
                        200: ResponseSchema,
                        404: ErrorSchema,
                        500: ErrorSchema,
                    },
                },
            },
            async (request, reply) => {
                const { id } = request.params;

                const player = await resolvePlayerIdentity(db, id);

                if (!player) {
                    return reply.status(404).send({
                        error: `Player ${id} not found`,
                        statusCode: 404,
                    });
                }

                const sourceIds = uuidArray(player.sourceIds);

                // Aggregate wins/losses, excluding walkovers
                // A rubber is a win for the player if:
                //   - player source is home AND home_games_won > away_games_won
                //   - player source is away AND away_games_won > home_games_won
                const { wins, losses, total } = await db
                    .selectFrom('rubbers')
                    .select([
                        sql<number>`
                            COUNT(*) FILTER (
                                WHERE (home_player_1_id = ANY(${sourceIds}) AND home_games_won > away_games_won)
                                   OR (away_player_1_id = ANY(${sourceIds}) AND away_games_won > home_games_won)
                            )
                        `.as('wins'),
                        sql<number>`
                            COUNT(*) FILTER (
                                WHERE (home_player_1_id = ANY(${sourceIds}) AND home_games_won < away_games_won)
                                   OR (away_player_1_id = ANY(${sourceIds}) AND away_games_won < home_games_won)
                            )
                        `.as('losses'),
                        sql<number>`COUNT(*)`.as('total'),
                    ])
                    .where((eb) =>
                        eb.or([
                            eb('home_player_1_id', 'in', player.sourceIds),
                            eb('away_player_1_id', 'in', player.sourceIds),
                        ])
                    )
                    .where('outcome_type', '!=', 'walkover')
                    .where('deleted_at', 'is', null)
                    .executeTakeFirstOrThrow();

                return reply.send({
                    player_id: player.canonicalId,
                    player_name: player.playerName,
                    wins: Number(wins),
                    losses: Number(losses),
                    total: Number(total),
                });
            },
        );

        app.get(
            '/:id/stats/extended',
            {
                schema: {
                    params: ParamsSchema,
                    response: {
                        200: ExtendedResponseSchema,
                        404: ErrorSchema,
                        500: ErrorSchema,
                    },
                },
            },
            async (request, reply) => {
                const { id } = request.params;

                const player = await resolvePlayerIdentity(db, id);

                if (!player) {
                    return reply.status(404).send({ error: `Player ${id} not found`, statusCode: 404 });
                }

                const sourceIds = uuidArray(player.sourceIds);

                // Compute data version for extended stats cache
                const extVersionRes = await sql<{ data_version: Date | null }>`
                    SELECT GREATEST(
                        COALESCE((
                            SELECT MAX(GREATEST(r.updated_at, f.updated_at))
                            FROM rubbers r
                            JOIN fixtures f ON f.id = r.fixture_id
                            JOIN competitions c ON c.id = f.competition_id
                            JOIN seasons s ON s.id = c.season_id
                            JOIN leagues l ON l.id = s.league_id
                            WHERE (r.home_player_1_id = ANY(${sourceIds}) OR r.away_player_1_id = ANY(${sourceIds})
                                   OR r.home_player_2_id = ANY(${sourceIds}) OR r.away_player_2_id = ANY(${sourceIds}))
                              AND r.deleted_at IS NULL
                              AND r.outcome_type != 'walkover'
                        ), '-infinity'::timestamp),
                        COALESCE((
                            SELECT MAX(updated_at)
                            FROM external_players
                            WHERE id = ANY(${sourceIds})
                               OR COALESCE(canonical_player_id, id) = ${player.canonicalId}::uuid
                        ), '-infinity'::timestamp)
                    ) AS data_version
                `.execute(db);
                const extVersionRaw = extVersionRes.rows[0]?.data_version ?? null;
                const extDataVersion = extVersionRaw instanceof Date
                    ? extVersionRaw.toISOString()
                    : extVersionRaw ? new Date(String(extVersionRaw)).toISOString() : 'none';

                const PLAYER_EXTENDED_CACHE_TYPE = 'player-extended';
                const cachedExtended = await readCache<any>(db, PLAYER_EXTENDED_CACHE_TYPE, player.canonicalId, extDataVersion);
                if (cachedExtended) {
                    return reply.send(cachedExtended);
                }

                // All 5 queries are independent — run in parallel
                const [
                    { wins, losses, total },
                    nemesisRes,
                    duoRes,
                    streakRes,
                ] = await Promise.all([
                    // 0. Win/loss totals
                    db
                        .selectFrom('rubbers')
                        .select([
                            sql<number>`COUNT(*) FILTER (WHERE (home_player_1_id = ANY(${sourceIds}) AND home_games_won > away_games_won) OR (away_player_1_id = ANY(${sourceIds}) AND away_games_won > home_games_won))`.as('wins'),
                            sql<number>`COUNT(*) FILTER (WHERE (home_player_1_id = ANY(${sourceIds}) AND home_games_won < away_games_won) OR (away_player_1_id = ANY(${sourceIds}) AND away_games_won < home_games_won))`.as('losses'),
                            sql<number>`COUNT(*)`.as('total'),
                        ])
                        .where((eb) => eb.or([eb('home_player_1_id', 'in', player.sourceIds), eb('away_player_1_id', 'in', player.sourceIds)]))
                        .where('outcome_type', '!=', 'walkover')
                        .where('deleted_at', 'is', null)
                        .executeTakeFirstOrThrow(),

                    // 1. Nemesis query
                    sql<{
                        opponent_id: string;
                        opponent_name: string;
                        losses: number;
                        wins: number;
                    }>`
                        WITH opponents AS (
                            SELECT
                                CASE WHEN home_player_1_id = ANY(${sourceIds}) THEN away_player_1_id ELSE home_player_1_id END as opp_id,
                                CASE WHEN (home_player_1_id = ANY(${sourceIds}) AND home_games_won < away_games_won) OR (away_player_1_id = ANY(${sourceIds}) AND away_games_won < home_games_won) THEN 1 ELSE 0 END as is_loss,
                                CASE WHEN (home_player_1_id = ANY(${sourceIds}) AND home_games_won > away_games_won) OR (away_player_1_id = ANY(${sourceIds}) AND away_games_won > home_games_won) THEN 1 ELSE 0 END as is_win
                            FROM rubbers
                            WHERE (home_player_1_id = ANY(${sourceIds}) OR away_player_1_id = ANY(${sourceIds})) AND is_doubles = false AND deleted_at IS NULL AND outcome_type != 'walkover'
                        )
                        SELECT COALESCE(ep.canonical_player_id, ep.id) as opponent_id, COALESCE(cp.name, ep.name) as opponent_name, SUM(is_loss) as losses, SUM(is_win) as wins
                        FROM opponents o
                        JOIN external_players ep ON ep.id = o.opp_id
                        LEFT JOIN external_players cp ON cp.id = COALESCE(ep.canonical_player_id, ep.id)
                        GROUP BY COALESCE(ep.canonical_player_id, ep.id), COALESCE(cp.name, ep.name)
                        HAVING SUM(is_loss) > 0
                        ORDER BY SUM(is_loss) DESC, SUM(is_win) ASC
                        LIMIT 1
                    `.execute(db),

                    // 2. Duo query
                    sql<{ partner_name: string, wins: number, total: number }>`
                        WITH partners AS (
                            SELECT
                                CASE
                                    WHEN home_player_1_id = ANY(${sourceIds}) THEN home_player_2_id
                                    WHEN home_player_2_id = ANY(${sourceIds}) THEN home_player_1_id
                                    WHEN away_player_1_id = ANY(${sourceIds}) THEN away_player_2_id
                                    ELSE away_player_1_id
                                END as partner_id,
                                CASE WHEN (home_player_1_id = ANY(${sourceIds}) OR home_player_2_id = ANY(${sourceIds})) AND home_games_won > away_games_won THEN 1
                                     WHEN (away_player_1_id = ANY(${sourceIds}) OR away_player_2_id = ANY(${sourceIds})) AND away_games_won > home_games_won THEN 1 ELSE 0 END as is_win
                            FROM rubbers
                            WHERE (home_player_1_id = ANY(${sourceIds}) OR home_player_2_id = ANY(${sourceIds}) OR away_player_1_id = ANY(${sourceIds}) OR away_player_2_id = ANY(${sourceIds}))
                              AND is_doubles = true AND deleted_at IS NULL AND outcome_type != 'walkover'
                        )
                        SELECT COALESCE(cp.name, ep.name) as partner_name, SUM(is_win) as wins, COUNT(*) as total
                        FROM partners p
                        JOIN external_players ep ON ep.id = p.partner_id
                        LEFT JOIN external_players cp ON cp.id = COALESCE(ep.canonical_player_id, ep.id)
                        WHERE p.partner_id IS NOT NULL
                        GROUP BY COALESCE(ep.canonical_player_id, ep.id), COALESCE(cp.name, ep.name)
                        HAVING SUM(is_win) > 0
                        ORDER BY SUM(is_win) DESC
                        LIMIT 1
                    `.execute(db),

                    // 3. Streak
                    sql<{ result: string }>`
                        SELECT
                            CASE
                                WHEN (home_player_1_id = ANY(${sourceIds}) AND home_games_won > away_games_won) OR (away_player_1_id = ANY(${sourceIds}) AND away_games_won > home_games_won) THEN 'W'
                                ELSE 'L'
                            END as result
                        FROM rubbers
                        JOIN fixtures ON fixtures.id = rubbers.fixture_id
                        WHERE (home_player_1_id = ANY(${sourceIds}) OR away_player_1_id = ANY(${sourceIds}))
                          AND is_doubles = false AND rubbers.deleted_at IS NULL AND outcome_type != 'walkover'
                        ORDER BY fixtures.date_played DESC
                        LIMIT 10
                    `.execute(db),

                ]);

                // calculate streak string
                let streakStr = 'None';
                if (streakRes.rows.length > 0) {
                    const currentType = streakRes.rows[0].result;
                    let count = 0;
                    for (const row of streakRes.rows) {
                        if (row.result === currentType) count++;
                        else break;
                    }
                    streakStr = `${currentType}${count}`;
                }

                let nemesisStr = 'None';
                let nemesisId: string | null = null;
                if (nemesisRes.rows.length > 0) {
                    const r = nemesisRes.rows[0];
                    nemesisId = r.opponent_id;
                    nemesisStr = `${r.opponent_name} (${r.wins}W-${r.losses}L)`;
                }

                let duoStr = 'None';
                if (duoRes.rows.length > 0) {
                    const r = duoRes.rows[0];
                    const wr = Math.round((Number(r.wins) / Number(r.total)) * 100);
                    duoStr = `${r.partner_name} (${wr}% WR)`;
                }


                const payload = {
                    player_id: player.canonicalId,
                    player_name: player.playerName,
                    wins: Number(wins),
                    losses: Number(losses),
                    total: Number(total),
                    nemesis_id: nemesisId,
                    nemesis: nemesisStr,
                    duo: duoStr,
                    streak: streakStr,
                };
                await writeCache(db, PLAYER_EXTENDED_CACHE_TYPE, player.canonicalId, payload, extDataVersion);
                return reply.send(payload);
            }
        );

        app.get(
            '/:id/insights',
            {
                schema: {
                    params: ParamsSchema,
                    response: {
                        200: PlayerInsightsResponseSchema,
                        404: ErrorSchema,
                        500: ErrorSchema,
                    },
                },
            },
            async (request, reply) => {
                const { id } = request.params;

                const player = await resolvePlayerIdentity(db, id);

                if (!player) {
                    return reply.status(404).send({
                        error: `Player ${id} not found`,
                        statusCode: 404,
                    });
                }

                const sourceIds = uuidArray(player.sourceIds);

                const dataVersionRes = await sql<{ data_version: Date | null }>`
                    SELECT GREATEST(
                        COALESCE((
                            SELECT MAX(GREATEST(r.updated_at, f.updated_at))
                            FROM rubbers r
                            JOIN fixtures f ON f.id = r.fixture_id
                            JOIN competitions c ON c.id = f.competition_id
                            JOIN seasons s ON s.id = c.season_id
                            JOIN leagues l ON l.id = s.league_id
                            WHERE (
                                r.home_player_1_id = ANY(${sourceIds})
                                OR r.away_player_1_id = ANY(${sourceIds})
                                OR r.home_player_2_id = ANY(${sourceIds})
                                OR r.away_player_2_id = ANY(${sourceIds})
                            )
                              AND r.deleted_at IS NULL
                              AND r.outcome_type != 'walkover'
                        ), '-infinity'::timestamp),
                        COALESCE((
                            SELECT MAX(updated_at)
                            FROM external_players
                            WHERE id = ANY(${sourceIds})
                               OR COALESCE(canonical_player_id, id) = ${player.canonicalId}::uuid
                        ), '-infinity'::timestamp)
                    ) AS data_version
                `.execute(db);

                const versionRaw = dataVersionRes.rows[0]?.data_version ?? null;
                const dataVersion = versionRaw instanceof Date
                    ? versionRaw.toISOString()
                    : versionRaw
                        ? new Date(String(versionRaw)).toISOString()
                        : 'none';

                const cachedInsights = await readCache<any>(db, PLAYER_INSIGHTS_CACHE_TYPE, player.canonicalId, dataVersion);
                if (cachedInsights) {
                    return reply.send(cachedInsights);
                }

                const singlesRes = await sql<{
                    played_at: Date;
                    league_name: string;
                    division_name: string;
                    opponent_id: string | null;
                    opponent_name: string | null;
                    player_games: number;
                    opponent_games: number;
                    is_win: number;
                    is_home: number;
                    score_source: string;
                    season_is_active: boolean;
                }>`
                    SELECT
                        COALESCE(f.date_played::timestamp, f.created_at) AS played_at,
                        l.name AS league_name,
                        c.name AS division_name,
                        COALESCE(opp_ep.canonical_player_id, opp_ep.id) AS opponent_id,
                        COALESCE(opp_cp.name, opp_ep.name) AS opponent_name,
                        CASE WHEN r.home_player_1_id = ANY(${sourceIds}) THEN r.home_games_won ELSE r.away_games_won END AS player_games,
                        CASE WHEN r.home_player_1_id = ANY(${sourceIds}) THEN r.away_games_won ELSE r.home_games_won END AS opponent_games,
                        r.score_source,
                        CASE
                            WHEN (r.home_player_1_id = ANY(${sourceIds}) AND r.home_games_won > r.away_games_won)
                              OR (r.away_player_1_id = ANY(${sourceIds}) AND r.away_games_won > r.home_games_won)
                            THEN 1 ELSE 0
                        END AS is_win,
                        CASE WHEN r.home_player_1_id = ANY(${sourceIds}) THEN 1 ELSE 0 END AS is_home,
                        s.is_active AS season_is_active
                    FROM rubbers r
                    JOIN fixtures f ON f.id = r.fixture_id
                    JOIN competitions c ON c.id = f.competition_id
                    JOIN seasons s ON s.id = c.season_id
                    JOIN leagues l ON l.id = s.league_id
                    LEFT JOIN external_players opp_ep
                      ON opp_ep.id = CASE
                          WHEN r.home_player_1_id = ANY(${sourceIds}) THEN r.away_player_1_id
                          ELSE r.home_player_1_id
                      END
                    LEFT JOIN external_players opp_cp ON opp_cp.id = COALESCE(opp_ep.canonical_player_id, opp_ep.id)
                    WHERE (r.home_player_1_id = ANY(${sourceIds}) OR r.away_player_1_id = ANY(${sourceIds}))
                      AND r.is_doubles = false
                      AND r.deleted_at IS NULL
                      AND r.outcome_type != 'walkover'
                      AND f.deleted_at IS NULL
                      AND c.deleted_at IS NULL
                      AND s.deleted_at IS NULL
                      AND l.deleted_at IS NULL
                    ORDER BY COALESCE(f.date_played::timestamp, f.created_at) ASC, r.id ASC
                `.execute(db);

                const doublesRes = await sql<{
                    is_win: number;
                }>`
                    SELECT
                        CASE
                            WHEN (
                                (r.home_player_1_id = ANY(${sourceIds}) OR r.home_player_2_id = ANY(${sourceIds}))
                                AND r.home_games_won > r.away_games_won
                            ) OR (
                                (r.away_player_1_id = ANY(${sourceIds}) OR r.away_player_2_id = ANY(${sourceIds}))
                                AND r.away_games_won > r.home_games_won
                            )
                            THEN 1 ELSE 0
                        END AS is_win
                    FROM rubbers r
                    JOIN fixtures f ON f.id = r.fixture_id
                    WHERE (
                        r.home_player_1_id = ANY(${sourceIds})
                        OR r.home_player_2_id = ANY(${sourceIds})
                        OR r.away_player_1_id = ANY(${sourceIds})
                        OR r.away_player_2_id = ANY(${sourceIds})
                    )
                      AND r.is_doubles = true
                      AND r.deleted_at IS NULL
                      AND r.outcome_type != 'walkover'
                      AND f.deleted_at IS NULL
                `.execute(db);

                const singles = singlesRes.rows
                    .map((row) => {
                        const date = row.played_at instanceof Date
                            ? row.played_at
                            : new Date(String(row.played_at));
                        if (Number.isNaN(date.getTime())) return null;
                        const year = date.getUTCFullYear();
                        const month = date.toISOString().slice(0, 7);
                        return {
                            date,
                            year,
                            month,
                            league: row.league_name,
                            division: row.division_name,
                            opponentId: row.opponent_id,
                            opponentName: row.opponent_name ?? 'Unknown',
                            playerGames: Number(row.player_games),
                            opponentGames: Number(row.opponent_games),
                            scoreSource: row.score_source,
                            isWin: Number(row.is_win) === 1,
                            isHome: Number(row.is_home) === 1,
                            seasonIsActive: row.season_is_active,
                        };
                    })
                    .filter((row): row is NonNullable<typeof row> => row !== null);

                const totalMatches = singles.length;
                const firstMatchDate = totalMatches > 0 ? singles[0]!.date.toISOString().slice(0, 10) : null;
                const latestMatchDate = totalMatches > 0 ? singles[totalMatches - 1]!.date.toISOString().slice(0, 10) : null;

                const yearsSet = new Set<number>();
                const byYearMap = new Map<number, { played: number; wins: number }>();
                const byMonthMap = new Map<string, { played: number; wins: number }>();
                const byLeagueMap = new Map<string, { played: number; wins: number }>();
                const byDivisionMap = new Map<string, { played: number; wins: number }>();
                const scorePatternMap = new Map<string, number>();
                const rivalMap = new Map<string, {
                    opponent_id: string;
                    opponent_name: string;
                    played: number;
                    wins: number;
                    losses: number;
                    results: boolean[];
                }>();

                let homePlayed = 0;
                let homeWins = 0;
                let awayPlayed = 0;
                let awayWins = 0;
                let longestWinStreak = 0;
                let currentWinStreak = 0;

                for (const row of singles) {
                    yearsSet.add(row.year);

                    const yearAgg = byYearMap.get(row.year) ?? { played: 0, wins: 0 };
                    yearAgg.played += 1;
                    if (row.isWin) yearAgg.wins += 1;
                    byYearMap.set(row.year, yearAgg);

                    const monthAgg = byMonthMap.get(row.month) ?? { played: 0, wins: 0 };
                    monthAgg.played += 1;
                    if (row.isWin) monthAgg.wins += 1;
                    byMonthMap.set(row.month, monthAgg);

                    const leagueAgg = byLeagueMap.get(row.league) ?? { played: 0, wins: 0 };
                    leagueAgg.played += 1;
                    if (row.isWin) leagueAgg.wins += 1;
                    byLeagueMap.set(row.league, leagueAgg);

                    const divisionAgg = byDivisionMap.get(row.division) ?? { played: 0, wins: 0 };
                    divisionAgg.played += 1;
                    if (row.isWin) divisionAgg.wins += 1;
                    byDivisionMap.set(row.division, divisionAgg);

                    if (row.scoreSource === 'games') {
                        const score = `${row.playerGames}-${row.opponentGames}`;
                        scorePatternMap.set(score, (scorePatternMap.get(score) ?? 0) + 1);
                    }

                    if (row.isHome) {
                        homePlayed += 1;
                        if (row.isWin) homeWins += 1;
                    } else {
                        awayPlayed += 1;
                        if (row.isWin) awayWins += 1;
                    }

                    if (row.isWin) {
                        currentWinStreak += 1;
                        if (currentWinStreak > longestWinStreak) {
                            longestWinStreak = currentWinStreak;
                        }
                    } else {
                        currentWinStreak = 0;
                    }

                    if (!row.opponentId) continue;
                    const rival = rivalMap.get(row.opponentId) ?? {
                        opponent_id: row.opponentId,
                        opponent_name: row.opponentName,
                        played: 0,
                        wins: 0,
                        losses: 0,
                        results: [],
                    };
                    rival.played += 1;
                    if (row.isWin) rival.wins += 1;
                    else rival.losses += 1;
                    rival.results.push(row.isWin);
                    rivalMap.set(row.opponentId, rival);
                }

                const careerByYear = Array.from(byYearMap.entries())
                    .sort((a, b) => a[0] - b[0])
                    .map(([year, agg]) => ({
                        year,
                        played: agg.played,
                        wins: agg.wins,
                        losses: agg.played - agg.wins,
                        win_rate: agg.played > 0 ? Math.round((agg.wins / agg.played) * 100) : 0,
                    }));

                const seasonsForPeak = careerByYear.filter((item) => item.played >= 5);
                const bestSeasonSource = (seasonsForPeak.length > 0 ? seasonsForPeak : careerByYear)
                    .slice()
                    .sort((a, b) => b.win_rate - a.win_rate || b.played - a.played)[0] ?? null;

                const mostActiveSeason = careerByYear
                    .slice()
                    .sort((a, b) => b.played - a.played || b.win_rate - a.win_rate)[0] ?? null;

                const monthRows = Array.from(byMonthMap.entries()).map(([month, agg]) => ({
                    month,
                    played: agg.played,
                    win_rate: agg.played > 0 ? Math.round((agg.wins / agg.played) * 100) : 0,
                }));
                const monthsForPeak = monthRows.filter((item) => item.played >= 3);
                const bestMonth = monthsForPeak
                    .slice()
                    .sort((a, b) => b.win_rate - a.win_rate || b.played - a.played)[0] ?? null;
                const worstMonth = monthsForPeak
                    .slice()
                    .sort((a, b) => a.win_rate - b.win_rate || b.played - a.played)[0] ?? null;

                const rivals = Array.from(rivalMap.values()).map((item) => ({
                    ...item,
                    win_rate: item.played > 0 ? Math.round((item.wins / item.played) * 100) : 0,
                }));

                const toughest = rivals
                    .filter((item) => item.played >= 3)
                    .slice()
                    .sort((a, b) => a.win_rate - b.win_rate || b.played - a.played)[0] ?? null;
                const easiest = rivals
                    .filter((item) => item.played >= 3)
                    .slice()
                    .sort((a, b) => b.win_rate - a.win_rate || b.played - a.played)[0] ?? null;

                const improvingCandidates = Array.from(rivalMap.values())
                    .filter((item) => item.results.length >= 4)
                    .map((item) => {
                        const half = Math.floor(item.results.length / 2);
                        const firstHalf = item.results.slice(0, half);
                        const secondHalf = item.results.slice(half);
                        const firstWinRate = firstHalf.length > 0
                            ? Math.round((firstHalf.filter(Boolean).length / firstHalf.length) * 100)
                            : 0;
                        const secondWinRate = secondHalf.length > 0
                            ? Math.round((secondHalf.filter(Boolean).length / secondHalf.length) * 100)
                            : 0;
                        return {
                            opponent_id: item.opponent_id,
                            opponent_name: item.opponent_name,
                            first_half_win_rate: firstWinRate,
                            second_half_win_rate: secondWinRate,
                            delta_points: secondWinRate - firstWinRate,
                        };
                    })
                    .filter((item) => item.delta_points > 0)
                    .sort((a, b) => b.delta_points - a.delta_points);
                const improvingVs = improvingCandidates[0] ?? null;

                const singlesWins = singles.filter((row) => row.isWin).length;
                const doublesPlayed = doublesRes.rows.length;
                const doublesWins = doublesRes.rows.filter((row) => Number(row.is_win) === 1).length;

                const recentResults = singles
                    .slice(-20)
                    .reverse()
                    .map((row) => (row.isWin ? 'W' : 'L') as 'W' | 'L');
                const recent10 = recentResults.slice(0, 10);
                const recent20 = recentResults.slice(0, 20);
                const rolling10 = recent10.length > 0
                    ? Math.round((recent10.filter((r) => r === 'W').length / recent10.length) * 100)
                    : 0;
                const rolling20 = recent20.length > 0
                    ? Math.round((recent20.filter((r) => r === 'W').length / recent20.length) * 100)
                    : 0;
                const momentum: 'hot' | 'steady' | 'cold' | 'new' = recent10.length < 5
                    ? 'new'
                    : rolling10 >= 70
                        ? 'hot'
                        : rolling10 >= 45
                            ? 'steady'
                            : 'cold';

                const byLeague = Array.from(byLeagueMap.entries())
                    .map(([league, agg]) => ({
                        league,
                        played: agg.played,
                        win_rate: agg.played > 0 ? Math.round((agg.wins / agg.played) * 100) : 0,
                    }))
                    .sort((a, b) => b.played - a.played || b.win_rate - a.win_rate)
                    .slice(0, 6);

                const byDivision = Array.from(byDivisionMap.entries())
                    .map(([division, agg]) => ({
                        division,
                        played: agg.played,
                        win_rate: agg.played > 0 ? Math.round((agg.wins / agg.played) * 100) : 0,
                    }))
                    .sort((a, b) => b.played - a.played || b.win_rate - a.win_rate)
                    .slice(0, 6);

                const scorePatterns = Array.from(scorePatternMap.entries())
                    .map(([score, count]) => ({ score, count }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 6);

                const activeSeasonRows = singles.filter((row) => row.seasonIsActive);
                const activeWins = activeSeasonRows.filter((row) => row.isWin).length;
                const currentSeasonMatches = activeSeasonRows.length;
                const currentSeasonWinRate = currentSeasonMatches > 0
                    ? Math.round((activeWins / currentSeasonMatches) * 100)
                    : 0;
                const projectedMatches = (() => {
                    if (currentSeasonMatches === 0) return 0;
                    const start = activeSeasonRows[0]!.date.getTime();
                    const daysElapsed = Math.max(1, Math.floor((Date.now() - start) / (24 * 60 * 60 * 1000)));
                    return Math.max(currentSeasonMatches, Math.round((currentSeasonMatches / daysElapsed) * 365));
                })();

                const payload = {
                    player_id: player.canonicalId,
                    player_name: player.playerName,
                    years_played: yearsSet.size,
                    first_match_date: firstMatchDate,
                    latest_match_date: latestMatchDate,
                    career_by_year: careerByYear,
                    peaks: {
                        best_season: bestSeasonSource
                            ? {
                                year: bestSeasonSource.year,
                                played: bestSeasonSource.played,
                                win_rate: bestSeasonSource.win_rate,
                            }
                            : null,
                        most_active_season: mostActiveSeason
                            ? {
                                year: mostActiveSeason.year,
                                played: mostActiveSeason.played,
                            }
                            : null,
                        best_month: bestMonth,
                        worst_month: worstMonth,
                    },
                    rivals: {
                        toughest: toughest
                            ? {
                                opponent_id: toughest.opponent_id,
                                opponent_name: toughest.opponent_name,
                                played: toughest.played,
                                wins: toughest.wins,
                                losses: toughest.losses,
                                win_rate: toughest.win_rate,
                            }
                            : null,
                        easiest: easiest
                            ? {
                                opponent_id: easiest.opponent_id,
                                opponent_name: easiest.opponent_name,
                                played: easiest.played,
                                wins: easiest.wins,
                                losses: easiest.losses,
                                win_rate: easiest.win_rate,
                            }
                            : null,
                        improving_vs: improvingVs,
                    },
                    style: {
                        singles: {
                            played: totalMatches,
                            wins: singlesWins,
                            losses: totalMatches - singlesWins,
                            win_rate: totalMatches > 0 ? Math.round((singlesWins / totalMatches) * 100) : 0,
                        },
                        doubles: {
                            played: doublesPlayed,
                            wins: doublesWins,
                            losses: doublesPlayed - doublesWins,
                            win_rate: doublesPlayed > 0 ? Math.round((doublesWins / doublesPlayed) * 100) : 0,
                        },
                        score_patterns: scorePatterns,
                    },
                    form: {
                        rolling_10_win_rate: rolling10,
                        rolling_20_win_rate: rolling20,
                        momentum,
                        recent_results: recentResults,
                    },
                    context: {
                        home: {
                            played: homePlayed,
                            wins: homeWins,
                            win_rate: homePlayed > 0 ? Math.round((homeWins / homePlayed) * 100) : 0,
                        },
                        away: {
                            played: awayPlayed,
                            wins: awayWins,
                            win_rate: awayPlayed > 0 ? Math.round((awayWins / awayPlayed) * 100) : 0,
                        },
                        by_league: byLeague,
                        by_division: byDivision,
                    },
                    milestones: {
                        total_matches: totalMatches,
                        longest_win_streak: longestWinStreak,
                        milestone_hits: [50, 100, 250, 500, 1000].filter((n) => totalMatches >= n),
                    },
                    projection: {
                        current_season_matches: currentSeasonMatches,
                        current_season_win_rate: currentSeasonWinRate,
                        projected_matches: projectedMatches,
                        on_track_for_70_win_rate: currentSeasonWinRate >= 70,
                    },
                };

                await writeCache(db, PLAYER_INSIGHTS_CACHE_TYPE, player.canonicalId, payload, dataVersion, PLAYER_INSIGHTS_CACHE_TTL_MS);

                return reply.send(payload);
            },
        );

        app.get(
            '/:id/affiliations/current-season',
            {
                schema: {
                    params: ParamsSchema,
                    response: {
                        200: z.object({ data: z.array(CurrentSeasonAffiliationSchema) }),
                        404: ErrorSchema,
                        500: ErrorSchema,
                    },
                },
            },
            async (request, reply) => {
                const { id } = request.params;

                const player = await resolvePlayerIdentity(db, id);

                if (!player) {
                    return reply.status(404).send({
                        error: `Player ${id} not found`,
                        statusCode: 404,
                    });
                }

                const sourceIds = uuidArray(player.sourceIds);

                const rows = await sql<{
                    team_id: string;
                    team_name: string;
                    league_id: string;
                    league_name: string;
                    season_id: string;
                    season_name: string;
                    competition_name: string;
                }>`
                    WITH player_affiliations AS (
                        SELECT
                            f.home_team_id AS team_id,
                            l.id AS league_id,
                            l.name AS league_name,
                            s.id AS season_id,
                            s.name AS season_name,
                            c.name AS competition_name
                        FROM rubbers r
                        JOIN fixtures f ON f.id = r.fixture_id
                        JOIN competitions c ON c.id = f.competition_id
                        JOIN seasons s ON s.id = c.season_id
                        JOIN leagues l ON l.id = s.league_id
                        WHERE (r.home_player_1_id = ANY(${sourceIds}) OR r.home_player_2_id = ANY(${sourceIds}))
                          AND f.home_team_id IS NOT NULL
                          AND s.is_active = true
                          AND r.deleted_at IS NULL
                          AND f.deleted_at IS NULL
                          AND c.deleted_at IS NULL
                          AND s.deleted_at IS NULL
                          AND l.deleted_at IS NULL

                        UNION ALL

                        SELECT
                            f.away_team_id AS team_id,
                            l.id AS league_id,
                            l.name AS league_name,
                            s.id AS season_id,
                            s.name AS season_name,
                            c.name AS competition_name
                        FROM rubbers r
                        JOIN fixtures f ON f.id = r.fixture_id
                        JOIN competitions c ON c.id = f.competition_id
                        JOIN seasons s ON s.id = c.season_id
                        JOIN leagues l ON l.id = s.league_id
                        WHERE (r.away_player_1_id = ANY(${sourceIds}) OR r.away_player_2_id = ANY(${sourceIds}))
                          AND f.away_team_id IS NOT NULL
                          AND s.is_active = true
                          AND r.deleted_at IS NULL
                          AND f.deleted_at IS NULL
                          AND c.deleted_at IS NULL
                          AND s.deleted_at IS NULL
                          AND l.deleted_at IS NULL
                    )
                    SELECT DISTINCT
                        pa.team_id,
                        t.name AS team_name,
                        pa.league_id,
                        pa.league_name,
                        pa.season_id,
                        pa.season_name,
                        pa.competition_name
                    FROM player_affiliations pa
                    JOIN teams t ON t.id = pa.team_id
                    WHERE t.deleted_at IS NULL
                    ORDER BY pa.league_name ASC, pa.competition_name ASC, t.name ASC
                `.execute(db);

                return reply.send({
                    data: rows.rows,
                });
            },
        );

        app.get(
            '/:id/rubbers',
            {
                schema: {
                    params: ParamsSchema,
                    querystring: PaginationQuerySchema,
                    response: {
                        200: z.object({
                            total: z.number().int(),
                            limit: z.number().int(),
                            offset: z.number().int(),
                            cursor: CursorMetaSchema.optional(),
                            data: z.array(RubberItemSchema),
                        }),
                        400: ErrorSchema,
                        404: ErrorSchema,
                        500: ErrorSchema,
                    },
                },
            },
            async (request, reply) => {
                const { id } = request.params;
                const { limit, offset, cursor: cursorParam, source } = request.query;
                const player = await resolvePlayerIdentity(db, id);

                if (!player) {
                    return reply.status(404).send({
                        error: `Player ${id} not found`,
                        statusCode: 404,
                    });
                }

                const sourceIds = uuidArray(player.sourceIds);

                const cursor = decodeRubberCursor(cursorParam);
                if (cursorParam && !cursor) {
                    return reply.status(400).send({
                        error: 'Invalid cursor',
                        statusCode: 400,
                    });
                }

                const pageLimit = cursor ? limit + 1 : limit;
                const pageOffset = cursor ? 0 : offset;
                const baseMatches = sql<any>`
                    WITH player_matches AS (
                        SELECT
                            r.id,
                            r.fixture_id,
                            COALESCE(f.date_played::timestamp, r.played_at, c.event_date::timestamp, f.created_at) as date,
                            CASE WHEN c.type = 'individual' THEN 'tournament' ELSE 'league' END as source,
                            CASE
                                WHEN c.type = 'individual' THEN COALESCE(c.display_name, c.name)
                                ELSE CONCAT(l.name, ' · ', c.name)
                            END as source_label,
                            CASE WHEN c.type = 'individual' THEN c.id ELSE NULL END as event_id,
                            CASE WHEN c.type = 'individual' THEN COALESCE(c.display_name, c.name) ELSE NULL END as event_name,
                            CONCAT(l.name, ' · ', c.name) as league,
                            COALESCE(opp_ep.canonical_player_id, opp_ep.id) as opponent_id,
                            COALESCE(opp_cp.name, opp_ep.name) as opponent,
                            CASE
                                WHEN (r.home_player_1_id = ANY(${sourceIds}) AND r.home_games_won > r.away_games_won)
                                  OR (r.away_player_1_id = ANY(${sourceIds}) AND r.away_games_won > r.home_games_won) THEN true
                                ELSE false
                            END as "isWin",
                            CASE
                                WHEN r.score_source = 'win_loss_only' THEN 'Won'
                                WHEN r.home_player_1_id = ANY(${sourceIds}) THEN CONCAT('Won ', r.home_games_won, '-', r.away_games_won)
                                WHEN r.away_player_1_id = ANY(${sourceIds}) THEN CONCAT('Won ', r.away_games_won, '-', r.home_games_won)
                            END as result_win,
                            CASE
                                WHEN r.score_source = 'win_loss_only' THEN 'Lost'
                                WHEN r.home_player_1_id = ANY(${sourceIds}) THEN CONCAT('Lost ', r.home_games_won, '-', r.away_games_won)
                                WHEN r.away_player_1_id = ANY(${sourceIds}) THEN CONCAT('Lost ', r.away_games_won, '-', r.home_games_won)
                            END as result_loss
                        FROM rubbers r
                        JOIN fixtures f ON f.id = r.fixture_id
                        JOIN competitions c ON c.id = f.competition_id
                        JOIN seasons s ON s.id = c.season_id
                        JOIN leagues l ON l.id = s.league_id
                        LEFT JOIN external_players opp_ep
                          ON opp_ep.id = CASE
                              WHEN r.home_player_1_id = ANY(${sourceIds}) THEN r.away_player_1_id
                              ELSE r.home_player_1_id
                          END
                        LEFT JOIN external_players opp_cp ON opp_cp.id = COALESCE(opp_ep.canonical_player_id, opp_ep.id)
                        WHERE (r.home_player_1_id = ANY(${sourceIds}) OR r.away_player_1_id = ANY(${sourceIds}))
                          AND r.is_doubles = false
                          AND r.deleted_at IS NULL
                          AND r.outcome_type != 'walkover'
                          AND f.deleted_at IS NULL
                          AND c.deleted_at IS NULL
                          AND s.deleted_at IS NULL
                          AND l.deleted_at IS NULL
                          AND (${source} = 'all' OR (${source} = 'league' AND c.type <> 'individual') OR (${source} = 'tournament' AND c.type = 'individual'))
                          AND NULLIF(TRIM(COALESCE(opp_cp.name, opp_ep.name)), '') IS NOT NULL
                          AND LOWER(TRIM(COALESCE(opp_cp.name, opp_ep.name))) <> 'unknown'
                    )
                `;

                const matchesPromise = sql<any>`
                    ${baseMatches}
                    SELECT *
                    FROM player_matches
                    WHERE (${cursor?.date ?? null}::timestamptz IS NULL OR (date, id) < (${cursor?.date ?? null}::timestamptz, ${cursor?.id ?? null}::uuid))
                    ORDER BY date DESC, id DESC
                    LIMIT ${pageLimit}
                    OFFSET ${pageOffset}
                `.execute(db);

                const countPromise = cursor && cursor.total !== undefined
                    ? Promise.resolve({ rows: [{ count: cursor.total }] })
                    : sql<{ count: number }>`
                        ${baseMatches}
                        SELECT COUNT(*)::int as count
                        FROM player_matches
                    `.execute(db);

                const [matches, countRes] = await Promise.all([matchesPromise, countPromise]);

                const pageRows = cursor ? matches.rows.slice(0, limit) : matches.rows;
                const total = Number(countRes.rows[0]?.count ?? 0);

                const data = pageRows.map((m: any) => ({
                    id: m.id,
                    fixture_id: m.fixture_id,
                    date: String(m.date),
                    source: m.source,
                    source_label: m.source_label,
                    event_id: m.event_id,
                    event_name: m.event_name,
                    league: m.league,
                    opponent: m.opponent ?? 'Unknown',
                    opponent_id: m.opponent_id,
                    result: m.isWin ? m.result_win : m.result_loss,
                    isWin: m.isWin,
                }));

                let nextCursor: string | null = null;
                let hasMore = cursor ? matches.rows.length > limit : matches.rows.length === limit && offset + limit < total;
                if (hasMore && pageRows.length > 0) {
                    const last = pageRows[pageRows.length - 1];
                    nextCursor = encodeRubberCursor(last.date, last.id, total);
                }

                return reply.send({
                    total,
                    limit,
                    offset,
                    cursor: { next_cursor: nextCursor, has_more: hasMore },
                    data,
                });
            }
        );

        app.get(
            '/:id/tournaments',
            {
                schema: {
                    params: ParamsSchema,
                    response: {
                        200: z.object({
                            data: z.array(z.object({
                                event_id: z.string().uuid(),
                                event_name: z.string(),
                                event_date: z.string().nullable(),
                                category: z.string().nullable(),
                                platform_name: z.string(),
                                match_id: z.string().uuid(),
                                played_at: z.string().nullable(),
                                round_name: z.string().nullable(),
                                home_player_name: z.string(),
                                away_player_name: z.string(),
                                winner_side: z.string(),
                                player_side: z.string(),
                            })),
                        }),
                        404: ErrorSchema,
                        500: ErrorSchema,
                    },
                },
            },
            async (request, reply) => {
                const { id } = request.params;
                const player = await resolvePlayerIdentity(db, id);

                if (!player) {
                    return reply.status(404).send({
                        error: `Player ${id} not found`,
                        statusCode: 404,
                    });
                }

                const sourceIds = uuidArray(player.sourceIds);

                const matches = await sql<any>`
                    SELECT 
                        c.id as event_id,
                        coalesce(c.display_name, c.name) as event_name,
                        c.event_date::text as event_date,
                        c.category,
                        p.name as platform_name,
                        r.id as match_id,
                        r.played_at::text as played_at,
                        f.round_name,
                        COALESCE(hp.name, 'Unknown') as home_player_name,
                        COALESCE(ap.name, 'Unknown') as away_player_name,
                        CASE WHEN r.home_games_won > r.away_games_won THEN 'home' ELSE 'away' END as winner_side,
                        CASE WHEN hp.id = ANY(${sourceIds}) THEN 'home' ELSE 'away' END as player_side
                    FROM rubbers r
                    INNER JOIN fixtures f ON f.id = r.fixture_id
                    INNER JOIN competitions c ON c.id = f.competition_id AND c.type = 'individual'
                    INNER JOIN seasons s ON s.id = c.season_id
                    INNER JOIN leagues l ON l.id = s.league_id
                    INNER JOIN platforms p ON p.id = l.platform_id
                    LEFT JOIN external_players hp ON hp.id = r.home_player_1_id
                    LEFT JOIN external_players ap ON ap.id = r.away_player_1_id
                    WHERE r.is_doubles = false
                    AND r.deleted_at IS NULL
                    AND c.deleted_at IS NULL
                    AND (r.home_player_1_id = ANY(${sourceIds}) OR r.away_player_1_id = ANY(${sourceIds}))
                    ORDER BY c.event_date DESC, r.played_at DESC
                `.execute(db);

                return { data: matches.rows };
            }
        );

        app.get(
            '/:id/h2h/:opponentId',
            {
                schema: {
                    params: z.object({
                        id: z.string().uuid(),
                        opponentId: z.string().uuid(),
                    }),
                    querystring: H2HQuerySchema,
                    response: {
                        200: z.object({
                            player1_wins: z.number().int(),
                            player2_wins: z.number().int(),
                            encounters: z.array(RubberItemSchema),
                        }),
                        404: ErrorSchema,
                        500: ErrorSchema,
                    }
                }
            },
            async (request, reply) => {
                const { id, opponentId } = request.params;
                const [player, opponent] = await Promise.all([
                    resolvePlayerIdentity(db, id),
                    resolvePlayerIdentity(db, opponentId),
                ]);

                if (!player) {
                    return reply.status(404).send({
                        error: `Player ${id} not found`,
                        statusCode: 404,
                    });
                }

                if (!opponent) {
                    return reply.status(404).send({
                        error: `Player ${opponentId} not found`,
                        statusCode: 404,
                    });
                }

                const sourceIds = uuidArray(player.sourceIds);
                const opponentSourceIds = uuidArray(opponent.sourceIds);
                const leagueCsv = (request.query.league_ids ?? '')
                    .split(',')
                    .map((leagueId) => leagueId.trim())
                    .filter((leagueId) => leagueId.length > 0)
                    .join(',');

                const matches = await sql<any>`
                    SELECT 
                        r.id,
                        r.fixture_id,
                        f.date_played as date,
                        CONCAT(l.name, ' · ', c.name) as league,
                        ${opponent.canonicalId}::uuid as opponent_id,
                        ${opponent.playerName}::text as opponent,
                        CASE 
                            WHEN (r.home_player_1_id = ANY(${sourceIds}) AND r.home_games_won > r.away_games_won)
                              OR (r.away_player_1_id = ANY(${sourceIds}) AND r.away_games_won > r.home_games_won) THEN true
                            ELSE false
                        END as "isWin",
                        CASE 
                            WHEN r.score_source = 'win_loss_only' THEN 'Won'
                            WHEN r.home_player_1_id = ANY(${sourceIds}) THEN CONCAT('Won ', r.home_games_won, '-', r.away_games_won)
                            WHEN r.away_player_1_id = ANY(${sourceIds}) THEN CONCAT('Won ', r.away_games_won, '-', r.home_games_won)
                        END as result_win,
                        CASE 
                            WHEN r.score_source = 'win_loss_only' THEN 'Lost'
                            WHEN r.home_player_1_id = ANY(${sourceIds}) THEN CONCAT('Lost ', r.home_games_won, '-', r.away_games_won)
                            WHEN r.away_player_1_id = ANY(${sourceIds}) THEN CONCAT('Lost ', r.away_games_won, '-', r.home_games_won)
                        END as result_loss
                    FROM rubbers r
                    JOIN fixtures f ON f.id = r.fixture_id
                    JOIN competitions c ON c.id = f.competition_id
                    JOIN seasons s ON s.id = c.season_id
                    JOIN leagues l ON l.id = s.league_id
                    WHERE ((r.home_player_1_id = ANY(${sourceIds}) AND r.away_player_1_id = ANY(${opponentSourceIds}))
                       OR (r.home_player_1_id = ANY(${opponentSourceIds}) AND r.away_player_1_id = ANY(${sourceIds})))
                      AND r.is_doubles = false
                      AND r.deleted_at IS NULL
                      AND (${leagueCsv} = '' OR s.league_id::text = ANY(string_to_array(${leagueCsv}, ',')))
                    ORDER BY f.date_played DESC
                `.execute(db);

                let p1_wins = 0;
                let p2_wins = 0;

                const data = matches.rows.map((m: any) => {
                    if (m.isWin) p1_wins++;
                    else p2_wins++;

                    return {
                        id: m.id,
                        fixture_id: m.fixture_id,
                        date: String(m.date),
                        league: m.league,
                        opponent: m.opponent ?? 'Unknown',
                        opponent_id: m.opponent_id,
                        result: m.isWin ? m.result_win : m.result_loss,
                        isWin: m.isWin,
                    };
                });

                return reply.send({
                    player1_wins: p1_wins,
                    player2_wins: p2_wins,
                    encounters: data,
                });
            }
        );
    };
}
