import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import supertest from 'supertest';
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
import * as m022 from '../../../../packages/db/src/migrations/022_add_updated_at_indexes.js';
import { buildApp } from '../app.js';

const { Pool } = pg;
const TEST_DB_NAME = `tt_players_rivals_${process.pid}_${process.env.VITEST_POOL_ID ?? 'main'}`;
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

let db: Kysely<Database>;
let app: Awaited<ReturnType<typeof buildApp>>;
let request: ReturnType<typeof supertest>;
let playerId: string;
let changedRubberExternalId: string;

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
  await m022.up(db);

  const platform = await db
    .insertInto('platforms')
    .values({ name: 'Rivals Test Platform', base_url: 'https://rivals.example.test' })
    .returning('id')
    .executeTakeFirstOrThrow();
  const league = await db
    .insertInto('leagues')
    .values({ platform_id: platform.id, external_id: 'rivals-league', name: 'Rivals League' })
    .returning('id')
    .executeTakeFirstOrThrow();
  const season = await db
    .insertInto('seasons')
    .values({ league_id: league.id, external_id: 'rivals-season', name: '2025/26', is_active: true })
    .returning('id')
    .executeTakeFirstOrThrow();
  const competition = await db
    .insertInto('competitions')
    .values({ season_id: season.id, external_id: 'rivals-division', name: 'Division 1', type: 'league' })
    .returning('id')
    .executeTakeFirstOrThrow();

  const players = await db
    .insertInto('external_players')
    .values([
      { platform_id: platform.id, external_id: 'focus-player', name: 'Focus Player' },
      { platform_id: platform.id, external_id: 'alex-ace', name: 'Alex Ace' },
      { platform_id: platform.id, external_id: 'bea-block', name: 'Bea Block' },
      { platform_id: platform.id, external_id: 'cara-counter', name: 'Cara Counter' },
      { platform_id: platform.id, external_id: 'dana-drive', name: 'Dana Drive' },
      { platform_id: platform.id, external_id: 'erin-improving', name: 'Erin Improving' },
    ])
    .returning(['id', 'external_id'])
    .execute();
  const playerByExternalId = new Map(players.map((player) => [player.external_id, player.id]));
  playerId = playerByExternalId.get('focus-player')!;

  const rivalResults: Array<{ opponent: string; results: boolean[] }> = [
    { opponent: 'alex-ace', results: [false, false, false, false] },
    { opponent: 'bea-block', results: [true, false, false, false] },
    { opponent: 'cara-counter', results: [true, true, true, true, true] },
    { opponent: 'dana-drive', results: [true, true, true, false] },
    { opponent: 'erin-improving', results: [false, false, true, true] },
  ];

  let matchIndex = 0;
  const rubberRows: Array<{
    fixture_id: string;
    external_id: string;
    home_player_1_id: string;
    away_player_1_id: string;
    home_games_won: number;
    away_games_won: number;
    outcome_type: 'normal';
  }> = [];

  for (const rival of rivalResults) {
    for (const [resultIndex, isWin] of rival.results.entries()) {
      matchIndex += 1;
      const fixture = await db
        .insertInto('fixtures')
        .values({
          competition_id: competition.id,
          external_id: `rivals-fixture-${matchIndex}`,
          date_played: `2026-01-${String(matchIndex).padStart(2, '0')}`,
          status: 'completed',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const externalId = `${rival.opponent}-${resultIndex + 1}`;
      rubberRows.push({
        fixture_id: fixture.id,
        external_id: externalId,
        home_player_1_id: playerId,
        away_player_1_id: playerByExternalId.get(rival.opponent)!,
        home_games_won: isWin ? 3 : 0,
        away_games_won: isWin ? 0 : 3,
        outcome_type: 'normal',
      });
      if (rival.opponent === 'alex-ace' && resultIndex === 0) {
        changedRubberExternalId = externalId;
      }
    }
  }
  await db.insertInto('rubbers').values(rubberRows).execute();

  app = await buildApp(db);
  await app.ready();
  request = supertest(app.server);
}, 30_000);

beforeEach(async () => {
  await db.deleteFrom('cache_entries').execute();
});

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

describe('player rival intelligence API', () => {
  it('ranks and bounds aggregate opponent rows in deterministic order', async () => {
    const response = await request
      .get(`/api/players/${playerId}/rivals`)
      .expect(200);

    expect(response.body.toughest.map((item: { opponent_name: string }) => item.opponent_name)).toEqual([
      'Alex Ace',
      'Bea Block',
      'Erin Improving',
      'Dana Drive',
    ]);
    expect(response.body.easiest.map((item: { opponent_name: string }) => item.opponent_name)).toEqual([
      'Cara Counter',
      'Dana Drive',
      'Erin Improving',
      'Bea Block',
    ]);
    expect(response.body.improving).toEqual([
      expect.objectContaining({
        opponent_name: 'Erin Improving',
        played: 4,
        first_half_win_rate: 0,
        second_half_win_rate: 100,
        delta_points: 100,
      }),
    ]);
    expect(response.body.toughest).toHaveLength(4);
    expect(response.body.easiest).toHaveLength(4);
  });

  it('reuses the source-versioned cache and invalidates it after a relevant rubber update', async () => {
    const first = await request
      .get(`/api/players/${playerId}/rivals`)
      .expect(200);
    const cachedBefore = await db
      .selectFrom('cache_entries')
      .select(['source_version', 'updated_at'])
      .where('type', '=', 'player-rivals-v2')
      .executeTakeFirstOrThrow();

    const second = await request
      .get(`/api/players/${playerId}/rivals`)
      .expect(200);
    const cachedAfterHit = await db
      .selectFrom('cache_entries')
      .select(['source_version', 'updated_at'])
      .where('type', '=', 'player-rivals-v2')
      .executeTakeFirstOrThrow();

    expect(second.body).toEqual(first.body);
    expect(cachedAfterHit.source_version).toBe(cachedBefore.source_version);
    expect(cachedAfterHit.updated_at).toEqual(cachedBefore.updated_at);

    await db
      .updateTable('rubbers')
      .set({
        home_games_won: 3,
        away_games_won: 0,
        updated_at: new Date('2035-01-01T00:00:00.000Z'),
      })
      .where('external_id', '=', changedRubberExternalId)
      .execute();

    const refreshed = await request
      .get(`/api/players/${playerId}/rivals`)
      .expect(200);
    const cachedAfterChange = await db
      .selectFrom('cache_entries')
      .select(['source_version', 'updated_at'])
      .where('type', '=', 'player-rivals-v2')
      .executeTakeFirstOrThrow();

    expect(cachedAfterChange.source_version).not.toBe(cachedBefore.source_version);
    expect(cachedAfterChange.updated_at).not.toEqual(cachedBefore.updated_at);
    expect(refreshed.body.toughest[0]).toEqual(expect.objectContaining({
      opponent_name: 'Bea Block',
      win_rate: 25,
    }));
  });
});
