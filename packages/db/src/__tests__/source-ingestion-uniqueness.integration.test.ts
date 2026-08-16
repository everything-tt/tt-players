import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, Migrator, PostgresDialect, sql } from 'kysely';
import type { Migration, MigrationProvider } from 'kysely';
import pg from 'pg';

import * as m001 from '../migrations/001_create_enums.js';
import * as m002 from '../migrations/002_create_core_tables.js';
import * as m003 from '../migrations/003_create_match_tables.js';
import * as m018 from '../migrations/018_add_competition_event_display_fields.js';
import * as m019 from '../migrations/019_add_competition_source_fields.js';
import * as m036 from '../migrations/036_create_tournament_sources.js';
import * as m059 from '../migrations/059_harden_source_ingestion_uniqueness.js';

const { Pool } = pg;
const TEST_DB_NAME = 'tt_source_ingestion_uniqueness_test';
const BASE = process.env.TEST_DATABASE_BASE_URL ?? 'postgres://postgres:postgres@localhost:5432';
const ADMIN_URL = `${BASE}/postgres`;
const TEST_URL = `${BASE}/${TEST_DB_NAME}`;

class Provider implements MigrationProvider {
    async getMigrations(): Promise<Record<string, Migration>> {
        return {
            '001_create_enums': m001,
            '002_create_core_tables': m002,
            '003_create_match_tables': m003,
            '018_add_competition_event_display_fields': m018,
            '019_add_competition_source_fields': m019,
            '036_create_tournament_sources': m036,
            '059_harden_source_ingestion_uniqueness': m059,
        };
    }
}

let database: Kysely<any>;
let competitionId: string;

describe('source ingestion uniqueness', () => {
    beforeAll(async () => {
        const admin = new Pool({ connectionString: ADMIN_URL });
        await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
        await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
        await admin.end();

        database = new Kysely({
            dialect: new PostgresDialect({ pool: new Pool({ connectionString: TEST_URL }) }),
        });
        const result = await new Migrator({ db: database, provider: new Provider() }).migrateToLatest();
        if (result.error) throw result.error;

        const platformId = (await database.insertInto('platforms').values({
            name: 'Test',
            base_url: 'https://test.invalid',
        }).returning('id').executeTakeFirstOrThrow()).id;
        const leagueId = (await database.insertInto('leagues').values({
            platform_id: platformId,
            external_id: 'league',
            name: 'League',
        }).returning('id').executeTakeFirstOrThrow()).id;
        const seasonId = (await database.insertInto('seasons').values({
            league_id: leagueId,
            external_id: 'season',
            name: 'Season',
        }).returning('id').executeTakeFirstOrThrow()).id;
        competitionId = (await database.insertInto('competitions').values({
            season_id: seasonId,
            external_id: 'candidate',
            name: 'Candidate',
            type: 'individual',
        }).returning('id').executeTakeFirstOrThrow()).id;
    }, 30_000);

    afterAll(async () => {
        await database.destroy();
        const admin = new Pool({ connectionString: ADMIN_URL });
        await admin.query(`
            SELECT pg_terminate_backend(pid) FROM pg_stat_activity
            WHERE datname = '${TEST_DB_NAME}' AND pid <> pg_backend_pid()
        `);
        await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
        await admin.end();
    }, 15_000);

    it('allows only one pending review candidate for a source/candidate identity', async () => {
        const insert = () => sql`
            INSERT INTO tournament_match_candidates (
                incoming_provider,
                incoming_external_id,
                incoming_name,
                candidate_competition_id,
                name_score,
                date_score,
                venue_score,
                category_score,
                total_score,
                status
            ) VALUES (
                'vetts',
                'event-1',
                'Event 1',
                ${competitionId},
                0.8,
                0.8,
                0.8,
                0.8,
                0.8,
                'pending'
            )
            ON CONFLICT (
                incoming_provider,
                incoming_external_id,
                candidate_competition_id
            ) WHERE status = 'pending' AND incoming_external_id IS NOT NULL
            DO NOTHING
        `.execute(database);

        await Promise.all(Array.from({ length: 8 }, () => insert()));
        const count = await database.selectFrom('tournament_match_candidates')
            .select((eb: any) => eb.fn.countAll<string>().as('count'))
            .where('incoming_provider', '=', 'vetts')
            .where('incoming_external_id', '=', 'event-1')
            .where('candidate_competition_id', '=', competitionId)
            .where('status', '=', 'pending')
            .executeTakeFirstOrThrow();
        expect(Number(count.count)).toBe(1);
    });
});
