import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Kysely, Migrator, PostgresDialect } from 'kysely';
import type { Migration, MigrationProvider } from 'kysely';
import pg from 'pg';
import type { Database } from '@tt-players/db';
import * as m001 from '@tt-players/db/src/migrations/001_create_enums.js';
import * as m002 from '@tt-players/db/src/migrations/002_create_core_tables.js';
import * as m029 from '@tt-players/db/src/migrations/029_create_source_registry.js';
import { bootstrapTerritorySourceCatalog } from '../territory-source-catalog.js';

const { Pool } = pg;
const TEST_DB_NAME = 'tt_territory_catalog_test';
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

class StaticMigrationProvider implements MigrationProvider {
    async getMigrations(): Promise<Record<string, Migration>> {
        return {
            '001_create_enums': m001,
            '002_create_core_tables': m002,
            '029_create_source_registry': m029,
        };
    }
}

let db: Kysely<Database>;

async function createTestDatabase(): Promise<void> {
    const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await adminPool.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    await adminPool.end();
}

async function dropTestDatabase(): Promise<void> {
    if (db) await db.destroy();
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

async function runMigrations(): Promise<void> {
    const migrator = new Migrator({
        db,
        provider: new StaticMigrationProvider(),
    });
    const { error } = await migrator.migrateToLatest();
    if (error) throw error;
}

beforeAll(async () => {
    await createTestDatabase();
    db = new Kysely<Database>({
        dialect: new PostgresDialect({
            pool: new Pool({ connectionString: TEST_DATABASE_URL }),
        }),
    });
    await runMigrations();
});

beforeEach(async () => {
    await db.deleteFrom('source_resources').execute();
    await db.deleteFrom('source_instances').execute();
    await db.deleteFrom('platforms').execute();
});

afterAll(async () => {
    await dropTestDatabase();
});

describe('territory source catalog database bootstrap', () => {
    it('is idempotent and enables only sources backed by operational legacy targets', async () => {
        const first = await bootstrapTerritorySourceCatalog(db);
        const firstSourceCount = await db
            .selectFrom('source_instances')
            .select(({ fn }) => fn.countAll<number>().as('count'))
            .executeTakeFirstOrThrow();
        const firstResourceCount = await db
            .selectFrom('source_resources')
            .select(({ fn }) => fn.countAll<number>().as('count'))
            .executeTakeFirstOrThrow();

        const second = await bootstrapTerritorySourceCatalog(db);
        const secondSourceCount = await db
            .selectFrom('source_instances')
            .select(({ fn }) => fn.countAll<number>().as('count'))
            .executeTakeFirstOrThrow();
        const secondResourceCount = await db
            .selectFrom('source_resources')
            .select(({ fn }) => fn.countAll<number>().as('count'))
            .executeTakeFirstOrThrow();

        expect(second).toEqual(first);
        expect(Number(secondSourceCount.count)).toBe(Number(firstSourceCount.count));
        expect(Number(secondResourceCount.count)).toBe(Number(firstResourceCount.count));
        expect(first.enabledLegacyLeagueNames).toEqual([
            'Dumfries Table Tennis League',
            'Perth Table Tennis Association',
            'West of Scotland Table Tennis League',
        ]);

        const enabledSources = await db
    .selectFrom('source_instances')
    .select(['key', 'enabled'])
    .where('enabled', '=', true)
    .orderBy('key', 'asc')
    .execute();
expect(enabledSources.map((source) => source.key)).toEqual([
    'dumfries-tt365',
    'perth-tt365',
    'west-of-scotland-tt365',
]);
    });

    it('rejects provider base-url conflicts instead of silently rewriting platforms', async () => {
        await db
            .insertInto('platforms')
            .values({
                name: 'TableTennis365',
                base_url: 'https://wrong.example.test',
            })
            .execute();

        await expect(bootstrapTerritorySourceCatalog(db)).rejects.toThrow(/conflicting base URLs/);

        const platform = await db
            .selectFrom('platforms')
            .select('base_url')
            .where('name', '=', 'TableTennis365')
            .executeTakeFirstOrThrow();
        expect(platform.base_url).toBe('https://wrong.example.test');
    });
});
