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
    lastSucceededAt: Date | null;
    consecutiveFailures: number;
}

export interface DueSourceJob {
    taskIdentifier: string;
    payload: Record<string, unknown>;
    jobKey: string;
}

const CADENCE_MS: Record<string, number> = {
    hourly: 60 * 60 * 1_000,
    daily: 24 * 60 * 60 * 1_000,
    'daily-during-event-weekly-after': 24 * 60 * 60 * 1_000,
    weekly: 7 * 24 * 60 * 60 * 1_000,
    'weekly-after-completion': 7 * 24 * 60 * 60 * 1_000,
};

function policyObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
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

export function isPersistedSourceResourceDue(
    resource: Pick<PersistedSourceResource, 'lastSucceededAt' | 'refreshPolicy' | 'consecutiveFailures'>,
    now: Date = new Date(),
): boolean {
    if (!resource.lastSucceededAt) return true;

    const normalInterval = sourceResourceRefreshIntervalMs(resource.refreshPolicy);
    const failureBackoff = Math.min(
        24 * 60 * 60 * 1_000,
        5 * 60 * 1_000 * 2 ** Math.min(resource.consecutiveFailures, 8),
    );
    const interval = resource.consecutiveFailures > 0
        ? Math.min(normalInterval, failureBackoff)
        : normalInterval;

    return now.getTime() - resource.lastSucceededAt.getTime() >= interval;
}

export function sourceResourceJob(resource: PersistedSourceResource): DueSourceJob | null {
    if (resource.adapterKey === 'tournamentsoftware-vetts') {
        const tournamentId = resource.externalId.split(':')[0];
        if (!tournamentId) return null;
        return {
            taskIdentifier: 'scrapeVettsTournamentTask',
            payload: { tournamentId },
            jobKey: stableJobKey('source-resource', resource.sourceInstanceId, tournamentId),
        };
    }

    return null;
}

export async function loadDueSourceResources(
    database: Kysely<any>,
    now: Date = new Date(),
): Promise<PersistedSourceResource[]> {
    const rows = await database
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
            'resource.last_succeeded_at as lastSucceededAt',
            'resource.consecutive_failures as consecutiveFailures',
        ])
        .where('resource.enabled', '=', true)
        .where('instance.enabled', '=', true)
        .execute() as PersistedSourceResource[];

    return rows.filter((resource) => isPersistedSourceResourceDue(resource, now));
}

export async function enqueueDueSourceResources(
    database: Kysely<any>,
    addJob: (
        identifier: string,
        payload: Record<string, unknown>,
        spec: Record<string, unknown>,
    ) => Promise<unknown>,
    now: Date = new Date(),
): Promise<{ due: number; queued: number; unsupported: number }> {
    const due = await loadDueSourceResources(database, now);
    let queued = 0;
    let unsupported = 0;

    for (const resource of due) {
        const job = sourceResourceJob(resource);
        if (!job) {
            unsupported += 1;
            continue;
        }
        await addJob(job.taskIdentifier, job.payload, {
            ...RETRYABLE_JOB_SPEC,
            jobKey: job.jobKey,
        });
        queued += 1;
    }

    return { due: due.length, queued, unsupported };
}
