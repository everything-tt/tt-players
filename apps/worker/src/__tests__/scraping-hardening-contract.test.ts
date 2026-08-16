import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { combineIngestionStates } from '../tasks/completeDailyPipelineTask.js';

describe('scraping hardening contracts', () => {
    it('treats staged ingestion state as part of the publication barrier', () => {
        expect(combineIngestionStates(
            { pending: 0, failed: 0 },
            { pending: 2, failed: 1 },
        )).toEqual({ pending: 2, failed: 1 });

        expect(combineIngestionStates(
            { pending: 3, failed: 1 },
            { pending: 2, failed: 4 },
        )).toEqual({ pending: 5, failed: 5 });
    });

    it('keeps global player reconciliation out of per-log transform processing', () => {
        const source = readFileSync(
            new URL('../tasks/processLogTask.ts', import.meta.url),
            'utf8',
        );

        expect(source).not.toContain('reconcilePlayersByName');
    });
});
