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
