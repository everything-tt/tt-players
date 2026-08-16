import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, Migrator, PostgresDialect } from 'kysely';
import type { Migration, MigrationProvider } from 'kysely';
import pg from 'pg';
import { createHash } from 'node:crypto';

import * as m001 from '@tt-players/db/src/migrations/001_create_enums.js';
import * as m002 from '@tt-players/db/src/migrations/002_create_core_tables.js';
import * as m003 from '@tt-players/db/src/migrations/003_create_match_tables.js';
import * as m004 from '@tt-players/db/src/migrations/004_create_raw_scrape_logs.js';
import * as m005 from '@tt-players/db/src/migrations/005_make_rubber_players_nullable.js';
import * as m006 from '@tt-players/db/src/migrations/006_add_canonical_player_id_to_external_players.js';
import * as m007 from '@tt-players/db/src/migrations/007_add_performance_indexes.js';
import * as m008 from '@tt-players/db/src/migrations/008_create_cache_entries.js';
import * as m009 from '@tt-players/db/src/migrations/009_create_regions.js';
import * as m010 from '@tt-players/db/src/migrations/010_add_performance_indexes_2.js';
import * as m011 from '@tt-players/db/src/migrations/011_add_detail_page_performance_indexes.js';
import * as m012 from '@tt-players/db/src/migrations/012_add_raw_scrape_log_source_url_indexes.js';
import * as m013 from '@tt-players/db/src/migrations/013_add_rubber_score_source.js';
import * as m014 from '@tt-players/db/src/migrations/014_create_ranking_history_tables.js';
import * as m015 from '@tt-players/db/src/migrations/015_add_rubber_played_at.js';
import * as m016 from '@tt-players/db/src/migrations/016_create_sport80_event_scrape_state.js';
import * as m017 from '@tt-players/db/src/migrations/017_create_source_event_staging_tables.js';
import * as m018 from '@tt-players/db/src/migrations/018_add_competition_event_display_fields.js';
import * as m019 from '@tt-players/db/src/migrations/019_add_competition_source_fields.js';
import * as m020 from '@tt-players/db/src/migrations/020_create_staging_schema.js';
import * as m021 from '@tt-players/db/src/migrations/021_create_feedback_table.js';
import * as m029 from '@tt-players/db/src/migrations/029_create_source_registry.js';
import * as m052 from '@tt-players/db/src/migrations/052_add_raw_scrape_log_updated_at.js';
import * as m057 from '@tt-players/db/src/migrations/057_scope_raw_scrape_evidence.js';
import * as m058 from '@tt-players/db/src/migrations/058_create_raw_scrape_evidence_dependencies.js';
import type { Database } from '@tt-players/db';
import {
    pinTT365PlayerStatsEvidence,
    TT365_PLAYER_STATS_EVIDENCE_TYPE,
} from '../tt365-player-stats-evidence.js';

const { Pool } = pg;
const TEST_DB_NAME = 'tt_tt365_evidence_pin_test';
const BASE = process.env.TEST_DATABASE_BASE_URL ?? 'postgres://postgres:postgres@localhost:5432';
const ADMIN_URL = `${BASE}/postgres`;
const TEST_URL = `${BASE}/${TEST_DB_NAME}`;

class Provider implements MigrationProvider {
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
            '029_create_source_registry': m029,
            '052_add_raw_scrape_log_updated_at': m052,
            '057_scope_raw_scrape_evidence': m057,
            '058_create_raw_scrape_evidence_dependencies': m058,
        };
    }
}

let database: Kysely<Database>;
let platformId: string;

async function raw(url: string, body: string, status: 'pending' | 'processed' = 'pending') {
    return database.insertInto('raw_scrape_logs').values({
        platform_id: platformId,
        endpoint_url: url,
        raw_payload: body,
        payload_hash: createHash('sha256').update(body).digest('hex'),
        status,
    }).returning('id').executeTakeFirstOrThrow();
}

describe('TT365 evidence pinning', () => {
    beforeAll(async () => {
        const admin = new Pool({ connectionString: ADMIN_URL });
        await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
        await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
        await admin.query(`ALTER DATABASE ${TEST_DB_NAME} SET search_path TO public, staging`);
        await admin.end();

        database = new Kysely<Database>({
            dialect: new PostgresDialect({ pool: new Pool({ connectionString: TEST_URL }) }),
        });
        const result = await new Migrator({ database, provider: new Provider() }).migrateToLatest();
        if (result.error) throw result.error;

        platformId = (await database.insertInto('platforms').values({
            name: 'TableTennis365',
            base_url: 'https://www.tabletennis365.com',
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

    it('keeps the first valid evidence pin immutable and rejects mismatched evidence', async () => {
        const parentUrl = 'https://www.tabletennis365.com/League/Results/MatchCard/1';
        const evidenceUrl = 'https://www.tabletennis365.com/League/Results/Player/Statistics/S/Player/10';
        const parent = await raw(parentUrl, '<card/>');
        const first = await raw(evidenceUrl, '<stats>first</stats>', 'processed');
        const second = await raw(evidenceUrl, '<stats>second</stats>', 'processed');
        const wrong = await raw(`${evidenceUrl}?wrong=1`, '<stats>wrong</stats>', 'processed');
        const requirementKey = 'S|10';

        await (database as Kysely<any>)
            .insertInto('staging.raw_scrape_evidence_dependencies')
            .values({
                parent_log_id: parent.id,
                evidence_type: TT365_PLAYER_STATS_EVIDENCE_TYPE,
                requirement_key: requirementKey,
                endpoint_url: evidenceUrl,
                status: 'pending',
            })
            .execute();

        expect(await pinTT365PlayerStatsEvidence(
            database as Kysely<any>, parent.id, requirementKey, wrong.id,
        )).toBe(false);
        expect(await pinTT365PlayerStatsEvidence(
            database as Kysely<any>, parent.id, requirementKey, first.id,
        )).toBe(true);
        expect(await pinTT365PlayerStatsEvidence(
            database as Kysely<any>, parent.id, requirementKey, second.id,
        )).toBe(false);

        const dependency = await (database as Kysely<any>)
            .selectFrom('staging.raw_scrape_evidence_dependencies')
            .select(['evidence_log_id', 'status'])
            .where('parent_log_id', '=', parent.id)
            .executeTakeFirstOrThrow();
        expect(dependency.evidence_log_id).toBe(first.id);
        expect(dependency.status).toBe('processed');

        await database.updateTable('raw_scrape_logs')
            .set({ status: 'processed', updated_at: new Date() })
            .where('id', '=', parent.id)
            .execute();
        expect(await pinTT365PlayerStatsEvidence(
            database as Kysely<any>, parent.id, requirementKey, second.id,
        )).toBe(false);
    });
});
