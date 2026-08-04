import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import type { Database } from '@tt-players/db';
import { storeScrapePayload } from '../extractor.js';
import { loadTTLeaguesData } from '../loader.js';
import {
    recordSourceResourceSuccess,
    upsertSourceInstance,
    upsertSourceResource,
} from '../sources/registry.js';
import { VETTS_ADAPTER_KEY, VETTS_ADAPTER_VERSION } from '../vetts-adapter.js';
import { reconcileVettsDuplicateRubbers } from '../vetts-duplicate-reconciliation.js';
import {
    upsertVettsPlatform,
    upsertVettsResultRows,
    upsertVettsSourceEvent,
} from '../vetts-loader.js';
import { vettsMatchesToParsedData, type VettsMatchResult, type VettsTournamentMetadata } from '../vetts-parser.js';

const { Pool } = pg;
const TEST_DATABASE_NAME = `tt_players_vetts_ingestion_${process.pid}`;
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DATABASE_NAME}`;
const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..', '..');
const dbPackageDirectory = path.resolve(repoRoot, 'packages', 'db');

let db: Kysely<Database>;

async function recreateDatabase(): Promise<void> {
    const pool = new Pool({ connectionString: ADMIN_DATABASE_URL });
    try {
        await pool.query(`
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = $1
              AND pid <> pg_backend_pid()
        `, [TEST_DATABASE_NAME]);
        await pool.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE_NAME}`);
        await pool.query(`CREATE DATABASE ${TEST_DATABASE_NAME}`);
        await pool.query(`ALTER DATABASE ${TEST_DATABASE_NAME} SET search_path TO public, staging`);
    } finally {
        await pool.end();
    }

    const migration = spawnSync('pnpm', ['exec', 'tsx', 'src/migrate.ts'], {
        cwd: dbPackageDirectory,
        env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
        encoding: 'utf8',
        timeout: 120_000,
    });
    if (migration.status !== 0) {
        throw new Error(
            `VETTS test migration failed.\nstdout:\n${migration.stdout}\nstderr:\n${migration.stderr}`,
        );
    }
}

async function dropDatabase(): Promise<void> {
    await db.destroy();
    const pool = new Pool({ connectionString: ADMIN_DATABASE_URL });
    try {
        await pool.query(`
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = $1
              AND pid <> pg_backend_pid()
        `, [TEST_DATABASE_NAME]);
        await pool.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE_NAME}`);
    } finally {
        await pool.end();
    }
}

const metadata: VettsTournamentMetadata = {
    tournamentId: '4af81622-d21a-47ed-a046-86c492b4cfe9',
    sourceUrl: 'https://vetts.tournamentsoftware.com/tournament/4af81622-d21a-47ed-a046-86c492b4cfe9',
    name: 'VETTS Nationals 2026',
    organisation: 'Veterans English Table Tennis Society',
    location: 'Wolverhampton',
    startDate: '2026-05-16',
    endDate: '2026-05-17',
    venueName: 'Aldersley Leisure Village',
    venueAddress: 'Aldersley Road',
    venueTown: 'Wolverhampton',
    venuePostcode: 'WV6 9NW',
    eventCount: 24,
    entryCount: 310,
};

const match: VettsMatchResult = {
    externalId: 'vetts:match:abc-123',
    sourceUrl: `${metadata.sourceUrl}/Matches`,
    eventExternalId: '917',
    eventName: "O70 Men's Singles - Group C 1",
    roundName: 'Round 1',
    roundOrder: 10,
    playedAt: '2026-05-17 08:30:00',
    homePlayers: [{ externalId: 'tournamentsoftware:member:1017', name: 'Alan Pearse' }],
    awayPlayers: [{ externalId: 'tournamentsoftware:member:6797', name: 'Raymond Sutton' }],
    winnerSide: 'home',
    homeGamesWon: 3,
    awayGamesWon: 0,
    gameScores: [
        { home: 13, away: 11 },
        { home: 11, away: 7 },
        { home: 11, away: 9 },
    ],
    outcomeType: 'normal',
    scoreSource: 'games',
    isDoubles: false,
    rawText: 'representative VETTS result row',
};

describe('VETTS ingestion integration', () => {
    beforeAll(async () => {
        await recreateDatabase();
        db = new Kysely<Database>({
            dialect: new PostgresDialect({
                pool: new Pool({ connectionString: TEST_DATABASE_URL }),
            }),
        });
    }, 120_000);

    afterAll(async () => {
        await dropDatabase();
    }, 30_000);

    it('keeps provenance idempotent and exposes only one effective cross-provider rubber', async () => {
        const calendarPlatform = await db
            .insertInto('platforms')
            .values({ name: 'Table Tennis England', base_url: 'https://www.tabletennisengland.co.uk' })
            .returning('id')
            .executeTakeFirstOrThrow();
        const calendarLeague = await db
            .insertInto('leagues')
            .values({
                platform_id: calendarPlatform.id,
                external_id: 'tte-calendar-events',
                name: 'Table Tennis England Competition Events',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        const calendarSeason = await db
            .insertInto('seasons')
            .values({
                league_id: calendarLeague.id,
                external_id: 'tte-events-2025-2026',
                name: 'TTE Events 2025/26',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        const competition = await db
            .insertInto('competitions')
            .values({
                season_id: calendarSeason.id,
                external_id: 'tte:event:vetts-nationals-2026',
                name: metadata.name,
                display_name: metadata.name,
                type: 'individual',
                source: 'tte-calendar',
                start_date: metadata.startDate,
                end_date: metadata.endDate,
                event_status: 'completed',
            })
            .returning('id')
            .executeTakeFirstOrThrow();

        const sport80Platform = await db
            .insertInto('platforms')
            .values({ name: 'Sport:80', base_url: 'https://tabletennisengland.sport80.com' })
            .returning('id')
            .executeTakeFirstOrThrow();
        const canonicalPlayers = await db
            .insertInto('external_players')
            .values([
                { platform_id: sport80Platform.id, external_id: 'sport80:1017', name: 'Alan Pearse' },
                { platform_id: sport80Platform.id, external_id: 'sport80:6797', name: 'Raymond Sutton' },
            ])
            .returning('id')
            .execute();
        const canonicalFixture = await db
            .insertInto('fixtures')
            .values({
                competition_id: competition.id,
                external_id: 'sport80:event:917:2026-05-17',
                date_played: '2026-05-17',
                status: 'completed',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        const canonicalRubber = await db
            .insertInto('rubbers')
            .values({
                fixture_id: canonicalFixture.id,
                external_id: 'sport80:result:abc-123',
                home_player_1_id: canonicalPlayers[0]!.id,
                away_player_1_id: canonicalPlayers[1]!.id,
                home_games_won: 3,
                away_games_won: 0,
                outcome_type: 'normal',
                score_source: 'games',
                played_at: match.playedAt,
            })
            .returning('id')
            .executeTakeFirstOrThrow();

        const vettsPlatformId = await upsertVettsPlatform(db);
        const instance = await upsertSourceInstance(db, {
            platformId: vettsPlatformId,
            key: 'vetts',
            name: 'Veterans English Table Tennis Society',
            baseUrl: 'https://vetts.tournamentsoftware.com',
            adapterKey: VETTS_ADAPTER_KEY,
            config: { organisation: 'VETTS' },
        });
        const resource = await upsertSourceResource(db, {
            sourceInstanceId: instance.id,
            resourceType: 'event-results',
            externalId: `${metadata.tournamentId}:matches`,
            adapterVersion: VETTS_ADAPTER_VERSION,
            competitionId: competition.id,
            publicUrl: match.sourceUrl,
        });
        await recordSourceResourceSuccess(db, resource.id);

        const sourceEventId = await upsertVettsSourceEvent(
            db as Kysely<any>,
            vettsPlatformId,
            competition.id,
            metadata,
        );
        const repeatedSourceEventId = await upsertVettsSourceEvent(
            db as Kysely<any>,
            vettsPlatformId,
            competition.id,
            metadata,
        );
        expect(repeatedSourceEventId).toBe(sourceEventId);

        const logId = await storeScrapePayload(match.sourceUrl, vettsPlatformId, '<html>result page</html>', db);
        const repeatedLogId = await storeScrapePayload(match.sourceUrl, vettsPlatformId, '<html>result page</html>', db);
        expect(repeatedLogId).toBe(logId);

        for (let run = 0; run < 2; run += 1) {
            await upsertVettsResultRows(db as Kysely<any>, sourceEventId, [match]);
            await loadTTLeaguesData(db, {
                competitionId: competition.id,
                platformId: vettsPlatformId,
                parsedData: vettsMatchesToParsedData(metadata, [match]),
                scrapeLogIds: [logId],
            });
            const reconciliation = await reconcileVettsDuplicateRubbers(
                db as Kysely<any>,
                competition.id,
                [match],
            );
            expect(reconciliation).toMatchObject({ linked: 1, conflicts: 0 });
        }

        const sourceEvents = await db
            .selectFrom('staging.source_events')
            .select(sql<number>`count(*)::int`.as('count'))
            .where('source', '=', 'vetts-tournamentsoftware')
            .executeTakeFirstOrThrow();
        const sourceRows = await db
            .selectFrom('staging.source_event_result_rows')
            .select(['canonical_rubber_id', sql<number>`count(*) over ()::int`.as('count')])
            .where('source', '=', 'vetts-tournamentsoftware')
            .execute();
        const vettsPlayers = await db
            .selectFrom('external_players')
            .select(sql<number>`count(*)::int`.as('count'))
            .where('platform_id', '=', vettsPlatformId)
            .executeTakeFirstOrThrow();
        const vettsRubbers = await db
            .selectFrom('rubbers as rubber')
            .innerJoin('fixtures as fixture', 'fixture.id', 'rubber.fixture_id')
            .select(['rubber.id', 'rubber.deleted_at'])
            .where('fixture.competition_id', '=', competition.id)
            .where('rubber.external_id', '=', match.externalId)
            .execute();
        const activeRubbers = await db
            .selectFrom('rubbers as rubber')
            .innerJoin('fixtures as fixture', 'fixture.id', 'rubber.fixture_id')
            .select(sql<number>`count(*)::int`.as('count'))
            .where('fixture.competition_id', '=', competition.id)
            .where('rubber.deleted_at', 'is', null)
            .executeTakeFirstOrThrow();
        const registryRows = await db
            .selectFrom('source_resources')
            .select(['adapter_version', 'last_succeeded_at', 'consecutive_failures'])
            .where('id', '=', resource.id)
            .executeTakeFirstOrThrow();
        const rawLogs = await db
            .selectFrom('staging.raw_scrape_logs')
            .select(['status', sql<number>`count(*) over ()::int`.as('count')])
            .where('endpoint_url', '=', match.sourceUrl)
            .execute();

        expect(sourceEvents.count).toBe(1);
        expect(sourceRows).toHaveLength(1);
        expect(sourceRows[0]).toMatchObject({
            count: 1,
            canonical_rubber_id: canonicalRubber.id,
        });
        expect(vettsPlayers.count).toBe(2);
        expect(vettsRubbers).toHaveLength(1);
        expect(vettsRubbers[0]!.deleted_at).not.toBeNull();
        expect(activeRubbers.count).toBe(1);
        expect(registryRows).toMatchObject({
            adapter_version: VETTS_ADAPTER_VERSION,
            consecutive_failures: 0,
        });
        expect(registryRows.last_succeeded_at).not.toBeNull();
        expect(rawLogs).toHaveLength(1);
        expect(rawLogs[0]).toMatchObject({ count: 1, status: 'processed' });
    }, 120_000);
});
