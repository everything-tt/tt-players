import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from '@tt-players/db';
import * as m001 from '../../../../packages/db/src/migrations/001_create_enums.js';
import * as m002 from '../../../../packages/db/src/migrations/002_create_core_tables.js';
import * as m003 from '../../../../packages/db/src/migrations/003_create_match_tables.js';
import * as m005 from '../../../../packages/db/src/migrations/005_make_rubber_players_nullable.js';
import * as m006 from '../../../../packages/db/src/migrations/006_add_canonical_player_id_to_external_players.js';
import * as m013 from '../../../../packages/db/src/migrations/013_add_rubber_score_source.js';
import * as m015 from '../../../../packages/db/src/migrations/015_add_rubber_played_at.js';
import * as m028 from '../../../../packages/db/src/migrations/028_create_calculated_ratings.js';
import * as m031 from '../../../../packages/db/src/migrations/031_create_weekly_rating_history.js';
import * as m032 from '../../../../packages/db/src/migrations/032_create_rating_replay_checkpoints.js';
import * as m035 from '../../../../packages/db/src/migrations/035_create_api_read_models.js';
import * as m040 from '../../../../packages/db/src/migrations/040_create_rating_audit_snapshots.js';
import * as m042 from '../../../../packages/db/src/migrations/042_create_rating_audit_foundation.js';
import * as m043 from '../../../../packages/db/src/migrations/043_create_rating_player_coverage.js';
import { buildApp } from '../app.js';

const { Pool } = pg;
const TEST_DB_NAME = `tt_players_rating_player_coverage_api_test_${process.pid}`;
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

let db: Kysely<Database>;
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
    const admin = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    await admin.end();

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
    await m013.up(db);
    await m015.up(db);
    await m028.up(db);
    await m031.up(db);
    await m032.up(db);
    await m035.up(db);
    await m040.up(db);
    await m042.up(db);
    await m043.up(db);

    app = await buildApp(db);
    await app.ready();
}, 30_000);

afterAll(async () => {
    await app.close();
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

describe('rating player coverage API', () => {
    it('returns category totals and inspectable player evidence', async () => {
        const platform = await db.insertInto('platforms').values({
            name: 'Test Platform',
            base_url: 'https://example.test',
        }).returning('id').executeTakeFirstOrThrow();
        const player = await db.insertInto('external_players').values({
            platform_id: platform.id,
            external_id: 'player-1',
            canonical_player_id: null,
            name: 'Coverage Player',
            updated_at: new Date('2026-08-01T00:00:00.000Z'),
            deleted_at: null,
        }).returning('id').executeTakeFirstOrThrow();
        const model = await db.selectFrom('rating_models')
            .select('id')
            .where('key', '=', 'global-singles-glicko2-v1')
            .executeTakeFirstOrThrow();

        await db.updateTable('rating_models')
            .set({ window_start_date: '2016-07-25' })
            .where('id', '=', model.id)
            .execute();
        await db.insertInto('rating_player_coverage').values({
            model_id: model.id,
            player_id: player.id,
            category: 'eligible_in_window_without_rating',
            raw_matches: 12,
            singles_matches: 12,
            normal_singles_matches: 12,
            eligible_matches_all_time: 12,
            eligible_matches_in_window: 12,
            unique_opponents_in_window: 8,
            first_match_date: '2026-01-02',
            last_match_date: '2026-07-20',
            rating_exists: false,
            rated_matches: null,
            rating_deviation: null,
            updated_at: new Date('2026-08-03T05:17:00.000Z'),
        }).execute();

        const response = await app.inject({
            method: 'GET',
            url: '/api/ratings/audit/player-coverage?category=eligible_in_window_without_rating&search=Coverage',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            data: [{
                player_id: player.id,
                player_name: 'Coverage Player',
                category: 'eligible_in_window_without_rating',
                raw_matches: 12,
                singles_matches: 12,
                normal_singles_matches: 12,
                eligible_matches_all_time: 12,
                eligible_matches_in_window: 12,
                unique_opponents_in_window: 8,
                first_match_date: '2026-01-02',
                last_match_date: '2026-07-20',
                rating_exists: false,
                rated_matches: null,
                rating_deviation: null,
            }],
            summary: [{
                category: 'eligible_in_window_without_rating',
                count: 1,
            }],
            pagination: {
                page: 1,
                page_size: 50,
                total: 1,
                total_pages: 1,
            },
            model: 'global-singles-glicko2-v1',
            window_start_date: '2016-07-25',
        });
    });
});
