import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql, type Kysely } from 'kysely';
import type { Database } from '@tt-players/db';

const ParamsSchema = z.object({
    id: z.string().uuid(),
});

const QuerySchema = z.object({
    list_kind: z.enum(['all', 'ranking', 'rating']).default('all'),
    limit: z.coerce.number().int().min(1).max(500).default(100),
});

const OfficialRankingPointSchema = z.object({
    source_name: z.string(),
    source_url: z.string(),
    category_name: z.string(),
    list_kind: z.enum(['ranking', 'rating']),
    period_label: z.string(),
    period_end_date: z.string().nullable(),
    rank: z.number().int().nullable(),
    points: z.number().int().nullable(),
    county_country: z.string().nullable(),
    inactive_periods: z.number().int().nullable(),
    is_initial_rating: z.boolean(),
});

interface IdentityRow {
    player_id: string;
    player_name: string;
}

interface SnapshotRow {
    source_name: string;
    source_url: string;
    category_name: string;
    list_kind: 'ranking' | 'rating';
    period_label: string;
    period_end_date: string | Date | null;
    rank: number | null;
    points: number | null;
    county_country: string | null;
    inactive_periods: number | null;
    is_initial_rating: boolean;
    latest_order: number;
}

export function officialRankingHistoryRoutes(db: Kysely<Database>): FastifyPluginAsync {
    return async function (fastify) {
        const app = fastify.withTypeProvider<ZodTypeProvider>();

        app.get(
            '/:id/official-history',
            {
                schema: {
                    params: ParamsSchema,
                    querystring: QuerySchema,
                    response: {
                        200: z.object({
                            player_id: z.string().uuid(),
                            player_name: z.string(),
                            latest: z.array(OfficialRankingPointSchema),
                            history: z.array(OfficialRankingPointSchema),
                        }),
                        404: z.object({
                            error: z.string(),
                            statusCode: z.number().int(),
                        }),
                    },
                },
            },
            async (request, reply) => {
                const identityResult = await sql<IdentityRow>`
                    SELECT
                        COALESCE(player.canonical_player_id, player.id) AS player_id,
                        COALESCE(canonical.name, player.name) AS player_name
                    FROM external_players player
                    LEFT JOIN external_players canonical
                      ON canonical.id = COALESCE(player.canonical_player_id, player.id)
                     AND canonical.deleted_at IS NULL
                    WHERE player.id = ${request.params.id}::uuid
                      AND player.deleted_at IS NULL
                    LIMIT 1
                `.execute(db);
                const identity = identityResult.rows[0];
                if (!identity) {
                    return reply.status(404).send({
                        error: 'Player not found',
                        statusCode: 404,
                    });
                }

                const result = await sql<SnapshotRow>`
                    WITH player_sources AS (
                        SELECT source.id
                        FROM external_players source
                        WHERE source.deleted_at IS NULL
                          AND COALESCE(source.canonical_player_id, source.id) = ${identity.player_id}::uuid
                    ),
                    ranked_snapshots AS (
                        SELECT
                            platform.name AS source_name,
                            platform.base_url AS source_url,
                            snapshot.category_name,
                            snapshot.list_kind,
                            snapshot.period_label,
                            snapshot.period_end_date,
                            snapshot.rank,
                            snapshot.points,
                            snapshot.county_country,
                            snapshot.inactive_periods,
                            snapshot.is_initial_rating,
                            ROW_NUMBER() OVER (
                                PARTITION BY snapshot.platform_id, snapshot.category_name, snapshot.list_kind
                                ORDER BY
                                    snapshot.period_end_date DESC NULLS LAST,
                                    snapshot.source_period_external_id DESC,
                                    snapshot.updated_at DESC
                            )::int AS latest_order
                        FROM official_ranking_snapshots snapshot
                        JOIN player_sources source ON source.id = snapshot.player_id
                        JOIN platforms platform ON platform.id = snapshot.platform_id
                        WHERE (${request.query.list_kind} = 'all'
                            OR snapshot.list_kind::text = ${request.query.list_kind})
                    )
                    SELECT *
                    FROM ranked_snapshots
                    ORDER BY
                        period_end_date DESC NULLS LAST,
                        category_name ASC,
                        list_kind ASC
                    LIMIT ${request.query.limit}
                `.execute(db);

                const points = result.rows.map(presentPoint);
                return reply.send({
                    player_id: identity.player_id,
                    player_name: identity.player_name,
                    latest: result.rows
                        .filter((row) => row.latest_order === 1)
                        .map(presentPoint),
                    history: points,
                });
            },
        );
    };
}

function presentPoint(row: SnapshotRow) {
    return {
        source_name: row.source_name,
        source_url: row.source_url,
        category_name: row.category_name,
        list_kind: row.list_kind,
        period_label: row.period_label,
        period_end_date: toDateString(row.period_end_date),
        rank: row.rank === null ? null : Number(row.rank),
        points: row.points === null ? null : Number(row.points),
        county_country: row.county_country,
        inactive_periods: row.inactive_periods === null ? null : Number(row.inactive_periods),
        is_initial_rating: row.is_initial_rating,
    };
}

function toDateString(value: string | Date | null): string | null {
    if (!value) return null;
    return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}
