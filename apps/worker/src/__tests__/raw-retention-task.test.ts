import { readFile } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    pruneRawScrapeLogs: vi.fn(),
    rawScrapeRetentionPolicy: vi.fn(),
}));

vi.mock('@tt-players/db', () => ({ db: {} }));
vi.mock('../raw-scrape-retention.js', () => ({
    pruneRawScrapeLogs: mocks.pruneRawScrapeLogs,
    rawScrapeRetentionPolicy: mocks.rawScrapeRetentionPolicy,
}));

import { pruneRawScrapeLogsTask } from '../tasks/pruneRawScrapeLogsTask.js';

describe('raw scrape retention task wiring', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.rawScrapeRetentionPolicy.mockReturnValue({
            processedDays: 90,
            failedDays: 365,
            batchSize: 500,
        });
    });

    it('queues another bounded cleanup when the current batch is full', async () => {
        mocks.pruneRawScrapeLogs.mockResolvedValue(500);
        const addJob = vi.fn(async () => undefined);

        await pruneRawScrapeLogsTask({}, {
            addJob,
            logger: { info: vi.fn() },
        } as any);

        expect(addJob).toHaveBeenCalledOnce();
        expect(addJob).toHaveBeenCalledWith(
            'pruneRawScrapeLogsTask',
            {},
            expect.objectContaining({
                maxAttempts: 3,
                jobKeyMode: 'replace',
                jobKey: expect.stringMatching(/^prune-raw-scrape-logs:/),
            }),
        );
    });

    it('stops the sweep after a partial batch', async () => {
        mocks.pruneRawScrapeLogs.mockResolvedValue(499);
        const addJob = vi.fn(async () => undefined);

        await pruneRawScrapeLogsTask({}, {
            addJob,
            logger: { info: vi.fn() },
        } as any);

        expect(addJob).not.toHaveBeenCalled();
    });

    it('is registered and scheduled by the production worker', async () => {
        const taskListSource = await readFile(new URL('../task-list.ts', import.meta.url), 'utf8');
        const workerSource = await readFile(new URL('../worker.ts', import.meta.url), 'utf8');

        expect(taskListSource).toContain('pruneRawScrapeLogsTask,');
        expect(workerSource).toContain('15 4 * * * pruneRawScrapeLogsTask ?fill=1d');
    });
});
