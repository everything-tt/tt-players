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
import * as m007 from '@tt-players/db/src/migrations/007_add_performance_indexes.js';
import * as m008 from '@tt-players/db/src/migrations/008_create_cache_entries.js';
import * as m009 from '@tt-players/db/src/migrations/009_create_regions.js';
import * as m010 from '@tt-players/db/src/migrations/010_add_performance_indexes_2.js';
import * as m011 from '@tt-players/db/src/migrations/011_add_detail_page_performance_indexes.js';
import * as m012 from '@tt-players/db/src/migrations/012_add_raw_scrape_log_source_url_indexes.js';
import * as m013 from '@tt-players/db/src/migrations/013_add_rubber_score_source.js';
import * as m014 from '@tt-players/db/src/migrations/014_create_ranking_history_tables.js';
import * as m015 from '@tt-players/db/src/migrations/015_add_rubber_played_at.js';
import * as m016 from '@tt-players/db/src/migrations/016_create_sport80_event_scrape_state.js';
import * as m017 from '@tt-players/db/src/migrations/017_create_source_event_staging_tables.js';
import * as m018 from '@tt-players/db/src/migrations/018_add_competition_event_display_fields.js';
import * as m019 from '@tt-players/db/src/migrations/019_add_competition_source_fields.js';
import * as m020 from '@tt-players/db/src/migrations/020_create_staging_schema.js';
import * as m021 from '@tt-players/db/src/migrations/021_create_feedback_table.js';
import * as m029 from '@tt-players/db/src/migrations/029_create_source_registry.js';
import * as m052 from '@tt-players/db/src/migrations/052_add_raw_scrape_log_updated_at.js';
import * as m057 from '@tt-players/db/src/migrations/057_scope_raw_scrape_evidence.js';

import type { Database } from '@tt-players/db';
import type { ScrapeMatchesPayload } from '../tasks/scrapeMatchesTask.js';

const { Pool } = pg;

const TEST_DB_NAME = 'tt_scrape_matches_task_test';
const TEST_DATABASE_BASE_URL = process.env.TEST_DATABASE_BASE_URL ?? 'postgres://postgres:postgres@localhost:5432';
const ADMIN_DATABASE_URL = `${TEST_DATABASE_BASE_URL}/postgres`;
const TEST_DATABASE_URL = `${TEST_DATABASE_BASE_URL}/${TEST_DB_NAME}`;
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
            '007_add_performance_indexes': m007,
            '008_create_cache_entries': m008,
            '009_create_regions': m009,
            '010_add_performance_indexes_2': m010,
            '011_add_detail_page_performance_indexes': m011,
            '012_add_raw_scrape_log_source_url_indexes': m012,
            '013_add_rubber_score_source': m013,
            '014_create_ranking_history_tables': m014,
            '015_add_rubber_played_at': m015,
            '016_create_sport80_event_scrape_state': m016,
            '017_create_source_event_staging_tables': m017,
            '018_add_competition_event_display_fields': m018,
            '019_add_competition_source_fields': m019,
            '020_create_staging_schema': m020,
            '021_create_feedback_table': m021,
            '029_create_source_registry': m029,
            '052_add_raw_scrape_log_updated_at': m052,
            '057_scope_raw_scrape_evidence': m057,
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
    await adminPool.query(`ALTER DATABASE ${TEST_DB_NAME} SET search_path TO public, staging`);
    await adminPool.end();
}

async function dropTestDatabase(): Promise<void> {
    if (testDb) await testDb.destroy();
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
    const migrator = new Migrator({ db, provider: new StaticMigrationProvider() });
    const { error } = await migrator.migrateToLatest();
    if (error) throw error;
}

describe('scrapeMatchesTask batching', () => {
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

    it('queues only missing result sets when a completed fixture is fresh', async () => {
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
        vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
            if (String(url) !== MATCHES_URL) throw new Error(`Unexpected fetch URL: ${url}`);
            return { ok: true, status: 200, json: async () => matchesJson } as Response;
        }));

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

        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
        expect(vi.mocked(fetch)).toHaveBeenCalledWith(MATCHES_URL, expect.anything());
        expect(addJob).toHaveBeenNthCalledWith(
            1,
            'processLogTask',
            expect.objectContaining({ platformType: 'ttleagues-bundle' }),
            expect.objectContaining({
                maxAttempts: 3,
                jobKeyMode: 'unsafe_dedupe',
            }),
        );
        expect(addJob).toHaveBeenNthCalledWith(
            2,
            'scrapeMatchSetsBatchTask',
            [
                expect.objectContaining({
                    divisionId: '1632',
                    competitionId,
                    match: expect.objectContaining({ id: 1002 }),
                }),
            ],
            expect.objectContaining({
                maxAttempts: 3,
                jobKeyMode: 'unsafe_dedupe',
                jobKey: expect.stringMatching(/^ttleagues-set-batch:/),
            }),
        );

        const log = await testDb
            .selectFrom('raw_scrape_logs')
            .select(['raw_payload'])
            .where('endpoint_url', 'like', '%snapshot=fixtures')
            .executeTakeFirstOrThrow();
        const snapshot = JSON.parse(log.raw_payload) as {
            matches: { matches: Array<{ id: number }> };
            sets: Record<string, unknown>;
        };
        expect(snapshot.matches.matches.map(({ id }) => id)).toEqual([1001, 1002]);
        expect(snapshot.sets).toEqual({});
    });

    it('queues stale completed fixtures for bounded result fetching', async () => {
        await testDb
            .insertInto('fixtures')
            .values({
                competition_id: competitionId,
                external_id: '1001',
                status: 'completed',
                updated_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
            })
            .executeTakeFirstOrThrow();

        const matchesJson = { groups: [], matches: [buildMatch(1001)] };
        vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
            if (String(url) !== MATCHES_URL) throw new Error(`Unexpected fetch URL: ${url}`);
            return { ok: true, status: 200, json: async () => matchesJson } as Response;
        }));

        const addJob = vi.fn(async () => undefined);
        await scrapeMatchesTask({
            divisionId: '1632',
            tenantHost: 'example.ttleagues.com',
            platformId,
            platformType: 'ttleagues',
            competitionId,
        } satisfies ScrapeMatchesPayload, {
            addJob,
            logger: { info: () => undefined },
        });

        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
        expect(addJob).toHaveBeenNthCalledWith(
            2,
            'scrapeMatchSetsBatchTask',
            [
                expect.objectContaining({
                    match: expect.objectContaining({ id: 1001 }),
                }),
            ],
            expect.objectContaining({
                maxAttempts: 3,
                jobKeyMode: 'unsafe_dedupe',
            }),
        );
    });
});
