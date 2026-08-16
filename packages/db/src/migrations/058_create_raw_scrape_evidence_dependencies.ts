import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await sql`
        CREATE TABLE staging.raw_scrape_evidence_dependencies (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            parent_log_id uuid NOT NULL
                REFERENCES staging.raw_scrape_logs(id) ON DELETE CASCADE,
            evidence_type varchar NOT NULL,
            requirement_key varchar NOT NULL,
            endpoint_url varchar NOT NULL,
            evidence_log_id uuid
                REFERENCES staging.raw_scrape_logs(id) ON DELETE SET NULL,
            status scrape_status NOT NULL DEFAULT 'pending',
            created_at timestamp NOT NULL DEFAULT now(),
            updated_at timestamp NOT NULL DEFAULT now(),
            CONSTRAINT uq_raw_scrape_evidence_dependency
                UNIQUE (parent_log_id, evidence_type, requirement_key)
        )
    `.execute(db);

    await sql`
        CREATE INDEX idx_raw_scrape_evidence_dependencies_status
        ON staging.raw_scrape_evidence_dependencies (status, updated_at)
    `.execute(db);

    await sql`
        CREATE INDEX idx_raw_scrape_evidence_dependencies_evidence_log
        ON staging.raw_scrape_evidence_dependencies (evidence_log_id)
        WHERE evidence_log_id IS NOT NULL
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`
        DROP TABLE IF EXISTS staging.raw_scrape_evidence_dependencies
    `.execute(db);
}
