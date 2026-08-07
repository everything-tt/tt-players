import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from '@tt-players/db';
import * as userSyncMigration from '../../../../packages/db/src/migrations/034_create_user_sync_states.js';
import { buildApp } from '../app.js';

const { Pool } = pg;
const TEST_DB_NAME = `tt_players_user_sync_test_${process.pid}`;
const ADMIN_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:5432/${TEST_DB_NAME}`;
const USER_ID = '11111111-1111-4111-8111-111111111111';

let db: Kysely<Database>;
let app: Awaited<ReturnType<typeof buildApp>>;

const localSnapshot = {
    version: 1 as const,
    entries: {
        tt_players_selected_league_ids: '["league-1"]',
        'TTPlayers-Theme': 'dark',
    },
};

const updatedSnapshot = {
    version: 1 as const,
    entries: {
        tt_players_selected_league_ids: '["league-2"]',
        tt_players_favourite_players: '["player-1"]',
    },
};

async function createDatabase(): Promise<void> {
    const admin = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    await admin.end();
}

async function dropDatabase(): Promise<void> {
    await app.close();
    await db.destroy();

    const admin = new Pool({ connectionString: ADMIN_DATABASE_URL });
    await admin.query(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = '${TEST_DB_NAME}'
          AND pid <> pg_backend_pid()
    `);
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await admin.end();
}

function authenticatedRequest(method: 'POST' | 'PUT', url: string, payload: unknown) {
    return app.inject({
        method,
        url,
        headers: { authorization: 'Bearer valid-token' },
        payload,
    });
}

beforeAll(async () => {
    await createDatabase();
    db = new Kysely<Database>({
        dialect: new PostgresDialect({
            pool: new Pool({ connectionString: TEST_DATABASE_URL }),
        }),
    });
    await userSyncMigration.up(db);

    process.env['SUPABASE_URL'] = 'https://supabase.example.test';
    process.env['SUPABASE_PUBLISHABLE_KEY'] = 'test-publishable-key';

    app = await buildApp(db);
    await app.ready();
}, 30_000);

beforeEach(async () => {
    await db.deleteFrom('user_sync_states').execute();
    process.env['SUPABASE_URL'] = 'https://supabase.example.test';
    process.env['SUPABASE_PUBLISHABLE_KEY'] = 'test-publishable-key';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
        id: USER_ID,
        email: 'player@example.test',
    }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    })));
});

afterEach(() => {
    vi.unstubAllGlobals();
});

afterAll(async () => {
    delete process.env['SUPABASE_URL'];
    delete process.env['SUPABASE_PUBLISHABLE_KEY'];
    await dropDatabase();
}, 15_000);

describe('authenticated sync state', () => {
    it('rejects requests without a bearer token before calling Supabase', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/api/me/sync-state/bootstrap',
            payload: localSnapshot,
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
            error: 'Authentication required',
            statusCode: 401,
        });
        expect(fetch).not.toHaveBeenCalled();
    });

    it('returns 503 when the authentication service is unavailable', async () => {
        vi.mocked(fetch).mockRejectedValueOnce(new Error('network unavailable'));

        const response = await authenticatedRequest(
            'POST',
            '/api/me/sync-state/bootstrap',
            localSnapshot,
        );

        expect(response.statusCode).toBe(503);
        expect(response.json()).toEqual({
            error: 'Authentication service unavailable',
            statusCode: 503,
        });
    });

    it('rejects an invalid upstream session', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 401 }));

        const response = await authenticatedRequest(
            'POST',
            '/api/me/sync-state/bootstrap',
            localSnapshot,
        );

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
            error: 'Invalid or expired session',
            statusCode: 401,
        });
    });

    it('stores the first bootstrap snapshot and returns it as local', async () => {
        const response = await authenticatedRequest(
            'POST',
            '/api/me/sync-state/bootstrap',
            localSnapshot,
        );

        expect(response.statusCode).toBe(200);
        expect(response.headers['cache-control']).toBe('private, no-store');
        expect(response.json()).toMatchObject({
            data: localSnapshot,
            source: 'local',
        });

        const row = await db
            .selectFrom('user_sync_states')
            .select(['user_id', 'data'])
            .where('user_id', '=', USER_ID)
            .executeTakeFirstOrThrow();
        expect(row.user_id).toBe(USER_ID);
        expect(row.data).toEqual(localSnapshot);
    });

    it('returns the existing server snapshot on repeated bootstrap', async () => {
        await authenticatedRequest(
            'POST',
            '/api/me/sync-state/bootstrap',
            localSnapshot,
        );

        const response = await authenticatedRequest(
            'POST',
            '/api/me/sync-state/bootstrap',
            updatedSnapshot,
        );

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            data: localSnapshot,
            source: 'server',
        });
    });

    it('upserts an updated snapshot', async () => {
        await authenticatedRequest(
            'POST',
            '/api/me/sync-state/bootstrap',
            localSnapshot,
        );

        const response = await authenticatedRequest(
            'PUT',
            '/api/me/sync-state',
            updatedSnapshot,
        );

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            data: updatedSnapshot,
            source: 'server',
        });
    });

    it('rejects unsupported preference keys before authentication or database work', async () => {
        const response = await authenticatedRequest(
            'PUT',
            '/api/me/sync-state',
            {
                version: 1,
                entries: { unsupported_key: 'value' },
            },
        );

        expect(response.statusCode).toBe(400);
        expect(fetch).not.toHaveBeenCalled();
        expect(await db.selectFrom('user_sync_states').selectAll().execute()).toEqual([]);
    });

    it('drops legacy stored keys that are no longer allowed on bootstrap read-back', async () => {
        await db.insertInto('user_sync_states').values({
            user_id: USER_ID,
            version: 1,
            data: {
                version: 1,
                entries: {
                    tt_players_selected_league_ids: '["league-legacy"]',
                    tt_players_tournament_filters: '{"status":"completed"}',
                    unsupported_legacy_key: 'value',
                },
                known_keys: ['tt_players_selected_league_ids'],
            } as never,
        }).execute();

        const response = await authenticatedRequest(
            'POST',
            '/api/me/sync-state/bootstrap',
            localSnapshot,
        );

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.source).toBe('server');
        expect(body.data.entries).toEqual({
            tt_players_selected_league_ids: '["league-legacy"]',
            tt_players_tournament_filters: '{"status":"completed"}',
        });
        expect(body.data.entries).not.toHaveProperty('unsupported_legacy_key');
    });
});
