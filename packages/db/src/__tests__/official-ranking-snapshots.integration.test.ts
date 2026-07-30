import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import * as m001 from '../migrations/001_create_enums.js';
import * as m002 from '../migrations/002_create_core_tables.js';
import * as m003 from '../migrations/003_create_match_tables.js';
import * as m014 from '../migrations/014_create_ranking_history_tables.js';
import * as m033 from '../migrations/033_create_official_ranking_snapshots.js';

const { Pool } = pg;
const TEST_DB_NAME = 'tt_players_official_rankings_test';
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

describe('official ranking snapshot migration', () => {
    beforeAll(async () => {
        await recreateDatabase();
        db = new Kysely({
            dialect: new PostgresDialect({
                pool: new Pool({ connectionString: TEST_DATABASE_URL }),
            }),
        });
        await m001.up(db);
        await m002.up(db);
        await m003.up(db);
        await m014.up(db);

        const platform = await db
            .insertInto('platforms')
            .values({ name: 'Sport80', base_url: 'https://tabletennisengland.sport80.com' })
            .returning('id')
            .executeTakeFirstOrThrow();
        const player = await db
            .insertInto('external_players')
            .values({ platform_id: platform.id, external_id: 'athlete-10', name: 'Example Player' })
            .returning('id')
            .executeTakeFirstOrThrow();
        const category = await db
            .insertInto('ranking_categories')
            .values({ platform_id: platform.id, external_id: 'senior-men', name: 'Senior Men' })
            .returning('id')
            .executeTakeFirstOrThrow();
        const period = await db
            .insertInto('ranking_periods')
            .values({
                platform_id: platform.id,
                external_id: 'period-2026-07',
                label: 'July 2026',
                period_end_date: '2026-07-31',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        await db
            .insertInto('ranking_entries')
            .values({
                period_id: period.id,
                category_id: category.id,
                player_id: player.id,
                list_kind: 'ranking',
                ranking_row_external_id: 'row-1',
                athlete_external_id: '10',
                rank: 12,
                points: 875,
                county_country: 'Essex',
                inactive_periods: 0,
                is_initial_rating: false,
            })
            .execute();

        await sql`CREATE SCHEMA staging`.execute(db);
        await sql`ALTER TABLE ranking_entries SET SCHEMA staging`.execute(db);
        await sql`ALTER TABLE ranking_periods SET SCHEMA staging`.execute(db);
        await sql`ALTER TABLE ranking_categories SET SCHEMA staging`.execute(db);
        await m033.up(db);
    }, 30_000);

    afterAll(async () => {
        await dropDatabase();
    }, 15_000);

    it('backfills existing worker staging history into the public snapshot table', async () => {
        const rows = await db
            .selectFrom('official_ranking_snapshots')
            .selectAll()
            .execute();

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            source_category_external_id: 'senior-men',
            category_name: 'Senior Men',
            source_period_external_id: 'period-2026-07',
            period_label: 'July 2026',
            list_kind: 'ranking',
            ranking_row_external_id: 'row-1',
            athlete_external_id: '10',
            rank: 12,
            points: 875,
            county_country: 'Essex',
            inactive_periods: 0,
            is_initial_rating: false,
        });
        expect(String(rows[0].period_end_date).slice(0, 10)).toBe('2026-07-31');
    });

    it('enforces one player snapshot per provider, category, period and list kind', async () => {
        const existing = await db
            .selectFrom('official_ranking_snapshots')
            .selectAll()
            .executeTakeFirstOrThrow();

        await expect(db
            .insertInto('official_ranking_snapshots')
            .values({
                platform_id: existing.platform_id,
                player_id: existing.player_id,
                source_category_external_id: existing.source_category_external_id,
                category_name: existing.category_name,
                source_period_external_id: existing.source_period_external_id,
                period_label: existing.period_label,
                list_kind: existing.list_kind,
            })
            .execute()
        ).rejects.toThrow();
    });
});
