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

describe('GET /api/health', () => {
    it('returns a lightweight health response', async () => {
        const res = await request
            .get('/api/health')
            .expect(200);

        expect(res.body).toEqual({
            status: 'ok',
            service: 'tt-players-api',
        });
    });
});

describe('POST /api/feedback', () => {
    it('successfully records general feedback', async () => {
        const res = await request
            .post('/api/feedback')
            .send({
                name: 'John Doe',
                email: 'john@example.com',
                message_type: 'general',
                message: 'Love the app!',
            })
            .expect(200);

        expect(res.body).toEqual({
            success: true,
            id: expect.any(String),
        });

        // Verify it exists in database
        const feedback = await db
            .selectFrom('feedback')
            .selectAll()
            .where('id', '=', res.body.id)
            .executeTakeFirst();

        expect(feedback).toBeDefined();
        expect(feedback?.name).toBe('John Doe');
        expect(feedback?.email).toBe('john@example.com');
        expect(feedback?.message_type).toBe('general');
        expect(feedback?.message).toBe('Love the app!');
    });

    it('returns 400 for invalid body schema', async () => {
        await request
            .post('/api/feedback')
            .send({
                email: 'not-an-email',
                message_type: 'invalid-type',
                message: 'hi',
            })
            .expect(400);
    });
});

// ─── /leagues/:id/snapshot ──────────────────────────────────────────────────

describe('GET /leagues/:id/snapshot', () => {
    it('returns an aggregated active-season league snapshot', async () => {
        const res = await request
            .get(`/api/leagues/${ids.leagueId}/snapshot`)
            .expect(200);

        expect(res.body).toMatchObject({
            divisions: [
                {
                    divisionId: ids.competitionId,
                    divisionName: 'Division 1',
                    teams: 1,
                    players: 2,
                    matches: 3,
                },
            ],
            totals: {
                divisions: 1,
                teams: 1,
                players: 2,
                matches: 3,
            },
        });
    });

    it('returns 404 for an unknown league snapshot', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000003';
        const res = await request
            .get(`/api/leagues/${fakeId}/snapshot`)
            .expect(404);

        expect(res.body).toMatchObject({
            error: expect.any(String),
            statusCode: 404,
        });
    });
});

// ─── /competitions/:id/standings ──────────────────────────────────────────────

describe('GET /competitions/:id/standings', () => {
    it('returns 200 with sorted standings array', async () => {
        const res = await request
            .get(`/api/competitions/${ids.competitionId}/standings`)
            .expect(200);

        expect(res.body).toHaveProperty('data');
        expect(res.body).toHaveProperty('source_url');
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBeGreaterThanOrEqual(1);

        const item = res.body.data[0];
        expect(item).toMatchObject({
            position: expect.any(Number),
            team_id: expect.stringMatching(
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
            ),
            team_name: expect.any(String),
            played: expect.any(Number),
            won: expect.any(Number),
            drawn: expect.any(Number),
            lost: expect.any(Number),
            points: expect.any(Number),
        });
    });

    it('returns standings ordered by position ascending', async () => {
        const res = await request
            .get(`/api/competitions/${ids.competitionId}/standings`)
            .expect(200);

        const positions: number[] = res.body.data.map((d: { position: number }) => d.position);
        const sorted = [...positions].sort((a, b) => a - b);
        expect(positions).toEqual(sorted);
    });

    it('returns correct data for the seeded standing', async () => {
        const res = await request
            .get(`/api/competitions/${ids.competitionId}/standings`)
            .expect(200);

        const item = res.body.data[0];
        expect(item.team_id).toBe(ids.homeTeamId);
        expect(item.team_name).toBe('Home FC');
        expect(item.position).toBe(1);
        expect(item.played).toBe(5);
        expect(item.won).toBe(4);
        expect(item.points).toBe(12);
    });

    it('returns 404 with error shape for unknown competition', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000001';
        const res = await request
            .get(`/api/competitions/${fakeId}/standings`)
            .expect(404);

        expect(res.body).toMatchObject({
            error: expect.any(String),
            statusCode: 404,
        });
    });

    it('includes CORS header for the configured origin', async () => {
        const res = await request
            .get(`/api/competitions/${ids.competitionId}/standings`)
            .set('Origin', 'http://localhost:7373')
            .expect(200);

        expect(res.headers['access-control-allow-origin']).toBe('http://localhost:7373');
    });
});

// ─── /teams/:id/fixtures ──────────────────────────────────────────────────────

describe('GET /teams/:id/fixtures', () => {
    it('returns 200 with pagination shape for home team', async () => {
        const res = await request
            .get(`/api/teams/${ids.homeTeamId}/fixtures`)
            .expect(200);

        expect(res.body).toMatchObject({
            total: expect.any(Number),
            limit: expect.any(Number),
            offset: expect.any(Number),
            data: expect.any(Array),
        });
        expect(res.body.total).toBeGreaterThanOrEqual(1);
        expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('fixture item has correct schema', async () => {
        const res = await request
            .get(`/api/teams/${ids.homeTeamId}/fixtures`)
            .expect(200);

        const item = res.body.data[0];
        expect(item).toMatchObject({
            id: expect.stringMatching(
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
            ),
            competition_id: ids.competitionId,
            home_team_id: ids.homeTeamId,
            away_team_id: ids.awayTeamId,
            status: 'completed',
            date_played: expect.any(String),
        });
    });

    it('returns fixtures for away team as well', async () => {
        const res = await request
            .get(`/api/teams/${ids.awayTeamId}/fixtures`)
            .expect(200);

        expect(res.body.total).toBeGreaterThanOrEqual(1);
    });

    it('respects limit=1 pagination', async () => {
        const res = await request
            .get(`/api/teams/${ids.homeTeamId}/fixtures?limit=1&offset=0`)
            .expect(200);

        expect(res.body.limit).toBe(1);
        expect(res.body.offset).toBe(0);
        expect(res.body.data.length).toBe(1);
    });

    it('returns empty data array when offset exceeds total', async () => {
        const res = await request
            .get(`/api/teams/${ids.homeTeamId}/fixtures?limit=20&offset=999`)
            .expect(200);

        expect(res.body.data).toHaveLength(0);
        // total should still reflect the real count
        expect(res.body.total).toBeGreaterThanOrEqual(1);
    });

    it('returns 404 with error shape for unknown team', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000002';
        const res = await request
            .get(`/api/teams/${fakeId}/fixtures`)
            .expect(404);

        expect(res.body).toMatchObject({
            error: expect.any(String),
            statusCode: 404,
        });
    });

    it('includes CORS header', async () => {
        const res = await request
            .get(`/api/teams/${ids.homeTeamId}/fixtures`)
            .set('Origin', 'http://localhost:7373')
            .expect(200);

        expect(res.headers['access-control-allow-origin']).toBe('http://localhost:7373');
    });
});

// ─── /fixtures/:id/rubbers ───────────────────────────────────────────────────

describe('GET /fixtures/:id/rubbers', () => {
    it('orders rubbers by trailing numeric index in external_id', async () => {
        const [fixture] = await db
            .insertInto('fixtures')
            .values({
                competition_id: ids.competitionId,
                external_id: 'ext-fixture-order',
                home_team_id: ids.homeTeamId,
                away_team_id: ids.awayTeamId,
                date_played: '2025-02-01',
                status: 'completed',
                round_name: 'Round X',
                round_order: 99,
            })
            .returning('id')
            .execute();

        const [orderHomePlayer] = await db
            .insertInto('external_players')
            .values({
                platform_id: ids.platformId,
                external_id: 'ext-order-home',
                name: 'Order Home',
                updated_at: new Date(),
            })
            .returning('id')
            .execute();
        const [orderAwayPlayer] = await db
            .insertInto('external_players')
            .values({
                platform_id: ids.platformId,
                external_id: 'ext-order-away',
                name: 'Order Away',
                updated_at: new Date(),
            })
            .returning('id')
            .execute();

        const fixedTs = new Date('2026-03-06T00:00:00.000Z');
        await db
            .insertInto('rubbers')
            .values([
                {
                    fixture_id: fixture!.id,
                    external_id: '458260-3',
                    home_player_1_id: orderHomePlayer!.id,
                    away_player_1_id: orderAwayPlayer!.id,
                    home_games_won: 3,
                    away_games_won: 0,
                    outcome_type: 'normal',
                    created_at: fixedTs,
                    updated_at: fixedTs,
                },
                {
                    fixture_id: fixture!.id,
                    external_id: '458260-1',
                    home_player_1_id: orderHomePlayer!.id,
                    away_player_1_id: orderAwayPlayer!.id,
                    home_games_won: 1,
                    away_games_won: 0,
                    outcome_type: 'normal',
                    created_at: fixedTs,
                    updated_at: fixedTs,
                },
                {
                    fixture_id: fixture!.id,
                    external_id: '458260-2',
                    home_player_1_id: orderHomePlayer!.id,
                    away_player_1_id: orderAwayPlayer!.id,
                    home_games_won: 2,
                    away_games_won: 0,
                    outcome_type: 'normal',
                    created_at: fixedTs,
                    updated_at: fixedTs,
                },
            ])
            .execute();

        const res = await request
            .get(`/api/fixtures/${fixture!.id}/rubbers`)
            .expect(200);

        expect(res.body.fixture).toHaveProperty('source_url');
        const homeGamesWonOrder = res.body.data.map(
            (rubber: { home_games_won: number }) => rubber.home_games_won,
        );
        expect(homeGamesWonOrder).toEqual([1, 2, 3]);
    });
});

// ─── /players/:id/stats ───────────────────────────────────────────────────────

describe('GET /players/:id/stats', () => {
    it('returns 200 with correct stats shape for home player', async () => {
        const res = await request
            .get(`/api/players/${ids.homePlayerId}/stats`)
            .expect(200);

        expect(res.body).toMatchObject({
            player_id: ids.homePlayerId,
            player_name: 'Alice Smith',
            wins: expect.any(Number),
            losses: expect.any(Number),
            total: expect.any(Number),
        });
    });

    it('wins + losses === total', async () => {
        const res = await request
            .get(`/api/players/${ids.homePlayerId}/stats`)
            .expect(200);

        expect(res.body.wins + res.body.losses).toBe(res.body.total);
    });

    it('excludes walkover rubbers from total count', async () => {
        // Seeded: 1 normal rubber + 1 walkover rubber. Total should be 1 (only normal counted).
        const res = await request
            .get(`/api/players/${ids.homePlayerId}/stats`)
            .expect(200);

        expect(res.body.total).toBe(1);
    });

    it('correctly counts wins for home player (home_games_won=3 > away_games_won=1)', async () => {
        const res = await request
            .get(`/api/players/${ids.homePlayerId}/stats`)
            .expect(200);

        expect(res.body.wins).toBe(1);
        expect(res.body.losses).toBe(0);
    });

    it('correctly counts losses for away player (away_games_won=1 < home_games_won=3)', async () => {
        const res = await request
            .get(`/api/players/${ids.awayPlayerId}/stats`)
            .expect(200);

        expect(res.body.wins).toBe(0);
        expect(res.body.losses).toBe(1);
        expect(res.body.total).toBe(1);
    });

    it('returns 404 with error shape for unknown player', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000003';
        const res = await request
            .get(`/api/players/${fakeId}/stats`)
            .expect(404);

        expect(res.body).toMatchObject({
            error: expect.any(String),
            statusCode: 404,
        });
    });

    it('includes CORS header', async () => {
        const res = await request
            .get(`/api/players/${ids.homePlayerId}/stats`)
            .set('Origin', 'http://localhost:7373')
            .expect(200);

        expect(res.headers['access-control-allow-origin']).toBe('http://localhost:7373');
    });

    it('aggregates stats across linked source player rows without rubber remapping', async () => {
        const [canonical] = await db
            .insertInto('external_players')
            .values({
                platform_id: ids.platformId,
                external_id: 'ext-player-canon-stats',
                name: 'Canonical Stats',
                updated_at: new Date(),
            })
            .returning('id')
            .execute();

        await db
            .updateTable('external_players')
            .set({ canonical_player_id: canonical!.id, updated_at: new Date() })
            .where('id', '=', canonical!.id)
            .execute();

        const [alias] = await db
            .insertInto('external_players')
            .values({
                platform_id: ids.platformId,
                external_id: 'ext-player-alias-stats',
                canonical_player_id: canonical!.id,
                name: 'Canonical Stats',
                updated_at: new Date(),
            })
            .returning('id')
            .execute();

        await db
            .insertInto('rubbers')
            .values({
                fixture_id: ids.fixtureId,
                external_id: 'ext-rubber-alias-stats',
                home_player_1_id: alias!.id,
                away_player_1_id: ids.awayPlayerId,
                home_games_won: 3,
                away_games_won: 0,
                outcome_type: 'normal',
                updated_at: new Date(),
            })
            .execute();

        const rubber = await db
            .selectFrom('rubbers')
            .select(['home_player_1_id'])
            .where('external_id', '=', 'ext-rubber-alias-stats')
            .executeTakeFirstOrThrow();

        expect(rubber.home_player_1_id).toBe(alias!.id);

        const res = await request
            .get(`/api/players/${canonical!.id}/stats`)
            .expect(200);

        expect(res.body).toMatchObject({
            player_id: canonical!.id,
            player_name: 'Canonical Stats',
            wins: 1,
            losses: 0,
            total: 1,
        });
    });
});

// ─── /players/search ────────────────────────────────────────────────────────

describe('GET /players/search', () => {
    it('collapses active canonical aliases into one search result', async () => {
        const [canonicalPlayer] = await db
            .insertInto('external_players')
            .values({
                platform_id: ids.platformId,
                external_id: 'ext-player-search-canonical',
                name: 'Canonical Search',
                updated_at: new Date(),
            })
            .returning('id')
            .execute();

        await db
            .updateTable('external_players')
            .set({ canonical_player_id: canonicalPlayer!.id, updated_at: new Date() })
            .where('id', '=', canonicalPlayer!.id)
            .execute();

        const [aliasPlayer] = await db
            .insertInto('external_players')
            .values({
                platform_id: ids.platformId,
                external_id: 'ext-player-search-alias',
                canonical_player_id: canonicalPlayer!.id,
                name: 'Canonical Search',
                updated_at: new Date(),
            })
            .returning('id')
            .execute();

        await db
            .insertInto('rubbers')
            .values({
                fixture_id: ids.fixtureId,
                external_id: 'ext-rubber-alias-search',
                home_player_1_id: aliasPlayer!.id,
                away_player_1_id: ids.awayPlayerId,
                home_games_won: 3,
                away_games_won: 0,
                outcome_type: 'normal',
                updated_at: new Date(),
            })
            .execute();

        const res = await request
            .get('/api/players/search?q=Canonical%20Search')
            .expect(200);

        const rows = res.body.data.filter((row: { name: string }) => row.name === 'Canonical Search');
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            id: canonicalPlayer!.id,
            name: 'Canonical Search',
            played: 1,
            wins: 1,
        });
    });
});

// ─── /players/:id/insights ───────────────────────────────────────────────────

describe('GET /players/:id/insights', () => {
    const cacheType = 'player-insights';
    const toMs = (value: Date | string) => new Date(value).getTime();

    it('returns 200 with the expected insights shape', async () => {
        const res = await request
            .get(`/api/players/${ids.homePlayerId}/insights`)
            .expect(200);

        expect(res.body).toMatchObject({
            player_id: ids.homePlayerId,
            player_name: 'Alice Smith',
            years_played: expect.any(Number),
            first_match_date: expect.any(String),
            latest_match_date: expect.any(String),
            career_by_year: expect.any(Array),
            peaks: expect.any(Object),
            rivals: expect.any(Object),
            style: expect.any(Object),
            form: expect.any(Object),
            context: expect.any(Object),
            milestones: expect.any(Object),
            projection: expect.any(Object),
        });
    });

    it('computes seeded totals and season projection fields correctly', async () => {
        const res = await request
            .get(`/api/players/${ids.homePlayerId}/insights`)
            .expect(200);

        expect(res.body.style.singles.played).toBe(1);
        expect(res.body.style.singles.wins).toBe(1);
        expect(res.body.style.singles.losses).toBe(0);
        expect(res.body.milestones.total_matches).toBe(1);
        expect(res.body.projection.current_season_matches).toBe(1);
        expect(res.body.projection.current_season_win_rate).toBe(100);
    });

    it('includes matches with null date_played using created_at fallback', async () => {
        const [fixture] = await db
            .insertInto('fixtures')
            .values({
                competition_id: ids.competitionId,
                external_id: 'ext-fixture-no-date',
                home_team_id: ids.homeTeamId,
                away_team_id: ids.awayTeamId,
                date_played: null,
                status: 'completed',
                updated_at: new Date(),
            })
            .returning('id')
            .execute();

        await db
            .insertInto('rubbers')
            .values({
                fixture_id: fixture!.id,
                external_id: 'ext-rubber-no-date',
                home_player_1_id: ids.homePlayerId,
                away_player_1_id: ids.awayPlayerId,
                home_games_won: 3,
                away_games_won: 2,
                outcome_type: 'normal',
                updated_at: new Date(),
            })
            .execute();

        const res = await request
            .get(`/api/players/${ids.homePlayerId}/insights`)
            .expect(200);

        expect(res.body.style.singles.played).toBe(2);
        expect(res.body.milestones.total_matches).toBe(2);
    });

    it('writes and reuses cache entry when source data is unchanged', async () => {
        await db.deleteFrom('cache_entries').execute();

        const first = await request
            .get(`/api/players/${ids.homePlayerId}/insights`)
            .expect(200);

        const cachedAfterFirst = await db
            .selectFrom('cache_entries')
            .select(['source_version', 'expires_at', 'updated_at'])
            .where('type', '=', cacheType)
            .where('cache_key', '=', ids.homePlayerId)
            .executeTakeFirst();

        expect(cachedAfterFirst).toBeDefined();
        expect(cachedAfterFirst!.source_version).toBeTypeOf('string');
        expect(toMs(cachedAfterFirst!.expires_at)).toBeGreaterThan(Date.now());
        const firstUpdatedAt = toMs(cachedAfterFirst!.updated_at);

        await new Promise((resolve) => setTimeout(resolve, 25));

        const second = await request
            .get(`/api/players/${ids.homePlayerId}/insights`)
            .expect(200);

        expect(second.body).toEqual(first.body);

        const cachedAfterSecond = await db
            .selectFrom('cache_entries')
            .select(['updated_at'])
            .where('type', '=', cacheType)
            .where('cache_key', '=', ids.homePlayerId)
            .executeTakeFirstOrThrow();

        expect(toMs(cachedAfterSecond.updated_at)).toBe(firstUpdatedAt);
    });

    it('recomputes and refreshes cache when entry is expired', async () => {
        await db.deleteFrom('cache_entries').execute();

        await request
            .get(`/api/players/${ids.homePlayerId}/insights`)
            .expect(200);

        const staleUpdatedAt = new Date('2000-01-01T00:00:00.000Z');
        await db
            .updateTable('cache_entries')
            .set({
                expires_at: new Date('2000-01-01T00:00:00.000Z'),
                updated_at: staleUpdatedAt,
            })
            .where('type', '=', cacheType)
            .where('cache_key', '=', ids.homePlayerId)
            .execute();

        await request
            .get(`/api/players/${ids.homePlayerId}/insights`)
            .expect(200);

        const refreshed = await db
            .selectFrom('cache_entries')
            .select(['expires_at', 'updated_at'])
            .where('type', '=', cacheType)
            .where('cache_key', '=', ids.homePlayerId)
            .executeTakeFirstOrThrow();

        expect(toMs(refreshed.updated_at)).toBeGreaterThan(toMs(staleUpdatedAt));
        expect(toMs(refreshed.expires_at)).toBeGreaterThan(Date.now());
    });

    it('recomputes cache when source data version changes', async () => {
        await db.deleteFrom('cache_entries').execute();

        await request
            .get(`/api/players/${ids.homePlayerId}/insights`)
            .expect(200);

        const cachedBeforeUpdate = await db
            .selectFrom('cache_entries')
            .select(['source_version'])
            .where('type', '=', cacheType)
            .where('cache_key', '=', ids.homePlayerId)
            .executeTakeFirstOrThrow();

        await db
            .updateTable('rubbers')
            .set({ updated_at: new Date(Date.now() + 60_000) })
            .where('id', '=', ids.normalRubberId)
            .execute();

        await request
            .get(`/api/players/${ids.homePlayerId}/insights`)
            .expect(200);

        const cachedAfterUpdate = await db
            .selectFrom('cache_entries')
            .select(['source_version'])
            .where('type', '=', cacheType)
            .where('cache_key', '=', ids.homePlayerId)
            .executeTakeFirstOrThrow();

        expect(cachedAfterUpdate.source_version).not.toBe(cachedBeforeUpdate.source_version);
    });

    it('returns 404 with error shape for unknown player', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000009';
        const res = await request
            .get(`/api/players/${fakeId}/insights`)
            .expect(404);

        expect(res.body).toMatchObject({
            error: expect.any(String),
            statusCode: 404,
        });
    });
});

// ─── /players/:id/rubbers (paginated) ───────────────────────────────────────────

describe('GET /players/:id/rubbers', () => {
    it('returns paginated rubbers with correct shape', async () => {
        const res = await request
            .get(`/api/players/${ids.homePlayerId}/rubbers?limit=10&offset=0`)
            .expect(200);

        expect(res.body).toMatchObject({
            total: expect.any(Number),
            limit: 10,
            offset: 0,
            data: expect.any(Array),
        });
        expect(res.body.total).toBeGreaterThanOrEqual(1);
        expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('returns correct total even when offset exceeds data', async () => {
        const res = await request
            .get(`/api/players/${ids.homePlayerId}/rubbers?limit=10&offset=999`)
            .expect(200);

        expect(res.body.data).toHaveLength(0);
        expect(res.body.total).toBeGreaterThanOrEqual(1);
    });

    it('returns correct rubber item shape', async () => {
        const res = await request
            .get(`/api/players/${ids.homePlayerId}/rubbers?limit=1&offset=0`)
            .expect(200);

        const item = res.body.data[0];
        expect(item).toMatchObject({
            id: expect.any(String),
            fixture_id: expect.any(String),
            date: expect.any(String),
            league: expect.any(String),
            opponent: expect.any(String),
            isWin: expect.any(Boolean),
        });
    });
});

// ─── /players/count (cached) ────────────────────────────────────────────────────

describe('GET /players/count', () => {
    it('returns player and match counts', async () => {
        const res = await request
            .get('/api/players/count')
            .expect(200);

        expect(res.body).toMatchObject({
            players: expect.any(Number),
            matches: expect.any(Number),
        });
        expect(res.body.players).toBeGreaterThan(0);
    });

    it('caches count and returns same data on second call', async () => {
        await db.deleteFrom('cache_entries').where('type', '=', 'player-count').execute();

        const first = await request.get('/api/players/count').expect(200);
        const second = await request.get('/api/players/count').expect(200);
        expect(second.body).toEqual(first.body);

        const cached = await db
            .selectFrom('cache_entries')
            .select(['type'])
            .where('type', '=', 'player-count')
            .executeTakeFirst();
        expect(cached).toBeDefined();
    });
});
