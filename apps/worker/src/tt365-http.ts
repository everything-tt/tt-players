import { runSourceRateLimited } from './source-rate-limit.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MIN_INTERVAL_MS = 1_200;
const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_BACKOFF_BASE_MS = 2_000;
const DEFAULT_MAX_BACKOFF_MS = 60_000;
const TT365_SOURCE_RATE_KEY = 'tt365';

let tt365Queue: Promise<void> = Promise.resolve();
let tt365NextAllowedAt = 0;

function envNumber(name: string, fallback: number): number {
    const value = Number(process.env[name] ?? fallback);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(response: Response): number | null {
    const value = response.headers.get('retry-after');
    if (!value) return null;

    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;

    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? null : Math.max(0, timestamp - Date.now());
}

function backoffMs(attempt: number): number {
    const base = envNumber('TT365_FETCH_BACKOFF_BASE_MS', DEFAULT_BACKOFF_BASE_MS);
    const maximum = envNumber('TT365_FETCH_MAX_BACKOFF_MS', DEFAULT_MAX_BACKOFF_MS);
    return Math.min(maximum, base * 2 ** Math.max(0, attempt - 1));
}

function rateLimitDelayMs(response: Response, attempt: number): number {
    return Math.max(
        1_000,
        parseRetryAfterMs(response) ?? Math.max(30_000, backoffMs(attempt)),
    );
}

async function runTT365RateLimited<T>(fn: () => Promise<T>): Promise<T> {
    const previous = tt365Queue;
    let release!: () => void;
    tt365Queue = new Promise<void>((resolve) => {
        release = resolve;
    });
    await previous;

    try {
        const minIntervalMs = envNumber('TT365_FETCH_MIN_INTERVAL_MS', DEFAULT_MIN_INTERVAL_MS);
        const waitMs = Math.max(0, tt365NextAllowedAt - Date.now());
        if (waitMs > 0) await sleep(waitMs);
        tt365NextAllowedAt = Date.now() + minIntervalMs;
        return await fn();
    } finally {
        release();
    }
}

async function fetchWithTimeout(
    input: RequestInfo | URL,
    init: RequestInit,
    timeoutMs: number,
): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const relayAbort = () => controller.abort();
    init.signal?.addEventListener('abort', relayAbort, { once: true });

    try {
        return await fetch(input, {
            ...init,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
        init.signal?.removeEventListener('abort', relayAbort);
    }
}

export async function fetchWithTT365Policy(
    input: RequestInfo | URL,
    init: RequestInit = {},
    options: { timeoutMs?: number; maxAttempts?: number } = {},
): Promise<Response> {
    const timeoutMs = options.timeoutMs ?? envNumber('TT365_FETCH_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
    const maxAttempts = Math.max(
        1,
        options.maxAttempts ?? Math.floor(envNumber('TT365_FETCH_MAX_ATTEMPTS', DEFAULT_MAX_ATTEMPTS)),
    );

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let response: Response;
        try {
            response = await runTT365RateLimited(() =>
                runSourceRateLimited(
                    TT365_SOURCE_RATE_KEY,
                    envNumber('TT365_FETCH_MIN_INTERVAL_MS', DEFAULT_MIN_INTERVAL_MS),
                    timeoutMs + 10_000,
                    () => fetchWithTimeout(input, init, timeoutMs),
                    (result) => result.status === 429
                        ? rateLimitDelayMs(result, attempt)
                        : 0,
                ),
            );
        } catch (error) {
            lastError = error;
            if (init.signal?.aborted || attempt >= maxAttempts) throw error;
            await sleep(backoffMs(attempt));
            continue;
        }

        if (response.status === 429) {
            const delay = rateLimitDelayMs(response, attempt);
            tt365NextAllowedAt = Math.max(tt365NextAllowedAt, Date.now() + delay);
            if (attempt < maxAttempts) {
                await sleep(delay);
                continue;
            }
            return response;
        }

        if (response.status >= 500 && attempt < maxAttempts) {
            await response.arrayBuffer().catch(() => undefined);
            await sleep(backoffMs(attempt));
            continue;
        }

        return response;
    }

    if (lastError instanceof Error) throw lastError;
    throw new Error(`TT365 request failed after ${maxAttempts} attempts`);
}

export function __resetTT365HttpForTests(): void {
    tt365Queue = Promise.resolve();
    tt365NextAllowedAt = 0;
}
