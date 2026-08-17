import { describe, expect, it } from 'vitest';
import {
    isPersistedSourceResourceDue,
    sourceResourceFailureBackoffMs,
    sourceResourceJob,
    sourceResourceRefreshIntervalMs,
    sourceResourceSchedulerLimits,
} from '../source-resource-scheduler.js';

const BASE_RESOURCE = {
    id: 'resource-id',
    sourceInstanceId: 'instance-id',
    adapterKey: 'tournamentsoftware-vetts',
    resourceType: 'event-results',
    externalId: 'tournament-123:matches',
    publicUrl: null,
    refreshPolicy: { cadence: 'daily' },
    lastFetchedAt: null,
    lastSucceededAt: null,
    consecutiveFailures: 0,
};

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
            lastFetchedAt: null,
            lastSucceededAt: null,
            refreshPolicy: { cadence: 'weekly' },
            consecutiveFailures: 0,
        }, now)).toBe(true);
        expect(isPersistedSourceResourceDue({
            lastFetchedAt: new Date('2026-08-16T11:00:00Z'),
            lastSucceededAt: new Date('2026-08-16T11:00:00Z'),
            refreshPolicy: { cadence: 'daily' },
            consecutiveFailures: 0,
        }, now)).toBe(false);
        expect(isPersistedSourceResourceDue({
            lastFetchedAt: new Date('2026-08-14T12:00:00Z'),
            lastSucceededAt: new Date('2026-08-14T12:00:00Z'),
            refreshPolicy: { cadence: 'daily' },
            consecutiveFailures: 0,
        }, now)).toBe(true);
    });

    it('backs failed resources off from their latest fetch attempt, not old success', () => {
        const now = new Date('2026-08-16T12:00:00Z');
        const recentFailure = {
            lastFetchedAt: new Date('2026-08-16T11:58:00Z'),
            lastSucceededAt: new Date('2026-07-01T00:00:00Z'),
            refreshPolicy: { cadence: 'daily' },
            consecutiveFailures: 1,
        };
        expect(sourceResourceFailureBackoffMs(1)).toBe(5 * 60 * 1_000);
        expect(isPersistedSourceResourceDue(recentFailure, now)).toBe(false);
        expect(isPersistedSourceResourceDue({
            ...recentFailure,
            lastFetchedAt: new Date('2026-08-16T11:54:00Z'),
        }, now)).toBe(true);
    });

    it('bounds scheduler page and due-result sizes', () => {
        expect(sourceResourceSchedulerLimits({ scanBatchSize: 50_000, dueLimit: 50_000 }))
            .toEqual({ scanBatchSize: 1_000, dueLimit: 1_000 });
        expect(sourceResourceSchedulerLimits({ scanBatchSize: 37, dueLimit: 41 }))
            .toEqual({ scanBatchSize: 37, dueLimit: 41 });
    });

    it('maps VETTS directories and tournament resources explicitly', () => {
        const tournamentJob = sourceResourceJob(BASE_RESOURCE);
        expect(tournamentJob?.taskIdentifier).toBe('scrapeVettsTournamentTask');
        expect(tournamentJob?.payload).toEqual({ tournamentId: 'tournament-123' });
        expect(tournamentJob?.jobKey).toMatch(/^scrape-vetts-tournament:/);

        const directoryJob = sourceResourceJob({
            ...BASE_RESOURCE,
            resourceType: 'directory',
            externalId: 'calendar-2026',
        });
        expect(directoryJob?.taskIdentifier).toBe('scrapeVettsTournamentsTask');
        expect(directoryJob?.payload).toEqual({});
        expect(directoryJob?.jobKey).toMatch(/^scrape-vetts-tournaments:/);
    });

    it('does not invent jobs for adapters or resource types not yet migrated', () => {
        expect(sourceResourceJob({
            ...BASE_RESOURCE,
            adapterKey: 'unknown-adapter',
        })).toBeNull();
        expect(sourceResourceJob({
            ...BASE_RESOURCE,
            resourceType: 'ranking-list',
        })).toBeNull();
    });
});
