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
            has_more: false,
        });
    });

    it('returns seeded events and event detail with resolved players', async () => {
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
                source: 'sport80',
                source_url: 'https://sport80.example.com/events/1',
            })
            .returning('id')
            .execute();

        const [player1] = await db
            .insertInto('external_players')
            .values({
                platform_id: platform!.id,
                external_id: 'sport80-player-1',
                name: 'Jane Doe',
            })
            .returning('id')
            .execute();

        const [player2] = await db
            .insertInto('external_players')
            .values({
                platform_id: platform!.id,
                external_id: 'sport80-player-none',
                name: 'Unregistered Player',
            })
            .returning('id')
            .execute();

        const [fixture] = await db
            .insertInto('fixtures')
            .values({
                competition_id: competition!.id,
                external_id: 'ext-fixture-1',
                status: 'completed',
                round_name: 'Group 1',
                round_order: 1,
            })
            .returning('id')
            .execute();

        await db
            .insertInto('rubbers')
            .values({
                fixture_id: fixture!.id,
                external_id: 'ext-rubber-1',
                is_doubles: false,
                home_player_1_id: player1!.id,
                away_player_1_id: player2!.id,
                home_games_won: 3,
                away_games_won: 1,
                outcome_type: 'normal',
                played_at: '2026-03-28 10:00:00',
            })
            .execute();

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
            home_player_resolved_id: player1!.id,
            away_player_name: 'Unregistered Player',
            away_player_external_id: 'sport80-player-none',
            away_player_resolved_id: player2!.id,
            winner_side: 'home',
        });
    });

    it('returns complete upcoming calendar metadata, lifecycle filters and source links', async () => {
        const database = db as Kysely<any>;
        const platform = await database
            .insertInto('platforms')
            .values({
                name: 'Table Tennis England',
                base_url: 'https://www.tabletennisengland.co.uk',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        const league = await database
            .insertInto('leagues')
            .values({
                platform_id: platform.id,
                external_id: 'tte-calendar-test',
                name: 'TTE Calendar Test',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        const season = await database
            .insertInto('seasons')
            .values({
                league_id: league.id,
                external_id: 'tte-events-2026-2027-test',
                name: 'TTE Events 2026/27 Test',
                is_active: true,
            })
            .returning('id')
            .executeTakeFirstOrThrow();

        const later = await database
            .insertInto('competitions')
            .values({
                season_id: season.id,
                external_id: 'tte:event:later-open',
                name: 'Later Senior Open',
                display_name: 'Later Senior Open',
                event_date: '2026-10-10',
                start_date: '2026-10-10',
                end_date: '2026-10-11',
                venue_name: 'Later Sports Centre',
                venue_address: '1 Tournament Way',
                venue_town: 'Leeds',
                venue_postcode: 'LS1 1AA',
                entry_deadline: new Date('2026-09-20T23:59:59Z'),
                entry_url: 'https://entries.example.com/later',
                information_url: 'https://www.tabletennisengland.co.uk/event/later-open/',
                event_status: 'entries_open',
                record_kind: 'calendar',
                category: '2* event, Senior',
                type: 'individual',
                source: 'tte-calendar',
                source_url: 'https://www.tabletennisengland.co.uk/event/later-open/',
            })
            .returning('id')
            .executeTakeFirstOrThrow();

        const sooner = await database
            .insertInto('competitions')
            .values({
                season_id: season.id,
                external_id: 'tte:event:sooner-open',
                name: 'Sooner Junior Open',
                display_name: 'Sooner Junior Open',
                event_date: '2026-09-05',
                start_date: '2026-09-05',
                end_date: '2026-09-05',
                venue_name: 'Sooner Arena',
                venue_town: 'York',
                event_status: 'upcoming',
                record_kind: 'calendar',
                category: '1* event, Junior',
                type: 'individual',
                source: 'tte-calendar',
                source_url: 'https://www.tabletennisengland.co.uk/event/sooner-open/',
            })
            .returning('id')
            .executeTakeFirstOrThrow();

        await database
            .insertInto('tournament_sources')
            .values([
                {
                    competition_id: later.id,
                    provider: 'tte',
                    source_type: 'calendar',
                    external_id: 'later-open',
                    source_url: 'https://www.tabletennisengland.co.uk/event/later-open/',
                    source_key: 'later-open',
                    raw_payload: {
                        description: 'Six-player groups followed by three banded knockout competitions.',
                        organizerName: 'Neil Brierley',
                        organizerUrl: 'https://organizer.example.com/neil',
                        venueUrl: 'https://venue.example.com/later',
                    },
                },
                {
                    competition_id: later.id,
                    provider: 'sport80',
                    source_type: 'results',
                    external_id: 'result-99',
                    source_url: 'https://tabletennisengland.sport80.com/public/rankings/results/99',
                    source_key: 'result-99',
                    raw_payload: {},
                    match_method: 'automatic',
                    match_confidence: 0.97,
                },
            ])
            .execute();

        const upcoming = await request
            .get('/api/events?status=upcoming&from=2026-09-01&to=2026-12-31')
            .expect(200);
        const calendarRows = upcoming.body.data.filter(
            (event: { source: string }) => event.source === 'tte-calendar',
        );
        expect(calendarRows.map((event: { id: string }) => event.id)).toEqual([
            sooner.id,
            later.id,
        ]);
        expect(calendarRows[1]).toMatchObject({
            status: 'entries_open',
            start_date: '2026-10-10',
            end_date: '2026-10-11',
            venue_name: 'Later Sports Centre',
            venue_address: '1 Tournament Way',
            venue_town: 'Leeds',
            venue_postcode: 'LS1 1AA',
            entry_url: 'https://entries.example.com/later',
            information_url: 'https://www.tabletennisengland.co.uk/event/later-open/',
            result_url: 'https://tabletennisengland.sport80.com/public/rankings/results/99',
            source_count: 2,
        });

        const completed = await request.get('/api/events?status=completed').expect(200);
        expect(completed.body.data.some((event: { id: string }) => event.id === later.id)).toBe(false);

        const detail = await request.get(`/api/events/${later.id}`).expect(200);
        expect(detail.body.event).toMatchObject({
            description: 'Six-player groups followed by three banded knockout competitions.',
            organizer_name: 'Neil Brierley',
            organizer_url: 'https://organizer.example.com/neil',
            venue_url: 'https://venue.example.com/later',
            venue_address: '1 Tournament Way',
        });
        expect(detail.body.sources).toEqual(expect.arrayContaining([
            expect.objectContaining({
                provider: 'tte',
                source_type: 'calendar',
            }),
            expect.objectContaining({
                provider: 'sport80',
                source_type: 'results',
                match_method: 'automatic',
                match_confidence: 0.97,
            }),
        ]));
    });

    it('supports searching events by name', async () => {
        const matchRes = await request.get('/api/events?q=croydon').expect(200);
        expect(matchRes.body.data.length).toBe(1);
        expect(matchRes.body.data[0].name).toBe('Croydon GP 2026');

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
