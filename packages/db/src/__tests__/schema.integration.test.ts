import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, Migrator, PostgresDialect } from 'kysely';
import type { MigrationProvider, Migration } from 'kysely';
import pg from 'pg';

// Import migrations directly so Vitest's TS loader handles them
import * as m001 from '../migrations/001_create_enums.js';
import * as m002 from '../migrations/002_create_core_tables.js';
import * as m003 from '../migrations/003_create_match_tables.js';
import * as m004 from '../migrations/004_create_raw_scrape_logs.js';
import * as m005 from '../migrations/005_make_rubber_players_nullable.js';
import * as m006 from '../migrations/006_add_canonical_player_id_to_external_players.js';
import * as m007 from '../migrations/007_add_performance_indexes.js';
import * as m008 from '../migrations/008_create_cache_entries.js';
import * as m009 from '../migrations/009_create_regions.js';
import * as m010 from '../migrations/010_add_performance_indexes_2.js';
import * as m011 from '../migrations/011_add_detail_page_performance_indexes.js';
import * as m012 from '../migrations/012_add_raw_scrape_log_source_url_indexes.js';
import * as m013 from '../migrations/013_add_rubber_score_source.js';
import * as m014 from '../migrations/014_create_ranking_history_tables.js';
import * as m015 from '../migrations/015_add_rubber_played_at.js';
import * as m016 from '../migrations/016_create_sport80_event_scrape_state.js';
import * as m017 from '../migrations/017_create_source_event_staging_tables.js';
import * as m018 from '../migrations/018_add_competition_event_display_fields.js';
import * as m019 from '../migrations/019_add_competition_source_fields.js';
import * as m020 from '../migrations/020_create_staging_schema.js';
import * as m021 from '../migrations/021_create_feedback_table.js';
import * as m022 from '../migrations/022_add_updated_at_indexes.js';
import * as m023 from '../migrations/023_add_expression_and_region_indexes.js';

const { Pool } = pg;

const TEST_DB_NAME = 'tt_players_test';
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

// ─── Custom Migration Provider ────────────────────────────────────────────────

/**
 * A migration provider that uses statically imported migration modules.
 * This avoids the `FileMigrationProvider` issue where native `import()` cannot
 * resolve `.ts` files at runtime (outside of tsx/ts-node).
 */
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
            '022_add_updated_at_indexes': m022,
            '023_add_expression_and_region_indexes': m023,
        };
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let testDb: Kysely<any>;

function createMigrator(db: Kysely<any>): Migrator {
    return new Migrator({
        db,
        provider: new StaticMigrationProvider(),
    });
}

async function createTestDatabase(): Promise<void> {
    const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await adminPool.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    await adminPool.query(`ALTER DATABASE ${TEST_DB_NAME} SET search_path TO public, staging`);
    await adminPool.end();
}

async function dropTestDatabase(): Promise<void> {
    // Must disconnect first
    if (testDb) {
        await testDb.destroy();
    }
    const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL });
    // Terminate any remaining connections
    await adminPool.query(`
    SELECT pg_terminate_backend(pg_stat_activity.pid)
    FROM pg_stat_activity
    WHERE pg_stat_activity.datname = '${TEST_DB_NAME}'
      AND pid <> pg_backend_pid()
  `);
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await adminPool.end();
}

function createTestDb(): Kysely<any> {
    return new Kysely({
        dialect: new PostgresDialect({
            pool: new Pool({ connectionString: TEST_DATABASE_URL }),
        }),
    });
}

async function runMigrations(db: Kysely<any>): Promise<void> {
    const migrator = createMigrator(db);
    const { error } = await migrator.migrateToLatest();
    if (error) {
        throw error;
    }
}

// ─── Query Helpers ────────────────────────────────────────────────────────────

interface ColumnInfo {
    column_name: string;
    data_type: string;
    udt_name: string;
    is_nullable: string;
    column_default: string | null;
}

async function getTableColumns(tableName: string): Promise<ColumnInfo[]> {
    const result = await testDb
        .selectFrom('information_schema.columns' as any)
        .select([
            'column_name',
            'data_type',
            'udt_name',
            'is_nullable',
            'column_default',
        ])
        .where('table_schema', 'in', ['public', 'staging'])
        .where('table_name', '=', tableName)
        .execute();
    return result as unknown as ColumnInfo[];
}

async function getTableNames(): Promise<string[]> {
    const result = await testDb
        .selectFrom('information_schema.tables' as any)
        .select('table_name')
        .where('table_schema', 'in', ['public', 'staging'])
        .where('table_type', '=', 'BASE TABLE')
        .execute();
    return (result as unknown as { table_name: string }[]).map((r) => r.table_name);
}

interface EnumValue {
    enum_name: string;
    enum_value: string;
}

async function getEnumValues(): Promise<EnumValue[]> {
    const { rows } = await (testDb as any)
        .executeQuery({
            sql: `
        SELECT t.typname AS enum_name, e.enumlabel AS enum_value
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE n.nspname IN ('public', 'staging')
        ORDER BY t.typname, e.enumsortorder
      `,
            parameters: [],
        } as any)
        .catch(() => ({ rows: [] }));

    // Fallback: use raw SQL if the above doesn't work
    if (!rows || rows.length === 0) {
        const pool = new Pool({ connectionString: TEST_DATABASE_URL });
        const res = await pool.query(`
      SELECT t.typname AS enum_name, e.enumlabel AS enum_value
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON t.typnamespace = n.oid
      WHERE n.nspname IN ('public', 'staging')
      ORDER BY t.typname, e.enumsortorder
    `);
        await pool.end();
        return res.rows;
    }

    return rows;
}

interface ConstraintInfo {
    constraint_name: string;
    table_name: string;
    constraint_type: string;
}

async function getUniqueConstraints(): Promise<ConstraintInfo[]> {
    const pool = new Pool({ connectionString: TEST_DATABASE_URL });
    const res = await pool.query(`
    SELECT tc.constraint_name, tc.table_name, tc.constraint_type
    FROM information_schema.table_constraints tc
    WHERE tc.table_schema IN ('public', 'staging')
      AND tc.constraint_type = 'UNIQUE'
    ORDER BY tc.table_name, tc.constraint_name
  `);
    await pool.end();
    return res.rows;
}

interface IndexInfo {
    indexname: string;
    tablename: string;
    indexdef: string;
}

async function getIndexes(): Promise<IndexInfo[]> {
    const pool = new Pool({ connectionString: TEST_DATABASE_URL });
    const res = await pool.query(`
    SELECT indexname, tablename, indexdef
    FROM pg_indexes
    WHERE schemaname IN ('public', 'staging')
    ORDER BY tablename, indexname
  `);
    await pool.end();
    return res.rows;
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('Database Schema Integration Tests', () => {
    beforeAll(async () => {
        await createTestDatabase();
        testDb = createTestDb();
        await runMigrations(testDb);
    }, 30_000);

    afterAll(async () => {
        await dropTestDatabase();
    }, 15_000);

    // ── Enum Types ────────────────────────────────────────────────────────────

    describe('Enum Types', () => {
        let enumValues: EnumValue[];

        beforeAll(async () => {
            enumValues = await getEnumValues();
        });

        it('should have the competition_type enum with correct values', () => {
            const values = enumValues
                .filter((e) => e.enum_name === 'competition_type')
                .map((e) => e.enum_value);
            expect(values).toEqual(
                expect.arrayContaining(['league', 'team_cup', 'individual'])
            );
            expect(values).toHaveLength(3);
        });

        it('should have the fixture_status enum with correct values', () => {
            const values = enumValues
                .filter((e) => e.enum_name === 'fixture_status')
                .map((e) => e.enum_value);
            expect(values).toEqual(
                expect.arrayContaining(['upcoming', 'completed', 'postponed'])
            );
            expect(values).toHaveLength(3);
        });

        it('should have the outcome_type enum with correct values', () => {
            const values = enumValues
                .filter((e) => e.enum_name === 'outcome_type')
                .map((e) => e.enum_value);
            expect(values).toEqual(
                expect.arrayContaining(['normal', 'walkover', 'retired', 'void'])
            );
            expect(values).toHaveLength(4);
        });

        it('should have the scrape_status enum with correct values', () => {
            const values = enumValues
                .filter((e) => e.enum_name === 'scrape_status')
                .map((e) => e.enum_value);
            expect(values).toEqual(
                expect.arrayContaining(['pending', 'processed', 'failed'])
            );
            expect(values).toHaveLength(3);
        });

        it('should have the ranking_list_kind enum with correct values', () => {
            const values = enumValues
                .filter((e) => e.enum_name === 'ranking_list_kind')
                .map((e) => e.enum_value);
            expect(values).toEqual(expect.arrayContaining(['ranking', 'rating']));
            expect(values).toHaveLength(2);
        });
    });

    // ── Table Existence ───────────────────────────────────────────────────────

    describe('Table Existence', () => {
        const expectedTables = [
            'platforms',
            'leagues',
            'regions',
            'league_regions',
            'seasons',
            'competitions',
            'teams',
            'external_players',
            'league_standings',
            'fixtures',
            'rubbers',
            'ranking_categories',
            'ranking_periods',
            'ranking_entries',
            'raw_scrape_logs',
            'cache_entries',
        ];

        it('should have all expected tables', async () => {
            const tableNames = await getTableNames();
            for (const table of expectedTables) {
                expect(tableNames).toContain(table);
            }
        });
    });

    // ── Table Columns ─────────────────────────────────────────────────────────

    describe('Table: platforms', () => {
        let columns: ColumnInfo[];
        beforeAll(async () => {
            columns = await getTableColumns('platforms');
        });

        it('should have the correct columns', () => {
            const colNames = columns.map((c) => c.column_name);
            expect(colNames).toEqual(
                expect.arrayContaining(['id', 'name', 'base_url', 'created_at'])
            );
        });

        it('should have UUID primary key', () => {
            const idCol = columns.find((c) => c.column_name === 'id');
            expect(idCol?.udt_name).toBe('uuid');
        });

        it('should have created_at with default', () => {
            const col = columns.find((c) => c.column_name === 'created_at');
            expect(col?.data_type).toBe('timestamp without time zone');
            expect(col?.column_default).toBeTruthy();
        });
    });

    describe('Table: leagues', () => {
        let columns: ColumnInfo[];
        beforeAll(async () => {
            columns = await getTableColumns('leagues');
        });

        it('should have the correct columns', () => {
            const colNames = columns.map((c) => c.column_name);
            expect(colNames).toEqual(
                expect.arrayContaining([
                    'id', 'platform_id', 'external_id', 'name',
                    'created_at', 'deleted_at',
                ])
            );
        });

        it('should have UUID primary key', () => {
            const idCol = columns.find((c) => c.column_name === 'id');
            expect(idCol?.udt_name).toBe('uuid');
        });

        it('should have platform_id as UUID FK', () => {
            const col = columns.find((c) => c.column_name === 'platform_id');
            expect(col?.udt_name).toBe('uuid');
            expect(col?.is_nullable).toBe('NO');
        });

        it('should have nullable deleted_at', () => {
            const col = columns.find((c) => c.column_name === 'deleted_at');
            expect(col?.is_nullable).toBe('YES');
        });
    });

    describe('Table: seasons', () => {
        let columns: ColumnInfo[];
        beforeAll(async () => {
            columns = await getTableColumns('seasons');
        });

        it('should have the correct columns', () => {
            const colNames = columns.map((c) => c.column_name);
            expect(colNames).toEqual(
                expect.arrayContaining([
                    'id', 'league_id', 'external_id', 'name',
                    'is_active', 'created_at', 'deleted_at',
                ])
            );
        });

        it('should have is_active as boolean with default false', () => {
            const col = columns.find((c) => c.column_name === 'is_active');
            expect(col?.udt_name).toBe('bool');
            expect(col?.column_default).toBe('false');
        });

        it('should have nullable deleted_at', () => {
            const col = columns.find((c) => c.column_name === 'deleted_at');
            expect(col?.is_nullable).toBe('YES');
        });
    });

    describe('Table: competitions', () => {
        let columns: ColumnInfo[];
        beforeAll(async () => {
            columns = await getTableColumns('competitions');
        });

        it('should have the correct columns', () => {
            const colNames = columns.map((c) => c.column_name);
            expect(colNames).toEqual(
                expect.arrayContaining([
                    'id', 'season_id', 'external_id', 'name', 'type',
                    'last_scraped_at', 'created_at', 'deleted_at',
                ])
            );
        });

        it('should have type as competition_type enum', () => {
            const col = columns.find((c) => c.column_name === 'type');
            expect(col?.data_type).toBe('USER-DEFINED');
            expect(col?.udt_name).toBe('competition_type');
        });

        it('should have nullable last_scraped_at', () => {
            const col = columns.find((c) => c.column_name === 'last_scraped_at');
            expect(col?.is_nullable).toBe('YES');
        });
    });

    describe('Table: teams', () => {
        let columns: ColumnInfo[];
        beforeAll(async () => {
            columns = await getTableColumns('teams');
        });

        it('should have the correct columns', () => {
            const colNames = columns.map((c) => c.column_name);
            expect(colNames).toEqual(
                expect.arrayContaining([
                    'id', 'competition_id', 'external_id', 'name',
                    'created_at', 'deleted_at',
                ])
            );
        });

        it('should have UUID primary key', () => {
            const idCol = columns.find((c) => c.column_name === 'id');
            expect(idCol?.udt_name).toBe('uuid');
        });

        it('should have nullable deleted_at', () => {
            const col = columns.find((c) => c.column_name === 'deleted_at');
            expect(col?.is_nullable).toBe('YES');
        });
    });

    describe('Table: external_players', () => {
        let columns: ColumnInfo[];
        beforeAll(async () => {
            columns = await getTableColumns('external_players');
        });

        it('should have the correct columns', () => {
            const colNames = columns.map((c) => c.column_name);
            expect(colNames).toEqual(
                expect.arrayContaining([
                    'id', 'platform_id', 'external_id', 'name',
                    'canonical_player_id', 'created_at', 'updated_at', 'deleted_at',
                ])
            );
        });

        it('should have nullable external_id (for unregistered reserves)', () => {
            const col = columns.find((c) => c.column_name === 'external_id');
            expect(col?.is_nullable).toBe('YES');
        });

        it('should have updated_at column', () => {
            const col = columns.find((c) => c.column_name === 'updated_at');
            expect(col).toBeTruthy();
            expect(col?.data_type).toBe('timestamp without time zone');
        });

        it('should have nullable canonical_player_id UUID column', () => {
            const col = columns.find((c) => c.column_name === 'canonical_player_id');
            expect(col?.udt_name).toBe('uuid');
            expect(col?.is_nullable).toBe('YES');
        });
    });

    describe('Table: league_standings', () => {
        let columns: ColumnInfo[];
        beforeAll(async () => {
            columns = await getTableColumns('league_standings');
        });

        it('should have the correct columns', () => {
            const colNames = columns.map((c) => c.column_name);
            expect(colNames).toEqual(
                expect.arrayContaining([
                    'id', 'competition_id', 'team_id',
                    'position', 'played', 'won', 'drawn', 'lost', 'points',
                    'created_at', 'updated_at', 'deleted_at',
                ])
            );
        });

        it('should have integer stats columns', () => {
            const intCols = ['position', 'played', 'won', 'drawn', 'lost', 'points'];
            for (const colName of intCols) {
                const col = columns.find((c) => c.column_name === colName);
                expect(col?.udt_name).toBe('int4');
            }
        });
    });

    describe('Table: fixtures', () => {
        let columns: ColumnInfo[];
        beforeAll(async () => {
            columns = await getTableColumns('fixtures');
        });

        it('should have the correct columns', () => {
            const colNames = columns.map((c) => c.column_name);
            expect(colNames).toEqual(
                expect.arrayContaining([
                    'id', 'competition_id', 'external_id',
                    'home_team_id', 'away_team_id',
                    'date_played', 'status',
                    'round_name', 'round_order',
                    'created_at', 'updated_at', 'deleted_at',
                ])
            );
        });

        it('should have nullable home_team_id and away_team_id (for individual tournaments)', () => {
            const homeTeam = columns.find((c) => c.column_name === 'home_team_id');
            const awayTeam = columns.find((c) => c.column_name === 'away_team_id');
            expect(homeTeam?.is_nullable).toBe('YES');
            expect(awayTeam?.is_nullable).toBe('YES');
        });

        it('should have date_played as date type', () => {
            const col = columns.find((c) => c.column_name === 'date_played');
            expect(col?.udt_name).toBe('date');
        });

        it('should have status as fixture_status enum', () => {
            const col = columns.find((c) => c.column_name === 'status');
            expect(col?.data_type).toBe('USER-DEFINED');
            expect(col?.udt_name).toBe('fixture_status');
        });

        it('should have nullable round_name and round_order', () => {
            const roundName = columns.find((c) => c.column_name === 'round_name');
            const roundOrder = columns.find((c) => c.column_name === 'round_order');
            expect(roundName?.is_nullable).toBe('YES');
            expect(roundOrder?.is_nullable).toBe('YES');
        });
    });

    describe('Table: rubbers', () => {
        let columns: ColumnInfo[];
        beforeAll(async () => {
            columns = await getTableColumns('rubbers');
        });

        it('should have the correct columns', () => {
            const colNames = columns.map((c) => c.column_name);
            expect(colNames).toEqual(
                expect.arrayContaining([
                    'id', 'fixture_id', 'external_id',
                    'is_doubles',
                    'home_player_1_id', 'home_player_2_id',
                    'away_player_1_id', 'away_player_2_id',
                    'home_games_won', 'away_games_won',
                    'home_points_scored', 'away_points_scored',
                    'outcome_type', 'score_source', 'played_at',
                    'created_at', 'updated_at', 'deleted_at',
                ])
            );
        });

        it('should have is_doubles as boolean with default false', () => {
            const col = columns.find((c) => c.column_name === 'is_doubles');
            expect(col?.udt_name).toBe('bool');
            expect(col?.column_default).toBe('false');
        });

        it('should have nullable doubles player columns', () => {
            const p2Home = columns.find((c) => c.column_name === 'home_player_2_id');
            const p2Away = columns.find((c) => c.column_name === 'away_player_2_id');
            expect(p2Home?.is_nullable).toBe('YES');
            expect(p2Away?.is_nullable).toBe('YES');
        });

        it('should have nullable points_scored columns (for handicap formats)', () => {
            const homePoints = columns.find((c) => c.column_name === 'home_points_scored');
            const awayPoints = columns.find((c) => c.column_name === 'away_points_scored');
            expect(homePoints?.is_nullable).toBe('YES');
            expect(awayPoints?.is_nullable).toBe('YES');
        });

        it('should have outcome_type as outcome_type enum', () => {
            const col = columns.find((c) => c.column_name === 'outcome_type');
            expect(col?.data_type).toBe('USER-DEFINED');
            expect(col?.udt_name).toBe('outcome_type');
        });

        it('should have score_source as score_source enum with default games', () => {
            const col = columns.find((c) => c.column_name === 'score_source');
            expect(col?.data_type).toBe('USER-DEFINED');
            expect(col?.udt_name).toBe('score_source');
            expect(col?.column_default).toContain("'games'::score_source");
        });

        it('should have nullable played_at timestamp for row-level match time', () => {
            const col = columns.find((c) => c.column_name === 'played_at');
            expect(col?.data_type).toBe('timestamp without time zone');
            expect(col?.is_nullable).toBe('YES');
        });
    });

    describe('Table: raw_scrape_logs', () => {
        let columns: ColumnInfo[];
        beforeAll(async () => {
            columns = await getTableColumns('raw_scrape_logs');
        });

        it('should have the correct columns', () => {
            const colNames = columns.map((c) => c.column_name);
            expect(colNames).toEqual(
                expect.arrayContaining([
                    'id', 'platform_id', 'endpoint_url',
                    'raw_payload', 'payload_hash',
                    'scraped_at', 'status',
                ])
            );
        });

        it('should have raw_payload as text type', () => {
            const col = columns.find((c) => c.column_name === 'raw_payload');
            expect(col?.udt_name).toBe('text');
        });

        it('should have status as scrape_status enum', () => {
            const col = columns.find((c) => c.column_name === 'status');
            expect(col?.data_type).toBe('USER-DEFINED');
            expect(col?.udt_name).toBe('scrape_status');
        });

        it('should have scraped_at with default', () => {
            const col = columns.find((c) => c.column_name === 'scraped_at');
            expect(col?.column_default).toBeTruthy();
        });
    });

    describe('Table: ranking_entries', () => {
        let columns: ColumnInfo[];
        beforeAll(async () => {
            columns = await getTableColumns('ranking_entries');
        });

        it('should have the correct columns', () => {
            const colNames = columns.map((c) => c.column_name);
            expect(colNames).toEqual(
                expect.arrayContaining([
                    'id', 'period_id', 'category_id', 'player_id',
                    'list_kind', 'ranking_row_external_id', 'athlete_external_id',
                    'rank', 'points', 'county_country', 'inactive_periods',
                    'is_initial_rating', 'created_at', 'updated_at',
                ]),
            );
        });

        it('should have list_kind as ranking_list_kind enum', () => {
            const col = columns.find((c) => c.column_name === 'list_kind');
            expect(col?.data_type).toBe('USER-DEFINED');
            expect(col?.udt_name).toBe('ranking_list_kind');
        });
    });

    // ── Unique Constraints ────────────────────────────────────────────────────

    describe('Unique Constraints', () => {
        let constraints: ConstraintInfo[];
        let indexes: IndexInfo[];

        beforeAll(async () => {
            constraints = await getUniqueConstraints();
            indexes = await getIndexes();
        });

        it('should have UNIQUE(platform_id, external_id) on leagues', () => {
            const constraint = constraints.find(
                (c) => c.table_name === 'leagues' && c.constraint_type === 'UNIQUE'
            );
            expect(constraint).toBeTruthy();
        });

        it('should have UNIQUE(league_id, external_id) on seasons', () => {
            const constraint = constraints.find(
                (c) => c.table_name === 'seasons' && c.constraint_type === 'UNIQUE'
            );
            expect(constraint).toBeTruthy();
        });

        it('should have UNIQUE(season_id, external_id) on competitions', () => {
            const constraint = constraints.find(
                (c) => c.table_name === 'competitions' && c.constraint_type === 'UNIQUE'
            );
            expect(constraint).toBeTruthy();
        });

        it('should have UNIQUE(competition_id, external_id) on teams', () => {
            const constraint = constraints.find(
                (c) => c.table_name === 'teams' && c.constraint_type === 'UNIQUE'
            );
            expect(constraint).toBeTruthy();
        });

        it('should have UNIQUE(competition_id, team_id) on league_standings', () => {
            const constraint = constraints.find(
                (c) => c.table_name === 'league_standings' && c.constraint_type === 'UNIQUE'
            );
            expect(constraint).toBeTruthy();
        });

        it('should have UNIQUE(competition_id, external_id) on fixtures', () => {
            const constraint = constraints.find(
                (c) => c.table_name === 'fixtures' && c.constraint_type === 'UNIQUE'
            );
            expect(constraint).toBeTruthy();
        });

        it('should have UNIQUE(fixture_id, external_id) on rubbers', () => {
            const constraint = constraints.find(
                (c) => c.table_name === 'rubbers' && c.constraint_type === 'UNIQUE'
            );
            expect(constraint).toBeTruthy();
        });

        it('should have UNIQUE(endpoint_url, payload_hash) on raw_scrape_logs', () => {
            const constraint = constraints.find(
                (c) => c.table_name === 'raw_scrape_logs' && c.constraint_type === 'UNIQUE'
            );
            expect(constraint).toBeTruthy();
        });

        it('should have partial unique index on external_players(platform_id, external_id) WHERE external_id IS NOT NULL', () => {
            const partialIndex = indexes.find(
                (idx) =>
                    idx.tablename === 'external_players' &&
                    idx.indexdef.toLowerCase().includes('unique') &&
                    idx.indexdef.toLowerCase().includes('where') &&
                    idx.indexdef.toLowerCase().includes('external_id') &&
                    idx.indexdef.toLowerCase().includes('is not null')
            );
            expect(partialIndex).toBeTruthy();
        });

        it('should have performance indexes for fixture and rubber lookups', () => {
            const expected = [
                'idx_external_players_name_trgm_active',
                'idx_fixtures_home_team_date_active',
                'idx_fixtures_away_team_date_active',
                'idx_rubbers_home_p1_fixture_singles_active',
                'idx_rubbers_away_p1_fixture_singles_active',
                'idx_rubbers_h2h_p1_pair_fixture_active',
                'idx_rubbers_home_p2_fixture_doubles_active',
                'idx_rubbers_away_p2_fixture_doubles_active',
                'idx_rubbers_fixture_created_active',
                'idx_league_standings_team_updated_active',
                'idx_league_standings_team_created_active',
                'idx_rubbers_home_p1_fixture_updated_active',
                'idx_rubbers_away_p1_fixture_updated_active',
                'idx_rubbers_home_p2_fixture_updated_active',
                'idx_rubbers_away_p2_fixture_updated_active',
                'idx_fixtures_id_updated_active',
                'idx_external_players_updated_at_active',
                'idx_external_players_canonical_coalesce',
                'idx_league_regions_region_id',
            ];

            for (const indexName of expected) {
                expect(indexes.some((idx) => idx.indexname === indexName)).toBe(true);
            }
        });
    });

    // ── Migration Rollback ────────────────────────────────────────────────────

    describe('Migration Rollback', () => {
        it('should be able to roll back all migrations without errors', async () => {
            const migrator = createMigrator(testDb);

            // Roll back all migrations one by one
            let rolledBack = 0;
            const maxRollbacks = 30; // Safety limit

            while (rolledBack < maxRollbacks) {
                const { error, results } = await migrator.migrateDown();
                if (error) {
                    throw error;
                }
                if (!results || results.length === 0) {
                    break; // No more migrations to roll back
                }
                for (const result of results) {
                    expect(result.status).toBe('Success');
                }
                rolledBack++;
            }

            // After all rollbacks, the public schema should have no application tables
            const remainingTables = await getTableNames();
            const appTables = remainingTables.filter(
                (t) => !t.startsWith('kysely_') // Exclude Kysely's migration bookkeeping table
            );
            expect(appTables).toHaveLength(0);
        }, 30_000);
    });
});
