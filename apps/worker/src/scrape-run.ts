import { createHash } from 'node:crypto';
import type { Task } from 'graphile-worker';
import { sql, type Kysely } from 'kysely';
import { stableJobKey } from './job-policy.js';

export type ScrapeRunResourceStatus = 'pending' | 'succeeded' | 'failed';

export interface ScrapeRunContext {
    runKey: string;
    resourceKey: string;
    source: string;
    resourceType: string;
}

export interface ScrapeRunSummary {
    exists: boolean;
    expected: number;
    pending: number;
    succeeded: number;
    failed: number;
}

export interface ScrapeRunPayload {
    scrapeRun?: ScrapeRunContext;
}

type TaskHelpers = Parameters<Task>[1];
type TaskJob = Pick<TaskHelpers['job'], 'attempts' | 'max_attempts'>;

type TrackedOutcome = ScrapeRunResourceStatus;

export interface TrackScrapeTaskOptions {
    resolveOutcome?: (
        payload: unknown,
        childJobsRegistered: number,
    ) => Promise<TrackedOutcome> | TrackedOutcome;
}

function stableValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .filter(([key]) => key !== 'scrapeRun')
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, child]) => [key, stableValue(child)]),
        );
    }
    return value;
}

function payloadFingerprint(value: unknown): string {
    return createHash('sha256')
        .update(JSON.stringify(stableValue(value)))
        .digest('hex')
        .slice(0, 24);
}

export function dailyScrapeRunKey(now: Date): string {
    return now.toISOString().slice(0, 10);
}

export function scrapeRunWindowStart(runKey: string): Date {
    const value = new Date(`${runKey}T00:00:00.000Z`);
    if (Number.isNaN(value.getTime())) throw new Error(`invalid scrape run key ${runKey}`);
    return value;
}

export function scrapeRunContext(payload: unknown): ScrapeRunContext | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const context = (payload as ScrapeRunPayload).scrapeRun;
    if (!context?.runKey || !context.resourceKey) return null;
    return context;
}

export function childScrapeRunContext(
    parent: ScrapeRunContext,
    identifier: string,
    payload: unknown,
): ScrapeRunContext {
    const digest = createHash('sha256')
        .update(parent.resourceKey)
        .update('\u0000')
        .update(identifier)
        .update('\u0000')
        .update(payloadFingerprint(payload))
        .digest('hex')
        .slice(0, 24);

    return {
        runKey: parent.runKey,
        resourceKey: `${identifier}:${digest}`,
        source: parent.source,
        resourceType: identifier,
    };
}

function attachContext(payload: unknown, context: ScrapeRunContext): unknown {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error(`tracked scrape job ${context.resourceType} requires an object payload`);
    }
    return {
        ...(payload as Record<string, unknown>),
        scrapeRun: context,
    };
}

function runScopedSpec(
    spec: Record<string, unknown> | undefined,
    runKey: string,
): Record<string, unknown> | undefined {
    if (!spec || typeof spec.jobKey !== 'string') return spec;
    return {
        ...spec,
        jobKey: stableJobKey('scrape-run-job', runKey, spec.jobKey),
    };
}

export async function ensureScrapeRun(
    database: Kysely<any>,
    runKey: string,
    windowStart: Date = scrapeRunWindowStart(runKey),
): Promise<void> {
    await sql`
        INSERT INTO scrape_runs (run_key, window_start, status)
        VALUES (${runKey}, ${windowStart}, 'running')
        ON CONFLICT (run_key) DO UPDATE SET
            window_start = EXCLUDED.window_start,
            status = CASE
                WHEN scrape_runs.status = 'succeeded' THEN scrape_runs.status
                ELSE 'running'
            END,
            updated_at = now()
    `.execute(database);
}

export async function registerScrapeRunResource(
    database: Kysely<any>,
    context: ScrapeRunContext,
): Promise<void> {
    await ensureScrapeRun(database, context.runKey);
    await sql`
        INSERT INTO scrape_run_resources (
            run_key,
            resource_key,
            source,
            resource_type,
            status
        ) VALUES (
            ${context.runKey},
            ${context.resourceKey},
            ${context.source},
            ${context.resourceType},
            'pending'
        )
        ON CONFLICT (run_key, resource_key) DO UPDATE SET
            source = EXCLUDED.source,
            resource_type = EXCLUDED.resource_type,
            updated_at = now()
    `.execute(database);
}

export async function beginScrapeRunResource(
    database: Kysely<any>,
    context: ScrapeRunContext,
): Promise<void> {
    await registerScrapeRunResource(database, context);
    await sql`
        UPDATE scrape_run_resources
        SET
            status = CASE WHEN status = 'succeeded' THEN status ELSE 'pending' END,
            attempt_count = attempt_count + 1,
            last_error = CASE WHEN status = 'succeeded' THEN last_error ELSE NULL END,
            started_at = CASE WHEN status = 'succeeded' THEN started_at ELSE now() END,
            finished_at = CASE WHEN status = 'succeeded' THEN finished_at ELSE NULL END,
            updated_at = now()
        WHERE run_key = ${context.runKey}
          AND resource_key = ${context.resourceKey}
    `.execute(database);
}

export async function succeedScrapeRunResource(
    database: Kysely<any>,
    context: ScrapeRunContext,
): Promise<void> {
    await sql`
        UPDATE scrape_run_resources
        SET
            status = 'succeeded',
            last_error = NULL,
            finished_at = now(),
            updated_at = now()
        WHERE run_key = ${context.runKey}
          AND resource_key = ${context.resourceKey}
    `.execute(database);
}

export async function failScrapeRunResource(
    database: Kysely<any>,
    context: ScrapeRunContext,
    error: unknown,
): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await sql`
        UPDATE scrape_run_resources
        SET
            status = 'failed',
            last_error = ${message.slice(0, 2_000)},
            finished_at = now(),
            updated_at = now()
        WHERE run_key = ${context.runKey}
          AND resource_key = ${context.resourceKey}
          AND status <> 'succeeded'
    `.execute(database);
}

export async function recordScrapeRunTaskFailure(
    database: Kysely<any>,
    context: ScrapeRunContext,
    job: TaskJob,
    error: unknown,
): Promise<void> {
    if (job.attempts >= job.max_attempts) {
        await failScrapeRunResource(database, context, error);
        return;
    }

    const message = error instanceof Error ? error.message : String(error);
    await sql`
        UPDATE scrape_run_resources
        SET
            status = CASE WHEN status = 'succeeded' THEN status ELSE 'pending' END,
            last_error = CASE WHEN status = 'succeeded' THEN last_error ELSE ${message.slice(0, 2_000)} END,
            updated_at = now()
        WHERE run_key = ${context.runKey}
          AND resource_key = ${context.resourceKey}
    `.execute(database);
}

export async function inspectScrapeRun(
    database: Kysely<any>,
    runKey: string,
): Promise<ScrapeRunSummary> {
    const result = await sql<{
        run_exists: boolean;
        expected: number | string;
        pending: number | string;
        succeeded: number | string;
        failed: number | string;
    }>`
        SELECT
            EXISTS (SELECT 1 FROM scrape_runs WHERE run_key = ${runKey}) AS run_exists,
            COUNT(resource_key)::int AS expected,
            COUNT(resource_key) FILTER (WHERE status = 'pending')::int AS pending,
            COUNT(resource_key) FILTER (WHERE status = 'succeeded')::int AS succeeded,
            COUNT(resource_key) FILTER (WHERE status = 'failed')::int AS failed
        FROM scrape_run_resources
        WHERE run_key = ${runKey}
    `.execute(database);
    const row = result.rows[0];
    return {
        exists: row?.run_exists === true,
        expected: Number(row?.expected ?? 0),
        pending: Number(row?.pending ?? 0),
        succeeded: Number(row?.succeeded ?? 0),
        failed: Number(row?.failed ?? 0),
    };
}

export async function addTrackedScrapeJob(
    database: Kysely<any>,
    helpers: Pick<TaskHelpers, 'addJob'>,
    parent: ScrapeRunContext,
    identifier: string,
    payload: unknown,
    spec?: Record<string, unknown>,
): Promise<unknown> {
    if (Array.isArray(payload)) {
        const trackedPayload: unknown[] = [];
        for (const item of payload) {
            const child = childScrapeRunContext(parent, identifier, item);
            await registerScrapeRunResource(database, child);
            trackedPayload.push(attachContext(item, child));
        }
        return helpers.addJob(identifier, trackedPayload, runScopedSpec(spec, parent.runKey));
    }

    const child = childScrapeRunContext(parent, identifier, payload);
    await registerScrapeRunResource(database, child);
    return helpers.addJob(
        identifier,
        attachContext(payload, child),
        runScopedSpec(spec, parent.runKey),
    );
}

export async function runTrackedScrapeResource<T>(
    database: Kysely<any>,
    context: ScrapeRunContext,
    job: TaskJob,
    action: () => Promise<T>,
): Promise<T> {
    await beginScrapeRunResource(database, context);
    try {
        const result = await action();
        await succeedScrapeRunResource(database, context);
        return result;
    } catch (error) {
        await recordScrapeRunTaskFailure(database, context, job, error);
        throw error;
    }
}

export function trackScrapeTask(
    database: Kysely<any>,
    task: Task,
    options: TrackScrapeTaskOptions = {},
): Task {
    return async (payload, helpers) => {
        const context = scrapeRunContext(payload);
        if (!context) {
            return task(payload, helpers);
        }

        await beginScrapeRunResource(database, context);
        let childJobsRegistered = 0;
        const trackedHelpers = {
            ...helpers,
            addJob: async (
                identifier: string,
                childPayload: unknown,
                spec?: Record<string, unknown>,
            ) => {
                childJobsRegistered += Array.isArray(childPayload) ? childPayload.length : 1;
                return addTrackedScrapeJob(
                    database,
                    helpers,
                    context,
                    identifier,
                    childPayload,
                    spec,
                );
            },
        } as TaskHelpers;

        try {
            await task(payload, trackedHelpers);
            const outcome = await options.resolveOutcome?.(payload, childJobsRegistered)
                ?? 'succeeded';
            if (outcome === 'failed') {
                await failScrapeRunResource(
                    database,
                    context,
                    new Error(`${context.resourceType} completed with failed staged outcome`),
                );
            } else if (outcome === 'succeeded') {
                await succeedScrapeRunResource(database, context);
            }
        } catch (error) {
            await recordScrapeRunTaskFailure(database, context, helpers.job, error);
            throw error;
        }
    };
}
