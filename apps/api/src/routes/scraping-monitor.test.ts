import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import type { Database } from '@tt-players/db';
import { loadQueueSnapshot } from './scraping-monitor.js';

const { Pool } = pg;
const TEST_DB_NAME = `tt_scraping_monitor_test_${process.pid}`;
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

let db: Kysely<Database>;

beforeAll(async () => {
    const admin = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    await admin.end();

    db = new Kysely<Database>({
        dialect: new PostgresDialect({
            pool: new Pool({ connectionString: TEST_DATABASE_URL }),
        }),
    });
    await sql`CREATE SCHEMA graphile_worker`.execute(db);
    await sql`
        CREATE TABLE graphile_worker.jobs (
            id bigint PRIMARY KEY,
            task_identifier text NOT NULL,
            attempts int NOT NULL,
            max_attempts int NOT NULL,
            created_at timestamptz NOT NULL,
            updated_at timestamptz NOT NULL,
            run_at timestamptz NOT NULL,
            locked_at timestamptz,
            locked_by text,
            last_error text
        )
    `.execute(db);
}, 30_000);

afterAll(async () => {
    await db.destroy();
    const admin = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.end();
}, 15_000);

describe('scraping monitor queue failure recency', () => {
    it('counts an old job exhausted again today as an active failure', async () => {
        await sql`
            INSERT INTO graphile_worker.jobs (
                id, task_identifier, attempts, max_attempts,
                created_at, updated_at, run_at, last_error
            ) VALUES (
                1, 'scrapeUrlTask', 3, 3,
                now() - interval '2 days', now(), now(), 'HTTP 503'
            )
        `.execute(db);

        const snapshot = await loadQueueSnapshot(db, 10);

        expect(snapshot.summary).toMatchObject({
            failed: 1,
            active_failed: 1,
            historical_failed: 0,
        });
        expect(snapshot.tasks[0]).toMatchObject({
            task_identifier: 'scrapeUrlTask',
            active_failed: 1,
            historical_failed: 0,
        });
    });
});
