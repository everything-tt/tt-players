import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import { buildApp } from '../app.js';
import {
  createTestDatabase,
  createTestKysely,
  dropTestDatabase,
  runMigrations,
  seedTestData,
  type SeedIds,
} from './helpers/seed.js';

let db: Kysely<Database>;
let request: ReturnType<typeof supertest>;
let ids: SeedIds;

beforeAll(async () => {
  await createTestDatabase();
  db = createTestKysely();
  await runMigrations(db);
  ids = await seedTestData(db);

  const app = await buildApp(db);
  await app.ready();
  request = supertest(app.server);
}, 30_000);

afterAll(async () => {
  await dropTestDatabase(db);
}, 15_000);

describe('GET /api/leagues/:id/snapshot player counts', () => {
  it('counts all four rubber slots per division and deduplicates league totals', async () => {
    const [competition] = await db
      .insertInto('competitions')
      .values({
        season_id: ids.seasonId,
        external_id: 'snapshot-division-2',
        name: 'Division 2',
        type: 'league',
      })
      .returning('id')
      .execute();

    const teams = await db
      .insertInto('teams')
      .values([
        { competition_id: competition!.id, external_id: 'snapshot-team-home', name: 'Snapshot Home' },
        { competition_id: competition!.id, external_id: 'snapshot-team-away', name: 'Snapshot Away' },
      ])
      .returning('id')
      .execute();

    const [fixture] = await db
      .insertInto('fixtures')
      .values({
        competition_id: competition!.id,
        external_id: 'snapshot-fixture',
        home_team_id: teams[0]!.id,
        away_team_id: teams[1]!.id,
        date_played: '2025-02-01',
        status: 'completed',
        updated_at: new Date(),
      })
      .returning('id')
      .execute();

    const partners = await db
      .insertInto('external_players')
      .values([
        { platform_id: ids.platformId, external_id: 'snapshot-home-partner', name: 'Home Partner', updated_at: new Date() },
        { platform_id: ids.platformId, external_id: 'snapshot-away-partner', name: 'Away Partner', updated_at: new Date() },
      ])
      .returning('id')
      .execute();

    await db
      .insertInto('rubbers')
      .values({
        fixture_id: fixture!.id,
        external_id: 'snapshot-doubles-rubber',
        is_doubles: true,
        home_player_1_id: ids.homePlayerId,
        home_player_2_id: partners[0]!.id,
        away_player_1_id: ids.awayPlayerId,
        away_player_2_id: partners[1]!.id,
        home_games_won: 3,
        away_games_won: 1,
        outcome_type: 'normal',
        updated_at: new Date(),
      })
      .execute();

    const response = await request
      .get(`/api/leagues/${ids.leagueId}/snapshot`)
      .expect(200);

    expect(response.body.divisions).toEqual([
      expect.objectContaining({ divisionName: 'Division 1', players: 2 }),
      expect.objectContaining({ divisionName: 'Division 2', players: 4 }),
    ]);
    expect(response.body.totals).toEqual(expect.objectContaining({
      divisions: 2,
      players: 4,
    }));
  });
});
