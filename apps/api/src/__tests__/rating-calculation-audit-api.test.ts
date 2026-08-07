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
const TEST_DB_NAME = `tt_players_rating_calculation_audit_api_test_${process.pid}`;
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

let db: Kysely<Database>;
let app: Awaited<ReturnType<typeof buildApp>>;
let newcomerId: string;
let establishedId: string;
let historicalRubberId: string;
let repeatedRubberId: string;

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
            { platform_id: platform.id, external_id: 'newcomer', name: 'Fast Newcomer' },
            { platform_id: platform.id, external_id: 'established', name: 'Established Player' },
        ])
        .returning('id')
        .execute();
    newcomerId = players[0]!.id;
    establishedId = players[1]!.id;

    const model = await db
        .selectFrom('rating_models')
        .select('id')
        .where('key', '=', 'global-singles-glicko2-v1')
        .executeTakeFirstOrThrow();

    const olderRun = await sql<{ id: string }>`
        INSERT INTO rating_calculation_runs (
            model_id, model_key, model_version, started_at, completed_at,
            source_data_cutoff, code_commit_sha, algorithm_parameters,
            input_hash, run_status, processed_periods, processed_matches
        ) VALUES (
            ${model.id}::uuid, 'global-singles-glicko2-v1', 'v1',
            '2026-08-01T09:00:00Z', '2026-08-01T09:02:00Z', '2026-07-31',
            'older-sha', '{"tau":0.5,"rankingPenalty":2}'::jsonb,
            'older-input', 'complete', 2, 2
        ) RETURNING id
    `.execute(db);
    const olderRunId = olderRun.rows[0]!.id;

    const historicalRubber = await sql<{ id: string }>`SELECT gen_random_uuid() AS id`.execute(db);
    const repeatedRubber = await sql<{ id: string }>`SELECT gen_random_uuid() AS id`.execute(db);
    historicalRubberId = historicalRubber.rows[0]!.id;
    repeatedRubberId = repeatedRubber.rows[0]!.id;

    const oldPeriod = await sql<{ id: string }>`
        INSERT INTO rating_period_audits (
            run_id, model_id, rating_date, player_id,
            rating_before, rating_deviation_before, volatility_before, ranking_score_before, public_rank_before,
            rating_after, rating_deviation_after, volatility_after, ranking_score_after, public_rank_after,
            rated_matches_in_period, total_rated_matches, unique_opponent_count,
            provisional_before, provisional_after, combined_rating_delta
        ) VALUES (
            ${olderRunId}::uuid, ${model.id}::uuid, '2026-07-10', ${newcomerId}::uuid,
            1500, 350, 0.06, 800, NULL,
            1610, 280, 0.06, 1050, 300,
            1, 1, 1, true, true, 110
        ) RETURNING id
    `.execute(db);

    await sql`
        INSERT INTO rating_match_audits (
            run_id, period_audit_id, rating_date, rubber_id, side, player_id, opponent_id,
            result, game_score, player_rating_before, player_rating_deviation_before,
            opponent_rating_before, opponent_rating_deviation_before,
            expected_win_probability, actual_score, surprise_value,
            attributed_rating_delta, information_contribution, included
        ) VALUES
        (
            ${olderRunId}::uuid, ${oldPeriod.rows[0]!.id}::uuid, '2026-07-10', ${historicalRubberId}::uuid,
            'home', ${newcomerId}::uuid, ${establishedId}::uuid,
            'win', '3-1', 1500, 350, 2100, 55, 0.08, 1, 0.92, 110, 0.88, true
        ),
        (
            ${olderRunId}::uuid, ${oldPeriod.rows[0]!.id}::uuid, '2026-07-10', ${historicalRubberId}::uuid,
            'away', ${establishedId}::uuid, ${newcomerId}::uuid,
            'loss', '1-3', 2100, 55, 1500, 350, 0.92, 0, -0.92, -12, 0.12, true
        ),
        (
            ${olderRunId}::uuid, ${oldPeriod.rows[0]!.id}::uuid, '2026-07-20', ${repeatedRubberId}::uuid,
            'home', ${newcomerId}::uuid, ${establishedId}::uuid,
            'win', '3-2', 1610, 280, 2100, 55, 0.18, 1, 0.82, 25, 0.72, true
        )
    `.execute(db);

    const latestRun = await sql<{ id: string }>`
        INSERT INTO rating_calculation_runs (
            model_id, model_key, model_version, started_at, completed_at,
            source_data_cutoff, code_commit_sha, algorithm_parameters,
            input_hash, run_status, processed_periods, processed_matches
        ) VALUES (
            ${model.id}::uuid, 'global-singles-glicko2-v1', 'v1',
            '2026-08-06T11:00:00Z', '2026-08-06T11:03:00Z', '2026-08-05',
            'latest-sha', '{"tau":0.5,"rankingPenalty":2,"provisionalMatches":5}'::jsonb,
            'latest-input', 'complete', 1, 3
        ) RETURNING id
    `.execute(db);
    const latestRunId = latestRun.rows[0]!.id;

    const latestPeriods = await sql<{ id: string; player_id: string }>`
        INSERT INTO rating_period_audits (
            run_id, model_id, rating_date, player_id,
            rating_before, rating_deviation_before, volatility_before, ranking_score_before, public_rank_before,
            rating_after, rating_deviation_after, volatility_after, ranking_score_after, public_rank_after,
            rated_matches_in_period, total_rated_matches, unique_opponent_count,
            provisional_before, provisional_after, combined_rating_delta
        ) VALUES
        (
            ${latestRunId}::uuid, ${model.id}::uuid, '2026-07-20', ${newcomerId}::uuid,
            1610, 280, 0.06, 1050, 300,
            1640, 230, 0.06, 1180, 250,
            1, 2, 1, true, true, 30
        ),
        (
            ${latestRunId}::uuid, ${model.id}::uuid, '2026-07-20', ${establishedId}::uuid,
            2100, 55, 0.06, 1990, 12,
            2094, 54, 0.06, 1986, 13,
            1, 45, 20, false, false, -6
        )
        RETURNING id, player_id
    `.execute(db);
    const newcomerPeriodId = latestPeriods.rows.find((row) => row.player_id === newcomerId)!.id;
    const establishedPeriodId = latestPeriods.rows.find((row) => row.player_id === establishedId)!.id;
    const excludedRubber = await sql<{ id: string }>`SELECT gen_random_uuid() AS id`.execute(db);

    await sql`
        INSERT INTO rating_match_audits (
            run_id, period_audit_id, rating_date, rubber_id, side, player_id, opponent_id,
            result, game_score, player_rating_before, player_rating_deviation_before,
            opponent_rating_before, opponent_rating_deviation_before,
            expected_win_probability, actual_score, surprise_value,
            attributed_rating_delta, information_contribution, included, exclusion_reason
        ) VALUES
        (
            ${latestRunId}::uuid, ${newcomerPeriodId}::uuid, '2026-07-20', ${repeatedRubberId}::uuid,
            'home', ${newcomerId}::uuid, ${establishedId}::uuid,
            'win', '3-2', 1610, 280, 2100, 55, 0.18, 1, 0.82, 30, 0.72, true, NULL
        ),
        (
            ${latestRunId}::uuid, ${establishedPeriodId}::uuid, '2026-07-20', ${repeatedRubberId}::uuid,
            'away', ${establishedId}::uuid, ${newcomerId}::uuid,
            'loss', '2-3', 2100, 55, 1610, 280, 0.82, 0, -0.82, -6, 0.28, true, NULL
        ),
        (
            ${latestRunId}::uuid, NULL, '2026-07-21', ${excludedRubber.rows[0]!.id}::uuid,
            'home', ${newcomerId}::uuid, ${establishedId}::uuid,
            NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, 'walkover'
        ),
        (
            ${latestRunId}::uuid, NULL, '2026-07-21', ${excludedRubber.rows[0]!.id}::uuid,
            'away', ${establishedId}::uuid, ${newcomerId}::uuid,
            NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, 'walkover'
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

describe('rating calculation audit API', () => {
    it('summarises the latest run without double-counting player-perspective match rows', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/api/ratings/audit/calculation-runs/latest',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            run: {
                model_key: 'global-singles-glicko2-v1',
                model_version: 'v1',
                code_commit_sha: 'latest-sha',
                run_status: 'complete',
                processed_periods: 1,
                processed_matches: 3,
                algorithm_parameters: {
                    tau: 0.5,
                    rankingPenalty: 2,
                    provisionalMatches: 5,
                },
            },
            summary: {
                included_matches: 1,
                excluded_matches: 1,
                players: 2,
                provisional_players: 1,
                exclusions_by_reason: [{ reason: 'walkover', matches: 1 }],
            },
            movers: {
                increases: [{ player_id: newcomerId, player_name: 'Fast Newcomer', change: 30 }],
                decreases: [{ player_id: establishedId, player_name: 'Established Player', change: -6 }],
            },
            exceptional_results: [{
                player_id: newcomerId,
                opponent_id: establishedId,
                expected_win_probability: 0.18,
                surprise: 0.82,
                attributed_rating_delta: 30,
            }],
            backtest: null,
        });
    });

    it('returns deduplicated player evidence while preserving history from older complete runs', async () => {
        const response = await app.inject({
            method: 'GET',
            url: `/api/ratings/${newcomerId}/audit-evidence?limit=20`,
        });

        expect(response.statusCode).toBe(200);
        const payload = response.json();
        expect(payload.player_id).toBe(newcomerId);
        expect(payload.data).toHaveLength(2);
        expect(payload.data.map((row: { rubber_id: string }) => row.rubber_id)).toEqual([
            repeatedRubberId,
            historicalRubberId,
        ]);
        expect(payload.data[0]).toMatchObject({
            opponent_id: establishedId,
            opponent_name: 'Established Player',
            result: 'win',
            game_score: '3-2',
            expected_win_probability: 0.18,
            attributed_rating_delta: 30,
            rating_after: 1640,
            rating_deviation_after: 230,
            public_rank_after: 250,
            provisional_after: true,
            period_matches: 1,
            period_combined_delta: 30,
        });
        expect(payload.data[1]).toMatchObject({
            rubber_id: historicalRubberId,
            attributed_rating_delta: 110,
            rating_after: 1610,
        });
    });
});
