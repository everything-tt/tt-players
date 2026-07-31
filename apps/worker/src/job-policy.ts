import { createHash } from 'node:crypto';

/**
 * Refresh and processing jobs are idempotent for a given stable key. When the
 * matching job is already queued or running, another copy adds no value, so we
 * deliberately use Graphile Worker's locked-job deduplication mode.
 */
export const RETRYABLE_JOB_SPEC = {
    maxAttempts: 3,
    jobKeyMode: 'unsafe_dedupe',
} as const;

/**
 * Daily pipeline stages intentionally schedule their successor while the
 * current stage is locked. They therefore need replacement semantics rather
 * than unsafe deduplication.
 */
export const PIPELINE_JOB_SPEC = {
    maxAttempts: 3,
    jobKeyMode: 'replace',
    priority: 100,
} as const;

export function stableJobKey(prefix: string, ...parts: Array<string | number | null | undefined>): string {
    const digest = createHash('sha256')
        .update(parts.map((part) => String(part ?? '')).join('\u0000'))
        .digest('hex')
        .slice(0, 32);
    return `${prefix}:${digest}`;
}
