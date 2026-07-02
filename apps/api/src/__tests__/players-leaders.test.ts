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

describe('GET /api/players/leaders', () => {
    it('enforces minimum 10-slot response window for Best Win mode when available rows exceed requested limit', async () => {
        const res = await request
            .get('/api/players/leaders?mode=win_pct&limit=1&min_played=1')
            .expect(200);

        expect(res.body.mode).toBe('win_pct');
        // Seed contains two qualifying players; win_pct mode should not truncate to limit=1.
        expect(res.body.data).toHaveLength(2);
        expect(res.body.data[0].player_id).toBe(ids.homePlayerId);
        expect(res.body.data[1].player_id).toBe(ids.awayPlayerId);
    });

    it('excludes players whose results are only from historical (inactive) seasons', async () => {
        const [inactiveSeason] = await db
            .insertInto('seasons')
            .values({
                league_id: ids.leagueId,
                external_id: 'ext-season-history',
                name: '2023/24',
                is_active: false,
            })
            .returning('id')
            .execute();

        const [inactiveCompetition] = await db
            .insertInto('competitions')
            .values({
                season_id: inactiveSeason.id,
                external_id: 'ext-comp-history',
                name: 'Division History',
                type: 'league',
            })
            .returning('id')
            .execute();

        const [histHomeTeam] = await db
            .insertInto('teams')
            .values({
                competition_id: inactiveCompetition.id,
                external_id: 'ext-team-history-home',
                name: 'History Home',
            })
            .returning('id')
            .execute();

        const [histAwayTeam] = await db
            .insertInto('teams')
            .values({
                competition_id: inactiveCompetition.id,
                external_id: 'ext-team-history-away',
                name: 'History Away',
            })
            .returning('id')
            .execute();

        const [historyPlayer] = await db
            .insertInto('external_players')
            .values({
                platform_id: ids.platformId,
                external_id: 'ext-player-history-only',
                name: 'History Hero',
                updated_at: new Date(),
            })
            .returning('id')
            .execute();

        const [historyOpponent] = await db
            .insertInto('external_players')
            .values({
                platform_id: ids.platformId,
                external_id: 'ext-player-history-opp',
                name: 'History Opponent',
                updated_at: new Date(),
            })
            .returning('id')
            .execute();

        for (let i = 1; i <= 3; i++) {
            const [fixture] = await db
                .insertInto('fixtures')
                .values({
                    competition_id: inactiveCompetition.id,
                    external_id: `ext-fixture-history-${i}`,
                    home_team_id: histHomeTeam.id,
                    away_team_id: histAwayTeam.id,
                    date_played: '2024-01-15',
                    status: 'completed',
                    round_name: `Round ${i}`,
                    round_order: i,
                    updated_at: new Date(),
                })
                .returning('id')
                .execute();

            await db
                .insertInto('rubbers')
                .values({
                    fixture_id: fixture.id,
                    external_id: `ext-rubber-history-${i}`,
                    home_player_1_id: historyPlayer.id,
                    away_player_1_id: historyOpponent.id,
                    home_games_won: 3,
                    away_games_won: 0,
                    outcome_type: 'normal',
                    updated_at: new Date(),
                })
                .execute();
        }

        const res = await request
            .get('/api/players/leaders?mode=win_pct&limit=10&min_played=1')
            .expect(200);

        const names = res.body.data.map((row: { player_name: string }) => row.player_name);
        expect(names).not.toContain('History Hero');
    });

    it('caches leaders response and returns same data on second call', async () => {
        await db.deleteFrom('cache_entries').where('type', '=', 'player-leaders').execute();

        const first = await request
            .get('/api/players/leaders?mode=combined&limit=5&min_played=1')
            .expect(200);

        const second = await request
            .get('/api/players/leaders?mode=combined&limit=5&min_played=1')
            .expect(200);

        expect(second.body).toEqual(first.body);

        const cached = await db
            .selectFrom('cache_entries')
            .select(['type', 'cache_key'])
            .where('type', '=', 'player-leaders')
            .executeTakeFirst();
        expect(cached).toBeDefined();
    });

    it('aggregates linked source player rows into one leaderboard row', async () => {
        await db.deleteFrom('cache_entries').where('type', '=', 'player-leaders').execute();

        const [canonical] = await db
            .insertInto('external_players')
            .values({
                platform_id: ids.platformId,
                external_id: 'ext-player-leader-canon',
                name: 'Leader Canon',
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
                external_id: 'ext-player-leader-alias',
                canonical_player_id: canonical!.id,
                name: 'Leader Canon',
                updated_at: new Date(),
            })
            .returning('id')
            .execute();

        await db
            .insertInto('rubbers')
            .values([
                {
                    fixture_id: ids.fixtureId,
                    external_id: 'ext-rubber-leader-canon',
                    home_player_1_id: canonical!.id,
                    away_player_1_id: ids.awayPlayerId,
                    home_games_won: 3,
                    away_games_won: 0,
                    outcome_type: 'normal',
                    updated_at: new Date(),
                },
                {
                    fixture_id: ids.fixtureId,
                    external_id: 'ext-rubber-leader-alias',
                    home_player_1_id: alias!.id,
                    away_player_1_id: ids.awayPlayerId,
                    home_games_won: 3,
                    away_games_won: 1,
                    outcome_type: 'normal',
                    updated_at: new Date(),
                },
            ])
            .execute();

        const res = await request
            .get('/api/players/leaders?mode=most_played&limit=20&min_played=1')
            .expect(200);

        const rows = res.body.data.filter((row: { player_name: string }) => row.player_name === 'Leader Canon');
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            player_id: canonical!.id,
            played: 2,
            wins: 2,
            losses: 0,
        });
    });

    it('ranks recent form, improvement, and new active-season players', async () => {
        const insertResults = async (
            playerName: string,
            externalId: string,
            dates: string[],
            results: boolean[],
        ) => {
            const [player] = await db
                .insertInto('external_players')
                .values({
                    platform_id: ids.platformId,
                    external_id: externalId,
                    name: playerName,
                    updated_at: new Date(),
                })
                .returning('id')
                .execute();

            for (const [index, date] of dates.entries()) {
                const [fixture] = await db
                    .insertInto('fixtures')
                    .values({
                        competition_id: ids.competitionId,
                        external_id: `${externalId}-fixture-${index}`,
                        home_team_id: ids.homeTeamId,
                        away_team_id: ids.awayTeamId,
                        date_played: date,
                        status: 'completed',
                        round_name: `Round ${index + 1}`,
                        round_order: index + 1,
                        updated_at: new Date(),
                    })
                    .returning('id')
                    .execute();

                await db
                    .insertInto('rubbers')
                    .values({
                        fixture_id: fixture!.id,
                        external_id: `${externalId}-rubber-${index}`,
                        home_player_1_id: player!.id,
                        away_player_1_id: ids.awayPlayerId,
                        home_games_won: results[index] ? 3 : 1,
                        away_games_won: results[index] ? 1 : 3,
                        outcome_type: 'normal',
                        updated_at: new Date(),
                    })
                    .execute();
            }

            return player!;
        };

        const improvingPlayer = await insertResults(
            'Improving Player',
            'ext-player-improving',
            Array.from({ length: 10 }, (_, index) => `2025-01-${String(index + 1).padStart(2, '0')}`),
            [false, false, false, false, false, true, true, true, true, true],
        );
        const formPlayer = await insertResults(
            'Form Player',
            'ext-player-form',
            Array.from({ length: 10 }, (_, index) => `2025-02-${String(index + 1).padStart(2, '0')}`),
            [true, true, true, true, true, true, true, true, true, false],
        );
        const newPlayer = await insertResults(
            'New Player',
            'ext-player-new',
            ['2025-03-01'],
            [true],
        );

        await db.deleteFrom('cache_entries').where('type', '=', 'player-leaders').execute();

        const form = await request
            .get('/api/players/leaders?mode=form&limit=5&min_played=5')
            .expect(200);
        expect(form.body.data[0]).toMatchObject({
            player_id: formPlayer.id,
            played: 10,
            wins: 9,
            losses: 1,
            win_rate: 90,
        });

        const improving = await request
            .get('/api/players/leaders?mode=improving&limit=5&min_played=5')
            .expect(200);
        expect(improving.body.data[0]).toMatchObject({
            player_id: improvingPlayer.id,
            played: 5,
            wins: 5,
            losses: 0,
            win_rate: 100,
            score: 100,
        });

        const newFaces = await request
            .get('/api/players/leaders?mode=new_faces&limit=5&min_played=1')
            .expect(200);
        expect(newFaces.body.data[0]).toMatchObject({
            player_id: newPlayer.id,
            first_match_date: '2025-03-01',
        });
    });
});
