import { describe, expect, it, vi } from 'vitest';
import {
    normalizeDailyPipelinePayload,
    runDailyPipelineStage,
    type DailyPipelineDependencies,
} from '../tasks/completeDailyPipelineTask.js';

const NOW = new Date('2026-07-31T03:45:00.000Z');
const TRIGGERED_AT = new Date('2026-07-31T03:40:00.000Z');

function dependencies(
    overrides: Partial<DailyPipelineDependencies> = {},
): DailyPipelineDependencies {
    return {
        inspectIngestion: vi.fn(async () => ({ pending: 0, failed: 0 })),
        reconcile: vi.fn(async () => undefined),
        calculateRatings: vi.fn(async () => ({
            complete: true,
            busy: false,
            processedPeriods: 1,
            processedMatches: 10,
            replayed: false,
        })),
        refreshReadModels: vi.fn(async () => undefined),
        now: () => NOW,
        pollIntervalMs: 300_000,
        ...overrides,
    };
}

function helpers() {
    return {
        addJob: vi.fn(async () => undefined),
        logger: { info: vi.fn() },
    };
}

describe('daily pipeline', () => {
    it('waits while current-window ingestion jobs remain', async () => {
        const deps = dependencies({
            inspectIngestion: vi.fn(async () => ({ pending: 2, failed: 0 })),
        });
        const taskHelpers = helpers();

        await runDailyPipelineStage(undefined, taskHelpers, deps);

        expect(deps.inspectIngestion).toHaveBeenCalledWith(
            new Date('2026-07-31T00:00:00.000Z'),
        );
        expect(taskHelpers.addJob).toHaveBeenCalledWith(
            'completeDailyPipelineTask',
            expect.objectContaining({
                runKey: '2026-07-31',
                stage: 'wait-for-ingestion',
            }),
            expect.objectContaining({
                jobKeyMode: 'replace',
                priority: 100,
                runAt: new Date('2026-07-31T03:50:00.000Z'),
            }),
        );
    });

    it('blocks derived data when ingestion has permanently failed', async () => {
        const deps = dependencies({
            inspectIngestion: vi.fn(async () => ({ pending: 0, failed: 1 })),
        });
        const taskHelpers = helpers();

        await expect(runDailyPipelineStage(undefined, taskHelpers, deps))
            .rejects.toThrow('blocked by 1 permanently failed ingestion jobs');
        expect(taskHelpers.addJob).not.toHaveBeenCalled();
    });

    it('manual runs use enqueue time as their window even when execution starts later', async () => {
        const deps = dependencies({
            inspectIngestion: vi.fn(async () => ({ pending: 0, failed: 0 })),
        });
        const taskHelpers = helpers();
        const normalized = normalizeDailyPipelinePayload(
            { manual: true },
            NOW,
            { jobId: '123', createdAt: TRIGGERED_AT },
        );

        await runDailyPipelineStage(normalized, taskHelpers, deps);

        expect(deps.inspectIngestion).toHaveBeenCalledWith(TRIGGERED_AT);
        expect(taskHelpers.addJob).toHaveBeenCalledWith(
            'completeDailyPipelineTask',
            expect.objectContaining({
                runKey: '2026-07-31-manual-123',
                windowStart: TRIGGERED_AT.toISOString(),
                stage: 'reconcile',
                manual: true,
            }),
            expect.anything(),
        );
    });

    it('same-day manual runs get distinct run keys', () => {
        const first = normalizeDailyPipelinePayload(
            { manual: true },
            NOW,
            { jobId: '123', createdAt: TRIGGERED_AT },
        );
        const second = normalizeDailyPipelinePayload(
            { manual: true },
            NOW,
            { jobId: '124', createdAt: new Date('2026-07-31T03:42:00.000Z') },
        );

        expect(first.runKey).toBe('2026-07-31-manual-123');
        expect(second.runKey).toBe('2026-07-31-manual-124');
        expect(first.runKey).not.toBe(second.runKey);
    });

    it('manual runs respect an explicit window start', async () => {
        const deps = dependencies();
        const taskHelpers = helpers();
        const normalized = normalizeDailyPipelinePayload(
            {
                manual: true,
                windowStart: '2026-07-31T02:00:00.000Z',
            },
            NOW,
            { jobId: '125', createdAt: TRIGGERED_AT },
        );

        await runDailyPipelineStage(normalized, taskHelpers, deps);

        expect(deps.inspectIngestion).toHaveBeenCalledWith(
            new Date('2026-07-31T02:00:00.000Z'),
        );
    });

    it('manual runs respect an explicit run key', () => {
        const normalized = normalizeDailyPipelinePayload(
            {
                manual: true,
                runKey: 'manual-repair-run',
            },
            NOW,
            { jobId: '126', createdAt: TRIGGERED_AT },
        );

        expect(normalized.runKey).toBe('manual-repair-run');
        expect(normalized.windowStart).toBe(TRIGGERED_AT.toISOString());
    });

    it('moves from completed ingestion to reconciliation', async () => {
        const deps = dependencies();
        const taskHelpers = helpers();

        await runDailyPipelineStage(undefined, taskHelpers, deps);

        expect(taskHelpers.addJob).toHaveBeenCalledWith(
            'completeDailyPipelineTask',
            expect.objectContaining({ stage: 'reconcile' }),
            expect.objectContaining({ jobKeyMode: 'replace' }),
        );
    });

    it('runs reconciliation before queuing ratings', async () => {
        const deps = dependencies();
        const taskHelpers = helpers();

        await runDailyPipelineStage({
            runKey: '2026-07-31',
            windowStart: '2026-07-31T00:00:00.000Z',
            stage: 'reconcile',
        }, taskHelpers, deps);

        expect(deps.reconcile).toHaveBeenCalledTimes(1);
        expect(taskHelpers.addJob).toHaveBeenCalledWith(
            'completeDailyPipelineTask',
            expect.objectContaining({ stage: 'ratings' }),
            expect.anything(),
        );
    });

    it('waits for an incomplete rating replay before refreshing read models', async () => {
        const deps = dependencies({
            calculateRatings: vi.fn(async () => ({
                complete: false,
                busy: false,
                processedPeriods: 100,
                processedMatches: 500,
                replayed: true,
            })),
        });
        const taskHelpers = helpers();

        await runDailyPipelineStage({
            runKey: '2026-07-31',
            windowStart: '2026-07-31T00:00:00.000Z',
            stage: 'ratings',
        }, taskHelpers, deps);

        expect(taskHelpers.addJob).toHaveBeenCalledWith(
            'completeDailyPipelineTask',
            expect.objectContaining({ stage: 'ratings' }),
            expect.objectContaining({ runAt: new Date('2026-07-31T03:50:00.000Z') }),
        );
    });

    it('refreshes read models only at the final stage', async () => {
        const deps = dependencies();
        const taskHelpers = helpers();

        await runDailyPipelineStage({
            runKey: '2026-07-31',
            windowStart: '2026-07-31T00:00:00.000Z',
            stage: 'read-models',
        }, taskHelpers, deps);

        expect(deps.refreshReadModels).toHaveBeenCalledTimes(1);
        expect(taskHelpers.addJob).not.toHaveBeenCalled();
    });
});
