import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from '@tt-players/db';
import * as m001 from '@tt-players/db/src/migrations/001_create_enums.js';
import * as m002 from '@tt-players/db/src/migrations/002_create_core_tables.js';
import * as m003 from '@tt-players/db/src/migrations/003_create_match_tables.js';
import * as m009 from '@tt-players/db/src/migrations/009_create_regions.js';
import * as m029 from '@tt-players/db/src/migrations/029_create_source_registry.js';
import {
    __internal,
    bootstrapNationalTTLeagues,
    type NationalTTLeaguesSource,
} from '../national-ttleagues.js';

const { Pool } = pg;
const TEST_DB_NAME = 'tt_players_national_ttleagues_test';
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

const TEST_SOURCE: NationalTTLeaguesSource = {
    leagueName: 'British Clubs Leagues',
    externalId: 'british-clubs-leagues',
    baseUrl: 'https://british.ttleagues.com',
    regions: ['United Kingdom', 'National'],
    historyMaxCompetitions: 1,
};

let db: Kysely<Database>;

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

function jsonResponse(value: unknown): Response {
    return new Response(JSON.stringify(value), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    });
}

function installApiMock() {
    const requests: Array<{ url: string; headers: Headers }> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, headers: new Headers(init?.headers) });

        if (url.endsWith('/competitions')) {
            return jsonResponse([
                { id: 101, name: 'Senior BCL 2025/26' },
                { id: 102, name: 'Women BCL 2025/26' },
            ]);
        }
        if (url.endsWith('/competitions/archives')) {
            return jsonResponse([
                { id: 99, name: 'Senior BCL 2024/25' },
                { id: 98, name: 'Senior BCL 2023/24' },
            ]);
        }
        if (url.endsWith('/competitions/101/divisions')) {
            return jsonResponse([
                { id: 1001, name: 'Premier' },
                { id: 1002, name: 'Championship' },
            ]);
        }
        if (url.endsWith('/competitions/102/divisions')) {
            return jsonResponse([{ id: 1003, name: 'Women Premier' }]);
        }
        if (url.endsWith('/competitions/99/divisions')) {
            return jsonResponse([{ id: 9901, name: 'Premier' }]);
        }
        throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    return { fetchMock, requests };
}

describe('national TT Leagues bridge discovery', () => {
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
        await m009.up(db);
        await m029.up(db);
    }, 30_000);

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    afterAll(async () => {
        await dropDatabase();
    }, 15_000);

    it('keeps the official national tenant hosts in configuration', () => {
        const sources = __internal.readSources();
        expect(sources).toEqual(expect.arrayContaining([
            expect.objectContaining({
                externalId: 'british-clubs-leagues',
                baseUrl: 'https://british.ttleagues.com',
            }),
            expect.objectContaining({
                externalId: 'county-championships',
                baseUrl: 'https://countychampionships.ttleagues.com',
            }),
        ]));
    });

    it('discovers all active competitions plus bounded history and remains idempotent', async () => {
        const { requests } = installApiMock();

        const firstTargets = await bootstrapNationalTTLeagues(db, {
            includeHistory: true,
            sources: [TEST_SOURCE],
            throwOnError: true,
        });

        expect(firstTargets).toHaveLength(4);
        expect(firstTargets.filter((target) => !target.isHistorical)).toHaveLength(3);
        expect(firstTargets.filter((target) => target.isHistorical)).toHaveLength(1);
        expect(firstTargets.map((target) => target.divisionExtId).sort()).toEqual([
            '1001',
            '1002',
            '1003',
            '9901',
        ]);
        expect(firstTargets.every((target) =>
            target.platformType === 'ttleagues'
            && target.tenantHost === 'british.ttleagues.com'
        )).toBe(true);

        for (const request of requests) {
            expect(request.headers.get('Tenant')).toBe('british.ttleagues.com');
            expect(request.headers.get('Entry')).toBe('1');
        }

        const seasons = await db
            .selectFrom('seasons')
            .select(['name', 'is_active'])
            .orderBy('name')
            .execute();
        expect(seasons).toHaveLength(3);
        expect(seasons.filter((season) => season.is_active)).toHaveLength(2);
        expect(seasons).toContainEqual({ name: 'Senior BCL 2024/25', is_active: false });

        expect(await db.selectFrom('leagues').selectAll().execute()).toHaveLength(1);
        expect(await db.selectFrom('competitions').selectAll().execute()).toHaveLength(4);
        expect(await db.selectFrom('regions').selectAll().execute()).toHaveLength(2);
        expect(await db.selectFrom('league_regions').selectAll().execute()).toHaveLength(2);
        expect(await db.selectFrom('source_instances').selectAll().execute()).toHaveLength(1);
        expect(await db.selectFrom('source_resources').selectAll().execute()).toHaveLength(8);

        const secondTargets = await bootstrapNationalTTLeagues(db, {
            includeHistory: true,
            sources: [TEST_SOURCE],
            throwOnError: true,
        });
        expect(secondTargets).toHaveLength(4);
        expect(await db.selectFrom('leagues').selectAll().execute()).toHaveLength(1);
        expect(await db.selectFrom('seasons').selectAll().execute()).toHaveLength(3);
        expect(await db.selectFrom('competitions').selectAll().execute()).toHaveLength(4);
        expect(await db.selectFrom('source_instances').selectAll().execute()).toHaveLength(1);
        expect(await db.selectFrom('source_resources').selectAll().execute()).toHaveLength(8);
    });

    it('isolates an unavailable national tenant instead of blocking all sources', async () => {
        const warnings: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
            const tenant = new Headers(init?.headers).get('Tenant');
            if (tenant === 'broken.ttleagues.com') {
                throw new Error('temporary DNS failure');
            }
            return jsonResponse([]);
        }));

        const targets = await bootstrapNationalTTLeagues(db, {
            sources: [
                {
                    ...TEST_SOURCE,
                    leagueName: 'Broken National Source',
                    externalId: 'broken-national-source',
                    baseUrl: 'https://broken.ttleagues.com',
                },
                {
                    ...TEST_SOURCE,
                    leagueName: 'Empty National Source',
                    externalId: 'empty-national-source',
                    baseUrl: 'https://empty.ttleagues.com',
                },
            ],
            logger: { warn: (message) => warnings.push(message) },
        });

        expect(targets).toEqual([]);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('Broken National Source');
        expect(warnings[0]).toContain('temporary DNS failure');
    });
});
