import { type Kysely, sql } from 'kysely';

/**
 * raw_scrape_logs is both the parser replay store and a source of scrape
 * observability data.  scraped_at records extraction, but it does not move
 * when the transform phase changes status from pending to processed/failed.
 * Keep a separate mutation timestamp so downstream replicas can incrementally
 * observe both new payloads and processing outcomes.
 */
export async function up(db: Kysely<any>): Promise<void> {
    await sql`
        ALTER TABLE staging.raw_scrape_logs
            ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now()
    `.execute(db);

    await sql`
        CREATE INDEX IF NOT EXISTS idx_raw_scrape_logs_updated_at
        ON staging.raw_scrape_logs (updated_at DESC)
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`
        DROP INDEX IF EXISTS staging.idx_raw_scrape_logs_updated_at
    `.execute(db);

    await sql`
        ALTER TABLE staging.raw_scrape_logs
            DROP COLUMN IF EXISTS updated_at
    `.execute(db);
}
