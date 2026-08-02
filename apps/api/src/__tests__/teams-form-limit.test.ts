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

describe('GET /api/teams/:id/form', () => {
  it('returns only the latest 10 completed fixtures', async () => {
    const fixtures = await db
      .insertInto('fixtures')
      .values(
        Array.from({ length: 12 }, (_, index) => ({
          competition_id: ids.competitionId,
          external_id: `team-form-${index + 1}`,
          home_team_id: ids.homeTeamId,
          away_team_id: ids.awayTeamId,
          date_played: `2025-02-${String(index + 1).padStart(2, '0')}`,
          status: 'completed' as const,
          updated_at: new Date(),
        })),
      )
      .returning(['id', 'external_id'])
      .execute();

    await db
      .insertInto('rubbers')
      .values(
        fixtures.map((fixture, index) => ({
          fixture_id: fixture.id,
          external_id: `rubber-${fixture.external_id}`,
          home_player_1_id: ids.homePlayerId,
          away_player_1_id: ids.awayPlayerId,
          home_games_won: index < 2 ? 2 : 3,
          away_games_won: index < 2 ? 2 : 1,
          outcome_type: 'normal' as const,
          updated_at: new Date(),
        })),
      )
      .execute();

    const response = await request
      .get(`/api/teams/${ids.homeTeamId}/form`)
      .expect(200);

    expect(response.body.form).toEqual(Array.from({ length: 10 }, () => 'W'));
  });
});
