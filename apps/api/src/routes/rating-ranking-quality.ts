import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql, type Kysely } from 'kysely';
import type { Database, RatingCurrentEligibilityReason } from '@tt-players/db';
import { DEFAULT_RATING_MODEL_KEY } from '../ratings/domain.js';

const ReasonSchema = z.enum([
    'ranked',
    'insufficient_matches',
    'insufficient_opponents',
    'inactive',
    'high_uncertainty',
    'critical_data_issue',
]);

const QuerySchema = z.object({
    model: z.string().min(1).default(DEFAULT_RATING_MODEL_KEY),
    reason: ReasonSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(50),
});

const PolicySchema = z.object({
    active_days: z.number().int(),
    minimum_matches: z.number().int(),
    minimum_unique_opponents: z.number().int(),
    maximum_deviation: z.number(),
});

const RowSchema = z.object({
    player_id: z.string().uuid(),
    player_name: z.string(),
    eligibility_reason: ReasonSchema,
    current_rank: z.number().int().nullable(),
    historical_rank: z.number().int(),
    rating: z.number(),
    effective_deviation: z.number(),
    effective_conservative_rating: z.number(),
    rated_matches: z.number().int(),
    unique_opponents: z.number().int(),
    days_inactive: z.number().int(),
    last_rated_at: z.string().nullable(),
    calculated_at: z.string(),
});

const ResponseSchema = z.object({
    policy: PolicySchema,
    summary: z.array(z.object({
        eligibility_reason: ReasonSchema,
        count: z.number().int(),
    })),
    data: z.array(RowSchema),
    pagination: z.object({
        page: z.number().int(),
        page_size: z.number().int(),
        total: z.number().int(),
        total_pages: z.number().int(),
    }),
    model: z.string(),
});

interface PolicyRow {
    active_days: number | string;
    minimum_matches: number | string;
    minimum_unique_opponents: number | string;
    maximum_deviation: number | string;
}

interface SummaryRow {
    eligibility_reason: RatingCurrentEligibilityReason;
    count: number | string;
}

interface RankingRow {
    player_id: string;
    player_name: string;
    eligibility_reason: RatingCurrentEligibilityReason;
    current_rank: number | string | null;
    historical_rank: number | string;
    rating: number | string;
    effective_deviation: number | string;
    effective_conservative_rating: number | string;
    rated_matches: number | string;
    unique_opponents: number | string;
    days_inactive: number | string;
    last_rated_at: string | Date | null;
    calculated_at: Date;
}

interface CountRow {
    total: number | string;
}

function toDateString(value: string | Date | null): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return value.slice(0, 10);
}

export function ratingRankingQualityRoutes(db: Kysely<Database>): FastifyPluginAsync {
    return async function (fastify) {
        const app = fastify.withTypeProvider<ZodTypeProvider>();

        app.get('/audit/ranking-quality', {
            schema: {
                querystring: QuerySchema,
                response: { 200: ResponseSchema },
            },
        }, async (request, reply) => {
            const {
                model,
                reason = null,
                page,
                page_size: pageSize,
            } = request.query;
            const offset = (page - 1) * pageSize;
            const filters = sql`
                rating_model.key = ${model}
                AND (${reason}::text IS NULL OR current_ranking.eligibility_reason = ${reason})
            `;

            const [policyResult, summaryResult, rowsResult, countResult] = await Promise.all([
                sql<PolicyRow>`
                    SELECT
                        policy.active_days,
                        policy.minimum_matches,
                        policy.minimum_unique_opponents,
                        policy.maximum_deviation
                    FROM rating_ranking_policies policy
                    JOIN rating_models rating_model ON rating_model.id = policy.model_id
                    WHERE rating_model.key = ${model}
                    LIMIT 1
                `.execute(db),
                sql<SummaryRow>`
                    SELECT
                        current_ranking.eligibility_reason,
                        COUNT(*)::int AS count
                    FROM rating_current_rankings current_ranking
                    JOIN rating_models rating_model ON rating_model.id = current_ranking.model_id
                    WHERE rating_model.key = ${model}
                    GROUP BY current_ranking.eligibility_reason
                    ORDER BY count DESC, current_ranking.eligibility_reason
                `.execute(db),
                sql<RankingRow>`
                    SELECT
                        current_ranking.player_id,
                        player.name AS player_name,
                        current_ranking.eligibility_reason,
                        current_ranking.current_rank,
                        current_ranking.historical_rank,
                        rating.rating,
                        current_ranking.effective_deviation,
                        current_ranking.effective_conservative_rating,
                        rating.rated_matches,
                        current_ranking.unique_opponents,
                        current_ranking.days_inactive,
                        rating.last_rated_at,
                        current_ranking.calculated_at
                    FROM rating_current_rankings current_ranking
                    JOIN rating_models rating_model ON rating_model.id = current_ranking.model_id
                    JOIN player_ratings rating
                      ON rating.model_id = current_ranking.model_id
                     AND rating.player_id = current_ranking.player_id
                    JOIN external_players player ON player.id = current_ranking.player_id
                    WHERE ${filters}
                    ORDER BY
                        CASE current_ranking.eligibility_reason
                            WHEN 'critical_data_issue' THEN 0
                            WHEN 'inactive' THEN 1
                            WHEN 'high_uncertainty' THEN 2
                            WHEN 'insufficient_opponents' THEN 3
                            WHEN 'insufficient_matches' THEN 4
                            ELSE 5
                        END,
                        current_ranking.current_rank ASC NULLS LAST,
                        current_ranking.effective_conservative_rating DESC,
                        player.name
                    LIMIT ${pageSize}
                    OFFSET ${offset}
                `.execute(db),
                sql<CountRow>`
                    SELECT COUNT(*)::int AS total
                    FROM rating_current_rankings current_ranking
                    JOIN rating_models rating_model ON rating_model.id = current_ranking.model_id
                    WHERE ${filters}
                `.execute(db),
            ]);

            const policy = policyResult.rows[0] ?? {
                active_days: 365,
                minimum_matches: 10,
                minimum_unique_opponents: 5,
                maximum_deviation: 110,
            };
            const total = Number(countResult.rows[0]?.total ?? 0);

            return reply.send({
                policy: {
                    active_days: Number(policy.active_days),
                    minimum_matches: Number(policy.minimum_matches),
                    minimum_unique_opponents: Number(policy.minimum_unique_opponents),
                    maximum_deviation: Number(policy.maximum_deviation),
                },
                summary: summaryResult.rows.map((row) => ({
                    eligibility_reason: row.eligibility_reason,
                    count: Number(row.count),
                })),
                data: rowsResult.rows.map((row) => ({
                    player_id: row.player_id,
                    player_name: row.player_name,
                    eligibility_reason: row.eligibility_reason,
                    current_rank: row.current_rank === null ? null : Number(row.current_rank),
                    historical_rank: Number(row.historical_rank),
                    rating: Number(row.rating),
                    effective_deviation: Number(row.effective_deviation),
                    effective_conservative_rating: Number(row.effective_conservative_rating),
                    rated_matches: Number(row.rated_matches),
                    unique_opponents: Number(row.unique_opponents),
                    days_inactive: Number(row.days_inactive),
                    last_rated_at: toDateString(row.last_rated_at),
                    calculated_at: row.calculated_at.toISOString(),
                })),
                pagination: {
                    page,
                    page_size: pageSize,
                    total,
                    total_pages: Math.ceil(total / pageSize),
                },
                model,
            });
        });
    };
}
