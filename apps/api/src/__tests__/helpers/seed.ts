import { Kysely, Migrator, PostgresDialect } from 'kysely';
import type { MigrationProvider, Migration } from 'kysely';
import pg from 'pg';
import type { Database } from '@tt-players/db';

// Import migrations directly so Vitest's TS loader handles them
// Relative path from apps/api/src/__tests__/helpers → monorepo root (5 levels up)
import * as m001 from '../../../../../packages/db/src/migrations/001_create_enums.js';
import * as m002 from '../../../../../packages/db/src/migrations/002_create_core_tables.js';
import * as m003 from '../../../../../packages/db/src/migrations/003_create_match_tables.js';
import * as m004 from '../../../../../packages/db/src/migrations/004_create_raw_scrape_logs.js';
import * as m005 from '../../../../../packages/db/src/migrations/005_make_rubber_players_nullable.js';
import * as m006 from '../../../../../packages/db/src/migrations/006_add_canonical_player_id_to_external_players.js';
import * as m007 from '../../../../../packages/db/src/migrations/007_add_performance_indexes.js';
import * as m008 from '../../../../../packages/db/src/migrations/008_create_cache_entries.js';
import * as m009 from '../../../../../packages/db/src/migrations/009_create_regions.js';
import * as m010 from '../../../../../packages/db/src/migrations/010_add_performance_indexes_2.js';
import * as m011 from '../../../../../packages/db/src/migrations/011_add_detail_page_performance_indexes.js';
import * as m012 from '../../../../../packages/db/src/migrations/012_add_raw_scrape_log_source_url_indexes.js';
import * as m013 from '../../../../../packages/db/src/migrations/013_add_rubber_score_source.js';
import * as m014 from '../../../../../packages/db/src/migrations/014_create_ranking_history_tables.js';
import * as m015 from '../../../../../packages/db/src/migrations/015_add_rubber_played_at.js';
import * as m016 from '../../../../../packages/db/src/migrations/016_create_sport80_event_scrape_state.js';
import * as m017 from '../../../../../packages/db/src/migrations/017_create_source_event_staging_tables.js';
import * as m018 from '../../../../../packages/db/src/migrations/018_add_competition_event_display_fields.js';

const { Pool } = pg;

const TEST_DB_NAME = `tt_players_api_test_${process.pid}_${process.env.VITEST_POOL_ID ?? 'main'}`;
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
export const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

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
        };
    }
}

export function createTestKysely(): Kysely<Database> {
    return new Kysely<Database>({
        dialect: new PostgresDialect({
            pool: new Pool({ connectionString: TEST_DATABASE_URL }),
        }),
    });
}

export async function createTestDatabase(): Promise<void> {
    const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await adminPool.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    await adminPool.end();
}

export async function dropTestDatabase(db: Kysely<Database>): Promise<void> {
    await db?.destroy?.();
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

export async function runMigrations(db: Kysely<Database>): Promise<void> {
    const migrator = new Migrator({
        db,
        provider: new StaticMigrationProvider(),
    });
    const { error } = await migrator.migrateToLatest();
    if (error) throw error;
}

// ─── Seed Data ────────────────────────────────────────────────────────────────

export interface SeedIds {
    platformId: string;
    leagueId: string;
    regionId: string;
    seasonId: string;
    competitionId: string;
    homeTeamId: string;
    awayTeamId: string;
    fixtureId: string;
    homePlayerId: string;
    awayPlayerId: string;
    normalRubberId: string;
    walkoverRubberId: string;
    standingId: string;
}

export async function seedTestData(db: Kysely<Database>): Promise<SeedIds> {
    // Platform
    const [platform] = await db
        .insertInto('platforms')
        .values({ name: 'Test Platform', base_url: 'https://test.example.com' })
        .returning('id')
        .execute();

    // League
    const [league] = await db
        .insertInto('leagues')
        .values({
            platform_id: platform!.id,
            external_id: 'ext-league-1',
            name: 'Test League',
        })
        .returning('id')
        .execute();

    const [region] = await db
        .insertInto('regions')
        .values({
            slug: 'test-region',
            name: 'Test Region',
        })
        .returning('id')
        .execute();

    await db
        .insertInto('league_regions')
        .values({
            league_id: league!.id,
            region_id: region!.id,
        })
        .execute();

    // Season
    const [season] = await db
        .insertInto('seasons')
        .values({
            league_id: league!.id,
            external_id: 'ext-season-1',
            name: '2024/25',
            is_active: true,
        })
        .returning('id')
        .execute();

    // Competition
    const [competition] = await db
        .insertInto('competitions')
        .values({
            season_id: season!.id,
            external_id: 'ext-comp-1',
            name: 'Division 1',
            type: 'league',
        })
        .returning('id')
        .execute();

    // Teams
    const [homeTeam] = await db
        .insertInto('teams')
        .values({
            competition_id: competition!.id,
            external_id: 'ext-team-home',
            name: 'Home FC',
        })
        .returning('id')
        .execute();

    const [awayTeam] = await db
        .insertInto('teams')
        .values({
            competition_id: competition!.id,
            external_id: 'ext-team-away',
            name: 'Away FC',
        })
        .returning('id')
        .execute();

    // League Standings
    const [standing] = await db
        .insertInto('league_standings')
        .values({
            competition_id: competition!.id,
            team_id: homeTeam!.id,
            position: 1,
            played: 5,
            won: 4,
            drawn: 0,
            lost: 1,
            points: 12,
            updated_at: new Date(),
        })
        .returning('id')
        .execute();

    // Fixture
    const [fixture] = await db
        .insertInto('fixtures')
        .values({
            competition_id: competition!.id,
            external_id: 'ext-fixture-1',
            home_team_id: homeTeam!.id,
            away_team_id: awayTeam!.id,
            date_played: '2025-01-15',
            status: 'completed',
            round_name: 'Round 1',
            round_order: 1,
            updated_at: new Date(),
        })
        .returning('id')
        .execute();

    // External Players
    const [homePlayer] = await db
        .insertInto('external_players')
        .values({
            platform_id: platform!.id,
            external_id: 'ext-player-home',
            name: 'Alice Smith',
            updated_at: new Date(),
        })
        .returning('id')
        .execute();

    const [awayPlayer] = await db
        .insertInto('external_players')
        .values({
            platform_id: platform!.id,
            external_id: 'ext-player-away',
            name: 'Bob Jones',
            updated_at: new Date(),
        })
        .returning('id')
        .execute();

    // Rubbers: one normal (homePlayer wins), one walkover (should be excluded)
    const [normalRubber] = await db
        .insertInto('rubbers')
        .values({
            fixture_id: fixture!.id,
            external_id: 'ext-rubber-1',
            home_player_1_id: homePlayer!.id,
            away_player_1_id: awayPlayer!.id,
            home_games_won: 3,
            away_games_won: 1,
            outcome_type: 'normal',
            updated_at: new Date(),
        })
        .returning('id')
        .execute();

    const [walkoverRubber] = await db
        .insertInto('rubbers')
        .values({
            fixture_id: fixture!.id,
            external_id: 'ext-rubber-walkover',
            home_player_1_id: homePlayer!.id,
            away_player_1_id: awayPlayer!.id,
            home_games_won: 0,
            away_games_won: 0,
            outcome_type: 'walkover',
            updated_at: new Date(),
        })
        .returning('id')
        .execute();

    return {
        platformId: platform!.id,
        leagueId: league!.id,
        regionId: region!.id,
        seasonId: season!.id,
        competitionId: competition!.id,
        homeTeamId: homeTeam!.id,
        awayTeamId: awayTeam!.id,
        fixtureId: fixture!.id,
        homePlayerId: homePlayer!.id,
        awayPlayerId: awayPlayer!.id,
        normalRubberId: normalRubber!.id,
        walkoverRubberId: walkoverRubber!.id,
        standingId: standing!.id,
    };
}
