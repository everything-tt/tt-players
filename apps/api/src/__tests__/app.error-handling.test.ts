import { afterEach, describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import { buildApp } from '../app.js';

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('API error handling', () => {
    it('does not expose unexpected internal error details', async () => {
        const app = await buildApp({} as Kysely<Database>);
        apps.push(app);

        const response = await app.inject({
            method: 'GET',
            url: '/api/health/db',
        });

        expect(response.statusCode).toBe(500);
        expect(response.json()).toEqual({
            error: 'Internal Server Error',
            statusCode: 500,
        });
        expect(response.body).not.toContain('executeQuery');
    });

    it('keeps validation failures useful to API clients', async () => {
        const app = await buildApp({} as Kysely<Database>);
        apps.push(app);

        const response = await app.inject({
            method: 'GET',
            url: '/api/teams/not-a-uuid/summary',
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({
            statusCode: 400,
        });
        expect(response.json().error).not.toBe('Internal Server Error');
    });
});
