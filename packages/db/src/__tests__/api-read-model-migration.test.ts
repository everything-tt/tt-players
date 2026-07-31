import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import * as m001 from '../migrations/001_create_enums.js';
import * as m002 from '../migrations/002_create_core_tables.js';
import * as m003 from '../migrations/003_create_match_tables.js';
import * as m035 from '../migrations/035_create_api_read_models.js';

const { Pool } = pg;
const TEST_DB_NAME = `tt_players_read_models_test_${process.pid}_${process.env.VITEST_POOL_ID ?? 'main'}`;
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

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
    await m035.up(db);
}, 30_000);

afterAll(async () => {
    await db.destroy();
    const admin = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await admin.query(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = '${TEST_DB_NAME}'
          AND pid <> pg_backend_pid()
    `);
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.end();
}, 15_000);

describe('035_create_api_read_models', () => {
    it('creates and seeds the compact API read model tables', async () => {
        const tables = await sql<{ table_name: string }>`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN (
                'data_versions',
                'source_quality_snapshots',
                'player_active_leagues'
              )
            ORDER BY table_name
        `.execute(db);

        expect(tables.rows.map(({ table_name }) => table_name)).toEqual([
            'data_versions',
            'player_active_leagues',
            'source_quality_snapshots',
        ]);

        const versions = await db
            .selectFrom('data_versions')
            .select(['key', 'version'])
            .orderBy('key')
            .execute();
        expect(versions.map(({ key, version }) => ({ key, version: Number(version) }))).toEqual([
            { key: 'player-results', version: 1 },
            { key: 'ratings', version: 1 },
            { key: 'source-quality', version: 1 },
        ]);
    });
});
