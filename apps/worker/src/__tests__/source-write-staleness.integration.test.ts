import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import type { Database } from '@tt-players/db';
import type { TteCalendarEvent } from '../tte-events-client.js';
import { upsertCalendarEvent } from '../tte-events-sync.js';
import {
    recordSourceResourceFailure,
    recordSourceResourceSuccess,
} from '../sources/registry.js';
import { upsertVettsSeparateCompetition } from '../vetts-loader.js';
import type { VettsTournamentMetadata } from '../vetts-parser.js';

const { Pool } = pg;
const TEST_DB_NAME = 'tt_source_write_staleness_test';
const BASE = process.env.TEST_DATABASE_BASE_URL ?? 'postgres://postgres:postgres@localhost:5432';
const ADMIN_URL = `${BASE}/postgres`;
const TEST_URL = `${BASE}/${TEST_DB_NAME}`;

let database: Kysely<Database>;

async function recreateDatabase(): Promise<void> {
    const admin = new Pool({ connectionString: ADMIN_URL });
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    await admin.end();

    const pool = new Pool({ connectionString: TEST_URL });
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await pool.query(`
        CREATE TABLE platforms (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            name varchar NOT NULL,
            base_url varchar NOT NULL,
            created_at timestamp NOT NULL DEFAULT now()
        );
        CREATE TABLE leagues (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            platform_id uuid NOT NULL REFERENCES platforms(id),
            external_id varchar NOT NULL,
            name varchar NOT NULL,
            created_at timestamp NOT NULL DEFAULT now(),
            deleted_at timestamp,
            UNIQUE (platform_id, external_id)
        );
        CREATE TABLE seasons (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            league_id uuid NOT NULL REFERENCES leagues(id),
            external_id varchar NOT NULL,
            name varchar NOT NULL,
            is_active boolean NOT NULL DEFAULT true,
            created_at timestamp NOT NULL DEFAULT now(),
            deleted_at timestamp,
            UNIQUE (league_id, external_id)
        );
        CREATE TABLE competitions (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            season_id uuid NOT NULL REFERENCES seasons(id),
            external_id varchar NOT NULL,
            name varchar NOT NULL,
            display_name varchar,
            event_date date,
            start_date date,
            end_date date,
            venue_name varchar,
            venue_address varchar,
            venue_town varchar,
            venue_postcode varchar,
            entry_deadline timestamp,
            entry_url varchar,
            information_url varchar,
            event_status varchar,
            record_kind varchar,
            normalized_name varchar,
            normalized_venue varchar,
            category varchar,
            type varchar NOT NULL,
            source varchar,
            source_url varchar,
            processed_at timestamp,
            calendar_first_seen_at timestamp,
            calendar_last_seen_at timestamp,
            calendar_missing_count integer NOT NULL DEFAULT 0,
            deleted_at timestamp,
            UNIQUE (season_id, external_id)
        );
        CREATE TABLE tournament_sources (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            competition_id uuid NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
            provider varchar NOT NULL,
            source_type varchar NOT NULL,
            external_id varchar,
            source_url varchar,
            source_key varchar NOT NULL,
            payload_hash varchar,
            raw_payload jsonb,
            first_seen_at timestamp NOT NULL DEFAULT now(),
            last_seen_at timestamp NOT NULL DEFAULT now(),
            missing_count integer NOT NULL DEFAULT 0,
            match_method varchar,
            match_confidence double precision,
            created_at timestamp NOT NULL DEFAULT now(),
            updated_at timestamp NOT NULL DEFAULT now(),
            UNIQUE (provider, source_type, source_key)
        );
        CREATE TABLE source_resources (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            last_fetched_at timestamp,
            last_succeeded_at timestamp,
            last_parsed_at timestamp,
            last_error text,
            consecutive_failures integer NOT NULL DEFAULT 0,
            updated_at timestamp NOT NULL DEFAULT now()
        );
    `);
    await pool.end();
}

async function seedSeason(): Promise<string> {
    const platform = await database
        .insertInto('platforms')
        .values({ name: 'Test Platform', base_url: `https://test-${crypto.randomUUID()}.invalid` })
        .returning('id')
        .executeTakeFirstOrThrow();
    const league = await database
        .insertInto('leagues')
        .values({ platform_id: platform.id, external_id: crypto.randomUUID(), name: 'Test League' })
        .returning('id')
        .executeTakeFirstOrThrow();
    return database
        .insertInto('seasons')
        .values({ league_id: league.id, external_id: crypto.randomUUID(), name: 'Test Season' })
        .returning('id')
        .executeTakeFirstOrThrow()
        .then((row) => row.id);
}

const vettsMetadata: VettsTournamentMetadata = {
    tournamentId: '12345678-1234-1234-1234-123456789abc',
    sourceUrl: 'https://vetts.tournamentsoftware.com/tournament/12345678-1234-1234-1234-123456789abc',
    name: 'VETTS Test Tournament',
    organisation: 'VETTS',
    location: 'Test Town',
    startDate: '2026-01-10',
    endDate: '2026-01-11',
    venueName: 'Test Venue',
    venueAddress: '1 Test Street',
    venueTown: 'Test Town',
    venuePostcode: 'TT1 1TT',
    eventCount: 5,
    entryCount: 20,
};

const tteEvent: TteCalendarEvent = {
    sourceKey: 'concurrency-open',
    sourceUrl: 'https://www.tabletennisengland.co.uk/event/concurrency-open/',
    name: 'Concurrency Open 2*',
    description: 'Concurrency test event',
    startDate: '2026-09-20',
    endDate: '2026-09-20',
    venueName: 'Test Venue',
    venueAddress: '1 Test Street',
    venueTown: 'Test Town',
    venuePostcode: 'TT1 1TT',
    venueUrl: null,
    organizerName: 'Test Organiser',
    organizerUrl: null,
    categories: ['2* event'],
    entryDeadline: '2026-09-01',
    entryUrl: 'https://entries.invalid/concurrency-open',
    publishedStatus: 'confirmed',
};

describe('source write stale-writer contracts', () => {
    beforeAll(async () => {
        await recreateDatabase();
        database = new Kysely<Database>({
            dialect: new PostgresDialect({ pool: new Pool({ connectionString: TEST_URL, max: 16 }) }),
        });
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

    beforeEach(async () => {
        await sql`TRUNCATE tournament_sources, competitions, seasons, leagues, platforms, source_resources CASCADE`.execute(database);
    });

    it('serializes first-time TTE source-key discovery to one competition/source pair', async () => {
        const now = new Date('2026-08-16T12:00:00Z');
        const outcomes = await Promise.all(
            Array.from({ length: 8 }, () => upsertCalendarEvent(database as Kysely<any>, tteEvent, now)),
        );

        expect(outcomes.filter((outcome) => outcome === 'created')).toHaveLength(1);
        expect(outcomes.filter((outcome) => outcome === 'unchanged')).toHaveLength(7);

        const dynamicDb = database as Kysely<any>;
        const competitions = await dynamicDb
            .selectFrom('competitions')
            .select(['id', 'external_id'])
            .where('external_id', '=', `tte:event:${tteEvent.sourceKey}`)
            .execute();
        const sources = await dynamicDb
            .selectFrom('tournament_sources')
            .select(['competition_id'])
            .where('provider', '=', 'tte')
            .where('source_type', '=', 'calendar')
            .where('source_key', '=', tteEvent.sourceKey)
            .execute();

        expect(competitions).toHaveLength(1);
        expect(sources).toHaveLength(1);
        expect(sources[0].competition_id).toBe(competitions[0].id);
    });

    it('does not let a late VETTS bootstrap refresh regress an established result lifecycle', async () => {
        const seasonId = await seedSeason();
        const dynamicDb = database as Kysely<any>;
        const competitionId = await upsertVettsSeparateCompetition(
            dynamicDb,
            seasonId,
            vettsMetadata,
        );
        const processedAt = new Date('2026-01-12T10:00:00Z');

        await dynamicDb
            .updateTable('competitions')
            .set({
                record_kind: 'result',
                event_status: 'completed',
                processed_at: processedAt,
            })
            .where('id', '=', competitionId)
            .execute();

        await upsertVettsSeparateCompetition(
            dynamicDb,
            seasonId,
            { ...vettsMetadata, name: 'VETTS Test Tournament Updated' },
        );

        const row = await dynamicDb
            .selectFrom('competitions')
            .select(['name', 'record_kind', 'event_status', 'processed_at'])
            .where('id', '=', competitionId)
            .executeTakeFirstOrThrow();
        expect(row.name).toBe('VETTS Test Tournament Updated');
        expect(row.record_kind).toBe('result');
        expect(row.event_status).toBe('completed');
        expect(new Date(row.processed_at).getTime()).toBe(processedAt.getTime());
    });

    it('ignores an older source failure after a newer success', async () => {
        const resourceId = crypto.randomUUID();
        await sql`
            INSERT INTO source_resources (id)
            VALUES (${resourceId}::uuid)
        `.execute(database);

        const olderAttempt = new Date('2026-08-16T10:00:00Z');
        const newerAttempt = new Date('2026-08-16T10:05:00Z');
        await recordSourceResourceSuccess(database, resourceId, {
            attemptedAt: newerAttempt,
            parsedAt: new Date('2026-08-16T10:06:00Z'),
        });
        await recordSourceResourceFailure(
            database,
            resourceId,
            new Error('late stale failure'),
            olderAttempt,
        );

        const row = await database
            .selectFrom('source_resources')
            .select(['last_fetched_at', 'last_error', 'consecutive_failures'])
            .where('id', '=', resourceId)
            .executeTakeFirstOrThrow();
        expect(new Date(row.last_fetched_at!).getTime()).toBe(newerAttempt.getTime());
        expect(row.last_error).toBeNull();
        expect(row.consecutive_failures).toBe(0);
    });

    it('allows a newer source failure to supersede an older success', async () => {
        const resourceId = crypto.randomUUID();
        await sql`
            INSERT INTO source_resources (id)
            VALUES (${resourceId}::uuid)
        `.execute(database);

        const olderAttempt = new Date('2026-08-16T10:00:00Z');
        const newerAttempt = new Date('2026-08-16T10:05:00Z');
        await recordSourceResourceSuccess(database, resourceId, { attemptedAt: olderAttempt });
        await recordSourceResourceFailure(
            database,
            resourceId,
            new Error('newer failure'),
            newerAttempt,
        );

        const row = await database
            .selectFrom('source_resources')
            .select(['last_fetched_at', 'last_error', 'consecutive_failures'])
            .where('id', '=', resourceId)
            .executeTakeFirstOrThrow();
        expect(new Date(row.last_fetched_at!).getTime()).toBe(newerAttempt.getTime());
        expect(row.last_error).toBe('newer failure');
        expect(row.consecutive_failures).toBe(1);
    });
});
