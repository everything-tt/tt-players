import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from '@tt-players/db';
import * as m001 from '../../../../packages/db/src/migrations/001_create_enums.js';
import * as m002 from '../../../../packages/db/src/migrations/002_create_core_tables.js';
import * as m003 from '../../../../packages/db/src/migrations/003_create_match_tables.js';
import * as m005 from '../../../../packages/db/src/migrations/005_make_rubber_players_nullable.js';
import * as m006 from '../../../../packages/db/src/migrations/006_add_canonical_player_id_to_external_players.js';
import * as m007 from '../../../../packages/db/src/migrations/007_add_performance_indexes.js';
import * as m008 from '../../../../packages/db/src/migrations/008_create_cache_entries.js';
import * as m013 from '../../../../packages/db/src/migrations/013_add_rubber_score_source.js';
import * as m015 from '../../../../packages/db/src/migrations/015_add_rubber_played_at.js';
import * as m028 from '../../../../packages/db/src/migrations/028_create_calculated_ratings.js';
import * as m031 from '../../../../packages/db/src/migrations/031_create_weekly_rating_history.js';
import { buildApp } from '../app.js';

const { Pool } = pg;
const TEST_DB_NAME = `tt_players_vetts_api_${process.pid}_${process.env.VITEST_POOL_ID ?? 'main'}`;
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

let db: Kysely<Database>;
let app: Awaited<ReturnType<typeof buildApp>>;
let homePlayerId: string;
let awayPlayerId: string;
let canonicalRubberId: string;

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
    await m007.up(db);
    await m008.up(db);
    await m013.up(db);
    await m015.up(db);
    await m028.up(db);
    await m031.up(db);

    const platform = await db
        .insertInto('platforms')
        .values({ name: 'Tournament Result Test', base_url: 'https://example.test' })
        .returning('id')
        .executeTakeFirstOrThrow();
    const league = await db
        .insertInto('leagues')
        .values({ platform_id: platform.id, external_id: 'events', name: 'Events' })
        .returning('id')
        .executeTakeFirstOrThrow();
    const season = await db
        .insertInto('seasons')
        .values({ league_id: league.id, external_id: '2026', name: '2026' })
        .returning('id')
        .executeTakeFirstOrThrow();
    const competition = await db
        .insertInto('competitions')
        .values({
            season_id: season.id,
            external_id: 'vetts-nationals-2026',
            name: 'VETTS Nationals 2026',
            type: 'individual',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    const fixture = await db
        .insertInto('fixtures')
        .values({
            competition_id: competition.id,
            external_id: 'sport80:event:917:2026-05-17',
            date_played: '2026-05-17',
            status: 'completed',
        })
        .returning('id')
        .executeTakeFirstOrThrow();

    const players = await db
        .insertInto('external_players')
        .values([
            { platform_id: platform.id, external_id: 'sport80:1017', name: 'Alan Pearse' },
            { platform_id: platform.id, external_id: 'sport80:6797', name: 'Raymond Sutton' },
            { platform_id: platform.id, external_id: 'vetts:1017', name: 'Alan Pearse' },
            { platform_id: platform.id, external_id: 'vetts:6797', name: 'Raymond Sutton' },
        ])
        .returning(['id', 'external_id'])
        .execute();
    const byExternalId = new Map(players.map((player) => [player.external_id, player.id]));
    homePlayerId = byExternalId.get('sport80:1017')!;
    awayPlayerId = byExternalId.get('sport80:6797')!;
    const duplicateHomeId = byExternalId.get('vetts:1017')!;
    const duplicateAwayId = byExternalId.get('vetts:6797')!;

    await db
        .updateTable('external_players')
        .set({ canonical_player_id: homePlayerId })
        .where('id', 'in', [homePlayerId, duplicateHomeId])
        .execute();
    await db
        .updateTable('external_players')
        .set({ canonical_player_id: awayPlayerId })
        .where('id', 'in', [awayPlayerId, duplicateAwayId])
        .execute();

    canonicalRubberId = await db
        .insertInto('rubbers')
        .values({
            fixture_id: fixture.id,
            external_id: 'sport80:result:abc-123',
            home_player_1_id: homePlayerId,
            away_player_1_id: awayPlayerId,
            home_games_won: 3,
            away_games_won: 0,
            outcome_type: 'normal',
            score_source: 'games',
            played_at: '2026-05-17 08:30:00',
        })
        .returning('id')
        .executeTakeFirstOrThrow()
        .then((row) => row.id);

    await db
        .insertInto('rubbers')
        .values({
            fixture_id: fixture.id,
            external_id: 'vetts:match:abc-123',
            home_player_1_id: duplicateHomeId,
            away_player_1_id: duplicateAwayId,
            home_games_won: 3,
            away_games_won: 0,
            outcome_type: 'normal',
            score_source: 'games',
            played_at: '2026-05-17 08:30:00',
            deleted_at: new Date(),
        })
        .execute();

    app = await buildApp(db);
    await app.ready();
}, 30_000);

afterAll(async () => {
    await app?.close();
    await db?.destroy();
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

describe('VETTS canonical result API visibility', () => {
    it('returns the reconciled encounter once and excludes the soft-deleted import', async () => {
        const response = await app.inject({
            method: 'GET',
            url: `/api/players/${homePlayerId}/h2h/${awayPlayerId}`,
        });

        expect(response.statusCode).toBe(200);
        const payload = response.json();
        expect(payload.encounters).toHaveLength(1);
        expect(payload.encounters[0].id).toBe(canonicalRubberId);
        expect(payload.player1_wins).toBe(1);
        expect(payload.player2_wins).toBe(0);
    });
});
