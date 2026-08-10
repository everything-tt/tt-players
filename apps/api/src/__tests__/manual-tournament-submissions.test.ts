import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';
import { sql, type Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import * as manualSubmitterMigration from '../../../../packages/db/src/migrations/053_add_manual_tournament_submitter.js';
import { buildApp } from '../app.js';
import {
    createTestDatabase,
    createTestKysely,
    dropTestDatabase,
    runMigrations,
} from './helpers/seed.js';

let db: Kysely<Database>;
let request: ReturnType<typeof supertest>;

const USER_ID = '11111111-1111-4111-8111-111111111111';

beforeAll(async () => {
    await createTestDatabase();
    db = createTestKysely();
    await runMigrations(db);
    await manualSubmitterMigration.up(db as Kysely<any>);
    await sql`create schema if not exists graphile_worker`.execute(db);
    await sql`
        create or replace function graphile_worker.add_job(
            identifier text,
            payload json,
            job_key text default null
        ) returns json
        language sql
        as $$ select json_build_object('identifier', identifier, 'payload', payload, 'job_key', job_key) $$
    `.execute(db);

    process.env.SUPABASE_URL = 'https://supabase.example.com';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';

    const app = await buildApp(db);
    await app.ready();
    request = supertest(app.server);
}, 30_000);

afterEach(() => {
    vi.unstubAllGlobals();
});

afterAll(async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    await dropTestDatabase(db);
}, 15_000);

function mockAuthenticatedUser(): void {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
        id: USER_ID,
        email: 'player@example.com',
    }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    })));
}

describe('manual tournament submissions', () => {
    it('requires a signed-in user', async () => {
        await request
            .post('/api/events/manual-submit')
            .send({ url: 'https://example.com/tournament-form' })
            .expect(401);

        await request
            .get('/api/events/manual-submissions')
            .expect(401);
    });

    it('creates one hidden manual-submit competition and records the submitting user', async () => {
        mockAuthenticatedUser();

        const formUrl = 'https://docs.google.com/forms/d/example-form-id/viewform?tracking=1';
        const response = await request
            .post('/api/events/manual-submit')
            .set('Authorization', 'Bearer test-session-token')
            .send({ url: formUrl })
            .expect(202);

        expect(response.body).toMatchObject({
            status: 'processing',
            duplicate: false,
        });

        const database = db as Kysely<any>;
        const competition = await database
            .selectFrom('competitions')
            .select(['id', 'source', 'entry_url', 'event_status', 'record_kind'])
            .where('id', '=', response.body.competition_id)
            .executeTakeFirstOrThrow();

        expect(competition).toMatchObject({
            source: 'manual-submit',
            entry_url: 'https://docs.google.com/forms/d/example-form-id/viewform',
            event_status: 'unpublished',
            record_kind: 'calendar',
        });

        const source = await database
            .selectFrom('tournament_sources')
            .select(['provider', 'source_type', 'source_url', 'submitted_by_user_id'])
            .where('competition_id', '=', competition.id)
            .where('provider', '=', 'manual-submit')
            .where('source_type', '=', 'submission')
            .executeTakeFirstOrThrow();

        expect(source).toMatchObject({
            provider: 'manual-submit',
            source_type: 'submission',
            source_url: 'https://docs.google.com/forms/d/example-form-id/viewform',
            submitted_by_user_id: USER_ID,
        });
    });

    it('lists the signed-in users submissions and reflects processing completion', async () => {
        mockAuthenticatedUser();
        const url = 'https://example.com/my-tracked-tournament';

        const submitted = await request
            .post('/api/events/manual-submit')
            .set('Authorization', 'Bearer tracking-session')
            .send({ url })
            .expect(202);

        const processing = await request
            .get('/api/events/manual-submissions')
            .set('Authorization', 'Bearer tracking-session')
            .expect(200);

        expect(processing.body.data).toEqual(expect.arrayContaining([
            expect.objectContaining({
                competition_id: submitted.body.competition_id,
                source_url: url,
                status: 'processing',
                status_message: null,
                name: null,
            }),
        ]));

        await (db as Kysely<any>)
            .updateTable('competitions')
            .set({
                display_name: 'Tracked Open 2026',
                start_date: '2026-09-12',
                event_status: 'upcoming',
            })
            .where('id', '=', submitted.body.competition_id)
            .execute();
        await (db as Kysely<any>)
            .updateTable('tournament_sources')
            .set({
                raw_payload: {
                    submitted_url: url,
                    submission_status: 'published',
                    submission_status_message: null,
                },
            })
            .where('competition_id', '=', submitted.body.competition_id)
            .where('provider', '=', 'manual-submit')
            .where('source_type', '=', 'submission')
            .where('submitted_by_user_id', '=', USER_ID)
            .execute();

        const published = await request
            .get('/api/events/manual-submissions')
            .set('Authorization', 'Bearer tracking-session')
            .expect(200);

        expect(published.body.data).toEqual(expect.arrayContaining([
            expect.objectContaining({
                competition_id: submitted.body.competition_id,
                status: 'published',
                status_message: null,
                name: 'Tracked Open 2026',
                start_date: '2026-09-12',
            }),
        ]));
    });

    it('reports a failed processing outcome without publishing the placeholder', async () => {
        mockAuthenticatedUser();
        const url = 'https://example.com/unreadable-tournament';

        const submitted = await request
            .post('/api/events/manual-submit')
            .set('Authorization', 'Bearer failed-session')
            .send({ url })
            .expect(202);

        await (db as Kysely<any>)
            .updateTable('tournament_sources')
            .set({
                raw_payload: {
                    submitted_url: url,
                    submission_status: 'failed',
                    submission_status_message: 'Could not extract tournament details from this link.',
                },
            })
            .where('competition_id', '=', submitted.body.competition_id)
            .where('provider', '=', 'manual-submit')
            .where('source_type', '=', 'submission')
            .where('submitted_by_user_id', '=', USER_ID)
            .execute();

        const response = await request
            .get('/api/events/manual-submissions')
            .set('Authorization', 'Bearer failed-session')
            .expect(200);

        expect(response.body.data).toEqual(expect.arrayContaining([
            expect.objectContaining({
                competition_id: submitted.body.competition_id,
                status: 'failed',
                status_message: 'Could not extract tournament details from this link.',
                name: null,
                event_status: 'unpublished',
            }),
        ]));
    });

    it('deduplicates the tournament while retaining a provenance row per submitting user', async () => {
        mockAuthenticatedUser();
        const url = 'https://example.com/tournament-entry?id=42';

        const first = await request
            .post('/api/events/manual-submit')
            .set('Authorization', 'Bearer first-session')
            .send({ url })
            .expect(202);

        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            id: '22222222-2222-4222-8222-222222222222',
            email: 'second@example.com',
        }), { status: 200, headers: { 'content-type': 'application/json' } })));

        const second = await request
            .post('/api/events/manual-submit')
            .set('Authorization', 'Bearer second-session')
            .send({ url })
            .expect(202);

        expect(second.body).toMatchObject({
            competition_id: first.body.competition_id,
            duplicate: true,
            status: 'processing',
        });

        const database = db as Kysely<any>;
        const sources = await database
            .selectFrom('tournament_sources')
            .select('submitted_by_user_id')
            .where('competition_id', '=', first.body.competition_id)
            .where('provider', '=', 'manual-submit')
            .where('source_type', '=', 'submission')
            .orderBy('submitted_by_user_id', 'asc')
            .execute();

        expect(sources.map((source: { submitted_by_user_id: string }) => source.submitted_by_user_id)).toEqual([
            '11111111-1111-4111-8111-111111111111',
            '22222222-2222-4222-8222-222222222222',
        ]);
    });
});
