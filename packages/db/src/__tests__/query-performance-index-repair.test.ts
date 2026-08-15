import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import * as m001 from '../migrations/001_create_enums.js';
import * as m002 from '../migrations/002_create_core_tables.js';
import * as m003 from '../migrations/003_create_match_tables.js';
import * as m039 from '../migrations/039_restore_query_performance_indexes.js';

const { Pool } = pg;
const TEST_DB_NAME = `tt_players_index_repair_test_${process.pid}_${process.env.VITEST_POOL_ID ?? 'main'}`;
const TEST_DATABASE_BASE_URL = process.env.TEST_DATABASE_BASE_URL ?? 'postgres://postgres:postgres@localhost:5432';
const ADMIN_DATABASE_URL = `${TEST_DATABASE_BASE_URL}/postgres`;
const TEST_DATABASE_URL = `${TEST_DATABASE_BASE_URL}/${TEST_DB_NAME}`;

const expectedIndexes = [
    'idx_external_players_updated_at_active',
    'idx_fixtures_id_updated_active',
    'idx_rubbers_away_p1_fixture_updated_active',
    'idx_rubbers_away_p2_fixture_updated_active',
    'idx_rubbers_home_p1_fixture_updated_active',
    'idx_rubbers_home_p2_fixture_updated_active',
];

let db: Kysely<any>;

beforeAll(async () => {
    const admin = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    await admin.end();

    db = new Kysely({
        dialect: new PostgresDialect({
            pool: new Pool({ connectionString: TEST_DATABASE_URL }),
        }),
    });
    await m001.up(db);
    await m002.up(db);
    await m003.up(db);

    // Reproduce the definitions that production retained after migration 022
    // was edited in source but not replayed on already-migrated databases.
    await sql`CREATE INDEX idx_rubbers_updated_at ON rubbers(updated_at)`.execute(db);
    await sql`CREATE INDEX idx_fixtures_updated_at ON fixtures(updated_at)`.execute(db);
    await sql`CREATE INDEX idx_external_players_updated_at ON external_players(updated_at)`.execute(db);
}, 30_000);

afterAll(async () => {
    await db.destroy();
    const admin = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await admin.query(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1
          AND pid <> pg_backend_pid()
    `, [TEST_DB_NAME]);
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.end();
}, 15_000);

describe('039_restore_query_performance_indexes', () => {
    it('idempotently restores the six indexes missing from production', async () => {
        await m039.up(db);
        await m039.up(db);

        const indexes = await sql<{ indexname: string; indexdef: string }>`
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND indexname = ANY(${sql.val(expectedIndexes)}::text[])
            ORDER BY indexname
        `.execute(db);

        expect(indexes.rows.map(({ indexname }) => indexname)).toEqual(expectedIndexes);
        expect(indexes.rows.map(({ indexdef }) => indexdef)).toEqual([
            expect.stringMatching(/external_players USING btree \(updated_at DESC\).*deleted_at IS NULL/),
            expect.stringMatching(/fixtures USING btree \(id, updated_at DESC\).*deleted_at IS NULL/),
            expect.stringMatching(/rubbers USING btree \(away_player_1_id, fixture_id, updated_at DESC\).*away_player_1_id IS NOT NULL/),
            expect.stringMatching(/rubbers USING btree \(away_player_2_id, fixture_id, updated_at DESC\).*away_player_2_id IS NOT NULL/),
            expect.stringMatching(/rubbers USING btree \(home_player_1_id, fixture_id, updated_at DESC\).*home_player_1_id IS NOT NULL/),
            expect.stringMatching(/rubbers USING btree \(home_player_2_id, fixture_id, updated_at DESC\).*home_player_2_id IS NOT NULL/),
        ]);
    });

    it('keeps shared historical indexes when rolled back', async () => {
        await m039.down(db);

        const indexes = await sql<{ indexname: string }>`
            SELECT indexname
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND indexname = ANY(${sql.val(expectedIndexes)}::text[])
            ORDER BY indexname
        `.execute(db);

        expect(indexes.rows.map(({ indexname }) => indexname)).toEqual(expectedIndexes);
    });
});
