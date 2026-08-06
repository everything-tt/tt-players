import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await sql`
        CREATE TABLE scraping_pipeline_runs (
            run_key varchar PRIMARY KEY,
            window_start timestamptz NOT NULL,
            status varchar NOT NULL DEFAULT 'running',
            current_stage varchar NOT NULL,
            started_at timestamptz NOT NULL DEFAULT now(),
            finished_at timestamptz,
            duration_ms bigint,
            attempt_count integer NOT NULL DEFAULT 0,
            error_message text,
            updated_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT chk_scraping_pipeline_run_status
                CHECK (status IN ('running', 'completed', 'failed')),
            CONSTRAINT chk_scraping_pipeline_run_stage
                CHECK (current_stage IN ('wait-for-ingestion', 'reconcile', 'ratings', 'read-models')),
            CONSTRAINT chk_scraping_pipeline_run_attempts
                CHECK (attempt_count >= 0)
        )
    `.execute(db);

    await sql`
        CREATE TABLE scraping_pipeline_run_stages (
            run_key varchar NOT NULL REFERENCES scraping_pipeline_runs(run_key) ON DELETE CASCADE,
            stage varchar NOT NULL,
            status varchar NOT NULL DEFAULT 'running',
            started_at timestamptz NOT NULL DEFAULT now(),
            finished_at timestamptz,
            duration_ms bigint,
            attempt_count integer NOT NULL DEFAULT 0,
            summary jsonb NOT NULL DEFAULT '{}'::jsonb,
            error_message text,
            updated_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (run_key, stage),
            CONSTRAINT chk_scraping_pipeline_stage_name
                CHECK (stage IN ('wait-for-ingestion', 'reconcile', 'ratings', 'read-models')),
            CONSTRAINT chk_scraping_pipeline_stage_status
                CHECK (status IN ('running', 'waiting', 'completed', 'failed')),
            CONSTRAINT chk_scraping_pipeline_stage_attempts
                CHECK (attempt_count >= 0)
        )
    `.execute(db);

    await sql`
        CREATE INDEX idx_scraping_pipeline_runs_started_at
        ON scraping_pipeline_runs (started_at DESC)
    `.execute(db);

    await sql`
        CREATE INDEX idx_scraping_pipeline_runs_status_started_at
        ON scraping_pipeline_runs (status, started_at DESC)
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`DROP TABLE IF EXISTS scraping_pipeline_run_stages`.execute(db);
    await sql`DROP TABLE IF EXISTS scraping_pipeline_runs`.execute(db);
}
