import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import * as weeklyHistoryMigration from '../migrations/029_create_weekly_rating_history.js';

const { Pool } = pg;
const TEST_DB_NAME = 'tt_players_weekly_rating_history_test';
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

let db: Kysely<any>;

async function recreateDatabase(): Promise<void> {
    const pool = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await pool.query(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1
          AND pid <> pg_backend_pid()
    `, [TEST_DB_NAME]);
    await pool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await pool.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    await pool.end();
}

async function dropDatabase(): Promise<void> {
    await db.destroy();
    const pool = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await pool.query(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1
          AND pid <> pg_backend_pid()
    `, [TEST_DB_NAME]);
    await pool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await pool.end();
}

async function createPrerequisiteTables(): Promise<void> {
    await sql`
        CREATE TABLE external_players (
            id uuid PRIMARY KEY,
            name text NOT NULL
        )
    `.execute(db);
    await sql`
        CREATE TABLE rating_models (
            id uuid PRIMARY KEY,
            key varchar NOT NULL UNIQUE
        )
    `.execute(db);
    await sql`
        CREATE TABLE player_ratings (
            model_id uuid NOT NULL REFERENCES rating_models(id) ON DELETE CASCADE,
            player_id uuid NOT NULL REFERENCES external_players(id) ON DELETE CASCADE,
            rating double precision NOT NULL,
            rating_deviation double precision NOT NULL,
            volatility double precision NOT NULL,
            conservative_rating double precision NOT NULL,
            rated_matches integer NOT NULL DEFAULT 0,
            rated_wins integer NOT NULL DEFAULT 0,
            rated_losses integer NOT NULL DEFAULT 0,
            first_rated_at date,
            last_rated_at date,
            provisional boolean NOT NULL DEFAULT true,
            updated_at timestamp NOT NULL DEFAULT now(),
            PRIMARY KEY (model_id, player_id)
        )
    `.execute(db);
}

function dateOnly(value: string | Date): string {
    return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

describe('weekly rating history migration', () => {
    beforeAll(async () => {
        await recreateDatabase();
        db = new Kysely({
            dialect: new PostgresDialect({
                pool: new Pool({ connectionString: TEST_DATABASE_URL }),
            }),
        });
        await createPrerequisiteTables();
        await weeklyHistoryMigration.up(db);
    }, 30_000);

    afterAll(async () => {
        await dropDatabase();
    }, 15_000);

    it('keeps the latest rating and accumulated results for each ISO week', async () => {
        const modelId = '10000000-0000-4000-8000-000000000001';
        const playerId = '20000000-0000-4000-8000-000000000001';

        await sql`
            INSERT INTO rating_models (id, key)
            VALUES (${modelId}::uuid, 'test-model')
        `.execute(db);
        await sql`
            INSERT INTO external_players (id, name)
            VALUES (${playerId}::uuid, 'Test Player')
        `.execute(db);
        await sql`
            INSERT INTO player_ratings (
                model_id,
                player_id,
                rating,
                rating_deviation,
                volatility,
                conservative_rating,
                rated_matches,
                rated_wins,
                rated_losses,
                first_rated_at,
                last_rated_at,
                provisional
            ) VALUES (
                ${modelId}::uuid,
                ${playerId}::uuid,
                1510,
                120,
                0.06,
                1270,
                2,
                1,
                1,
                '2026-07-27',
                '2026-07-27',
                true
            )
        `.execute(db);

        await sql`
            UPDATE player_ratings
            SET rating = 1540,
                rating_deviation = 100,
                conservative_rating = 1340,
                rated_matches = 5,
                rated_wins = 4,
                rated_losses = 1,
                last_rated_at = '2026-07-30'
            WHERE model_id = ${modelId}::uuid
              AND player_id = ${playerId}::uuid
        `.execute(db);

        await sql`
            UPDATE player_ratings
            SET rating = 1520,
                rating_deviation = 95,
                conservative_rating = 1330,
                rated_matches = 6,
                rated_wins = 4,
                rated_losses = 2,
                last_rated_at = '2026-08-03'
            WHERE model_id = ${modelId}::uuid
              AND player_id = ${playerId}::uuid
        `.execute(db);

        const historyResult = await sql<{
            week_start: string | Date;
            snapshot_date: string | Date;
            rating: number;
            week_matches: number;
            week_wins: number;
            week_losses: number;
        }>`
            SELECT
                week_start,
                snapshot_date,
                rating,
                week_matches,
                week_wins,
                week_losses
            FROM player_rating_weekly_history
            WHERE model_id = ${modelId}::uuid
              AND player_id = ${playerId}::uuid
            ORDER BY week_start
        `.execute(db);

        expect(historyResult.rows).toHaveLength(2);
        expect(dateOnly(historyResult.rows[0]!.week_start)).toBe('2026-07-27');
        expect(dateOnly(historyResult.rows[0]!.snapshot_date)).toBe('2026-07-30');
        expect(Number(historyResult.rows[0]!.rating)).toBe(1540);
        expect(Number(historyResult.rows[0]!.week_matches)).toBe(5);
        expect(Number(historyResult.rows[0]!.week_wins)).toBe(4);
        expect(Number(historyResult.rows[0]!.week_losses)).toBe(1);

        expect(dateOnly(historyResult.rows[1]!.week_start)).toBe('2026-08-03');
        expect(Number(historyResult.rows[1]!.week_matches)).toBe(1);
        expect(Number(historyResult.rows[1]!.week_wins)).toBe(0);
        expect(Number(historyResult.rows[1]!.week_losses)).toBe(1);

        await sql`
            DELETE FROM player_ratings
            WHERE model_id = ${modelId}::uuid
              AND player_id = ${playerId}::uuid
        `.execute(db);

        const countResult = await sql<{ total: number }>`
            SELECT COUNT(*)::int AS total
            FROM player_rating_weekly_history
            WHERE model_id = ${modelId}::uuid
              AND player_id = ${playerId}::uuid
        `.execute(db);
        expect(Number(countResult.rows[0]?.total ?? -1)).toBe(0);
    });
});
