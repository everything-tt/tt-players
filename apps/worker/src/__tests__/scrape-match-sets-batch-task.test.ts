import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Match } from '../zod-schemas.js';

const storeScrapePayload = vi.hoisted(() => vi.fn());

vi.mock('@tt-players/db', () => ({ db: {} }));
vi.mock('../extractor.js', () => ({ storeScrapePayload }));

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

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

describe('scrapeMatchSetsBatchTask', () => {
    it('saves successful entries and returns only failed promises for Graphile retry', async () => {
        vi.mocked(storeScrapePayload).mockResolvedValue('log-success');
        vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
            if (String(url).includes('/matches/1001/sets')) {
                return { ok: false, status: 500 } as Response;
            }
            if (String(url).includes('/matches/1002/sets')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => [],
                } as Response;
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
        expect(storeScrapePayload).toHaveBeenCalledTimes(1);
        expect(storeScrapePayload).toHaveBeenCalledWith(
            expect.stringContaining('/matches/1002/sets'),
            '00000000-0000-4000-8000-000000000001',
            expect.stringContaining('"1002"'),
            expect.anything(),
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
});
