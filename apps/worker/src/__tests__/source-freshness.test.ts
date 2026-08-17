import { describe, expect, it } from 'vitest';
import { isSourceRefreshDue } from '../source-freshness.js';
import {
    shouldQueueSport80Event,
    sport80PolicyRefreshContext,
} from '../tasks/scrapeSport80EventsTask.js';

describe('source freshness policy', () => {
    const now = new Date('2026-08-16T12:00:00Z');

    it('treats missing or old successful evidence as due', () => {
        expect(isSourceRefreshDue(null, { minRefreshIntervalMs: 1_000 }, now)).toBe(true);
        expect(isSourceRefreshDue(
            '2026-08-16T11:59:58Z',
            { minRefreshIntervalMs: 1_000 },
            now,
        )).toBe(true);
    });

    it('treats recent successful evidence as fresh', () => {
        expect(isSourceRefreshDue(
            '2026-08-16T11:59:59.500Z',
            { minRefreshIntervalMs: 1_000 },
            now,
        )).toBe(false);
    });

    it('retries unresolved Sport80 state and refreshes processed state when stale', () => {
        const options = { force: false, now, refreshIntervalMs: 7 * 24 * 60 * 60 * 1_000 };
        expect(shouldQueueSport80Event({ status: 'pending', processedAt: null }, options)).toBe(true);
        expect(shouldQueueSport80Event({ status: 'failed', processedAt: null }, options)).toBe(true);
        expect(shouldQueueSport80Event({
            status: 'processed',
            processedAt: '2026-08-15T12:00:00Z',
        }, options)).toBe(false);
        expect(shouldQueueSport80Event({
            status: 'processed',
            processedAt: '2026-08-01T12:00:00Z',
        }, options)).toBe(true);
    });

    it('carries the processed version observed by a policy refresh', () => {
        expect(sport80PolicyRefreshContext({
            status: 'processed',
            processedAt: '2026-08-01T12:00:00Z',
        }, false)).toEqual({
            refreshProcessed: true,
            refreshObservedProcessedAt: '2026-08-01T12:00:00.000Z',
        });
        expect(sport80PolicyRefreshContext({ status: 'pending', processedAt: null }, false))
            .toEqual({});
        expect(sport80PolicyRefreshContext({
            status: 'processed',
            processedAt: now,
        }, true)).toEqual({});
    });

    it('lets explicit force override freshness', () => {
        expect(shouldQueueSport80Event({
            status: 'processed',
            processedAt: now,
        }, {
            force: true,
            now,
            refreshIntervalMs: 7 * 24 * 60 * 60 * 1_000,
        })).toBe(true);
    });
});
