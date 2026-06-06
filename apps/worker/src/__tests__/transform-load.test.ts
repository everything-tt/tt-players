import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Kysely, Migrator, PostgresDialect, sql } from 'kysely';
import type { MigrationProvider, Migration } from 'kysely';
import pg from 'pg';
import { createHash } from 'node:crypto';

// Import migrations so Vitest's TS loader handles them
import * as m001 from '@tt-players/db/src/migrations/001_create_enums.js';
import * as m002 from '@tt-players/db/src/migrations/002_create_core_tables.js';
import * as m003 from '@tt-players/db/src/migrations/003_create_match_tables.js';
import * as m004 from '@tt-players/db/src/migrations/004_create_raw_scrape_logs.js';
import * as m006 from '@tt-players/db/src/migrations/006_add_canonical_player_id_to_external_players.js';
import * as m013 from '@tt-players/db/src/migrations/013_add_rubber_score_source.js';
import * as m015 from '@tt-players/db/src/migrations/015_add_rubber_played_at.js';
import * as m016 from '@tt-players/db/src/migrations/016_create_sport80_event_scrape_state.js';
import * as m017 from '@tt-players/db/src/migrations/017_create_source_event_staging_tables.js';
import * as m018 from '@tt-players/db/src/migrations/018_add_competition_event_display_fields.js';

import type { Database } from '@tt-players/db';

// Import mock data
import mockData from './mock_tt_leagues.json';

const { Pool } = pg;

// ─── Test Database Setup ──────────────────────────────────────────────────────

const TEST_DB_NAME = 'tt_transform_load_test';
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

class StaticMigrationProvider implements MigrationProvider {
    async getMigrations(): Promise<Record<string, Migration>> {
        return {
            '001_create_enums': m001,
            '002_create_core_tables': m002,
            '003_create_match_tables': m003,
            '004_create_raw_scrape_logs': m004,
            '006_add_canonical_player_id_to_external_players': m006,
            '013_add_rubber_score_source': m013,
            '015_add_rubber_played_at': m015,
            '016_create_sport80_event_scrape_state': m016,
            '017_create_source_event_staging_tables': m017,
            '018_add_competition_event_display_fields': m018,
        };
    }
}

let testDb: Kysely<Database>;

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

// ─── Seed Data IDs (set during beforeAll) ─────────────────────────────────────

let PLATFORM_ID: string;
let LEAGUE_ID: string;
let SEASON_ID: string;
let COMPETITION_ID: string;
let SCRAPE_LOG_IDS: string[];

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('Wave 3: Transform & Load (TT Leagues)', () => {
    beforeAll(async () => {
        await createTestDatabase();
        testDb = createTestDb();
        await runMigrations(testDb);

        // Seed the organization hierarchy:
        // platform → league → season → competition
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

        // Seed 3 raw_scrape_logs rows (standings, matches, sets) with status 'pending'
        const standingsPayload = JSON.stringify(mockData.standings);
        const matchesPayload = JSON.stringify(mockData.matches);
        const setsPayload = JSON.stringify(mockData.sets['220789']);

        const logs = await testDb
            .insertInto('raw_scrape_logs')
            .values([
                {
                    platform_id: PLATFORM_ID,
                    endpoint_url: 'https://ttleagues-api.azurewebsites.net/api/divisions/1632/standings',
                    raw_payload: standingsPayload,
                    payload_hash: createHash('sha256').update(standingsPayload).digest('hex'),
                    status: 'pending',
                },
                {
                    platform_id: PLATFORM_ID,
                    endpoint_url: 'https://ttleagues-api.azurewebsites.net/api/divisions/1632/matches',
                    raw_payload: matchesPayload,
                    payload_hash: createHash('sha256').update(matchesPayload).digest('hex'),
                    status: 'pending',
                },
                {
                    platform_id: PLATFORM_ID,
                    endpoint_url: 'https://ttleagues-api.azurewebsites.net/api/matches/220789/sets',
                    raw_payload: setsPayload,
                    payload_hash: createHash('sha256').update(setsPayload).digest('hex'),
                    status: 'pending',
                },
            ])
            .returning('id')
            .execute();

        SCRAPE_LOG_IDS = logs.map((l) => l.id);
    }, 30_000);

    afterAll(async () => {
        await dropTestDatabase();
    }, 15_000);

    // ── Parser Tests ──────────────────────────────────────────────────────────

    describe('parseTTLeaguesData()', () => {
        it('should extract exactly 3 unique teams from standings', async () => {
            const { parseTTLeaguesData } = await import('../parser.js');

            const result = parseTTLeaguesData({
                standings: mockData.standings,
                matches: mockData.matches,
                sets: { '220789': mockData.sets['220789'] },
            });

            expect(result.teams).toHaveLength(3);

            const teamNames = result.teams.map((t) => t.name).sort();
            expect(teamNames).toEqual(['Billericay A', 'Billericay B', 'Billericay C']);
        });

        it('should extract exactly 6 unique players from rubber sets', async () => {
            const { parseTTLeaguesData } = await import('../parser.js');

            const result = parseTTLeaguesData({
                standings: mockData.standings,
                matches: mockData.matches,
                sets: { '220789': mockData.sets['220789'] },
            });

            expect(result.players).toHaveLength(6);

            const playerNames = result.players.map((p) => p.name).sort();
            expect(playerNames).toEqual([
                'Chris Taylor',
                'David Brown',
                'Gary Ward',
                'Mark Johnson',
                'Sam Thompson',
                'Steve Williams',
            ]);
        });

        it('should extract exactly 2 fixtures from matches', async () => {
            const { parseTTLeaguesData } = await import('../parser.js');

            const result = parseTTLeaguesData({
                standings: mockData.standings,
                matches: mockData.matches,
                sets: { '220789': mockData.sets['220789'] },
            });

            expect(result.fixtures).toHaveLength(2);
        });

        it('should derive fixture status correctly (completed vs upcoming)', async () => {
            const { parseTTLeaguesData } = await import('../parser.js');

            const result = parseTTLeaguesData({
                standings: mockData.standings,
                matches: mockData.matches,
                sets: { '220789': mockData.sets['220789'] },
            });

            const completedFixture = result.fixtures.find(
                (f) => f.externalId === '220789',
            );
            const upcomingFixture = result.fixtures.find(
                (f) => f.externalId === '220790',
            );

            expect(completedFixture?.status).toBe('completed');
            expect(upcomingFixture?.status).toBe('upcoming');
        });

        it('should extract exactly 10 rubbers from match sets', async () => {
            const { parseTTLeaguesData } = await import('../parser.js');

            const result = parseTTLeaguesData({
                standings: mockData.standings,
                matches: mockData.matches,
                sets: { '220789': mockData.sets['220789'] },
            });

            expect(result.rubbers).toHaveLength(10);
        });

        it('should skip incomplete set rows with null rubber scores', async () => {
            const { parseTTLeaguesData } = await import('../parser.js');
            const sets = structuredClone(mockData.sets['220789']);
            sets[0].homeScore = null;
            sets[0].awayScore = null;
            sets[0].games = sets[0].games.map((game) => ({
                ...game,
                home: null,
                away: null,
            }));

            const result = parseTTLeaguesData({
                standings: mockData.standings,
                matches: mockData.matches,
                sets: { '220789': sets },
            });

            expect(result.rubbers).toHaveLength(9);
            expect(result.rubbers.some((rubber) => rubber.externalId === String(sets[0].id))).toBe(false);
        });

        it('should detect the doubles rubber (last set with 2 players per side)', async () => {
            const { parseTTLeaguesData } = await import('../parser.js');

            const result = parseTTLeaguesData({
                standings: mockData.standings,
                matches: mockData.matches,
                sets: { '220789': mockData.sets['220789'] },
            });

            const doublesRubber = result.rubbers.find((r) => r.isDoubles);
            expect(doublesRubber).toBeTruthy();
            expect(doublesRubber!.homePlayers).toHaveLength(2);
            expect(doublesRubber!.awayPlayers).toHaveLength(2);

            // Only 1 doubles rubber out of 10
            const doublesCount = result.rubbers.filter((r) => r.isDoubles).length;
            expect(doublesCount).toBe(1);
        });

        it('should extract exactly 3 league standings entries', async () => {
            const { parseTTLeaguesData } = await import('../parser.js');

            const result = parseTTLeaguesData({
                standings: mockData.standings,
                matches: mockData.matches,
                sets: { '220789': mockData.sets['220789'] },
            });

            expect(result.standings).toHaveLength(3);
            expect(result.standings.map((s) => s.position).sort()).toEqual([1, 2, 3]);
        });

        it('should throw on invalid JSON (Zod validation)', async () => {
            const { parseTTLeaguesData } = await import('../parser.js');

            expect(() =>
                parseTTLeaguesData({
                    standings: [{ invalid: 'data' }],
                    matches: mockData.matches,
                    sets: { '220789': mockData.sets['220789'] },
                }),
            ).toThrow();
        });
    });

    // ── Loader Tests ──────────────────────────────────────────────────────────

    describe('loadTTLeaguesData()', () => {
        // Clean relational tables before each loader test (but keep hierarchy + scrape logs)
        beforeEach(async () => {
            await testDb.deleteFrom('rubbers').execute();
            await testDb.deleteFrom('league_standings').execute();
            await testDb.deleteFrom('fixtures').execute();
            await testDb.deleteFrom('external_players').execute();
            await testDb.deleteFrom('teams').execute();

            // Reset scrape log statuses to 'pending'
            await testDb
                .updateTable('raw_scrape_logs')
                .set({ status: 'pending' })
                .execute();
        });

        it('should insert exactly the correct number of rows into each table', async () => {
            const { parseTTLeaguesData } = await import('../parser.js');
            const { loadTTLeaguesData } = await import('../loader.js');

            const parsed = parseTTLeaguesData({
                standings: mockData.standings,
                matches: mockData.matches,
                sets: { '220789': mockData.sets['220789'] },
            });

            await loadTTLeaguesData(testDb, {
                competitionId: COMPETITION_ID,
                platformId: PLATFORM_ID,
                parsedData: parsed,
                scrapeLogIds: SCRAPE_LOG_IDS,
            });

            // Assert row counts
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
        });

        it('should not produce any foreign key errors', async () => {
            const { parseTTLeaguesData } = await import('../parser.js');
            const { loadTTLeaguesData } = await import('../loader.js');

            const parsed = parseTTLeaguesData({
                standings: mockData.standings,
                matches: mockData.matches,
                sets: { '220789': mockData.sets['220789'] },
            });

            // If FK errors occur, this will throw
            await expect(
                loadTTLeaguesData(testDb, {
                    competitionId: COMPETITION_ID,
                    platformId: PLATFORM_ID,
                    parsedData: parsed,
                    scrapeLogIds: SCRAPE_LOG_IDS,
                }),
            ).resolves.not.toThrow();
        });

        it('should be idempotent — running twice produces 0 duplicate rows (UPSERT)', async () => {
            const { parseTTLeaguesData } = await import('../parser.js');
            const { loadTTLeaguesData } = await import('../loader.js');

            const parsed = parseTTLeaguesData({
                standings: mockData.standings,
                matches: mockData.matches,
                sets: { '220789': mockData.sets['220789'] },
            });

            const loadArgs = {
                competitionId: COMPETITION_ID,
                platformId: PLATFORM_ID,
                parsedData: parsed,
                scrapeLogIds: SCRAPE_LOG_IDS,
            };

            // First run
            await loadTTLeaguesData(testDb, loadArgs);

            // Reset scrape logs to pending so second run can process them
            await testDb
                .updateTable('raw_scrape_logs')
                .set({ status: 'pending' })
                .execute();

            // Second run — should UPSERT, not duplicate
            await loadTTLeaguesData(testDb, loadArgs);

            // Assert same row counts as after first run
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
        });

        it('should keep rubbers pointed at source player rows when a canonical link exists', async () => {
            const { parseTTLeaguesData } = await import('../parser.js');
            const { loadTTLeaguesData } = await import('../loader.js');

            const parsed = parseTTLeaguesData({
                standings: mockData.standings,
                matches: mockData.matches,
                sets: { '220789': mockData.sets['220789'] },
            });

            const targetRubber = parsed.rubbers.find((rubber) => rubber.homePlayers[0] && rubber.awayPlayers[0]);
            expect(targetRubber).toBeDefined();

            const sourceExternalId = targetRubber!.homePlayers[0]!;
            const canonicalExternalId = targetRubber!.awayPlayers[0]!;

            const loadArgs = {
                competitionId: COMPETITION_ID,
                platformId: PLATFORM_ID,
                parsedData: parsed,
                scrapeLogIds: SCRAPE_LOG_IDS,
            };

            await loadTTLeaguesData(testDb, loadArgs);

            const sourcePlayer = await testDb
                .selectFrom('external_players')
                .select(['id'])
                .where('platform_id', '=', PLATFORM_ID)
                .where('external_id', '=', sourceExternalId)
                .executeTakeFirstOrThrow();

            const canonicalPlayer = await testDb
                .selectFrom('external_players')
                .select(['id'])
                .where('platform_id', '=', PLATFORM_ID)
                .where('external_id', '=', canonicalExternalId)
                .executeTakeFirstOrThrow();

            await testDb
                .updateTable('external_players')
                .set({
                    canonical_player_id: canonicalPlayer.id,
                    updated_at: new Date(),
                })
                .where('id', '=', sourcePlayer.id)
                .execute();

            await testDb
                .updateTable('raw_scrape_logs')
                .set({ status: 'pending' })
                .execute();

            await loadTTLeaguesData(testDb, loadArgs);

            const reloadedRubber = await testDb
                .selectFrom('rubbers')
                .select(['home_player_1_id'])
                .where('external_id', '=', targetRubber!.externalId)
                .executeTakeFirstOrThrow();

            expect(reloadedRubber.home_player_1_id).toBe(sourcePlayer.id);
            expect(reloadedRubber.home_player_1_id).not.toBe(canonicalPlayer.id);
        });

        it('should update raw_scrape_logs status to "processed" on success', async () => {
            const { parseTTLeaguesData } = await import('../parser.js');
            const { loadTTLeaguesData } = await import('../loader.js');

            const parsed = parseTTLeaguesData({
                standings: mockData.standings,
                matches: mockData.matches,
                sets: { '220789': mockData.sets['220789'] },
            });

            await loadTTLeaguesData(testDb, {
                competitionId: COMPETITION_ID,
                platformId: PLATFORM_ID,
                parsedData: parsed,
                scrapeLogIds: SCRAPE_LOG_IDS,
            });

            const logs = await testDb
                .selectFrom('raw_scrape_logs')
                .select(['id', 'status'])
                .where('id', 'in', SCRAPE_LOG_IDS)
                .execute();

            for (const log of logs) {
                expect(log.status).toBe('processed');
            }
        });

        it('should roll back the entire transaction on failure, leaving scrape logs as "pending"', async () => {
            const { parseTTLeaguesData } = await import('../parser.js');
            const { loadTTLeaguesData } = await import('../loader.js');

            const parsed = parseTTLeaguesData({
                standings: mockData.standings,
                matches: mockData.matches,
                sets: { '220789': mockData.sets['220789'] },
            });

            // Corrupt the parsed data to trigger a DB constraint error
            // by giving a fixture an invalid competition_id (non-existent UUID)
            const corruptedParsed = {
                ...parsed,
                fixtures: parsed.fixtures.map((f) => ({
                    ...f,
                    // This will cause the loader to reference a non-existent competition
                    // We force a bad homeTeamExternalId to trigger an FK violation inside the transaction
                    homeTeamExternalId: 'NON_EXISTENT_TEAM_99999',
                })),
            };

            // The loader should catch the error, set status to 'failed',
            // but the transaction rollback means the relational tables stay empty.
            // We need to verify that if the transaction itself fails, scrape logs
            // don't get marked as processed.
            try {
                await loadTTLeaguesData(testDb, {
                    competitionId: COMPETITION_ID,
                    platformId: PLATFORM_ID,
                    parsedData: corruptedParsed,
                    scrapeLogIds: SCRAPE_LOG_IDS,
                });
            } catch {
                // Expected to throw or fail gracefully
            }

            // Relational tables should be empty (rolled back)
            const fixtures = await testDb.selectFrom('fixtures').selectAll().execute();
            const rubbers = await testDb.selectFrom('rubbers').selectAll().execute();
            expect(fixtures).toHaveLength(0);
            expect(rubbers).toHaveLength(0);

            // Scrape logs should remain 'pending' (transaction rolled back)
            // OR be set to 'failed' (if the loader handles it outside the transaction)
            const logs = await testDb
                .selectFrom('raw_scrape_logs')
                .select(['id', 'status'])
                .where('id', 'in', SCRAPE_LOG_IDS)
                .execute();

            for (const log of logs) {
                // Status should be either 'pending' (if update was inside rolled-back tx)
                // or 'failed' (if loader explicitly sets it after catching the error)
                expect(['pending', 'failed']).toContain(log.status);
                // It must NOT be 'processed'
                expect(log.status).not.toBe('processed');
            }
        });
    });
});
