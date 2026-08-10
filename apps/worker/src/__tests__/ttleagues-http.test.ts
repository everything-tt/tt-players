import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    __resetTTLeaguesHttpForTests,
    fetchWithTTLeaguesPolicy,
} from '../ttleagues-http.js';

const TTL_URL = 'https://ttleagues-api.azurewebsites.net/api/matches/1001/sets';

function responseFor(status: number, retryAfter: string | null = null): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        arrayBuffer: async () => new ArrayBuffer(0),
        headers: {
            get: (name: string) => name.toLowerCase() === 'retry-after' ? retryAfter : null,
        },
    } as unknown as Response;
}

beforeEach(() => {
    __resetTTLeaguesHttpForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T00:00:00.000Z'));
    vi.stubEnv('TTL_FETCH_MIN_INTERVAL_MS', '0');
    vi.stubEnv('TTL_FETCH_BACKOFF_JITTER_MS', '0');
});

afterEach(() => {
    __resetTTLeaguesHttpForTests();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
});

describe('fetchWithTTLeaguesPolicy', () => {
    it('waits the known-good 5s fallback before retrying a 429 without Retry-After', async () => {
        vi.stubEnv('TTL_FETCH_429_RETRY_DELAY_MS', '');
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(responseFor(429))
            .mockResolvedValueOnce(responseFor(200));
        vi.stubGlobal('fetch', fetchMock);

        const request = fetchWithTTLeaguesPolicy(TTL_URL, undefined, { maxAttempts: 2 });
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(4999);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(1);
        await expect(request).resolves.toMatchObject({ status: 200 });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('honors Retry-After instead of the fallback delay', async () => {
        vi.stubEnv('TTL_FETCH_429_RETRY_DELAY_MS', '5000');
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(responseFor(429, '2'))
            .mockResolvedValueOnce(responseFor(200));
        vi.stubGlobal('fetch', fetchMock);

        const request = fetchWithTTLeaguesPolicy(TTL_URL, undefined, { maxAttempts: 2 });
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(1999);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(1);
        await expect(request).resolves.toMatchObject({ status: 200 });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('applies a 429 cooldown to other TT Leagues callers in the same process', async () => {
        vi.stubEnv('TTL_FETCH_429_RETRY_DELAY_MS', '5000');
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(responseFor(429))
            .mockResolvedValueOnce(responseFor(200));
        vi.stubGlobal('fetch', fetchMock);

        const first = fetchWithTTLeaguesPolicy(TTL_URL, undefined, { maxAttempts: 1 });
        await vi.advanceTimersByTimeAsync(0);
        await expect(first).resolves.toMatchObject({ status: 429 });
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const second = fetchWithTTLeaguesPolicy(TTL_URL, undefined, { maxAttempts: 1 });
        await vi.advanceTimersByTimeAsync(4999);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(1);
        await expect(second).resolves.toMatchObject({ status: 200 });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
