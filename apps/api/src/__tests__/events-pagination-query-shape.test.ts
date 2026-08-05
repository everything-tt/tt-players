import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync(
    fileURLToPath(new URL('../routes/events.ts', import.meta.url)),
    'utf8',
);

describe('events list query shape', () => {
    it('pages lightweight tournament candidates before enrichment', () => {
        const pageQuery = routeSource.indexOf("const pageRows = await pageBuilder");
        const enrichment = routeSource.indexOf("const enrichedRows = await db", pageQuery);

        expect(routeSource).toContain("sql<number>`count(*) over()`");
        expect(routeSource).toContain("const pageIds = pageRows.map");
        expect(routeSource).toContain(".where('c.id', 'in', pageIds)");
        expect(pageQuery).toBeGreaterThan(-1);
        expect(enrichment).toBeGreaterThan(pageQuery);
    });

    it('does not run the expensive metadata selection in the candidate query', () => {
        const pageStart = routeSource.indexOf("let pageBuilder = db");
        const pageEnd = routeSource.indexOf("const pageRows = await pageBuilder", pageStart);
        const candidateQuery = routeSource.slice(pageStart, pageEnd);

        expect(candidateQuery).not.toContain('eventSelection()');
        expect(candidateQuery).not.toContain('match_count');
        expect(candidateQuery).not.toContain('source_count');
    });
});
