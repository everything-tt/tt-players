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

describe('GET /api/players/:id/tournament-summaries', () => {
  it('groups tournament matches before applying the event limit', async () => {
    const alias = await db.insertInto('external_players').values({
      platform_id: ids.platformId,
      external_id: 'tournament-summary-alias',
      canonical_player_id: ids.homePlayerId,
      name: 'Alice Tournament Alias',
      updated_at: new Date(),
    }).returning('id').executeTakeFirstOrThrow();

    const events = await db.insertInto('competitions').values(
      Array.from({ length: 6 }, (_, index) => ({
        season_id: ids.seasonId,
        external_id: `tournament-summary-event-${index + 1}`,
        name: `Tournament Summary Event ${index + 1}`,
        display_name: `Tournament Summary Event ${index + 1}`,
        event_date: `2025-06-${String(index + 1).padStart(2, '0')}`,
        category: 'Singles',
        type: 'individual' as const,
        source: 'sport80' as const,
      })),
    ).returning(['id', 'external_id']).execute();
    const orderedEvents = events.sort((a, b) => a.external_id.localeCompare(b.external_id));

    const fixtures = await db.insertInto('fixtures').values(
      orderedEvents.map((event, index) => ({
        competition_id: event.id,
        external_id: `tournament-summary-fixture-${index + 1}`,
        status: 'completed' as const,
        updated_at: new Date(),
      })),
    ).returning(['id', 'external_id']).execute();
    const orderedFixtures = fixtures.sort((a, b) => a.external_id.localeCompare(b.external_id));

    await db.insertInto('rubbers').values([
      ...orderedFixtures.map((fixture, index) => ({
        fixture_id: fixture.id,
        external_id: `tournament-summary-rubber-${index + 1}`,
        home_player_1_id: ids.homePlayerId,
        away_player_1_id: ids.awayPlayerId,
        home_games_won: 3,
        away_games_won: 1,
        outcome_type: 'normal' as const,
        updated_at: new Date(),
      })),
      {
        fixture_id: orderedFixtures[5]!.id,
        external_id: 'tournament-summary-rubber-alias',
        home_player_1_id: ids.awayPlayerId,
        away_player_1_id: alias.id,
        home_games_won: 1,
        away_games_won: 3,
        outcome_type: 'normal',
        updated_at: new Date(),
      },
    ]).execute();

    const response = await request
      .get(`/api/players/${ids.homePlayerId}/tournament-summaries?limit=5`)
      .expect(200);

    expect(response.body.total).toBe(6);
    expect(response.body.data).toHaveLength(5);
    expect(response.body.data[0]).toMatchObject({
      event_id: orderedEvents[5]!.id,
      event_name: 'Tournament Summary Event 6',
      played: 2,
      wins: 2,
    });
    expect(response.body.data.map((event: { event_name: string }) => event.event_name))
      .not.toContain('Tournament Summary Event 1');
  });
});
