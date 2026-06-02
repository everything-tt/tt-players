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

describe('GET /api/players/:id/stats/extended and /api/players/:id/h2h/:opponentId', () => {
    it('returns nemesis_id for players with at least one loss', async () => {
        const res = await request
            .get(`/api/players/${ids.awayPlayerId}/stats/extended`)
            .expect(200);

        expect(res.body.nemesis_id).toBe(ids.homePlayerId);
        expect(typeof res.body.nemesis).toBe('string');
    });

    it('returns h2h encounter league labels as "League · Division"', async () => {
        const res = await request
            .get(`/api/players/${ids.homePlayerId}/h2h/${ids.awayPlayerId}`)
            .expect(200);

        expect(res.body.encounters.length).toBeGreaterThan(0);
        expect(res.body.encounters[0].league).toBe('Test League · Division 1');
    });

    it('filters h2h encounters by league_ids query', async () => {
        const [league2] = await db
            .insertInto('leagues')
            .values({
                platform_id: ids.platformId,
                external_id: 'ext-league-2',
                name: 'Second League',
            })
            .returning('id')
            .execute();

        const [season2] = await db
            .insertInto('seasons')
            .values({
                league_id: league2!.id,
                external_id: 'ext-season-2',
                name: '2025/26',
                is_active: true,
            })
            .returning('id')
            .execute();

        const [competition2] = await db
            .insertInto('competitions')
            .values({
                season_id: season2!.id,
                external_id: 'ext-comp-2',
                name: 'Division X',
                type: 'league',
            })
            .returning('id')
            .execute();

        const [homeTeam2] = await db
            .insertInto('teams')
            .values({
                competition_id: competition2!.id,
                external_id: 'ext-team-home-2',
                name: 'Home 2',
            })
            .returning('id')
            .execute();

        const [awayTeam2] = await db
            .insertInto('teams')
            .values({
                competition_id: competition2!.id,
                external_id: 'ext-team-away-2',
                name: 'Away 2',
            })
            .returning('id')
            .execute();

        const [fixture2] = await db
            .insertInto('fixtures')
            .values({
                competition_id: competition2!.id,
                external_id: 'ext-fixture-2',
                home_team_id: homeTeam2!.id,
                away_team_id: awayTeam2!.id,
                date_played: '2025-02-01',
                status: 'completed',
                round_name: 'Round 2',
                round_order: 2,
                updated_at: new Date(),
            })
            .returning('id')
            .execute();

        await db
            .insertInto('rubbers')
            .values({
                fixture_id: fixture2!.id,
                external_id: 'ext-rubber-2',
                home_player_1_id: ids.homePlayerId,
                away_player_1_id: ids.awayPlayerId,
                home_games_won: 1,
                away_games_won: 3,
                outcome_type: 'normal',
                updated_at: new Date(),
            })
            .execute();

        const allRes = await request
            .get(`/api/players/${ids.homePlayerId}/h2h/${ids.awayPlayerId}`)
            .expect(200);

        const filteredRes = await request
            .get(`/api/players/${ids.homePlayerId}/h2h/${ids.awayPlayerId}?league_ids=${ids.leagueId}`)
            .expect(200);

        expect(filteredRes.body.encounters.length).toBeGreaterThan(0);
        expect(filteredRes.body.encounters.length).toBeLessThan(allRes.body.encounters.length);
        expect(filteredRes.body.encounters.every((encounter: { league: string }) => encounter.league === 'Test League · Division 1')).toBe(true);
    });

    it('caches extended stats and returns same data on second call', async () => {
        await db.deleteFrom('cache_entries').where('type', '=', 'player-extended').execute();

        const first = await request
            .get(`/api/players/${ids.homePlayerId}/stats/extended`)
            .expect(200);

        const second = await request
            .get(`/api/players/${ids.homePlayerId}/stats/extended`)
            .expect(200);

        expect(second.body).toEqual(first.body);

        const cached = await db
            .selectFrom('cache_entries')
            .select(['type', 'cache_key'])
            .where('type', '=', 'player-extended')
            .where('cache_key', '=', ids.homePlayerId)
            .executeTakeFirst();
        expect(cached).toBeDefined();
    });
});
