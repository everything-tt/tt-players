import { runSourceRateLimited } from './source-rate-limit.js';

/**
 * Polite request policy for the TT Leagues API
 * (https://ttleagues-api.azurewebsites.net).
 *
 * The 2026-07 batch set-fetch change removed the per-request 429 handling
 * that the previous bundled scraper had, so sustained backfills (one
 * `/matches/{id}/sets` call per completed match) tripped the source rate
 * limiter and permanently failed ingestion jobs. This helper restores
 * retry/backoff (including Retry-After) and spaces requests across the
 * whole process, mirroring the TT365 policy in tt365-http.ts.
 */

const TTL_API_HOST = 'ttleagues-api.azurewebsites.net';
const TTLEAGUES_SOURCE_RATE_KEY = 'ttleagues-api';

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

let ttlQueue: Promise<void> = Promise.resolve();
let ttlNextAllowedAt = 0;

export interface TTLeaguesFetchOptions {
    timeoutMs?: number;
    maxAttempts?: number;
}

function envNumber(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined || raw.trim() === '') return fallback;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isTTLeaguesUrl(input: RequestInfo | URL): boolean {
    let hostname: string;
    if (typeof input === 'string') {
        try {
            hostname = new URL(input).hostname;
        } catch {
            return false;
        }
    } else if (input instanceof URL) {
        hostname = input.hostname;
    } else if (typeof Request !== 'undefined' && input instanceof Request) {
        try {
            hostname = new URL(input.url).hostname;
        } catch {
            return false;
        }
    } else {
        return false;
    }
    return hostname.toLowerCase() === TTL_API_HOST;
}

function parseRetryAfterMs(header: string | null): number | null {
    if (!header) return null;
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds > 0) {
        return Math.ceil(seconds * 1000);
    }
    const asDate = Date.parse(header);
    if (!Number.isNaN(asDate)) {
        const delayMs = asDate - Date.now();
        return delayMs > 0 ? delayMs : null;
    }
    return null;
}

function rateLimitDelayMs(retryAfterHeader: string | null): number {
    const retryAfterMs = parseRetryAfterMs(retryAfterHeader);
    if (retryAfterMs !== null) return retryAfterMs;

    // The previous bundled scraper used a known-good 5s delay for 429s.
    // Preserve that conservative fallback when the upstream omits Retry-After.
    return envNumber('TTL_FETCH_429_RETRY_DELAY_MS', 5000);
}

function backoffDelayMs(attemptIndex: number): number {
    const baseMs = envNumber('TTL_FETCH_BACKOFF_BASE_MS', 1500);
    const jitterMs = envNumber('TTL_FETCH_BACKOFF_JITTER_MS', 250);
    return baseMs * (2 ** attemptIndex) + Math.floor(Math.random() * jitterMs);
}

function isRetryableError(error: unknown): boolean {
    return error instanceof Error
        && (error.name === 'AbortError' || error instanceof TypeError);
}

async function runTTLeaguesRateLimited(
    fn: () => Promise<Response>,
    leaseMs: number,
): Promise<Response> {
    let releaseQueue: (() => void) | null = null;
    const previous = ttlQueue;
    ttlQueue = new Promise<void>((resolve) => {
        releaseQueue = resolve;
    });

    await previous;
    try {
        const waitMs = Math.max(0, ttlNextAllowedAt - Date.now());
        if (waitMs > 0) {
            await sleep(waitMs);
        }

        const minIntervalMs = envNumber('TTL_FETCH_MIN_INTERVAL_MS', 400);
        ttlNextAllowedAt = Date.now() + Math.max(0, minIntervalMs);

        const response = await runSourceRateLimited(
            TTLEAGUES_SOURCE_RATE_KEY,
            minIntervalMs,
            leaseMs,
            fn,
            (result) => result.status === 429
                ? rateLimitDelayMs(result.headers.get('retry-after'))
                : 0,
        );
        if (response.status === 429) {
            // Apply the server-requested/fallback cooldown before releasing the
            // local queue. The same cooldown is persisted by the distributed
            // gate, so callers on every replica observe it.
            ttlNextAllowedAt = Math.max(
                ttlNextAllowedAt,
                Date.now() + rateLimitDelayMs(response.headers.get('retry-after')),
            );
        }
        return response;
    } finally {
        if (releaseQueue) {
            (releaseQueue as () => void)();
        }
    }
}

async function fetchWithTimeout(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    timeoutMs: number,
): Promise<Response> {
    if (timeoutMs <= 0) {
        return fetch(input, init);
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), timeoutMs);

    const externalSignal = init?.signal;
    const externalAbortHandler = externalSignal
        ? () => abortController.abort()
        : null;
    if (externalSignal && externalAbortHandler) {
        externalSignal.addEventListener('abort', externalAbortHandler, { once: true });
    }

    try {
        return await fetch(input, {
            ...init,
            signal: abortController.signal,
        });
    } finally {
        clearTimeout(timeout);
        if (externalSignal && externalAbortHandler) {
            externalSignal.removeEventListener('abort', externalAbortHandler);
        }
    }
}

/**
 * Applies polite request policy to TT Leagues API endpoints:
 * - global in-process request spacing (default 400ms)
 * - cross-replica request spacing via PostgreSQL source lease
 * - shared 429 cooldown (Retry-After, or 5s fallback)
 * - timeout guard
 * - bounded retry for transient statuses (429/5xx)
 *
 * Non-TT-Leagues URLs are fetched directly with no policy changes.
 */
export async function fetchWithTTLeaguesPolicy(
    input: RequestInfo | URL,
    init?: RequestInit,
    options: TTLeaguesFetchOptions = {},
): Promise<Response> {
    if (!isTTLeaguesUrl(input)) {
        const timeoutMs = options.timeoutMs ?? envNumber('TTL_FETCH_TIMEOUT_MS', 15000);
        return fetchWithTimeout(input, init, timeoutMs);
    }

    const timeoutMs = options.timeoutMs ?? envNumber('TTL_FETCH_TIMEOUT_MS', 15000);
    const maxAttempts = Math.max(1, options.maxAttempts ?? envNumber('TTL_FETCH_MAX_ATTEMPTS', 3));

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const response = await runTTLeaguesRateLimited(
                () => fetchWithTimeout(input, init, timeoutMs),
                Math.max(1_000, timeoutMs + 10_000),
            );

            if (!RETRYABLE_STATUSES.has(response.status) || attempt === maxAttempts) {
                return response;
            }

            try {
                await response.arrayBuffer();
            } catch {
                // Ignore body drain failures; we're retrying anyway.
            }

            // A 429 already extended both local and distributed cooldowns. The
            // next attempt waits in runTTLeaguesRateLimited().
            if (response.status !== 429) {
                await sleep(backoffDelayMs(attempt - 1));
            }
        } catch (error) {
            lastError = error;
            if (!isRetryableError(error) || attempt === maxAttempts) {
                throw error;
            }
            await sleep(backoffDelayMs(attempt - 1));
        }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function __resetTTLeaguesHttpForTests(): void {
    ttlQueue = Promise.resolve();
    ttlNextAllowedAt = 0;
}
