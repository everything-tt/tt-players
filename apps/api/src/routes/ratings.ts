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

const RankingModeSchema = z.enum(['active', 'historical']);

const QuerySchema = z.object({
    model: z.string().min(1).default(DEFAULT_RATING_MODEL_KEY),
    ranking: RankingModeSchema.default('active'),
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
                            ranking: RankingModeSchema,
                            processing: ProcessingSchema,
                        }),
                    },
                },
            },
            async (request, reply) => {
                const {
                    model,
                    ranking,
                    page,
                    page_size: pageSize,
                    include_provisional: includeProvisional,
                } = request.query;
                const offset = (page - 1) * pageSize;

                const rowsPromise = ranking === 'active'
                    ? sql<RatingRow>`
                        SELECT
                            rating.player_id,
                            player.name AS player_name,
                            rating.rating,
                            current_ranking.effective_deviation AS rating_deviation,
                            rating.volatility,
                            current_ranking.effective_conservative_rating AS conservative_rating,
                            rating.rated_matches,
                            rating.rated_wins,
                            rating.rated_losses,
                            (rating.provisional OR NOT current_ranking.eligible) AS provisional,
                            rating.first_rated_at,
                            rating.last_rated_at,
                            current_ranking.current_rank AS rank
                        FROM rating_current_rankings current_ranking
                        JOIN player_ratings rating
                          ON rating.model_id = current_ranking.model_id
                         AND rating.player_id = current_ranking.player_id
                        JOIN rating_models rating_model ON rating_model.id = rating.model_id
                        JOIN external_players player ON player.id = rating.player_id
                        WHERE rating_model.key = ${model}
                          AND player.deleted_at IS NULL
                          AND (${includeProvisional} OR current_ranking.eligible)
                        ORDER BY
                            current_ranking.eligible DESC,
                            current_ranking.current_rank ASC NULLS LAST,
                            current_ranking.effective_conservative_rating DESC,
                            rating.rated_matches DESC,
                            player.name
                        LIMIT ${pageSize}
                        OFFSET ${offset}
                    `.execute(db)
                    : sql<RatingRow>`
                        SELECT
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
                            rating.last_rated_at,
                            current_ranking.historical_rank AS rank
                        FROM player_ratings rating
                        JOIN rating_models rating_model ON rating_model.id = rating.model_id
                        JOIN external_players player ON player.id = rating.player_id
                        LEFT JOIN rating_current_rankings current_ranking
                          ON current_ranking.model_id = rating.model_id
                         AND current_ranking.player_id = rating.player_id
                        WHERE rating_model.key = ${model}
                          AND player.deleted_at IS NULL
                          AND (${includeProvisional} OR rating.provisional = false)
                        ORDER BY
                            rating.conservative_rating DESC,
                            rating.rated_matches DESC,
                            player.name
                        LIMIT ${pageSize}
                        OFFSET ${offset}
                    `.execute(db);

                const countPromise = ranking === 'active'
                    ? sql<CountRow>`
                        SELECT COUNT(*)::int AS total
                        FROM rating_current_rankings current_ranking
                        JOIN rating_models rating_model ON rating_model.id = current_ranking.model_id
                        JOIN external_players player ON player.id = current_ranking.player_id
                        WHERE rating_model.key = ${model}
                          AND player.deleted_at IS NULL
                          AND (${includeProvisional} OR current_ranking.eligible)
                    `.execute(db)
                    : sql<CountRow>`
                        SELECT COUNT(*)::int AS total
                        FROM player_ratings rating
                        JOIN rating_models rating_model ON rating_model.id = model_id
                        JOIN external_players player ON player.id = rating.player_id
                        WHERE rating_model.key = ${model}
                          AND player.deleted_at IS NULL
                          AND (${includeProvisional} OR rating.provisional = false)
                    `.execute(db);

                const [rowsResult, countResult, processingResult] = await Promise.all([
                    rowsPromise,
                    countPromise,
                    sql<ProcessingRow>`
                        SELECT
                            processing.status,
                            processing.last_processed_date,
                            processing.processed_periods,
                            processing.processed_matches,
                            processing.updated_at
                        FROM rating_processing_state processing
                        JOIN rating_models rating_model ON rating_model.id = processing.model_id
                        WHERE rating_model.key = ${model}
                        LIMIT 1
                    `.execute(db),
                ]);

                const total = Number(countResult.rows[0]?.total ?? 0);
                const processing = processingResult.rows[0];

                return reply.send({
                    data: rowsResult.rows.map((row) =>
                        presentRating(
                            row,
                            row.rank === null || row.rank === undefined ? null : Number(row.rank),
                        )),
                    pagination: {
                        page,
                        page_size: pageSize,
                        total,
                        total_pages: Math.ceil(total / pageSize),
                    },
                    model,
                    ranking,
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
                        rating.player_id,
                        player.name AS player_name,
                        rating.rating,
                        COALESCE(current_ranking.effective_deviation, rating.rating_deviation) AS rating_deviation,
                        rating.volatility,
                        COALESCE(
                            current_ranking.effective_conservative_rating,
                            rating.conservative_rating
                        ) AS conservative_rating,
                        rating.rated_matches,
                        rating.rated_wins,
                        rating.rated_losses,
                        rating.provisional,
                        rating.first_rated_at,
                        rating.last_rated_at
                    FROM player_ratings rating
                    JOIN rating_models rating_model ON rating_model.id = rating.model_id
                    JOIN external_players player ON player.id = rating.player_id
                    LEFT JOIN rating_current_rankings current_ranking
                      ON current_ranking.model_id = rating.model_id
                     AND current_ranking.player_id = rating.player_id
                    WHERE rating_model.key = ${model}
                      AND player.deleted_at IS NULL
                      AND rating.player_id IN (${player1Id}::uuid, ${player2Id}::uuid)
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
                        rating.player_id,
                        player.name AS player_name,
                        rating.rating,
                        COALESCE(current_ranking.effective_deviation, rating.rating_deviation) AS rating_deviation,
                        rating.volatility,
                        COALESCE(
                            current_ranking.effective_conservative_rating,
                            rating.conservative_rating
                        ) AS conservative_rating,
                        rating.rated_matches,
                        rating.rated_wins,
                        rating.rated_losses,
                        (rating.provisional OR COALESCE(NOT current_ranking.eligible, false)) AS provisional,
                        rating.first_rated_at,
                        rating.last_rated_at,
                        current_ranking.current_rank AS rank
                    FROM player_ratings rating
                    JOIN rating_models rating_model ON rating_model.id = rating.model_id
                    JOIN external_players player ON player.id = rating.player_id
                    LEFT JOIN rating_current_rankings current_ranking
                      ON current_ranking.model_id = rating.model_id
                     AND current_ranking.player_id = rating.player_id
                    WHERE rating_model.key = ${request.query.model}
                      AND rating.player_id = ${request.params.id}::uuid
                      AND player.deleted_at IS NULL
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
