import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Kysely, Migrator, PostgresDialect } from 'kysely';
import type { MigrationProvider, Migration } from 'kysely';
import pg from 'pg';

import * as m001 from '@tt-players/db/src/migrations/001_create_enums.js';
import * as m002 from '@tt-players/db/src/migrations/002_create_core_tables.js';
import * as m003 from '@tt-players/db/src/migrations/003_create_match_tables.js';
import * as m004 from '@tt-players/db/src/migrations/004_create_raw_scrape_logs.js';
import * as m005 from '@tt-players/db/src/migrations/005_make_rubber_players_nullable.js';
import * as m006 from '@tt-players/db/src/migrations/006_add_canonical_player_id_to_external_players.js';

import type { Database } from '@tt-players/db';
import type { ScrapeMatchesPayload } from '../tasks/scrapeMatchesTask.js';

const { Pool } = pg;

const TEST_DB_NAME = 'tt_scrape_matches_task_test';
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;
const MATCHES_URL = 'https://ttleagues-api.azurewebsites.net/api/divisions/1632/matches';

class StaticMigrationProvider implements MigrationProvider {
    async getMigrations(): Promise<Record<string, Migration>> {
        return {
            '001_create_enums': m001,
            '002_create_core_tables': m002,
            '003_create_match_tables': m003,
            '004_create_raw_scrape_logs': m004,
            '005_make_rubber_players_nullable': m005,
            '006_add_canonical_player_id_to_external_players': m006,
        };
    }
}

let testDb: Kysely<Database>;
let appDb: Kysely<Database> | null = null;
let scrapeMatchesTask: any;
let platformId: string;
let competitionId: string;

function buildMatch(id: number) {
    return {
        id,
        date: '2026-03-01',
        time: null,
        week: 1,
        name: `Match ${id}`,
        venue: null,
        competitionId: 1,
        divisionId: 1632,
        leagueId: 25,
        hasResults: true,
        manual: false,
        forfeit: null,
        abandoned: null,
        round: null,
        home: {
            id: 100 + id,
            teamId: 10 + id,
            name: `Home ${id}`,
            displayName: `Home ${id}`,
            score: 6,
            clubId: null,
            userId: null,
            members: [],
            reserves: [],
            type: 0,
            points: null,
        },
        away: {
            id: 200 + id,
            teamId: 20 + id,
            name: `Away ${id}`,
            displayName: `Away ${id}`,
            score: 4,
            clubId: null,
            userId: null,
            members: [],
            reserves: [],
            type: 0,
            points: null,
        },
    };
}

async function createTestDatabase(): Promise<void> {
    const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await adminPool.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    await adminPool.end();
}

async function dropTestDatabase(): Promise<void> {
    if (testDb) {
        await testDb.destroy();
    }
    const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await adminPool.query(`
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = '${TEST_DB_NAME}'
          AND pid <> pg_backend_pid()
    `);
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await adminPool.end();
}

function createTestDb(): Kysely<Database> {
    return new Kysely<Database>({
        dialect: new PostgresDialect({
            pool: new Pool({ connectionString: TEST_DATABASE_URL }),
        }),
    });
}

async function runMigrations(db: Kysely<Database>): Promise<void> {
    const migrator = new Migrator({
        db,
        provider: new StaticMigrationProvider(),
    });
    const { error } = await migrator.migrateToLatest();
    if (error) throw error;
}

describe('scrapeMatchesTask optimization', () => {
    beforeAll(async () => {
        await createTestDatabase();
        testDb = createTestDb();
        await runMigrations(testDb);

        const platform = await testDb
            .insertInto('platforms')
            .values({
                name: 'TT Leagues',
                base_url: 'https://ttleagues-api.azurewebsites.net/api',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        platformId = platform.id;

        const league = await testDb
            .insertInto('leagues')
            .values({
                platform_id: platformId,
                external_id: 'chelmsford-ttl',
                name: 'Chelmsford TTL',
            })
            .returning('id')
            .executeTakeFirstOrThrow();

        const season = await testDb
            .insertInto('seasons')
            .values({
                league_id: league.id,
                external_id: '2025-26',
                name: '2025-26',
            })
            .returning('id')
            .executeTakeFirstOrThrow();

        const competition = await testDb
            .insertInto('competitions')
            .values({
                season_id: season.id,
                external_id: '1632',
                name: 'Division 1',
                type: 'league',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        competitionId = competition.id;

        process.env['DATABASE_URL'] = TEST_DATABASE_URL;
        ({ scrapeMatchesTask } = await import('../tasks/scrapeMatchesTask.js'));
        ({ db: appDb } = await import('@tt-players/db'));
    }, 30_000);

    afterAll(async () => {
        if (appDb) {
            await appDb.destroy();
            appDb = null;
        }
        await dropTestDatabase();
    }, 15_000);

    beforeEach(async () => {
        await testDb.deleteFrom('rubbers').execute();
        await testDb.deleteFrom('fixtures').execute();
        await testDb.deleteFrom('raw_scrape_logs').execute();
        vi.restoreAllMocks();
    });

    it('skips sets fetch for recently updated completed fixtures', async () => {
        await testDb
            .insertInto('fixtures')
            .values({
                competition_id: competitionId,
                external_id: '1001',
                status: 'completed',
                updated_at: new Date(),
            })
            .executeTakeFirstOrThrow();

        const matchesJson = {
            groups: [],
            matches: [buildMatch(1001), buildMatch(1002)],
        };

        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: RequestInfo | URL) => {
                const u = String(url);
                if (u === MATCHES_URL) {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => matchesJson,
                    } as Response;
                }
                if (u.endsWith('/matches/1002/sets')) {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => [{ id: 1 }],
                    } as Response;
                }
                throw new Error(`Unexpected fetch URL: ${u}`);
            }),
        );

        const addJob = vi.fn(async () => undefined);
        const payload: ScrapeMatchesPayload = {
            divisionId: '1632',
            tenantHost: 'example.ttleagues.com',
            platformId,
            platformType: 'ttleagues',
            competitionId,
        };

        await scrapeMatchesTask(payload, {
            addJob,
            logger: { info: () => undefined },
        });

        const fetchCalls = vi.mocked(fetch).mock.calls.map((c) => String(c[0]));
        expect(fetchCalls).toContain(MATCHES_URL);
        expect(fetchCalls).toContain('https://ttleagues-api.azurewebsites.net/api/matches/1002/sets');
        expect(fetchCalls).not.toContain('https://ttleagues-api.azurewebsites.net/api/matches/1001/sets');

        const [log] = await testDb
            .selectFrom('raw_scrape_logs')
            .select(['raw_payload'])
            .where('endpoint_url', 'like', '%bundled=matches+sets')
            .execute();
        const bundled = JSON.parse(log.raw_payload) as { sets: Record<string, unknown> };
        expect(Object.keys(bundled.sets)).toEqual(['1002']);

        expect(addJob).toHaveBeenCalledWith(
            'processLogTask',
            expect.objectContaining({ platformType: 'ttleagues-bundle' }),
        );
    });

    it('re-fetches sets for stale completed fixtures', async () => {
        const staleDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
        await testDb
            .insertInto('fixtures')
            .values({
                competition_id: competitionId,
                external_id: '1001',
                status: 'completed',
                updated_at: staleDate,
            })
            .executeTakeFirstOrThrow();

        const matchesJson = {
            groups: [],
            matches: [buildMatch(1001)],
        };

        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: RequestInfo | URL) => {
                const u = String(url);
                if (u === MATCHES_URL) {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => matchesJson,
                    } as Response;
                }
                if (u.endsWith('/matches/1001/sets')) {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => [{ id: 1 }],
                    } as Response;
                }
                throw new Error(`Unexpected fetch URL: ${u}`);
            }),
        );

        const payload: ScrapeMatchesPayload = {
            divisionId: '1632',
            tenantHost: 'example.ttleagues.com',
            platformId,
            platformType: 'ttleagues',
            competitionId,
        };

        await scrapeMatchesTask(payload, {
            addJob: async () => undefined,
            logger: { info: () => undefined },
        });

        const fetchCalls = vi.mocked(fetch).mock.calls.map((c) => String(c[0]));
        expect(fetchCalls).toContain('https://ttleagues-api.azurewebsites.net/api/matches/1001/sets');
    });
});
