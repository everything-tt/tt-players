import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, Migrator, PostgresDialect } from 'kysely';
import type { Migration, MigrationProvider } from 'kysely';
import pg from 'pg';

import * as m001 from '@tt-players/db/src/migrations/001_create_enums.js';
import * as m002 from '@tt-players/db/src/migrations/002_create_core_tables.js';
import type { Database } from '@tt-players/db';
import {
    SPORT80_PLATFORM_BASE_URL,
    upsertSport80League,
    upsertSport80Platform,
    upsertSport80Season,
} from '../sport80-loader.js';
import {
    VETTS_PLATFORM_BASE_URL,
    upsertVettsLeague,
    upsertVettsPlatform,
    upsertVettsSeason,
} from '../vetts-loader.js';

const { Pool } = pg;
const TEST_DB_NAME = 'tt_source_bootstrap_concurrency_test';
const BASE = process.env.TEST_DATABASE_BASE_URL ?? 'postgres://postgres:postgres@localhost:5432';
const ADMIN_URL = `${BASE}/postgres`;
const TEST_URL = `${BASE}/${TEST_DB_NAME}`;

class Provider implements MigrationProvider {
    async getMigrations(): Promise<Record<string, Migration>> {
        return {
            '001_create_enums': m001,
            '002_create_core_tables': m002,
        };
    }
}

let database: Kysely<Database>;

async function concurrentIds(factory: () => Promise<string>): Promise<string[]> {
    return Promise.all(Array.from({ length: 12 }, () => factory()));
}

describe('source bootstrap concurrency', () => {
    beforeAll(async () => {
        const admin = new Pool({ connectionString: ADMIN_URL });
        await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
        await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
        await admin.end();

        database = new Kysely<Database>({
            dialect: new PostgresDialect({ pool: new Pool({ connectionString: TEST_URL, max: 16 }) }),
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

    it('serializes Sport80 platform creation and atomically upserts league/season', async () => {
        const platformIds = await concurrentIds(() => upsertSport80Platform(database));
        expect(new Set(platformIds).size).toBe(1);

        const platformId = platformIds[0];
        const leagueIds = await concurrentIds(() => upsertSport80League(database, platformId));
        expect(new Set(leagueIds).size).toBe(1);

        const seasonIds = await concurrentIds(() =>
            upsertSport80Season(database, leagueIds[0], '2026-08-16'),
        );
        expect(new Set(seasonIds).size).toBe(1);

        const platformCount = await database.selectFrom('platforms')
            .select((eb) => eb.fn.countAll<string>().as('count'))
            .where('base_url', '=', SPORT80_PLATFORM_BASE_URL)
            .executeTakeFirstOrThrow();
        expect(Number(platformCount.count)).toBe(1);
    });

    it('serializes VETTS platform creation and atomically upserts league/season', async () => {
        const platformIds = await concurrentIds(() => upsertVettsPlatform(database));
        expect(new Set(platformIds).size).toBe(1);

        const platformId = platformIds[0];
        const leagueIds = await concurrentIds(() => upsertVettsLeague(database, platformId));
        expect(new Set(leagueIds).size).toBe(1);

        const seasonIds = await concurrentIds(() =>
            upsertVettsSeason(database, leagueIds[0], '2026-08-16'),
        );
        expect(new Set(seasonIds).size).toBe(1);

        const platformCount = await database.selectFrom('platforms')
            .select((eb) => eb.fn.countAll<string>().as('count'))
            .where('base_url', '=', VETTS_PLATFORM_BASE_URL)
            .executeTakeFirstOrThrow();
        expect(Number(platformCount.count)).toBe(1);
    });
});
