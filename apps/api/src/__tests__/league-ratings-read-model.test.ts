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
import * as m013 from '../../../../packages/db/src/migrations/013_add_rubber_score_source.js';
import * as m015 from '../../../../packages/db/src/migrations/015_add_rubber_played_at.js';
import * as m028 from '../../../../packages/db/src/migrations/028_create_calculated_ratings.js';
import * as m035 from '../../../../packages/db/src/migrations/035_create_api_read_models.js';
import { refreshPlayerActiveLeagues } from '../../../worker/src/read-models.js';
import { buildApp } from '../app.js';

const { Pool } = pg;
const TEST_DB_NAME = `tt_players_league_ratings_read_model_${process.pid}`;
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

let db: Kysely<Database>;
let request: ReturnType<typeof supertest>;
let leagueId: string;
let includedPlayerId: string;

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
    await m035.up(db);

    const platform = await db
        .insertInto('platforms')
        .values({ name: 'Test Platform', base_url: 'https://example.test' })
        .returning('id')
        .executeTakeFirstOrThrow();
    const league = await db
        .insertInto('leagues')
        .values({ platform_id: platform.id, external_id: 'league', name: 'Test League' })
        .returning('id')
        .executeTakeFirstOrThrow();
    leagueId = league.id;

    const season = await db
        .insertInto('seasons')
        .values({
            league_id: league.id,
            external_id: 'active-season',
            name: 'Active Season',
            is_active: true,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    const competition = await db
        .insertInto('competitions')
        .values({
            season_id: season.id,
            external_id: 'division',
            name: 'Division',
            type: 'league',
        })
        .returning('id')
        .executeTakeFirstOrThrow();

    const players = await db
        .insertInto('external_players')
        .values([
            { platform_id: platform.id, external_id: 'included', name: 'Included Player' },
            { platform_id: platform.id, external_id: 'excluded', name: 'Excluded Player' },
            { platform_id: platform.id, external_id: 'opponent', name: 'Opponent Player' },
        ])
        .returning('id')
        .execute();
    includedPlayerId = players[0]!.id;

    const fixture = await db
        .insertInto('fixtures')
        .values({
            competition_id: competition.id,
            external_id: 'fixture',
            date_played: '2026-01-01',
            status: 'completed',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    await db
        .insertInto('rubbers')
        .values({
            fixture_id: fixture.id,
            external_id: 'rubber',
            home_player_1_id: players[0]!.id,
            away_player_1_id: players[2]!.id,
            home_games_won: 3,
            away_games_won: 1,
            outcome_type: 'normal',
        })
        .execute();

    const membershipCount = await refreshPlayerActiveLeagues(db);
    expect(membershipCount).toBe(2);

    // The request must not need to revisit match history after the read model exists.
    await db.deleteFrom('rubbers').execute();
    await db.deleteFrom('fixtures').execute();

    const model = await db
        .selectFrom('rating_models')
        .select('id')
        .where('key', '=', 'global-singles-glicko2-v1')
        .executeTakeFirstOrThrow();

    await db
        .insertInto('player_ratings')
        .values([
            {
                model_id: model.id,
                player_id: players[0]!.id,
                rating: 1600,
                rating_deviation: 60,
                volatility: 0.06,
                conservative_rating: 1480,
                rated_matches: 20,
                rated_wins: 14,
                rated_losses: 6,
                provisional: false,
            },
            {
                model_id: model.id,
                player_id: players[1]!.id,
                rating: 1700,
                rating_deviation: 50,
                volatility: 0.06,
                conservative_rating: 1600,
                rated_matches: 25,
                rated_wins: 20,
                rated_losses: 5,
                provisional: false,
            },
        ])
        .execute();

    const app = await buildApp(db);
    await app.ready();
    request = supertest(app.server);
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

describe('GET /api/ratings/league', () => {
    it('filters calculated ratings through the compact active-league read model', async () => {
        const response = await request
            .get(`/api/ratings/league?league_ids=${leagueId}`)
            .expect(200);

        expect(response.body.total).toBe(1);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0]).toMatchObject({
            player_id: includedPlayerId,
            player_name: 'Included Player',
            rank: 1,
        });
    });

    it('rejects invalid league identifiers before querying', async () => {
        await request
            .get('/api/ratings/league?league_ids=not-a-uuid')
            .expect(400);
    });
});
