import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql, type Kysely } from 'kysely';
import { readDataVersion, type Database } from '@tt-players/db';

const HealthSchema = z.enum(['healthy', 'degraded', 'unobserved']);
const PipelineRunStatusSchema = z.enum(['running', 'completed', 'failed']);
const PipelineStageStatusSchema = z.enum(['running', 'waiting', 'completed', 'failed']);

const SourceQualityItemSchema = z.object({
    platform_id: z.string().uuid(),
    name: z.string(),
    base_url: z.string(),
    health: HealthSchema,
    leagues: z.number().int().nonnegative(),
    competitions: z.number().int().nonnegative(),
    fixtures: z.number().int().nonnegative(),
    rubbers: z.number().int().nonnegative(),
    dated_rubbers_pct: z.number().min(0).max(100),
    full_score_rubbers_pct: z.number().min(0).max(100),
    missing_player_rubbers: z.number().int().nonnegative(),
    external_players: z.number().int().nonnegative(),
    canonical_players: z.number().int().nonnegative(),
    total_scrapes: z.number().int().nonnegative(),
    failed_scrapes: z.number().int().nonnegative(),
    source_instances: z.number().int().nonnegative(),
    source_resources: z.number().int().nonnegative(),
    unhealthy_resources: z.number().int().nonnegative(),
    latest_activity_at: z.string().nullable(),
    last_error: z.string().nullable(),
});

export const SourceQualityResponseSchema = z.object({
    generated_at: z.string(),
    summary: z.object({
        providers: z.number().int().nonnegative(),
        healthy: z.number().int().nonnegative(),
        degraded: z.number().int().nonnegative(),
        unobserved: z.number().int().nonnegative(),
        leagues: z.number().int().nonnegative(),
        competitions: z.number().int().nonnegative(),
        canonical_players: z.number().int().nonnegative(),
        rubbers: z.number().int().nonnegative(),
        dated_rubbers_pct: z.number().min(0).max(100),
        full_score_rubbers_pct: z.number().min(0).max(100),
        missing_player_rubbers: z.number().int().nonnegative(),
        pending_identity_suggestions: z.number().int().nonnegative(),
        unhealthy_resources: z.number().int().nonnegative(),
    }),
    sources: z.array(SourceQualityItemSchema),
});

const DataUpdateStageSchema = z.object({
    stage: z.string(),
    status: PipelineStageStatusSchema,
    started_at: z.string(),
    finished_at: z.string().nullable(),
    duration_ms: z.number().int().nonnegative().nullable(),
    attempt_count: z.number().int().nonnegative(),
    summary: z.record(z.unknown()),
    recorded_at: z.string(),
});

const DataUpdateRunSchema = z.object({
    run_key: z.string(),
    status: PipelineRunStatusSchema,
    current_stage: z.string(),
    window_start: z.string(),
    started_at: z.string(),
    finished_at: z.string().nullable(),
    duration_ms: z.number().int().nonnegative().nullable(),
    attempt_count: z.number().int().nonnegative(),
    recorded_at: z.string(),
    stages: z.array(DataUpdateStageSchema),
});

export const DataUpdatesResponseSchema = z.object({
    generated_at: z.string(),
    available: z.boolean(),
    latest_recorded_at: z.string().nullable(),
    run: DataUpdateRunSchema.nullable(),
});

const ErrorSchema = z.object({
    error: z.string(),
    statusCode: z.number().int(),
});

interface PipelineRunRow {
    run_key: string;
    status: 'running' | 'completed' | 'failed';
    current_stage: string;
    window_start: Date | string;
    started_at: Date | string;
    finished_at: Date | string | null;
    duration_ms: number | string | null;
    attempt_count: number | string;
    updated_at: Date | string;
}

interface PipelineStageRow {
    stage: string;
    status: 'running' | 'waiting' | 'completed' | 'failed';
    started_at: Date | string;
    finished_at: Date | string | null;
    duration_ms: number | string | null;
    attempt_count: number | string;
    summary: unknown;
    updated_at: Date | string;
}

function numberValue(value: number | string | null | undefined): number {
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

function latestIso(values: Array<Date | string | null | undefined>): string | null {
    let latest = 0;
    for (const value of values) {
        const iso = isoValue(value);
        if (!iso) continue;
        latest = Math.max(latest, new Date(iso).getTime());
    }
    return latest === 0 ? null : new Date(latest).toISOString();
}

async function loadDataUpdatesSnapshot(db: Kysely<Database>) {
    try {
        const runResult = await sql<PipelineRunRow>`
            SELECT
                run_key,
                status,
                current_stage,
                window_start,
                started_at,
                finished_at,
                duration_ms,
                attempt_count,
                updated_at
            FROM scraping_pipeline_runs
            ORDER BY started_at DESC
            LIMIT 1
        `.execute(db);

        const run = runResult.rows[0];
        if (!run) {
            return {
                generated_at: new Date().toISOString(),
                available: true,
                latest_recorded_at: null,
                run: null,
            };
        }

        const stagesResult = await sql<PipelineStageRow>`
            SELECT
                stage,
                status,
                started_at,
                finished_at,
                duration_ms,
                attempt_count,
                summary,
                updated_at
            FROM scraping_pipeline_run_stages
            WHERE run_key = ${run.run_key}
            ORDER BY started_at ASC
        `.execute(db);

        const stages = stagesResult.rows.map((stage) => ({
            stage: stage.stage,
            status: stage.status,
            started_at: isoValue(stage.started_at)!,
            finished_at: isoValue(stage.finished_at),
            duration_ms: stage.duration_ms === null ? null : numberValue(stage.duration_ms),
            attempt_count: numberValue(stage.attempt_count),
            summary: objectValue(stage.summary),
            recorded_at: isoValue(stage.updated_at)!,
        }));
        const runRecordedAt = isoValue(run.updated_at)!;
        const latestRecordedAt = latestIso([run.updated_at, ...stagesResult.rows.map((stage) => stage.updated_at)]);

        return {
            generated_at: new Date().toISOString(),
            available: true,
            latest_recorded_at: latestRecordedAt,
            run: {
                run_key: run.run_key,
                status: run.status,
                current_stage: run.current_stage,
                window_start: isoValue(run.window_start)!,
                started_at: isoValue(run.started_at)!,
                finished_at: isoValue(run.finished_at),
                duration_ms: run.duration_ms === null ? null : numberValue(run.duration_ms),
                attempt_count: numberValue(run.attempt_count),
                recorded_at: runRecordedAt,
                stages,
            },
        };
    } catch (error) {
        const code = (error as { code?: string }).code;
        if (code !== '42P01' && code !== '3F000') throw error;

        return {
            generated_at: new Date().toISOString(),
            available: false,
            latest_recorded_at: null,
            run: null,
        };
    }
}

export function sourceQualityRoutes(db: Kysely<Database>): FastifyPluginAsync {
    return async function (app) {
        app.get('/quality', {
            schema: {
                response: {
                    200: SourceQualityResponseSchema,
                    503: ErrorSchema,
                },
            },
        }, async (_request, reply) => {
            const [snapshot, version] = await Promise.all([
                db
                    .selectFrom('source_quality_snapshots')
                    .select('content')
                    .where('key', '=', 'global')
                    .executeTakeFirst(),
                readDataVersion(db, 'source-quality'),
            ]);

            const parsed = SourceQualityResponseSchema.safeParse(snapshot?.content);
            if (!parsed.success) {
                return reply.status(503).send({
                    error: 'Source quality snapshot is not ready',
                    statusCode: 503,
                });
            }

            reply.header('ETag', `W/"source-quality-${version}"`);
            return reply.send(parsed.data);
        });

        app.get('/updates', {
            schema: {
                response: {
                    200: DataUpdatesResponseSchema,
                },
            },
        }, async (_request, reply) => {
            const snapshot = await loadDataUpdatesSnapshot(db);
            reply.header('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=30');
            return reply.send(snapshot);
        });
    };
}
