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

describe('GET /api/players/:id/profile-overview', () => {
    it('returns identity, career totals, recent form, and current-season clubs together', async () => {
        const response = await request
            .get(`/api/players/${ids.homePlayerId}/profile-overview`)
            .expect(200);

        expect(response.body).toEqual({
            player_id: ids.homePlayerId,
            player_name: 'Alice Smith',
            wins: 1,
            losses: 0,
            total: 1,
            form: {
                rolling_10_win_rate: 100,
                rolling_20_win_rate: 100,
                momentum: 'new',
                recent_results: ['W'],
            },
            current_season_affiliations: [{
                team_id: ids.homeTeamId,
                team_name: 'Home FC',
                league_id: ids.leagueId,
                league_name: 'Test League',
                season_id: ids.seasonId,
                season_name: '2024/25',
                competition_name: 'Division 1',
            }],
        });
    });

    it('returns 404 for a missing player', async () => {
        await request
            .get('/api/players/00000000-0000-4000-8000-000000000000/profile-overview')
            .expect(404);
    });

    it('bounds form calculation to the latest 20 singles while keeping career totals', async () => {
        for (let index = 0; index < 25; index += 1) {
            const day = String(index + 1).padStart(2, '0');
            const [fixture] = await db
                .insertInto('fixtures')
                .values({
                    competition_id: ids.competitionId,
                    external_id: `profile-overview-fixture-${index}`,
                    home_team_id: ids.homeTeamId,
                    away_team_id: ids.awayTeamId,
                    date_played: `2025-02-${day}`,
                    status: 'completed',
                    round_name: `Profile ${index + 1}`,
                    round_order: index + 1,
                    updated_at: new Date(),
                })
                .returning('id')
                .execute();

            const isWin = index >= 15;
            await db
                .insertInto('rubbers')
                .values({
                    fixture_id: fixture!.id,
                    external_id: `profile-overview-rubber-${index}`,
                    home_player_1_id: ids.homePlayerId,
                    away_player_1_id: ids.awayPlayerId,
                    home_games_won: isWin ? 3 : 1,
                    away_games_won: isWin ? 1 : 3,
                    outcome_type: 'normal',
                    updated_at: new Date(),
                })
                .execute();
        }

        const response = await request
            .get(`/api/players/${ids.homePlayerId}/profile-overview`)
            .expect(200);

        expect(response.body).toMatchObject({
            wins: 11,
            losses: 15,
            total: 26,
            form: {
                rolling_10_win_rate: 100,
                rolling_20_win_rate: 50,
                momentum: 'hot',
            },
        });
        expect(response.body.form.recent_results).toEqual([
            ...Array(10).fill('W'),
            ...Array(10).fill('L'),
        ]);
    });
});
