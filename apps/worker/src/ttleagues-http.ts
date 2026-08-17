import { runSourceRateLimited } from './source-rate-limit.js';

const TTLEAGUES_API_ORIGIN = 'https://ttleagues-api.azurewebsites.net';
const DEFAULT_TTL_FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_TTL_FETCH_MIN_INTERVAL_MS = 400;
const DEFAULT_TTL_FETCH_MAX_ATTEMPTS = 4;
const DEFAULT_TTL_FETCH_BACKOFF_BASE_MS = 1_000;
const DEFAULT_TTL_FETCH_BACKOFF_JITTER_MS = 250;
const DEFAULT_TTL_FETCH_429_RETRY_DELAY_MS = 5_000;
const TTLEAGUES_SOURCE_RATE_KEY = 'ttleagues-api';

let ttlQueue: Promise<void> = Promise.resolve();
let ttlNextAllowedAt = 0;

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
    if (Number.isFinite(seconds) && seconds >= 0) {
        return seconds * 1_000;
    }

    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? null : Math.max(0, timestamp - Date.now());
}

function retryDelayMs(attempt: number): number {
    const base = envNumber('TTL_FETCH_BACKOFF_BASE_MS', DEFAULT_TTL_FETCH_BACKOFF_BASE_MS);
    const jitter = envNumber('TTL_FETCH_BACKOFF_JITTER_MS', DEFAULT_TTL_FETCH_BACKOFF_JITTER_MS);
    return base * 2 ** Math.max(0, attempt - 1) + Math.random() * jitter;
}

function rateLimitDelayMs(response: Response): number {
    return parseRetryAfterMs(response)
        ?? envNumber('TTL_FETCH_429_RETRY_DELAY_MS', DEFAULT_TTL_FETCH_429_RETRY_DELAY_MS);
}

async function fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const relayAbort = () => controller.abort();
    init.signal?.addEventListener('abort', relayAbort, { once: true });

    try {
        return await fetch(url, {
            ...init,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
        init.signal?.removeEventListener('abort', relayAbort);
    }
}

async function runTTLeaguesRateLimited<T>(fn: () => Promise<T>): Promise<T> {
    const previous = ttlQueue;
    let release!: () => void;
    ttlQueue = new Promise<void>((resolve) => {
        release = resolve;
    });
    await previous;

    try {
        const minIntervalMs = envNumber(
            'TTL_FETCH_MIN_INTERVAL_MS',
            DEFAULT_TTL_FETCH_MIN_INTERVAL_MS,
        );
        const waitMs = Math.max(0, ttlNextAllowedAt - Date.now());
        if (waitMs > 0) await sleep(waitMs);
        ttlNextAllowedAt = Date.now() + minIntervalMs;
        return await fn();
    } finally {
        release();
    }
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
    return hostname.toLowerCase() === 'ttleagues-api.azurewebsites.net';
}

export async function fetchWithTTLeaguesPolicy(
    input: RequestInfo | URL,
    init: RequestInit = {},
    options: { timeoutMs?: number; maxAttempts?: number } = {},
): Promise<Response> {
    if (!isTTLeaguesUrl(input)) {
        const url = input instanceof Request ? input.url : input.toString();
        return fetchWithTimeout(
            url,
            init,
            options.timeoutMs ?? envNumber('TTL_FETCH_TIMEOUT_MS', DEFAULT_TTL_FETCH_TIMEOUT_MS),
        );
    }

    const url = input instanceof Request ? input.url : input.toString();
    const timeoutMs = options.timeoutMs
        ?? envNumber('TTL_FETCH_TIMEOUT_MS', DEFAULT_TTL_FETCH_TIMEOUT_MS);
    const maxAttempts = options.maxAttempts
        ?? Math.max(1, Math.floor(envNumber('TTL_FETCH_MAX_ATTEMPTS', DEFAULT_TTL_FETCH_MAX_ATTEMPTS)));

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let response: Response;
        try {
            response = await runTTLeaguesRateLimited(() =>
                runSourceRateLimited(
                    TTLEAGUES_SOURCE_RATE_KEY,
                    envNumber('TTL_FETCH_MIN_INTERVAL_MS', DEFAULT_TTL_FETCH_MIN_INTERVAL_MS),
                    timeoutMs + 10_000,
                    () => fetchWithTimeout(url, init, timeoutMs),
                    (result) => result.status === 429 ? rateLimitDelayMs(result) : 0,
                ),
            );
        } catch (error) {
            lastError = error;
            if (init.signal?.aborted || attempt >= maxAttempts) throw error;
            await sleep(retryDelayMs(attempt));
            continue;
        }

        if (response.status === 429) {
            const delay = rateLimitDelayMs(response);
            ttlNextAllowedAt = Math.max(ttlNextAllowedAt, Date.now() + delay);
            if (attempt < maxAttempts) {
                await sleep(delay);
                continue;
            }
            return response;
        }

        if (response.status >= 500 && attempt < maxAttempts) {
            await response.arrayBuffer().catch(() => undefined);
            await sleep(retryDelayMs(attempt));
            continue;
        }

        return response;
    }

    if (lastError instanceof Error) throw lastError;
    throw new Error(`TT Leagues request failed after ${maxAttempts} attempts: ${url}`);
}

export function __resetTTLeaguesHttpForTests(): void {
    ttlQueue = Promise.resolve();
    ttlNextAllowedAt = 0;
}
