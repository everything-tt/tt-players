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

describe('GET /api/teams/:id/fixtures - enriched team labels and score', () => {
    it('returns team names and aggregate match score in fixture rows', async () => {
        const res = await request
            .get(`/api/teams/${ids.homeTeamId}/fixtures`)
            .expect(200);

        expect(res.body.data).toHaveLength(1);
        const fixture = res.body.data[0];

        expect(fixture.home_team_name).toBe('Home FC');
        expect(fixture.away_team_name).toBe('Away FC');
        expect(fixture.home_score).toBe(1);
        expect(fixture.away_score).toBe(0);
    });

    it('returns correct score for paginated fixtures when team has multiple matches', async () => {
        const [fixtureTwo] = await db
            .insertInto('fixtures')
            .values({
                competition_id: ids.competitionId,
                external_id: 'ext-fixture-2',
                home_team_id: ids.homeTeamId,
                away_team_id: ids.awayTeamId,
                date_played: '2025-01-16',
                status: 'completed',
            })
            .returning('id')
            .execute();

        await db
            .insertInto('rubbers')
            .values({
                fixture_id: fixtureTwo!.id,
                external_id: 'ext-rubber-2',
                home_player_1_id: ids.homePlayerId,
                away_player_1_id: ids.awayPlayerId,
                home_games_won: 1,
                away_games_won: 3,
                outcome_type: 'normal',
            })
            .execute();

        const res = await request
            .get(`/api/teams/${ids.homeTeamId}/fixtures?limit=1&offset=0`)
            .expect(200);

        expect(res.body.total).toBe(2);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0]).toMatchObject({
            id: fixtureTwo!.id,
            home_score: 0,
            away_score: 1,
        });
    });

    it('returns the full completed form for the season', async () => {
        const res = await request
            .get(`/api/teams/${ids.homeTeamId}/form`)
            .expect(200);

        expect(res.body.form).toEqual(['W', 'L']);
    });
});
