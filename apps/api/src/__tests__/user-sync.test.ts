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

const SELECTED_LEAGUES = 'tt_players_selected_league_ids';
const FAVOURITE_PLAYERS = 'tt_players_favourite_players';
const THEME = 'TTPlayers-Theme';
const MY_PLAYER = 'tt_players_my_player';
const MY_TT_PROFILE = 'tt_players_my_tt_profile';
const ENTRY_PROFILES = 'tt_players_tournament_entry_profiles';
const TOURNAMENT_FILTERS = 'tt_players_tournament_filters';

let db: Kysely<Database>;
let app: Awaited<ReturnType<typeof buildApp>>;

const localSnapshot = {
    version: 1 as const,
    known_keys: [SELECTED_LEAGUES, FAVOURITE_PLAYERS, THEME],
    entries: {
        [SELECTED_LEAGUES]: '["league-1"]',
        [THEME]: 'dark-mode',
    },
};

const updatedSnapshot = {
    version: 1 as const,
    known_keys: [SELECTED_LEAGUES, FAVOURITE_PLAYERS, THEME],
    entries: {
        [SELECTED_LEAGUES]: '["league-2"]',
        [FAVOURITE_PLAYERS]: '["player-1"]',
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

function authenticatedRequest(method: 'POST' | 'PUT' | 'PATCH', url: string, payload: unknown) {
    return app.inject({
        method,
        url,
        headers: { authorization: 'Bearer valid-token' },
        payload,
    });
}

function authenticatedGet(url: string) {
    return app.inject({
        method: 'GET',
        url,
        headers: { authorization: 'Bearer valid-token' },
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

    it('returns the existing server snapshot on repeated bootstrap for already-known keys', async () => {
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

    it('migrates only newly introduced preference keys into a legacy server row', async () => {
        await db.insertInto('user_sync_states').values({
            user_id: USER_ID,
            version: 1,
            data: {
                version: 1,
                entries: {
                    [THEME]: 'dark-mode',
                },
            },
            updated_at: new Date('2026-07-30T12:00:00.000Z'),
        }).execute();

        const entryProfiles = JSON.stringify({ version: 1, ownerUserId: USER_ID, profiles: [] });
        const response = await authenticatedRequest(
            'POST',
            '/api/me/sync-state/bootstrap',
            {
                version: 1,
                known_keys: [
                    SELECTED_LEAGUES,
                    FAVOURITE_PLAYERS,
                    THEME,
                    MY_PLAYER,
                    MY_TT_PROFILE,
                    ENTRY_PROFILES,
                    TOURNAMENT_FILTERS,
                ],
                entries: {
                    [FAVOURITE_PLAYERS]: '["local-favourite"]',
                    [MY_TT_PROFILE]: '{"version":1,"playerId":"p1"}',
                    [ENTRY_PROFILES]: entryProfiles,
                    [TOURNAMENT_FILTERS]: '{"version":1,"status":"completed","savedOnly":true,"categories":[]}',
                },
            },
        );

        expect(response.statusCode).toBe(200);
        const data = response.json().data as { known_keys: string[]; entries: Record<string, string> };
        expect(data.entries[THEME]).toBe('dark-mode');
        expect(data.entries[MY_TT_PROFILE]).toBe('{"version":1,"playerId":"p1"}');
        expect(data.entries[ENTRY_PROFILES]).toBe(entryProfiles);
        expect(data.entries[TOURNAMENT_FILTERS]).toContain('completed');
        // Favourites existed in the original sync schema. Their absence from the
        // legacy server row means the account had cleared them, so do not revive
        // a stale local favourite during schema migration.
        expect(data.entries[FAVOURITE_PLAYERS]).toBeUndefined();
        expect(data.known_keys).toContain(MY_TT_PROFILE);
        expect(data.known_keys).toContain(ENTRY_PROFILES);
        expect(data.known_keys).toContain(TOURNAMENT_FILTERS);
    });

    it('serves the current server snapshot for foreground/device refreshes', async () => {
        await authenticatedRequest('POST', '/api/me/sync-state/bootstrap', localSnapshot);

        const response = await authenticatedGet('/api/me/sync-state');

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({ data: localSnapshot, source: 'server' });
    });

    it('patches only changed keys and preserves unrelated account state', async () => {
        const initial = {
            version: 1 as const,
            known_keys: [THEME, MY_PLAYER],
            entries: {
                [THEME]: 'light-mode',
                [MY_PLAYER]: '{"id":"p1","name":"Alice"}',
            },
        };
        await authenticatedRequest('POST', '/api/me/sync-state/bootstrap', initial);

        const response = await authenticatedRequest(
            'PATCH',
            '/api/me/sync-state',
            { version: 1, changes: { [THEME]: 'dark-mode' } },
        );

        expect(response.statusCode).toBe(200);
        expect(response.json().data.entries).toEqual({
            [THEME]: 'dark-mode',
            [MY_PLAYER]: '{"id":"p1","name":"Alice"}',
        });
    });

    it('supports explicit per-key deletion through PATCH', async () => {
        const initial = {
            version: 1 as const,
            known_keys: [THEME, MY_PLAYER],
            entries: {
                [THEME]: 'dark-mode',
                [MY_PLAYER]: '{"id":"p1","name":"Alice"}',
            },
        };
        await authenticatedRequest('POST', '/api/me/sync-state/bootstrap', initial);

        const response = await authenticatedRequest(
            'PATCH',
            '/api/me/sync-state',
            { version: 1, changes: { [MY_PLAYER]: null } },
        );

        expect(response.statusCode).toBe(200);
        expect(response.json().data.entries[MY_PLAYER]).toBeUndefined();
        expect(response.json().data.entries[THEME]).toBe('dark-mode');
    });

    it('lets a current PUT clear known keys without erasing keys it does not know', async () => {
        await authenticatedRequest(
            'POST',
            '/api/me/sync-state/bootstrap',
            {
                version: 1,
                known_keys: [SELECTED_LEAGUES, FAVOURITE_PLAYERS, THEME, MY_TT_PROFILE],
                entries: {
                    [SELECTED_LEAGUES]: '["league-1"]',
                    [THEME]: 'dark-mode',
                    [MY_TT_PROFILE]: '{"version":1,"playerId":"p1"}',
                },
            },
        );

        const response = await authenticatedRequest(
            'PUT',
            '/api/me/sync-state',
            updatedSnapshot,
        );

        expect(response.statusCode).toBe(200);
        expect(response.json().data.entries).toEqual({
            [SELECTED_LEAGUES]: '["league-2"]',
            [FAVOURITE_PLAYERS]: '["player-1"]',
            [MY_TT_PROFILE]: '{"version":1,"playerId":"p1"}',
        });
    });

    it('keeps newer preferences when an older client PUTs a legacy snapshot', async () => {
        await db.insertInto('user_sync_states').values({
            user_id: USER_ID,
            version: 1,
            data: {
                version: 1,
                known_keys: [THEME, MY_TT_PROFILE],
                entries: {
                    [THEME]: 'dark-mode',
                    [MY_TT_PROFILE]: '{"version":1,"playerId":"p1"}',
                },
            },
            updated_at: new Date(),
        }).execute();

        const response = await authenticatedRequest(
            'PUT',
            '/api/me/sync-state',
            { version: 1, entries: { [THEME]: 'light-mode' } },
        );

        expect(response.statusCode).toBe(200);
        expect(response.json().data.entries[THEME]).toBe('light-mode');
        expect(response.json().data.entries[MY_TT_PROFILE]).toBe('{"version":1,"playerId":"p1"}');
    });

    it('rejects unsupported preference keys before authentication or database work', async () => {
        const response = await authenticatedRequest(
            'PATCH',
            '/api/me/sync-state',
            {
                version: 1,
                changes: { unsupported_key: 'value' },
            },
        );

        expect(response.statusCode).toBe(400);
        expect(fetch).not.toHaveBeenCalled();
        expect(await db.selectFrom('user_sync_states').selectAll().execute()).toEqual([]);
    });
});
