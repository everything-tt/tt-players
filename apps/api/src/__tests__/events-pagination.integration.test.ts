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
let eventIds: string[] = [];

beforeAll(async () => {
    await createTestDatabase();
    db = createTestKysely();
    await runMigrations(db);
    const database = db as Kysely<any>;

    const platform = await database
        .insertInto('platforms')
        .values({ name: 'Paged Events Test', base_url: 'https://events.example.com' })
        .returning('id')
        .executeTakeFirstOrThrow();
    const league = await database
        .insertInto('leagues')
        .values({
            platform_id: platform.id,
            external_id: 'paged-events-league',
            name: 'Paged Events League',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    const season = await database
        .insertInto('seasons')
        .values({
            league_id: league.id,
            external_id: 'paged-events-season',
            name: 'Paged Events Season',
            is_active: true,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    const home = await database
        .insertInto('external_players')
        .values({ platform_id: platform.id, external_id: 'paged-home', name: 'Paged Home' })
        .returning('id')
        .executeTakeFirstOrThrow();
    const away = await database
        .insertInto('external_players')
        .values({ platform_id: platform.id, external_id: 'paged-away', name: 'Paged Away' })
        .returning('id')
        .executeTakeFirstOrThrow();

    for (let index = 1; index <= 3; index += 1) {
        const event = await database
            .insertInto('competitions')
            .values({
                season_id: season.id,
                external_id: `paged-event-${index}`,
                name: `Page First Tournament ${index}`,
                display_name: `Page First Tournament ${index}`,
                event_date: `2026-07-0${index}`,
                start_date: `2026-07-0${index}`,
                event_status: 'completed',
                category: 'Junior',
                type: 'individual',
                source: 'test',
                source_url: `https://events.example.com/${index}`,
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        eventIds.push(event.id);

        const fixture = await database
            .insertInto('fixtures')
            .values({
                competition_id: event.id,
                external_id: `paged-fixture-${index}`,
                status: 'completed',
                round_name: 'Group',
                round_order: index,
            })
            .returning('id')
            .executeTakeFirstOrThrow();

        await database
            .insertInto('rubbers')
            .values(Array.from({ length: index }, (_, rubberIndex) => ({
                fixture_id: fixture.id,
                external_id: `paged-rubber-${index}-${rubberIndex}`,
                is_doubles: false,
                home_player_1_id: home.id,
                away_player_1_id: away.id,
                home_games_won: 3,
                away_games_won: 1,
                outcome_type: 'normal',
            })))
            .execute();
    }

    const app = await buildApp(db);
    await app.ready();
    request = supertest(app.server);
}, 30_000);

afterAll(async () => {
    await dropTestDatabase(db);
}, 15_000);

describe('Events API pagination', () => {
    it('pages completed event IDs before enriching their match counts', async () => {
        const firstPage = await request
            .get('/api/events?status=completed&q=Page%20First&limit=2&offset=0')
            .expect(200);

        expect(firstPage.body.total).toBe(3);
        expect(firstPage.body.data.map((event: { id: string }) => event.id)).toEqual([
            eventIds[2],
            eventIds[1],
        ]);
        expect(firstPage.body.data.map((event: { match_count: number }) => event.match_count)).toEqual([3, 2]);

        const secondPage = await request
            .get('/api/events?status=completed&q=Page%20First&limit=2&offset=2')
            .expect(200);

        expect(secondPage.body.total).toBe(3);
        expect(secondPage.body.data).toHaveLength(1);
        expect(secondPage.body.data[0]).toMatchObject({
            id: eventIds[0],
            match_count: 1,
        });
    });

    it('preserves the total for an out-of-range offset', async () => {
        const response = await request
            .get('/api/events?status=completed&q=Page%20First&limit=2&offset=10')
            .expect(200);

        expect(response.body).toMatchObject({
            data: [],
            total: 3,
            limit: 2,
            offset: 10,
        });
    });
});
