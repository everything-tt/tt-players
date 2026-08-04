import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    fetchVettsDiscovery: vi.fn(),
    upsertVettsPlatform: vi.fn(),
    upsertSourceInstance: vi.fn(),
    upsertSourceResource: vi.fn(),
    recordSourceResourceSuccess: vi.fn(),
    recordSourceResourceFailure: vi.fn(),
}));

vi.mock('@tt-players/db', () => ({ db: {} }));
vi.mock('../vetts-loader.js', () => ({
    upsertVettsPlatform: mocks.upsertVettsPlatform,
}));
vi.mock('../vetts-client.js', () => ({
    fetchVettsDiscovery: mocks.fetchVettsDiscovery,
    vettsDiscoveryYears: () => [2026, 2025],
    vettsUrls: {
        discovery: (year: number) => `https://www.vetts.org.uk/tournaments.aspx?year=${year}`,
    },
}));
vi.mock('../sources/registry.js', () => ({
    upsertSourceInstance: mocks.upsertSourceInstance,
    upsertSourceResource: mocks.upsertSourceResource,
    recordSourceResourceSuccess: mocks.recordSourceResourceSuccess,
    recordSourceResourceFailure: mocks.recordSourceResourceFailure,
}));

import { scrapeVettsTournamentsTask } from '../tasks/scrapeVettsTournamentsTask.js';

const TOURNAMENT_ID = '4af81622-d21a-47ed-a046-86c492b4cfe9';
const discoveryHtml = `
<a href="https://vetts.tournamentsoftware.com/tournament/${TOURNAMENT_ID}">
  VETTS Nationals 2026
</a>`;

describe('VETTS discovery task', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env['VETTS_DISCOVERY_LIMIT'] = '30';
        mocks.upsertVettsPlatform.mockResolvedValue('platform');
        mocks.upsertSourceInstance.mockResolvedValue({ id: 'instance' });
        mocks.upsertSourceResource.mockImplementation(async (_db, input) => ({
            id: `resource-${input.externalId}`,
        }));
        mocks.recordSourceResourceSuccess.mockResolvedValue(undefined);
        mocks.recordSourceResourceFailure.mockResolvedValue(undefined);
    });

    it('queues successful years with the shared retry and dedupe policy, then reports partial failure', async () => {
        mocks.fetchVettsDiscovery.mockImplementation(async (year: number) => {
            if (year === 2026) return discoveryHtml;
            throw new Error('calendar unavailable');
        });
        const addJob = vi.fn(async () => undefined);

        await expect(scrapeVettsTournamentsTask({}, {
            addJob,
            logger: { info: vi.fn() },
        } as any)).rejects.toThrow('One or more VETTS calendar pages failed');

        expect(addJob).toHaveBeenCalledOnce();
        expect(addJob).toHaveBeenCalledWith(
            'scrapeVettsTournamentTask',
            { tournamentId: TOURNAMENT_ID },
            expect.objectContaining({
                maxAttempts: 3,
                jobKeyMode: 'unsafe_dedupe',
                jobKey: expect.stringMatching(/^scrape-vetts-tournament:/),
            }),
        );
        expect(mocks.recordSourceResourceSuccess).toHaveBeenCalledWith(
            {},
            'resource-calendar-2026',
        );
        expect(mocks.recordSourceResourceFailure).toHaveBeenCalledWith(
            {},
            'resource-calendar-2025',
            expect.any(Error),
        );
    });

    it('fails closed and queues nothing when calendars parse as empty', async () => {
        mocks.fetchVettsDiscovery.mockResolvedValue('<html><body>No tournament links</body></html>');
        const addJob = vi.fn(async () => undefined);

        await expect(scrapeVettsTournamentsTask({}, {
            addJob,
            logger: { info: vi.fn() },
        } as any)).rejects.toThrow('No usable VETTS tournaments discovered');

        expect(addJob).not.toHaveBeenCalled();
        expect(mocks.recordSourceResourceFailure).toHaveBeenCalledTimes(2);
    });
});
