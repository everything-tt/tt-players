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
    it('includes the tenant host on scheduled standings and match jobs', async () => {
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
            { maxAttempts: 1 },
        );
        expect(addJob).toHaveBeenNthCalledWith(
            2,
            'scrapeMatchesTask',
            expect.objectContaining({
                tenantHost: 'british.ttleagues.com',
                divisionId: '1001',
            }),
            { maxAttempts: 1 },
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
        expect(addJob).toHaveBeenCalledWith('processLogTask', expect.objectContaining({
            logId: 'log-1',
            competitionId: 'competition-1',
            platformType: 'ttleagues',
        }));
    });
});
