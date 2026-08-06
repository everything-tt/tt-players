import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import { buildApp } from '../app.js';
import {
    createTestDatabase,
    createTestKysely,
    dropTestDatabase,
    runMigrations,
} from './helpers/seed.js';

let db: Kysely<Database>;
let request: ReturnType<typeof supertest>;
let upcomingCalendarId: string;
let awaitingCalendarId: string;
let processedCalendarId: string;
let completedResultIds: string[];

beforeAll(async () => {
    await createTestDatabase();
    db = createTestKysely();
    await runMigrations(db);
    const database = db as Kysely<any>;

    const platform = await database
        .insertInto('platforms')
        .values({ name: 'Tournament lifecycle test', base_url: 'https://events.example.com' })
        .returning('id')
        .executeTakeFirstOrThrow();
    const league = await database
        .insertInto('leagues')
        .values({ platform_id: platform.id, external_id: 'lifecycle', name: 'Lifecycle' })
        .returning('id')
        .executeTakeFirstOrThrow();
    const season = await database
        .insertInto('seasons')
        .values({ league_id: league.id, external_id: 'lifecycle-2026', name: '2026', is_active: true })
        .returning('id')
        .executeTakeFirstOrThrow();

    const upcoming = await database
        .insertInto('competitions')
        .values({
            season_id: season.id,
            external_id: 'calendar-upcoming',
            name: 'Shared Calendar Tournament',
            display_name: 'Shared Calendar Tournament',
            event_date: '2026-09-01',
            start_date: '2026-09-01',
            event_status: 'entries_open',
            record_kind: 'calendar',
            type: 'individual',
            source: 'tte-calendar',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    upcomingCalendarId = upcoming.id;

    const awaiting = await database
        .insertInto('competitions')
        .values({
            season_id: season.id,
            external_id: 'calendar-awaiting-results',
            name: 'Past Calendar Tournament Awaiting Results',
            display_name: 'Past Calendar Tournament Awaiting Results',
            event_date: '2026-07-01',
            start_date: '2026-07-01',
            event_status: 'awaiting_results',
            record_kind: 'calendar',
            type: 'individual',
            source: 'tte-calendar',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    awaitingCalendarId = awaiting.id;

    const processed = await database
        .insertInto('competitions')
        .values({
            season_id: season.id,
            external_id: 'calendar-processed',
            name: 'Processed Calendar Tournament',
            display_name: 'Processed Calendar Tournament',
            event_date: '2026-08-01',
            start_date: '2026-08-01',
            event_status: 'processed',
            record_kind: 'calendar',
            processed_at: new Date('2026-08-02T00:00:00Z'),
            type: 'individual',
            source: 'tte-calendar',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    processedCalendarId = processed.id;

    completedResultIds = [];
    for (const [index, name] of ['Completed Division A', 'Completed Division B'].entries()) {
        const result = await database
            .insertInto('competitions')
            .values({
                season_id: season.id,
                external_id: `result-${index}`,
                name,
                display_name: name,
                event_date: '2026-08-01',
                start_date: '2026-08-01',
                event_status: 'completed',
                record_kind: 'result',
                matched_calendar_competition_id: processed.id,
                type: 'individual',
                source: 'sport80',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        completedResultIds.push(result.id);
    }

    const app = await buildApp(db);
    await app.ready();
    request = supertest(app.server);
}, 30_000);

afterAll(async () => {
    await dropTestDatabase(db);
}, 15_000);

describe('separate tournament lifecycles', () => {
    it('lists only unprocessed calendar rows as upcoming', async () => {
        const response = await request.get('/api/events?status=upcoming').expect(200);
        expect(response.body.data.map((event: { id: string }) => event.id)).toEqual([
            upcomingCalendarId,
        ]);
        expect(response.body.data.map((event: { id: string }) => event.id)).not.toContain(
            processedCalendarId,
        );
        expect(response.body.data.map((event: { id: string }) => event.id)).not.toContain(
            awaitingCalendarId,
        );
    });

    it('keeps awaiting-results calendar rows queryable outside the upcoming list', async () => {
        const response = await request.get('/api/events?status=awaiting_results').expect(200);
        expect(response.body.data.map((event: { id: string }) => event.id)).toEqual([
            awaitingCalendarId,
        ]);
    });

    it('lists result rows as completed without inspecting fixtures or rubbers', async () => {
        const response = await request.get('/api/events?status=completed').expect(200);
        expect(response.body.data.map((event: { id: string }) => event.id)).toEqual(
            completedResultIds,
        );
        expect(response.body.data.every((event: { match_count: number }) => event.match_count === 0)).toBe(true);
    });

    it('searches upcoming and completed records independently', async () => {
        const upcoming = await request
            .get('/api/events?status=upcoming&q=Shared')
            .expect(200);
        expect(upcoming.body.data.map((event: { id: string }) => event.id)).toEqual([
            upcomingCalendarId,
        ]);

        const completed = await request
            .get('/api/events?status=completed&q=Division')
            .expect(200);
        expect(completed.body.data.map((event: { id: string }) => event.id)).toEqual(
            completedResultIds,
        );
    });
});
