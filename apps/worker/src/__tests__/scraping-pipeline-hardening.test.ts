import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { summarizeIngestionBarrier } from '../tasks/completeDailyPipelineTask.js';

describe('scraping pipeline hardening', () => {
    it('blocks on failed staged raw evidence even when the Graphile queue is clean', () => {
        expect(summarizeIngestionBarrier({
            queuePending: 0,
            queueFailed: 0,
            rawPending: 0,
            rawFailed: 1,
            resourcePending: 0,
            resourceFailed: 0,
        })).toEqual({
            pending: 0,
            failed: 1,
            queuePending: 0,
            queueFailed: 0,
            stagedPending: 0,
            stagedFailed: 1,
        });
    });

    it('waits on unresolved staged resource state without requiring a task identifier', () => {
        expect(summarizeIngestionBarrier({
            queuePending: 0,
            queueFailed: 0,
            rawPending: 0,
            rawFailed: 0,
            resourcePending: 2,
            resourceFailed: 0,
        })).toEqual({
            pending: 2,
            failed: 0,
            queuePending: 0,
            queueFailed: 0,
            stagedPending: 2,
            stagedFailed: 0,
        });
    });

    it('combines queue and staged state into one authoritative barrier result', () => {
        expect(summarizeIngestionBarrier({
            queuePending: 2,
            queueFailed: 1,
            rawPending: 3,
            rawFailed: 4,
            resourcePending: 5,
            resourceFailed: 6,
        })).toEqual({
            pending: 10,
            failed: 11,
            queuePending: 2,
            queueFailed: 1,
            stagedPending: 8,
            stagedFailed: 10,
        });
    });

    it('keeps per-log transform/load free of global player reconciliation', async () => {
        const source = await readFile(
            new URL('../tasks/processLogTask.ts', import.meta.url),
            'utf8',
        );

        expect(source).not.toContain('reconcilePlayersByName');
        expect(source).not.toContain("../player-reconciler.js");
    });
});
