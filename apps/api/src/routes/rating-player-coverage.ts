import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql, type Kysely } from 'kysely';
import type { Database, RatingPlayerCoverageCategory } from '@tt-players/db';
import { DEFAULT_RATING_MODEL_KEY } from '../ratings/domain.js';

const CategorySchema = z.enum([
    'covered',
    'no_raw_matches',
    'only_doubles',
    'only_non_normal',
    'only_invalid_singles',
    'only_before_model_window',
    'eligible_in_window_without_rating',
    'rating_without_eligible_evidence',
]);

const QuerySchema = z.object({
    model: z.string().min(1).default(DEFAULT_RATING_MODEL_KEY),
    category: CategorySchema.optional(),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(50),
});

const CoverageRowSchema = z.object({
    player_id: z.string().uuid(),
    player_name: z.string(),
    category: CategorySchema,
    raw_matches: z.number().int(),
    singles_matches: z.number().int(),
    normal_singles_matches: z.number().int(),
    eligible_matches_all_time: z.number().int(),
    eligible_matches_in_window: z.number().int(),
    unique_opponents_in_window: z.number().int(),
    first_match_date: z.string().nullable(),
    last_match_date: z.string().nullable(),
    rating_exists: z.boolean(),
    rated_matches: z.number().int().nullable(),
    rating_deviation: z.number().nullable(),
});

const SummaryRowSchema = z.object({
    category: CategorySchema,
    count: z.number().int(),
});

const ResponseSchema = z.object({
    data: z.array(CoverageRowSchema),
    summary: z.array(SummaryRowSchema),
    pagination: z.object({
        page: z.number().int(),
        page_size: z.number().int(),
        total: z.number().int(),
        total_pages: z.number().int(),
    }),
    model: z.string(),
    window_start_date: z.string().nullable(),
});

interface CoverageRow {
    player_id: string;
    player_name: string;
    category: RatingPlayerCoverageCategory;
    raw_matches: number | string;
    singles_matches: number | string;
    normal_singles_matches: number | string;
    eligible_matches_all_time: number | string;
    eligible_matches_in_window: number | string;
    unique_opponents_in_window: number | string;
    first_match_date: string | Date | null;
    last_match_date: string | Date | null;
    rating_exists: boolean;
    rated_matches: number | string | null;
    rating_deviation: number | string | null;
}

interface SummaryRow {
    category: RatingPlayerCoverageCategory;
    count: number | string;
}

interface CountRow {
    total: number | string;
}

interface ModelRow {
    window_start_date: string | Date | null;
}

function toDateString(value: string | Date | null): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return value.slice(0, 10);
}

export function ratingPlayerCoverageRoutes(db: Kysely<Database>): FastifyPluginAsync {
    return async function (fastify) {
        const app = fastify.withTypeProvider<ZodTypeProvider>();

        app.get(
            '/audit/player-coverage',
            {
                schema: {
                    querystring: QuerySchema,
                    response: { 200: ResponseSchema },
                },
            },
            async (request, reply) => {
                const {
                    model,
                    category = null,
                    search = null,
                    page,
                    page_size: pageSize,
                } = request.query;
                const offset = (page - 1) * pageSize;
                const normalizedSearch = search?.trim() || null;

                const filters = sql`
                    rating_model.key = ${model}
                    AND (${category}::text IS NULL OR coverage.category = ${category})
                    AND (
                        ${normalizedSearch}::text IS NULL
                        OR player.name ILIKE '%' || ${normalizedSearch} || '%'
                    )
                `;

                const [rowsResult, summaryResult, countResult, modelResult] = await Promise.all([
                    sql<CoverageRow>`
                        SELECT
                            coverage.player_id,
                            player.name AS player_name,
                            coverage.category,
                            coverage.raw_matches,
                            coverage.singles_matches,
                            coverage.normal_singles_matches,
                            coverage.eligible_matches_all_time,
                            coverage.eligible_matches_in_window,
                            coverage.unique_opponents_in_window,
                            coverage.first_match_date,
                            coverage.last_match_date,
                            coverage.rating_exists,
                            coverage.rated_matches,
                            coverage.rating_deviation
                        FROM rating_player_coverage coverage
                        JOIN rating_models rating_model ON rating_model.id = coverage.model_id
                        JOIN external_players player ON player.id = coverage.player_id
                        WHERE ${filters}
                        ORDER BY
                            CASE coverage.category
                                WHEN 'eligible_in_window_without_rating' THEN 0
                                WHEN 'rating_without_eligible_evidence' THEN 1
                                WHEN 'only_invalid_singles' THEN 2
                                WHEN 'no_raw_matches' THEN 3
                                WHEN 'only_before_model_window' THEN 4
                                WHEN 'only_doubles' THEN 5
                                WHEN 'only_non_normal' THEN 6
                                ELSE 7
                            END,
                            coverage.raw_matches DESC,
                            coverage.last_match_date DESC NULLS LAST,
                            player.name,
                            coverage.player_id
                        LIMIT ${pageSize}
                        OFFSET ${offset}
                    `.execute(db),
                    sql<SummaryRow>`
                        SELECT coverage.category, COUNT(*)::int AS count
                        FROM rating_player_coverage coverage
                        JOIN rating_models rating_model ON rating_model.id = coverage.model_id
                        JOIN external_players player ON player.id = coverage.player_id
                        WHERE ${filters}
                        GROUP BY coverage.category
                        ORDER BY count DESC, coverage.category
                    `.execute(db),
                    sql<CountRow>`
                        SELECT COUNT(*)::int AS total
                        FROM rating_player_coverage coverage
                        JOIN rating_models rating_model ON rating_model.id = coverage.model_id
                        JOIN external_players player ON player.id = coverage.player_id
                        WHERE ${filters}
                    `.execute(db),
                    sql<ModelRow>`
                        SELECT window_start_date
                        FROM rating_models
                        WHERE key = ${model}
                        LIMIT 1
                    `.execute(db),
                ]);

                const total = Number(countResult.rows[0]?.total ?? 0);
                return reply.send({
                    data: rowsResult.rows.map((row) => ({
                        player_id: row.player_id,
                        player_name: row.player_name,
                        category: row.category,
                        raw_matches: Number(row.raw_matches),
                        singles_matches: Number(row.singles_matches),
                        normal_singles_matches: Number(row.normal_singles_matches),
                        eligible_matches_all_time: Number(row.eligible_matches_all_time),
                        eligible_matches_in_window: Number(row.eligible_matches_in_window),
                        unique_opponents_in_window: Number(row.unique_opponents_in_window),
                        first_match_date: toDateString(row.first_match_date),
                        last_match_date: toDateString(row.last_match_date),
                        rating_exists: row.rating_exists,
                        rated_matches: row.rated_matches === null ? null : Number(row.rated_matches),
                        rating_deviation: row.rating_deviation === null
                            ? null
                            : Number(row.rating_deviation),
                    })),
                    summary: summaryResult.rows.map((row) => ({
                        category: row.category,
                        count: Number(row.count),
                    })),
                    pagination: {
                        page,
                        page_size: pageSize,
                        total,
                        total_pages: Math.ceil(total / pageSize),
                    },
                    model,
                    window_start_date: toDateString(modelResult.rows[0]?.window_start_date ?? null),
                });
            },
        );
    };
}
