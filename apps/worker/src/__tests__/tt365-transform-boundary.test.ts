import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('TT365 transform boundary', () => {
    it('keeps transform processing free of external HTTP access', async () => {
        const source = await readFile(
            new URL('../tasks/processLogTask.ts', import.meta.url),
            'utf8',
        );

        expect(source).not.toContain('fetchWithTT365Policy');
        expect(source).not.toMatch(/\bfetch\s*\(/);
    });

    it('keeps TT365 player-stat fallback evidence in a separate staged dependency', async () => {
        const source = await readFile(
            new URL('../tt365-player-stats-evidence.ts', import.meta.url),
            'utf8',
        );

        expect(source).toContain('staging.raw_scrape_evidence_dependencies');
        expect(source).toContain('evidence_log_id');
        expect(source).not.toMatch(/\bfetch\s*\(/);
    });
});
