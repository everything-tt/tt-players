import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('persisted source resource scheduler wiring', () => {
    it('participates in the daily scrape-run barrier and production schedule', async () => {
        const taskSource = await readFile(
            new URL('../tasks/scheduleDueSourceResourcesTask.ts', import.meta.url),
            'utf8',
        );
        const taskListSource = await readFile(new URL('../task-list.ts', import.meta.url), 'utf8');
        const workerSource = await readFile(new URL('../worker.ts', import.meta.url), 'utf8');

        expect(taskSource).toContain('runTrackedScrapeResource');
        expect(taskSource).toContain('addTrackedScrapeJob');
        expect(taskListSource).toContain('scheduleDueSourceResourcesTask,');
        expect(workerSource).toContain('45 1 * * * scheduleDueSourceResourcesTask ?fill=1d');
    });
});
