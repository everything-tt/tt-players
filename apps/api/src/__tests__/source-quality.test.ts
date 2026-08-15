import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import type { Database } from '@tt-players/db';
import * as m001 from '../../../../packages/db/src/migrations/001_create_enums.js';
import * as m002 from '../../../../packages/db/src/migrations/002_create_core_tables.js';
import * as m003 from '../../../../packages/db/src/migrations/003_create_match_tables.js';
import * as m004 from '../../../../packages/db/src/migrations/004_create_raw_scrape_logs.js';
import * as m005 from '../../../../packages/db/src/migrations/005_make_rubber_players_nullable.js';
import * as m006 from '../../../../packages/db/src/migrations/006_add_canonical_player_id_to_external_players.js';
import * as m013 from '../../../../packages/db/src/migrations/013_add_rubber_score_source.js';
import * as m015 from '../../../../packages/db/src/migrations/015_add_rubber_played_at.js';
import * as m029 from '../../../../packages/db/src/migrations/029_create_source_registry.js';
import * as m030 from '../../../../packages/db/src/migrations/030_create_player_identity_decisions.js';
import * as m035 from '../../../../packages/db/src/migrations/035_create_api_read_models.js';
import * as m052 from '../../../../packages/db/src/migrations/052_add_raw_scrape_log_updated_at.js';
import { buildSourceQualitySnapshot } from '../../../worker/src/read-models.js';
import { buildApp } from '../app.js';

const { Pool } = pg;
const TEST_DB_NAME = `tt_players_source_quality_test_${process.pid}`;
const TEST_DATABASE_BASE_URL = process.env.TEST_DATABASE_BASE_URL ?? 'postgres://postgres:postgres@localhost:5432';
const ADMIN_DATABASE_URL = `${TEST_DATABASE_BASE_URL}/postgres`;
const TEST_DATABASE_URL = `${TEST_DATABASE_BASE_URL}/${TEST_DB_NAME}`;

let db: Kysely<Database>;
let request: ReturnType<typeof supertest>;

async function createDatabase(): Promise<void> {
    const admin = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    await admin.end();
}

async function dropDatabase(): Promise<void> {
    await db.destroy();
    const admin = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await admin.query(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = '${TEST_DB_NAME}'
          AND pid <> pg_backend_pid()
    `);
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.end();
}

beforeAll(async () => {
    await createDatabase();
    db = new Kysely<Database>({
        dialect: new PostgresDialect({
            pool: new Pool({ connectionString: TEST_DATABASE_URL }),
        }),
    });

    await m001.up(db);
    await m002.up(db);
    await m003.up(db);
    await m004.up(db);
    await m005.up(db);
    await m006.up(db);
    await m013.up(db);
    await m015.up(db);
    await sql`CREATE SCHEMA staging`.execute(db);
    await sql`ALTER TABLE raw_scrape_logs SET SCHEMA staging`.execute(db);
    await m052.up(db);
    await m029.up(db);
    await m030.up(db);
    await m035.up(db);

    const platform = await db
        .insertInto('platforms')
        .values({ name: 'TT Leagues', base_url: 'https://api.example.test' })
        .returning('id')
        .executeTakeFirstOrThrow();
    const league = await db
        .insertInto('leagues')
        .values({ platform_id: platform.id, external_id: 'league-1', name: 'Example League' })
        .returning('id')
        .executeTakeFirstOrThrow();
    const season = await db
        .insertInto('seasons')
        .values({ league_id: league.id, external_id: '2025-26', name: '2025-26', is_active: true })
        .returning('id')
        .executeTakeFirstOrThrow();
    const competition = await db
        .insertInto('competitions')
        .values({ season_id: season.id, external_id: 'division-1', name: 'Division 1', type: 'league' })
        .returning('id')
        .executeTakeFirstOrThrow();
    const teams = await db
        .insertInto('teams')
        .values([
            { competition_id: competition.id, external_id: 'home', name: 'Home' },
            { competition_id: competition.id, external_id: 'away', name: 'Away' },
        ])
        .returning('id')
        .execute();
    const fixture = await db
        .insertInto('fixtures')
        .values({
            competition_id: competition.id,
            external_id: 'fixture-1',
            home_team_id: teams[0]!.id,
            away_team_id: teams[1]!.id,
            date_played: '2026-01-10',
            status: 'completed',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    const players = await db
        .insertInto('external_players')
        .values([
            { platform_id: platform.id, external_id: 'p1', name: 'Alex One' },
            { platform_id: platform.id, external_id: 'p2', name: 'Alex Two' },
        ])
        .returning('id')
        .execute();
    await db
        .insertInto('rubbers')
        .values([
            {
                fixture_id: fixture.id,
                external_id: 'rubber-1',
                home_player_1_id: players[0]!.id,
                away_player_1_id: players[1]!.id,
                home_games_won: 3,
                away_games_won: 1,
                outcome_type: 'normal',
            },
            {
                fixture_id: fixture.id,
                external_id: 'rubber-2',
                home_player_1_id: players[1]!.id,
                away_player_1_id: players[0]!.id,
                home_games_won: 2,
                away_games_won: 3,
                outcome_type: 'normal',
            },
        ])
        .execute();

    const instance = await db
        .insertInto('source_instances')
        .values({
            platform_id: platform.id,
            key: 'example-league',
            name: 'Example League',
            base_url: 'https://example.ttleagues.test',
            adapter_key: 'ttleagues',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    await db
        .insertInto('source_resources')
        .values({
            source_instance_id: instance.id,
            resource_type: 'standings',
            external_id: 'division-1',
            adapter_version: '1.0.0',
            competition_id: competition.id,
            consecutive_failures: 2,
            last_fetched_at: new Date('2026-07-29T12:00:00Z'),
            last_error: 'HTTP 503',
        })
        .execute();
    await db
        .insertInto('staging.raw_scrape_logs')
        .values({
            platform_id: platform.id,
            endpoint_url: 'https://example.test/results',
            raw_payload: '{}',
            payload_hash: 'quality-test-hash',
            status: 'failed',
            scraped_at: new Date('2026-07-29T13:00:00Z'),
        })
        .execute();
    await db
        .insertInto('player_identity_decisions')
        .values({
            source_player_id: players[0]!.id,
            canonical_player_id: players[1]!.id,
            status: 'suggested',
            confidence: 0.65,
            evidence: { rule: 'test' },
            created_by: 'automatic',
        })
        .execute();

    const snapshot = await buildSourceQualitySnapshot(db);
    await db
        .insertInto('source_quality_snapshots')
        .values({
            key: 'global',
            content: snapshot,
            generated_at: new Date(snapshot.generated_at),
        })
        .execute();

    const app = await buildApp(db);
    await app.ready();
    request = supertest(app.server);
}, 30_000);

afterAll(async () => {
    await dropDatabase();
}, 15_000);

describe('GET /api/sources/quality', () => {
    it('returns the worker-built source health snapshot', async () => {
        const response = await request.get('/api/sources/quality').expect(200);

        expect(response.headers['cache-control']).toContain('max-age=300');
        expect(response.headers.etag).toMatch(/^W\/"source-quality-[^"]+"$/);
        expect(response.body.summary).toMatchObject({
            providers: 1,
            healthy: 0,
            degraded: 1,
            unobserved: 0,
            leagues: 1,
            competitions: 1,
            canonical_players: 2,
            rubbers: 2,
            dated_rubbers_pct: 100,
            full_score_rubbers_pct: 100,
            missing_player_rubbers: 0,
            pending_identity_suggestions: 1,
            unhealthy_resources: 1,
        });
        expect(response.body.sources).toEqual([
            expect.objectContaining({
                name: 'TT Leagues',
                health: 'degraded',
                leagues: 1,
                competitions: 1,
                fixtures: 1,
                rubbers: 2,
                dated_rubbers_pct: 100,
                full_score_rubbers_pct: 100,
                source_instances: 1,
                source_resources: 1,
                unhealthy_resources: 1,
                total_scrapes: 1,
                failed_scrapes: 1,
                latest_activity_at: '2026-07-29T13:00:00.000Z',
                last_error: 'HTTP 503',
            }),
        ]);
    });
});
