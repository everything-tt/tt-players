import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Kysely, Migrator, PostgresDialect } from 'kysely';
import type { Migration, MigrationProvider } from 'kysely';
import pg from 'pg';
import { createHash } from 'node:crypto';

import * as m001 from '@tt-players/db/src/migrations/001_create_enums.js';
import * as m002 from '@tt-players/db/src/migrations/002_create_core_tables.js';
import * as m003 from '@tt-players/db/src/migrations/003_create_match_tables.js';
import * as m004 from '@tt-players/db/src/migrations/004_create_raw_scrape_logs.js';
import * as m005 from '@tt-players/db/src/migrations/005_make_rubber_players_nullable.js';
import * as m006 from '@tt-players/db/src/migrations/006_add_canonical_player_id_to_external_players.js';
import * as m013 from '@tt-players/db/src/migrations/013_add_rubber_score_source.js';
import * as m014 from '@tt-players/db/src/migrations/014_create_ranking_history_tables.js';
import * as m015 from '@tt-players/db/src/migrations/015_add_rubber_played_at.js';
import * as m016 from '@tt-players/db/src/migrations/016_create_sport80_event_scrape_state.js';
import * as m017 from '@tt-players/db/src/migrations/017_create_source_event_staging_tables.js';
import * as m020 from '@tt-players/db/src/migrations/020_create_staging_schema.js';
import * as m052 from '@tt-players/db/src/migrations/052_add_raw_scrape_log_updated_at.js';
import type { Database } from '@tt-players/db';
import type { ParsedTTLeaguesData } from '../parser.js';
import { loadTTLeaguesData } from '../loader.js';

const { Pool } = pg;
const TEST_DB_NAME = 'tt_loader_concurrency_test';
const BASE = process.env.TEST_DATABASE_BASE_URL ?? 'postgres://postgres:postgres@localhost:5432';
const ADMIN_URL = `${BASE}/postgres`;
const TEST_URL = `${BASE}/${TEST_DB_NAME}`;

class Provider implements MigrationProvider {
    async getMigrations(): Promise<Record<string, Migration>> {
        return {
            '001_create_enums': m001,
            '002_create_core_tables': m002,
            '003_create_match_tables': m003,
            '004_create_raw_scrape_logs': m004,
            '005_make_rubber_players_nullable': m005,
            '006_add_canonical_player_id_to_external_players': m006,
            '013_add_rubber_score_source': m013,
            '014_create_ranking_history_tables': m014,
            '015_add_rubber_played_at': m015,
            '016_create_sport80_event_scrape_state': m016,
            '017_create_source_event_staging_tables': m017,
            '020_create_staging_schema': m020,
            '052_add_raw_scrape_log_updated_at': m052,
        };
    }
}

let database: Kysely<Database>;
let platformId: string;
let competitionId: string;

const baseData: ParsedTTLeaguesData = {
    teams: [
        { externalId: 'home', name: 'Home' },
        { externalId: 'away', name: 'Away' },
    ],
    players: [
        { externalId: 'p1', name: 'Player One' },
        { externalId: 'p2', name: 'Player Two' },
    ],
    fixtures: [{
        externalId: 'fixture-1',
        homeTeamExternalId: 'home',
        awayTeamExternalId: 'away',
        datePlayed: '2026-08-16',
        status: 'completed',
        roundName: null,
        roundOrder: null,
    }],
    rubbers: [{
        externalId: 'rubber-1',
        matchExternalId: 'fixture-1',
        isDoubles: false,
        homePlayers: ['p1'],
        awayPlayers: ['p2'],
        homeGamesWon: 3,
        awayGamesWon: 1,
        outcomeType: 'normal',
    }],
    standings: [],
};

async function rawLog(suffix: string) {
    const body = JSON.stringify({ suffix });
    return database.insertInto('raw_scrape_logs').values({
        platform_id: platformId,
        endpoint_url: `https://example.test/${suffix}`,
        raw_payload: body,
        payload_hash: createHash('sha256').update(body).digest('hex'),
        status: 'pending',
    }).returning('id').executeTakeFirstOrThrow();
}

async function load(data: ParsedTTLeaguesData, logIds: string[]) {
    return loadTTLeaguesData(database, {
        competitionId,
        platformId,
        parsedData: data,
        scrapeLogIds: logIds,
    });
}

function withFixtureStatus(
    status: 'upcoming' | 'completed' | 'postponed',
    rubbers = baseData.rubbers,
): ParsedTTLeaguesData {
    return {
        ...baseData,
        fixtures: baseData.fixtures.map((fixture) => ({ ...fixture, status })),
        rubbers,
    };
}

describe('shared loader concurrency contracts', () => {
    beforeAll(async () => {
        const admin = new Pool({ connectionString: ADMIN_URL });
        await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
        await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
        await admin.query(`ALTER DATABASE ${TEST_DB_NAME} SET search_path TO public, staging`);
        await admin.end();

        database = new Kysely<Database>({
            dialect: new PostgresDialect({ pool: new Pool({ connectionString: TEST_URL, max: 8 }) }),
        });
        const result = await new Migrator({ db: database, provider: new Provider() }).migrateToLatest();
        if (result.error) throw result.error;

        platformId = (await database.insertInto('platforms').values({
            name: 'Test',
            base_url: 'https://example.test',
        }).returning('id').executeTakeFirstOrThrow()).id;
        const leagueId = (await database.insertInto('leagues').values({
            platform_id: platformId,
            external_id: 'league',
            name: 'League',
        }).returning('id').executeTakeFirstOrThrow()).id;
        const seasonId = (await database.insertInto('seasons').values({
            league_id: leagueId,
            external_id: 'season',
            name: 'Season',
        }).returning('id').executeTakeFirstOrThrow()).id;
        competitionId = (await database.insertInto('competitions').values({
            season_id: seasonId,
            external_id: 'competition',
            name: 'Competition',
            type: 'league',
        }).returning('id').executeTakeFirstOrThrow()).id;
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

    beforeEach(async () => {
        await database.deleteFrom('rubbers').execute();
        await database.deleteFrom('fixtures').execute();
        await database.deleteFrom('external_players').execute();
        await database.deleteFrom('teams').execute();
        await database.deleteFrom('raw_scrape_logs').execute();
    });

    it('concurrent equivalent loads converge without duplicates', async () => {
        const first = await rawLog('concurrent-a');
        const second = await rawLog('concurrent-b');

        await Promise.all([
            load(baseData, [first.id]),
            load(baseData, [second.id]),
        ]);

        expect(await database.selectFrom('teams').selectAll().execute()).toHaveLength(2);
        expect(await database.selectFrom('external_players').selectAll().execute()).toHaveLength(2);
        expect(await database.selectFrom('fixtures').selectAll().execute()).toHaveLength(1);
        expect(await database.selectFrom('rubbers').selectAll().execute()).toHaveLength(1);
    });

    it('concurrent completed and stale snapshots always converge to completed', async () => {
        const completed = await rawLog('race-completed');
        const stale = await rawLog('race-stale');

        await Promise.all([
            load(withFixtureStatus('completed'), [completed.id]),
            load(withFixtureStatus('postponed', []), [stale.id]),
        ]);

        const fixture = await database.selectFrom('fixtures')
            .select('status')
            .where('external_id', '=', 'fixture-1')
            .executeTakeFirstOrThrow();
        expect(fixture.status).toBe('completed');
    });

    it('stale upcoming or postponed snapshots cannot regress a completed fixture', async () => {
        const completedLog = await rawLog('completed');
        await load(baseData, [completedLog.id]);

        for (const status of ['upcoming', 'postponed'] as const) {
            const staleLog = await rawLog(`stale-${status}`);
            await load(withFixtureStatus(status, []), [staleLog.id]);
        }

        const fixture = await database.selectFrom('fixtures')
            .select('status')
            .where('external_id', '=', 'fixture-1')
            .executeTakeFirstOrThrow();
        expect(fixture.status).toBe('completed');
    });

    it('a failing stale invocation cannot downgrade processed evidence', async () => {
        const log = await rawLog('shared-log');
        await load(baseData, [log.id]);

        const invalid: ParsedTTLeaguesData = {
            ...baseData,
            fixtures: baseData.fixtures.map((fixture) => ({
                ...fixture,
                homeTeamExternalId: 'missing-team',
            })),
        };
        await expect(load(invalid, [log.id])).rejects.toThrow(/Team not found/);

        const row = await database.selectFrom('raw_scrape_logs')
            .select('status')
            .where('id', '=', log.id)
            .executeTakeFirstOrThrow();
        expect(row.status).toBe('processed');
    });

    it('does not materialize players without stable source identity', async () => {
        const log = await rawLog('anonymous');
        const data: ParsedTTLeaguesData = {
            ...baseData,
            players: [
                ...baseData.players,
                { externalId: null, name: 'Unregistered Reserve' },
            ],
        };
        await load(data, [log.id]);
        await load(data, [log.id]);

        const players = await database.selectFrom('external_players')
            .select(['external_id', 'name'])
            .execute();
        expect(players).toHaveLength(2);
        expect(players.every((player) => player.external_id !== null)).toBe(true);
    });
});
