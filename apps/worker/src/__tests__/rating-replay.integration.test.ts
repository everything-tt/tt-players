import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import type { Database } from '@tt-players/db';
import * as m001 from '@tt-players/db/src/migrations/001_create_enums.js';
import * as m002 from '@tt-players/db/src/migrations/002_create_core_tables.js';
import * as m003 from '@tt-players/db/src/migrations/003_create_match_tables.js';
import * as m005 from '@tt-players/db/src/migrations/005_make_rubber_players_nullable.js';
import * as m006 from '@tt-players/db/src/migrations/006_add_canonical_player_id_to_external_players.js';
import * as m013 from '@tt-players/db/src/migrations/013_add_rubber_score_source.js';
import * as m015 from '@tt-players/db/src/migrations/015_add_rubber_played_at.js';
import * as m028 from '@tt-players/db/src/migrations/028_create_calculated_ratings.js';
import * as m031History from '@tt-players/db/src/migrations/031_create_weekly_rating_history.js';
import * as m032 from '@tt-players/db/src/migrations/032_create_rating_replay_checkpoints.js';
import * as m033 from '@tt-players/db/src/migrations/033_capture_monthly_rating_checkpoints.js';
import { calculateRatingsWithReplay } from '../ratings/calculate-ratings-with-replay.js';

const { Pool } = pg;
const TEST_DB_NAME = 'tt_players_rating_replay_test';
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

let db: Kysely<Database>;
let playerAId: string;
let playerBId: string;
let januaryFixtureId: string;
let februaryRubberId: string;

async function recreateDatabase(): Promise<void> {
    const admin = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    await admin.end();
}

async function dropDatabase(): Promise<void> {
    await db.destroy();
    const admin = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await admin.query(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = '${TEST_DB_NAME}'
          AND pid <> pg_backend_pid()
    `);
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.end();
}

function dateOnly(value: string | Date | null): string | null {
    if (!value) return null;
    return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

async function seedMatch(
    competitionId: string,
    homeTeamId: string,
    awayTeamId: string,
    externalId: string,
    date: string,
    homeGamesWon: number,
    awayGamesWon: number,
): Promise<{ fixtureId: string; rubberId: string }> {
    const fixture = await db
        .insertInto('fixtures')
        .values({
            competition_id: competitionId,
            external_id: `fixture-${externalId}`,
            home_team_id: homeTeamId,
            away_team_id: awayTeamId,
            date_played: date,
            status: 'completed',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    const rubber = await db
        .insertInto('rubbers')
        .values({
            fixture_id: fixture.id,
            external_id: `rubber-${externalId}`,
            home_player_1_id: playerAId,
            away_player_1_id: playerBId,
            home_games_won: homeGamesWon,
            away_games_won: awayGamesWon,
            outcome_type: 'normal',
            score_source: 'games',
            played_at: new Date(`${date}T19:30:00.000Z`),
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    return { fixtureId: fixture.id, rubberId: rubber.id };
}

describe('incremental rating replay', () => {
    beforeAll(async () => {
        await recreateDatabase();
        db = new Kysely<Database>({
            dialect: new PostgresDialect({
                pool: new Pool({ connectionString: TEST_DATABASE_URL }),
            }),
        });
        await m001.up(db);
        await m002.up(db);
        await m003.up(db);
        await m005.up(db);
        await m006.up(db);
        await m013.up(db);
        await m015.up(db);
        await m028.up(db);
        await m031History.up(db);
        await m032.up(db);
        await m033.up(db);

        const platform = await db
            .insertInto('platforms')
            .values({ name: 'Test', base_url: 'https://example.test' })
            .returning('id')
            .executeTakeFirstOrThrow();
        const league = await db
            .insertInto('leagues')
            .values({ platform_id: platform.id, external_id: 'league', name: 'League' })
            .returning('id')
            .executeTakeFirstOrThrow();
        const season = await db
            .insertInto('seasons')
            .values({ league_id: league.id, external_id: 'season', name: 'Season', is_active: true })
            .returning('id')
            .executeTakeFirstOrThrow();
        const competition = await db
            .insertInto('competitions')
            .values({ season_id: season.id, external_id: 'division', name: 'Division', type: 'league' })
            .returning('id')
            .executeTakeFirstOrThrow();
        const teams = await db
            .insertInto('teams')
            .values([
                { competition_id: competition.id, external_id: 'home', name: 'Home' },
                { competition_id: competition.id, external_id: 'away', name: 'Away' },
            ])
            .returning('id')
            .execute();
        const players = await db
            .insertInto('external_players')
            .values([
                { platform_id: platform.id, external_id: 'a', name: 'Player A' },
                { platform_id: platform.id, external_id: 'b', name: 'Player B' },
            ])
            .returning('id')
            .execute();
        playerAId = players[0]!.id;
        playerBId = players[1]!.id;

        await seedMatch(competition.id, teams[0]!.id, teams[1]!.id, 'jan-05', '2026-01-05', 3, 1);
        const january = await seedMatch(
            competition.id,
            teams[0]!.id,
            teams[1]!.id,
            'jan-20',
            '2026-01-20',
            1,
            3,
        );
        januaryFixtureId = january.fixtureId;
        await db
            .updateTable('rubbers')
            .set({ played_at: null })
            .where('id', '=', january.rubberId)
            .execute();
        const february = await seedMatch(
            competition.id,
            teams[0]!.id,
            teams[1]!.id,
            'feb-10',
            '2026-02-10',
            3,
            2,
        );
        februaryRubberId = february.rubberId;
    }, 30_000);

    afterAll(async () => {
        await dropDatabase();
    }, 15_000);

    it('restores the nearest checkpoint and replays only the corrected tail', async () => {
        const initial = await calculateRatingsWithReplay(db, { maxPeriods: 20 });
        expect(initial.complete).toBe(true);
        expect(initial.processedPeriods).toBe(3);
        expect(initial.replayed).toBe(false);

        const checkpointRows = await sql<{ checkpoint_date: string | Date }>`
            SELECT checkpoint_date
            FROM rating_checkpoints
            ORDER BY checkpoint_date
        `.execute(db);
        expect(checkpointRows.rows.map((row) => dateOnly(row.checkpoint_date))).toEqual([
            '2026-01-20',
            '2026-02-10',
        ]);

        const initialRatings = await sql<{ player_id: string; rated_wins: number; rating: number }>`
            SELECT player_id, rated_wins, rating
            FROM player_ratings
            ORDER BY player_id
        `.execute(db);

        await db
            .updateTable('rubbers')
            .set({ home_games_won: 1, away_games_won: 3, updated_at: new Date() })
            .where('id', '=', februaryRubberId)
            .execute();

        const dirtyState = await sql<{ dirty_from_date: string | Date | null }>`
            SELECT dirty_from_date
            FROM rating_processing_state
        `.execute(db);
        expect(dateOnly(dirtyState.rows[0]?.dirty_from_date ?? null)).toBe('2026-02-10');

        const replay = await calculateRatingsWithReplay(db, { maxPeriods: 20 });
        expect(replay.complete).toBe(true);
        expect(replay.replayed).toBe(true);
        expect(replay.dirtyFromDate).toBe('2026-02-10');
        expect(replay.checkpointDate).toBe('2026-01-20');
        expect(replay.replayFromDate).toBe('2026-01-21');
        expect(replay.processedPeriods).toBe(1);
        expect(replay.processedMatches).toBe(1);

        const finalState = await sql<{
            last_processed_date: string | Date | null;
            dirty_from_date: string | Date | null;
        }>`
            SELECT last_processed_date, dirty_from_date
            FROM rating_processing_state
        `.execute(db);
        expect(dateOnly(finalState.rows[0]?.last_processed_date ?? null)).toBe('2026-02-10');
        expect(finalState.rows[0]?.dirty_from_date).toBeNull();

        const finalRatings = await sql<{ player_id: string; rated_wins: number; rating: number }>`
            SELECT player_id, rated_wins, rating
            FROM player_ratings
            ORDER BY player_id
        `.execute(db);
        expect(finalRatings.rows).not.toEqual(initialRatings.rows);
        const playerA = finalRatings.rows.find((row) => row.player_id === playerAId)!;
        const playerB = finalRatings.rows.find((row) => row.player_id === playerBId)!;
        expect(Number(playerA.rated_wins)).toBe(1);
        expect(Number(playerB.rated_wins)).toBe(2);

        const februaryHistory = await sql<{
            player_id: string;
            week_matches: number;
            week_wins: number;
            week_losses: number;
        }>`
            SELECT player_id, week_matches, week_wins, week_losses
            FROM player_rating_weekly_history
            WHERE week_start = '2026-02-09'::date
            ORDER BY player_id
        `.execute(db);
        expect(februaryHistory.rows).toHaveLength(2);
        expect(februaryHistory.rows.every((row) => Number(row.week_matches) === 1)).toBe(true);
        expect(februaryHistory.rows.reduce((sum, row) => sum + Number(row.week_wins), 0)).toBe(1);
        expect(februaryHistory.rows.reduce((sum, row) => sum + Number(row.week_losses), 0)).toBe(1);

        const rebuiltCheckpoints = await sql<{ checkpoint_date: string | Date }>`
            SELECT checkpoint_date
            FROM rating_checkpoints
            ORDER BY checkpoint_date
        `.execute(db);
        expect(rebuiltCheckpoints.rows.map((row) => dateOnly(row.checkpoint_date))).toEqual([
            '2026-01-20',
            '2026-02-10',
        ]);
    });

    it('marks fixture date and canonical identity changes dirty automatically', async () => {
        await sql`UPDATE rating_processing_state SET dirty_from_date = NULL`.execute(db);
        await db
            .updateTable('fixtures')
            .set({ date_played: '2026-01-21', updated_at: new Date() })
            .where('id', '=', januaryFixtureId)
            .execute();

        let state = await sql<{ dirty_from_date: string | Date | null }>`
            SELECT dirty_from_date FROM rating_processing_state
        `.execute(db);
        expect(dateOnly(state.rows[0]?.dirty_from_date ?? null)).toBe('2026-01-20');

        await sql`UPDATE rating_processing_state SET dirty_from_date = NULL`.execute(db);
        await db
            .updateTable('external_players')
            .set({ canonical_player_id: playerAId, updated_at: new Date() })
            .where('id', '=', playerBId)
            .execute();

        state = await sql<{ dirty_from_date: string | Date | null }>`
            SELECT dirty_from_date FROM rating_processing_state
        `.execute(db);
        expect(dateOnly(state.rows[0]?.dirty_from_date ?? null)).toBe('2026-01-05');
    });
});
