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

describe('Events API', () => {
    it('returns empty events array if none exists', async () => {
        const res = await request.get('/api/events').expect(200);
        expect(res.body).toEqual({
            data: [],
            total: 0,
            limit: 20,
            offset: 0,
        });
    });

    it('returns seeded events and event detail with resolved players', async () => {
        // 1. Seed Platform
        const [platform] = await db
            .insertInto('platforms')
            .values({ name: 'Sport80 Test', base_url: 'https://sport80.example.com' })
            .returning('id')
            .execute();

        const [league] = await db
            .insertInto('leagues')
            .values({
                platform_id: platform!.id,
                external_id: 'sport80-test',
                name: 'Sport80 Test League',
            })
            .returning('id')
            .execute();

        const [season] = await db
            .insertInto('seasons')
            .values({
                league_id: league!.id,
                external_id: 'sport80-2026',
                name: 'Sport80 2026',
                is_active: true,
            })
            .returning('id')
            .execute();

        const [competition] = await db
            .insertInto('competitions')
            .values({
                season_id: season!.id,
                external_id: 'sport80:event:ext-evt-1',
                name: 'Croydon GP 2026 - 2026-03-28: Grand Prix',
                display_name: 'Croydon GP 2026',
                event_date: '2026-03-28',
                category: 'Grand Prix',
                type: 'individual',
            })
            .returning('id')
            .execute();

        // 2. Seed Source Event
        const [event] = await db
            .insertInto('source_events')
            .values({
                platform_id: platform!.id,
                source: 'sport80',
                external_id: 'ext-evt-1',
                name: 'Croydon GP 2026',
                event_date: '2026-03-28',
                category: 'Grand Prix',
                public_url: 'https://sport80.example.com/events/1',
                raw_payload: {},
                canonical_competition_id: competition!.id,
            })
            .returning('id')
            .execute();

        // 3. Seed Registered Players to test resolution
        const [player1] = await db
            .insertInto('external_players')
            .values({
                platform_id: platform!.id,
                external_id: 'sport80-player-1',
                name: 'Jane Doe',
            })
            .returning('id')
            .execute();

        // 4. Seed Source Event Results
        await db
            .insertInto('source_event_result_rows')
            .values({
                source_event_id: event!.id,
                source: 'sport80',
                external_id: 'ext-row-1',
                played_at: '2026-03-28 10:00:00',
                round_name: 'Group 1',
                round_order: 1,
                round_raw: {},
                home_raw: '{}',
                away_raw: '{}',
                home_player_name: 'Jane Doe',
                home_player_external_id: 'sport80-player-1',
                away_player_name: 'Unregistered Player',
                away_player_external_id: 'sport80-player-none',
                winner_side: 'home',
                raw_payload: {},
            })
            .execute();

        // Test list endpoint
        const listRes = await request.get('/api/events').expect(200);
        expect(listRes.body.data.length).toBe(1);
        expect(listRes.body.data[0]).toMatchObject({
            id: competition!.id,
            name: 'Croydon GP 2026',
            event_date: '2026-03-28',
            category: 'Grand Prix',
            platform_name: 'Sport80 Test',
            match_count: 1,
        });

        // Test details endpoint
        const detailRes = await request.get(`/api/events/${competition!.id}`).expect(200);
        expect(detailRes.body.event).toMatchObject({
            id: competition!.id,
            name: 'Croydon GP 2026',
            event_date: '2026-03-28',
            match_count: 1,
        });
        expect(detailRes.body.results.length).toBe(1);
        expect(detailRes.body.results[0]).toMatchObject({
            home_player_name: 'Jane Doe',
            home_player_external_id: 'sport80-player-1',
            home_player_resolved_id: player1!.id, // should resolve successfully
            away_player_name: 'Unregistered Player',
            away_player_external_id: 'sport80-player-none',
            away_player_resolved_id: null, // should be null
            winner_side: 'home',
        });
    });

    it('supports searching events by name', async () => {
        // Search matches name (case insensitive)
        const matchRes = await request.get('/api/events?q=croydon').expect(200);
        expect(matchRes.body.data.length).toBe(1);
        expect(matchRes.body.data[0].name).toBe('Croydon GP 2026');

        // Search mismatch name
        const mismatchRes = await request.get('/api/events?q=london').expect(200);
        expect(mismatchRes.body.data.length).toBe(0);
    });

    it('returns 404 for unknown event ID', async () => {
        const unknownId = '829ab867-3e82-420f-a41f-0b55524af6b2';
        const res = await request.get(`/api/events/${unknownId}`).expect(404);
        expect(res.body).toMatchObject({
            error: `Event ${unknownId} not found`,
            statusCode: 404,
        });
    });
});
