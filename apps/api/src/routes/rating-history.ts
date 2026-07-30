import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql, type Kysely } from 'kysely';
import type { Database } from '@tt-players/db';

const DEFAULT_MODEL_KEY = 'global-singles-glicko2-v1';

type HistoryRange = '3m' | '1y' | '3y' | '10y' | 'all';
type RatingConfidence = 'high' | 'medium' | 'low';

const ParamsSchema = z.object({
    id: z.string().uuid(),
});

const QuerySchema = z.object({
    model: z.string().min(1).default(DEFAULT_MODEL_KEY),
    range: z.enum(['3m', '1y', '3y', '10y', 'all']).default('1y'),
});

const HistoryPointSchema = z.object({
    week_start: z.string(),
    snapshot_date: z.string(),
    rating: z.number(),
    rating_deviation: z.number(),
    conservative_rating: z.number(),
    rating_low: z.number(),
    rating_high: z.number(),
    rating_change: z.number().nullable(),
    confidence: z.enum(['high', 'medium', 'low']),
    rated_matches: z.number().int(),
    rated_wins: z.number().int(),
    rated_losses: z.number().int(),
    week_matches: z.number().int(),
    week_wins: z.number().int(),
    week_losses: z.number().int(),
    provisional: z.boolean(),
});

interface PlayerIdentityRow {
    player_id: string;
    player_name: string;
}

interface HistoryRow {
    week_start: string | Date;
    snapshot_date: string | Date;
    rating: number;
    rating_deviation: number;
    conservative_rating: number;
    previous_rating: number | null;
    rated_matches: number;
    rated_wins: number;
    rated_losses: number;
    week_matches: number;
    week_wins: number;
    week_losses: number;
    provisional: boolean;
}

export function ratingHistoryRoutes(db: Kysely<Database>): FastifyPluginAsync {
    return async function (fastify) {
        const app = fastify.withTypeProvider<ZodTypeProvider>();

        app.get(
            '/:id/history',
            {
                schema: {
                    params: ParamsSchema,
                    querystring: QuerySchema,
                    response: {
                        200: z.object({
                            player_id: z.string().uuid(),
                            player_name: z.string(),
                            model: z.string(),
                            range: z.enum(['3m', '1y', '3y', '10y', 'all']),
                            data: z.array(HistoryPointSchema),
                        }),
                        404: z.object({ error: z.string(), statusCode: z.number().int() }),
                    },
                },
            },
            async (request, reply) => {
                const identityResult = await sql<PlayerIdentityRow>`
                    SELECT
                        COALESCE(ep.canonical_player_id, ep.id) AS player_id,
                        COALESCE(canonical.name, ep.name) AS player_name
                    FROM external_players ep
                    LEFT JOIN external_players canonical
                      ON canonical.id = COALESCE(ep.canonical_player_id, ep.id)
                     AND canonical.deleted_at IS NULL
                    WHERE ep.id = ${request.params.id}::uuid
                      AND ep.deleted_at IS NULL
                    LIMIT 1
                `.execute(db);
                const identity = identityResult.rows[0];

                if (!identity) {
                    return reply.status(404).send({
                        error: 'Player not found',
                        statusCode: 404,
                    });
                }

                const fromDate = historyStartDate(request.query.range);
                const historyResult = await sql<HistoryRow>`
                    WITH ordered_history AS (
                        SELECT
                            history.week_start,
                            history.snapshot_date,
                            history.rating,
                            history.rating_deviation,
                            history.conservative_rating,
                            LAG(history.rating) OVER (ORDER BY history.week_start) AS previous_rating,
                            history.rated_matches,
                            history.rated_wins,
                            history.rated_losses,
                            history.week_matches,
                            history.week_wins,
                            history.week_losses,
                            history.provisional
                        FROM player_rating_weekly_history history
                        JOIN rating_models model ON model.id = history.model_id
                        WHERE model.key = ${request.query.model}
                          AND history.player_id = ${identity.player_id}::uuid
                    )
                    SELECT *
                    FROM ordered_history
                    WHERE (${fromDate}::date IS NULL OR week_start >= ${fromDate}::date)
                    ORDER BY week_start ASC
                `.execute(db);

                return reply.send({
                    player_id: identity.player_id,
                    player_name: identity.player_name,
                    model: request.query.model,
                    range: request.query.range,
                    data: historyResult.rows.map(presentHistoryPoint),
                });
            },
        );
    };
}

function historyStartDate(range: HistoryRange): string | null {
    if (range === 'all') return null;

    const now = new Date();
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (range === '3m') date.setUTCMonth(date.getUTCMonth() - 3);
    if (range === '1y') date.setUTCFullYear(date.getUTCFullYear() - 1);
    if (range === '3y') date.setUTCFullYear(date.getUTCFullYear() - 3);
    if (range === '10y') date.setUTCFullYear(date.getUTCFullYear() - 10);
    return date.toISOString().slice(0, 10);
}

function presentHistoryPoint(row: HistoryRow) {
    const rating = Number(row.rating);
    const deviation = Number(row.rating_deviation);
    const previousRating = row.previous_rating === null ? null : Number(row.previous_rating);

    return {
        week_start: toDateString(row.week_start),
        snapshot_date: toDateString(row.snapshot_date),
        rating,
        rating_deviation: deviation,
        conservative_rating: Number(row.conservative_rating),
        rating_low: round(rating - 2 * deviation, 2),
        rating_high: round(rating + 2 * deviation, 2),
        rating_change: previousRating === null ? null : round(rating - previousRating, 2),
        confidence: ratingConfidence(deviation),
        rated_matches: Number(row.rated_matches),
        rated_wins: Number(row.rated_wins),
        rated_losses: Number(row.rated_losses),
        week_matches: Number(row.week_matches),
        week_wins: Number(row.week_wins),
        week_losses: Number(row.week_losses),
        provisional: row.provisional,
    };
}

function ratingConfidence(deviation: number): RatingConfidence {
    if (deviation <= 70) return 'high';
    if (deviation <= 120) return 'medium';
    return 'low';
}

function toDateString(value: string | Date): string {
    return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function round(value: number, digits: number): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}
