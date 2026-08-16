import { describe, expect, it } from 'vitest';
import {
    isPersistedSourceResourceDue,
    sourceResourceJob,
    sourceResourceRefreshIntervalMs,
} from '../source-resource-scheduler.js';

describe('persisted source resource scheduler', () => {
    it('interprets existing cadence metadata centrally', () => {
        expect(sourceResourceRefreshIntervalMs({ cadence: 'daily' }))
            .toBe(24 * 60 * 60 * 1_000);
        expect(sourceResourceRefreshIntervalMs({ cadence: 'weekly-after-completion' }))
            .toBe(7 * 24 * 60 * 60 * 1_000);
    });

    it('treats never-succeeded resources as due and successful resources by cadence', () => {
        const now = new Date('2026-08-16T12:00:00Z');
        expect(isPersistedSourceResourceDue({
            lastSucceededAt: null,
            refreshPolicy: { cadence: 'weekly' },
            consecutiveFailures: 0,
        }, now)).toBe(true);
        expect(isPersistedSourceResourceDue({
            lastSucceededAt: new Date('2026-08-16T11:00:00Z'),
            refreshPolicy: { cadence: 'daily' },
            consecutiveFailures: 0,
        }, now)).toBe(false);
        expect(isPersistedSourceResourceDue({
            lastSucceededAt: new Date('2026-08-14T12:00:00Z'),
            refreshPolicy: { cadence: 'daily' },
            consecutiveFailures: 0,
        }, now)).toBe(true);
    });

    it('maps VETTS persisted resources to one stable tournament job', () => {
        const job = sourceResourceJob({
            id: 'resource-id',
            sourceInstanceId: 'instance-id',
            adapterKey: 'tournamentsoftware-vetts',
            resourceType: 'event-results',
            externalId: 'tournament-123:matches',
            publicUrl: null,
            refreshPolicy: { cadence: 'daily' },
            lastSucceededAt: null,
            consecutiveFailures: 0,
        });
        expect(job?.taskIdentifier).toBe('scrapeVettsTournamentTask');
        expect(job?.payload).toEqual({ tournamentId: 'tournament-123' });
        expect(job?.jobKey).toMatch(/^source-resource:/);
    });

    it('does not invent jobs for adapters not yet migrated to the common runner', () => {
        expect(sourceResourceJob({
            id: 'resource-id',
            sourceInstanceId: 'instance-id',
            adapterKey: 'unknown-adapter',
            resourceType: 'event',
            externalId: 'x',
            publicUrl: null,
            refreshPolicy: {},
            lastSucceededAt: null,
            consecutiveFailures: 0,
        })).toBeNull();
    });
});
