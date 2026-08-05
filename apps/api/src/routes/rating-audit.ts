import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql, type Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import { DEFAULT_RATING_MODEL_KEY } from '../ratings/domain.js';

const QuerySchema = z.object({
    model: z.string().min(1).default(DEFAULT_RATING_MODEL_KEY),
});

const ModelHealthSchema = z.object({
    key: z.string(),
    status: z.string().nullable(),
    last_processed_date: z.string().nullable(),
    processed_periods: z.number().int(),
    processed_matches: z.number().int(),
    updated_at: z.string().nullable(),
    rated_players: z.number().int(),
    established_players: z.number().int(),
    provisional_players: z.number().int(),
    average_deviation: z.number(),
    first_rated_date: z.string().nullable(),
    last_rated_date: z.string().nullable(),
});

const DataHealthSchema = z.object({
    stored_rubbers: z.number().int(),
    active_rubbers: z.number().int(),
    eligible_singles: z.number().int(),
    excluded_rubbers: z.number().int(),
    doubles: z.number().int(),
    non_normal_outcome: z.number().int(),
    missing_date: z.number().int(),
    missing_identity: z.number().int(),
    same_canonical_player: z.number().int(),
    tied_score: z.number().int(),
});

const IdentityHealthSchema = z.object({
    source_records: z.number().int(),
    active_records: z.number().int(),
    canonical_players: z.number().int(),
    linked_aliases: z.number().int(),
    active_aliases: z.number().int(),
    soft_deleted_aliases: z.number().int(),
    unassigned_records: z.number().int(),
    broken_targets: z.number().int(),
    chained_links: z.number().int(),
    deleted_targets: z.number().int(),
    same_name_candidate_groups: z.number().int(),
    multi_source_players: z.number().int(),
});

const NetworkHealthSchema = z.object({
    eligible_matches: z.number().int(),
    connected_players: z.number().int(),
    unique_pairings: z.number().int(),
    average_unique_opponents: z.number(),
    maximum_unique_opponents: z.number().int(),
    one_opponent_players: z.number().int(),
    three_or_fewer_opponent_players: z.number().int(),
    competitions: z.number().int(),
    first_match_date: z.string().nullable(),
    last_match_date: z.string().nullable(),
});

const NetworkAnomalySchema = z.object({
    player_id: z.string().uuid(),
    player_name: z.string(),
    rating: z.number(),
    rating_deviation: z.number(),
    rated_matches: z.number().int(),
    unique_opponents: z.number().int(),
    provisional: z.boolean(),
});

const SnapshotContentSchema = z.object({
    model: ModelHealthSchema,
    data: DataHealthSchema,
    identities: IdentityHealthSchema,
    network: NetworkHealthSchema,
    network_anomalies: z.array(NetworkAnomalySchema),
});

const SnapshotResponseSchema = SnapshotContentSchema.extend({
    generated_at: z.string(),
});

interface SnapshotRow {
    content: unknown;
    generated_at: Date;
}

export function ratingAuditRoutes(db: Kysely<Database>): FastifyPluginAsync {
    return async function (fastify) {
        const app = fastify.withTypeProvider<ZodTypeProvider>();

        app.get(
            '/audit/summary',
            {
                schema: {
                    querystring: QuerySchema,
                    response: {
                        200: SnapshotResponseSchema,
                        404: z.object({ error: z.string(), statusCode: z.number().int() }),
                    },
                },
            },
            async (request, reply) => {
                const result = await sql<SnapshotRow>`
                    SELECT snapshot.content, snapshot.generated_at
                    FROM rating_audit_snapshots snapshot
                    JOIN rating_models model ON model.id = snapshot.model_id
                    WHERE model.key = ${request.query.model}
                    LIMIT 1
                `.execute(db);
                const row = result.rows[0];

                if (!row) {
                    return reply.status(404).send({
                        error: 'Rating audit snapshot is not available yet',
                        statusCode: 404,
                    });
                }

                const parsed = SnapshotContentSchema.safeParse(row.content);
                if (!parsed.success) {
                    throw new Error('Stored rating audit snapshot has an invalid shape');
                }

                return reply.send({
                    generated_at: row.generated_at.toISOString(),
                    ...parsed.data,
                });
            },
        );
    };
}
