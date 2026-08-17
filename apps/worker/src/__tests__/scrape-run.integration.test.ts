import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, Migrator, PostgresDialect } from 'kysely';
import type { Migration, MigrationProvider } from 'kysely';
import pg from 'pg';
import * as m060 from '@tt-players/db/src/migrations/060_create_scrape_run_resources.js';
import {
    beginScrapeRunResource,
    ensureScrapeRun,
    inspectScrapeRun,
    recordScrapeRunTaskFailure,
    registerScrapeRunResource,
    succeedScrapeRunResource,
    type ScrapeRunContext,
} from '../scrape-run.js';

const { Pool } = pg;
const TEST_DB_NAME = 'tt_scrape_run_barrier_test';
const BASE = process.env.TEST_DATABASE_BASE_URL ?? 'postgres://postgres:postgres@localhost:5432';
const ADMIN_URL = `${BASE}/postgres`;
const TEST_URL = `${BASE}/${TEST_DB_NAME}`;

class Provider implements MigrationProvider {
    async getMigrations(): Promise<Record<string, Migration>> {
        return { '060_create_scrape_run_resources': m060 };
    }
}

let database: Kysely<any>;

function resource(resourceKey: string): ScrapeRunContext {
    return {
        runKey: '2026-08-17',
        resourceKey,
        source: 'test-source',
        resourceType: 'test-resource',
    };
}

describe('authoritative scrape run resources', () => {
    beforeAll(async () => {
        const admin = new Pool({ connectionString: ADMIN_URL });
        await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
        await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
        await admin.end();

        database = new Kysely({
            dialect: new PostgresDialect({ pool: new Pool({ connectionString: TEST_URL }) }),
        });
        const result = await new Migrator({ db: database, provider: new Provider() }).migrateToLatest();
        if (result.error) throw result.error;
    }, 30_000);

    afterAll(async () => {
        await database.destroy();
        const admin = new Pool({ connectionString: ADMIN_URL });
        await admin.query(`
            SELECT pg_terminate_backend(pid) FROM pg_stat_activity
            WHERE datname = '${TEST_DB_NAME}' AND pid <> pg_backend_pid()
        `);
        await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
        await admin.end();
    }, 15_000);

    it('blocks until every registered resource succeeds', async () => {
        await ensureScrapeRun(database, '2026-08-17');
        const first = resource('first');
        const second = resource('second');
        await registerScrapeRunResource(database, first);
        await registerScrapeRunResource(database, second);
        await beginScrapeRunResource(database, first);
        await beginScrapeRunResource(database, second);
        await succeedScrapeRunResource(database, first);

        expect(await inspectScrapeRun(database, '2026-08-17')).toEqual({
            exists: true,
            expected: 2,
            pending: 1,
            succeeded: 1,
            failed: 0,
        });
    });

    it('keeps retryable failures pending and exposes only terminal failure', async () => {
        const second = resource('second');
        await recordScrapeRunTaskFailure(
            database,
            second,
            { attempts: 1, max_attempts: 3 },
            new Error('temporary'),
        );
        expect((await inspectScrapeRun(database, '2026-08-17')).failed).toBe(0);

        await recordScrapeRunTaskFailure(
            database,
            second,
            { attempts: 3, max_attempts: 3 },
            new Error('terminal'),
        );
        expect(await inspectScrapeRun(database, '2026-08-17')).toEqual({
            exists: true,
            expected: 2,
            pending: 0,
            succeeded: 1,
            failed: 1,
        });
    });

    it('does not reset a successful resource when registration is replayed', async () => {
        const first = resource('first');
        await registerScrapeRunResource(database, first);
        expect((await inspectScrapeRun(database, '2026-08-17')).succeeded).toBe(1);
    });
});
