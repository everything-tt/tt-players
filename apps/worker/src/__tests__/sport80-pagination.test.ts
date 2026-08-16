import { describe, expect, it } from 'vitest';
import { nextSport80EventsPage } from '../tasks/scrapeSport80EventsTask.js';

describe('Sport80 event pagination completeness', () => {
    it('continues past the old three-page cap until total is reached', () => {
        expect(nextSport80EventsPage({ page: 0, limit: 100, rowCount: 100, total: 450 })).toBe(1);
        expect(nextSport80EventsPage({ page: 1, limit: 100, rowCount: 100, total: 450 })).toBe(2);
        expect(nextSport80EventsPage({ page: 2, limit: 100, rowCount: 100, total: 450 })).toBe(3);
        expect(nextSport80EventsPage({ page: 3, limit: 100, rowCount: 100, total: 450 })).toBe(4);
        expect(nextSport80EventsPage({ page: 4, limit: 100, rowCount: 50, total: 450 })).toBeNull();
    });

    it('fails instead of silently stopping at an explicit incomplete cap', () => {
        expect(() => nextSport80EventsPage({
            page: 2,
            limit: 100,
            rowCount: 100,
            total: 450,
            maxPages: 3,
        })).toThrow(/explicit maxPages=3/);
    });

    it('fails on an empty or short page while the API claims more rows', () => {
        expect(() => nextSport80EventsPage({
            page: 2,
            limit: 100,
            rowCount: 0,
            total: 450,
        })).toThrow(/returned no rows/);
        expect(() => nextSport80EventsPage({
            page: 2,
            limit: 100,
            rowCount: 80,
            total: 450,
        })).toThrow(/returned 80\/100/);
    });
});
