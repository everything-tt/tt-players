import { type Kysely, sql } from 'kysely';

/**
 * Raw evidence used to be unique only by (endpoint_url, payload_hash).
 * That collapses logically different requests when request identity lives in
 * headers (for example TT Leagues' Tenant header), and it gives source-registry
 * resources no durable ownership link to their evidence.
 *
 * Keep legacy writers safe with a partial URL/hash index, while new writers use
 * the source/request-aware uniqueness constraint.
 */
export async function up(db: Kysely<any>): Promise<void> {
    await sql`
        ALTER TABLE staging.raw_scrape_logs
            ADD COLUMN source_resource_id uuid,
            ADD COLUMN source_scope varchar,
            ADD COLUMN request_fingerprint varchar,
            ADD COLUMN adapter_version varchar,
            ADD COLUMN http_status integer
    `.execute(db);

    await sql`
        ALTER TABLE staging.raw_scrape_logs
            ADD CONSTRAINT fk_raw_scrape_logs_source_resource
            FOREIGN KEY (source_resource_id)
            REFERENCES source_resources(id)
            ON DELETE SET NULL
    `.execute(db);

    await sql`
        ALTER TABLE staging.raw_scrape_logs
            ADD CONSTRAINT ck_raw_scrape_logs_http_status
            CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
            ADD CONSTRAINT ck_raw_scrape_logs_identity_pair
            CHECK ((source_scope IS NULL) = (request_fingerprint IS NULL)),
            ADD CONSTRAINT ck_raw_scrape_logs_resource_scope
            CHECK (
                source_resource_id IS NULL
                OR (
                    source_scope IS NOT NULL
                    AND source_scope = 'resource:' || source_resource_id::text
                )
            )
    `.execute(db);

    // Preserve the old no-header GET identity for existing evidence so the
    // first post-migration fetch does not create a duplicate row.
    await sql`
        UPDATE staging.raw_scrape_logs
        SET
            source_scope = 'platform:' || platform_id::text,
            request_fingerprint = md5('GET' || chr(10) || endpoint_url || chr(10))
        WHERE source_scope IS NULL
           OR request_fingerprint IS NULL
    `.execute(db);

    await sql`
        ALTER TABLE staging.raw_scrape_logs
            DROP CONSTRAINT IF EXISTS uq_raw_scrape_logs_url_hash
    `.execute(db);

    await sql`
        ALTER TABLE staging.raw_scrape_logs
            ADD CONSTRAINT uq_raw_scrape_logs_source_request_hash
            UNIQUE (source_scope, request_fingerprint, payload_hash)
    `.execute(db);

    // Backward-compatible direct inserts may omit the new identity fields.
    // Keep the old invariant for those rows until every writer is migrated.
    await sql`
        CREATE UNIQUE INDEX uq_raw_scrape_logs_legacy_url_hash
        ON staging.raw_scrape_logs (endpoint_url, payload_hash)
        WHERE source_scope IS NULL
    `.execute(db);

    await sql`
        CREATE INDEX idx_raw_scrape_logs_source_resource
        ON staging.raw_scrape_logs (source_resource_id, scraped_at DESC)
        WHERE source_resource_id IS NOT NULL
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`
        DROP INDEX IF EXISTS staging.idx_raw_scrape_logs_source_resource
    `.execute(db);
    await sql`
        DROP INDEX IF EXISTS staging.uq_raw_scrape_logs_legacy_url_hash
    `.execute(db);
    await sql`
        ALTER TABLE staging.raw_scrape_logs
            DROP CONSTRAINT IF EXISTS uq_raw_scrape_logs_source_request_hash,
            DROP CONSTRAINT IF EXISTS ck_raw_scrape_logs_resource_scope,
            DROP CONSTRAINT IF EXISTS ck_raw_scrape_logs_identity_pair,
            DROP CONSTRAINT IF EXISTS ck_raw_scrape_logs_http_status,
            DROP CONSTRAINT IF EXISTS fk_raw_scrape_logs_source_resource
    `.execute(db);

    // The old schema cannot represent two source-scoped rows with the same
    // URL/content pair. Retain the most recently observed row on downgrade.
    await sql`
        DELETE FROM staging.raw_scrape_logs older
        USING staging.raw_scrape_logs newer
        WHERE older.endpoint_url = newer.endpoint_url
          AND older.payload_hash = newer.payload_hash
          AND (older.scraped_at, older.id::text) < (newer.scraped_at, newer.id::text)
    `.execute(db);

    await sql`
        ALTER TABLE staging.raw_scrape_logs
            DROP COLUMN source_resource_id,
            DROP COLUMN source_scope,
            DROP COLUMN request_fingerprint,
            DROP COLUMN adapter_version,
            DROP COLUMN http_status
    `.execute(db);

    await sql`
        ALTER TABLE staging.raw_scrape_logs
            ADD CONSTRAINT uq_raw_scrape_logs_url_hash
            UNIQUE (endpoint_url, payload_hash)
    `.execute(db);
}
