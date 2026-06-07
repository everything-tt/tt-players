import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Kysely, Migrator, PostgresDialect, sql } from 'kysely';
import type { MigrationProvider, Migration } from 'kysely';
import { runMigrations, runOnce } from 'graphile-worker';
import pg from 'pg';
import { createHash } from 'node:crypto';

// Import Kysely migrations
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

import type { Database } from '@tt-players/db';

// Import mock data (same mock used by Wave 3 tests)
import mockData from './mock_tt_leagues.json' with { type: 'json' };

const { Pool } = pg;

// ─── Test Database Setup ──────────────────────────────────────────────────────

const TEST_DB_NAME = 'tt_graphile_worker_test';
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

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
        };
    }
}

let testDb: Kysely<Database>;

async function createTestDatabase(): Promise<void> {
    const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await adminPool.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    await adminPool.query(`ALTER DATABASE ${TEST_DB_NAME} SET search_path TO public, staging`);
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

async function runAppMigrations(db: Kysely<Database>): Promise<void> {
    const migrator = new Migrator({
        db,
        provider: new StaticMigrationProvider(),
    });
    const { error } = await migrator.migrateToLatest();
    if (error) throw error;
}

// ─── Mock Response ────────────────────────────────────────────────────────────

// Build a combined JSON payload that matches what processLogTask expects
const COMBINED_PAYLOAD = JSON.stringify({
    standings: mockData.standings,
    matches: mockData.matches,
    sets: mockData.sets,
});

// ─── Seed Data IDs ────────────────────────────────────────────────────────────

let PLATFORM_ID: string;
let LEAGUE_ID: string;
let SEASON_ID: string;
let COMPETITION_ID: string;

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('Wave 4: Graphile Worker Integration', () => {
    beforeAll(async () => {
        // 1. Create the test database
        await createTestDatabase();
        testDb = createTestDb();

        // 2. Run Kysely app migrations (schema tables)
        await runAppMigrations(testDb);

        // 3. Run Graphile Worker migrations (graphile_worker schema)
        await runMigrations({
            connectionString: TEST_DATABASE_URL,
        });

        // 4. Seed the organization hierarchy
        const platform = await testDb
            .insertInto('platforms')
            .values({
                name: 'TT Leagues',
                base_url: 'https://brentwood.ttleagues.com',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        PLATFORM_ID = platform.id;

        const league = await testDb
            .insertInto('leagues')
            .values({
                platform_id: PLATFORM_ID,
                external_id: '25',
                name: 'Brentwood & District League',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        LEAGUE_ID = league.id;

        const season = await testDb
            .insertInto('seasons')
            .values({
                league_id: LEAGUE_ID,
                external_id: '2019-2020',
                name: 'Winter 2019/2020',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        SEASON_ID = season.id;

        const competition = await testDb
            .insertInto('competitions')
            .values({
                season_id: SEASON_ID,
                external_id: '613',
                name: 'Premier Division',
                type: 'league',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        COMPETITION_ID = competition.id;
    }, 60_000);

    afterAll(async () => {
        await dropTestDatabase();
    }, 15_000);

    beforeEach(async () => {
        // Clear job queue + relational data between tests
        await sql`DELETE FROM graphile_worker._private_jobs`.execute(testDb);
        await testDb.deleteFrom('rubbers').execute();
        await testDb.deleteFrom('league_standings').execute();
        await testDb.deleteFrom('fixtures').execute();
        await testDb.deleteFrom('external_players').execute();
        await testDb.deleteFrom('teams').execute();
        await testDb.deleteFrom('raw_scrape_logs').execute();
        vi.restoreAllMocks();
    });

    it('should execute scrapeUrlTask, populate raw_scrape_logs, and chain a processLogTask job', async () => {
        // ── Arrange ──────────────────────────────────────────────────────
        // Mock global fetch to return a valid combined TT Leagues payload
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                text: () => Promise.resolve(COMBINED_PAYLOAD),
            }),
        );

        // Manually insert a scrapeUrlTask job into the Graphile queue
        await sql`
            SELECT graphile_worker.add_job(
                'scrapeUrlTask',
                ${JSON.stringify({
            url: 'https://brentwood.ttleagues.com/api/divisions/1632/data',
            platformId: PLATFORM_ID,
            competitionId: COMPETITION_ID,
        })}::json
            )
        `.execute(testDb);

        // ── Act: Run the worker once (processes scrapeUrlTask) ────────────
        // We need to provide the task list since we're using library mode.
        // Import the tasks dynamically to pick up the mocked fetch.
        const { extractAndStore } = await import('../extractor.js');
        const { parseTTLeaguesData } = await import('../parser.js');
        const { loadTTLeaguesData } = await import('../loader.js');

        await runOnce({
            connectionString: TEST_DATABASE_URL,
            taskList: {
                scrapeUrlTask: async (payload, helpers) => {
                    const { url, platformId, competitionId } = payload as {
                        url: string;
                        platformId: string;
                        competitionId: string;
                    };
                    // Use the test database instead of the default db
                    const logId = await extractAndStore(url, platformId, testDb);
                    await helpers.addJob('processLogTask', {
                        logId,
                        competitionId,
                        platformId,
                    });
                },
                processLogTask: async (payload, helpers) => {
                    const { logId, competitionId, platformId } = payload as {
                        logId: string;
                        competitionId: string;
                        platformId: string;
                    };
                    const log = await testDb
                        .selectFrom('raw_scrape_logs')
                        .select(['id', 'raw_payload', 'status'])
                        .where('id', '=', logId)
                        .executeTakeFirst();
                    if (!log) throw new Error(`Log not found: ${logId}`);
                    if (log.status === 'processed') return;

                    const rawJson = JSON.parse(log.raw_payload);
                    const parsedData = parseTTLeaguesData({
                        standings: rawJson.standings,
                        matches: rawJson.matches,
                        sets: rawJson.sets ?? {},
                    });

                    await loadTTLeaguesData(testDb, {
                        competitionId,
                        platformId,
                        parsedData,
                        scrapeLogIds: [logId],
                    });
                },
            },
        });

        // ── Assert: Phase 1 results ──────────────────────────────────────
        // 1. raw_scrape_logs should have exactly 1 row
        const scrapeLogs = await testDb
            .selectFrom('raw_scrape_logs')
            .selectAll()
            .execute();
        expect(scrapeLogs).toHaveLength(1);
        expect(scrapeLogs[0].endpoint_url).toBe(
            'https://brentwood.ttleagues.com/api/divisions/1632/data',
        );
        expect(scrapeLogs[0].raw_payload).toBe(COMBINED_PAYLOAD);
        expect(scrapeLogs[0].status).toBe('processed');

        // 2. fetch was called exactly once
        expect(vi.mocked(fetch)).toHaveBeenCalledOnce();

        // ── Assert: Phase 2 results (chained processLogTask ran) ─────────
        // The processLogTask should have been picked up by runOnce and processed
        const teams = await testDb.selectFrom('teams').selectAll().execute();
        expect(teams).toHaveLength(3);

        const players = await testDb.selectFrom('external_players').selectAll().execute();
        expect(players).toHaveLength(6);

        const fixtures = await testDb.selectFrom('fixtures').selectAll().execute();
        expect(fixtures).toHaveLength(2);

        const rubbers = await testDb.selectFrom('rubbers').selectAll().execute();
        expect(rubbers).toHaveLength(10);

        const standings = await testDb.selectFrom('league_standings').selectAll().execute();
        expect(standings).toHaveLength(3);

        // 3. Log status should be 'processed'
        const updatedLog = await testDb
            .selectFrom('raw_scrape_logs')
            .select(['id', 'status'])
            .executeTakeFirstOrThrow();
        expect(updatedLog.status).toBe('processed');
    }, 60_000);

    it('should chain: scrapeUrlTask adds a processLogTask to the queue', async () => {
        // ── Arrange ──────────────────────────────────────────────────────
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                text: () => Promise.resolve(COMBINED_PAYLOAD),
            }),
        );

        // Import extractor dynamically
        const { extractAndStore } = await import('../extractor.js');

        // Manually insert a scrapeUrlTask job
        await sql`
            SELECT graphile_worker.add_job(
                'scrapeUrlTask',
                ${JSON.stringify({
            url: 'https://brentwood.ttleagues.com/api/divisions/1632/data',
            platformId: PLATFORM_ID,
            competitionId: COMPETITION_ID,
        })}::json
            )
        `.execute(testDb);

        // ── Act: Run ONLY scrapeUrlTask (processLogTask is a no-op) ──────
        let chainedPayload: unknown = null;

        await runOnce({
            connectionString: TEST_DATABASE_URL,
            taskList: {
                scrapeUrlTask: async (payload, helpers) => {
                    const { url, platformId, competitionId } = payload as {
                        url: string;
                        platformId: string;
                        competitionId: string;
                    };
                    const logId = await extractAndStore(url, platformId, testDb);
                    await helpers.addJob('processLogTask', {
                        logId,
                        competitionId,
                        platformId,
                    });
                },
                processLogTask: async (payload) => {
                    // Capture the payload but don't actually process
                    chainedPayload = payload;
                },
            },
        });

        // ── Assert ───────────────────────────────────────────────────────
        // 1. raw_scrape_logs populated
        const scrapeLogs = await testDb
            .selectFrom('raw_scrape_logs')
            .selectAll()
            .execute();
        expect(scrapeLogs).toHaveLength(1);
        expect(scrapeLogs[0].status).toBe('pending');

        // 2. processLogTask was chained with correct payload
        expect(chainedPayload).toBeTruthy();
        const typed = chainedPayload as {
            logId: string;
            competitionId: string;
            platformId: string;
        };
        expect(typed.logId).toBe(scrapeLogs[0].id);
        expect(typed.competitionId).toBe(COMPETITION_ID);
        expect(typed.platformId).toBe(PLATFORM_ID);
    }, 60_000);
});
