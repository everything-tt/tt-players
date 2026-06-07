const TT365_HOST_SUFFIX = 'tabletennis365.com';
const TT365_FETCH_MIN_INTERVAL_MS = Number(
    process.env['TT365_FETCH_MIN_INTERVAL_MS'] ?? '1200',
);
const TT365_FETCH_TIMEOUT_MS = Number(
    process.env['TT365_FETCH_TIMEOUT_MS'] ?? '15000',
);
const TT365_FETCH_MAX_ATTEMPTS = Number(
    process.env['TT365_FETCH_MAX_ATTEMPTS'] ?? '2',
);
const TT365_FETCH_BACKOFF_BASE_MS = Number(
    process.env['TT365_FETCH_BACKOFF_BASE_MS'] ?? '1500',
);
const TT365_FETCH_BACKOFF_JITTER_MS = Number(
    process.env['TT365_FETCH_BACKOFF_JITTER_MS'] ?? '300',
);

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

let tt365Queue: Promise<void> = Promise.resolve();
let tt365NextAllowedAt = 0;

export interface TT365FetchOptions {
    timeoutMs?: number;
    maxAttempts?: number;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrl(input: RequestInfo | URL): URL | null {
    if (input instanceof URL) return input;
    if (typeof input === 'string') {
        try {
            return new URL(input);
        } catch {
            return null;
        }
    }
    if (typeof Request !== 'undefined' && input instanceof Request) {
        try {
            return new URL(input.url);
        } catch {
            return null;
        }
    }
    return null;
}

function isTT365Url(input: RequestInfo | URL): boolean {
    const parsed = normalizeUrl(input);
    if (!parsed) return false;
    const host = parsed.hostname.toLowerCase();
    return host === TT365_HOST_SUFFIX || host.endsWith(`.${TT365_HOST_SUFFIX}`);
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

function backoffDelayMs(attemptIndex: number, retryAfterHeader: string | null): number {
    const retryAfterMs = parseRetryAfterMs(retryAfterHeader);
    if (retryAfterMs !== null) return retryAfterMs;
    const base = TT365_FETCH_BACKOFF_BASE_MS * (2 ** attemptIndex);
    const jitter = Math.floor(Math.random() * TT365_FETCH_BACKOFF_JITTER_MS);
    return base + jitter;
}

function isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
        return error.name === 'AbortError' || error instanceof TypeError;
    }
    return false;
}

async function runTT365RateLimited<T>(fn: () => Promise<T>): Promise<T> {
    let releaseQueue: (() => void) | null = null;
    const previous = tt365Queue;
    tt365Queue = new Promise<void>((resolve) => {
        releaseQueue = resolve;
    });

    await previous;
    try {
        const waitMs = Math.max(0, tt365NextAllowedAt - Date.now());
        if (waitMs > 0) {
            await sleep(waitMs);
        }
        tt365NextAllowedAt = Date.now() + Math.max(0, TT365_FETCH_MIN_INTERVAL_MS);
        return await fn();
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
 * Applies polite request policy to TT365 endpoints:
 * - global in-process request spacing
 * - timeout guard
 * - bounded retry for transient status/network failures
 *
 * Non-TT365 URLs are fetched directly with no policy changes.
 */
export async function fetchWithTT365Policy(
    input: RequestInfo | URL,
    init?: RequestInit,
    options?: TT365FetchOptions,
): Promise<Response> {
    if (!isTT365Url(input)) {
        const timeoutMs = options?.timeoutMs ?? TT365_FETCH_TIMEOUT_MS;
        return fetchWithTimeout(input, init, timeoutMs);
    }

    const timeoutMs = options?.timeoutMs ?? TT365_FETCH_TIMEOUT_MS;
    const maxAttempts = Math.max(1, options?.maxAttempts ?? TT365_FETCH_MAX_ATTEMPTS);

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const response = await runTT365RateLimited(() =>
                fetchWithTimeout(input, init, timeoutMs),
            );

            if (!RETRYABLE_STATUSES.has(response.status) || attempt === maxAttempts) {
                return response;
            }

            try {
                await response.arrayBuffer();
            } catch {
                // Ignore body drain failures; we're retrying anyway.
            }

            await sleep(
                backoffDelayMs(
                    attempt - 1,
                    response.headers.get('retry-after'),
                ),
            );
        } catch (error) {
            lastError = error;
            if (!isRetryableError(error) || attempt === maxAttempts) {
                throw error;
            }
            await sleep(backoffDelayMs(attempt - 1, null));
        }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
