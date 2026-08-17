import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await sql`CREATE SCHEMA IF NOT EXISTS staging`.execute(db);
    await sql`
        CREATE TABLE staging.source_request_limits (
            source_key varchar PRIMARY KEY,
            next_allowed_at timestamp NOT NULL DEFAULT now(),
            lease_token uuid,
            lease_expires_at timestamp,
            updated_at timestamp NOT NULL DEFAULT now(),
            CONSTRAINT ck_source_request_limits_lease_pair
                CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL))
        )
    `.execute(db);

    await sql`
        CREATE INDEX idx_source_request_limits_lease_expiry
        ON staging.source_request_limits (lease_expires_at)
        WHERE lease_token IS NOT NULL
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`DROP TABLE IF EXISTS staging.source_request_limits`.execute(db);
}
