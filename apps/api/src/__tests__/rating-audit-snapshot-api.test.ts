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
import * as m035 from '../../../../packages/db/src/migrations/035_create_api_read_models.js';
import * as m040 from '../../../../packages/db/src/migrations/040_create_rating_audit_snapshots.js';
import { buildApp } from '../app.js';

const { Pool } = pg;
const TEST_DB_NAME = `tt_players_rating_audit_snapshot_api_test_${process.pid}`;
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

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
    await m035.up(db);
    await m040.up(db);

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

describe('rating audit snapshot API', () => {
    it('returns 404 until the worker has generated a snapshot, then serves the stored JSON row', async () => {
        const missingResponse = await app.inject({
            method: 'GET',
            url: '/api/ratings/audit/summary',
        });

        expect(missingResponse.statusCode).toBe(404);
        expect(missingResponse.json()).toEqual({
            error: 'Rating audit snapshot is not available yet',
            statusCode: 404,
        });

        const model = await db
            .selectFrom('rating_models')
            .select('id')
            .where('key', '=', 'global-singles-glicko2-v1')
            .executeTakeFirstOrThrow();
        const generatedAt = new Date('2026-08-03T05:17:00.000Z');

        await db
            .insertInto('rating_audit_snapshots')
            .values({
                model_id: model.id,
                generated_at: generatedAt,
                updated_at: generatedAt,
                content: {
                    model: {
                        key: 'global-singles-glicko2-v1',
                        status: 'idle',
                        last_processed_date: '2026-08-02',
                        processed_periods: 100,
                        processed_matches: 1234,
                        updated_at: '2026-08-02T23:00:00.000Z',
                        rated_players: 500,
                        established_players: 450,
                        provisional_players: 50,
                        average_deviation: 72.5,
                        first_rated_date: '2024-01-01',
                        last_rated_date: '2026-08-02',
                    },
                    data: {
                        stored_rubbers: 1500,
                        active_rubbers: 1400,
                        eligible_singles: 1200,
                        excluded_rubbers: 200,
                        doubles: 80,
                        non_normal_outcome: 40,
                        missing_date: 20,
                        missing_identity: 30,
                        same_canonical_player: 10,
                        tied_score: 20,
                    },
                    identities: {
                        source_records: 750,
                        active_records: 700,
                        canonical_players: 500,
                        linked_aliases: 250,
                        active_aliases: 200,
                        soft_deleted_aliases: 50,
                        unassigned_records: 20,
                        broken_targets: 0,
                        chained_links: 0,
                        deleted_targets: 0,
                        same_name_candidate_groups: 4,
                        multi_source_players: 120,
                    },
                    network: {
                        eligible_matches: 1200,
                        connected_players: 490,
                        unique_pairings: 860,
                        average_unique_opponents: 7.2,
                        maximum_unique_opponents: 44,
                        one_opponent_players: 8,
                        three_or_fewer_opponent_players: 35,
                        competitions: 28,
                        first_match_date: '2024-01-01',
                        last_match_date: '2026-08-02',
                    },
                    network_anomalies: [
                        {
                            player_id: '11111111-1111-4111-8111-111111111111',
                            player_name: 'Thin Network Player',
                            rating: 1680,
                            rating_deviation: 118,
                            rated_matches: 8,
                            unique_opponents: 3,
                            provisional: true,
                        },
                    ],
                },
            })
            .execute();

        const response = await app.inject({
            method: 'GET',
            url: '/api/ratings/audit/summary',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            generated_at: generatedAt.toISOString(),
            model: {
                key: 'global-singles-glicko2-v1',
                rated_players: 500,
            },
            data: {
                eligible_singles: 1200,
                excluded_rubbers: 200,
            },
            identities: {
                linked_aliases: 250,
            },
            network: {
                unique_pairings: 860,
            },
            network_anomalies: [
                {
                    player_name: 'Thin Network Player',
                    unique_opponents: 3,
                },
            ],
        });
    });
});
