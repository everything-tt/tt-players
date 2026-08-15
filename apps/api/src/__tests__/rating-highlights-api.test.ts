import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import type { Database } from '@tt-players/db';
import * as m001 from '../../../../packages/db/src/migrations/001_create_enums.js';
import * as m002 from '../../../../packages/db/src/migrations/002_create_core_tables.js';
import * as m003 from '../../../../packages/db/src/migrations/003_create_match_tables.js';
import * as m005 from '../../../../packages/db/src/migrations/005_make_rubber_players_nullable.js';
import * as m006 from '../../../../packages/db/src/migrations/006_add_canonical_player_id_to_external_players.js';
import * as m013 from '../../../../packages/db/src/migrations/013_add_rubber_score_source.js';
import * as m015 from '../../../../packages/db/src/migrations/015_add_rubber_played_at.js';
import * as m028 from '../../../../packages/db/src/migrations/028_create_calculated_ratings.js';
import * as m049 from '../../../../packages/db/src/migrations/049_create_rating_calculation_audit.js';
import { buildApp } from '../app.js';

const { Pool } = pg;
const TEST_DB_NAME = `tt_players_rating_highlights_api_test_${process.pid}`;
const TEST_DATABASE_BASE_URL = process.env.TEST_DATABASE_BASE_URL ?? 'postgres://postgres:postgres@localhost:5432';
const ADMIN_DATABASE_URL = `${TEST_DATABASE_BASE_URL}/postgres`;
const TEST_DATABASE_URL = `${TEST_DATABASE_BASE_URL}/${TEST_DB_NAME}`;

let db: Kysely<Database>;
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
    const admin = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    await admin.end();

    db = new Kysely<Database>({
        dialect: new PostgresDialect({
            pool: new Pool({ connectionString: TEST_DATABASE_URL }),
        }),
    });

    await m001.up(db);
    await m002.up(db);
    await m003.up(db);
    await m005.up(db);
    await m006.up(db);
    await m013.up(db);
    await m015.up(db);
    await m028.up(db);
    await m049.up(db);

    const platform = await db
        .insertInto('platforms')
        .values({ name: 'Test Platform', base_url: 'https://example.test' })
        .returning('id')
        .executeTakeFirstOrThrow();
    const players = await db
        .insertInto('external_players')
        .values([
            { platform_id: platform.id, external_id: 'established-one', name: 'Established One' },
            { platform_id: platform.id, external_id: 'established-two', name: 'Established Two' },
            { platform_id: platform.id, external_id: 'bootstrap', name: 'Bootstrap Player' },
            { platform_id: platform.id, external_id: 'low-confidence', name: 'Low Confidence' },
            { platform_id: platform.id, external_id: 'opponent', name: 'Strong Opponent' },
        ])
        .returning('id')
        .execute();

    const [establishedOne, establishedTwo, bootstrap, lowConfidence, opponent] = players;
    const model = await db
        .selectFrom('rating_models')
        .select('id')
        .where('key', '=', 'global-singles-glicko2-v1')
        .executeTakeFirstOrThrow();

    const runResult = await sql<{ id: string }>`
        INSERT INTO rating_calculation_runs (
            model_id, model_key, model_version, started_at, completed_at,
            source_data_cutoff, code_commit_sha, algorithm_parameters,
            input_hash, run_status, processed_periods, processed_matches
        ) VALUES (
            ${model.id}::uuid, 'global-singles-glicko2-v1', 'v1',
            '2026-08-08T08:00:00Z', '2026-08-08T08:03:00Z', '2026-08-07',
            'highlight-sha', '{"tau":0.5}'::jsonb,
            'highlight-input', 'complete', 1, 2
        ) RETURNING id
    `.execute(db);
    const runId = runResult.rows[0]!.id;

    const periods = await sql<{ id: string; player_id: string }>`
        INSERT INTO rating_period_audits (
            run_id, model_id, rating_date, player_id,
            rating_before, rating_deviation_before, volatility_before, ranking_score_before, public_rank_before,
            rating_after, rating_deviation_after, volatility_after, ranking_score_after, public_rank_after,
            rated_matches_in_period, total_rated_matches, unique_opponent_count,
            provisional_before, provisional_after, combined_rating_delta
        ) VALUES
        (
            ${runId}::uuid, ${model.id}::uuid, '2026-08-07', ${establishedOne!.id}::uuid,
            1800, 100, 0.06, 1600, 200,
            1950, 90, 0.06, 1770, 140,
            3, 40, 20, false, false, 150
        ),
        (
            ${runId}::uuid, ${model.id}::uuid, '2026-08-07', ${establishedTwo!.id}::uuid,
            1700, 120, 0.06, 1460, 300,
            1780, 110, 0.06, 1560, 250,
            2, 28, 15, false, false, 80
        ),
        (
            ${runId}::uuid, ${model.id}::uuid, '2026-08-07', ${bootstrap!.id}::uuid,
            1500, 350, 0.06, 800, NULL,
            2400, 280, 0.06, 1840, 100,
            2, 2, 2, true, true, 900
        ),
        (
            ${runId}::uuid, ${model.id}::uuid, '2026-08-07', ${lowConfidence!.id}::uuid,
            1600, 280, 0.06, 1040, 500,
            2050, 240, 0.06, 1570, 240,
            2, 12, 8, false, false, 450
        )
        RETURNING id, player_id
    `.execute(db);

    const establishedOnePeriod = periods.rows.find((row) => row.player_id === establishedOne!.id)!;
    const establishedTwoPeriod = periods.rows.find((row) => row.player_id === establishedTwo!.id)!;
    const rubberIds = await sql<{ first: string; second: string }>`
        SELECT gen_random_uuid() AS first, gen_random_uuid() AS second
    `.execute(db);
    const rubberId = rubberIds.rows[0]!;

    await sql`
        INSERT INTO rating_match_audits (
            run_id, period_audit_id, rating_date, rubber_id, side, player_id, opponent_id,
            result, game_score, player_rating_before, player_rating_deviation_before,
            opponent_rating_before, opponent_rating_deviation_before,
            expected_win_probability, actual_score, surprise_value,
            attributed_rating_delta, information_contribution, included
        ) VALUES
        (
            ${runId}::uuid, ${establishedOnePeriod.id}::uuid, '2026-08-07', ${rubberId.first}::uuid,
            'home', ${establishedOne!.id}::uuid, ${opponent!.id}::uuid,
            'win', '3-1', 1800, 100, 2200, 70, 0.01, 1, 0.99, 90, 0.9, true
        ),
        (
            ${runId}::uuid, ${establishedTwoPeriod.id}::uuid, '2026-08-06', ${rubberId.second}::uuid,
            'home', ${establishedTwo!.id}::uuid, ${opponent!.id}::uuid,
            'win', '3-2', 1700, 120, 2200, 70, 0.05, 1, 0.95, 55, 0.8, true
        )
    `.execute(db);

    app = await buildApp(db);
    await app.ready();
}, 30_000);

afterAll(async () => {
    await app.close();
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
}, 15_000);

describe('GET /api/ratings/highlights', () => {
    it('returns established rating jumps and surprise wins from the latest complete run', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/api/ratings/highlights?limit=10',
        });

        expect(response.statusCode).toBe(200);
        const payload = response.json();
        expect(payload.run).toMatchObject({ source_data_cutoff: '2026-08-07' });
        expect(payload.rating_jumps.map((row: { player_name: string }) => row.player_name)).toEqual([
            'Established One',
            'Established Two',
        ]);
        expect(payload.rating_jumps[0]).toMatchObject({
            change: 150,
            rating_before: 1800,
            rating_after: 1950,
            rating_deviation_after: 90,
            public_rank_after: 140,
        });
        expect(payload.surprise_wins.map((row: { player_name: string }) => row.player_name)).toEqual([
            'Established One',
            'Established Two',
        ]);
        expect(payload.surprise_wins[0]).toMatchObject({
            expected_win_probability: 0.01,
            surprise: 0.99,
            game_score: '3-1',
        });
    });

    it('applies the shared list limit and validates its bounds', async () => {
        const limited = await app.inject({
            method: 'GET',
            url: '/api/ratings/highlights?limit=1',
        });
        expect(limited.statusCode).toBe(200);
        expect(limited.json().rating_jumps).toHaveLength(1);
        expect(limited.json().surprise_wins).toHaveLength(1);

        const invalid = await app.inject({
            method: 'GET',
            url: '/api/ratings/highlights?limit=0',
        });
        expect(invalid.statusCode).toBe(400);
    });
});
