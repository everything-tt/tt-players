import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import type { Database } from '@tt-players/db';
import * as m046 from '../../../../packages/db/src/migrations/046_create_scraping_pipeline_run_history.js';
import { buildApp } from '../app.js';

const { Pool } = pg;
const TEST_DB_NAME = `tt_players_data_updates_test_${process.pid}`;
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

let db: Kysely<Database>;
let request: ReturnType<typeof supertest>;

async function createDatabase(): Promise<void> {
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

beforeAll(async () => {
    await createDatabase();
    db = new Kysely<Database>({
        dialect: new PostgresDialect({
            pool: new Pool({ connectionString: TEST_DATABASE_URL }),
        }),
    });

    await m046.up(db);
    await sql`
        INSERT INTO scraping_pipeline_runs (
            run_key,
            window_start,
            status,
            current_stage,
            started_at,
            attempt_count,
            updated_at
        ) VALUES (
            '2026-08-08',
            '2026-08-08T00:00:00Z',
            'running',
            'ratings',
            '2026-08-08T01:00:00Z',
            3,
            '2026-08-08T01:30:00Z'
        )
    `.execute(db);
    await sql`
        INSERT INTO scraping_pipeline_run_stages (
            run_key,
            stage,
            status,
            started_at,
            finished_at,
            duration_ms,
            attempt_count,
            summary,
            updated_at
        ) VALUES
        (
            '2026-08-08',
            'wait-for-ingestion',
            'completed',
            '2026-08-08T01:00:00Z',
            '2026-08-08T01:10:00Z',
            600000,
            2,
            '{"pending":0,"failed":0}'::jsonb,
            '2026-08-08T01:10:00Z'
        ),
        (
            '2026-08-08',
            'reconcile',
            'completed',
            '2026-08-08T01:10:00Z',
            '2026-08-08T01:20:00Z',
            600000,
            1,
            '{}'::jsonb,
            '2026-08-08T01:20:00Z'
        ),
        (
            '2026-08-08',
            'ratings',
            'waiting',
            '2026-08-08T01:20:00Z',
            NULL,
            NULL,
            3,
            '{"processed_periods":12,"processed_matches":450,"complete":false}'::jsonb,
            '2026-08-08T01:31:00Z'
        )
    `.execute(db);

    const app = await buildApp(db);
    await app.ready();
    request = supertest(app.server);
}, 30_000);

afterAll(async () => {
    await dropDatabase();
}, 15_000);

describe('GET /api/sources/updates', () => {
    it('returns only the latest persisted pipeline snapshot without live queue tables', async () => {
        const response = await request.get('/api/sources/updates').expect(200);

        expect(response.headers['cache-control']).toContain('max-age=30');
        expect(response.body).toMatchObject({
            available: true,
            latest_recorded_at: '2026-08-08T01:31:00.000Z',
            run: {
                run_key: '2026-08-08',
                status: 'running',
                current_stage: 'ratings',
                attempt_count: 3,
            },
        });
        expect(response.body.run.stages).toEqual([
            expect.objectContaining({
                stage: 'wait-for-ingestion',
                status: 'completed',
                attempt_count: 2,
                summary: { pending: 0, failed: 0 },
            }),
            expect.objectContaining({
                stage: 'reconcile',
                status: 'completed',
                attempt_count: 1,
            }),
            expect.objectContaining({
                stage: 'ratings',
                status: 'waiting',
                attempt_count: 3,
                summary: expect.objectContaining({ processed_matches: 450 }),
                recorded_at: '2026-08-08T01:31:00.000Z',
            }),
        ]);
    });
});
