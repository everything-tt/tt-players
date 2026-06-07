import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Kysely, Migrator, PostgresDialect } from 'kysely';
import type { MigrationProvider, Migration } from 'kysely';
import pg from 'pg';

// Import Kysely migrations or files
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

import type { Database } from '@tt-players/db';
import { reconcilePlayersByName, unmergePlayer } from '../player-reconciler.js';

const { Pool } = pg;

const TEST_DB_NAME = 'tt_player_reconciler_test';
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
            '021_create_feedback_table': m021,
        };
    }
}

let db: Kysely<Database>;
let fixtureId: string;
let tt365PlatformId: string;
let ttLeaguesPlatformId: string;

async function createTestDatabase(): Promise<void> {
    const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await adminPool.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    await adminPool.query(`ALTER DATABASE ${TEST_DB_NAME} SET search_path TO public, staging`);
    await adminPool.end();
}

async function dropTestDatabase(): Promise<void> {
    if (db) {
        await db.destroy();
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

describe('reconcilePlayersByName', () => {
    beforeAll(async () => {
        await createTestDatabase();
        db = createTestDb();
        await runMigrations(db);

        const tt365 = await db
            .insertInto('platforms')
            .values({
                name: 'TableTennis365',
                base_url: 'https://www.tabletennis365.com',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        tt365PlatformId = tt365.id;

        const ttl = await db
            .insertInto('platforms')
            .values({
                name: 'TT Leagues',
                base_url: 'https://ttleagues-api.azurewebsites.net/api',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        ttLeaguesPlatformId = ttl.id;

        const league = await db
            .insertInto('leagues')
            .values({
                platform_id: tt365PlatformId,
                external_id: 'league-1',
                name: 'League 1',
            })
            .returning('id')
            .executeTakeFirstOrThrow();

        const season = await db
            .insertInto('seasons')
            .values({
                league_id: league.id,
                external_id: '2025-26',
                name: '2025-26',
            })
            .returning('id')
            .executeTakeFirstOrThrow();

        const competition = await db
            .insertInto('competitions')
            .values({
                season_id: season.id,
                external_id: 'prem',
                name: 'Premier',
                type: 'league',
            })
            .returning('id')
            .executeTakeFirstOrThrow();

        const homeTeam = await db
            .insertInto('teams')
            .values({
                competition_id: competition.id,
                external_id: 'team-home',
                name: 'Home Team',
            })
            .returning('id')
            .executeTakeFirstOrThrow();

        const awayTeam = await db
            .insertInto('teams')
            .values({
                competition_id: competition.id,
                external_id: 'team-away',
                name: 'Away Team',
            })
            .returning('id')
            .executeTakeFirstOrThrow();

        const fixture = await db
            .insertInto('fixtures')
            .values({
                competition_id: competition.id,
                external_id: 'fixture-1',
                home_team_id: homeTeam.id,
                away_team_id: awayTeam.id,
                status: 'completed',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        fixtureId = fixture.id;
    }, 30_000);

    beforeEach(async () => {
        await db.deleteFrom('rubbers').execute();
        await db.deleteFrom('external_players').execute();
    });

    afterAll(async () => {
        await dropTestDatabase();
    }, 15_000);

    it('links unique exact-name pairs without remapping rubber player IDs', async () => {
        const tt365Player = await db
            .insertInto('external_players')
            .values({
                platform_id: tt365PlatformId,
                external_id: '391675',
                name: 'Andrew Jessop',
            })
            .returning('id')
            .executeTakeFirstOrThrow();

        const ttlPlayer = await db
            .insertInto('external_players')
            .values({
                platform_id: ttLeaguesPlatformId,
                external_id: 'd3aa4747-c8bb-46a4-9376-9d580a6b4806',
                name: 'Andrew Jessop',
            })
            .returning('id')
            .executeTakeFirstOrThrow();

        await db
            .insertInto('rubbers')
            .values({
                fixture_id: fixtureId,
                external_id: 'r1',
                is_doubles: false,
                home_player_1_id: ttlPlayer.id,
                away_player_1_id: tt365Player.id,
                home_games_won: 3,
                away_games_won: 1,
                outcome_type: 'normal',
            })
            .executeTakeFirstOrThrow();

        const result = await reconcilePlayersByName(db);
        expect(result.linkedGroups).toBe(1);
        expect(result.remappedRubbers).toBe(0);

        const players = await db
            .selectFrom('external_players')
            .select(['id', 'canonical_player_id', 'deleted_at'])
            .where('name', '=', 'Andrew Jessop')
            .orderBy('id', 'asc')
            .execute();

        const canonicalIds = new Set(players.map((p) => p.canonical_player_id));
        expect(canonicalIds.size).toBe(1);

        const canonicalId = players[0]!.canonical_player_id!;
        const alias = players.find((p) => p.id !== canonicalId);
        expect(alias?.deleted_at).toBeNull();

        const rubber = await db
            .selectFrom('rubbers')
            .select(['home_player_1_id', 'away_player_1_id'])
            .where('external_id', '=', 'r1')
            .executeTakeFirstOrThrow();

        expect(rubber.home_player_1_id).toBe(ttlPlayer.id);
        expect(rubber.away_player_1_id).toBe(tt365Player.id);

        await unmergePlayer(db, alias!.id);

        const unmergedAlias = await db
            .selectFrom('external_players')
            .select(['id', 'canonical_player_id', 'deleted_at'])
            .where('id', '=', alias!.id)
            .executeTakeFirstOrThrow();

        expect(unmergedAlias.canonical_player_id).toBe(alias!.id);
        expect(unmergedAlias.deleted_at).toBeNull();

        const rubberAfterUnmerge = await db
            .selectFrom('rubbers')
            .select(['home_player_1_id', 'away_player_1_id'])
            .where('external_id', '=', 'r1')
            .executeTakeFirstOrThrow();

        expect(rubberAfterUnmerge.home_player_1_id).toBe(ttlPlayer.id);
        expect(rubberAfterUnmerge.away_player_1_id).toBe(tt365Player.id);
    });

    it('links same-name groups across sources even when one source has duplicate rows', async () => {
        await db
            .insertInto('external_players')
            .values([
                {
                    platform_id: tt365PlatformId,
                    external_id: '10001',
                    name: 'Chris Taylor',
                },
                {
                    platform_id: tt365PlatformId,
                    external_id: '10002',
                    name: 'Chris Taylor',
                },
                {
                    platform_id: ttLeaguesPlatformId,
                    external_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                    name: 'Chris Taylor',
                },
            ])
            .execute();

        const result = await reconcilePlayersByName(db);
        expect(result.linkedGroups).toBe(1);
        expect(result.remappedRubbers).toBe(0);

        const rows = await db
            .selectFrom('external_players')
            .select(['id', 'canonical_player_id', 'deleted_at'])
            .where('name', '=', 'Chris Taylor')
            .execute();

        expect(new Set(rows.map((r) => r.canonical_player_id)).size).toBe(1);
        expect(rows.every((r) => r.canonical_player_id != null)).toBe(true);
        expect(rows.every((r) => r.deleted_at == null)).toBe(true);
    });
});
