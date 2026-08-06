import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync(
    fileURLToPath(new URL('../routes/events.ts', import.meta.url)),
    'utf8',
);

describe('events list query shape', () => {
    it('pages lightweight tournament IDs before enrichment', () => {
        const pageQuery = routeSource.indexOf('const pageRows = await pageBuilder');
        const enrichment = routeSource.indexOf('const enrichedRows = await db', pageQuery);

        expect(routeSource).toContain('const pageIds = pageRows.map');
        expect(routeSource).toContain(".where('c.id', 'in', pageIds)");
        expect(pageQuery).toBeGreaterThan(-1);
        expect(enrichment).toBeGreaterThan(pageQuery);
    });

    it('separates upcoming and completed rows by lifecycle kind', () => {
        const filterStart = routeSource.indexOf('function applyEventFilters');
        const filterEnd = routeSource.indexOf('function applyEventOrdering', filterStart);
        const filters = routeSource.slice(filterStart, filterEnd);

        expect(filters).toContain(".where('c.record_kind', '=', 'calendar')");
        expect(filters).toContain(".where('c.processed_at', 'is', null)");
        expect(filters).toContain(".where('c.record_kind', '=', 'result')");
        expect(filters).not.toContain('from fixtures');
        expect(filters).not.toContain('join rubbers');
    });

    it('uses one simple fast-pagination path for every lifecycle', () => {
        const fastStart = routeSource.indexOf('async function fetchFastEventPage');
        const fastEnd = routeSource.indexOf('function calendarPayloadField', fastStart);
        const fastPath = routeSource.slice(fastStart, fastEnd);

        expect(fastPath).toContain('.limit(query.limit + 1)');
        expect(fastPath).toContain('.offset(query.offset)');
        expect(fastPath).not.toContain('while (');
        expect(fastPath).not.toContain('fixtures');
        expect(fastPath).not.toContain('rubbers');
    });
});
