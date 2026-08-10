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
let competitionId: string;

beforeAll(async () => {
    await createTestDatabase();
    db = createTestKysely();
    await runMigrations(db);

    const platform = await db
        .insertInto('platforms')
        .values({ name: 'TTE Test', base_url: 'https://www.tabletennisengland.co.uk' })
        .returning('id')
        .executeTakeFirstOrThrow();
    const league = await db
        .insertInto('leagues')
        .values({ platform_id: platform.id, external_id: 'tte-test', name: 'TTE Test' })
        .returning('id')
        .executeTakeFirstOrThrow();
    const season = await db
        .insertInto('seasons')
        .values({ league_id: league.id, external_id: '2026', name: '2026', is_active: true })
        .returning('id')
        .executeTakeFirstOrThrow();
    const competition = await db
        .insertInto('competitions')
        .values({
            season_id: season.id,
            external_id: 'event-entry-form-test',
            name: 'Cached Form Tournament',
            type: 'individual',
            source: 'tte-calendar',
            event_status: 'entries_open',
            entry_url: 'https://docs.google.com/forms/d/e/form-id/viewform',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    competitionId = competition.id;

    const app = await buildApp(db);
    await app.ready();
    request = supertest(app.server);
}, 30_000);

afterAll(async () => {
    await dropTestDatabase(db);
}, 15_000);

describe('cached tournament entry forms', () => {
    it('returns null when ingestion has not stored an inspection', async () => {
        const response = await request
            .get(`/api/events/${competitionId}/entry-form`)
            .expect(200);
        expect(response.body).toEqual({ data: null });
    });

    it('returns the current blank form schema and semantic analysis stored by ingestion', async () => {
        const inspectedAt = '2026-08-06T10:00:00.000Z';
        const payload = {
            version: 3,
            provider: 'google_forms',
            status: 'ready',
            source_url: 'https://docs.google.com/forms/d/e/form-id/viewform',
            inspected_at: inspectedAt,
            fingerprint: 'abc123',
            form: {
                provider: 'google_forms',
                form_url: 'https://docs.google.com/forms/d/e/form-id/viewform',
                title: 'Tournament Entry',
                public_text: null,
                fields: [
                    {
                        id: '123',
                        label: 'Player name',
                        description: null,
                        kind: 'short_text',
                        required: true,
                        options: [],
                    },
                ],
            },
            semantic_analysis: {
                version: 1,
                status: 'ready',
                provider: 'openai_compatible',
                model: 'deepseek-v4-flash',
                prompt_version: '2026-08-07.2',
                analysis_key: '2026-08-07.2:deepseek-v4-flash',
                analyzed_at: inspectedAt,
                mappings: [
                    {
                        field_id: '123',
                        profile_field: 'entrantName',
                        confidence: 0.98,
                        reason: 'The question explicitly asks for the player name.',
                    },
                ],
                event_details: [
                    {
                        field: 'entry_fee',
                        value: '£12',
                        confidence: 0.95,
                        evidence: 'Entry fee £12',
                        source_field_ids: [],
                    },
                ],
                categories: [
                    {
                        name: 'Under 15 Boys',
                        entry_fee: '£12',
                    },
                ],
                error_message: null,
            },
            error_code: null,
            error_message: null,
        } as const;

        await db
            .insertInto('tournament_sources')
            .values({
                competition_id: competitionId,
                provider: 'google_forms',
                source_type: 'entry_form',
                source_url: payload.source_url,
                source_key: competitionId,
                payload_hash: payload.fingerprint,
                raw_payload: payload,
                match_method: 'competition-entry-url',
                match_confidence: 1,
            })
            .execute();

        const response = await request
            .get(`/api/events/${competitionId}/entry-form`)
            .expect(200);
        expect(response.body.data).toEqual(payload);
        expect(response.headers['cache-control']).toContain('public');
    });
});
