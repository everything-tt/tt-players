import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Kysely, Migrator, PostgresDialect, sql } from 'kysely';
import type { Migration, MigrationProvider } from 'kysely';
import pg from 'pg';
import * as m001 from '@tt-players/db/src/migrations/001_create_enums.js';
import * as m016 from '@tt-players/db/src/migrations/016_create_sport80_event_scrape_state.js';
import { claimSport80EventForScrape } from '../sport80-event-claim.js';

const { Pool } = pg;
const TEST_DB_NAME = 'tt_sport80_refresh_claim_test';
const BASE = process.env.TEST_DATABASE_BASE_URL ?? 'postgres://postgres:postgres@localhost:5432';
const ADMIN_URL = `${BASE}/postgres`;
const TEST_URL = `${BASE}/${TEST_DB_NAME}`;

class Provider implements MigrationProvider {
    async getMigrations(): Promise<Record<string, Migration>> {
        return {
            '001_create_enums': m001,
            '016_create_sport80_event_scrape_state': m016,
        };
    }
}

let database: Kysely<any>;
const EVENT_ID = 'event-1';
const OLD = new Date('2026-08-01T12:00:00Z');
const NEWER = new Date('2026-08-10T12:00:00Z');
const CLAIM_TIME = new Date('2026-08-17T12:00:00Z');

async function seedProcessed(processedAt: Date | null): Promise<void> {
    await database.insertInto('staging.sport80_event_scrape_state').values({
        event_id: EVENT_ID,
        event_name: 'Event',
        status: 'processed',
        processed_at: processedAt,
        last_attempted_at: processedAt,
        updated_at: processedAt ?? OLD,
    }).execute();
}

describe('Sport80 processed refresh claim', () => {
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
        await sql`CREATE SCHEMA staging`.execute(database);
        await sql`ALTER TABLE sport80_event_scrape_state SET SCHEMA staging`.execute(database);
    }, 30_000);

    beforeEach(async () => {
        await database.deleteFrom('staging.sport80_event_scrape_state').execute();
    });

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

    it('claims the same processed version for a policy refresh', async () => {
        await seedProcessed(OLD);

        const result = await claimSport80EventForScrape(database, {
            eventId: EVENT_ID,
            refreshProcessed: true,
            refreshObservedProcessedAt: OLD.toISOString(),
        }, CLAIM_TIME);

        expect(result).toEqual({ claimed: true, status: 'pending' });
        const state = await database.selectFrom('staging.sport80_event_scrape_state')
            .select(['status', 'last_attempted_at'])
            .where('event_id', '=', EVENT_ID)
            .executeTakeFirstOrThrow();
        expect(state.status).toBe('pending');
        expect(new Date(state.last_attempted_at).toISOString()).toBe(CLAIM_TIME.toISOString());
    });

    it('cannot steal a newer concurrent processed version', async () => {
        await seedProcessed(NEWER);

        const result = await claimSport80EventForScrape(database, {
            eventId: EVENT_ID,
            refreshProcessed: true,
            refreshObservedProcessedAt: OLD.toISOString(),
        }, CLAIM_TIME);

        expect(result).toEqual({ claimed: false, status: 'processed' });
        const state = await database.selectFrom('staging.sport80_event_scrape_state')
            .select(['status', 'processed_at'])
            .where('event_id', '=', EVENT_ID)
            .executeTakeFirstOrThrow();
        expect(state.status).toBe('processed');
        expect(new Date(state.processed_at).toISOString()).toBe(NEWER.toISOString());
    });

    it('allows an explicit operator force to claim processed state', async () => {
        await seedProcessed(NEWER);

        const result = await claimSport80EventForScrape(database, {
            eventId: EVENT_ID,
            force: true,
        }, CLAIM_TIME);

        expect(result).toEqual({ claimed: true, status: 'pending' });
    });

    it('can refresh a legacy processed row without processed_at only if discovery observed it null', async () => {
        await seedProcessed(null);

        const result = await claimSport80EventForScrape(database, {
            eventId: EVENT_ID,
            refreshProcessed: true,
            refreshObservedProcessedAt: null,
        }, CLAIM_TIME);

        expect(result).toEqual({ claimed: true, status: 'pending' });
    });
});
