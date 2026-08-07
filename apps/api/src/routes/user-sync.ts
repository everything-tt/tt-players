import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import { requireSupabaseUser } from '../auth.js';

const MAX_SYNC_BYTES = 900_000;
const ALLOWED_SYNC_KEYS = new Set([
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
    'tt_players_match_journal',
]);

const SyncSnapshotSchema = z.object({
    version: z.literal(1),
    entries: z.record(z.string(), z.string()),
}).superRefine((snapshot, context) => {
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
                const now = new Date();
                const inserted = await db
                    .insertInto('user_sync_states')
                    .values({
                        user_id: user.id,
                        version: 1,
                        data: request.body,
                        updated_at: now,
                    })
                    .onConflict((conflict) => conflict.column('user_id').doNothing())
                    .returning(['data', 'updated_at'])
                    .executeTakeFirst();

                if (inserted) {
                    return reply.send(presentState(inserted, 'local'));
                }

                const existing = await db
                    .selectFrom('user_sync_states')
                    .select(['data', 'updated_at'])
                    .where('user_id', '=', user.id)
                    .executeTakeFirstOrThrow();

                return reply.send(presentState(existing, 'server'));
            },
        );

        app.put(
            '/sync-state',
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
                const updated = await db
                    .insertInto('user_sync_states')
                    .values({
                        user_id: user.id,
                        version: 1,
                        data: request.body,
                        updated_at: new Date(),
                    })
                    .onConflict((conflict) => conflict.column('user_id').doUpdateSet({
                        version: 1,
                        data: request.body,
                        updated_at: new Date(),
                    }))
                    .returning(['data', 'updated_at'])
                    .executeTakeFirstOrThrow();

                return reply.send(presentState(updated, 'server'));
            },
        );
    };
}

function normalizeStoredSnapshot(raw: unknown): SyncSnapshot {
    const candidate = (raw ?? {}) as { version?: unknown; entries?: Record<string, unknown> };
    const rawEntries = candidate.entries ?? {};
    const entries: Record<string, string> = {};
    if (rawEntries && typeof rawEntries === 'object') {
        for (const [key, value] of Object.entries(rawEntries)) {
            if (ALLOWED_SYNC_KEYS.has(key) && typeof value === 'string') {
                entries[key] = value;
            }
        }
    }
    return SyncSnapshotSchema.parse({ version: 1, entries }) as SyncSnapshot;
}

function presentState(row: SyncStateRow, source: 'local' | 'server') {
    return {
        data: normalizeStoredSnapshot(row.data),
        updated_at: row.updated_at.toISOString(),
        source,
    };
}
