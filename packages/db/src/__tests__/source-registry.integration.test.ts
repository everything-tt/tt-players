import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import * as m001 from '../migrations/001_create_enums.js';
import * as m002 from '../migrations/002_create_core_tables.js';
import * as m029 from '../migrations/029_create_source_registry.js';

const { Pool } = pg;
const TEST_DB_NAME = 'tt_players_source_registry_test';
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

let db: Kysely<any>;

async function recreateDatabase(): Promise<void> {
    const admin = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    await admin.end();
}

async function dropDatabase(): Promise<void> {
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
}

describe('source registry migration', () => {
    beforeAll(async () => {
        await recreateDatabase();
        db = new Kysely({
            dialect: new PostgresDialect({
                pool: new Pool({ connectionString: TEST_DATABASE_URL }),
            }),
        });
        await m001.up(db);
        await m002.up(db);
        await m029.up(db);
    }, 30_000);

    afterAll(async () => {
        await dropDatabase();
    }, 15_000);

    it('creates source instance and resource tables with health fields', async () => {
        const result = await sql<{ table_name: string; column_name: string }>`
            SELECT table_name, column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name IN ('source_instances', 'source_resources')
        `.execute(db);

        const columns = new Set(
            result.rows.map((row) => `${row.table_name}.${row.column_name}`),
        );
        const requiredColumns = [
            'source_instances.adapter_key',
            'source_instances.config',
            'source_instances.last_seen_at',
            'source_resources.resource_type',
            'source_resources.adapter_version',
            'source_resources.refresh_policy',
            'source_resources.last_succeeded_at',
            'source_resources.last_error',
            'source_resources.consecutive_failures',
        ];
        for (const column of requiredColumns) {
            expect(columns).toContain(column);
        }
    });

    it('enforces stable instance and resource identities', async () => {
        const platform = await db
            .insertInto('platforms')
            .values({ name: 'Example', base_url: 'https://example.test' })
            .returning('id')
            .executeTakeFirstOrThrow();

        const instance = await db
            .insertInto('source_instances')
            .values({
                platform_id: platform.id,
                key: 'example-tenant',
                name: 'Example tenant',
                base_url: 'https://tenant.example.test',
                adapter_key: 'example',
            })
            .returning('id')
            .executeTakeFirstOrThrow();

        await expect(db
            .insertInto('source_instances')
            .values({
                platform_id: platform.id,
                key: 'example-tenant',
                name: 'Duplicate tenant',
                base_url: 'https://duplicate.example.test',
                adapter_key: 'example',
            })
            .execute()
        ).rejects.toThrow();

        await db
            .insertInto('source_resources')
            .values({
                source_instance_id: instance.id,
                resource_type: 'standings',
                external_id: 'division-1',
                adapter_version: '1',
            })
            .execute();

        await expect(db
            .insertInto('source_resources')
            .values({
                source_instance_id: instance.id,
                resource_type: 'standings',
                external_id: 'division-1',
                adapter_version: '2',
            })
            .execute()
        ).rejects.toThrow();
    });

    it('rejects negative failure counts and cascades instance deletion', async () => {
        const platform = await db
            .selectFrom('platforms')
            .select('id')
            .where('name', '=', 'Example')
            .executeTakeFirstOrThrow();
        const instance = await db
            .selectFrom('source_instances')
            .select('id')
            .where('platform_id', '=', platform.id)
            .executeTakeFirstOrThrow();

        await expect(db
            .updateTable('source_resources')
            .set({ consecutive_failures: -1 })
            .where('source_instance_id', '=', instance.id)
            .execute()
        ).rejects.toThrow();

        await db
            .deleteFrom('source_instances')
            .where('id', '=', instance.id)
            .execute();

        const remaining = await db
            .selectFrom('source_resources')
            .select(({ fn }) => fn.countAll<number>().as('count'))
            .executeTakeFirstOrThrow();
        expect(Number(remaining.count)).toBe(0);
    });
});
