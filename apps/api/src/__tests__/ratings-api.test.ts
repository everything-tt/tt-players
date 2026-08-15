import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, PostgresDialect } from 'kysely';
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
import * as m031 from '../../../../packages/db/src/migrations/031_create_weekly_rating_history.js';
import * as m042 from '../../../../packages/db/src/migrations/042_create_rating_audit_foundation.js';
import * as m043 from '../../../../packages/db/src/migrations/043_create_rating_player_coverage.js';
import * as m045 from '../../../../packages/db/src/migrations/045_create_current_rating_rankings.js';
import { buildApp } from '../app.js';

const { Pool } = pg;
const TEST_DB_NAME = `tt_players_ratings_api_test_${process.pid}`;
const TEST_DATABASE_BASE_URL = process.env.TEST_DATABASE_BASE_URL ?? 'postgres://postgres:postgres@localhost:5432';
const ADMIN_DATABASE_URL = `${TEST_DATABASE_BASE_URL}/postgres`;
const TEST_DATABASE_URL = `${TEST_DATABASE_BASE_URL}/${TEST_DB_NAME}`;

let db: Kysely<Database>;
let app: Awaited<ReturnType<typeof buildApp>>;
let higherPlayerId: string;
let lowerPlayerId: string;

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
    await m031.up(db);
    await m042.up(db);
    await m043.up(db);
    await m045.up(db);

    const platform = await db
        .insertInto('platforms')
        .values({ name: 'Test Platform', base_url: 'https://example.test' })
        .returning('id')
        .executeTakeFirstOrThrow();
    const players = await db
        .insertInto('external_players')
        .values([
            { platform_id: platform.id, external_id: 'higher', name: 'Higher Player' },
            { platform_id: platform.id, external_id: 'lower', name: 'Lower Player' },
        ])
        .returning('id')
        .execute();
    higherPlayerId = players[0]!.id;
    lowerPlayerId = players[1]!.id;

    const model = await db
        .selectFrom('rating_models')
        .select('id')
        .where('key', '=', 'global-singles-glicko2-v1')
        .executeTakeFirstOrThrow();

    await db
        .insertInto('player_ratings')
        .values([
            {
                model_id: model.id,
                player_id: higherPlayerId,
                rating: 1700,
                rating_deviation: 60,
                volatility: 0.06,
                conservative_rating: 1580,
                rated_matches: 20,
                rated_wins: 15,
                rated_losses: 5,
                first_rated_at: '2026-01-01',
                last_rated_at: '2026-07-20',
                provisional: false,
            },
            {
                model_id: model.id,
                player_id: lowerPlayerId,
                rating: 1500,
                rating_deviation: 90,
                volatility: 0.06,
                conservative_rating: 1320,
                rated_matches: 12,
                rated_wins: 5,
                rated_losses: 7,
                first_rated_at: '2026-02-01',
                last_rated_at: '2026-07-20',
                provisional: false,
            },
        ])
        .execute();

    await db.insertInto('rating_player_coverage').values([
        {
            model_id: model.id,
            player_id: higherPlayerId,
            category: 'covered',
            raw_matches: 20,
            singles_matches: 20,
            normal_singles_matches: 20,
            eligible_matches_all_time: 20,
            eligible_matches_in_window: 20,
            unique_opponents_in_window: 12,
            first_match_date: '2026-01-01',
            last_match_date: '2026-07-20',
            rating_exists: true,
            rated_matches: 20,
            rating_deviation: 60,
            updated_at: new Date('2026-08-06T05:17:00Z'),
        },
        {
            model_id: model.id,
            player_id: lowerPlayerId,
            category: 'covered',
            raw_matches: 12,
            singles_matches: 12,
            normal_singles_matches: 12,
            eligible_matches_all_time: 12,
            eligible_matches_in_window: 12,
            unique_opponents_in_window: 8,
            first_match_date: '2026-02-01',
            last_match_date: '2026-07-20',
            rating_exists: true,
            rated_matches: 12,
            rating_deviation: 90,
            updated_at: new Date('2026-08-06T05:17:00Z'),
        },
    ]).execute();

    await db.insertInto('rating_current_rankings').values([
        {
            model_id: model.id,
            player_id: higherPlayerId,
            effective_deviation: 64,
            effective_conservative_rating: 1572,
            days_inactive: 17,
            unique_opponents: 12,
            eligible: true,
            eligibility_reason: 'ranked',
            current_rank: 1,
            historical_rank: 1,
            calculated_at: new Date('2026-08-06T05:17:00Z'),
        },
        {
            model_id: model.id,
            player_id: lowerPlayerId,
            effective_deviation: 94,
            effective_conservative_rating: 1312,
            days_inactive: 17,
            unique_opponents: 8,
            eligible: true,
            eligibility_reason: 'ranked',
            current_rank: 2,
            historical_rank: 2,
            calculated_at: new Date('2026-08-06T05:17:00Z'),
        },
    ]).execute();

    await db
        .insertInto('rating_processing_state')
        .values({
            model_id: model.id,
            status: 'idle',
            last_processed_date: '2026-07-20',
            processed_periods: 10,
            processed_matches: 32,
            updated_at: new Date('2026-07-20T12:00:00Z'),
        })
        .execute();

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

describe('calculated ratings API', () => {
    it('lists active current rankings with pagination, volatility and processing state', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/api/ratings?page=1&page_size=1',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            data: [
                {
                    rank: 1,
                    player_id: higherPlayerId,
                    player_name: 'Higher Player',
                    rating: 1700,
                    rating_deviation: 64,
                    volatility: 0.06,
                    conservative_rating: 1572,
                },
            ],
            pagination: {
                page: 1,
                page_size: 1,
                total: 2,
                total_pages: 2,
            },
            ranking: 'active',
            processing: {
                status: 'idle',
                processed_periods: 10,
                processed_matches: 32,
            },
        });
    });

    it('can still serve historical rankings', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/api/ratings?ranking=historical&page=1&page_size=1',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            ranking: 'historical',
            data: [{
                rank: 1,
                player_id: higherPlayerId,
                rating_deviation: 60,
                volatility: 0.06,
                conservative_rating: 1580,
            }],
        });
    });

    it('predicts a match with complementary probabilities using current uncertainty', async () => {
        const response = await app.inject({
            method: 'GET',
            url: `/api/ratings/predict?player1_id=${higherPlayerId}&player2_id=${lowerPlayerId}`,
        });

        expect(response.statusCode).toBe(200);
        const payload = response.json();
        expect(payload.player1.volatility).toBe(0.06);
        expect(payload.player2.volatility).toBe(0.06);
        expect(payload.player1.win_probability).toBeGreaterThan(0.5);
        expect(payload.player1.win_probability + payload.player2.win_probability).toBeCloseTo(1, 4);
        expect(payload.confidence).toBe('medium');
    });

    it('rejects prediction against the same player', async () => {
        const response = await app.inject({
            method: 'GET',
            url: `/api/ratings/predict?player1_id=${higherPlayerId}&player2_id=${higherPlayerId}`,
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({
            error: 'Choose two different players',
            statusCode: 400,
        });
    });

    it('returns the current rank, effective uncertainty and volatility for a player', async () => {
        const response = await app.inject({
            method: 'GET',
            url: `/api/ratings/${lowerPlayerId}`,
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            data: {
                rank: 2,
                player_id: lowerPlayerId,
                player_name: 'Lower Player',
                rating_deviation: 94,
                volatility: 0.06,
                conservative_rating: 1312,
            },
        });
    });

    it('returns ranking policy and player eligibility evidence', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/api/ratings/audit/ranking-quality',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            policy: {
                active_days: 365,
                minimum_matches: 10,
                minimum_unique_opponents: 5,
                maximum_deviation: 110,
            },
            summary: [{ eligibility_reason: 'ranked', count: 2 }],
            pagination: { total: 2 },
        });
    });

    it('returns rating history generated by the rating trigger', async () => {
        const response = await app.inject({
            method: 'GET',
            url: `/api/ratings/${higherPlayerId}/history?range=all`,
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            player_id: higherPlayerId,
            player_name: 'Higher Player',
            range: 'all',
            data: [
                {
                    week_start: '2026-07-20',
                    snapshot_date: '2026-07-20',
                    rating: 1700,
                    rated_matches: 20,
                },
            ],
        });
    });
});
