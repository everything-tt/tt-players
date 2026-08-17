import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await sql`
        CREATE TABLE scrape_runs (
            run_key varchar PRIMARY KEY,
            window_start timestamptz NOT NULL,
            status varchar NOT NULL DEFAULT 'running',
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT chk_scrape_runs_status
                CHECK (status IN ('running', 'succeeded', 'failed'))
        )
    `.execute(db);

    await sql`
        CREATE TABLE scrape_run_resources (
            run_key varchar NOT NULL REFERENCES scrape_runs(run_key) ON DELETE CASCADE,
            resource_key varchar NOT NULL,
            source varchar NOT NULL,
            resource_type varchar NOT NULL,
            status varchar NOT NULL DEFAULT 'pending',
            attempt_count integer NOT NULL DEFAULT 0,
            last_error text,
            started_at timestamptz,
            finished_at timestamptz,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (run_key, resource_key),
            CONSTRAINT chk_scrape_run_resources_status
                CHECK (status IN ('pending', 'succeeded', 'failed')),
            CONSTRAINT chk_scrape_run_resources_attempts
                CHECK (attempt_count >= 0)
        )
    `.execute(db);

    await sql`
        CREATE INDEX idx_scrape_run_resources_status
        ON scrape_run_resources (run_key, status)
    `.execute(db);

    await sql`
        CREATE INDEX idx_scrape_runs_created_at
        ON scrape_runs (created_at DESC)
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`DROP TABLE IF EXISTS scrape_run_resources`.execute(db);
    await sql`DROP TABLE IF EXISTS scrape_runs`.execute(db);
}
