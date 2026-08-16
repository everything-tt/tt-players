import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Kysely, Migrator, PostgresDialect } from 'kysely';
import type { MigrationProvider, Migration } from 'kysely';
import pg from 'pg';
import { createHash } from 'node:crypto';

// Import migrations so Vitest's TS loader handles them
import * as m001 from '@tt-players/db/src/migrations/001_create_enums.js';
import * as m002 from '@tt-players/db/src/migrations/002_create_core_tables.js';
import * as m003 from '@tt-players/db/src/migrations/003_create_match_tables.js';
import * as m004 from '@tt-players/db/src/migrations/004_create_raw_scrape_logs.js';
import * as m005 from '@tt-players/db/src/migrations/005_make_rubber_players_nullable.js';
import * as m006 from '@tt-players/db/src/migrations/006_add_canonical_player_id_to_external_players.js';
import * as m007 from '@tt-players/db/src/migrations/007_add_performance_indexes.js';
import * as m008 from '@tt-players/db/src/migrations/008_create_cache_entries.js';
import * as m009 from '@tt-players/db/src/migrations/009_create_regions.js';
import * as m010 from '@tt-players/db/src/migrations/010_add_performance_indexes_2.js';
import * as m011 from '@tt-players/db/src/migrations/011_add_detail_page_performance_indexes.js';
import * as m012 from '@tt-players/db/src/migrations/012_add_raw_scrape_log_source_url_indexes.js';
import * as m013 from '@tt-players/db/src/migrations/013_add_rubber_score_source.js';
import * as m014 from '@tt-players/db/src/migrations/014_create_ranking_history_tables.js';
import * as m015 from '@tt-players/db/src/migrations/015_add_rubber_played_at.js';
import * as m016 from '@tt-players/db/src/migrations/016_create_sport80_event_scrape_state.js';
import * as m017 from '@tt-players/db/src/migrations/017_create_source_event_staging_tables.js';
import * as m018 from '@tt-players/db/src/migrations/018_add_competition_event_display_fields.js';
import * as m019 from '@tt-players/db/src/migrations/019_add_competition_source_fields.js';
import * as m020 from '@tt-players/db/src/migrations/020_create_staging_schema.js';
import * as m021 from '@tt-players/db/src/migrations/021_create_feedback_table.js';
import * as m029 from '@tt-players/db/src/migrations/029_create_source_registry.js';
import * as m052 from '@tt-players/db/src/migrations/052_add_raw_scrape_log_updated_at.js';
import * as m057 from '@tt-players/db/src/migrations/057_scope_raw_scrape_evidence.js';

import type { Database } from '@tt-players/db';

// ─── We import the function under test dynamically in each test ─────────────
// Dynamic imports via `await import()` are used inside each test so that
// vi.stubGlobal('fetch', ...) takes effect before the module loads.

const { Pool } = pg;

// ─── Test Database Setup ──────────────────────────────────────────────────────

const TEST_DB_NAME = 'tt_workers_test';
const TEST_DATABASE_BASE_URL = process.env.TEST_DATABASE_BASE_URL ?? 'postgres://postgres:postgres@localhost:5432';
const ADMIN_DATABASE_URL = `${TEST_DATABASE_BASE_URL}/postgres`;
const TEST_DATABASE_URL = `${TEST_DATABASE_BASE_URL}/${TEST_DB_NAME}`;

class StaticMigrationProvider implements MigrationProvider {
    async getMigrations(): Promise<Record<string, Migration>> {
        return {
            '001_create_enums': m001,
            '002_create_core_tables': m002,
            '003_create_match_tables': m003,
            '004_create_raw_scrape_logs': m004,
            '005_make_rubber_players_nullable': m005,
            '006_add_canonical_player_id_to_external_players': m006,
            '007_add_performance_indexes': m007,
            '008_create_cache_entries': m008,
            '009_create_regions': m009,
            '010_add_performance_indexes_2': m010,
            '011_add_detail_page_performance_indexes': m011,
            '012_add_raw_scrape_log_source_url_indexes': m012,
            '013_add_rubber_score_source': m013,
            '014_create_ranking_history_tables': m014,
            '015_add_rubber_played_at': m015,
            '016_create_sport80_event_scrape_state': m016,
            '017_create_source_event_staging_tables': m017,
            '018_add_competition_event_display_fields': m018,
            '019_add_competition_source_fields': m019,
            '020_create_staging_schema': m020,
            '021_create_feedback_table': m021,
            '029_create_source_registry': m029,
            '052_add_raw_scrape_log_updated_at': m052,
            '057_scope_raw_scrape_evidence': m057,
        };
    }
}

let testDb: Kysely<Database>;

async function createTestDatabase(): Promise<void> {
    const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await adminPool.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    await adminPool.query(`ALTER DATABASE ${TEST_DB_NAME} SET search_path TO public, staging`);
    await adminPool.end();
}

async function dropTestDatabase(): Promise<void> {
    if (testDb) {
        await testDb.destroy();
    }
    const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await adminPool.query(`
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = '${TEST_DB_NAME}'
          AND pid <> pg_backend_pid()
    `);
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await adminPool.end();
}

function createTestDb(): Kysely<Database> {
    return new Kysely<Database>({
        dialect: new PostgresDialect({
            pool: new Pool({ connectionString: TEST_DATABASE_URL }),
        }),
    });
}

async function runMigrations(db: Kysely<Database>): Promise<void> {
    const migrator = new Migrator({
        db,
        provider: new StaticMigrationProvider(),
    });
    const { error } = await migrator.migrateToLatest();
    if (error) throw error;
}

// ─── Test Constants ───────────────────────────────────────────────────────────

const MOCK_RESPONSE_BODY = JSON.stringify({
    league: 'Brentwood',
    standings: [{ team: 'Hutton A', points: 42 }],
});

const EXPECTED_HASH = createHash('sha256')
    .update(MOCK_RESPONSE_BODY)
    .digest('hex');

const TEST_URL_1 = 'https://brentwood.ttleagues.com/api/standings/div1';
const TEST_URL_2 = 'https://chelmsford.ttleagues.com/api/standings/div1';

let TEST_PLATFORM_ID: string;

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('Extractor: extractAndStore()', () => {
    beforeAll(async () => {
        await createTestDatabase();
        testDb = createTestDb();
        await runMigrations(testDb);

        // Seed a platform row (required FK for raw_scrape_logs.platform_id)
        const result = await testDb
            .insertInto('platforms')
            .values({
                name: 'TT Leagues',
                base_url: 'https://brentwood.ttleagues.com',
            })
            .returning('id')
            .executeTakeFirstOrThrow();

        TEST_PLATFORM_ID = result.id;
    }, 30_000);

    afterAll(async () => {
        await dropTestDatabase();
    }, 15_000);

    beforeEach(async () => {
        // Clear scrape logs between tests so each scenario starts clean
        await testDb.deleteFrom('raw_scrape_logs').execute();

        // Reset the global fetch mock
        vi.restoreAllMocks();
    });

    // ── Scenario 1: New URL + hash → INSERT ──────────────────────────────────

    it('should INSERT a new row when URL+hash does not exist', async () => {
        // Arrange: mock fetch to return our test body
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                text: () => Promise.resolve(MOCK_RESPONSE_BODY),
            }),
        );

        // Act
        const { extractAndStore } = await import('../extractor.js');
        await extractAndStore(TEST_URL_1, TEST_PLATFORM_ID, testDb);

        // Assert: exactly 1 row with correct data
        const rows = await testDb
            .selectFrom('raw_scrape_logs')
            .selectAll()
            .execute();

        expect(rows).toHaveLength(1);
        expect(rows[0].endpoint_url).toBe(TEST_URL_1);
        expect(rows[0].payload_hash).toBe(EXPECTED_HASH);
        expect(rows[0].raw_payload).toBe(MOCK_RESPONSE_BODY);
        expect(rows[0].platform_id).toBe(TEST_PLATFORM_ID);
        expect(rows[0].source_scope).toBe(`platform:${TEST_PLATFORM_ID}`);
        expect(rows[0].request_fingerprint).toBeTruthy();
        expect(rows[0].http_status).toBe(200);
        expect(rows[0].status).toBe('pending');
    });

    // ── Scenario 2: Same URL + same hash → UPDATE extraction timestamps ───────

    it('should UPDATE extraction timestamps (not duplicate) when the same URL returns the same data', async () => {
        // Arrange: mock fetch
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                text: () => Promise.resolve(MOCK_RESPONSE_BODY),
            }),
        );

        const { extractAndStore } = await import('../extractor.js');

        // Act: first call — inserts
        await extractAndStore(TEST_URL_1, TEST_PLATFORM_ID, testDb);

        // Grab the initial scraped_at
        const firstRows = await testDb
            .selectFrom('raw_scrape_logs')
            .selectAll()
            .execute();
        expect(firstRows).toHaveLength(1);
        const firstScrapedAt = firstRows[0].scraped_at;
        const firstUpdatedAt = firstRows[0].updated_at;

        // Small delay so timestamp can differ
        await new Promise((r) => setTimeout(r, 50));

        // Act: second call — same URL, same body → should upsert
        await extractAndStore(TEST_URL_1, TEST_PLATFORM_ID, testDb);

        // Assert: still exactly 1 row
        const secondRows = await testDb
            .selectFrom('raw_scrape_logs')
            .selectAll()
            .execute();
        expect(secondRows).toHaveLength(1);

        // The scraped_at should have been updated
        expect(new Date(secondRows[0].scraped_at).getTime())
            .toBeGreaterThanOrEqual(new Date(firstScrapedAt).getTime());
        expect(new Date(secondRows[0].updated_at).getTime())
            .toBeGreaterThanOrEqual(new Date(firstUpdatedAt).getTime());

        // Same data should be preserved
        expect(secondRows[0].endpoint_url).toBe(TEST_URL_1);
        expect(secondRows[0].payload_hash).toBe(EXPECTED_HASH);
    });

    // ── Scenario 3: Different URL, same hash → separate INSERT ───────────────

    it('should INSERT a separate row when a different URL returns the same data (same hash)', async () => {
        // Arrange: mock fetch
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                text: () => Promise.resolve(MOCK_RESPONSE_BODY),
            }),
        );

        const { extractAndStore } = await import('../extractor.js');

        // Act: insert for URL 1
        await extractAndStore(TEST_URL_1, TEST_PLATFORM_ID, testDb);

        // Act: insert for URL 2 (same body → same hash)
        await extractAndStore(TEST_URL_2, TEST_PLATFORM_ID, testDb);

        // Assert: 2 distinct rows
        const rows = await testDb
            .selectFrom('raw_scrape_logs')
            .selectAll()
            .orderBy('endpoint_url', 'asc')
            .execute();

        expect(rows).toHaveLength(2);

        // Both share the same hash but have different URLs
        expect(rows[0].endpoint_url).toBe(TEST_URL_1);
        expect(rows[1].endpoint_url).toBe(TEST_URL_2);
        expect(rows[0].payload_hash).toBe(EXPECTED_HASH);
        expect(rows[1].payload_hash).toBe(EXPECTED_HASH);
    });

    // ── Scenario 4: HTTP error → throws (allows Graphile Worker to retry) ────

    it('should throw on HTTP error so Graphile Worker can retry', async () => {
        // Arrange: mock fetch to return 403
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                status: 403,
                statusText: 'Forbidden',
                text: () => Promise.resolve('Access denied'),
            }),
        );

        const { extractAndStore } = await import('../extractor.js');

        // Act & Assert
        await expect(
            extractAndStore(TEST_URL_1, TEST_PLATFORM_ID, testDb),
        ).rejects.toThrow(/403/);

        // No row should be inserted
        const rows = await testDb
            .selectFrom('raw_scrape_logs')
            .selectAll()
            .execute();
        expect(rows).toHaveLength(0);
    });

    // ── Scenario 5: Network failure → throws ─────────────────────────────────

    it('should throw on network failure (DNS, timeout) so Graphile Worker can retry', async () => {
        // Arrange: mock fetch to reject (simulating DNS failure)
        vi.stubGlobal(
            'fetch',
            vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND example.com')),
        );

        const { extractAndStore } = await import('../extractor.js');

        // Act & Assert
        await expect(
            extractAndStore(TEST_URL_1, TEST_PLATFORM_ID, testDb),
        ).rejects.toThrow(/ENOTFOUND/);

        // No row should be inserted
        const rows = await testDb
            .selectFrom('raw_scrape_logs')
            .selectAll()
            .execute();
        expect(rows).toHaveLength(0);
    });
});
