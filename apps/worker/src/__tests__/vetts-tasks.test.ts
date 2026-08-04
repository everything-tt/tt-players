import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    discoverVettsTournaments: vi.fn(),
}));

vi.mock('@tt-players/db', () => ({ db: {} }));
vi.mock('../vetts-discovery.js', () => ({
    discoverVettsTournaments: mocks.discoverVettsTournaments,
}));

import { scrapeVettsTournamentsTask } from '../tasks/scrapeVettsTournamentsTask.js';

const TOURNAMENT_ID = '4af81622-d21a-47ed-a046-86c492b4cfe9';

describe('VETTS discovery task', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env['VETTS_DISCOVERY_LIMIT'] = '30';
    });

    it('queues successful discoveries with the shared retry policy, then reports partial failure', async () => {
        mocks.discoverVettsTournaments.mockResolvedValue({
            tournaments: [{
                tournamentId: TOURNAMENT_ID,
                name: 'VETTS Nationals 2026',
                url: `https://vetts.tournamentsoftware.com/tournament/${TOURNAMENT_ID}`,
            }],
            failures: [new Error('calendar unavailable')],
        });
        const addJob = vi.fn(async () => undefined);

        await expect(scrapeVettsTournamentsTask({}, {
            addJob,
            logger: { info: vi.fn(), warn: vi.fn() },
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
    });

    it('fails closed and queues nothing when no calendar is usable', async () => {
        mocks.discoverVettsTournaments.mockResolvedValue({
            tournaments: [],
            failures: [new Error('No VETTS tournaments discovered for 2026')],
        });
        const addJob = vi.fn(async () => undefined);

        await expect(scrapeVettsTournamentsTask({}, {
            addJob,
            logger: { info: vi.fn(), warn: vi.fn() },
        } as any)).rejects.toThrow('No usable VETTS tournaments discovered');

        expect(addJob).not.toHaveBeenCalled();
    });

    it('applies the bounded discovery limit before queueing', async () => {
        process.env['VETTS_DISCOVERY_LIMIT'] = '1';
        mocks.discoverVettsTournaments.mockResolvedValue({
            tournaments: [
                {
                    tournamentId: TOURNAMENT_ID,
                    name: 'Nationals',
                    url: `https://vetts.tournamentsoftware.com/tournament/${TOURNAMENT_ID}`,
                },
                {
                    tournamentId: '7ed3b6c4-2370-4fd2-a010-f3dfaa1d6f2e',
                    name: 'Southern',
                    url: 'https://vetts.tournamentsoftware.com/tournament/7ed3b6c4-2370-4fd2-a010-f3dfaa1d6f2e',
                },
            ],
            failures: [],
        });
        const addJob = vi.fn(async () => undefined);

        await scrapeVettsTournamentsTask({}, {
            addJob,
            logger: { info: vi.fn(), warn: vi.fn() },
        } as any);

        expect(addJob).toHaveBeenCalledOnce();
        expect(addJob).toHaveBeenCalledWith(
            'scrapeVettsTournamentTask',
            { tournamentId: TOURNAMENT_ID },
            expect.anything(),
        );
    });
});
