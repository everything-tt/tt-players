import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql, type Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import { DEFAULT_RATING_MODEL_KEY } from '../ratings/domain.js';
import {
    type HistoryRange,
    type HistoryRow,
    historyStartDate,
    presentHistoryPoint,
} from '../ratings/history.js';

const ParamsSchema = z.object({
    id: z.string().uuid(),
});

const QuerySchema = z.object({
    model: z.string().min(1).default(DEFAULT_RATING_MODEL_KEY),
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

                const range = request.query.range as HistoryRange;
                const fromDate = historyStartDate(range);
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
                    range,
                    data: historyResult.rows.map(presentHistoryPoint),
                });
            },
        );
    };
}
