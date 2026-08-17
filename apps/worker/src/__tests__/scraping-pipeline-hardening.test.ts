import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
    summarizeIngestionBarrier,
    summarizeScrapeRunBarrier,
} from '../tasks/completeDailyPipelineTask.js';

describe('scraping pipeline hardening', () => {
    it('blocks on failed staged raw evidence for manual compatibility runs', () => {
        expect(summarizeIngestionBarrier({
            queuePending: 0,
            queueFailed: 0,
            rawPending: 0,
            rawFailed: 1,
            resourcePending: 0,
            resourceFailed: 0,
        })).toMatchObject({ pending: 0, failed: 1 });
    });

    it('uses explicit scrape-run membership for scheduled publication', () => {
        expect(summarizeScrapeRunBarrier({
            exists: true,
            expected: 7,
            pending: 2,
            succeeded: 4,
            failed: 1,
        })).toEqual({
            pending: 2,
            failed: 1,
            expected: 7,
            succeeded: 4,
            missingRun: false,
        });
    });

    it('fails closed when the scheduled scrape run does not exist', () => {
        expect(summarizeScrapeRunBarrier({
            exists: false,
            expected: 0,
            pending: 0,
            succeeded: 0,
            failed: 0,
        })).toEqual({
            pending: 1,
            failed: 0,
            expected: 0,
            succeeded: 0,
            missingRun: true,
        });
    });

    it('does not infer scheduled completeness from Graphile task names', async () => {
        const source = await readFile(
            new URL('../tasks/completeDailyPipelineTask.ts', import.meta.url),
            'utf8',
        );
        expect(source).not.toContain('INGESTION_TASK_IDENTIFIERS');
        expect(source).not.toContain('graphile_worker.jobs');
        expect(source).toContain('inspectScrapeRun');
    });

    it('keeps per-log transform/load free of global player reconciliation', async () => {
        const source = await readFile(
            new URL('../tasks/processLogTask.ts', import.meta.url),
            'utf8',
        );

        expect(source).not.toContain('reconcilePlayersByName');
        expect(source).not.toContain("../player-reconciler.js");
    });
});
