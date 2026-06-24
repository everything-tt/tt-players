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

    const [historicalSeason] = await db
        .insertInto('seasons')
        .values({
            league_id: ids.leagueId,
            external_id: 'ext-season-history',
            name: '2023/24',
            is_active: false,
        })
        .returning('id')
        .execute();
    const [historicalCompetition] = await db
        .insertInto('competitions')
        .values({
            season_id: historicalSeason.id,
            external_id: 'ext-competition-history',
            name: 'Division 1',
            type: 'league',
        })
        .returning('id')
        .execute();
    const [historicalTeam] = await db
        .insertInto('teams')
        .values({
            competition_id: historicalCompetition.id,
            external_id: 'ext-history-champion',
            name: 'Past Champions',
        })
        .returning('id')
        .execute();
    await db
        .insertInto('league_standings')
        .values({
            competition_id: historicalCompetition.id,
            team_id: historicalTeam.id,
            position: 1,
            played: 10,
            won: 9,
            drawn: 0,
            lost: 1,
            points: 27,
            updated_at: new Date(),
        })
        .execute();

    const app = await buildApp(db);
    await app.ready();
    request = supertest(app.server);
}, 30_000);

afterAll(async () => {
    await dropTestDatabase(db);
}, 15_000);

describe('league overview and dashboard', () => {
    it('returns active-season performance across the selected league collection', async () => {
        const res = await request
            .get(`/api/leagues/dashboard?league_ids=${ids.leagueId}`)
            .expect(200);

        expect(res.body).toMatchObject({
            totals: {
                leagues: 1,
                divisions: 1,
                teams: 1,
                matches_played: 3,
            },
            recent_results: [
                {
                    fixture_id: ids.fixtureId,
                    league_id: ids.leagueId,
                    league_name: 'Test League',
                    division_name: 'Division 1',
                    home_score: 1,
                    away_score: 0,
                },
            ],
            top_teams: [
                {
                    team_id: ids.homeTeamId,
                    team_name: 'Home FC',
                    league_name: 'Test League',
                    division_name: 'Division 1',
                    played: 5,
                    won: 4,
                },
            ],
        });
    });

    it('returns inexpensive active-season summaries for selected leagues', async () => {
        const res = await request
            .get(`/api/leagues/overview?league_ids=${ids.leagueId}`)
            .expect(200);

        expect(res.body.data).toEqual([
            expect.objectContaining({
                id: ids.leagueId,
                name: 'Test League',
                season_id: ids.seasonId,
                season: '2024/25',
                divisions: 1,
                teams: 1,
                matches_played: 3,
                status: 'in_progress',
            }),
        ]);
    });

    it('returns recent results, title races, and historical champions', async () => {
        const res = await request
            .get(`/api/leagues/${ids.leagueId}/dashboard`)
            .expect(200);

        expect(res.body).toMatchObject({
            league: {
                id: ids.leagueId,
                name: 'Test League',
                season_id: ids.seasonId,
                season: '2024/25',
            },
            recent_results: [
                {
                    fixture_id: ids.fixtureId,
                    home_team_name: 'Home FC',
                    away_team_name: 'Away FC',
                    home_score: 1,
                    away_score: 0,
                },
            ],
            title_races: [
                {
                    competition_id: ids.competitionId,
                    competition_name: 'Division 1',
                    leader_name: 'Home FC',
                },
            ],
        });

        expect(res.body.history).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    season: '2023/24',
                    champions: [
                        expect.objectContaining({
                            division_name: 'Division 1',
                            team_name: 'Past Champions',
                        }),
                    ],
                }),
            ]),
        );
    });

    it('returns a clear 404 for an unknown league dashboard', async () => {
        await request
            .get('/api/leagues/00000000-0000-0000-0000-000000000003/dashboard')
            .expect(404);
    });
});
