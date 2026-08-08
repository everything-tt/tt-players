import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql, type Kysely } from 'kysely';
import type { Database, RatingDuplicateCandidateType } from '@tt-players/db';
import { DEFAULT_RATING_MODEL_KEY } from '../ratings/domain.js';

const BaseQuerySchema = z.object({
    model: z.string().min(1).default(DEFAULT_RATING_MODEL_KEY),
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(50),
});

const QualitySchema = z.object({
    total_rubbers: z.number().int(),
    eligible_rubbers: z.number().int(),
    missing_identity_rubbers: z.number().int(),
    missing_date_rubbers: z.number().int(),
    invalid_single_rubbers: z.number().int(),
    suspicious_date_rubbers: z.number().int(),
    duplicate_candidate_groups: z.number().int(),
    conflicting_candidate_groups: z.number().int(),
    first_match_date: z.string().nullable(),
    last_match_date: z.string().nullable(),
});

const SourceSchema = QualitySchema.extend({
    source_id: z.string().uuid(),
    source_name: z.string(),
    base_url: z.string(),
});

const CompetitionSchema = QualitySchema.extend({
    competition_id: z.string().uuid(),
    competition_name: z.string(),
    source_id: z.string().uuid().nullable(),
    source_name: z.string().nullable(),
});

const PaginationSchema = z.object({
    page: z.number().int(),
    page_size: z.number().int(),
    total: z.number().int(),
    total_pages: z.number().int(),
});

const SourceResponseSchema = z.object({
    data: z.array(SourceSchema),
    pagination: PaginationSchema,
    model: z.string(),
});

const CompetitionResponseSchema = z.object({
    data: z.array(CompetitionSchema),
    pagination: PaginationSchema,
    model: z.string(),
});

const DuplicateTypeSchema = z.enum([
    'exact_score_candidate',
    'conflicting_score_candidate',
]);

const DuplicateSchema = z.object({
    id: z.string().uuid(),
    candidate_type: DuplicateTypeSchema,
    competition_id: z.string().uuid().nullable(),
    competition_name: z.string().nullable(),
    match_date: z.string(),
    player_a_id: z.string().uuid(),
    player_a_name: z.string(),
    player_b_id: z.string().uuid(),
    player_b_name: z.string(),
    rubber_count: z.number().int(),
    rubber_ids: z.unknown(),
    source_ids: z.unknown(),
    score_signatures: z.unknown(),
});

const DuplicateResponseSchema = z.object({
    data: z.array(DuplicateSchema),
    pagination: PaginationSchema,
    model: z.string(),
});

interface QualityRow {
    total_rubbers: number | string;
    eligible_rubbers: number | string;
    missing_identity_rubbers: number | string;
    missing_date_rubbers: number | string;
    invalid_single_rubbers: number | string;
    suspicious_date_rubbers: number | string;
    duplicate_candidate_groups: number | string;
    conflicting_candidate_groups: number | string;
    first_match_date: string | Date | null;
    last_match_date: string | Date | null;
}

interface SourceRow extends QualityRow {
    source_id: string;
    source_name: string;
    base_url: string;
}

interface CompetitionRow extends QualityRow {
    competition_id: string;
    competition_name: string;
    source_id: string | null;
    source_name: string | null;
}

interface DuplicateRow {
    id: string;
    candidate_type: RatingDuplicateCandidateType;
    competition_id: string | null;
    competition_name: string | null;
    match_date: string | Date;
    player_a_id: string;
    player_a_name: string;
    player_b_id: string;
    player_b_name: string;
    rubber_count: number | string;
    rubber_ids: unknown;
    source_ids: unknown;
    score_signatures: unknown;
}

interface CountRow {
    total: number | string;
}

function toDateString(value: string | Date | null): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return value.slice(0, 10);
}

function presentQuality(row: QualityRow) {
    return {
        total_rubbers: Number(row.total_rubbers),
        eligible_rubbers: Number(row.eligible_rubbers),
        missing_identity_rubbers: Number(row.missing_identity_rubbers),
        missing_date_rubbers: Number(row.missing_date_rubbers),
        invalid_single_rubbers: Number(row.invalid_single_rubbers),
        suspicious_date_rubbers: Number(row.suspicious_date_rubbers),
        duplicate_candidate_groups: Number(row.duplicate_candidate_groups),
        conflicting_candidate_groups: Number(row.conflicting_candidate_groups),
        first_match_date: toDateString(row.first_match_date),
        last_match_date: toDateString(row.last_match_date),
    };
}

function pagination(page: number, pageSize: number, total: number) {
    return {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
    };
}

export function ratingSourceQualityRoutes(db: Kysely<Database>): FastifyPluginAsync {
    return async function (fastify) {
        const app = fastify.withTypeProvider<ZodTypeProvider>();

        app.get('/audit/sources', {
            schema: {
                querystring: BaseQuerySchema,
                response: { 200: SourceResponseSchema },
            },
        }, async (request, reply) => {
            const { model, page, page_size: pageSize } = request.query;
            const offset = (page - 1) * pageSize;
            const [rowsResult, countResult] = await Promise.all([
                sql<SourceRow>`
                    SELECT
                        quality.source_id,
                        platform.name AS source_name,
                        platform.base_url,
                        quality.total_rubbers,
                        quality.eligible_rubbers,
                        quality.missing_identity_rubbers,
                        quality.missing_date_rubbers,
                        quality.invalid_single_rubbers,
                        quality.suspicious_date_rubbers,
                        quality.duplicate_candidate_groups,
                        quality.conflicting_candidate_groups,
                        quality.first_match_date,
                        quality.last_match_date
                    FROM rating_source_quality quality
                    JOIN rating_models rating_model ON rating_model.id = quality.model_id
                    JOIN platforms platform ON platform.id = quality.source_id
                    WHERE rating_model.key = ${model}
                    ORDER BY
                        quality.missing_identity_rubbers DESC,
                        quality.invalid_single_rubbers DESC,
                        quality.total_rubbers DESC,
                        platform.name
                    LIMIT ${pageSize}
                    OFFSET ${offset}
                `.execute(db),
                sql<CountRow>`
                    SELECT COUNT(*)::int AS total
                    FROM rating_source_quality quality
                    JOIN rating_models rating_model ON rating_model.id = quality.model_id
                    WHERE rating_model.key = ${model}
                `.execute(db),
            ]);
            const total = Number(countResult.rows[0]?.total ?? 0);
            return reply.send({
                data: rowsResult.rows.map((row) => ({
                    source_id: row.source_id,
                    source_name: row.source_name,
                    base_url: row.base_url,
                    ...presentQuality(row),
                })),
                pagination: pagination(page, pageSize, total),
                model,
            });
        });

        app.get('/audit/competitions', {
            schema: {
                querystring: BaseQuerySchema.extend({
                    source_id: z.string().uuid().optional(),
                    search: z.string().trim().max(100).optional(),
                }),
                response: { 200: CompetitionResponseSchema },
            },
        }, async (request, reply) => {
            const {
                model,
                source_id: sourceId = null,
                search = null,
                page,
                page_size: pageSize,
            } = request.query;
            const offset = (page - 1) * pageSize;
            const normalizedSearch = search?.trim() || null;
            const filters = sql`
                rating_model.key = ${model}
                AND (${sourceId}::uuid IS NULL OR quality.source_id = ${sourceId}::uuid)
                AND (${normalizedSearch}::text IS NULL OR competition.name ILIKE '%' || ${normalizedSearch} || '%')
            `;
            const [rowsResult, countResult] = await Promise.all([
                sql<CompetitionRow>`
                    SELECT
                        quality.competition_id,
                        competition.name AS competition_name,
                        quality.source_id,
                        platform.name AS source_name,
                        quality.total_rubbers,
                        quality.eligible_rubbers,
                        quality.missing_identity_rubbers,
                        quality.missing_date_rubbers,
                        quality.invalid_single_rubbers,
                        quality.suspicious_date_rubbers,
                        quality.duplicate_candidate_groups,
                        quality.conflicting_candidate_groups,
                        quality.first_match_date,
                        quality.last_match_date
                    FROM rating_competition_quality quality
                    JOIN rating_models rating_model ON rating_model.id = quality.model_id
                    JOIN competitions competition ON competition.id = quality.competition_id
                    LEFT JOIN platforms platform ON platform.id = quality.source_id
                    WHERE ${filters}
                    ORDER BY
                        quality.missing_identity_rubbers DESC,
                        quality.conflicting_candidate_groups DESC,
                        quality.invalid_single_rubbers DESC,
                        quality.total_rubbers DESC,
                        competition.name
                    LIMIT ${pageSize}
                    OFFSET ${offset}
                `.execute(db),
                sql<CountRow>`
                    SELECT COUNT(*)::int AS total
                    FROM rating_competition_quality quality
                    JOIN rating_models rating_model ON rating_model.id = quality.model_id
                    JOIN competitions competition ON competition.id = quality.competition_id
                    WHERE ${filters}
                `.execute(db),
            ]);
            const total = Number(countResult.rows[0]?.total ?? 0);
            return reply.send({
                data: rowsResult.rows.map((row) => ({
                    competition_id: row.competition_id,
                    competition_name: row.competition_name,
                    source_id: row.source_id,
                    source_name: row.source_name,
                    ...presentQuality(row),
                })),
                pagination: pagination(page, pageSize, total),
                model,
            });
        });

        app.get('/audit/duplicate-candidates', {
            schema: {
                querystring: BaseQuerySchema.extend({
                    candidate_type: DuplicateTypeSchema.optional(),
                }),
                response: { 200: DuplicateResponseSchema },
            },
        }, async (request, reply) => {
            const {
                model,
                candidate_type: candidateType = null,
                page,
                page_size: pageSize,
            } = request.query;
            const offset = (page - 1) * pageSize;
            const filters = sql`
                rating_model.key = ${model}
                AND (${candidateType}::text IS NULL OR candidate.candidate_type = ${candidateType})
            `;
            const [rowsResult, countResult] = await Promise.all([
                sql<DuplicateRow>`
                    SELECT
                        candidate.id,
                        candidate.candidate_type,
                        candidate.competition_id,
                        competition.name AS competition_name,
                        candidate.match_date,
                        candidate.player_a_id,
                        player_a.name AS player_a_name,
                        candidate.player_b_id,
                        player_b.name AS player_b_name,
                        candidate.rubber_count,
                        candidate.rubber_ids,
                        candidate.source_ids,
                        candidate.score_signatures
                    FROM rating_duplicate_candidate_groups candidate
                    JOIN rating_models rating_model ON rating_model.id = candidate.model_id
                    JOIN external_players player_a ON player_a.id = candidate.player_a_id
                    JOIN external_players player_b ON player_b.id = candidate.player_b_id
                    LEFT JOIN competitions competition ON competition.id = candidate.competition_id
                    WHERE ${filters}
                    ORDER BY
                        CASE candidate.candidate_type
                            WHEN 'conflicting_score_candidate' THEN 0
                            ELSE 1
                        END,
                        candidate.rubber_count DESC,
                        candidate.match_date DESC,
                        candidate.id
                    LIMIT ${pageSize}
                    OFFSET ${offset}
                `.execute(db),
                sql<CountRow>`
                    SELECT COUNT(*)::int AS total
                    FROM rating_duplicate_candidate_groups candidate
                    JOIN rating_models rating_model ON rating_model.id = candidate.model_id
                    WHERE ${filters}
                `.execute(db),
            ]);
            const total = Number(countResult.rows[0]?.total ?? 0);
            return reply.send({
                data: rowsResult.rows.map((row) => ({
                    id: row.id,
                    candidate_type: row.candidate_type,
                    competition_id: row.competition_id,
                    competition_name: row.competition_name,
                    match_date: toDateString(row.match_date)!,
                    player_a_id: row.player_a_id,
                    player_a_name: row.player_a_name,
                    player_b_id: row.player_b_id,
                    player_b_name: row.player_b_name,
                    rubber_count: Number(row.rubber_count),
                    rubber_ids: row.rubber_ids,
                    source_ids: row.source_ids,
                    score_signatures: row.score_signatures,
                })),
                pagination: pagination(page, pageSize, total),
                model,
            });
        });
    };
}
