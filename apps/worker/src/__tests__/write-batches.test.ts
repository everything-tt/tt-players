import { describe, expect, it, vi } from 'vitest';
import { chunkWriteItems, configuredWriteBatchSize } from '../write-batches.js';

describe('bounded database writes', () => {
    it('chunks arbitrary collections without dropping or duplicating rows', () => {
        const input = Array.from({ length: 1_003 }, (_value, index) => index);
        const chunks = chunkWriteItems(input, 250);

        expect(chunks.map((chunk) => chunk.length)).toEqual([250, 250, 250, 250, 3]);
        expect(chunks.flat()).toEqual(input);
    });

    it('caps configured batches even when an unsafe value is requested', () => {
        vi.stubEnv('DB_LOAD_CHUNK_SIZE', '50000');
        expect(configuredWriteBatchSize()).toBe(1_000);
        vi.unstubAllEnvs();
    });

    it('rejects invalid explicit batch sizes', () => {
        expect(() => chunkWriteItems([1], 0)).toThrow(/positive integer/);
    });
});
