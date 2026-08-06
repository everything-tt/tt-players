import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';

import * as m001 from '../migrations/001_create_enums.js';
import * as m002 from '../migrations/002_create_core_tables.js';
import * as m018 from '../migrations/018_add_competition_event_display_fields.js';
import * as m036 from '../migrations/036_create_tournament_sources.js';
import * as m041 from '../migrations/041_create_competition_embeddings.js';
import * as m048 from '../migrations/048_alter_competition_embeddings_embedding_to_float8.js';

const { Pool } = pg;

const TEST_DB_NAME = `tt_players_embeddings_test_${process.pid}_${process.env.VITEST_POOL_ID ?? 'main'}`;
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;

let db: Kysely<any>;

beforeAll(async () => {
    const admin = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    // Mirror production search_path so unqualified tables resolve to public,
    // then staging. The competition_embeddings table lives in staging.
    await admin.query(`ALTER DATABASE ${TEST_DB_NAME} SET search_path TO public, staging`);
    await admin.end();

    db = new Kysely<any>({
        dialect: new PostgresDialect({
            pool: new Pool({ connectionString: TEST_DATABASE_URL }),
        }),
    });

    // Minimal migration chain that produces staging.competition_embeddings:
    //   001 enums -> 002 core (competitions FK chain) -> 018 event_date
    //   -> 036 tournament_match_candidates -> 041 embeddings table (jsonb)
    //   -> 048 alter embedding column to double precision[]
    // The staging schema is normally created by 020, but 020 also relocates a
    // batch of already-created tables; creating the schema directly keeps this
    // test focused on the embeddings column.
    await m001.up(db);
    await m002.up(db);
    await m018.up(db);
    await m036.up(db);
    await sql`CREATE SCHEMA IF NOT EXISTS staging`.execute(db);
    await m041.up(db);
    await m048.up(db);
}, 30_000);

afterAll(async () => {
    if (db) await db.destroy();
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

async function seedCompetition(): Promise<string> {
    const platform = await db
        .insertInto('platforms')
        .values({ name: 'test-platform', base_url: 'https://test.example' })
        .returning('id')
        .executeTakeFirstOrThrow();
    const league = await db
        .insertInto('leagues')
        .values({ platform_id: platform.id, external_id: 'league-1', name: 'Test League' })
        .returning('id')
        .executeTakeFirstOrThrow();
    const season = await db
        .insertInto('seasons')
        .values({ league_id: league.id, external_id: 'season-1', name: 'Test Season' })
        .returning('id')
        .executeTakeFirstOrThrow();
    const competition = await db
        .insertInto('competitions')
        .values({
            season_id: season.id,
            external_id: 'competition-1',
            name: 'Test Competition',
            type: 'league' as any,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    return competition.id;
}

describe('048_alter_competition_embeddings_embedding_to_float8', () => {
    it('stores the embedding column as a native double precision[] array', async () => {
        const columns = await sql<{ udt_name: string; data_type: string }>`
            SELECT udt_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'staging'
              AND table_name = 'competition_embeddings'
              AND column_name = 'embedding'
        `.execute(db);

        expect(columns.rows).toHaveLength(1);
        // `_float8` is the array-of-double-precision type name; `ARRAY` is the
        // information_schema data_type for any array type.
        expect(columns.rows[0]!.udt_name).toBe('_float8');
        expect(columns.rows[0]!.data_type).toBe('ARRAY');
    });

    it('round-trips a JS number[] embedding through insert and select', async () => {
        const competitionId = await seedCompetition();
        const vector = Array.from({ length: 384 }, (_, index) => (index + 1) / 1000);

        await db
            .insertInto('staging.competition_embeddings')
            .values({
                competition_id: competitionId,
                provider: 'cloudflare-workers-ai',
                model: '@cf/baai/bge-small-en-v1.5',
                dimensions: 384,
                input_text: 'table tennis tournament: test open',
                input_hash: 'hash-1',
                embedding: vector,
                created_at: new Date(),
                updated_at: new Date(),
            })
            .execute();

        const row = await db
            .selectFrom('staging.competition_embeddings')
            .select('embedding')
            .where('competition_id', '=', competitionId)
            .executeTakeFirstOrThrow();

        // node-postgres returns a double precision[] column as a JS number[].
        // This is the exact regression: with jsonb, the insert failed with
        // "invalid input syntax for type json" because the array was sent as a
        // PostgreSQL array literal.
        expect(Array.isArray(row.embedding)).toBe(true);
        expect(row.embedding).toHaveLength(384);
        expect(row.embedding).toEqual(vector);
    });

    it('upserts via onConflict doUpdateSet with a number[] embedding', async () => {
        const competitionId = await seedCompetition();
        const first = Array.from({ length: 384 }, () => 0);
        const second = Array.from({ length: 384 }, (_, index) => (index + 2) / 1000);

        await db
            .insertInto('staging.competition_embeddings')
            .values({
                competition_id: competitionId,
                provider: 'cloudflare-workers-ai',
                model: '@cf/baai/bge-small-en-v1.5',
                dimensions: 384,
                input_text: 'table tennis tournament: test open',
                input_hash: 'hash-2',
                embedding: first,
                created_at: new Date(),
                updated_at: new Date(),
            })
            .onConflict((conflict) =>
                conflict.column('competition_id').doUpdateSet({
                    embedding: second,
                    input_hash: 'hash-2b',
                    updated_at: new Date(),
                }),
            )
            .execute();

        // A second upsert on the same PK must overwrite the vector with the new
        // number[] — this mirrors the worker's cache-refresh path.
        await db
            .insertInto('staging.competition_embeddings')
            .values({
                competition_id: competitionId,
                provider: 'cloudflare-workers-ai',
                model: '@cf/baai/bge-small-en-v1.5',
                dimensions: 384,
                input_text: 'table tennis tournament: test open',
                input_hash: 'hash-2b',
                embedding: first,
                created_at: new Date(),
                updated_at: new Date(),
            })
            .onConflict((conflict) =>
                conflict.column('competition_id').doUpdateSet({
                    embedding: second,
                    input_hash: 'hash-2b',
                    updated_at: new Date(),
                }),
            )
            .execute();

        const row = await db
            .selectFrom('staging.competition_embeddings')
            .select(['embedding', 'input_hash'])
            .where('competition_id', '=', competitionId)
            .executeTakeFirstOrThrow();

        expect(row.embedding).toHaveLength(384);
        expect(row.embedding).toEqual(second);
        expect(row.input_hash).toBe('hash-2b');
    });
});