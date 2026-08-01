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

beforeAll(async () => {
    await createTestDatabase();
    db = createTestKysely();
    await runMigrations(db);

    const app = await buildApp(db);
    await app.ready();
    request = supertest(app.server);
}, 30_000);

afterAll(async () => {
    await dropTestDatabase(db);
}, 15_000);

async function createHierarchy(database: Kysely<any>) {
    const platform = await database
        .insertInto('platforms')
        .values({
            name: 'Tournament lifecycle test',
            base_url: 'https://events.example.com',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    const league = await database
        .insertInto('leagues')
        .values({
            platform_id: platform.id,
            external_id: 'tournament-lifecycle-test',
            name: 'Tournament lifecycle test',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    const season = await database
        .insertInto('seasons')
        .values({
            league_id: league.id,
            external_id: 'tournament-lifecycle-2099',
            name: 'Tournament lifecycle 2099',
            is_active: true,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    return season.id as string;
}

describe('event lifecycle source semantics', () => {
    it('defaults ranking/result competitions to completed', async () => {
        const database = db as Kysely<any>;
        const seasonId = await createHierarchy(database);

        const rankingEvent = await database
            .insertInto('competitions')
            .values({
                season_id: seasonId,
                external_id: 'sport80:event:historical-result',
                name: 'Historical ranking result',
                display_name: 'Historical ranking result',
                event_date: '2099-01-01',
                start_date: '2099-01-01',
                type: 'individual',
                source: 'sport80',
                source_url: 'https://results.example.com/historical-result',
            })
            .returning(['id', 'event_status'])
            .executeTakeFirstOrThrow();

        expect(rankingEvent.event_status).toBe('completed');
    });

    it('returns only future TTE calendar rows as upcoming', async () => {
        const database = db as Kysely<any>;
        const seasonId = await createHierarchy(database);

        const futureRanking = await database
            .insertInto('competitions')
            .values({
                season_id: seasonId,
                external_id: 'sport80:event:future-ranking-result',
                name: 'Future-dated ranking result',
                display_name: 'Future-dated ranking result',
                event_date: '2099-03-01',
                start_date: '2099-03-01',
                event_status: 'upcoming',
                type: 'individual',
                source: 'sport80',
                source_url: 'https://results.example.com/future-ranking-result',
            })
            .returning('id')
            .executeTakeFirstOrThrow();

        const pastCalendar = await database
            .insertInto('competitions')
            .values({
                season_id: seasonId,
                external_id: 'tte:event:past-calendar',
                name: 'Past calendar event',
                display_name: 'Past calendar event',
                event_date: '2000-01-01',
                start_date: '2000-01-01',
                event_status: 'upcoming',
                type: 'individual',
                source: 'tte-calendar',
                source_url: 'https://www.tabletennisengland.co.uk/event/past-calendar/',
            })
            .returning('id')
            .executeTakeFirstOrThrow();

        const futureCalendar = await database
            .insertInto('competitions')
            .values({
                season_id: seasonId,
                external_id: 'tte:event:future-calendar',
                name: 'Future calendar event',
                display_name: 'Future calendar event',
                event_date: '2099-04-01',
                start_date: '2099-04-01',
                event_status: 'entries_open',
                type: 'individual',
                source: 'tte-calendar',
                source_url: 'https://www.tabletennisengland.co.uk/event/future-calendar/',
            })
            .returning('id')
            .executeTakeFirstOrThrow();

        const response = await request.get('/api/events?status=upcoming').expect(200);

        expect(response.body.total).toBe(1);
        expect(response.body.data.map((event: { id: string }) => event.id)).toEqual([
            futureCalendar.id,
        ]);
        expect(response.body.data.map((event: { id: string }) => event.id)).not.toContain(
            futureRanking.id,
        );
        expect(response.body.data.map((event: { id: string }) => event.id)).not.toContain(
            pastCalendar.id,
        );
    });
});
