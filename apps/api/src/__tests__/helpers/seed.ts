import { FileMigrationProvider, Kysely, Migrator, PostgresDialect } from 'kysely';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import pg from 'pg';
import type { Database } from '@tt-players/db';

const { Pool } = pg;

const TEST_DB_NAME = `tt_players_api_test_${process.pid}_${process.env.VITEST_POOL_ID ?? 'main'}`;
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
export const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

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
    const migrationFolder = path.join(import.meta.dirname, '../../../../../packages/db/src/migrations');
    const migrator = new Migrator({
        db,
        provider: new FileMigrationProvider({
            fs,
            path,
            migrationFolder,
        }),
    });
    const { error } = await migrator.migrateToLatest();
    if (error) throw error;
}

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
    const [platform] = await db
        .insertInto('platforms')
        .values({ name: 'Test Platform', base_url: 'https://test.example.com' })
        .returning('id')
        .execute();

    const [league] = await db
        .insertInto('leagues')
        .values({ platform_id: platform!.id, external_id: 'ext-league-1', name: 'Test League' })
        .returning('id')
        .execute();

    const [region] = await db
        .insertInto('regions')
        .values({ slug: 'test-region', name: 'Test Region' })
        .returning('id')
        .execute();

    await db.insertInto('league_regions').values({ league_id: league!.id, region_id: region!.id }).execute();

    const [season] = await db
        .insertInto('seasons')
        .values({ league_id: league!.id, external_id: 'ext-season-1', name: '2024/25', is_active: true })
        .returning('id')
        .execute();

    const [competition] = await db
        .insertInto('competitions')
        .values({ season_id: season!.id, external_id: 'ext-comp-1', name: 'Division 1', type: 'league' })
        .returning('id')
        .execute();

    const [homeTeam] = await db
        .insertInto('teams')
        .values({ competition_id: competition!.id, external_id: 'ext-team-home', name: 'Home FC' })
        .returning('id')
        .execute();

    const [awayTeam] = await db
        .insertInto('teams')
        .values({ competition_id: competition!.id, external_id: 'ext-team-away', name: 'Away FC' })
        .returning('id')
        .execute();

    const [standing] = await db
        .insertInto('league_standings')
        .values({ competition_id: competition!.id, team_id: homeTeam!.id, position: 1, played: 5, won: 4, drawn: 0, lost: 1, points: 12, updated_at: new Date() })
        .returning('id')
        .execute();

    const [fixture] = await db
        .insertInto('fixtures')
        .values({ competition_id: competition!.id, external_id: 'ext-fixture-1', home_team_id: homeTeam!.id, away_team_id: awayTeam!.id, date_played: '2025-01-15', status: 'completed', round_name: 'Round 1', round_order: 1, updated_at: new Date() })
        .returning('id')
        .execute();

    const [homePlayer] = await db
        .insertInto('external_players')
        .values({ platform_id: platform!.id, external_id: 'ext-player-home', name: 'Alice Smith', updated_at: new Date() })
        .returning('id')
        .execute();

    const [awayPlayer] = await db
        .insertInto('external_players')
        .values({ platform_id: platform!.id, external_id: 'ext-player-away', name: 'Bob Jones', updated_at: new Date() })
        .returning('id')
        .execute();

    const [normalRubber] = await db
        .insertInto('rubbers')
        .values({ fixture_id: fixture!.id, external_id: 'ext-rubber-1', home_player_1_id: homePlayer!.id, away_player_1_id: awayPlayer!.id, home_games_won: 3, away_games_won: 1, outcome_type: 'normal', updated_at: new Date() })
        .returning('id')
        .execute();

    const [walkoverRubber] = await db
        .insertInto('rubbers')
        .values({ fixture_id: fixture!.id, external_id: 'ext-rubber-walkover', home_player_1_id: homePlayer!.id, away_player_1_id: awayPlayer!.id, home_games_won: 0, away_games_won: 0, outcome_type: 'walkover', updated_at: new Date() })
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
