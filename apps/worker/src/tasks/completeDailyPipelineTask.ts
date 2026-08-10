import type { Task } from 'graphile-worker';
import { sql } from 'kysely';
import { db } from '@tt-players/db';
import { PIPELINE_JOB_SPEC, stableJobKey } from '../job-policy.js';
import { reconcilePlayersByName } from '../player-reconciler.js';
import { refreshApiReadModels } from '../read-models.js';
import { calculateRatingsWithReplay } from '../ratings/calculate-ratings-with-replay.js';

export const INGESTION_TASK_IDENTIFIERS = [
    'scrapeUrlTask',
    'processLogTask',
    'scrapeMatchesTask',
    'scrapeMatchSetsBatchTask',
    'processMatchSetsBatchTask',
    'scrapeSport80EventsTask',
    'scrapeSport80EventResultsTask',
    'scrapeSport80RankingsDiscoveryTask',
    'scrapeSport80RankingTableTask',
] as const;

export type DailyPipelineStage = 'wait-for-ingestion' | 'reconcile' | 'ratings' | 'read-models';
export type DailyPipelineStageOutcomeStatus = 'waiting' | 'advanced' | 'complete';

export interface DailyPipelinePayload {
    runKey?: string;
    windowStart?: string;
    stage?: DailyPipelineStage;
    /**
     * Manual runs use their own window (the trigger time) instead of the
     * daily 00:00 window, so they are not blocked by ingestion jobs that
     * permanently failed earlier in the day. Failures created after the
     * manual trigger still block the run.
     */
    manual?: boolean;
}

export interface IngestionQueueState {
    pending: number;
    failed: number;
}

export interface DailyPipelineStageOutcome {
    stage: DailyPipelineStage;
    status: DailyPipelineStageOutcomeStatus;
    nextStage: DailyPipelineStage | null;
    summary: Record<string, string | number | boolean | null>;
}

interface PipelineHelpers {
    addJob: (
        identifier: string,
        payload: unknown,
        spec?: Record<string, unknown>,
    ) => Promise<unknown>;
    logger: {
        info: (message: string) => void;
    };
}

interface RatingRunResult {
    complete: boolean;
    busy: boolean;
    processedPeriods: number;
    processedMatches: number;
    replayed: boolean;
}

export interface DailyPipelineDependencies {
    inspectIngestion: (windowStart: Date) => Promise<IngestionQueueState>;
    reconcile: (log: (message: string) => void) => Promise<void>;
    calculateRatings: (log: (message: string) => void) => Promise<RatingRunResult>;
    refreshReadModels: (log: (message: string) => void) => Promise<void>;
    now: () => Date;
    pollIntervalMs: number;
}

function positiveIntegerEnvironment(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined || raw.trim() === '') return fallback;

    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
        throw new Error(`${name} must be a positive integer.`);
    }
    return value;
}

export function normalizeDailyPipelinePayload(
    payload: DailyPipelinePayload | null | undefined,
    now: Date,
): Required<DailyPipelinePayload> {
    const defaultRunKey = now.toISOString().slice(0, 10);
    const manual = payload?.manual ?? false;
    const runKey = payload?.runKey || (manual ? `${defaultRunKey}-manual` : defaultRunKey);
    const windowStart = payload?.windowStart
        || (manual ? now.toISOString() : `${runKey}T00:00:00.000Z`);
    const stage = payload?.stage || 'wait-for-ingestion';

    if (!['wait-for-ingestion', 'reconcile', 'ratings', 'read-models'].includes(stage)) {
        throw new Error(`Unsupported daily pipeline stage: ${stage}`);
    }
    if (Number.isNaN(new Date(windowStart).getTime())) {
        throw new Error(`Invalid daily pipeline window start: ${windowStart}`);
    }

    return { runKey, windowStart, stage, manual };
}

async function queuePipelineStage(
    helpers: PipelineHelpers,
    payload: Required<DailyPipelinePayload>,
    stage: DailyPipelineStage,
    runAt?: Date,
): Promise<void> {
    await helpers.addJob('completeDailyPipelineTask', {
        ...payload,
        stage,
    }, {
        ...PIPELINE_JOB_SPEC,
        jobKey: stableJobKey('daily-pipeline', payload.runKey),
        runAt,
    });
}

export async function runDailyPipelineStage(
    payload: DailyPipelinePayload | null | undefined,
    helpers: PipelineHelpers,
    dependencies: DailyPipelineDependencies,
): Promise<DailyPipelineStageOutcome> {
    const now = dependencies.now();
    const normalized = normalizeDailyPipelinePayload(payload, now);
    const log = (message: string) => helpers.logger.info(message);

    if (normalized.stage === 'wait-for-ingestion') {
        const queue = await dependencies.inspectIngestion(new Date(normalized.windowStart));
        if (queue.failed > 0) {
            throw new Error(
                `daily pipeline ${normalized.runKey} blocked by ${queue.failed} permanently failed ingestion jobs`,
            );
        }

        if (queue.pending > 0) {
            log(`daily pipeline ${normalized.runKey}: waiting for ${queue.pending} ingestion jobs`);
            await queuePipelineStage(
                helpers,
                normalized,
                'wait-for-ingestion',
                new Date(now.getTime() + dependencies.pollIntervalMs),
            );
            return {
                stage: normalized.stage,
                status: 'waiting',
                nextStage: 'wait-for-ingestion',
                summary: { pending: queue.pending, failed: queue.failed },
            };
        }

        log(`daily pipeline ${normalized.runKey}: ingestion complete`);
        await queuePipelineStage(helpers, normalized, 'reconcile');
        return {
            stage: normalized.stage,
            status: 'advanced',
            nextStage: 'reconcile',
            summary: { pending: queue.pending, failed: queue.failed },
        };
    }

    if (normalized.stage === 'reconcile') {
        await dependencies.reconcile(log);
        await queuePipelineStage(helpers, normalized, 'ratings');
        return {
            stage: normalized.stage,
            status: 'advanced',
            nextStage: 'ratings',
            summary: {},
        };
    }

    if (normalized.stage === 'ratings') {
        const result = await dependencies.calculateRatings(log);
        log(
            `daily pipeline ${normalized.runKey}: ratings processed ${result.processedPeriods} periods`
            + ` and ${result.processedMatches} matches`
            + ` (complete=${result.complete}, busy=${result.busy}, replayed=${result.replayed})`,
        );

        const summary = {
            complete: result.complete,
            busy: result.busy,
            processed_periods: result.processedPeriods,
            processed_matches: result.processedMatches,
            replayed: result.replayed,
        };

        if (result.busy || !result.complete) {
            await queuePipelineStage(
                helpers,
                normalized,
                'ratings',
                new Date(now.getTime() + dependencies.pollIntervalMs),
            );
            return {
                stage: normalized.stage,
                status: 'waiting',
                nextStage: 'ratings',
                summary,
            };
        }

        await queuePipelineStage(helpers, normalized, 'read-models');
        return {
            stage: normalized.stage,
            status: 'advanced',
            nextStage: 'read-models',
            summary,
        };
    }

    await dependencies.refreshReadModels(log);
    log(`daily pipeline ${normalized.runKey}: derived data refresh complete`);
    return {
        stage: normalized.stage,
        status: 'complete',
        nextStage: null,
        summary: {},
    };
}

const productionDependencies: DailyPipelineDependencies = {
    inspectIngestion: async (windowStart) => {
        const identifiers = INGESTION_TASK_IDENTIFIERS.map((identifier) => sql`${identifier}`);
        const result = await sql<{ pending: number | string; failed: number | string }>`
            SELECT
                COUNT(*) FILTER (WHERE attempts < max_attempts)::int AS pending,
                COUNT(*) FILTER (WHERE attempts >= max_attempts)::int AS failed
            FROM graphile_worker.jobs
            WHERE task_identifier IN (${sql.join(identifiers)})
              AND created_at >= ${windowStart}
        `.execute(db);
        const row = result.rows[0];
        return {
            pending: Number(row?.pending ?? 0),
            failed: Number(row?.failed ?? 0),
        };
    },
    reconcile: async (log) => {
        await reconcilePlayersByName(db, { info: log });
    },
    calculateRatings: async (log) => calculateRatingsWithReplay(db, {}, log),
    refreshReadModels: async (log) => refreshApiReadModels(db, log),
    now: () => new Date(),
    pollIntervalMs: positiveIntegerEnvironment('DAILY_PIPELINE_POLL_MS', 5 * 60 * 1000),
};

function auditErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, 1_000);
}

async function beginPipelineRunAudit(payload: Required<DailyPipelinePayload>): Promise<void> {
    await sql`
        DELETE FROM scraping_pipeline_runs
        WHERE started_at < now() - make_interval(days => 14)
    `.execute(db);

    await sql`
        INSERT INTO scraping_pipeline_runs (
            run_key,
            window_start,
            status,
            current_stage,
            attempt_count
        ) VALUES (
            ${payload.runKey},
            ${new Date(payload.windowStart)},
            'running',
            ${payload.stage},
            1
        )
        ON CONFLICT (run_key) DO UPDATE SET
            status = 'running',
            current_stage = EXCLUDED.current_stage,
            finished_at = NULL,
            duration_ms = NULL,
            attempt_count = scraping_pipeline_runs.attempt_count + 1,
            error_message = NULL,
            updated_at = now()
    `.execute(db);

    await sql`
        INSERT INTO scraping_pipeline_run_stages (
            run_key,
            stage,
            status,
            attempt_count
        ) VALUES (
            ${payload.runKey},
            ${payload.stage},
            'running',
            1
        )
        ON CONFLICT (run_key, stage) DO UPDATE SET
            status = 'running',
            finished_at = NULL,
            duration_ms = NULL,
            attempt_count = scraping_pipeline_run_stages.attempt_count + 1,
            error_message = NULL,
            updated_at = now()
    `.execute(db);
}

async function completePipelineStageAudit(
    payload: Required<DailyPipelinePayload>,
    outcome: DailyPipelineStageOutcome,
): Promise<void> {
    const stageCompleted = outcome.status !== 'waiting';
    const stageStatus = stageCompleted ? 'completed' : 'waiting';

    await sql`
        UPDATE scraping_pipeline_run_stages
        SET
            status = ${stageStatus},
            finished_at = CASE WHEN ${stageCompleted} THEN now() ELSE NULL END,
            duration_ms = CASE
                WHEN ${stageCompleted}
                    THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - started_at)) * 1000)::bigint)
                ELSE NULL
            END,
            summary = ${JSON.stringify(outcome.summary)}::jsonb,
            error_message = NULL,
            updated_at = now()
        WHERE run_key = ${payload.runKey}
          AND stage = ${outcome.stage}
    `.execute(db);

    if (outcome.status === 'complete') {
        await sql`
            UPDATE scraping_pipeline_runs
            SET
                status = 'completed',
                current_stage = ${outcome.stage},
                finished_at = now(),
                duration_ms = GREATEST(
                    0,
                    FLOOR(EXTRACT(EPOCH FROM (now() - started_at)) * 1000)::bigint
                ),
                error_message = NULL,
                updated_at = now()
            WHERE run_key = ${payload.runKey}
        `.execute(db);
        return;
    }

    await sql`
        UPDATE scraping_pipeline_runs
        SET
            status = 'running',
            current_stage = ${outcome.nextStage ?? outcome.stage},
            error_message = NULL,
            updated_at = now()
        WHERE run_key = ${payload.runKey}
    `.execute(db);
}

async function failPipelineStageAudit(
    payload: Required<DailyPipelinePayload>,
    error: unknown,
): Promise<void> {
    const message = auditErrorMessage(error);

    await sql`
        UPDATE scraping_pipeline_run_stages
        SET
            status = 'failed',
            finished_at = now(),
            duration_ms = GREATEST(
                0,
                FLOOR(EXTRACT(EPOCH FROM (now() - started_at)) * 1000)::bigint
            ),
            error_message = ${message},
            updated_at = now()
        WHERE run_key = ${payload.runKey}
          AND stage = ${payload.stage}
    `.execute(db);

    await sql`
        UPDATE scraping_pipeline_runs
        SET
            status = 'failed',
            current_stage = ${payload.stage},
            finished_at = now(),
            duration_ms = GREATEST(
                0,
                FLOOR(EXTRACT(EPOCH FROM (now() - started_at)) * 1000)::bigint
            ),
            error_message = ${message},
            updated_at = now()
        WHERE run_key = ${payload.runKey}
    `.execute(db);
}

async function safelyWriteAudit(
    description: string,
    action: () => Promise<void>,
    log: (message: string) => void,
): Promise<void> {
    try {
        await action();
    } catch (error) {
        log(`daily pipeline audit ${description} failed: ${auditErrorMessage(error)}`);
    }
}

export const completeDailyPipelineTask: Task = async (payload, helpers) => {
    const normalized = normalizeDailyPipelinePayload(
        payload as DailyPipelinePayload | null | undefined,
        productionDependencies.now(),
    );
    const log = (message: string) => helpers.logger.info(message);

    await safelyWriteAudit(
        'start',
        () => beginPipelineRunAudit(normalized),
        log,
    );

    try {
        const outcome = await runDailyPipelineStage(
            normalized,
            helpers,
            productionDependencies,
        );
        await safelyWriteAudit(
            'completion',
            () => completePipelineStageAudit(normalized, outcome),
            log,
        );
    } catch (error) {
        await safelyWriteAudit(
            'failure',
            () => failPipelineStageAudit(normalized, error),
            log,
        );
        throw error;
    }
};