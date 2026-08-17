export interface SourceFreshnessPolicy {
    minRefreshIntervalMs: number;
}

export function isSourceRefreshDue(
    lastSucceededAt: Date | string | null | undefined,
    policy: SourceFreshnessPolicy,
    now: Date = new Date(),
): boolean {
    if (!Number.isFinite(policy.minRefreshIntervalMs) || policy.minRefreshIntervalMs < 0) {
        throw new Error('source refresh interval must be a non-negative finite number');
    }
    if (!lastSucceededAt) return true;

    const succeededAt = new Date(lastSucceededAt);
    if (Number.isNaN(succeededAt.getTime())) return true;
    return now.getTime() - succeededAt.getTime() >= policy.minRefreshIntervalMs;
}

export function boundedRefreshIntervalMs(
    raw: string | undefined,
    fallback: number,
    maximum = 365 * 24 * 60 * 60 * 1_000,
): number {
    const parsed = Number(raw ?? fallback);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return Math.min(parsed, maximum);
}
