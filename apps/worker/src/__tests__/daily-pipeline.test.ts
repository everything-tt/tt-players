import { describe, expect, it, vi } from 'vitest';
import {
    runDailyPipelineStage,
    type DailyPipelineDependencies,
} from '../tasks/completeDailyPipelineTask.js';

const NOW = new Date('2026-07-31T03:45:00.000Z');

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
