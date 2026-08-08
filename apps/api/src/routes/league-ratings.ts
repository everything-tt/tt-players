import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql, type Kysely, type RawBuilder } from 'kysely';
import type { Database } from '@tt-players/db';
import {
    DEFAULT_RATING_MODEL_KEY,
    type RankedRatingRow,
    presentRankedRating,
} from '../ratings/domain.js';
import { RankedRatingSchema } from '../ratings/schemas.js';

const QuerySchema = z.object({
    model: z.string().min(1).default(DEFAULT_RATING_MODEL_KEY),
    league_ids: z.string().min(1),
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(5),
    include_provisional: z.enum(['true', 'false']).default('false').transform((value: string) => value === 'true'),
});

const RisersQuerySchema = z.object({
    model: z.string().min(1).default(DEFAULT_RATING_MODEL_KEY),
    league_ids: z.string().min(1),
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(5),
    window_days: z.coerce.number().int().min(7).max(365).default(42),
});

const LeagueRankedRatingSchema = RankedRatingSchema.extend({
    overall_rank: z.number().int(),
});

const LeagueRiserSchema = z.object({
    rank: z.number().int(),
    overall_rank: z.number().int(),
    player_id: z.string().uuid(),
    player_name: z.string(),
    rating_before: z.number(),
    rating_after: z.number(),
    change: z.number(),
    rating_deviation_after: z.number(),
    rated_matches: z.number().int(),
    baseline_date: z.string(),
});

interface CountRow {
    total: number | string;
}

interface LeagueRankedRatingRow extends RankedRatingRow {
    overall_rank: number | string;
}

interface LeagueRiserRow {
    rank: number | string;
    overall_rank: number | string;
    player_id: string;
    player_name: string;
    rating_before: number | string;
    rating_after: number | string;
    change: number | string;
    rating_deviation_after: number | string;
    rated_matches: number | string;
    baseline_date: string | Date;
}

export function leagueRatingsRoutes(db: Kysely<Database>): FastifyPluginAsync {
    return async function (fastify) {
        const app = fastify.withTypeProvider<ZodTypeProvider>();

        app.get(
            '/league',
            {
                schema: {
                    querystring: QuerySchema,
                    response: {
                        200: z.object({
                            data: z.array(LeagueRankedRatingSchema),
                            total: z.number().int(),
                            page: z.number().int(),
                            page_size: z.number().int(),
                            model: z.string(),
                            league_ids: z.array(z.string().uuid()),
                        }),
                        400: z.object({ error: z.string(), statusCode: z.number().int() }),
                    },
                },
            },
            async (request, reply) => {
                const uniqueLeagueIds = parseLeagueIds(request.query.league_ids);
                if (!uniqueLeagueIds) {
                    return reply.status(400).send({
                        error: 'league_ids must contain one or more valid UUIDs',
                        statusCode: 400,
                    });
                }

                const {
                    model,
                    page,
                    page_size: pageSize,
                    include_provisional: includeProvisional,
                } = request.query;
                const offset = (page - 1) * pageSize;

                const [result, countResult] = await Promise.all([
                    sql<LeagueRankedRatingRow>`
                        WITH all_ranked AS (
                            SELECT
                                ROW_NUMBER() OVER (
                                    ORDER BY rating.conservative_rating DESC, rating.rated_matches DESC, player.name ASC
                                ) AS overall_rank,
                                rating.player_id,
                                player.name AS player_name,
                                rating.rating,
                                rating.rating_deviation,
                                rating.volatility,
                                rating.conservative_rating,
                                rating.rated_matches,
                                rating.rated_wins,
                                rating.rated_losses,
                                rating.provisional,
                                rating.first_rated_at,
                                rating.last_rated_at
                            FROM player_ratings rating
                            JOIN rating_models model_row ON model_row.id = rating.model_id
                            JOIN external_players player ON player.id = rating.player_id
                            WHERE model_row.key = ${model}
                              AND player.deleted_at IS NULL
                              AND (${includeProvisional} OR rating.provisional = false)
                        ), scoped AS (
                            SELECT
                                ROW_NUMBER() OVER (
                                    ORDER BY conservative_rating DESC, rated_matches DESC, player_name ASC
                                ) AS rank,
                                all_ranked.*
                            FROM all_ranked
                            WHERE EXISTS (
                                SELECT 1
                                FROM player_active_leagues membership
                                WHERE membership.player_id = all_ranked.player_id
                                  AND membership.league_id = ANY(${uuidArray(uniqueLeagueIds)})
                            )
                        )
                        SELECT *
                        FROM scoped
                        ORDER BY rank
                        LIMIT ${pageSize}
                        OFFSET ${offset}
                    `.execute(db),
                    sql<CountRow>`
                        SELECT COUNT(*)::int AS total
                        FROM player_ratings rating
                        JOIN rating_models model_row ON model_row.id = rating.model_id
                        JOIN external_players player ON player.id = rating.player_id
                        WHERE model_row.key = ${model}
                          AND player.deleted_at IS NULL
                          AND (${includeProvisional} OR rating.provisional = false)
                          AND EXISTS (
                              SELECT 1
                              FROM player_active_leagues membership
                              WHERE membership.player_id = rating.player_id
                                AND membership.league_id = ANY(${uuidArray(uniqueLeagueIds)})
                          )
                    `.execute(db),
                ]);

                return reply.send({
                    data: result.rows.map((row) => ({
                        ...presentRankedRating(row),
                        overall_rank: Number(row.overall_rank),
                    })),
                    total: Number(countResult.rows[0]?.total ?? 0),
                    page,
                    page_size: pageSize,
                    model,
                    league_ids: uniqueLeagueIds,
                });
            },
        );

        app.get(
            '/league/risers',
            {
                schema: {
                    querystring: RisersQuerySchema,
                    response: {
                        200: z.object({
                            data: z.array(LeagueRiserSchema),
                            total: z.number().int(),
                            page: z.number().int(),
                            page_size: z.number().int(),
                            model: z.string(),
                            league_ids: z.array(z.string().uuid()),
                            window_days: z.number().int(),
                        }),
                        400: z.object({ error: z.string(), statusCode: z.number().int() }),
                    },
                },
            },
            async (request, reply) => {
                const uniqueLeagueIds = parseLeagueIds(request.query.league_ids);
                if (!uniqueLeagueIds) {
                    return reply.status(400).send({
                        error: 'league_ids must contain one or more valid UUIDs',
                        statusCode: 400,
                    });
                }

                const {
                    model,
                    page,
                    page_size: pageSize,
                    window_days: windowDays,
                } = request.query;
                const offset = (page - 1) * pageSize;

                const [result, countResult] = await Promise.all([
                    sql<LeagueRiserRow>`
                        WITH all_ranked AS (
                            SELECT
                                ROW_NUMBER() OVER (
                                    ORDER BY rating.conservative_rating DESC, rating.rated_matches DESC, player.name ASC
                                ) AS overall_rank,
                                rating.player_id,
                                player.name AS player_name,
                                rating.rating,
                                rating.rating_deviation,
                                rating.rated_matches
                            FROM player_ratings rating
                            JOIN rating_models model_row ON model_row.id = rating.model_id
                            JOIN external_players player ON player.id = rating.player_id
                            WHERE model_row.key = ${model}
                              AND player.deleted_at IS NULL
                              AND rating.provisional = false
                        ), candidates AS (
                            SELECT
                                current_rating.overall_rank,
                                current_rating.player_id,
                                current_rating.player_name,
                                baseline.rating AS rating_before,
                                current_rating.rating AS rating_after,
                                current_rating.rating - baseline.rating AS change,
                                current_rating.rating_deviation AS rating_deviation_after,
                                current_rating.rated_matches,
                                baseline.snapshot_date AS baseline_date
                            FROM all_ranked current_rating
                            JOIN LATERAL (
                                SELECT history.rating, history.snapshot_date
                                FROM player_rating_weekly_history history
                                JOIN rating_models history_model ON history_model.id = history.model_id
                                WHERE history_model.key = ${model}
                                  AND history.player_id = current_rating.player_id
                                  AND history.provisional = false
                                  AND history.snapshot_date <= current_date - ${windowDays}::int
                                ORDER BY history.snapshot_date DESC
                                LIMIT 1
                            ) baseline ON true
                            WHERE current_rating.rating > baseline.rating
                              AND EXISTS (
                                  SELECT 1
                                  FROM player_active_leagues membership
                                  WHERE membership.player_id = current_rating.player_id
                                    AND membership.league_id = ANY(${uuidArray(uniqueLeagueIds)})
                              )
                        ), ranked AS (
                            SELECT
                                ROW_NUMBER() OVER (
                                    ORDER BY change DESC, rating_after DESC, player_name ASC
                                ) AS rank,
                                candidates.*
                            FROM candidates
                        )
                        SELECT *
                        FROM ranked
                        ORDER BY rank
                        LIMIT ${pageSize}
                        OFFSET ${offset}
                    `.execute(db),
                    sql<CountRow>`
                        WITH current_ratings AS (
                            SELECT rating.player_id, rating.rating
                            FROM player_ratings rating
                            JOIN rating_models model_row ON model_row.id = rating.model_id
                            JOIN external_players player ON player.id = rating.player_id
                            WHERE model_row.key = ${model}
                              AND player.deleted_at IS NULL
                              AND rating.provisional = false
                              AND EXISTS (
                                  SELECT 1
                                  FROM player_active_leagues membership
                                  WHERE membership.player_id = rating.player_id
                                    AND membership.league_id = ANY(${uuidArray(uniqueLeagueIds)})
                              )
                        )
                        SELECT COUNT(*)::int AS total
                        FROM current_ratings current_rating
                        JOIN LATERAL (
                            SELECT history.rating
                            FROM player_rating_weekly_history history
                            JOIN rating_models history_model ON history_model.id = history.model_id
                            WHERE history_model.key = ${model}
                              AND history.player_id = current_rating.player_id
                              AND history.provisional = false
                              AND history.snapshot_date <= current_date - ${windowDays}::int
                            ORDER BY history.snapshot_date DESC
                            LIMIT 1
                        ) baseline ON true
                        WHERE current_rating.rating > baseline.rating
                    `.execute(db),
                ]);

                return reply.send({
                    data: result.rows.map((row) => ({
                        rank: Number(row.rank),
                        overall_rank: Number(row.overall_rank),
                        player_id: row.player_id,
                        player_name: row.player_name,
                        rating_before: Number(row.rating_before),
                        rating_after: Number(row.rating_after),
                        change: Number(row.change),
                        rating_deviation_after: Number(row.rating_deviation_after),
                        rated_matches: Number(row.rated_matches),
                        baseline_date: toDateString(row.baseline_date),
                    })),
                    total: Number(countResult.rows[0]?.total ?? 0),
                    page,
                    page_size: pageSize,
                    model,
                    league_ids: uniqueLeagueIds,
                    window_days: windowDays,
                });
            },
        );
    };
}

function parseLeagueIds(value: string): string[] | null {
    const leagueIds = value
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0);

    if (
        leagueIds.length === 0
        || leagueIds.some((id) => !z.string().uuid().safeParse(id).success)
    ) {
        return null;
    }

    return [...new Set(leagueIds)];
}

function uuidArray(ids: string[]): RawBuilder<string[]> {
    return sql`ARRAY[${sql.join(ids.map((id) => sql`${id}::uuid`))}]::uuid[]`;
}

function toDateString(value: string | Date): string {
    return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}
