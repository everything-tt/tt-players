import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql, type Kysely } from 'kysely';
import type { Database } from '@tt-players/db';

const MonitorStateSchema = z.enum(['attention', 'running', 'scheduled', 'idle', 'unobserved']);
const QueueJobStateSchema = z.enum(['running', 'ready', 'scheduled', 'failed']);
const ScrapeStatusSchema = z.enum(['pending', 'processed', 'failed']);
const PipelineRunStatusSchema = z.enum(['running', 'completed', 'failed']);
const PipelineStageStatusSchema = z.enum(['running', 'waiting', 'completed', 'failed']);

const QueueSummarySchema = z.object({
    available: z.boolean(),
    total: z.number().int().nonnegative(),
    running: z.number().int().nonnegative(),
    ready: z.number().int().nonnegative(),
    scheduled: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    oldest_pending_at: z.string().nullable(),
});

const ScrapeSummarySchema = z.object({
    total: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    processed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    transform_progress_pct: z.number().min(0).max(100),
    transform_success_pct: z.number().min(0).max(100),
    latest_scrape_at: z.string().nullable(),
});

const QueueTaskSchema = z.object({
    task_identifier: z.string(),
    total: z.number().int().nonnegative(),
    running: z.number().int().nonnegative(),
    ready: z.number().int().nonnegative(),
    scheduled: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    oldest_created_at: z.string().nullable(),
    latest_updated_at: z.string().nullable(),
    latest_error: z.string().nullable(),
});

const QueueJobSchema = z.object({
    id: z.string(),
    task_identifier: z.string(),
    state: QueueJobStateSchema,
    attempts: z.number().int().nonnegative(),
    max_attempts: z.number().int().positive(),
    created_at: z.string(),
    updated_at: z.string(),
    run_at: z.string(),
    locked_at: z.string().nullable(),
    last_error: z.string().nullable(),
});

const QueueJobDetailsSchema = QueueJobSchema.extend({
    payload: z.record(z.unknown()),
});

const QueueJobParamsSchema = z.object({
    jobId: z.string().regex(/^\d+$/),
});

const ErrorResponseSchema = z.object({
    error: z.string(),
    statusCode: z.number().int(),
});

const RecentScrapeSchema = z.object({
    id: z.string().uuid(),
    platform_name: z.string(),
    endpoint_url: z.string(),
    status: ScrapeStatusSchema,
    scraped_at: z.string(),
    payload_bytes: z.number().int().nonnegative(),
});

const ResourceFailureSchema = z.object({
    id: z.string().uuid(),
    platform_name: z.string(),
    source_instance_name: z.string(),
    resource_type: z.string(),
    resource_name: z.string(),
    public_url: z.string().nullable(),
    consecutive_failures: z.number().int().positive(),
    last_fetched_at: z.string().nullable(),
    last_succeeded_at: z.string().nullable(),
    updated_at: z.string(),
    last_error: z.string(),
});

const PipelineStageSchema = z.object({
    stage: z.string(),
    status: PipelineStageStatusSchema,
    started_at: z.string(),
    finished_at: z.string().nullable(),
    duration_ms: z.number().int().nonnegative().nullable(),
    attempt_count: z.number().int().nonnegative(),
    summary: z.record(z.unknown()),
    error_message: z.string().nullable(),
});

const PipelineRunSchema = z.object({
    run_key: z.string(),
    status: PipelineRunStatusSchema,
    current_stage: z.string(),
    window_start: z.string(),
    started_at: z.string(),
    finished_at: z.string().nullable(),
    duration_ms: z.number().int().nonnegative().nullable(),
    attempt_count: z.number().int().nonnegative(),
    error_message: z.string().nullable(),
    stages: z.array(PipelineStageSchema),
});

const PipelineHistorySchema = z.object({
    available: z.boolean(),
    retention_days: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    runs: z.array(PipelineRunSchema),
});

export const ScrapingMonitorResponseSchema = z.object({
    generated_at: z.string(),
    window_hours: z.number().int().positive(),
    state: MonitorStateSchema,
    queue: QueueSummarySchema,
    scrapes: ScrapeSummarySchema,
    pipeline_history: PipelineHistorySchema,
    active_resource_failures: z.number().int().nonnegative(),
    tasks: z.array(QueueTaskSchema),
    recent_jobs: z.array(QueueJobSchema),
    recent_scrapes: z.array(RecentScrapeSchema),
    resource_failures: z.array(ResourceFailureSchema),
});

const QuerySchema = z.object({
    hours: z.coerce.number().int().min(1).max(24 * 14).default(24 * 7),
    limit: z.coerce.number().int().min(5).max(100).default(30),
});

const MONITORED_TASK_IDENTIFIERS = [
    'scrapeUrlTask',
    'processLogTask',
    'scrapeMatchesTask',
    'scrapeMatchSetsBatchTask',
    'processMatchSetsBatchTask',
    'scrapeSport80EventsTask',
    'scrapeSport80EventResultsTask',
    'scrapeSport80RankingsDiscoveryTask',
    'scrapeSport80RankingTableTask',
    'completeDailyPipelineTask',
] as const;

const PIPELINE_HISTORY_RETENTION_DAYS = 14;

interface QueueSummaryRow {
    total: string | number;
    running: string | number;
    ready: string | number;
    scheduled: string | number;
    failed: string | number;
    oldest_pending_at: Date | string | null;
}

interface QueueTaskRow extends Omit<QueueSummaryRow, 'oldest_pending_at'> {
    task_identifier: string;
    oldest_created_at: Date | string | null;
    latest_updated_at: Date | string | null;
    latest_error: string | null;
}

interface QueueJobRow {
    id: string;
    task_identifier: string;
    state: 'running' | 'ready' | 'scheduled' | 'failed';
    attempts: number | string;
    max_attempts: number | string;
    created_at: Date | string;
    updated_at: Date | string;
    run_at: Date | string;
    locked_at: Date | string | null;
    last_error: string | null;
}

interface QueueJobDetailsRow extends QueueJobRow {
    payload: unknown;
}

interface ScrapeSummaryRow {
    total: string | number;
    pending: string | number;
    processed: string | number;
    failed: string | number;
    latest_scrape_at: Date | string | null;
}

interface RecentScrapeRow {
    id: string;
    platform_name: string;
    endpoint_url: string;
    status: 'pending' | 'processed' | 'failed';
    scraped_at: Date | string;
    payload_bytes: number | string;
}

interface ResourceFailureRow {
    id: string;
    platform_name: string;
    source_instance_name: string;
    resource_type: string;
    resource_name: string;
    public_url: string | null;
    consecutive_failures: number | string;
    last_fetched_at: Date | string | null;
    last_succeeded_at: Date | string | null;
    updated_at: Date | string;
    last_error: string;
    total_count: number | string;
}

interface PipelineRunRow {
    run_key: string;
    status: 'running' | 'completed' | 'failed';
    current_stage: string;
    window_start: Date | string;
    started_at: Date | string;
    finished_at: Date | string | null;
    duration_ms: number | string | null;
    attempt_count: number | string;
    error_message: string | null;
    total_count: number | string;
}

interface PipelineStageRow {
    run_key: string;
    stage: string;
    status: 'running' | 'waiting' | 'completed' | 'failed';
    started_at: Date | string;
    finished_at: Date | string | null;
    duration_ms: number | string | null;
    attempt_count: number | string;
    summary: unknown;
    error_message: string | null;
}

function numberValue(value: string | number | null | undefined): number {
    return Number(value ?? 0);
}

function isoValue(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function objectValue(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return {};
}

function isSensitivePayloadKey(key: string): boolean {
    const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
    return [
        'authorization',
        'cookie',
        'credential',
        'password',
        'secret',
        'session',
        'token',
        'apikey',
    ].some((fragment) => normalized.includes(fragment));
}

function redactUrlSecrets(value: string): string {
    try {
        const url = new URL(value);
        let changed = false;

        if (url.username || url.password) {
            url.username = '[REDACTED]';
            url.password = '[REDACTED]';
            changed = true;
        }

        for (const key of [...url.searchParams.keys()]) {
            if (isSensitivePayloadKey(key)) {
                url.searchParams.set(key, '[REDACTED]');
                changed = true;
            }
        }

        return changed ? url.toString() : value;
    } catch {
        return value;
    }
}

export function redactJobPayload(value: unknown, key?: string): unknown {
    if (key && isSensitivePayloadKey(key)) return '[REDACTED]';
    if (Array.isArray(value)) return value.map((item) => redactJobPayload(item));

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([entryKey, entryValue]) => [
                entryKey,
                redactJobPayload(entryValue, entryKey),
            ]),
        );
    }

    return typeof value === 'string' ? redactUrlSecrets(value) : value;
}

function percentage(part: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((part / total) * 1000) / 10;
}

function monitoredTaskSql() {
    return sql.join(MONITORED_TASK_IDENTIFIERS.map((identifier) => sql`${identifier}`));
}

async function loadQueueSnapshot(db: Kysely<Database>, limit: number) {
    try {
        const [summaryResult, tasksResult, jobsResult] = await Promise.all([
            sql<QueueSummaryRow>`
                SELECT
                    COUNT(*)::text AS total,
                    COUNT(*) FILTER (WHERE locked_by IS NOT NULL)::text AS running,
                    COUNT(*) FILTER (
                        WHERE attempts < max_attempts
                          AND locked_by IS NULL
                          AND run_at <= now()
                    )::text AS ready,
                    COUNT(*) FILTER (
                        WHERE attempts < max_attempts
                          AND locked_by IS NULL
                          AND run_at > now()
                    )::text AS scheduled,
                    COUNT(*) FILTER (WHERE attempts >= max_attempts)::text AS failed,
                    MIN(created_at) FILTER (WHERE attempts < max_attempts) AS oldest_pending_at
                FROM graphile_worker.jobs
                WHERE task_identifier IN (${monitoredTaskSql()})
            `.execute(db),
            sql<QueueTaskRow>`
                SELECT
                    task_identifier,
                    COUNT(*)::text AS total,
                    COUNT(*) FILTER (WHERE locked_by IS NOT NULL)::text AS running,
                    COUNT(*) FILTER (
                        WHERE attempts < max_attempts
                          AND locked_by IS NULL
                          AND run_at <= now()
                    )::text AS ready,
                    COUNT(*) FILTER (
                        WHERE attempts < max_attempts
                          AND locked_by IS NULL
                          AND run_at > now()
                    )::text AS scheduled,
                    COUNT(*) FILTER (WHERE attempts >= max_attempts)::text AS failed,
                    MIN(created_at) AS oldest_created_at,
                    MAX(updated_at) AS latest_updated_at,
                    MAX(LEFT(last_error, 500)) FILTER (WHERE last_error IS NOT NULL) AS latest_error
                FROM graphile_worker.jobs
                WHERE task_identifier IN (${monitoredTaskSql()})
                GROUP BY task_identifier
                ORDER BY
                    COUNT(*) FILTER (WHERE attempts >= max_attempts) DESC,
                    COUNT(*) FILTER (WHERE locked_by IS NOT NULL) DESC,
                    COUNT(*) DESC,
                    task_identifier ASC
            `.execute(db),
            sql<QueueJobRow>`
                SELECT
                    id::text AS id,
                    task_identifier,
                    CASE
                        WHEN attempts >= max_attempts THEN 'failed'
                        WHEN locked_by IS NOT NULL THEN 'running'
                        WHEN run_at > now() THEN 'scheduled'
                        ELSE 'ready'
                    END AS state,
                    attempts,
                    max_attempts,
                    created_at,
                    updated_at,
                    run_at,
                    locked_at,
                    NULLIF(LEFT(COALESCE(last_error, ''), 500), '') AS last_error
                FROM graphile_worker.jobs
                WHERE task_identifier IN (${monitoredTaskSql()})
                ORDER BY
                    CASE
                        WHEN attempts >= max_attempts THEN 0
                        WHEN locked_by IS NOT NULL THEN 1
                        WHEN run_at <= now() THEN 2
                        ELSE 3
                    END,
                    updated_at DESC
                LIMIT ${limit}
            `.execute(db),
        ]);

        const summaryRow = summaryResult.rows[0];
        return {
            summary: {
                available: true,
                total: numberValue(summaryRow?.total),
                running: numberValue(summaryRow?.running),
                ready: numberValue(summaryRow?.ready),
                scheduled: numberValue(summaryRow?.scheduled),
                failed: numberValue(summaryRow?.failed),
                oldest_pending_at: isoValue(summaryRow?.oldest_pending_at),
            },
            tasks: tasksResult.rows.map((row) => ({
                task_identifier: row.task_identifier,
                total: numberValue(row.total),
                running: numberValue(row.running),
                ready: numberValue(row.ready),
                scheduled: numberValue(row.scheduled),
                failed: numberValue(row.failed),
                oldest_created_at: isoValue(row.oldest_created_at),
                latest_updated_at: isoValue(row.latest_updated_at),
                latest_error: row.latest_error,
            })),
            jobs: jobsResult.rows.map((row) => ({
                id: row.id,
                task_identifier: row.task_identifier,
                state: row.state,
                attempts: numberValue(row.attempts),
                max_attempts: numberValue(row.max_attempts),
                created_at: isoValue(row.created_at)!,
                updated_at: isoValue(row.updated_at)!,
                run_at: isoValue(row.run_at)!,
                locked_at: isoValue(row.locked_at),
                last_error: row.last_error,
            })),
        };
    } catch (error) {
        const code = (error as { code?: string }).code;
        if (code !== '42P01' && code !== '3F000') throw error;

        return {
            summary: {
                available: false,
                total: 0,
                running: 0,
                ready: 0,
                scheduled: 0,
                failed: 0,
                oldest_pending_at: null,
            },
            tasks: [],
            jobs: [],
        };
    }
}

async function loadPipelineHistory(db: Kysely<Database>, hours: number, limit: number) {
    try {
        const runsResult = await sql<PipelineRunRow>`
            SELECT
                run_key,
                status,
                current_stage,
                window_start,
                started_at,
                finished_at,
                duration_ms,
                attempt_count,
                error_message,
                COUNT(*) OVER()::text AS total_count
            FROM scraping_pipeline_runs
            WHERE started_at >= now() - make_interval(hours => ${hours})
            ORDER BY started_at DESC
            LIMIT ${limit}
        `.execute(db);

        if (runsResult.rows.length === 0) {
            return {
                available: true,
                retention_days: PIPELINE_HISTORY_RETENTION_DAYS,
                total: 0,
                runs: [],
            };
        }

        const runKeys = runsResult.rows.map((row) => sql`${row.run_key}`);
        const stagesResult = await sql<PipelineStageRow>`
            SELECT
                run_key,
                stage,
                status,
                started_at,
                finished_at,
                duration_ms,
                attempt_count,
                summary,
                error_message
            FROM scraping_pipeline_run_stages
            WHERE run_key IN (${sql.join(runKeys)})
            ORDER BY started_at ASC
        `.execute(db);

        const stagesByRun = new Map<string, PipelineStageRow[]>();
        for (const stage of stagesResult.rows) {
            const stages = stagesByRun.get(stage.run_key) ?? [];
            stages.push(stage);
            stagesByRun.set(stage.run_key, stages);
        }

        return {
            available: true,
            retention_days: PIPELINE_HISTORY_RETENTION_DAYS,
            total: numberValue(runsResult.rows[0]?.total_count),
            runs: runsResult.rows.map((row) => ({
                run_key: row.run_key,
                status: row.status,
                current_stage: row.current_stage,
                window_start: isoValue(row.window_start)!,
                started_at: isoValue(row.started_at)!,
                finished_at: isoValue(row.finished_at),
                duration_ms: row.duration_ms === null ? null : numberValue(row.duration_ms),
                attempt_count: numberValue(row.attempt_count),
                error_message: row.error_message,
                stages: (stagesByRun.get(row.run_key) ?? []).map((stage) => ({
                    stage: stage.stage,
                    status: stage.status,
                    started_at: isoValue(stage.started_at)!,
                    finished_at: isoValue(stage.finished_at),
                    duration_ms: stage.duration_ms === null ? null : numberValue(stage.duration_ms),
                    attempt_count: numberValue(stage.attempt_count),
                    summary: objectValue(stage.summary),
                    error_message: stage.error_message,
                })),
            })),
        };
    } catch (error) {
        const code = (error as { code?: string }).code;
        if (code !== '42P01' && code !== '3F000') throw error;

        return {
            available: false,
            retention_days: PIPELINE_HISTORY_RETENTION_DAYS,
            total: 0,
            runs: [],
        };
    }
}

export function scrapingMonitorRoutes(db: Kysely<Database>): FastifyPluginAsync {
    return async function (app) {
        app.get('/monitor', {
            schema: {
                querystring: QuerySchema,
                response: {
                    200: ScrapingMonitorResponseSchema,
                },
            },
        }, async (request, reply) => {
            const { hours, limit } = QuerySchema.parse(request.query);

            const [
                queue,
                pipelineHistory,
                scrapeSummaryResult,
                recentScrapesResult,
                resourceFailuresResult,
            ] = await Promise.all([
                loadQueueSnapshot(db, limit),
                loadPipelineHistory(db, hours, limit),
                sql<ScrapeSummaryRow>`
                    SELECT
                        COUNT(*)::text AS total,
                        COUNT(*) FILTER (WHERE status = 'pending')::text AS pending,
                        COUNT(*) FILTER (WHERE status = 'processed')::text AS processed,
                        COUNT(*) FILTER (WHERE status = 'failed')::text AS failed,
                        MAX(scraped_at) AS latest_scrape_at
                    FROM staging.raw_scrape_logs
                    WHERE scraped_at >= now() - make_interval(hours => ${hours})
                `.execute(db),
                sql<RecentScrapeRow>`
                    SELECT
                        log.id,
                        platform.name AS platform_name,
                        log.endpoint_url,
                        log.status::text AS status,
                        log.scraped_at,
                        octet_length(log.raw_payload) AS payload_bytes
                    FROM staging.raw_scrape_logs AS log
                    JOIN platforms AS platform ON platform.id = log.platform_id
                    WHERE log.scraped_at >= now() - make_interval(hours => ${hours})
                    ORDER BY log.scraped_at DESC
                    LIMIT ${limit}
                `.execute(db),
                sql<ResourceFailureRow>`
                    SELECT
                        resource.id,
                        platform.name AS platform_name,
                        instance.name AS source_instance_name,
                        resource.resource_type,
                        COALESCE(resource.name, resource.external_id) AS resource_name,
                        resource.public_url,
                        resource.consecutive_failures,
                        resource.last_fetched_at,
                        resource.last_succeeded_at,
                        resource.updated_at,
                        LEFT(COALESCE(resource.last_error, 'Unknown scrape error'), 500) AS last_error,
                        COUNT(*) OVER()::text AS total_count
                    FROM source_resources AS resource
                    JOIN source_instances AS instance ON instance.id = resource.source_instance_id
                    JOIN platforms AS platform ON platform.id = instance.platform_id
                    WHERE resource.enabled = true
                      AND instance.enabled = true
                      AND resource.consecutive_failures > 0
                    ORDER BY resource.consecutive_failures DESC, resource.updated_at DESC
                    LIMIT ${limit}
                `.execute(db),
            ]);

            const scrapeRow = scrapeSummaryResult.rows[0];
            const total = numberValue(scrapeRow?.total);
            const pending = numberValue(scrapeRow?.pending);
            const processed = numberValue(scrapeRow?.processed);
            const failed = numberValue(scrapeRow?.failed);
            const transformed = processed + failed;
            const activeResourceFailures = numberValue(resourceFailuresResult.rows[0]?.total_count);
            const latestPipelineRun = pipelineHistory.runs[0];

            const state = queue.summary.failed > 0
                || activeResourceFailures > 0
                || latestPipelineRun?.status === 'failed'
                ? 'attention' as const
                : queue.summary.running > 0
                    || queue.summary.ready > 0
                    || pending > 0
                    || latestPipelineRun?.status === 'running'
                    ? 'running' as const
                    : queue.summary.scheduled > 0
                        ? 'scheduled' as const
                        : total > 0 || pipelineHistory.total > 0
                            ? 'idle' as const
                            : 'unobserved' as const;

            reply.header('Cache-Control', 'private, no-store');
            return reply.send({
                generated_at: new Date().toISOString(),
                window_hours: hours,
                state,
                queue: queue.summary,
                scrapes: {
                    total,
                    pending,
                    processed,
                    failed,
                    transform_progress_pct: percentage(transformed, total),
                    transform_success_pct: percentage(processed, transformed),
                    latest_scrape_at: isoValue(scrapeRow?.latest_scrape_at),
                },
                pipeline_history: pipelineHistory,
                active_resource_failures: activeResourceFailures,
                tasks: queue.tasks,
                recent_jobs: queue.jobs,
                recent_scrapes: recentScrapesResult.rows.map((row) => ({
                    id: row.id,
                    platform_name: row.platform_name,
                    endpoint_url: row.endpoint_url,
                    status: row.status,
                    scraped_at: isoValue(row.scraped_at)!,
                    payload_bytes: numberValue(row.payload_bytes),
                })),
                resource_failures: resourceFailuresResult.rows.map((row) => ({
                    id: row.id,
                    platform_name: row.platform_name,
                    source_instance_name: row.source_instance_name,
                    resource_type: row.resource_type,
                    resource_name: row.resource_name,
                    public_url: row.public_url,
                    consecutive_failures: numberValue(row.consecutive_failures),
                    last_fetched_at: isoValue(row.last_fetched_at),
                    last_succeeded_at: isoValue(row.last_succeeded_at),
                    updated_at: isoValue(row.updated_at)!,
                    last_error: row.last_error,
                })),
            });
        });

        app.get('/jobs/:jobId', {
            schema: {
                params: QueueJobParamsSchema,
                response: {
                    200: QueueJobDetailsSchema,
                    404: ErrorResponseSchema,
                },
            },
        }, async (request, reply) => {
            const { jobId } = QueueJobParamsSchema.parse(request.params);
            const result = await sql<QueueJobDetailsRow>`
                SELECT
                    id::text AS id,
                    task_identifier,
                    CASE
                        WHEN attempts >= max_attempts THEN 'failed'
                        WHEN locked_by IS NOT NULL THEN 'running'
                        WHEN run_at > now() THEN 'scheduled'
                        ELSE 'ready'
                    END AS state,
                    payload,
                    attempts,
                    max_attempts,
                    created_at,
                    updated_at,
                    run_at,
                    locked_at,
                    NULLIF(LEFT(COALESCE(last_error, ''), 10000), '') AS last_error
                FROM graphile_worker.jobs
                WHERE id = ${jobId}::bigint
                  AND task_identifier IN (${monitoredTaskSql()})
                LIMIT 1
            `.execute(db);
            const row = result.rows[0];

            if (!row) {
                return reply.status(404).send({
                    error: 'Queue job not found',
                    statusCode: 404,
                });
            }

            reply.header('Cache-Control', 'private, no-store');
            return reply.send({
                id: row.id,
                task_identifier: row.task_identifier,
                state: row.state,
                attempts: numberValue(row.attempts),
                max_attempts: numberValue(row.max_attempts),
                created_at: isoValue(row.created_at)!,
                updated_at: isoValue(row.updated_at)!,
                run_at: isoValue(row.run_at)!,
                locked_at: isoValue(row.locked_at),
                last_error: row.last_error,
                payload: objectValue(redactJobPayload(row.payload)),
            });
        });
    };
}
