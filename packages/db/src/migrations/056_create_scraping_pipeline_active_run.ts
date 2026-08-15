import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await sql`
        CREATE TABLE scraping_pipeline_active_runs (
            pipeline_name varchar PRIMARY KEY,
            run_key varchar NOT NULL REFERENCES scraping_pipeline_runs(run_key) ON DELETE CASCADE,
            lease_owner varchar NOT NULL,
            claimed_at timestamptz NOT NULL DEFAULT now(),
            heartbeat_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT chk_scraping_pipeline_active_name
                CHECK (pipeline_name = 'daily')
        )
    `.execute(db);

    await sql`
        CREATE INDEX idx_scraping_pipeline_active_runs_heartbeat_at
        ON scraping_pipeline_active_runs (heartbeat_at)
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`DROP TABLE IF EXISTS scraping_pipeline_active_runs`.execute(db);
}
