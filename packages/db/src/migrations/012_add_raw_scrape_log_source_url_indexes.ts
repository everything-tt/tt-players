import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`.execute(db);

    await sql`
        CREATE INDEX IF NOT EXISTS idx_raw_scrape_logs_processed_endpoint_url_trgm
        ON raw_scrape_logs
        USING gin (lower(endpoint_url) gin_trgm_ops)
        WHERE status = 'processed'
    `.execute(db);

    await sql`
        CREATE INDEX IF NOT EXISTS idx_raw_scrape_logs_processed_scraped_at
        ON raw_scrape_logs (scraped_at DESC)
        WHERE status = 'processed'
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`DROP INDEX IF EXISTS idx_raw_scrape_logs_processed_scraped_at`.execute(db);
    await sql`DROP INDEX IF EXISTS idx_raw_scrape_logs_processed_endpoint_url_trgm`.execute(db);
}
