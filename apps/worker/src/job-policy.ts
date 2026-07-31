import { createHash } from 'node:crypto';

export const RETRYABLE_JOB_SPEC = { maxAttempts: 3 } as const;

export function stableJobKey(prefix: string, ...parts: Array<string | number | null | undefined>): string {
    const digest = createHash('sha256')
        .update(parts.map((part) => String(part ?? '')).join('\u0000'))
        .digest('hex')
        .slice(0, 32);
    return `${prefix}:${digest}`;
}
