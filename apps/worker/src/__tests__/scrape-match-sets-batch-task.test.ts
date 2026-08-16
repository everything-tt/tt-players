import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Match } from '../zod-schemas.js';
import { __resetTTLeaguesHttpForTests } from '../ttleagues-http.js';

const storeScrapePayload = vi.hoisted(() => vi.fn());
const createRequestFingerprint = vi.hoisted(() => vi.fn(() => 'request-fingerprint'));

vi.mock('@tt-players/db', () => ({ db: {} }));
vi.mock('../extractor.js', () => ({ storeScrapePayload, createRequestFingerprint }));

import {
    scrapeMatchSetsBatchTask,
    type ScrapeMatchSetPayload,
} from '../tasks/scrapeMatchSetsBatchTask.js';

function buildMatch(id: number): Match {
    return {
        id,
        date: '2026-03-01',
        time: null,
        week: 1,
        name: `Match ${id}`,
        venue: null,
        competitionId: 1,
        divisionId: 1632,
        leagueId: 25,
        hasResults: true,
        manual: false,
        forfeit: null,
        abandoned: null,
        round: null,
        home: {
            id: 100 + id,
            teamId: 10 + id,
            name: `Home ${id}`,
            displayName: `Home ${id}`,
            score: 6,
            clubId: null,
            userId: null,
            members: [],
            reserves: [],
            type: 0,
            points: null,
        },
        away: {
            id: 200 + id,
            teamId: 20 + id,
            name: `Away ${id}`,
            displayName: `Away ${id}`,
            score: 4,
            clubId: null,
            userId: null,
            members: [],
            reserves: [],
            type: 0,
            points: null,
        },
    };
}

function payload(matchId: number): ScrapeMatchSetPayload {
    return {
        divisionId: '1632',
        tenantHost: 'example.ttleagues.com',
        platformId: '00000000-0000-4000-8000-000000000001',
        competitionId: '00000000-0000-4000-8000-000000000002',
        match: buildMatch(matchId),
    };
}

function responseFor(status: number): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => [],
        arrayBuffer: async () => new ArrayBuffer(0),
        headers: { get: () => null },
    } as unknown as Response;
}

afterEach(() => {
    __resetTTLeaguesHttpForTests();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
});

describe('scrapeMatchSetsBatchTask', () => {
    it('saves successful entries and returns only failed promises for Graphile retry', async () => {
        vi.stubEnv('TTL_FETCH_MAX_ATTEMPTS', '1');
        vi.stubEnv('TTL_FETCH_MIN_INTERVAL_MS', '0');
        vi.stubEnv('TTL_FETCH_BACKOFF_BASE_MS', '1');
        vi.stubEnv('TTL_FETCH_BACKOFF_JITTER_MS', '0');

        vi.mocked(storeScrapePayload).mockResolvedValue('log-success');
        vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
            if (String(url).includes('/matches/1001/sets')) {
                return responseFor(500);
            }
            if (String(url).includes('/matches/1002/sets')) {
                return responseFor(200);
            }
            throw new Error(`Unexpected URL: ${url}`);
        }));

        const addJob = vi.fn(async () => undefined);
        const result = scrapeMatchSetsBatchTask(
            [payload(1001), payload(1002)],
            {
                addJob,
                logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
            } as never,
        ) as Promise<void>[];

        expect(Array.isArray(result)).toBe(true);
        const settled = await Promise.allSettled(result);

        expect(settled.map((entry) => entry.status)).toEqual(['rejected', 'fulfilled']);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(createRequestFingerprint).toHaveBeenCalledWith(
            expect.stringContaining('/matches/1002/sets'),
            { headers: { Tenant: 'example.ttleagues.com', Entry: '1' } },
        );
        expect(storeScrapePayload).toHaveBeenCalledTimes(1);
        expect(storeScrapePayload).toHaveBeenCalledWith(
            expect.stringContaining('/matches/1002/sets'),
            '00000000-0000-4000-8000-000000000001',
            expect.stringContaining('"1002"'),
            expect.anything(),
            {
                requestFingerprint: 'request-fingerprint',
                httpStatus: 200,
            },
        );
        expect(addJob).toHaveBeenCalledWith(
            'processMatchSetsBatchTask',
            expect.objectContaining({ logId: 'log-success' }),
            expect.objectContaining({
                maxAttempts: 3,
                jobKeyMode: 'unsafe_dedupe',
            }),
        );
    });

    it('retries a transient 429 response and succeeds on the next attempt', async () => {
        vi.stubEnv('TTL_FETCH_MAX_ATTEMPTS', '3');
        vi.stubEnv('TTL_FETCH_MIN_INTERVAL_MS', '0');
        vi.stubEnv('TTL_FETCH_429_RETRY_DELAY_MS', '1');
        vi.stubEnv('TTL_FETCH_BACKOFF_BASE_MS', '1');
        vi.stubEnv('TTL_FETCH_BACKOFF_JITTER_MS', '0');

        vi.mocked(storeScrapePayload).mockResolvedValue('log-retried');
        let setsCalls = 0;
        vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
            if (String(url).includes('/matches/1003/sets')) {
                setsCalls += 1;
                return setsCalls === 1 ? responseFor(429) : responseFor(200);
            }
            throw new Error(`Unexpected URL: ${url}`);
        }));

        const addJob = vi.fn(async () => undefined);
        const result = scrapeMatchSetsBatchTask(
            [payload(1003)],
            {
                addJob,
                logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
            } as never,
        ) as Promise<void>[];

        const settled = await Promise.allSettled(result);
        expect(settled.map((entry) => entry.status)).toEqual(['fulfilled']);
        expect(setsCalls).toBe(2);
        expect(storeScrapePayload).toHaveBeenCalledTimes(1);
    });

    it('rejects after exhausting retries when the source keeps returning 429', async () => {
        vi.stubEnv('TTL_FETCH_MAX_ATTEMPTS', '3');
        vi.stubEnv('TTL_FETCH_MIN_INTERVAL_MS', '0');
        vi.stubEnv('TTL_FETCH_429_RETRY_DELAY_MS', '1');
        vi.stubEnv('TTL_FETCH_BACKOFF_BASE_MS', '1');
        vi.stubEnv('TTL_FETCH_BACKOFF_JITTER_MS', '0');

        const fetchMock = vi.fn(async () => responseFor(429));
        vi.stubGlobal('fetch', fetchMock);

        const addJob = vi.fn(async () => undefined);
        const result = scrapeMatchSetsBatchTask(
            [payload(1004)],
            {
                addJob,
                logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
            } as never,
        ) as Promise<void>[];

        const settled = await Promise.allSettled(result);
        expect(settled.map((entry) => entry.status)).toEqual(['rejected']);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(storeScrapePayload).not.toHaveBeenCalled();
    });

    it('skips matches where the source reports no sets (404)', async () => {
        vi.stubEnv('TTL_FETCH_MAX_ATTEMPTS', '1');
        vi.stubEnv('TTL_FETCH_MIN_INTERVAL_MS', '0');
        vi.stubEnv('TTL_FETCH_BACKOFF_BASE_MS', '1');
        vi.stubEnv('TTL_FETCH_BACKOFF_JITTER_MS', '0');

        const fetchMock = vi.fn(async () => responseFor(404));
        vi.stubGlobal('fetch', fetchMock);

        const addJob = vi.fn(async () => undefined);
        const result = scrapeMatchSetsBatchTask(
            [payload(1005)],
            {
                addJob,
                logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
            } as never,
        ) as Promise<void>[];

        const settled = await Promise.allSettled(result);
        expect(settled.map((entry) => entry.status)).toEqual(['fulfilled']);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(storeScrapePayload).not.toHaveBeenCalled();
        expect(addJob).not.toHaveBeenCalled();
    });
});
