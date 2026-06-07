import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await sql`CREATE SCHEMA IF NOT EXISTS staging`.execute(db);

    await sql`ALTER TABLE raw_scrape_logs SET SCHEMA staging`.execute(db);
    await sql`ALTER TABLE sport80_event_scrape_state SET SCHEMA staging`.execute(db);
    await sql`ALTER TABLE source_events SET SCHEMA staging`.execute(db);
    await sql`ALTER TABLE source_event_result_rows SET SCHEMA staging`.execute(db);
    await sql`ALTER TABLE ranking_categories SET SCHEMA staging`.execute(db);
    await sql`ALTER TABLE ranking_periods SET SCHEMA staging`.execute(db);
    await sql`ALTER TABLE ranking_entries SET SCHEMA staging`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`ALTER TABLE staging.ranking_entries SET SCHEMA public`.execute(db);
    await sql`ALTER TABLE staging.ranking_periods SET SCHEMA public`.execute(db);
    await sql`ALTER TABLE staging.ranking_categories SET SCHEMA public`.execute(db);
    await sql`ALTER TABLE staging.source_event_result_rows SET SCHEMA public`.execute(db);
    await sql`ALTER TABLE staging.source_events SET SCHEMA public`.execute(db);
    await sql`ALTER TABLE staging.sport80_event_scrape_state SET SCHEMA public`.execute(db);
    await sql`ALTER TABLE staging.raw_scrape_logs SET SCHEMA public`.execute(db);

    await sql`DROP SCHEMA IF EXISTS staging`.execute(db);
}
