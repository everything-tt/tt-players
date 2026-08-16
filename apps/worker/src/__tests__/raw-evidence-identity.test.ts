import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Kysely, Migrator, PostgresDialect } from 'kysely';
import type { MigrationProvider, Migration } from 'kysely';
import pg from 'pg';

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
import {
    createRequestFingerprint,
    extractAndStore,
    storeScrapePayload,
} from '../extractor.js';

const { Pool } = pg;
const TEST_DB_NAME = 'tt_raw_evidence_identity_test';
const TEST_DATABASE_BASE_URL = process.env.TEST_DATABASE_BASE_URL
    ?? 'postgres://postgres:postgres@localhost:5432';
const ADMIN_DATABASE_URL = `${TEST_DATABASE_BASE_URL}/postgres`;
const TEST_DATABASE_URL = `${TEST_DATABASE_BASE_URL}/${TEST_DB_NAME}`;
const BODY = JSON.stringify({ rows: [{ id: 1 }] });
const URL = 'https://ttleagues-api.azurewebsites.net/api/divisions/123/matches';

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
let platformId: string;

async function createTestDatabase(): Promise<void> {
    const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await adminPool.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    await adminPool.query(`ALTER DATABASE ${TEST_DB_NAME} SET search_path TO public, staging`);
    await adminPool.end();
}

async function dropTestDatabase(): Promise<void> {
    if (testDb) await testDb.destroy();
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
    const migrator = new Migrator({ db, provider: new StaticMigrationProvider() });
    const { error } = await migrator.migrateToLatest();
    if (error) throw error;
}

describe('raw scrape evidence identity', () => {
    beforeAll(async () => {
        await createTestDatabase();
        testDb = createTestDb();
        await runMigrations(testDb);
        const platform = await testDb
            .insertInto('platforms')
            .values({ name: 'TT Leagues', base_url: 'https://ttleagues-api.azurewebsites.net' })
            .returning('id')
            .executeTakeFirstOrThrow();
        platformId = platform.id;
    }, 30_000);

    afterAll(async () => {
        await dropTestDatabase();
    }, 15_000);

    beforeEach(async () => {
        vi.restoreAllMocks();
        await testDb.deleteFrom('staging.raw_scrape_logs').execute();
        await testDb.deleteFrom('source_resources').execute();
        await testDb.deleteFrom('source_instances').execute();
    });

    it('keeps identical URL/content separate for different Tenant headers', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(BODY, { status: 200 })));

        await extractAndStore(URL, platformId, testDb, {
            headers: { Tenant: 'brentwood.ttleagues.com', Entry: '1' },
        });
        await extractAndStore(URL, platformId, testDb, {
            headers: { Tenant: 'chelmsford.ttleagues.com', Entry: '1' },
        });

        const rows = await testDb
            .selectFrom('staging.raw_scrape_logs')
            .select(['request_fingerprint', 'source_scope', 'payload_hash'])
            .execute();

        expect(rows).toHaveLength(2);
        expect(new Set(rows.map((row) => row.request_fingerprint)).size).toBe(2);
        expect(new Set(rows.map((row) => row.source_scope))).toEqual(
            new Set([`platform:${platformId}`]),
        );
        expect(new Set(rows.map((row) => row.payload_hash)).size).toBe(1);
    });

    it('deduplicates equivalent requests regardless of header casing/order', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(BODY, { status: 200 })));

        const first = await extractAndStore(URL, platformId, testDb, {
            headers: { Tenant: 'brentwood.ttleagues.com', Entry: '1' },
        });
        const second = await extractAndStore(URL, platformId, testDb, {
            headers: { entry: '1', tenant: 'brentwood.ttleagues.com' },
        });

        expect(second).toBe(first);
        const count = await testDb
            .selectFrom('staging.raw_scrape_logs')
            .select((eb) => eb.fn.countAll<string>().as('count'))
            .executeTakeFirstOrThrow();
        expect(Number(count.count)).toBe(1);
    });

    it('does not let rotating credentials change logical request identity', () => {
        const first = createRequestFingerprint(URL, {
            headers: {
                Tenant: 'brentwood.ttleagues.com',
                Authorization: 'Bearer token-one',
                Cookie: 'session=one',
            },
        });
        const second = createRequestFingerprint(URL, {
            headers: {
                tenant: 'brentwood.ttleagues.com',
                authorization: 'Bearer token-two',
                cookie: 'session=two',
            },
        });

        expect(second).toBe(first);
    });

    it('includes deterministic request bodies in logical request identity', () => {
        const first = createRequestFingerprint(URL, {
            method: 'POST',
            body: new URLSearchParams({ page: '1' }),
        });
        const second = createRequestFingerprint(URL, {
            method: 'POST',
            body: new URLSearchParams({ page: '2' }),
        });

        expect(second).not.toBe(first);
    });

    it('scopes identical request/content to distinct source resources', async () => {
        const instance = await testDb
            .insertInto('source_instances')
            .values({
                platform_id: platformId,
                key: 'tt-leagues-test',
                name: 'TT Leagues test',
                base_url: 'https://ttleagues-api.azurewebsites.net',
                adapter_key: 'tt-leagues',
                config: {},
            })
            .returning('id')
            .executeTakeFirstOrThrow();

        const resources = await testDb
            .insertInto('source_resources')
            .values([
                {
                    source_instance_id: instance.id,
                    resource_type: 'fixtures',
                    external_id: 'division-a',
                    name: 'Division A',
                    public_url: URL,
                    adapter_version: '1.0.0',
                    refresh_policy: {},
                },
                {
                    source_instance_id: instance.id,
                    resource_type: 'fixtures',
                    external_id: 'division-b',
                    name: 'Division B',
                    public_url: URL,
                    adapter_version: '1.0.0',
                    refresh_policy: {},
                },
            ])
            .returning(['id'])
            .execute();

        const requestFingerprint = createRequestFingerprint(URL, {
            headers: { Tenant: 'shared.ttleagues.com', Entry: '1' },
        });

        await storeScrapePayload(URL, platformId, BODY, testDb, {
            sourceResourceId: resources[0].id,
            requestFingerprint,
            adapterVersion: '1.0.0',
            httpStatus: 200,
        });
        await storeScrapePayload(URL, platformId, BODY, testDb, {
            sourceResourceId: resources[1].id,
            requestFingerprint,
            adapterVersion: '1.0.0',
            httpStatus: 200,
        });

        const rows = await testDb
            .selectFrom('staging.raw_scrape_logs')
            .select(['source_resource_id', 'source_scope', 'adapter_version', 'http_status'])
            .orderBy('source_scope')
            .execute();

        expect(rows).toHaveLength(2);
        expect(new Set(rows.map((row) => row.source_resource_id))).toEqual(
            new Set(resources.map((resource) => resource.id)),
        );
        expect(rows.every((row) => row.adapter_version === '1.0.0')).toBe(true);
        expect(rows.every((row) => row.http_status === 200)).toBe(true);
    });
});
