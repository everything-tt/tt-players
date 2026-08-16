import { describe, expect, it, vi } from 'vitest';
import {
    rawScrapeRetentionCutoffs,
    rawScrapeRetentionPolicy,
} from '../raw-scrape-retention.js';

describe('raw scrape retention policy', () => {
    it('keeps failed evidence longer than processed evidence by default', () => {
        const policy = rawScrapeRetentionPolicy();
        expect(policy.failedDays).toBeGreaterThan(policy.processedDays);
        expect(policy.batchSize).toBeLessThanOrEqual(5_000);
    });

    it('computes deterministic status-specific cutoffs', () => {
        const now = new Date('2026-08-16T12:00:00Z');
        const cutoffs = rawScrapeRetentionCutoffs(now, {
            processedDays: 30,
            failedDays: 180,
            batchSize: 100,
        });
        expect(cutoffs.processedBefore.toISOString()).toBe('2026-07-17T12:00:00.000Z');
        expect(cutoffs.failedBefore.toISOString()).toBe('2026-02-17T12:00:00.000Z');
    });

    it('bounds unsafe environment configuration', () => {
        vi.stubEnv('RAW_SCRAPE_RETENTION_BATCH_SIZE', '999999');
        vi.stubEnv('RAW_SCRAPE_PROCESSED_RETENTION_DAYS', '-1');
        const policy = rawScrapeRetentionPolicy();
        expect(policy.batchSize).toBe(5_000);
        expect(policy.processedDays).toBe(90);
        vi.unstubAllEnvs();
    });
});
