import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from '@tt-players/db';
import * as m001 from '@tt-players/db/src/migrations/001_create_enums.js';
import * as m002 from '@tt-players/db/src/migrations/002_create_core_tables.js';
import * as m003 from '@tt-players/db/src/migrations/003_create_match_tables.js';
import * as m009 from '@tt-players/db/src/migrations/009_create_regions.js';
import * as m029 from '@tt-players/db/src/migrations/029_create_source_registry.js';
import * as m062 from '@tt-players/db/src/migrations/062_add_source_discovery_lifecycle.js';
import {
    __internal,
    bootstrapNationalTTLeagues,
    type NationalTTLeaguesSource,
} from '../national-ttleagues.js';

const { Pool } = pg;
const TEST_DB_NAME = 'tt_players_national_ttleagues_test';
const TEST_DATABASE_BASE_URL = process.env.TEST_DATABASE_BASE_URL ?? 'postgres://postgres:postgres@localhost:5432';
const ADMIN_DATABASE_URL = `${TEST_DATABASE_BASE_URL}/postgres`;
const TEST_DATABASE_URL = `${TEST_DATABASE_BASE_URL}/${TEST_DB_NAME}`;

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
        await m062.up(db);
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
        expect(firstTargets.map((target) => target.divisionName)).toEqual(expect.arrayContaining([
            'Senior BCL 2025/26 — Premier',
            'Women BCL 2025/26 — Women Premier',
            'Senior BCL 2024/25 — Premier',
        ]));

        for (const request of requests) {
            expect(request.headers.get('Tenant')).toBe('british.ttleagues.com');
            expect(request.headers.get('Entry')).toBe('1');
        }

        const seasons = await db
            .selectFrom('seasons')
            .select(['name', 'is_active'])
            .orderBy('name')
            .execute();
        expect(seasons).toHaveLength(2);
        expect(seasons.filter((season) => season.is_active)).toEqual([
            { name: 'Current national competitions', is_active: true },
        ]);
        expect(seasons).toContainEqual({ name: 'Senior BCL 2024/25', is_active: false });

        expect(await db.selectFrom('leagues').selectAll().execute()).toHaveLength(1);
        expect(await db.selectFrom('competitions').selectAll().execute()).toHaveLength(4);
        expect(await db.selectFrom('regions').selectAll().execute()).toHaveLength(2);
        expect(await db.selectFrom('league_regions').selectAll().execute()).toHaveLength(2);
        expect(await db.selectFrom('source_instances').selectAll().execute()).toHaveLength(1);
        expect(await db.selectFrom('source_resources').selectAll().execute()).toHaveLength(8);

        const sourceInstance = await db
            .selectFrom('source_instances')
            .select(['discovery_status', 'last_discovery_at', 'last_discovery_error'])
            .where('key', '=', TEST_SOURCE.externalId)
            .executeTakeFirstOrThrow();
        expect(sourceInstance.discovery_status).toBe('healthy');
        expect(sourceInstance.last_discovery_at).not.toBeNull();
        expect(sourceInstance.last_discovery_error).toBeNull();

        const resourceLifecycles = await db
            .selectFrom('source_resources')
            .select(['external_id', 'lifecycle'])
            .where('source_instance_id', '=', db
                .selectFrom('source_instances')
                .select('id')
                .where('key', '=', TEST_SOURCE.externalId)
            )
            .execute();
        expect(resourceLifecycles.filter((row) => row.external_id.startsWith('99:'))
            .every((row) => row.lifecycle === 'historical')).toBe(true);
        expect(resourceLifecycles.filter((row) => !row.external_id.startsWith('99:'))
            .every((row) => row.lifecycle === 'active')).toBe(true);

        const secondTargets = await bootstrapNationalTTLeagues(db, {
            includeHistory: true,
            sources: [TEST_SOURCE],
            throwOnError: true,
        });
        expect(secondTargets).toHaveLength(4);
        expect(await db.selectFrom('leagues').selectAll().execute()).toHaveLength(1);
        expect(await db.selectFrom('seasons').selectAll().execute()).toHaveLength(2);
        expect(await db.selectFrom('competitions').selectAll().execute()).toHaveLength(4);
        expect(await db.selectFrom('source_instances').selectAll().execute()).toHaveLength(1);
        expect(await db.selectFrom('source_resources').selectAll().execute()).toHaveLength(8);
    });

    it('preserves the last known resources when a later catalogue is empty', async () => {
        const source: NationalTTLeaguesSource = {
            ...TEST_SOURCE,
            leagueName: 'Safe Empty National Source',
            externalId: 'safe-empty-national-source',
            baseUrl: 'https://safe-empty.ttleagues.com',
            historyMaxCompetitions: 0,
        };
        let catalogueEmpty = false;
        vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
            const url = String(input);
            if (url.endsWith('/competitions')) {
                return jsonResponse(catalogueEmpty ? [] : [{ id: 201, name: '2026/27' }]);
            }
            if (url.endsWith('/competitions/201/divisions')) {
                return jsonResponse([{ id: 2001, name: 'Premier' }]);
            }
            throw new Error(`Unexpected request: ${url}`);
        }));

        const firstTargets = await bootstrapNationalTTLeagues(db, {
            sources: [source],
            throwOnError: true,
        });
        expect(firstTargets).toHaveLength(1);

        const persistedCompetition = await db
            .selectFrom('competitions as competition')
            .innerJoin('seasons as season', 'season.id', 'competition.season_id')
            .innerJoin('leagues as league', 'league.id', 'season.league_id')
            .select(['competition.id', 'competition.deleted_at'])
            .where('league.external_id', '=', source.externalId)
            .where('competition.external_id', '=', '201:2001')
            .executeTakeFirstOrThrow();

        catalogueEmpty = true;
        const secondTargets = await bootstrapNationalTTLeagues(db, {
            sources: [source],
            throwOnError: true,
        });
        expect(secondTargets).toEqual([]);

        const afterCompetition = await db
            .selectFrom('competitions')
            .select(['deleted_at'])
            .where('id', '=', persistedCompetition.id)
            .executeTakeFirstOrThrow();
        expect(afterCompetition.deleted_at).toBeNull();

        const instance = await db
            .selectFrom('source_instances')
            .select(['id', 'discovery_status'])
            .where('key', '=', source.externalId)
            .executeTakeFirstOrThrow();
        expect(instance.discovery_status).toBe('no_active_competition');

        const resources = await db
            .selectFrom('source_resources')
            .select(['enabled', 'lifecycle'])
            .where('source_instance_id', '=', instance.id)
            .execute();
        expect(resources).toHaveLength(2);
        expect(resources.every((resource) => resource.enabled)).toBe(true);
        expect(resources.every((resource) => resource.lifecycle === 'active')).toBe(true);
    });

    it('isolates an unavailable national tenant and persists discovery outcomes', async () => {
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

        const states = await db
            .selectFrom('source_instances')
            .select(['key', 'discovery_status', 'last_discovery_error'])
            .where('key', 'in', ['broken-national-source', 'empty-national-source'])
            .orderBy('key')
            .execute();
        expect(states).toEqual([
            {
                key: 'broken-national-source',
                discovery_status: 'failed',
                last_discovery_error: 'temporary DNS failure',
            },
            {
                key: 'empty-national-source',
                discovery_status: 'no_active_competition',
                last_discovery_error: null,
            },
        ]);
    });
});
