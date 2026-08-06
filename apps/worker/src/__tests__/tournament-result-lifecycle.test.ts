import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
    fileURLToPath(new URL('../tasks/scrapeSport80EventResultsTask.ts', import.meta.url)),
    'utf8',
);

describe('Sport:80 tournament result lifecycle', () => {
    it('keeps result rows separate from matched calendar rows', () => {
        expect(source).toContain('async function upsertResultCompetition');
        expect(source).toContain("record_kind: 'result'");
        expect(source).toContain('matched_calendar_competition_id: matchedCalendarCompetitionId');
        expect(source).toContain("event_status: 'completed'");
        expect(source).toContain("processed_at: new Date()");
        expect(source).toContain("event_status: 'processed'");
    });

    it('stores the result source on the result competition rather than the calendar candidate', () => {
        expect(source).toContain('saveSport80SourceMapping(\n        database,\n        resultCompetitionId,');
        expect(source).not.toContain('saveSport80SourceMapping(\n            database,\n            choice.candidate.id,');
    });
});
