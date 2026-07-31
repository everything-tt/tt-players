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

export interface DailyPipelinePayload {
    runKey?: string;
    windowStart?: string;
    stage?: DailyPipelineStage;
}

export interface IngestionQueueState {
    pending: number;
    failed: number;
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
    const runKey = payload?.runKey || defaultRunKey;
    const windowStart = payload?.windowStart || `${runKey}T00:00:00.000Z`;
    const stage = payload?.stage || 'wait-for-ingestion';

    if (!['wait-for-ingestion', 'reconcile', 'ratings', 'read-models'].includes(stage)) {
        throw new Error(`Unsupported daily pipeline stage: ${stage}`);
    }
    if (Number.isNaN(new Date(windowStart).getTime())) {
        throw new Error(`Invalid daily pipeline window start: ${windowStart}`);
    }

    return { runKey, windowStart, stage };
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
): Promise<void> {
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
            return;
        }

        log(`daily pipeline ${normalized.runKey}: ingestion complete`);
        await queuePipelineStage(helpers, normalized, 'reconcile');
        return;
    }

    if (normalized.stage === 'reconcile') {
        await dependencies.reconcile(log);
        await queuePipelineStage(helpers, normalized, 'ratings');
        return;
    }

    if (normalized.stage === 'ratings') {
        const result = await dependencies.calculateRatings(log);
        log(
            `daily pipeline ${normalized.runKey}: ratings processed ${result.processedPeriods} periods`
            + ` and ${result.processedMatches} matches`
            + ` (complete=${result.complete}, busy=${result.busy}, replayed=${result.replayed})`,
        );

        if (result.busy || !result.complete) {
            await queuePipelineStage(
                helpers,
                normalized,
                'ratings',
                new Date(now.getTime() + dependencies.pollIntervalMs),
            );
            return;
        }

        await queuePipelineStage(helpers, normalized, 'read-models');
        return;
    }

    await dependencies.refreshReadModels(log);
    log(`daily pipeline ${normalized.runKey}: derived data refresh complete`);
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

export const completeDailyPipelineTask: Task = async (payload, helpers) => {
    await runDailyPipelineStage(
        payload as DailyPipelinePayload | null | undefined,
        helpers,
        productionDependencies,
    );
};
