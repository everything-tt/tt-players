import { sql, type Kysely } from 'kysely';

export interface RawScrapeRetentionPolicy {
    processedDays: number;
    failedDays: number;
    batchSize: number;
}

const DEFAULT_POLICY: RawScrapeRetentionPolicy = {
    processedDays: 90,
    failedDays: 365,
    batchSize: 500,
};

function positiveInteger(value: string | undefined, fallback: number, maximum: number): number {
    const parsed = Number(value ?? fallback);
    if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, maximum);
}

export function rawScrapeRetentionPolicy(): RawScrapeRetentionPolicy {
    return {
        processedDays: positiveInteger(
            process.env['RAW_SCRAPE_PROCESSED_RETENTION_DAYS'],
            DEFAULT_POLICY.processedDays,
            3_650,
        ),
        failedDays: positiveInteger(
            process.env['RAW_SCRAPE_FAILED_RETENTION_DAYS'],
            DEFAULT_POLICY.failedDays,
            3_650,
        ),
        batchSize: positiveInteger(
            process.env['RAW_SCRAPE_RETENTION_BATCH_SIZE'],
            DEFAULT_POLICY.batchSize,
            5_000,
        ),
    };
}

export function rawScrapeRetentionCutoffs(
    now: Date,
    policy: RawScrapeRetentionPolicy = rawScrapeRetentionPolicy(),
): { processedBefore: Date; failedBefore: Date } {
    const dayMs = 24 * 60 * 60 * 1_000;
    return {
        processedBefore: new Date(now.getTime() - policy.processedDays * dayMs),
        failedBefore: new Date(now.getTime() - policy.failedDays * dayMs),
    };
}

/**
 * Delete one bounded batch of disposable raw payloads.
 *
 * Pending rows are never eligible. Rows that participate in deterministic
 * transform dependencies are also retained because deleting either side would
 * destroy replay/provenance evidence. Those protected rows can later move to an
 * archive tier, but are intentionally not silently discarded here.
 */
export async function pruneRawScrapeLogs(
    database: Kysely<any>,
    now: Date = new Date(),
    policy: RawScrapeRetentionPolicy = rawScrapeRetentionPolicy(),
): Promise<number> {
    const { processedBefore, failedBefore } = rawScrapeRetentionCutoffs(now, policy);

    return database.transaction().execute(async (trx) => {
        const candidates = await sql<{ id: string }>`
            SELECT raw.id
            FROM staging.raw_scrape_logs raw
            WHERE (
                (raw.status = 'processed' AND raw.updated_at < ${processedBefore})
                OR (raw.status = 'failed' AND raw.updated_at < ${failedBefore})
            )
              AND NOT EXISTS (
                  SELECT 1
                  FROM staging.raw_scrape_evidence_dependencies dependency
                  WHERE dependency.parent_log_id = raw.id
                     OR dependency.evidence_log_id = raw.id
              )
            ORDER BY raw.updated_at ASC, raw.id ASC
            LIMIT ${policy.batchSize}
            FOR UPDATE OF raw SKIP LOCKED
        `.execute(trx);

        const ids = candidates.rows.map((row) => row.id);
        if (ids.length === 0) return 0;

        await sql`
            DELETE FROM staging.raw_scrape_logs
            WHERE id IN (${sql.join(ids.map((id) => sql`${id}::uuid`))})
        `.execute(trx);
        return ids.length;
    });
}
