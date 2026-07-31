import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql, type Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import {
    DEFAULT_RATING_MODEL_KEY,
    type RatingRow,
    predictMatch,
    presentPredictionPlayer,
    presentRating,
    toDateString,
} from '../ratings/domain.js';
import { PredictionPlayerSchema, RatingSchema } from '../ratings/schemas.js';

const QuerySchema = z.object({
    model: z.string().min(1).default(DEFAULT_RATING_MODEL_KEY),
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(50),
    include_provisional: z.enum(['true', 'false']).default('false').transform((value: string) => value === 'true'),
});

const ParamsSchema = z.object({
    id: z.string().uuid(),
});

const PredictionQuerySchema = z.object({
    model: z.string().min(1).default(DEFAULT_RATING_MODEL_KEY),
    player1_id: z.string().uuid(),
    player2_id: z.string().uuid(),
});

const ProcessingSchema = z.object({
    status: z.string(),
    last_processed_date: z.string().nullable(),
    processed_periods: z.number().int(),
    processed_matches: z.number().int(),
    updated_at: z.string().nullable(),
}).nullable();

interface CountRow {
    total: number;
}

interface ProcessingRow {
    status: string;
    last_processed_date: string | Date | null;
    processed_periods: number;
    processed_matches: string | number;
    updated_at: Date | null;
}

export function ratingsRoutes(db: Kysely<Database>): FastifyPluginAsync {
    return async function (fastify) {
        const app = fastify.withTypeProvider<ZodTypeProvider>();

        app.get(
            '/',
            {
                schema: {
                    querystring: QuerySchema,
                    response: {
                        200: z.object({
                            data: z.array(RatingSchema),
                            pagination: z.object({
                                page: z.number().int(),
                                page_size: z.number().int(),
                                total: z.number().int(),
                                total_pages: z.number().int(),
                            }),
                            model: z.string(),
                            processing: ProcessingSchema,
                        }),
                    },
                },
            },
            async (request, reply) => {
                const {
                    model,
                    page,
                    page_size: pageSize,
                    include_provisional: includeProvisional,
                } = request.query;
                const offset = (page - 1) * pageSize;

                const [rowsResult, countResult, processingResult] = await Promise.all([
                    sql<RatingRow>`
                        SELECT
                            pr.player_id,
                            ep.name AS player_name,
                            pr.rating,
                            pr.rating_deviation,
                            pr.conservative_rating,
                            pr.rated_matches,
                            pr.rated_wins,
                            pr.rated_losses,
                            pr.provisional,
                            pr.first_rated_at,
                            pr.last_rated_at
                        FROM player_ratings pr
                        JOIN rating_models rm ON rm.id = pr.model_id
                        JOIN external_players ep ON ep.id = pr.player_id
                        WHERE rm.key = ${model}
                          AND ep.deleted_at IS NULL
                          AND (${includeProvisional} OR pr.provisional = false)
                        ORDER BY pr.conservative_rating DESC, pr.rated_matches DESC, ep.name ASC
                        LIMIT ${pageSize}
                        OFFSET ${offset}
                    `.execute(db),
                    sql<CountRow>`
                        SELECT COUNT(*)::int AS total
                        FROM player_ratings pr
                        JOIN rating_models rm ON rm.id = pr.model_id
                        JOIN external_players ep ON ep.id = pr.player_id
                        WHERE rm.key = ${model}
                          AND ep.deleted_at IS NULL
                          AND (${includeProvisional} OR pr.provisional = false)
                    `.execute(db),
                    sql<ProcessingRow>`
                        SELECT
                            rps.status,
                            rps.last_processed_date,
                            rps.processed_periods,
                            rps.processed_matches,
                            rps.updated_at
                        FROM rating_processing_state rps
                        JOIN rating_models rm ON rm.id = rps.model_id
                        WHERE rm.key = ${model}
                        LIMIT 1
                    `.execute(db),
                ]);

                const total = Number(countResult.rows[0]?.total ?? 0);
                const processing = processingResult.rows[0];

                return reply.send({
                    data: rowsResult.rows.map((row, index) =>
                        presentRating(row, offset + index + 1)),
                    pagination: {
                        page,
                        page_size: pageSize,
                        total,
                        total_pages: Math.ceil(total / pageSize),
                    },
                    model,
                    processing: processing
                        ? {
                            status: processing.status,
                            last_processed_date: toDateString(processing.last_processed_date),
                            processed_periods: Number(processing.processed_periods),
                            processed_matches: Number(processing.processed_matches),
                            updated_at: processing.updated_at?.toISOString() ?? null,
                        }
                        : null,
                });
            },
        );

        app.get(
            '/predict',
            {
                schema: {
                    querystring: PredictionQuerySchema,
                    response: {
                        200: z.object({
                            model: z.string(),
                            confidence: z.enum(['high', 'medium', 'low']),
                            combined_deviation: z.number(),
                            player1: PredictionPlayerSchema,
                            player2: PredictionPlayerSchema,
                        }),
                        400: z.object({ error: z.string(), statusCode: z.number().int() }),
                        404: z.object({ error: z.string(), statusCode: z.number().int() }),
                    },
                },
            },
            async (request, reply) => {
                const {
                    model,
                    player1_id: player1Id,
                    player2_id: player2Id,
                } = request.query;
                if (player1Id === player2Id) {
                    return reply.status(400).send({
                        error: 'Choose two different players',
                        statusCode: 400,
                    });
                }

                const result = await sql<RatingRow>`
                    SELECT
                        pr.player_id,
                        ep.name AS player_name,
                        pr.rating,
                        pr.rating_deviation,
                        pr.conservative_rating,
                        pr.rated_matches,
                        pr.rated_wins,
                        pr.rated_losses,
                        pr.provisional,
                        pr.first_rated_at,
                        pr.last_rated_at
                    FROM player_ratings pr
                    JOIN rating_models rm ON rm.id = pr.model_id
                    JOIN external_players ep ON ep.id = pr.player_id
                    WHERE rm.key = ${model}
                      AND ep.deleted_at IS NULL
                      AND pr.player_id IN (${player1Id}::uuid, ${player2Id}::uuid)
                `.execute(db);

                const byId = new Map(result.rows.map((row) => [row.player_id, row]));
                const player1 = byId.get(player1Id);
                const player2 = byId.get(player2Id);
                if (!player1 || !player2) {
                    return reply.status(404).send({
                        error: 'Calculated ratings are not available for both players yet',
                        statusCode: 404,
                    });
                }

                const prediction = predictMatch(player1, player2);
                return reply.send({
                    model,
                    confidence: prediction.confidence,
                    combined_deviation: prediction.combinedDeviation,
                    player1: presentPredictionPlayer(
                        player1,
                        prediction.player1Probability,
                    ),
                    player2: presentPredictionPlayer(
                        player2,
                        prediction.player2Probability,
                    ),
                });
            },
        );

        app.get(
            '/:id',
            {
                schema: {
                    params: ParamsSchema,
                    querystring: z.object({
                        model: z.string().min(1).default(DEFAULT_RATING_MODEL_KEY),
                    }),
                    response: {
                        200: z.object({ data: RatingSchema }),
                        404: z.object({ error: z.string(), statusCode: z.number().int() }),
                    },
                },
            },
            async (request, reply) => {
                const result = await sql<RatingRow>`
                    SELECT
                        pr.player_id,
                        ep.name AS player_name,
                        pr.rating,
                        pr.rating_deviation,
                        pr.conservative_rating,
                        pr.rated_matches,
                        pr.rated_wins,
                        pr.rated_losses,
                        pr.provisional,
                        pr.first_rated_at,
                        pr.last_rated_at,
                        CASE
                            WHEN pr.provisional THEN NULL
                            ELSE 1 + (
                                SELECT COUNT(*)::int
                                FROM player_ratings ranked
                                JOIN rating_models ranked_model ON ranked_model.id = ranked.model_id
                                JOIN external_players ranked_player ON ranked_player.id = ranked.player_id
                                WHERE ranked_model.key = ${request.query.model}
                                  AND ranked.provisional = false
                                  AND ranked_player.deleted_at IS NULL
                                  AND ranked.conservative_rating > pr.conservative_rating
                            )
                        END AS rank
                    FROM player_ratings pr
                    JOIN rating_models rm ON rm.id = pr.model_id
                    JOIN external_players ep ON ep.id = pr.player_id
                    WHERE rm.key = ${request.query.model}
                      AND pr.player_id = ${request.params.id}::uuid
                      AND ep.deleted_at IS NULL
                    LIMIT 1
                `.execute(db);
                const row = result.rows[0];

                if (!row) {
                    return reply.status(404).send({
                        error: 'Calculated rating not found',
                        statusCode: 404,
                    });
                }

                return reply.send({
                    data: presentRating(
                        row,
                        row.rank === null || row.rank === undefined
                            ? null
                            : Number(row.rank),
                    ),
                });
            },
        );
    };
}
