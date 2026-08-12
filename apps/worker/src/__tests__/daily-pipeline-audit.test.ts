import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';

import type { Database } from '@tt-players/db';
import * as m046 from '@tt-players/db/src/migrations/046_create_scraping_pipeline_run_history.js';
import { recoverStalePipelineAudits } from '../tasks/completeDailyPipelineTask.js';

const { Pool } = pg;
const TEST_DB_NAME = 'tt_daily_pipeline_audit_test';
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

let db: Kysely<Database>;

async function createTestDatabase(): Promise<void> {
    const admin = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    await admin.end();
}

async function dropTestDatabase(): Promise<void> {
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

async function insertAudit(options: {
    runKey: string;
    status?: 'running' | 'completed' | 'failed';
    stageStatus?: 'running' | 'waiting' | 'completed' | 'failed';
    startedAt: Date;
    updatedAt: Date;
}): Promise<void> {
    const status = options.status ?? 'running';
    const stageStatus = options.stageStatus ?? status;

    await db
        .insertInto('scraping_pipeline_runs')
        .values({
            run_key: options.runKey,
            window_start: options.startedAt,
            status,
            current_stage: 'reconcile',
            started_at: options.startedAt,
            finished_at: status === 'running' ? null : options.updatedAt,
            attempt_count: 1,
            updated_at: options.updatedAt,
        })
        .execute();

    await db
        .insertInto('scraping_pipeline_run_stages')
        .values({
            run_key: options.runKey,
            stage: 'reconcile',
            status: stageStatus,
            started_at: options.startedAt,
            finished_at: stageStatus === 'running' ? null : options.updatedAt,
            attempt_count: 1,
            updated_at: options.updatedAt,
        })
        .execute();
}

describe('daily pipeline audit recovery', () => {
    beforeAll(async () => {
        await createTestDatabase();
        db = new Kysely<Database>({
            dialect: new PostgresDialect({
                pool: new Pool({ connectionString: TEST_DATABASE_URL }),
            }),
        });
        await m046.up(db);
    }, 30_000);

    beforeEach(async () => {
        await db.deleteFrom('scraping_pipeline_run_stages').execute();
        await db.deleteFrom('scraping_pipeline_runs').execute();
    });

    afterAll(async () => {
        await dropTestDatabase();
    }, 15_000);

    it('marks only stale running run and stage rows as failed', async () => {
        const now = Date.now();
        const old = new Date(now - 7 * 60 * 60 * 1000);
        const fresh = new Date(now - 5 * 60 * 1000);

        await insertAudit({ runKey: 'stale', startedAt: old, updatedAt: old });
        await insertAudit({ runKey: 'fresh', startedAt: old, updatedAt: fresh });
        await insertAudit({
            runKey: 'complete',
            status: 'completed',
            stageStatus: 'completed',
            startedAt: old,
            updatedAt: old,
        });

        const recovered = await recoverStalePipelineAudits(db, 6 * 60 * 60 * 1000);
        expect(recovered).toEqual({ runs: 1, stages: 1 });

        const runs = await db
            .selectFrom('scraping_pipeline_runs')
            .select(['run_key', 'status', 'error_message'])
            .orderBy('run_key')
            .execute();
        expect(runs).toEqual([
            expect.objectContaining({ run_key: 'complete', status: 'completed' }),
            expect.objectContaining({ run_key: 'fresh', status: 'running', error_message: null }),
            expect.objectContaining({
                run_key: 'stale',
                status: 'failed',
                error_message: expect.stringContaining('Recovered stale running pipeline audit'),
            }),
        ]);

        const stages = await db
            .selectFrom('scraping_pipeline_run_stages')
            .select(['run_key', 'status', 'error_message'])
            .orderBy('run_key')
            .execute();
        expect(stages).toEqual([
            expect.objectContaining({ run_key: 'complete', status: 'completed' }),
            expect.objectContaining({ run_key: 'fresh', status: 'running', error_message: null }),
            expect.objectContaining({
                run_key: 'stale',
                status: 'failed',
                error_message: expect.stringContaining('Recovered stale running pipeline audit'),
            }),
        ]);
    });

    it('keeps a long-running audit live when its heartbeat is fresh', async () => {
        const now = Date.now();
        await insertAudit({
            runKey: 'heartbeating',
            startedAt: new Date(now - 8 * 60 * 60 * 1000),
            updatedAt: new Date(now - 30 * 1000),
        });

        const recovered = await recoverStalePipelineAudits(db, 6 * 60 * 60 * 1000);
        expect(recovered).toEqual({ runs: 0, stages: 0 });

        const run = await db
            .selectFrom('scraping_pipeline_runs')
            .select(['status', 'finished_at', 'error_message'])
            .where('run_key', '=', 'heartbeating')
            .executeTakeFirstOrThrow();
        expect(run.status).toBe('running');
        expect(run.finished_at).toBeNull();
        expect(run.error_message).toBeNull();
    });
});
