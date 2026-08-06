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
import * as m032 from '../../../../packages/db/src/migrations/032_create_rating_replay_checkpoints.js';
import * as m035 from '../../../../packages/db/src/migrations/035_create_api_read_models.js';
import * as m040 from '../../../../packages/db/src/migrations/040_create_rating_audit_snapshots.js';
import * as m042 from '../../../../packages/db/src/migrations/042_create_rating_audit_foundation.js';
import * as m043 from '../../../../packages/db/src/migrations/043_create_rating_player_coverage.js';
import * as m044 from '../../../../packages/db/src/migrations/044_create_rating_source_quality.js';
import { buildApp } from '../app.js';

const { Pool } = pg;
const TEST_DB_NAME = `tt_players_rating_source_quality_api_test_${process.pid}`;
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
    await m031.up(db);
    await m032.up(db);
    await m035.up(db);
    await m040.up(db);
    await m042.up(db);
    await m043.up(db);
    await m044.up(db);

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

describe('rating source quality API', () => {
    it('serves source, competition and duplicate candidate evidence', async () => {
        const platform = await db.insertInto('platforms').values({
            name: 'Quality Platform',
            base_url: 'https://quality.example',
        }).returning('id').executeTakeFirstOrThrow();
        const league = await db.insertInto('leagues').values({
            platform_id: platform.id,
            external_id: 'league-1',
            name: 'Quality League',
            deleted_at: null,
        }).returning('id').executeTakeFirstOrThrow();
        const season = await db.insertInto('seasons').values({
            league_id: league.id,
            external_id: 'season-1',
            name: '2026',
            deleted_at: null,
        }).returning('id').executeTakeFirstOrThrow();
        const competition = await db.insertInto('competitions').values({
            season_id: season.id,
            external_id: 'competition-1',
            name: 'Quality Competition',
            type: 'league',
            last_scraped_at: null,
            deleted_at: null,
        }).returning('id').executeTakeFirstOrThrow();
        const players = await db.insertInto('external_players').values([
            {
                platform_id: platform.id,
                external_id: 'a',
                canonical_player_id: null,
                name: 'Player A',
                updated_at: new Date(),
                deleted_at: null,
            },
            {
                platform_id: platform.id,
                external_id: 'b',
                canonical_player_id: null,
                name: 'Player B',
                updated_at: new Date(),
                deleted_at: null,
            },
        ]).returning(['id', 'name']).execute();
        const playerA = players.find((player) => player.name === 'Player A')!;
        const playerB = players.find((player) => player.name === 'Player B')!;
        const model = await db.selectFrom('rating_models')
            .select('id')
            .where('key', '=', 'global-singles-glicko2-v1')
            .executeTakeFirstOrThrow();

        await db.insertInto('rating_source_quality').values({
            model_id: model.id,
            source_id: platform.id,
            total_rubbers: 100,
            eligible_rubbers: 90,
            missing_identity_rubbers: 4,
            missing_date_rubbers: 1,
            invalid_single_rubbers: 5,
            suspicious_date_rubbers: 1,
            duplicate_candidate_groups: 2,
            conflicting_candidate_groups: 1,
            first_match_date: '2010-01-01',
            last_match_date: '2026-07-20',
            updated_at: new Date(),
        }).execute();
        await db.insertInto('rating_competition_quality').values({
            model_id: model.id,
            competition_id: competition.id,
            source_id: platform.id,
            total_rubbers: 20,
            eligible_rubbers: 17,
            missing_identity_rubbers: 2,
            missing_date_rubbers: 0,
            invalid_single_rubbers: 3,
            suspicious_date_rubbers: 0,
            duplicate_candidate_groups: 1,
            conflicting_candidate_groups: 1,
            first_match_date: '2026-01-01',
            last_match_date: '2026-07-20',
            updated_at: new Date(),
        }).execute();
        const candidate = await db.insertInto('rating_duplicate_candidate_groups').values({
            model_id: model.id,
            competition_id: competition.id,
            match_date: '2026-07-20',
            player_a_id: playerA.id,
            player_b_id: playerB.id,
            candidate_type: 'conflicting_score_candidate',
            rubber_count: 2,
            rubber_ids: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
            source_ids: [platform.id],
            score_signatures: ['3:1', '1:3'],
            updated_at: new Date(),
        }).returning('id').executeTakeFirstOrThrow();

        const sourceResponse = await app.inject({
            method: 'GET',
            url: '/api/ratings/audit/sources',
        });
        expect(sourceResponse.statusCode).toBe(200);
        expect(sourceResponse.json()).toMatchObject({
            data: [{
                source_id: platform.id,
                source_name: 'Quality Platform',
                total_rubbers: 100,
                eligible_rubbers: 90,
                missing_identity_rubbers: 4,
                conflicting_candidate_groups: 1,
            }],
            pagination: { total: 1 },
        });

        const competitionResponse = await app.inject({
            method: 'GET',
            url: `/api/ratings/audit/competitions?source_id=${platform.id}&search=Quality`,
        });
        expect(competitionResponse.statusCode).toBe(200);
        expect(competitionResponse.json()).toMatchObject({
            data: [{
                competition_id: competition.id,
                competition_name: 'Quality Competition',
                missing_identity_rubbers: 2,
            }],
            pagination: { total: 1 },
        });

        const duplicateResponse = await app.inject({
            method: 'GET',
            url: '/api/ratings/audit/duplicate-candidates?candidate_type=conflicting_score_candidate',
        });
        expect(duplicateResponse.statusCode).toBe(200);
        expect(duplicateResponse.json()).toMatchObject({
            data: [{
                id: candidate.id,
                candidate_type: 'conflicting_score_candidate',
                competition_name: 'Quality Competition',
                player_a_name: 'Player A',
                player_b_name: 'Player B',
                rubber_count: 2,
            }],
            pagination: { total: 1 },
        });
    });
});
