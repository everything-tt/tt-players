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
import * as m058 from '@tt-players/db/src/migrations/058_create_raw_scrape_evidence_dependencies.js';

import type { Database } from '@tt-players/db';
import type { ProcessLogPayload } from '../tasks/processLogTask.js';

const { Pool } = pg;
const TEST_DB_NAME = 'tt_tt365_process_log_test';
const TEST_DATABASE_BASE_URL = process.env.TEST_DATABASE_BASE_URL
    ?? 'postgres://postgres:postgres@localhost:5432';
const ADMIN_DATABASE_URL = `${TEST_DATABASE_BASE_URL}/postgres`;
const TEST_DATABASE_URL = `${TEST_DATABASE_BASE_URL}/${TEST_DB_NAME}`;

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
            '058_create_raw_scrape_evidence_dependencies': m058,
        };
    }
}

let testDb: Kysely<Database>;
let appDb: Kysely<Database> | null = null;
let platformId: string;
let competitionId: string;
let processLogTask: any;

const fixturesHtml = readFileSync(
    join(import.meta.dirname, 'fixtures', 'tt365_fixtures.html'),
    'utf-8',
);
const matchCardHtml = readFileSync(
    join(import.meta.dirname, 'fixtures', 'tt365_matchcard.html'),
    'utf-8',
);

const fallbackMatchCardHtml = `
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
    <table><tbody>
      <tr>
        <td class="homePlayer"><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Gary_Ward/395890">Gary Ward</a></td>
        <td class="awayPlayer"><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Indrit_Bajraktari/400934">Indrit Bajraktari</a></td>
        <td class="games"><span class="game">7-11</span><span class="game">8-11</span><span class="game">6-11</span></td>
        <td class="score">0-1</td>
      </tr>
      <tr>
        <td class="homePlayer"><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Darren_Holmes/395892">Darren Holmes</a></td>
        <td class="awayPlayer"><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Peter_Levy/400935">Peter Levy</a></td>
        <td class="games"><span class="game">9-11</span><span class="game">7-11</span><span class="game">8-11</span></td>
        <td class="score">0-1</td>
      </tr>
      <tr class="foot">
        <td class="auth" colspan="3">Submitted By: Gary Ward :: Approved By: Gary Ward</td>
        <td class="result">0 - 2</td>
      </tr>
    </tbody></table>
  </div>
</div>
`;

const walkoverOnlyMatchCardHtml = `
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
    <table><tbody>
      <tr>
        <td class="homePlayer"><span class="playerName">Forfeit</span></td>
        <td class="awayPlayer"><a href="/Southend/Results/Player/Statistics/Winter_League_22-23/Dave_Hancox/337501">Dave Hancox</a></td>
        <td class="games"><span class="game">6-11</span><span class="game">8-11</span><span class="game">4-11</span></td>
        <td class="score">0-1</td>
      </tr>
      <tr>
        <td class="homePlayer"><span class="playerName">Forfeit</span></td>
        <td class="awayPlayer"><a href="/Southend/Results/Player/Statistics/Winter_League_22-23/Russell_Bright/337496">Russell Bright</a></td>
        <td class="games"><span class="game">7-11</span><span class="game">4-11</span><span class="game">8-11</span></td>
        <td class="score">0-1</td>
      </tr>
      <tr class="foot"><td colspan="3">Submitted By: Example</td><td class="result">1 - 1</td></tr>
    </tbody></table>
  </div>
</div>
`;

function statsHtml(
    playerExternalId: string,
    matchExternalId: string,
    date: string,
): string {
    if (playerExternalId === '395890') {
        return `<table><tbody><tr>
          <td><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Indrit_Bajraktari/400934">Indrit Bajraktari</a></td>
          <td></td><td>Navestock A</td><td><time datetime="${date}">${date}</time></td>
          <td><span class="game">11-8</span><span class="game">11-7</span><span class="game">9-11</span><span class="game">11-9</span></td>
          <td class="right"><a href="/Brentwood/Results/Winter_2025/Premier_Division/MatchCard/${matchExternalId}">Win</a></td>
        </tr></tbody></table>`;
    }
    if (playerExternalId === '395892') {
        return `<table><tbody><tr>
          <td><a href="/Brentwood/Results/Player/Statistics/Winter_2025/Peter_Levy/400935">Peter Levy</a></td>
          <td></td><td>Billericay A</td><td><time datetime="${date}">${date}</time></td>
          <td><span class="game">9-11</span><span class="game">7-11</span><span class="game">8-11</span></td>
          <td class="right"><a href="/Brentwood/Results/Winter_2025/Premier_Division/MatchCard/${matchExternalId}">Loss</a></td>
        </tr></tbody></table>`;
    }
    return '<table><tbody></tbody></table>';
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
        dialect: new PostgresDialect({ pool: new Pool({ connectionString: TEST_DATABASE_URL }) }),
    });
}

async function runMigrations(db: Kysely<Database>): Promise<void> {
    const migrator = new Migrator({ db, provider: new StaticMigrationProvider() });
    const { error } = await migrator.migrateToLatest();
    if (error) throw error;
}

async function insertRaw(url: string, body: string): Promise<{ id: string }> {
    return testDb
        .insertInto('raw_scrape_logs')
        .values({
            platform_id: platformId,
            endpoint_url: url,
            raw_payload: body,
            payload_hash: createHash('sha256').update(body).digest('hex'),
            status: 'pending',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
}

type QueuedEvidence = {
    url: string;
    playerExternalId: string;
    parentLogId: string;
    evidenceRequirementKey: string;
    matchExternalId: string;
};

async function stageQueuedEvidence(
    queue: ReturnType<typeof vi.fn>,
    date: string,
): Promise<void> {
    const queued = (queue.mock.calls as unknown[][])
        .filter((call) => call[0] === 'scrapeUrlTask')
        .map((call) => call[1] as QueuedEvidence);

    expect(queued.length).toBeGreaterThan(0);
    for (const evidence of queued) {
        const body = statsHtml(
            evidence.playerExternalId,
            evidence.matchExternalId,
            date,
        );
        const log = await insertRaw(evidence.url, body);
        await processLogTask({
            logId: log.id,
            competitionId,
            platformId,
            platformType: 'tt365',
            tt365DataType: 'playerstats',
            matchExternalId: evidence.matchExternalId,
            playerExternalId: evidence.playerExternalId,
            parentLogId: evidence.parentLogId,
            evidenceRequirementKey: evidence.evidenceRequirementKey,
        }, {
            addJob: async () => undefined,
            logger: { info: () => undefined },
        });
    }
}

describe('processLogTask TT365 modes', () => {
    beforeAll(async () => {
        await createTestDatabase();
        testDb = createTestDb();
        await runMigrations(testDb);

        const platform = await testDb
            .insertInto('platforms')
            .values({ name: 'TableTennis365', base_url: 'https://www.tabletennis365.com' })
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
            .values({ league_id: league.id, external_id: 'winter-2025', name: 'Winter 2025' })
            .returning('id')
            .executeTakeFirstOrThrow();
        competitionId = (await testDb
            .insertInto('competitions')
            .values({
                season_id: season.id,
                external_id: 'premier_division',
                name: 'Premier Division',
                type: 'league',
            })
            .returning('id')
            .executeTakeFirstOrThrow()).id;

        process.env['DATABASE_URL'] = TEST_DATABASE_URL;
        ({ processLogTask } = await import('../tasks/processLogTask.js'));
        ({ db: appDb } = await import('@tt-players/db'));
    }, 30_000);

    afterAll(async () => {
        if (appDb) await appDb.destroy();
        await dropTestDatabase();
    }, 15_000);

    beforeEach(async () => {
        vi.restoreAllMocks();
        await testDb.deleteFrom('rubbers').execute();
        await testDb.deleteFrom('league_standings').execute();
        await testDb.deleteFrom('fixtures').execute();
        await testDb.deleteFrom('external_players').execute();
        await testDb.deleteFrom('teams').execute();
        await testDb.deleteFrom('raw_scrape_logs').execute();
    });

    it('queues unique TT365 match-card scrape jobs from a fixtures page', async () => {
        const url = 'https://www.tabletennis365.com/Brentwood/Fixtures/Winter_2025/Premier_Division';
        const log = await insertRaw(url, fixturesHtml);
        const addJob = vi.fn(async () => undefined);

        await processLogTask({
            logId: log.id,
            competitionId,
            platformId,
            platformType: 'tt365',
            tt365DataType: 'fixtures',
        } satisfies ProcessLogPayload, { addJob, logger: { info: () => undefined } });

        expect(addJob).toHaveBeenCalledTimes(2);
        expect(addJob).toHaveBeenNthCalledWith(
            1,
            'scrapeUrlTask',
            expect.objectContaining({ tt365DataType: 'matchcard', matchExternalId: '448193' }),
            { maxAttempts: 1 },
        );
        expect(addJob).toHaveBeenNthCalledWith(
            2,
            'scrapeUrlTask',
            expect.objectContaining({ tt365DataType: 'matchcard', matchExternalId: '448195' }),
            { maxAttempts: 1 },
        );
    });

    it('skips queueing fresh completed fixtures that already exist', async () => {
        await testDb.insertInto('fixtures').values({
            competition_id: competitionId,
            external_id: '448193',
            status: 'completed',
            updated_at: new Date(),
        }).execute();
        const log = await insertRaw(
            'https://www.tabletennis365.com/Brentwood/Fixtures/Winter_2025/Premier_Division',
            fixturesHtml,
        );
        const addJob = vi.fn(async () => undefined);

        await processLogTask({
            logId: log.id,
            competitionId,
            platformId,
            platformType: 'tt365',
            tt365DataType: 'fixtures',
        }, { addJob, logger: { info: () => undefined } });

        expect(addJob).toHaveBeenCalledTimes(1);
        expect(addJob).toHaveBeenCalledWith(
            'scrapeUrlTask',
            expect.objectContaining({ matchExternalId: '448195' }),
            { maxAttempts: 1 },
        );
    });

    it('loads valid TT365 match-card data without requesting fallback evidence', async () => {
        const log = await insertRaw(
            'https://www.tabletennis365.com/Brentwood/Results/Winter_2025/Premier_Division/MatchCard/458829',
            matchCardHtml,
        );
        const addJob = vi.fn(async () => undefined);
        await processLogTask({
            logId: log.id,
            competitionId,
            platformId,
            platformType: 'tt365',
            tt365DataType: 'matchcard',
            matchExternalId: '458829',
        }, { addJob, logger: { info: () => undefined } });

        expect(await testDb.selectFrom('fixtures').selectAll().execute()).toHaveLength(1);
        expect(await testDb.selectFrom('rubbers').selectAll().execute()).toHaveLength(10);
        expect(await testDb.selectFrom('external_players').selectAll().execute()).toHaveLength(5);
        expect(await testDb.selectFrom('teams').selectAll().execute()).toHaveLength(2);
        expect(addJob).not.toHaveBeenCalled();
    });

    it('stages, pins and replays player-stat evidence without transform network I/O', async () => {
        const matchExternalId = '900004';
        const log = await insertRaw(
            `https://www.tabletennis365.com/Brentwood/Results/Winter_2025/Premier_Division/MatchCard/${matchExternalId}`,
            fallbackMatchCardHtml,
        );
        const network = vi.fn(() => {
            throw new Error('transform must not perform network I/O');
        });
        vi.stubGlobal('fetch', network);
        const addJob = vi.fn(async () => undefined);

        await processLogTask({
            logId: log.id,
            competitionId,
            platformId,
            platformType: 'tt365',
            tt365DataType: 'matchcard',
            matchExternalId,
        }, { addJob, logger: { info: () => undefined } });

        expect(network).not.toHaveBeenCalled();
        expect((addJob.mock.calls as unknown[][]).every((call) => call[0] === 'scrapeUrlTask')).toBe(true);
        const waiting = await testDb
            .selectFrom('raw_scrape_logs')
            .select('status')
            .where('id', '=', log.id)
            .executeTakeFirstOrThrow();
        expect(waiting.status).toBe('pending');

        await stageQueuedEvidence(addJob, '2025-10-23');
        const dependencies = await (testDb as Kysely<any>)
            .selectFrom('staging.raw_scrape_evidence_dependencies')
            .select(['status', 'evidence_log_id'])
            .where('parent_log_id', '=', log.id)
            .execute();
        expect(dependencies).toHaveLength(4);
        expect(dependencies.every((dependency: any) =>
            dependency.status === 'processed' && dependency.evidence_log_id !== null
        )).toBe(true);

        await processLogTask({
            logId: log.id,
            competitionId,
            platformId,
            platformType: 'tt365',
            tt365DataType: 'matchcard',
            matchExternalId,
        }, { addJob: async () => undefined, logger: { info: () => undefined } });

        const rubbers = await testDb
            .selectFrom('rubbers')
            .select(['home_games_won', 'away_games_won'])
            .orderBy('external_id')
            .execute();
        expect(rubbers).toHaveLength(2);
        expect(rubbers[0]).toMatchObject({ home_games_won: 3, away_games_won: 1 });
        expect(rubbers[1]).toMatchObject({ home_games_won: 0, away_games_won: 3 });
        expect(network).not.toHaveBeenCalled();
    });

    it('fails deterministically when pinned player-stat evidence does not match fixture date', async () => {
        const matchExternalId = '900002';
        const log = await insertRaw(
            `https://www.tabletennis365.com/Brentwood/Results/Winter_2025/Premier_Division/MatchCard/${matchExternalId}`,
            fallbackMatchCardHtml,
        );
        const addJob = vi.fn(async () => undefined);
        await processLogTask({
            logId: log.id,
            competitionId,
            platformId,
            platformType: 'tt365',
            tt365DataType: 'matchcard',
            matchExternalId,
        }, { addJob, logger: { info: () => undefined } });
        await stageQueuedEvidence(addJob, '2025-10-24');

        await processLogTask({
            logId: log.id,
            competitionId,
            platformId,
            platformType: 'tt365',
            tt365DataType: 'matchcard',
            matchExternalId,
        }, { addJob: async () => undefined, logger: { info: () => undefined } });

        expect(await testDb.selectFrom('fixtures').selectAll().execute()).toHaveLength(0);
        const failed = await testDb
            .selectFrom('raw_scrape_logs')
            .select('status')
            .where('id', '=', log.id)
            .executeTakeFirstOrThrow();
        expect(failed.status).toBe('failed');
    });

    it('bypasses staged fallback for walkover-only match cards', async () => {
        const log = await insertRaw(
            'https://www.tabletennis365.com/Southend/Results/Winter_League_22-23/Division_1/MatchCard/901000',
            walkoverOnlyMatchCardHtml,
        );
        const addJob = vi.fn(async () => undefined);
        await processLogTask({
            logId: log.id,
            competitionId,
            platformId,
            platformType: 'tt365',
            tt365DataType: 'matchcard',
            matchExternalId: '901000',
        }, { addJob, logger: { info: () => undefined } });

        expect(addJob).not.toHaveBeenCalled();
        const rubbers = await testDb
            .selectFrom('rubbers')
            .select(['outcome_type'])
            .execute();
        expect(rubbers).toHaveLength(2);
        expect(rubbers.every((rubber) => rubber.outcome_type === 'walkover')).toBe(true);
    });

    it('keeps unlinked TT365 player-stat logs as compatibility no-ops', async () => {
        const body = statsHtml('395890', '458829', '2026-04-13');
        const log = await insertRaw(
            'https://www.tabletennis365.com/Brentwood/Results/Player/Statistics/Winter_2025/Gary_Ward/395890',
            body,
        );
        const addJob = vi.fn(async () => undefined);
        await processLogTask({
            logId: log.id,
            competitionId,
            platformId,
            platformType: 'tt365',
            tt365DataType: 'playerstats',
            matchExternalId: '458829',
            playerExternalId: '395890',
        }, { addJob, logger: { info: () => undefined } });

        expect(addJob).not.toHaveBeenCalled();
        const processed = await testDb
            .selectFrom('raw_scrape_logs')
            .select('status')
            .where('id', '=', log.id)
            .executeTakeFirstOrThrow();
        expect(processed.status).toBe('processed');
    });
});
