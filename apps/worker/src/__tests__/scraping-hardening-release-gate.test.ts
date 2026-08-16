import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function source(path: string): Promise<string> {
    return readFile(new URL(path, import.meta.url), 'utf8');
}

describe('issue #252 scraping hardening release gate', () => {
    it('keeps per-log processing free of global reconciliation and TT365 network fallback', async () => {
        const processLog = await source('../tasks/processLogTask.ts');
        expect(processLog).not.toContain('reconcilePlayersByName');
        expect(processLog).not.toContain('fetchWithTT365Policy');
    });

    it('keeps the daily barrier grounded in staged ingestion evidence, not only task names', async () => {
        const pipeline = await source('../tasks/completeDailyPipelineTask.ts');
        expect(pipeline).toContain('staging.raw_scrape_logs');
        expect(pipeline).toContain('staging.sport80_event_scrape_state');
    });

    it('keeps the canonical loader bounded and replica-safe', async () => {
        const loader = await source('../loader.ts');
        expect(loader).toContain('chunkWriteItems');
        expect(loader).toContain("fixtures.status = 'completed'");
        expect(loader).toContain("where('status', '!=', 'processed')");
    });

    it('routes all active source clients through the distributed request gate', async () => {
        for (const path of [
            '../ttleagues-http.ts',
            '../tt365-http.ts',
            '../sport80-client.ts',
            '../vetts-client.ts',
            '../tte-events-client.ts',
        ]) {
            expect(await source(path)).toContain('runSourceRateLimited');
        }
    });

    it('keeps source discovery fail-closed instead of silently capped', async () => {
        const sport80 = await source('../tasks/scrapeSport80EventsTask.ts');
        expect(sport80).not.toContain('maxPages = 3');
        expect(sport80).toContain('pagination incomplete');

        const vetts = await source('../vetts-sync.ts');
        expect(vetts).toContain('enumerateCompleteSourceDates');
        expect(vetts).not.toMatch(/enumerateTournamentDates\([^)]*,\s*7\s*\)/);
    });

    it('keeps raw evidence retention replay-safe and bounded', async () => {
        const retention = await source('../raw-scrape-retention.ts');
        expect(retention).toContain('raw_scrape_evidence_dependencies');
        expect(retention).toContain('SKIP LOCKED');
        expect(retention).toContain('policy.batchSize');
    });

    it('has a common persisted-resource freshness scheduler', async () => {
        const scheduler = await source('../source-resource-scheduler.ts');
        expect(scheduler).toContain('source_resources');
        expect(scheduler).toContain('source_instances');
        expect(scheduler).toContain('stableJobKey');
    });

    it('keeps worker bootstrap independent of national TT Leagues network discovery', async () => {
        const bootstrap = await source('../bootstrap.ts');
        expect(bootstrap).not.toMatch(/discoverNationalTTLeagues/i);
        expect(bootstrap).not.toMatch(/fetchNationalTTLeagues/i);
        expect(bootstrap).not.toMatch(/national-ttleagues.*client/i);
    });
});
