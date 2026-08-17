const DEFAULT_WRITE_BATCH_SIZE = 250;
const MAX_WRITE_BATCH_SIZE = 1_000;

export function configuredWriteBatchSize(): number {
    const raw = Number(process.env['DB_LOAD_CHUNK_SIZE'] ?? DEFAULT_WRITE_BATCH_SIZE);
    if (!Number.isInteger(raw) || raw <= 0) return DEFAULT_WRITE_BATCH_SIZE;
    return Math.min(raw, MAX_WRITE_BATCH_SIZE);
}

export function chunkWriteItems<T>(
    items: readonly T[],
    batchSize = configuredWriteBatchSize(),
): T[][] {
    if (!Number.isInteger(batchSize) || batchSize <= 0) {
        throw new Error('write batch size must be a positive integer');
    }

    const batches: T[][] = [];
    for (let index = 0; index < items.length; index += batchSize) {
        batches.push(items.slice(index, index + batchSize));
    }
    return batches;
}
