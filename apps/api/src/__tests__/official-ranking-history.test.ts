import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from '@tt-players/db';
import * as m001 from '../../../../packages/db/src/migrations/001_create_enums.js';
import * as m002 from '../../../../packages/db/src/migrations/002_create_core_tables.js';
import * as m003 from '../../../../packages/db/src/migrations/003_create_match_tables.js';
import * as m005 from '../../../../packages/db/src/migrations/005_make_rubber_players_nullable.js';
import * as m006 from '../../../../packages/db/src/migrations/006_add_canonical_player_id_to_external_players.js';
import * as m014 from '../../../../packages/db/src/migrations/014_create_ranking_history_tables.js';
import * as m033 from '../../../../packages/db/src/migrations/033_create_official_ranking_snapshots.js';
import { buildApp } from '../app.js';

const { Pool } = pg;
const TEST_DB_NAME = `tt_players_official_history_api_${process.pid}`;
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

let db: Kysely<Database>;
let request: ReturnType<typeof supertest>;
let canonicalPlayerId: string;
let aliasPlayerId: string;

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

beforeAll(async () => {
    await recreateDatabase();
    db = new Kysely<Database>({
        dialect: new PostgresDialect({
            pool: new Pool({ connectionString: TEST_DATABASE_URL }),
        }),
    });
    await m001.up(db);
    await m002.up(db);
    await m003.up(db);
    await m005.up(db);
    await m006.up(db);
    await m014.up(db);
    await m033.up(db);

    const localPlatform = await db
        .insertInto('platforms')
        .values({ name: 'TT Leagues', base_url: 'https://ttleagues.com' })
        .returning('id')
        .executeTakeFirstOrThrow();
    const sport80Platform = await db
        .insertInto('platforms')
        .values({ name: 'Sport80', base_url: 'https://tabletennisengland.sport80.com' })
        .returning('id')
        .executeTakeFirstOrThrow();

    const canonical = await db
        .insertInto('external_players')
        .values({ platform_id: localPlatform.id, external_id: 'local-player', name: 'Grace Liu' })
        .returning('id')
        .executeTakeFirstOrThrow();
    canonicalPlayerId = canonical.id;
    await db
        .updateTable('external_players')
        .set({ canonical_player_id: canonicalPlayerId })
        .where('id', '=', canonicalPlayerId)
        .execute();

    const alias = await db
        .insertInto('external_players')
        .values({
            platform_id: sport80Platform.id,
            external_id: 'sport80:athlete:77',
            name: 'Grace Liu',
            canonical_player_id: canonicalPlayerId,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    aliasPlayerId = alias.id;

    await db
        .insertInto('official_ranking_snapshots')
        .values([
            {
                platform_id: sport80Platform.id,
                player_id: aliasPlayerId,
                source_category_external_id: 'senior-women',
                category_name: 'Senior Women',
                source_period_external_id: '2026-06',
                period_label: 'June 2026',
                period_end_date: '2026-06-30',
                list_kind: 'ranking',
                rank: 41,
                points: 640,
                county_country: 'Essex',
            },
            {
                platform_id: sport80Platform.id,
                player_id: aliasPlayerId,
                source_category_external_id: 'senior-women',
                category_name: 'Senior Women',
                source_period_external_id: '2026-07',
                period_label: 'July 2026',
                period_end_date: '2026-07-31',
                list_kind: 'ranking',
                rank: 35,
                points: 690,
                county_country: 'Essex',
            },
            {
                platform_id: sport80Platform.id,
                player_id: aliasPlayerId,
                source_category_external_id: 'senior-women',
                category_name: 'Senior Women',
                source_period_external_id: '2026-06',
                period_label: 'June 2026',
                period_end_date: '2026-06-30',
                list_kind: 'rating',
                points: 1510,
                county_country: 'Essex',
            },
            {
                platform_id: sport80Platform.id,
                player_id: aliasPlayerId,
                source_category_external_id: 'senior-women',
                category_name: 'Senior Women',
                source_period_external_id: '2026-07',
                period_label: 'July 2026',
                period_end_date: '2026-07-31',
                list_kind: 'rating',
                points: 1542,
                county_country: 'Essex',
            },
        ])
        .execute();

    const app = await buildApp(db);
    await app.ready();
    request = supertest(app.server);
}, 30_000);

afterAll(async () => {
    await dropDatabase();
}, 15_000);

describe('GET /api/ratings/:id/official-history', () => {
    it('aggregates source aliases and returns latest entries separately from history', async () => {
        const response = await request
            .get(`/api/ratings/${canonicalPlayerId}/official-history`)
            .expect(200);

        expect(response.headers['cache-control']).toContain('max-age=300');
        expect(response.body).toMatchObject({
            player_id: canonicalPlayerId,
            player_name: 'Grace Liu',
        });
        expect(response.body.latest).toEqual([
            expect.objectContaining({
                source_name: 'Sport80',
                category_name: 'Senior Women',
                list_kind: 'ranking',
                period_label: 'July 2026',
                period_end_date: '2026-07-31',
                rank: 35,
                points: 690,
            }),
            expect.objectContaining({
                category_name: 'Senior Women',
                list_kind: 'rating',
                period_label: 'July 2026',
                points: 1542,
            }),
        ]);
        expect(response.body.history).toHaveLength(4);
    });

    it('resolves the alias URL to the same canonical player and filters list kind', async () => {
        const response = await request
            .get(`/api/ratings/${aliasPlayerId}/official-history?list_kind=rating`)
            .expect(200);

        expect(response.body.player_id).toBe(canonicalPlayerId);
        expect(response.body.latest).toHaveLength(1);
        expect(response.body.history).toHaveLength(2);
        expect(response.body.history.every((point: { list_kind: string }) => point.list_kind === 'rating')).toBe(true);
    });

    it('returns empty arrays for a known player without official snapshots', async () => {
        const platform = await db
            .selectFrom('platforms')
            .select('id')
            .where('name', '=', 'TT Leagues')
            .executeTakeFirstOrThrow();
        const player = await db
            .insertInto('external_players')
            .values({ platform_id: platform.id, external_id: 'unranked', name: 'Unranked Player' })
            .returning('id')
            .executeTakeFirstOrThrow();

        const response = await request
            .get(`/api/ratings/${player.id}/official-history`)
            .expect(200);
        expect(response.body.latest).toEqual([]);
        expect(response.body.history).toEqual([]);
    });
});
