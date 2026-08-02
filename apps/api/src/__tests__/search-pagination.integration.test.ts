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

describe('paginated player search', () => {
  it('rejects non-empty text searches shorter than three trimmed characters', async () => {
    await request.get('/api/players/search?q=ab').expect(400);
    await request.get('/api/players/search?q=%20%20').expect(200);
    await request.get('/api/players/search?q=Ali').expect(200);
  });

  it('treats SQL wildcard characters as literal search text', async () => {
    const percent = await request.get('/api/players/search?q=%25%25%25').expect(200);
    const underscore = await request.get('/api/players/search?q=___').expect(200);

    expect(percent.body).toMatchObject({ data: [], total: 0 });
    expect(underscore.body).toMatchObject({ data: [], total: 0 });
  });

  it('returns a stable pagination envelope for named searches', async () => {
    await db.insertInto('external_players').values([
      {
        platform_id: ids.platformId,
        external_id: 'paged-search-a',
        name: 'Paged Search A',
        updated_at: new Date(),
      },
      {
        platform_id: ids.platformId,
        external_id: 'paged-search-b',
        name: 'Paged Search B',
        updated_at: new Date(),
      },
      {
        platform_id: ids.platformId,
        external_id: 'paged-search-c',
        name: 'Paged Search C',
        updated_at: new Date(),
      },
    ]).execute();

    const first = await request
      .get('/api/players/search?q=Paged%20Search&limit=2&offset=0')
      .expect(200);

    expect(first.body).toMatchObject({
      total: 3,
      limit: 2,
      offset: 0,
      has_more: true,
    });
    expect(first.body.data.map((row: { name: string }) => row.name)).toEqual([
      'Paged Search A',
      'Paged Search B',
    ]);

    const second = await request
      .get('/api/players/search?q=Paged%20Search&limit=2&offset=2')
      .expect(200);

    expect(second.body).toMatchObject({
      total: 3,
      limit: 2,
      offset: 2,
      has_more: false,
    });
    expect(second.body.data.map((row: { name: string }) => row.name)).toEqual([
      'Paged Search C',
    ]);
  });

  it('intersects saved player ids with the active search before pagination', async () => {
    const savedIds = [ids.homePlayerId, ids.awayPlayerId].join(',');
    const res = await request
      .get(`/api/players/search?saved_ids=${encodeURIComponent(savedIds)}&limit=1&offset=0`)
      .expect(200);

    expect(res.body.total).toBe(2);
    expect(res.body.data).toHaveLength(1);
    expect([ids.homePlayerId, ids.awayPlayerId]).toContain(res.body.data[0].id);
    expect(res.body.has_more).toBe(true);
  });

  it('rejects invalid and oversized saved player id filters', async () => {
    await request
      .get('/api/players/search?saved_ids=not-a-uuid')
      .expect(400);

    const oversized = Array.from({ length: 201 }, () => ids.homePlayerId).join(',');
    await request
      .get(`/api/players/search?saved_ids=${encodeURIComponent(oversized)}`)
      .expect(400);
  });

  it('pages a common-name search without changing totals or stable ordering', async () => {
    await db.insertInto('external_players').values(
      Array.from({ length: 15 }, (_, index) => ({
        platform_id: ids.platformId,
        external_id: `green-search-${index + 1}`,
        name: `Green Search ${String(index + 1).padStart(2, '0')}`,
        updated_at: new Date(),
      })),
    ).execute();

    const first = await request
      .get('/api/players/search?q=Green%20Search&limit=10&offset=0')
      .expect(200);

    expect(first.body).toMatchObject({
      total: 15,
      limit: 10,
      offset: 0,
      has_more: true,
    });
    expect(first.body.data.map((row: { name: string }) => row.name)).toEqual(
      Array.from(
        { length: 10 },
        (_, index) => `Green Search ${String(index + 1).padStart(2, '0')}`,
      ),
    );

    const second = await request
      .get('/api/players/search?q=Green%20Search&limit=10&offset=10')
      .expect(200);

    expect(second.body).toMatchObject({
      total: 15,
      limit: 10,
      offset: 10,
      has_more: false,
    });
    expect(second.body.data.map((row: { name: string }) => row.name)).toEqual(
      Array.from(
        { length: 5 },
        (_, index) => `Green Search ${String(index + 11).padStart(2, '0')}`,
      ),
    );
  });

  it('keeps canonical alias statistics inside the selected league', async () => {
    const [canonical] = await db.insertInto('external_players').values({
      platform_id: ids.platformId,
      external_id: 'scoped-search-canonical',
      name: 'Scoped Search Player',
      updated_at: new Date(),
    }).returning('id').execute();
    const [alias] = await db.insertInto('external_players').values({
      platform_id: ids.platformId,
      external_id: 'scoped-search-alias',
      canonical_player_id: canonical!.id,
      name: 'Scoped Search Alias',
      updated_at: new Date(),
    }).returning('id').execute();

    await db.insertInto('rubbers').values({
      fixture_id: ids.fixtureId,
      external_id: 'scoped-search-rubber',
      home_player_1_id: alias!.id,
      away_player_1_id: ids.awayPlayerId,
      home_games_won: 3,
      away_games_won: 1,
      outcome_type: 'normal',
      updated_at: new Date(),
    }).execute();

    const otherLeague = await db.insertInto('leagues').values({
      platform_id: ids.platformId,
      external_id: 'scoped-search-other-league',
      name: 'Scoped Search Other League',
    }).returning('id').executeTakeFirstOrThrow();
    const otherSeason = await db.insertInto('seasons').values({
      league_id: otherLeague.id,
      external_id: 'scoped-search-other-season',
      name: 'Scoped Search Other Season',
      is_active: true,
    }).returning('id').executeTakeFirstOrThrow();
    const otherCompetition = await db.insertInto('competitions').values({
      season_id: otherSeason.id,
      external_id: 'scoped-search-other-competition',
      name: 'Scoped Search Other Competition',
      type: 'league',
    }).returning('id').executeTakeFirstOrThrow();
    const otherFixture = await db.insertInto('fixtures').values({
      competition_id: otherCompetition.id,
      external_id: 'scoped-search-other-fixture',
      date_played: new Date().toISOString().slice(0, 10),
      status: 'completed',
      updated_at: new Date(),
    }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('rubbers').values({
      fixture_id: otherFixture.id,
      external_id: 'scoped-search-other-rubber',
      home_player_1_id: alias!.id,
      away_player_1_id: ids.awayPlayerId,
      home_games_won: 3,
      away_games_won: 0,
      outcome_type: 'normal',
      updated_at: new Date(),
    }).execute();

    const response = await request
      .get(`/api/players/search?q=Scoped%20Search&league_ids=${ids.leagueId}`)
      .expect(200);

    expect(response.body).toMatchObject({ total: 1 });
    expect(response.body.data).toEqual([expect.objectContaining({
      id: canonical!.id,
      name: 'Scoped Search Player',
      played: 1,
      wins: 1,
    })]);
  });

  it('orders blank browse by activity from recent scoped fixtures', async () => {
    const players = await db.insertInto('external_players').values([
      {
        platform_id: ids.platformId,
        external_id: 'recent-browse-busy',
        name: 'Recent Browse Busy',
        updated_at: new Date(),
      },
      {
        platform_id: ids.platformId,
        external_id: 'recent-browse-quiet',
        name: 'Recent Browse Quiet',
        updated_at: new Date(),
      },
    ]).returning('id').execute();
    const [fixture] = await db.insertInto('fixtures').values({
      competition_id: ids.competitionId,
      external_id: 'recent-browse-fixture',
      date_played: new Date().toISOString().slice(0, 10),
      status: 'completed',
      updated_at: new Date(),
    }).returning('id').execute();

    await db.insertInto('rubbers').values([
      {
        fixture_id: fixture!.id,
        external_id: 'recent-browse-rubber-1',
        home_player_1_id: players[0]!.id,
        away_player_1_id: players[1]!.id,
        home_games_won: 3,
        away_games_won: 1,
        outcome_type: 'normal',
        updated_at: new Date(),
      },
      {
        fixture_id: fixture!.id,
        external_id: 'recent-browse-rubber-2',
        home_player_1_id: players[0]!.id,
        away_player_1_id: ids.awayPlayerId,
        home_games_won: 3,
        away_games_won: 2,
        outcome_type: 'normal',
        updated_at: new Date(),
      },
    ]).execute();

    const oldDate = new Date();
    oldDate.setUTCDate(oldDate.getUTCDate() - 150);
    const oldFixture = await db.insertInto('fixtures').values({
      competition_id: ids.competitionId,
      external_id: 'old-browse-fixture',
      date_played: oldDate.toISOString().slice(0, 10),
      status: 'completed',
      updated_at: new Date(),
    }).returning('id').executeTakeFirstOrThrow();
    await db.insertInto('rubbers').values({
      fixture_id: oldFixture.id,
      external_id: 'old-browse-rubber',
      home_player_1_id: players[0]!.id,
      away_player_1_id: players[1]!.id,
      home_games_won: 3,
      away_games_won: 0,
      outcome_type: 'normal',
      updated_at: new Date(),
    }).execute();

    const response = await request
      .get('/api/players/search?limit=10&offset=0')
      .expect(200);

    expect(response.body.data[0]).toEqual(
      expect.objectContaining({ id: players[0]!.id, played: 2, wins: 2 }),
    );
    expect(response.body.data).toContainEqual(
      expect.objectContaining({ id: players[1]!.id, played: 1, wins: 0 }),
    );
  });
});

describe('paginated tournament search', () => {
  it('filters saved tournament ids before counting and paging', async () => {
    const inserted = await db.insertInto('competitions').values([
      {
        season_id: ids.seasonId,
        external_id: 'saved-event-a',
        name: 'Saved Event A',
        display_name: 'Saved Event A',
        event_date: '2026-12-01',
        start_date: '2026-12-01',
        event_status: 'upcoming',
        category: 'Junior',
        type: 'individual',
        source: 'calendar',
      },
      {
        season_id: ids.seasonId,
        external_id: 'saved-event-b',
        name: 'Saved Event B',
        display_name: 'Saved Event B',
        event_date: '2026-12-02',
        start_date: '2026-12-02',
        event_status: 'upcoming',
        category: 'Senior',
        type: 'individual',
        source: 'calendar',
      },
    ]).returning('id').execute();

    const res = await request
      .get(`/api/events?status=upcoming&saved_ids=${inserted[1]!.id}&limit=10&offset=0`)
      .expect(200);

    expect(res.body.total).toBe(1);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(inserted[1]!.id);
  });

  it('rejects invalid and oversized saved tournament id filters', async () => {
    await request
      .get('/api/events?saved_ids=not-a-uuid')
      .expect(400);

    const oversized = Array.from({ length: 201 }, () => ids.competitionId).join(',');
    await request
      .get(`/api/events?saved_ids=${encodeURIComponent(oversized)}`)
      .expect(400);
  });
});
