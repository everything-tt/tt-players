import { describe, expect, it } from 'vitest';
import { chunkItems } from '../batches.js';
import {
    PIPELINE_JOB_SPEC,
    RETRYABLE_JOB_SPEC,
    stableJobKey,
} from '../job-policy.js';

describe('worker job policy', () => {
    it('splits work into bounded batches without losing order', () => {
        expect(chunkItems([1, 2, 3, 4, 5], 2)).toEqual([
            [1, 2],
            [3, 4],
            [5],
        ]);
        expect(chunkItems([], 20)).toEqual([]);
    });

    it('rejects invalid batch sizes', () => {
        expect(() => chunkItems([1], 0)).toThrow('positive integer');
        expect(() => chunkItems([1], 1.5)).toThrow('positive integer');
    });

    it('creates deterministic, scoped job keys', () => {
        const first = stableJobKey('scrape-matches', 'competition-1', 'division-1');
        const same = stableJobKey('scrape-matches', 'competition-1', 'division-1');
        const different = stableJobKey('scrape-matches', 'competition-1', 'division-2');

        expect(first).toBe(same);
        expect(first).not.toBe(different);
        expect(first).toMatch(/^scrape-matches:[a-f0-9]{32}$/);
    });

    it('deduplicates idempotent refresh jobs even while locked', () => {
        expect(RETRYABLE_JOB_SPEC).toEqual({
            maxAttempts: 3,
            jobKeyMode: 'unsafe_dedupe',
        });
    });

    it('uses replacement semantics for pipeline stage continuation', () => {
        expect(PIPELINE_JOB_SPEC).toEqual({
            maxAttempts: 3,
            jobKeyMode: 'replace',
            priority: 100,
        });
    });
});
