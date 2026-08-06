import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql, type Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import { DEFAULT_RATING_MODEL_KEY } from '../ratings/domain.js';

const QuerySchema = z.object({
    model: z.string().min(1).default(DEFAULT_RATING_MODEL_KEY),
});

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const IssuesQuerySchema = QuerySchema.extend({
    issue_type: z.string().min(1).optional(),
    severity: z.enum(['info', 'warning', 'critical']).optional(),
    source_id: z.string().uuid().optional(),
    competition_id: z.string().uuid().optional(),
    from: DateSchema.optional(),
    to: DateSchema.optional(),
    status: z.enum(['active', 'resolved', 'all']).default('active'),
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(50),
});

const ModelHealthSchema = z.object({
    key: z.string(),
    status: z.string().nullable(),
    last_processed_date: z.string().nullable(),
    processed_periods: z.number().int(),
    processed_matches: z.number().int(),
    updated_at: z.string().nullable(),
    rated_players: z.number().int(),
    established_players: z.number().int(),
    provisional_players: z.number().int(),
    average_deviation: z.number(),
    first_rated_date: z.string().nullable(),
    last_rated_date: z.string().nullable(),
    window_start_date: z.string().nullable().optional(),
});

const DataHealthSchema = z.object({
    stored_rubbers: z.number().int(),
    active_rubbers: z.number().int(),
    eligible_singles: z.number().int(),
    excluded_rubbers: z.number().int(),
    doubles: z.number().int(),
    non_normal_outcome: z.number().int(),
    missing_date: z.number().int(),
    missing_identity: z.number().int(),
    same_canonical_player: z.number().int(),
    tied_score: z.number().int(),
});

const IdentityHealthSchema = z.object({
    source_records: z.number().int(),
    active_records: z.number().int(),
    canonical_players: z.number().int(),
    linked_aliases: z.number().int(),
    active_aliases: z.number().int(),
    soft_deleted_aliases: z.number().int(),
    unassigned_records: z.number().int(),
    broken_targets: z.number().int(),
    chained_links: z.number().int(),
    deleted_targets: z.number().int(),
    same_name_candidate_groups: z.number().int(),
    multi_source_players: z.number().int(),
});

const NetworkHealthSchema = z.object({
    eligible_matches: z.number().int(),
    connected_players: z.number().int(),
    unique_pairings: z.number().int(),
    average_unique_opponents: z.number(),
    maximum_unique_opponents: z.number().int(),
    one_opponent_players: z.number().int(),
    three_or_fewer_opponent_players: z.number().int(),
    competitions: z.number().int(),
    first_match_date: z.string().nullable(),
    last_match_date: z.string().nullable(),
});

const NetworkAnomalySchema = z.object({
    player_id: z.string().uuid(),
    player_name: z.string(),
    rating: z.number(),
    rating_deviation: z.number(),
    rated_matches: z.number().int(),
    unique_opponents: z.number().int(),
    provisional: z.boolean(),
});

const SnapshotContentSchema = z.object({
    model: ModelHealthSchema,
    data: DataHealthSchema,
    identities: IdentityHealthSchema,
    network: NetworkHealthSchema,
    network_anomalies: z.array(NetworkAnomalySchema),
});

const SnapshotResponseSchema = SnapshotContentSchema.extend({
    generated_at: z.string(),
});

const IssueSchema = z.object({
    id: z.string().uuid(),
    issue_type: z.string(),
    severity: z.enum(['info', 'warning', 'critical']),
    entity_type: z.string(),
    entity_id: z.string().uuid(),
    source_id: z.string().uuid().nullable(),
    source_name: z.string().nullable(),
    competition_id: z.string().uuid().nullable(),
    competition_name: z.string().nullable(),
    match_date: z.string().nullable(),
    details: z.unknown(),
    first_seen_at: z.string(),
    last_seen_at: z.string(),
    resolved_at: z.string().nullable(),
});

const IssueSummarySchema = z.object({
    issue_type: z.string(),
    severity: z.enum(['info', 'warning', 'critical']),
    count: z.number().int(),
});

const IssuesResponseSchema = z.object({
    data: z.array(IssueSchema),
    summary: z.array(IssueSummarySchema),
    pagination: z.object({
        page: z.number().int(),
        page_size: z.number().int(),
        total: z.number().int(),
        total_pages: z.number().int(),
    }),
});

interface SnapshotRow {
    content: unknown;
    generated_at: Date;
    window_start_date: string | Date | null;
}

interface IssueRow {
    id: string;
    issue_type: string;
    severity: 'info' | 'warning' | 'critical';
    entity_type: string;
    entity_id: string;
    source_id: string | null;
    source_name: string | null;
    competition_id: string | null;
    competition_name: string | null;
    match_date: string | Date | null;
    details: unknown;
    first_seen_at: Date;
    last_seen_at: Date;
    resolved_at: Date | null;
}

interface CountRow {
    total: number | string;
}

interface SummaryRow {
    issue_type: string;
    severity: 'info' | 'warning' | 'critical';
    count: number | string;
}

function toDateString(value: string | Date | null): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return value.slice(0, 10);
}

export function ratingAuditRoutes(db: Kysely<Database>): FastifyPluginAsync {
    return async function (fastify) {
        const app = fastify.withTypeProvider<ZodTypeProvider>();

        app.get(
            '/audit/summary',
            {
                schema: {
                    querystring: QuerySchema,
                    response: {
                        200: SnapshotResponseSchema,
                        404: z.object({ error: z.string(), statusCode: z.number().int() }),
                    },
                },
            },
            async (request, reply) => {
                const result = await sql<SnapshotRow>`
                    SELECT
                        snapshot.content,
                        snapshot.generated_at,
                        model.window_start_date
                    FROM rating_audit_snapshots snapshot
                    JOIN rating_models model ON model.id = snapshot.model_id
                    WHERE model.key = ${request.query.model}
                    LIMIT 1
                `.execute(db);
                const row = result.rows[0];

                if (!row) {
                    return reply.status(404).send({
                        error: 'Rating audit snapshot is not available yet',
                        statusCode: 404,
                    });
                }

                const parsed = SnapshotContentSchema.safeParse(row.content);
                if (!parsed.success) {
                    throw new Error('Stored rating audit snapshot has an invalid shape');
                }

                return reply.send({
                    generated_at: row.generated_at.toISOString(),
                    ...parsed.data,
                    model: {
                        ...parsed.data.model,
                        window_start_date: toDateString(row.window_start_date),
                    },
                });
            },
        );

        app.get(
            '/audit/issues',
            {
                schema: {
                    querystring: IssuesQuerySchema,
                    response: { 200: IssuesResponseSchema },
                },
            },
            async (request, reply) => {
                const {
                    model,
                    issue_type: issueType = null,
                    severity = null,
                    source_id: sourceId = null,
                    competition_id: competitionId = null,
                    from = null,
                    to = null,
                    status,
                    page,
                    page_size: pageSize,
                } = request.query;
                const offset = (page - 1) * pageSize;

                const statusFilter = sql`
                    (${status}::text = 'all'
                        OR (${status}::text = 'active' AND issue.resolved_at IS NULL)
                        OR (${status}::text = 'resolved' AND issue.resolved_at IS NOT NULL))
                `;
                const filters = sql`
                    model.key = ${model}
                    AND ${statusFilter}
                    AND (${issueType}::text IS NULL OR issue.issue_type = ${issueType})
                    AND (${severity}::text IS NULL OR issue.severity = ${severity})
                    AND (${sourceId}::uuid IS NULL OR issue.source_id = ${sourceId}::uuid)
                    AND (${competitionId}::uuid IS NULL OR issue.competition_id = ${competitionId}::uuid)
                    AND (${from}::date IS NULL OR issue.match_date >= ${from}::date)
                    AND (${to}::date IS NULL OR issue.match_date <= ${to}::date)
                `;

                const [rowsResult, countResult, summaryResult] = await Promise.all([
                    sql<IssueRow>`
                        SELECT
                            issue.id,
                            issue.issue_type,
                            issue.severity,
                            issue.entity_type,
                            issue.entity_id,
                            issue.source_id,
                            platform.name AS source_name,
                            issue.competition_id,
                            competition.name AS competition_name,
                            issue.match_date,
                            issue.details,
                            issue.first_seen_at,
                            issue.last_seen_at,
                            issue.resolved_at
                        FROM rating_audit_issues issue
                        JOIN rating_models model ON model.id = issue.model_id
                        LEFT JOIN platforms platform ON platform.id = issue.source_id
                        LEFT JOIN competitions competition ON competition.id = issue.competition_id
                        WHERE ${filters}
                        ORDER BY
                            CASE issue.severity
                                WHEN 'critical' THEN 0
                                WHEN 'warning' THEN 1
                                ELSE 2
                            END,
                            issue.match_date DESC NULLS LAST,
                            issue.issue_type,
                            issue.entity_id
                        LIMIT ${pageSize}
                        OFFSET ${offset}
                    `.execute(db),
                    sql<CountRow>`
                        SELECT COUNT(*)::int AS total
                        FROM rating_audit_issues issue
                        JOIN rating_models model ON model.id = issue.model_id
                        WHERE ${filters}
                    `.execute(db),
                    sql<SummaryRow>`
                        SELECT
                            issue.issue_type,
                            issue.severity,
                            COUNT(*)::int AS count
                        FROM rating_audit_issues issue
                        JOIN rating_models model ON model.id = issue.model_id
                        WHERE ${filters}
                        GROUP BY issue.issue_type, issue.severity
                        ORDER BY
                            CASE issue.severity
                                WHEN 'critical' THEN 0
                                WHEN 'warning' THEN 1
                                ELSE 2
                            END,
                            count DESC,
                            issue.issue_type
                    `.execute(db),
                ]);

                const total = Number(countResult.rows[0]?.total ?? 0);
                return reply.send({
                    data: rowsResult.rows.map((row) => ({
                        ...row,
                        match_date: toDateString(row.match_date),
                        first_seen_at: row.first_seen_at.toISOString(),
                        last_seen_at: row.last_seen_at.toISOString(),
                        resolved_at: row.resolved_at?.toISOString() ?? null,
                    })),
                    summary: summaryResult.rows.map((row) => ({
                        issue_type: row.issue_type,
                        severity: row.severity,
                        count: Number(row.count),
                    })),
                    pagination: {
                        page,
                        page_size: pageSize,
                        total,
                        total_pages: Math.ceil(total / pageSize),
                    },
                });
            },
        );
    };
}
