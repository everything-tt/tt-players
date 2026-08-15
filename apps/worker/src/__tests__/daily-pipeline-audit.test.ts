import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';

import * as m046 from '@tt-players/db/src/migrations/046_create_scraping_pipeline_run_history.js';
import * as m056 from '@tt-players/db/src/migrations/056_create_scraping_pipeline_active_run.js';
import {
    claimDailyPipelineRun,
    heartbeatDailyPipelineRun,
    ownsDailyPipelineRun,
    recoverStalePipelineAudits,
    releaseDailyPipelineRun,
    withDailyPipelineExecutionLock,
} from '../tasks/completeDailyPipelineTask.js';

const { Pool } = pg;
const TEST_DB_NAME = 'tt_daily_pipeline_audit_test';
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

// Migration 046 is not represented in the generated Database interface yet,
// so this migration-focused test intentionally uses an untyped Kysely handle.
let db: Kysely<any>;

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
        db = new Kysely<any>({
            dialect: new PostgresDialect({
                pool: new Pool({ connectionString: TEST_DATABASE_URL }),
            }),
        });
        await m046.up(db);
        await m056.up(db);
    }, 30_000);

    beforeEach(async () => {
        await db.deleteFrom('scraping_pipeline_active_runs').execute();
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

    it('allows one active daily run and replaces only a stale lease', async () => {
        const now = new Date();
        await insertAudit({ runKey: 'run-a', startedAt: now, updatedAt: now });
        await insertAudit({ runKey: 'run-b', startedAt: now, updatedAt: now });

        await expect(claimDailyPipelineRun(db, 'run-a', 'owner-a', 60_000)).resolves.toBe(true);
        await expect(claimDailyPipelineRun(db, 'run-a', 'owner-b', 60_000)).resolves.toBe(false);
        await expect(claimDailyPipelineRun(db, 'run-b', 'owner-b', 60_000)).resolves.toBe(false);

        await heartbeatDailyPipelineRun(db, 'run-a', 'owner-a');
        await expect(ownsDailyPipelineRun(db, 'run-a', 'owner-a')).resolves.toBe(true);
        await expect(ownsDailyPipelineRun(db, 'run-a', 'owner-b')).resolves.toBe(false);
        const active = await db
            .selectFrom('scraping_pipeline_active_runs')
            .select(['run_key'])
            .executeTakeFirstOrThrow();
        expect(active.run_key).toBe('run-a');

        await db
            .updateTable('scraping_pipeline_active_runs')
            .set({ heartbeat_at: new Date(Date.now() - 120_000) })
            .where('pipeline_name', '=', 'daily')
            .execute();

        await expect(claimDailyPipelineRun(db, 'run-b', 'owner-b', 60_000)).resolves.toBe(true);
        await releaseDailyPipelineRun(db, 'run-a', 'owner-a');
        await expect(ownsDailyPipelineRun(db, 'run-b', 'owner-b')).resolves.toBe(true);
        await releaseDailyPipelineRun(db, 'run-b', 'owner-b');
        await expect(
            db.selectFrom('scraping_pipeline_active_runs').selectAll().execute(),
        ).resolves.toEqual([]);
    });

    it('holds a database advisory lock for the complete stage execution', async () => {
        let releaseFirst!: () => void;
        let markEntered!: () => void;
        const entered = new Promise<void>((resolve) => {
            markEntered = resolve;
        });
        const hold = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });

        const first = withDailyPipelineExecutionLock(db, async () => {
            markEntered();
            await hold;
        });
        await entered;

        try {
            const competing = await db.connection().execute(async (connection) => {
                const result = await sql<{ acquired: boolean }>`
                    SELECT pg_try_advisory_lock(
                        hashtextextended('tt-players:daily-pipeline', 0)
                    ) AS acquired
                `.execute(connection);
                return result.rows[0]?.acquired ?? false;
            });
            expect(competing).toBe(false);
        } finally {
            releaseFirst();
            await first;
        }
    });
});
