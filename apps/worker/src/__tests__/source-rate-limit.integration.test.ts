import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, Migrator, PostgresDialect, sql } from 'kysely';
import type { Migration, MigrationProvider } from 'kysely';
import pg from 'pg';
import * as m061 from '@tt-players/db/src/migrations/061_create_source_request_limits.js';
import {
    releaseSourceRequestLease,
    tryAcquireSourceRequestLease,
} from '../source-rate-limit.js';

const { Pool } = pg;
const TEST_DB_NAME = 'tt_source_rate_limit_test';
const BASE = process.env.TEST_DATABASE_BASE_URL ?? 'postgres://postgres:postgres@localhost:5432';
const ADMIN_URL = `${BASE}/postgres`;
const TEST_URL = `${BASE}/${TEST_DB_NAME}`;

class Provider implements MigrationProvider {
    async getMigrations(): Promise<Record<string, Migration>> {
        return { '061_create_source_request_limits': m061 };
    }
}

let firstDb: Kysely<any>;
let secondDb: Kysely<any>;

function createDb(): Kysely<any> {
    return new Kysely({
        dialect: new PostgresDialect({ pool: new Pool({ connectionString: TEST_URL }) }),
    });
}

describe('distributed source request leases', () => {
    beforeAll(async () => {
        const admin = new Pool({ connectionString: ADMIN_URL });
        await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
        await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
        await admin.end();

        firstDb = createDb();
        secondDb = createDb();
        const result = await new Migrator({ db: firstDb, provider: new Provider() }).migrateToLatest();
        if (result.error) throw result.error;
    }, 30_000);

    afterAll(async () => {
        await firstDb.destroy();
        await secondDb.destroy();
        const admin = new Pool({ connectionString: ADMIN_URL });
        await admin.query(`
            SELECT pg_terminate_backend(pid) FROM pg_stat_activity
            WHERE datname = '${TEST_DB_NAME}' AND pid <> pg_backend_pid()
        `);
        await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
        await admin.end();
    }, 15_000);

    it('shares one in-flight lease across independent worker connections', async () => {
        const sourceKey = 'ttleagues-integration';
        const first = await tryAcquireSourceRequestLease(firstDb, sourceKey, 30_000);
        expect(first.lease).not.toBeNull();

        const blocked = await tryAcquireSourceRequestLease(secondDb, sourceKey, 30_000);
        expect(blocked.lease).toBeNull();
        expect(blocked.waitMs).toBeGreaterThan(20_000);

        await releaseSourceRequestLease(firstDb, first.lease!, 0);
        const second = await tryAcquireSourceRequestLease(secondDb, sourceKey, 30_000);
        expect(second.lease).not.toBeNull();
        expect(second.lease!.token).not.toBe(first.lease!.token);

        await releaseSourceRequestLease(firstDb, first.lease!, 0, 60_000);
        const row = await sql<{ lease_token: string | null }>`
            SELECT lease_token
            FROM staging.source_request_limits
            WHERE source_key = ${sourceKey}
        `.execute(firstDb).then((result) => result.rows[0]);
        expect(row?.lease_token).toBe(second.lease!.token);

        await releaseSourceRequestLease(secondDb, second.lease!, 0);
    });

    it('makes a source cooldown visible to other replicas', async () => {
        const sourceKey = 'tt365-cooldown-integration';
        const first = await tryAcquireSourceRequestLease(firstDb, sourceKey, 30_000);
        expect(first.lease).not.toBeNull();
        await releaseSourceRequestLease(firstDb, first.lease!, 0, 5_000);

        const blocked = await tryAcquireSourceRequestLease(secondDb, sourceKey, 30_000);
        expect(blocked.lease).toBeNull();
        expect(blocked.waitMs).toBeGreaterThan(3_500);
        expect(blocked.waitMs).toBeLessThanOrEqual(5_000);
    });
});
