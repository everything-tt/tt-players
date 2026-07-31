import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../extractor.js', () => ({
    extractAndStore: vi.fn(),
    storeScrapePayload: vi.fn(),
}));

import { extractAndStore } from '../extractor.js';
import { setScheduledScrapeTargets, taskList } from '../task-list.js';
import { scrapeUrlTask } from '../tasks/scrapeUrlTask.js';

const extractAndStoreMock = vi.mocked(extractAndStore);

beforeEach(() => {
    vi.clearAllMocks();
    extractAndStoreMock.mockResolvedValue('log-1');
});

describe('national TT Leagues scheduling', () => {
    it('includes tenant headers and deterministic retryable job specs', async () => {
        const addJob = vi.fn().mockResolvedValue({});
        setScheduledScrapeTargets([{
            url: 'https://ttleagues-api.azurewebsites.net/api/divisions/1001/standings',
            fixturesUrl: null,
            tenantHost: 'british.ttleagues.com',
            platformId: 'platform-1',
            platformType: 'ttleagues',
            competitionId: 'competition-1',
            divisionExtId: '1001',
            divisionName: 'Premier',
            leagueName: 'British Clubs Leagues',
            isHistorical: false,
        }]);

        await taskList.scheduleScrapeTasks({}, {
            addJob,
            logger: { info: vi.fn() },
        } as never);

        expect(addJob).toHaveBeenNthCalledWith(
            1,
            'scrapeUrlTask',
            expect.objectContaining({
                tenantHost: 'british.ttleagues.com',
                platformType: 'ttleagues',
                competitionId: 'competition-1',
            }),
            expect.objectContaining({
                maxAttempts: 3,
                jobKey: expect.stringMatching(/^scrape-standings:/),
            }),
        );
        expect(addJob).toHaveBeenNthCalledWith(
            2,
            'scrapeMatchesTask',
            expect.objectContaining({
                tenantHost: 'british.ttleagues.com',
                divisionId: '1001',
            }),
            expect.objectContaining({
                maxAttempts: 3,
                jobKey: expect.stringMatching(/^scrape-matches:/),
            }),
        );
    });

    it('turns the tenant host into TT Leagues request headers', async () => {
        const addJob = vi.fn().mockResolvedValue({});
        await scrapeUrlTask({
            url: 'https://ttleagues-api.azurewebsites.net/api/divisions/1001/standings',
            tenantHost: 'british.ttleagues.com',
            platformId: 'platform-1',
            platformType: 'ttleagues',
            competitionId: 'competition-1',
        }, {
            addJob,
            logger: { info: vi.fn() },
        } as never);

        expect(extractAndStoreMock).toHaveBeenCalledWith(
            'https://ttleagues-api.azurewebsites.net/api/divisions/1001/standings',
            'platform-1',
            expect.anything(),
            {
                headers: {
                    Tenant: 'british.ttleagues.com',
                    Entry: '1',
                },
            },
        );
        expect(addJob).toHaveBeenCalledWith(
            'processLogTask',
            expect.objectContaining({
                logId: 'log-1',
                competitionId: 'competition-1',
                platformType: 'ttleagues',
            }),
            expect.objectContaining({
                maxAttempts: 3,
                jobKey: expect.stringMatching(/^process-log:/),
            }),
        );
    });
});
