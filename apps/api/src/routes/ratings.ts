import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql, type Kysely } from 'kysely';
import type { Database } from '@tt-players/db';

const DEFAULT_MODEL_KEY = 'global-singles-glicko2-v1';

const RatingSchema = z.object({
    rank: z.number().int(),
    player_id: z.string().uuid(),
    player_name: z.string(),
    rating: z.number(),
    rating_deviation: z.number(),
    conservative_rating: z.number(),
    rated_matches: z.number().int(),
    rated_wins: z.number().int(),
    rated_losses: z.number().int(),
    win_rate: z.number(),
    provisional: z.boolean(),
    first_rated_at: z.string().nullable(),
    last_rated_at: z.string().nullable(),
});

const QuerySchema = z.object({
    model: z.string().min(1).default(DEFAULT_MODEL_KEY),
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(50),
    include_provisional: z.enum(['true', 'false']).default('false').transform((value: string) => value === 'true'),
});

const ParamsSchema = z.object({
    id: z.string().uuid(),
});

const ProcessingSchema = z.object({
    status: z.string(),
    last_processed_date: z.string().nullable(),
    processed_periods: z.number().int(),
    processed_matches: z.number().int(),
    updated_at: z.string().nullable(),
}).nullable();

interface RatingRow {
    player_id: string;
    player_name: string;
    rating: number;
    rating_deviation: number;
    conservative_rating: number;
    rated_matches: number;
    rated_wins: number;
    rated_losses: number;
    provisional: boolean;
    first_rated_at: string | Date | null;
    last_rated_at: string | Date | null;
}

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
                const { model, page, page_size: pageSize, include_provisional: includeProvisional } = request.query;
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
                    data: rowsResult.rows.map((row, index) => ({
                        rank: offset + index + 1,
                        player_id: row.player_id,
                        player_name: row.player_name,
                        rating: Number(row.rating),
                        rating_deviation: Number(row.rating_deviation),
                        conservative_rating: Number(row.conservative_rating),
                        rated_matches: Number(row.rated_matches),
                        rated_wins: Number(row.rated_wins),
                        rated_losses: Number(row.rated_losses),
                        win_rate: Number(row.rated_matches) > 0
                            ? Number(row.rated_wins) / Number(row.rated_matches)
                            : 0,
                        provisional: row.provisional,
                        first_rated_at: toDateString(row.first_rated_at),
                        last_rated_at: toDateString(row.last_rated_at),
                    })),
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
            '/:id',
            {
                schema: {
                    params: ParamsSchema,
                    querystring: z.object({
                        model: z.string().min(1).default(DEFAULT_MODEL_KEY),
                    }),
                    response: {
                        200: z.object({ data: RatingSchema.omit({ rank: true }) }),
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
                        pr.last_rated_at
                    FROM player_ratings pr
                    JOIN rating_models rm ON rm.id = pr.model_id
                    JOIN external_players ep ON ep.id = pr.player_id
                    WHERE rm.key = ${request.query.model}
                      AND pr.player_id = ${request.params.id}::uuid
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
                    data: {
                        player_id: row.player_id,
                        player_name: row.player_name,
                        rating: Number(row.rating),
                        rating_deviation: Number(row.rating_deviation),
                        conservative_rating: Number(row.conservative_rating),
                        rated_matches: Number(row.rated_matches),
                        rated_wins: Number(row.rated_wins),
                        rated_losses: Number(row.rated_losses),
                        win_rate: Number(row.rated_matches) > 0
                            ? Number(row.rated_wins) / Number(row.rated_matches)
                            : 0,
                        provisional: row.provisional,
                        first_rated_at: toDateString(row.first_rated_at),
                        last_rated_at: toDateString(row.last_rated_at),
                    },
                });
            },
        );
    };
}

function toDateString(value: string | Date | null): string | null {
    if (!value) return null;
    return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}
