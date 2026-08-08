import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import { requireSupabaseUser } from '../auth.js';

const MAX_SYNC_BYTES = 900_000;
const ALLOWED_SYNC_KEY_LIST = [
    'tt_players_selected_league_ids',
    'tt_players_league_onboarding_complete',
    'tt_players_favourite_players',
    'tt_players_favourite_h2h',
    'tt_players_favourite_teams',
    'tt_players_favourite_tournaments',
    'TTPlayers-Theme',
    'tt_players_my_player',
    'tt_players_my_tt_profile',
    'tt_players_tournament_entry_profiles',
    'tt_players_tournament_filters',
    'tt_players_match_journal',
] as const;
const ALLOWED_SYNC_KEYS = new Set<string>(ALLOWED_SYNC_KEY_LIST);

// Account sync shipped before My TT, tournament entrant profiles, and tournament
// filters. Legacy rows therefore understood these original keys even when a key
// is absent from `entries` (absence means intentionally cleared for those keys).
const LEGACY_KNOWN_SYNC_KEYS = new Set<string>([
    'tt_players_selected_league_ids',
    'tt_players_league_onboarding_complete',
    'tt_players_favourite_players',
    'tt_players_favourite_h2h',
    'tt_players_favourite_teams',
    'tt_players_favourite_tournaments',
    'TTPlayers-Theme',
    'tt_players_my_player',
    'tt_players_match_journal',
]);

const SyncSnapshotSchema = z.object({
    version: z.literal(1),
    known_keys: z.array(z.string()).optional(),
    entries: z.record(z.string(), z.string()),
}).superRefine((snapshot, context) => {
    for (const key of snapshot.known_keys ?? []) {
        if (!ALLOWED_SYNC_KEYS.has(key)) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['known_keys'],
                message: 'Unsupported preference key',
            });
        }
    }
    for (const key of Object.keys(snapshot.entries)) {
        if (!ALLOWED_SYNC_KEYS.has(key)) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['entries', key],
                message: 'Unsupported preference key',
            });
        }
    }

    if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > MAX_SYNC_BYTES) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Sync data is too large',
        });
    }
});

const SyncPatchSchema = z.object({
    version: z.literal(1),
    changes: z.record(z.string(), z.string().nullable()),
}).superRefine((patch, context) => {
    for (const key of Object.keys(patch.changes)) {
        if (!ALLOWED_SYNC_KEYS.has(key)) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['changes', key],
                message: 'Unsupported preference key',
            });
        }
    }
    if (Buffer.byteLength(JSON.stringify(patch), 'utf8') > MAX_SYNC_BYTES) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Sync data is too large',
        });
    }
});

const SyncStateResponseSchema = z.object({
    data: SyncSnapshotSchema,
    updated_at: z.string(),
    source: z.enum(['local', 'server']),
});

const ErrorSchema = z.object({
    error: z.string(),
    statusCode: z.number().int(),
});

type SyncSnapshot = z.infer<typeof SyncSnapshotSchema>;

interface SyncStateRow {
    data: unknown;
    updated_at: Date;
}

function normalizeSnapshot(value: unknown): SyncSnapshot {
    const parsed = SyncSnapshotSchema.parse(value);
    const known = new Set<string>(parsed.known_keys ?? LEGACY_KNOWN_SYNC_KEYS);
    for (const key of Object.keys(parsed.entries)) known.add(key);

    return {
        version: 1,
        known_keys: ALLOWED_SYNC_KEY_LIST.filter((key) => known.has(key)),
        entries: { ...parsed.entries },
    };
}

function mergeNewlyKnownKeys(serverValue: unknown, localValue: unknown): { data: SyncSnapshot; changed: boolean } {
    const server = normalizeSnapshot(serverValue);
    const local = normalizeSnapshot(localValue);
    const serverKnown = new Set(server.known_keys ?? []);
    let changed = false;

    for (const key of local.known_keys ?? []) {
        if (serverKnown.has(key)) continue;
        if (Object.prototype.hasOwnProperty.call(local.entries, key)) {
            server.entries[key] = local.entries[key]!;
        }
        serverKnown.add(key);
        changed = true;
    }

    server.known_keys = ALLOWED_SYNC_KEY_LIST.filter((key) => serverKnown.has(key));
    return { data: server, changed };
}

function mergeClientSnapshot(serverValue: unknown, clientValue: unknown): SyncSnapshot {
    const server = normalizeSnapshot(serverValue);
    const client = normalizeSnapshot(clientValue);
    const known = new Set(server.known_keys ?? []);

    for (const key of client.known_keys ?? []) {
        known.add(key);
        if (Object.prototype.hasOwnProperty.call(client.entries, key)) {
            server.entries[key] = client.entries[key]!;
        } else {
            delete server.entries[key];
        }
    }

    server.known_keys = ALLOWED_SYNC_KEY_LIST.filter((key) => known.has(key));
    return server;
}

function applyPatch(serverValue: unknown, changes: Record<string, string | null>): SyncSnapshot {
    const server = normalizeSnapshot(serverValue);
    const known = new Set(server.known_keys ?? []);
    for (const [key, value] of Object.entries(changes)) {
        known.add(key);
        if (value === null) delete server.entries[key];
        else server.entries[key] = value;
    }
    server.known_keys = ALLOWED_SYNC_KEY_LIST.filter((key) => known.has(key));
    return server;
}

function assertSnapshotSize(snapshot: SyncSnapshot): void {
    if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > MAX_SYNC_BYTES) {
        throw new Error('SYNC_STATE_TOO_LARGE');
    }
}

export function userSyncRoutes(db: Kysely<Database>): FastifyPluginAsync {
    return async function (fastify) {
        const app = fastify.withTypeProvider<ZodTypeProvider>();

        app.post(
            '/sync-state/bootstrap',
            {
                schema: {
                    body: SyncSnapshotSchema,
                    response: {
                        200: SyncStateResponseSchema,
                        401: ErrorSchema,
                        503: ErrorSchema,
                    },
                },
            },
            async (request, reply) => {
                const user = await requireSupabaseUser(request, reply);
                if (!user) return;

                reply.header('Cache-Control', 'private, no-store');
                const local = normalizeSnapshot(request.body);
                const now = new Date();
                const inserted = await db
                    .insertInto('user_sync_states')
                    .values({
                        user_id: user.id,
                        version: 1,
                        data: local,
                        updated_at: now,
                    })
                    .onConflict((conflict) => conflict.column('user_id').doNothing())
                    .returning(['data', 'updated_at'])
                    .executeTakeFirst();

                if (inserted) {
                    return reply.send(presentState(inserted, 'local'));
                }

                const resolved = await db.transaction().execute(async (trx) => {
                    const existing = await trx
                        .selectFrom('user_sync_states')
                        .select(['data', 'updated_at'])
                        .where('user_id', '=', user.id)
                        .forUpdate()
                        .executeTakeFirstOrThrow();
                    const merged = mergeNewlyKnownKeys(existing.data, local);
                    if (!merged.changed) return existing;

                    const updatedAt = new Date();
                    return trx
                        .updateTable('user_sync_states')
                        .set({ data: merged.data, updated_at: updatedAt })
                        .where('user_id', '=', user.id)
                        .returning(['data', 'updated_at'])
                        .executeTakeFirstOrThrow();
                });

                return reply.send(presentState(resolved, 'server'));
            },
        );

        app.get(
            '/sync-state',
            {
                schema: {
                    response: {
                        200: SyncStateResponseSchema,
                        401: ErrorSchema,
                        404: ErrorSchema,
                        503: ErrorSchema,
                    },
                },
            },
            async (request, reply) => {
                const user = await requireSupabaseUser(request, reply);
                if (!user) return;

                reply.header('Cache-Control', 'private, no-store');
                const existing = await db
                    .selectFrom('user_sync_states')
                    .select(['data', 'updated_at'])
                    .where('user_id', '=', user.id)
                    .executeTakeFirst();
                if (!existing) {
                    return reply.status(404).send({ error: 'Sync state not found', statusCode: 404 });
                }
                return reply.send(presentState(existing, 'server'));
            },
        );

        app.patch(
            '/sync-state',
            {
                schema: {
                    body: SyncPatchSchema,
                    response: {
                        200: SyncStateResponseSchema,
                        400: ErrorSchema,
                        401: ErrorSchema,
                        503: ErrorSchema,
                    },
                },
            },
            async (request, reply) => {
                const user = await requireSupabaseUser(request, reply);
                if (!user) return;

                reply.header('Cache-Control', 'private, no-store');
                try {
                    const updated = await db.transaction().execute(async (trx) => {
                        const existing = await trx
                            .selectFrom('user_sync_states')
                            .select(['data', 'updated_at'])
                            .where('user_id', '=', user.id)
                            .forUpdate()
                            .executeTakeFirst();
                        const base: SyncSnapshot = existing
                            ? normalizeSnapshot(existing.data)
                            : { version: 1, known_keys: [], entries: {} };
                        const next = applyPatch(base, request.body.changes);
                        assertSnapshotSize(next);
                        const updatedAt = new Date();

                        if (!existing) {
                            return trx
                                .insertInto('user_sync_states')
                                .values({
                                    user_id: user.id,
                                    version: 1,
                                    data: next,
                                    updated_at: updatedAt,
                                })
                                .returning(['data', 'updated_at'])
                                .executeTakeFirstOrThrow();
                        }

                        return trx
                            .updateTable('user_sync_states')
                            .set({ data: next, updated_at: updatedAt })
                            .where('user_id', '=', user.id)
                            .returning(['data', 'updated_at'])
                            .executeTakeFirstOrThrow();
                    });
                    return reply.send(presentState(updated, 'server'));
                } catch (error) {
                    if (error instanceof Error && error.message === 'SYNC_STATE_TOO_LARGE') {
                        return reply.status(400).send({ error: 'Sync data is too large', statusCode: 400 });
                    }
                    throw error;
                }
            },
        );

        // Keep PUT for older clients. It is key-aware so an older client cannot
        // erase preferences introduced by a newer client merely because it does
        // not know those keys exist.
        app.put(
            '/sync-state',
            {
                schema: {
                    body: SyncSnapshotSchema,
                    response: {
                        200: SyncStateResponseSchema,
                        400: ErrorSchema,
                        401: ErrorSchema,
                        503: ErrorSchema,
                    },
                },
            },
            async (request, reply) => {
                const user = await requireSupabaseUser(request, reply);
                if (!user) return;

                reply.header('Cache-Control', 'private, no-store');
                try {
                    const updated = await db.transaction().execute(async (trx) => {
                        const existing = await trx
                            .selectFrom('user_sync_states')
                            .select(['data', 'updated_at'])
                            .where('user_id', '=', user.id)
                            .forUpdate()
                            .executeTakeFirst();
                        const client = normalizeSnapshot(request.body);
                        const next = existing ? mergeClientSnapshot(existing.data, client) : client;
                        assertSnapshotSize(next);
                        const updatedAt = new Date();

                        if (!existing) {
                            return trx
                                .insertInto('user_sync_states')
                                .values({
                                    user_id: user.id,
                                    version: 1,
                                    data: next,
                                    updated_at: updatedAt,
                                })
                                .returning(['data', 'updated_at'])
                                .executeTakeFirstOrThrow();
                        }

                        return trx
                            .updateTable('user_sync_states')
                            .set({ data: next, updated_at: updatedAt })
                            .where('user_id', '=', user.id)
                            .returning(['data', 'updated_at'])
                            .executeTakeFirstOrThrow();
                    });
                    return reply.send(presentState(updated, 'server'));
                } catch (error) {
                    if (error instanceof Error && error.message === 'SYNC_STATE_TOO_LARGE') {
                        return reply.status(400).send({ error: 'Sync data is too large', statusCode: 400 });
                    }
                    throw error;
                }
            },
        );
    };
}

function presentState(row: SyncStateRow, source: 'local' | 'server') {
    return {
        data: normalizeSnapshot(row.data),
        updated_at: row.updated_at.toISOString(),
        source,
    };
}
