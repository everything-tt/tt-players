import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Kysely, Migrator, PostgresDialect } from 'kysely';
import type { MigrationProvider, Migration } from 'kysely';
import pg from 'pg';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

import * as m001 from '@tt-players/db/src/migrations/001_create_enums.js';
import * as m002 from '@tt-players/db/src/migrations/002_create_core_tables.js';
import * as m003 from '@tt-players/db/src/migrations/003_create_match_tables.js';
import * as m004 from '@tt-players/db/src/migrations/004_create_raw_scrape_logs.js';
import * as m005 from '@tt-players/db/src/migrations/005_make_rubber_players_nullable.js';
import * as m006 from '@tt-players/db/src/migrations/006_add_canonical_player_id_to_external_players.js';
import * as m013 from '@tt-players/db/src/migrations/013_add_rubber_score_source.js';
import * as m015 from '@tt-players/db/src/migrations/015_add_rubber_played_at.js';
import * as m016 from '@tt-players/db/src/migrations/016_create_sport80_event_scrape_state.js';
import * as m017 from '@tt-players/db/src/migrations/017_create_source_event_staging_tables.js';

import type { Database } from '@tt-players/db';
import type { ProcessLogPayload } from '../tasks/processLogTask.js';

const { Pool } = pg;

const TEST_DB_NAME = 'tt_tt365_process_log_test';
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
            '013_add_rubber_score_source': m013,
            '015_add_rubber_played_at': m015,
            '016_create_sport80_event_scrape_state': m016,
            '017_create_source_event_staging_tables': m017,
        };
    }
}

let testDb: Kysely<Database>;
let platformId: string;
let competitionId: string;
let processLogTask: any;
let resetTT365PlayerStatsCacheForTests: (() => void) | null = null;
let appDb: Kysely<Database> | null = null;

const fixturesHtml = readFileSync(
    join(import.meta.dirname, 'fixtures', 'tt365_fixtures.html'),
    'utf-8',
);
const matchCardHtml = readFileSync(
    join(import.meta.dirname, 'fixtures', 'tt365_matchcard.html'),
    'utf-8',
);
const playerStatsHtmlFor458829 = `
<table>
  <tbody>
    <tr>
      <td><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Bajraktari_Indrit/400934">Bajraktari Indrit</a></td>
      <td></td>
      <td>Navestock A</td>
      <td><time datetime="2026-04-13">13/04/2026</time></td>
      <td><span class="game">11-8</span><span class="game">9-11</span><span class="game">11-7</span><span class="game">11-9</span></td>
      <td class="right"><a href="/Brentwood/Results/Winter_2025/Premier_Division/MatchCard/458829">Win</a></td>
    </tr>
  </tbody>
</table>
`;

const tt365InconsistentMatchCardHtml = `
<div id="PublicMatchCardTypeA">
  <div id="CardSummary" class="divStyle">
    <div class="teamNames">
      <a href="/Brentwood/Results/Team/Statistics/Winter_2025/Premier_Division/Brentwood_A">Brentwood A</a>
      <span>v</span>
      <a href="/Brentwood/Results/Team/Statistics/Winter_2025/Premier_Division/Billericay_A">Billericay A</a>
    </div>
    <div>Match Date: <time datetime="2025-10-23">23 Oct 2025</time></div>
  </div>
  <div id="CardResults" class="tableStyle">
    <table>
      <tbody>
        <tr>
          <td class="homePlayer"><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Gary_Ward/395890">Gary Ward</a></td>
          <td class="awayPlayer"><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Indrit_Bajraktari/400934">Indrit Bajraktari</a></td>
          <td class="games">
            <span class="game">7-11</span>
            <span class="game">8-11</span>
            <span class="game">6-11</span>
          </td>
          <td class="score">0-1</td>
        </tr>
        <tr>
          <td class="homePlayer"><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Darren_Holmes/395892">Darren Holmes</a></td>
          <td class="awayPlayer"><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Peter_Levy/400935">Peter Levy</a></td>
          <td class="games">
            <span class="game">9-11</span>
            <span class="game">7-11</span>
            <span class="game">8-11</span>
          </td>
          <td class="score">0-1</td>
        </tr>
        <tr class="foot">
          <td class="auth" colspan="3">Submitted By: Gary Ward :: Approved By: Gary Ward :: Completed By: Gary Ward</td>
          <td class="result">1 - 1</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
`;

const tt365ImpossibleScoreMatchCardHtml = `
<div id="PublicMatchCardTypeA">
  <div id="CardSummary" class="divStyle">
    <div class="teamNames">
      <a href="/Brentwood/Results/Team/Statistics/Winter_2025/Premier_Division/Brentwood_A">Brentwood A</a>
      <span>v</span>
      <a href="/Brentwood/Results/Team/Statistics/Winter_2025/Premier_Division/Billericay_A">Billericay A</a>
    </div>
    <div>Match Date: <time datetime="2025-10-23">23 Oct 2025</time></div>
  </div>
  <div id="CardResults" class="tableStyle">
    <table>
      <tbody>
        <tr>
          <td class="homePlayer"><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Gary_Ward/395890">Gary Ward</a></td>
          <td class="awayPlayer"><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Indrit_Bajraktari/400934">Indrit Bajraktari</a></td>
          <td class="games">
            <span class="game">11-8</span>
            <span class="game">11-9</span>
            <span class="game">11-7</span>
            <span class="game">11-6</span>
          </td>
          <td class="score">1-0</td>
        </tr>
        <tr>
          <td class="homePlayer"><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Darren_Holmes/395892">Darren Holmes</a></td>
          <td class="awayPlayer"><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Peter_Levy/400935">Peter Levy</a></td>
          <td class="games">
            <span class="game">9-11</span>
            <span class="game">7-11</span>
            <span class="game">8-11</span>
          </td>
          <td class="score">0-1</td>
        </tr>
        <tr class="foot">
          <td class="auth" colspan="3">Submitted By: Gary Ward :: Approved By: Gary Ward :: Completed By: Gary Ward</td>
          <td class="result">1 - 1</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
`;

const tt365ImpossibleWrongFooterMatchCardHtml = `
<div id="PublicMatchCardTypeA">
  <div id="CardSummary" class="divStyle">
    <div class="teamNames">
      <a href="/Brentwood/Results/Team/Statistics/Winter_2025/Premier_Division/Brentwood_A">Brentwood A</a>
      <span>v</span>
      <a href="/Brentwood/Results/Team/Statistics/Winter_2025/Premier_Division/Billericay_A">Billericay A</a>
    </div>
    <div>Match Date: <time datetime="2025-10-23">23 Oct 2025</time></div>
  </div>
  <div id="CardResults" class="tableStyle">
    <table>
      <tbody>
        <tr>
          <td class="homePlayer"><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Gary_Ward/395890">Gary Ward</a></td>
          <td class="awayPlayer"><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Indrit_Bajraktari/400934">Indrit Bajraktari</a></td>
          <td class="games">
            <span class="game">11-8</span>
            <span class="game">11-9</span>
            <span class="game">11-7</span>
            <span class="game">11-6</span>
          </td>
          <td class="score">1-0</td>
        </tr>
        <tr>
          <td class="homePlayer"><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Darren_Holmes/395892">Darren Holmes</a></td>
          <td class="awayPlayer"><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Peter_Levy/400935">Peter Levy</a></td>
          <td class="games">
            <span class="game">9-11</span>
            <span class="game">7-11</span>
            <span class="game">8-11</span>
          </td>
          <td class="score">0-1</td>
        </tr>
        <tr class="foot">
          <td class="auth" colspan="3">Submitted By: Gary Ward :: Approved By: Gary Ward :: Completed By: Gary Ward</td>
          <td class="result">0 - 2</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
`;

const tt365WalkoverOnlyInconsistentMatchCardHtml = `
<div id="PublicMatchCardTypeA">
  <div id="CardSummary" class="divStyle">
    <div class="teamNames">
      <a href="/Southend/Results/Team/Statistics/Winter_League_22-23/Division_1/Rawreth_D">Rawreth D</a>
      <span>v</span>
      <a href="/Southend/Results/Team/Statistics/Winter_League_22-23/Division_1/Stanford_A">Stanford A</a>
    </div>
    <div>Match Date: <time datetime="2023-03-14">14 Mar 2023</time></div>
  </div>
  <div id="CardResults" class="tableStyle">
    <table>
      <tbody>
        <tr>
          <td class="homePlayer">
            <div class="players">
              <span class="player"><span class="playerName">Forfeit</span></span>
            </div>
          </td>
          <td class="awayPlayer">
            <div class="players winner">
              <span class="player"><span class="playerName"><a href="/Southend/Results/Player/Statistics/Winter_League_22-23/Dave_Hancox/337501">Dave Hancox</a></span></span>
            </div>
          </td>
          <td class="games">
            <span class="game">6-11</span>
            <span class="game">8-11</span>
            <span class="game">4-11</span>
          </td>
          <td class="score">0-1</td>
        </tr>
        <tr>
          <td class="homePlayer">
            <div class="players">
              <span class="player"><span class="playerName">Forfeit</span></span>
            </div>
          </td>
          <td class="awayPlayer">
            <div class="players winner">
              <span class="player"><span class="playerName"><a href="/Southend/Results/Player/Statistics/Winter_League_22-23/Russell_Bright/337496">Russell Bright</a></span></span>
            </div>
          </td>
          <td class="games">
            <span class="game">7-11</span>
            <span class="game">4-11</span>
            <span class="game">8-11</span>
          </td>
          <td class="score">0-1</td>
        </tr>
        <tr class="foot">
          <td class="auth" colspan="3">Submitted By: Example :: Approved By: Example :: Completed By: Example</td>
          <td class="result">1 - 1</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
`;

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

describe('processLogTask TT365 modes', () => {
    beforeAll(async () => {
        await createTestDatabase();
        testDb = createTestDb();
        await runMigrations(testDb);

        const platform = await testDb
            .insertInto('platforms')
            .values({
                name: 'TableTennis365',
                base_url: 'https://www.tabletennis365.com',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        platformId = platform.id;

        const league = await testDb
            .insertInto('leagues')
            .values({
                platform_id: platformId,
                external_id: 'brentwood-tt365',
                name: 'Brentwood & District TTL',
            })
            .returning('id')
            .executeTakeFirstOrThrow();

        const season = await testDb
            .insertInto('seasons')
            .values({
                league_id: league.id,
                external_id: 'winter-2025',
                name: 'Winter 2025',
            })
            .returning('id')
            .executeTakeFirstOrThrow();

        const competition = await testDb
            .insertInto('competitions')
            .values({
                season_id: season.id,
                external_id: 'premier_division',
                name: 'Premier Division',
                type: 'league',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        competitionId = competition.id;

        process.env['DATABASE_URL'] = TEST_DATABASE_URL;
        ({
            processLogTask,
            __resetTT365PlayerStatsCacheForTests: resetTT365PlayerStatsCacheForTests,
        } = await import('../tasks/processLogTask.js'));
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
        vi.restoreAllMocks();
        resetTT365PlayerStatsCacheForTests?.();
        await testDb.deleteFrom('rubbers').execute();
        await testDb.deleteFrom('league_standings').execute();
        await testDb.deleteFrom('fixtures').execute();
        await testDb.deleteFrom('external_players').execute();
        await testDb.deleteFrom('teams').execute();
        await testDb.deleteFrom('raw_scrape_logs').execute();
    });

    it('queues unique TT365 match-card scrape jobs from a fixtures page', async () => {
        const fixturesUrl =
            'https://www.tabletennis365.com/Brentwood/Fixtures/Winter_2025/Premier_Division';
        const [log] = await testDb
            .insertInto('raw_scrape_logs')
            .values({
                platform_id: platformId,
                endpoint_url: fixturesUrl,
                raw_payload: fixturesHtml,
                payload_hash: createHash('sha256').update(fixturesHtml).digest('hex'),
                status: 'pending',
            })
            .returning('id')
            .execute();

        const addJob = vi.fn(async () => undefined);
        const payload: ProcessLogPayload = {
            logId: log.id,
            competitionId,
            platformId,
            platformType: 'tt365',
            tt365DataType: 'fixtures',
        };

        await processLogTask(payload, {
            addJob,
            logger: { info: () => undefined },
        });

        expect(addJob).toHaveBeenCalledTimes(2);
        expect(addJob).toHaveBeenNthCalledWith(
            1,
            'scrapeUrlTask',
            expect.objectContaining({
                competitionId,
                platformId,
                platformType: 'tt365',
                tt365DataType: 'matchcard',
                matchExternalId: '448193',
            }),
            { maxAttempts: 1 },
        );
        expect(addJob).toHaveBeenNthCalledWith(
            2,
            'scrapeUrlTask',
            expect.objectContaining({
                competitionId,
                platformId,
                platformType: 'tt365',
                tt365DataType: 'matchcard',
                matchExternalId: '448195',
            }),
            { maxAttempts: 1 },
        );

        const updated = await testDb
            .selectFrom('raw_scrape_logs')
            .select(['status'])
            .where('id', '=', log.id)
            .executeTakeFirstOrThrow();
        expect(updated.status).toBe('processed');
    });

    it('skips queueing fresh completed fixtures that already exist', async () => {
        const fixturesUrl =
            'https://www.tabletennis365.com/Brentwood/Fixtures/Winter_2025/Premier_Division';

        // Existing completed fixture for 448193 should be treated as fresh and skipped.
        await testDb
            .insertInto('fixtures')
            .values({
                competition_id: competitionId,
                external_id: '448193',
                status: 'completed',
                updated_at: new Date(),
            })
            .executeTakeFirstOrThrow();

        const [log] = await testDb
            .insertInto('raw_scrape_logs')
            .values({
                platform_id: platformId,
                endpoint_url: fixturesUrl,
                raw_payload: fixturesHtml,
                payload_hash: createHash('sha256').update(fixturesHtml).digest('hex'),
                status: 'pending',
            })
            .returning('id')
            .execute();

        const addJob = vi.fn(async () => undefined);
        const payload: ProcessLogPayload = {
            logId: log.id,
            competitionId,
            platformId,
            platformType: 'tt365',
            tt365DataType: 'fixtures',
        };

        await processLogTask(payload, {
            addJob,
            logger: { info: () => undefined },
        });

        // 448193 skipped as fresh, 448195 queued.
        expect(addJob).toHaveBeenCalledTimes(1);
        expect(addJob).toHaveBeenCalledWith(
            'scrapeUrlTask',
            expect.objectContaining({
                tt365DataType: 'matchcard',
                matchExternalId: '448195',
            }),
            { maxAttempts: 1 },
        );
    });

    it('loads TT365 match-card data into fixtures, rubbers, players and teams', async () => {
        const matchCardUrl =
            'https://www.tabletennis365.com/Brentwood/Results/Winter_2025/Premier_Division/MatchCard/458829';
        const [log] = await testDb
            .insertInto('raw_scrape_logs')
            .values({
                platform_id: platformId,
                endpoint_url: matchCardUrl,
                raw_payload: matchCardHtml,
                payload_hash: createHash('sha256').update(matchCardHtml).digest('hex'),
                status: 'pending',
            })
            .returning('id')
            .execute();

        const payload: ProcessLogPayload = {
            logId: log.id,
            competitionId,
            platformId,
            platformType: 'tt365',
            tt365DataType: 'matchcard',
            matchExternalId: '458829',
        };

        const addJob = vi.fn(async () => undefined);
        await processLogTask(payload, {
            addJob,
            logger: { info: () => undefined },
        });

        const fixtures = await testDb.selectFrom('fixtures').selectAll().execute();
        expect(fixtures).toHaveLength(1);
        expect(fixtures[0].external_id).toBe('458829');
        expect(fixtures[0].status).toBe('completed');

        const rubbers = await testDb.selectFrom('rubbers').selectAll().execute();
        expect(rubbers).toHaveLength(10);

        const players = await testDb.selectFrom('external_players').selectAll().execute();
        expect(players).toHaveLength(5);

        const teams = await testDb.selectFrom('teams').selectAll().execute();
        expect(teams).toHaveLength(2);

        // Match-card processing should not queue player statistics jobs anymore.
        expect(addJob).not.toHaveBeenCalled();

        const updated = await testDb
            .selectFrom('raw_scrape_logs')
            .select(['status'])
            .where('id', '=', log.id)
            .executeTakeFirstOrThrow();
        expect(updated.status).toBe('processed');
    });

    it('uses player-stats fallback when the match-card payload is inconsistent', async () => {
        const matchCardUrl =
            'https://www.tabletennis365.com/Brentwood/Results/Winter_2025/Premier_Division/MatchCard/900001';

        const [currentLog] = await testDb
            .insertInto('raw_scrape_logs')
            .values({
                platform_id: platformId,
                endpoint_url: matchCardUrl,
                raw_payload: tt365InconsistentMatchCardHtml,
                payload_hash: createHash('sha256').update(tt365InconsistentMatchCardHtml).digest('hex'),
                status: 'pending',
            })
            .returning('id')
            .execute();

        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
            const url = typeof input === 'string'
                ? input
                : input instanceof URL
                    ? input.toString()
                    : String(input?.url ?? '');

            if (url.includes('/Gary_Ward/395890')) {
                return new Response(`
                    <table><tbody><tr>
                      <td><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Indrit_Bajraktari/400934">Indrit Bajraktari</a></td>
                      <td></td><td>Navestock A</td>
                      <td><time datetime="2025-10-23">23/10/2025</time></td>
                      <td><span class="game">11-8</span><span class="game">11-7</span><span class="game">9-11</span><span class="game">11-9</span></td>
                      <td class="right"><a href="/Brentwood/Results/Winter_2025/Premier_Division/MatchCard/900001">Win</a></td>
                    </tr></tbody></table>
                `, { status: 200 });
            }

            if (url.includes('/Darren_Holmes/395892')) {
                return new Response(`
                    <table><tbody><tr>
                      <td><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Peter_Levy/400935">Peter Levy</a></td>
                      <td></td><td>Billericay A</td>
                      <td><time datetime="2025-10-23">23/10/2025</time></td>
                      <td><span class="game">9-11</span><span class="game">7-11</span><span class="game">8-11</span></td>
                      <td class="right"><a href="/Brentwood/Results/Winter_2025/Premier_Division/MatchCard/900001">Loss</a></td>
                    </tr></tbody></table>
                `, { status: 200 });
            }

            return new Response('<table><tbody></tbody></table>', { status: 200 });
        });

        await processLogTask({
            logId: currentLog.id,
            competitionId,
            platformId,
            platformType: 'tt365',
            tt365DataType: 'matchcard',
            matchExternalId: '900001',
        }, {
            addJob: async () => undefined,
            logger: { info: () => undefined },
        });

        const rubbers = await testDb
            .selectFrom('rubbers')
            .select(['home_games_won', 'away_games_won'])
            .orderBy('external_id')
            .execute();

        expect(rubbers).toHaveLength(2);
        expect(rubbers[0]).toMatchObject({ home_games_won: 3, away_games_won: 1 });
        expect(rubbers[1]).toMatchObject({ home_games_won: 0, away_games_won: 3 });

        const processedLog = await testDb
            .selectFrom('raw_scrape_logs')
            .select(['status'])
            .where('id', '=', currentLog.id)
            .executeTakeFirstOrThrow();
        expect(processedLog.status).toBe('processed');
    });

    it('falls back when a match-card has impossible game scores even if footer totals are consistent', async () => {
        const matchCardUrl =
            'https://www.tabletennis365.com/Brentwood/Results/Winter_2025/Premier_Division/MatchCard/900003';

        const [currentLog] = await testDb
            .insertInto('raw_scrape_logs')
            .values({
                platform_id: platformId,
                endpoint_url: matchCardUrl,
                raw_payload: tt365ImpossibleScoreMatchCardHtml,
                payload_hash: createHash('sha256').update(tt365ImpossibleScoreMatchCardHtml).digest('hex'),
                status: 'pending',
            })
            .returning('id')
            .execute();

        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
            const url = typeof input === 'string'
                ? input
                : input instanceof URL
                    ? input.toString()
                    : String(input?.url ?? '');

            if (url.includes('/Gary_Ward/395890')) {
                return new Response(`
                    <table><tbody><tr>
                      <td><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Indrit_Bajraktari/400934">Indrit Bajraktari</a></td>
                      <td></td><td>Navestock A</td>
                      <td><time datetime="2025-10-23">23/10/2025</time></td>
                      <td><span class="game">11-8</span><span class="game">11-7</span><span class="game">11-9</span></td>
                      <td class="right"><a href="/Brentwood/Results/Winter_2025/Premier_Division/MatchCard/900003">Win</a></td>
                    </tr></tbody></table>
                `, { status: 200 });
            }

            if (url.includes('/Darren_Holmes/395892')) {
                return new Response(`
                    <table><tbody><tr>
                      <td><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Peter_Levy/400935">Peter Levy</a></td>
                      <td></td><td>Billericay A</td>
                      <td><time datetime="2025-10-23">23/10/2025</time></td>
                      <td><span class="game">9-11</span><span class="game">7-11</span><span class="game">8-11</span></td>
                      <td class="right"><a href="/Brentwood/Results/Winter_2025/Premier_Division/MatchCard/900003">Loss</a></td>
                    </tr></tbody></table>
                `, { status: 200 });
            }

            return new Response('<table><tbody></tbody></table>', { status: 200 });
        });

        await processLogTask({
            logId: currentLog.id,
            competitionId,
            platformId,
            platformType: 'tt365',
            tt365DataType: 'matchcard',
            matchExternalId: '900003',
        }, {
            addJob: async () => undefined,
            logger: { info: () => undefined },
        });

        const rubbers = await testDb
            .selectFrom('rubbers')
            .select(['home_games_won', 'away_games_won'])
            .orderBy('external_id')
            .execute();

        expect(rubbers).toHaveLength(2);
        expect(rubbers[0]).toMatchObject({ home_games_won: 3, away_games_won: 0 });
        expect(rubbers[1]).toMatchObject({ home_games_won: 0, away_games_won: 3 });

        const processedLog = await testDb
            .selectFrom('raw_scrape_logs')
            .select(['status'])
            .where('id', '=', currentLog.id)
            .executeTakeFirstOrThrow();
        expect(processedLog.status).toBe('processed');
    });

    it('trusts player-stats fallback even when footer remains inconsistent', async () => {
        const matchCardUrl =
            'https://www.tabletennis365.com/Brentwood/Results/Winter_2025/Premier_Division/MatchCard/900004';

        const [currentLog] = await testDb
            .insertInto('raw_scrape_logs')
            .values({
                platform_id: platformId,
                endpoint_url: matchCardUrl,
                raw_payload: tt365ImpossibleWrongFooterMatchCardHtml,
                payload_hash: createHash('sha256').update(tt365ImpossibleWrongFooterMatchCardHtml).digest('hex'),
                status: 'pending',
            })
            .returning('id')
            .execute();

        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
            const url = typeof input === 'string'
                ? input
                : input instanceof URL
                    ? input.toString()
                    : String(input?.url ?? '');

            if (url.includes('/Gary_Ward/395890')) {
                return new Response(`
                    <table><tbody><tr>
                      <td><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Indrit_Bajraktari/400934">Indrit Bajraktari</a></td>
                      <td></td><td>Navestock A</td>
                      <td><time datetime="2025-10-23">23/10/2025</time></td>
                      <td><span class="game">11-8</span><span class="game">11-7</span><span class="game">11-9</span></td>
                      <td class="right"><a href="/Brentwood/Results/Winter_2025/Premier_Division/MatchCard/900004">Win</a></td>
                    </tr></tbody></table>
                `, { status: 200 });
            }

            if (url.includes('/Darren_Holmes/395892')) {
                return new Response(`
                    <table><tbody><tr>
                      <td><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Peter_Levy/400935">Peter Levy</a></td>
                      <td></td><td>Billericay A</td>
                      <td><time datetime="2025-10-23">23/10/2025</time></td>
                      <td><span class="game">9-11</span><span class="game">7-11</span><span class="game">8-11</span></td>
                      <td class="right"><a href="/Brentwood/Results/Winter_2025/Premier_Division/MatchCard/900004">Loss</a></td>
                    </tr></tbody></table>
                `, { status: 200 });
            }

            return new Response('<table><tbody></tbody></table>', { status: 200 });
        });

        await processLogTask({
            logId: currentLog.id,
            competitionId,
            platformId,
            platformType: 'tt365',
            tt365DataType: 'matchcard',
            matchExternalId: '900004',
        }, {
            addJob: async () => undefined,
            logger: { info: () => undefined },
        });

        const rubbers = await testDb
            .selectFrom('rubbers')
            .select(['home_games_won', 'away_games_won'])
            .orderBy('external_id')
            .execute();

        expect(rubbers).toHaveLength(2);
        expect(rubbers[0]).toMatchObject({ home_games_won: 3, away_games_won: 0 });
        expect(rubbers[1]).toMatchObject({ home_games_won: 0, away_games_won: 3 });

        const processedLog = await testDb
            .selectFrom('raw_scrape_logs')
            .select(['status'])
            .where('id', '=', currentLog.id)
            .executeTakeFirstOrThrow();
        expect(processedLog.status).toBe('processed');
    });

    it('bypasses strict consistency failure for walkover-only match cards', async () => {
        const matchCardUrl =
            'https://www.tabletennis365.com/Southend/Results/Winter_League_22-23/Division_1/MatchCard/901000';

        const [currentLog] = await testDb
            .insertInto('raw_scrape_logs')
            .values({
                platform_id: platformId,
                endpoint_url: matchCardUrl,
                raw_payload: tt365WalkoverOnlyInconsistentMatchCardHtml,
                payload_hash: createHash('sha256').update(tt365WalkoverOnlyInconsistentMatchCardHtml).digest('hex'),
                status: 'pending',
            })
            .returning('id')
            .execute();

        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('<table><tbody></tbody></table>', { status: 200 }),
        );

        await processLogTask({
            logId: currentLog.id,
            competitionId,
            platformId,
            platformType: 'tt365',
            tt365DataType: 'matchcard',
            matchExternalId: '901000',
        }, {
            addJob: async () => undefined,
            logger: { info: () => undefined },
        });

        const rubbers = await testDb
            .selectFrom('rubbers')
            .select(['home_games_won', 'away_games_won', 'outcome_type'])
            .orderBy('external_id')
            .execute();

        expect(rubbers).toHaveLength(2);
        expect(rubbers[0]).toMatchObject({
            home_games_won: 0,
            away_games_won: 3,
            outcome_type: 'walkover',
        });
        expect(rubbers[1]).toMatchObject({
            home_games_won: 0,
            away_games_won: 3,
            outcome_type: 'walkover',
        });

        const processedLog = await testDb
            .selectFrom('raw_scrape_logs')
            .select(['status'])
            .where('id', '=', currentLog.id)
            .executeTakeFirstOrThrow();
        expect(processedLog.status).toBe('processed');
    });

    it('marks inconsistent TT365 match-card payload as failed when player-stats rows do not match fixture date', async () => {
        const matchCardUrl =
            'https://www.tabletennis365.com/Brentwood/Results/Winter_2025/Premier_Division/MatchCard/900002';

        const [currentLog] = await testDb
            .insertInto('raw_scrape_logs')
            .values({
                platform_id: platformId,
                endpoint_url: matchCardUrl,
                raw_payload: tt365InconsistentMatchCardHtml,
                payload_hash: createHash('sha256').update(tt365InconsistentMatchCardHtml).digest('hex'),
                status: 'pending',
            })
            .returning('id')
            .execute();

        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
            const url = typeof input === 'string'
                ? input
                : input instanceof URL
                    ? input.toString()
                    : String(input?.url ?? '');

            if (url.includes('/Gary_Ward/395890')) {
                return new Response(`
                    <table><tbody><tr>
                      <td><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Indrit_Bajraktari/400934">Indrit Bajraktari</a></td>
                      <td></td><td>Navestock A</td>
                      <td><time datetime="2025-10-24">24/10/2025</time></td>
                      <td><span class="game">11-8</span><span class="game">11-7</span><span class="game">9-11</span><span class="game">11-9</span></td>
                      <td class="right"><a href="/Brentwood/Results/Winter_2025/Premier_Division/MatchCard/900002">Win</a></td>
                    </tr></tbody></table>
                `, { status: 200 });
            }

            if (url.includes('/Darren_Holmes/395892')) {
                return new Response(`
                    <table><tbody><tr>
                      <td><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Peter_Levy/400935">Peter Levy</a></td>
                      <td></td><td>Billericay A</td>
                      <td><time datetime="2025-10-24">24/10/2025</time></td>
                      <td><span class="game">9-11</span><span class="game">7-11</span><span class="game">8-11</span></td>
                      <td class="right"><a href="/Brentwood/Results/Winter_2025/Premier_Division/MatchCard/900002">Loss</a></td>
                    </tr></tbody></table>
                `, { status: 200 });
            }

            return new Response('<table><tbody></tbody></table>', { status: 200 });
        });

        await processLogTask({
            logId: currentLog.id,
            competitionId,
            platformId,
            platformType: 'tt365',
            tt365DataType: 'matchcard',
            matchExternalId: '900002',
        }, {
            addJob: async () => undefined,
            logger: { info: () => undefined },
        });

        const fixtureCount = await testDb
            .selectFrom('fixtures')
            .select((eb) => eb.fn.countAll<string>().as('count'))
            .executeTakeFirstOrThrow();
        expect(Number.parseInt(fixtureCount.count, 10)).toBe(0);

        const failedLog = await testDb
            .selectFrom('raw_scrape_logs')
            .select(['status'])
            .where('id', '=', currentLog.id)
            .executeTakeFirstOrThrow();
        expect(failedLog.status).toBe('failed');
    });

    it('processes TT365 player-stats logs as no-op for compatibility', async () => {
        const matchCardUrl =
            'https://www.tabletennis365.com/Brentwood/Results/Winter_2025/Premier_Division/MatchCard/458829';
        const [matchCardLog] = await testDb
            .insertInto('raw_scrape_logs')
            .values({
                platform_id: platformId,
                endpoint_url: matchCardUrl,
                raw_payload: matchCardHtml,
                payload_hash: createHash('sha256').update(matchCardHtml).digest('hex'),
                status: 'pending',
            })
            .returning('id')
            .execute();

        await processLogTask({
            logId: matchCardLog.id,
            competitionId,
            platformId,
            platformType: 'tt365',
            tt365DataType: 'matchcard',
            matchExternalId: '458829',
        }, {
            addJob: async () => undefined,
            logger: { info: () => undefined },
        });

        const playerA = await testDb
            .selectFrom('external_players')
            .select(['id'])
            .where('platform_id', '=', platformId)
            .where('external_id', '=', '395890')
            .executeTakeFirstOrThrow();
        const playerB = await testDb
            .selectFrom('external_players')
            .select(['id'])
            .where('platform_id', '=', platformId)
            .where('external_id', '=', '400934')
            .executeTakeFirstOrThrow();
        const fixture = await testDb
            .selectFrom('fixtures')
            .select(['id'])
            .where('competition_id', '=', competitionId)
            .where('external_id', '=', '458829')
            .executeTakeFirstOrThrow();

        await testDb
            .updateTable('rubbers')
            .set({
                home_games_won: 0,
                away_games_won: 3,
            })
            .where('fixture_id', '=', fixture.id)
            .where('home_player_1_id', '=', playerA.id)
            .where('away_player_1_id', '=', playerB.id)
            .execute();

        const [playerStatsLog] = await testDb
            .insertInto('raw_scrape_logs')
            .values({
                platform_id: platformId,
                endpoint_url: 'https://www.tabletennis365.com/Brentwood/Results/Player/Statistics/Winter_2025/Gary_Ward/395890',
                raw_payload: playerStatsHtmlFor458829,
                payload_hash: createHash('sha256').update(playerStatsHtmlFor458829).digest('hex'),
                status: 'pending',
            })
            .returning('id')
            .execute();

        await processLogTask({
            logId: playerStatsLog.id,
            competitionId,
            platformId,
            platformType: 'tt365',
            tt365DataType: 'playerstats',
            matchExternalId: '458829',
            playerExternalId: '395890',
        }, {
            addJob: async () => undefined,
            logger: { info: () => undefined },
        });

        const unchangedRubber = await testDb
            .selectFrom('rubbers')
            .select(['home_games_won', 'away_games_won'])
            .where('fixture_id', '=', fixture.id)
            .where('home_player_1_id', '=', playerA.id)
            .where('away_player_1_id', '=', playerB.id)
            .executeTakeFirstOrThrow();

        expect(unchangedRubber.home_games_won).toBe(0);
        expect(unchangedRubber.away_games_won).toBe(3);

        const processedLog = await testDb
            .selectFrom('raw_scrape_logs')
            .select(['status'])
            .where('id', '=', playerStatsLog.id)
            .executeTakeFirstOrThrow();
        expect(processedLog.status).toBe('processed');
    });
});
