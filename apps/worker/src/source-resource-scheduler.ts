import type { Kysely } from 'kysely';
import { stableJobKey, RETRYABLE_JOB_SPEC } from './job-policy.js';

export interface PersistedSourceResource {
    id: string;
    sourceInstanceId: string;
    adapterKey: string;
    resourceType: string;
    externalId: string;
    publicUrl: string | null;
    refreshPolicy: unknown;
    lastFetchedAt: Date | null;
    lastSucceededAt: Date | null;
    consecutiveFailures: number;
}

export interface DueSourceJob {
    taskIdentifier: string;
    payload: Record<string, unknown>;
    jobKey: string;
}

export interface SourceResourceSchedulerOptions {
    scanBatchSize?: number;
    dueLimit?: number;
}

export interface DueSourceResourceScan {
    resources: PersistedSourceResource[];
    scanned: number;
}

const CADENCE_MS: Record<string, number> = {
    hourly: 60 * 60 * 1_000,
    daily: 24 * 60 * 60 * 1_000,
    'daily-during-event-weekly-after': 24 * 60 * 60 * 1_000,
    weekly: 7 * 24 * 60 * 60 * 1_000,
    'weekly-after-completion': 7 * 24 * 60 * 60 * 1_000,
};
const DEFAULT_SCAN_BATCH_SIZE = 250;
const DEFAULT_DUE_LIMIT = 250;
const MAX_SCHEDULER_BATCH = 1_000;

function policyObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

function boundedPositiveInteger(
    value: number | undefined,
    fallback: number,
): number {
    if (!Number.isInteger(value) || (value ?? 0) <= 0) return fallback;
    return Math.min(value!, MAX_SCHEDULER_BATCH);
}

function configuredPositiveInteger(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined || raw.trim() === '') return fallback;
    const value = Number(raw);
    return boundedPositiveInteger(value, fallback);
}

export function sourceResourceSchedulerLimits(
    options: SourceResourceSchedulerOptions = {},
): { scanBatchSize: number; dueLimit: number } {
    return {
        scanBatchSize: boundedPositiveInteger(
            options.scanBatchSize,
            configuredPositiveInteger(
                'SOURCE_RESOURCE_SCHEDULER_SCAN_BATCH',
                DEFAULT_SCAN_BATCH_SIZE,
            ),
        ),
        dueLimit: boundedPositiveInteger(
            options.dueLimit,
            configuredPositiveInteger(
                'SOURCE_RESOURCE_SCHEDULER_DUE_LIMIT',
                DEFAULT_DUE_LIMIT,
            ),
        ),
    };
}

export function sourceResourceRefreshIntervalMs(policy: unknown): number {
    const value = policyObject(policy);
    const explicit = Number(value['intervalMs']);
    if (Number.isFinite(explicit) && explicit >= 0) {
        return Math.min(explicit, 365 * 24 * 60 * 60 * 1_000);
    }
    const cadence = typeof value['cadence'] === 'string' ? value['cadence'] : 'daily';
    return CADENCE_MS[cadence] ?? CADENCE_MS.daily;
}

export function sourceResourceFailureBackoffMs(consecutiveFailures: number): number {
    if (!Number.isInteger(consecutiveFailures) || consecutiveFailures <= 0) return 0;
    return Math.min(
        24 * 60 * 60 * 1_000,
        5 * 60 * 1_000 * 2 ** Math.min(consecutiveFailures - 1, 8),
    );
}

export function isPersistedSourceResourceDue(
    resource: Pick<
        PersistedSourceResource,
        'lastFetchedAt' | 'lastSucceededAt' | 'refreshPolicy' | 'consecutiveFailures'
    >,
    now: Date = new Date(),
): boolean {
    if (resource.consecutiveFailures > 0) {
        const lastAttempt = resource.lastFetchedAt;
        if (!lastAttempt) return true;
        return now.getTime() - lastAttempt.getTime()
            >= sourceResourceFailureBackoffMs(resource.consecutiveFailures);
    }

    if (!resource.lastSucceededAt) return true;
    return now.getTime() - resource.lastSucceededAt.getTime()
        >= sourceResourceRefreshIntervalMs(resource.refreshPolicy);
}

export function sourceResourceJob(resource: PersistedSourceResource): DueSourceJob | null {
    if (resource.adapterKey !== 'tournamentsoftware-vetts') return null;

    if (resource.resourceType === 'directory') {
        return {
            taskIdentifier: 'scrapeVettsTournamentsTask',
            payload: {},
            jobKey: stableJobKey('scrape-vetts-tournaments'),
        };
    }

    if (resource.resourceType === 'event' || resource.resourceType === 'event-results') {
        const tournamentId = resource.externalId.split(':')[0];
        if (!tournamentId) return null;
        return {
            taskIdentifier: 'scrapeVettsTournamentTask',
            payload: { tournamentId },
            // Match the VETTS discovery fan-out key so both scheduling paths
            // converge on the same logical refresh job.
            jobKey: stableJobKey('scrape-vetts-tournament', tournamentId),
        };
    }

    return null;
}

export async function loadDueSourceResources(
    database: Kysely<any>,
    now: Date = new Date(),
    options: SourceResourceSchedulerOptions = {},
): Promise<DueSourceResourceScan> {
    const { scanBatchSize, dueLimit } = sourceResourceSchedulerLimits(options);
    const due: PersistedSourceResource[] = [];
    let afterId: string | null = null;
    let scanned = 0;

    while (due.length < dueLimit) {
        let query = database
            .selectFrom('source_resources as resource')
            .innerJoin('source_instances as instance', 'instance.id', 'resource.source_instance_id')
            .select([
                'resource.id as id',
                'resource.source_instance_id as sourceInstanceId',
                'instance.adapter_key as adapterKey',
                'resource.resource_type as resourceType',
                'resource.external_id as externalId',
                'resource.public_url as publicUrl',
                'resource.refresh_policy as refreshPolicy',
                'resource.last_fetched_at as lastFetchedAt',
                'resource.last_succeeded_at as lastSucceededAt',
                'resource.consecutive_failures as consecutiveFailures',
            ])
            .where('resource.enabled', '=', true)
            .where('instance.enabled', '=', true)
            .orderBy('resource.id', 'asc')
            .limit(scanBatchSize);

        if (afterId) query = query.where('resource.id', '>', afterId);
        const rows = await query.execute() as PersistedSourceResource[];
        if (rows.length === 0) break;

        scanned += rows.length;
        for (const resource of rows) {
            if (isPersistedSourceResourceDue(resource, now)) {
                due.push(resource);
                if (due.length >= dueLimit) break;
            }
        }

        afterId = rows.at(-1)?.id ?? null;
        if (rows.length < scanBatchSize) break;
    }

    return { resources: due, scanned };
}

export async function enqueueDueSourceResources(
    database: Kysely<any>,
    addJob: (
        identifier: string,
        payload: Record<string, unknown>,
        spec: Record<string, unknown>,
    ) => Promise<unknown>,
    now: Date = new Date(),
    options: SourceResourceSchedulerOptions = {},
): Promise<{ due: number; queued: number; unsupported: number; scanned: number }> {
    const scan = await loadDueSourceResources(database, now, options);
    let queued = 0;
    let unsupported = 0;
    const queuedJobKeys = new Set<string>();

    for (const resource of scan.resources) {
        const job = sourceResourceJob(resource);
        if (!job) {
            unsupported += 1;
            continue;
        }
        if (queuedJobKeys.has(job.jobKey)) continue;

        await addJob(job.taskIdentifier, job.payload, {
            ...RETRYABLE_JOB_SPEC,
            jobKey: job.jobKey,
        });
        queuedJobKeys.add(job.jobKey);
        queued += 1;
    }

    return {
        due: scan.resources.length,
        queued,
        unsupported,
        scanned: scan.scanned,
    };
}
