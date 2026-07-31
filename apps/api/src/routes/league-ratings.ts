import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql, type Kysely, type RawBuilder } from 'kysely';
import type { Database } from '@tt-players/db';
import {
    DEFAULT_RATING_MODEL_KEY,
    type RankedRatingRow,
    presentRankedRating,
} from '../ratings/domain.js';
import { RankedRatingSchema } from '../ratings/schemas.js';

const QuerySchema = z.object({
    model: z.string().min(1).default(DEFAULT_RATING_MODEL_KEY),
    league_ids: z.string().min(1),
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(5),
    include_provisional: z.enum(['true', 'false']).default('false').transform((value: string) => value === 'true'),
});

export function leagueRatingsRoutes(db: Kysely<Database>): FastifyPluginAsync {
    return async function (fastify) {
        const app = fastify.withTypeProvider<ZodTypeProvider>();

        app.get(
            '/league',
            {
                schema: {
                    querystring: QuerySchema,
                    response: {
                        200: z.object({
                            data: z.array(RankedRatingSchema),
                            total: z.number().int(),
                            page: z.number().int(),
                            page_size: z.number().int(),
                            model: z.string(),
                            league_ids: z.array(z.string().uuid()),
                        }),
                        400: z.object({ error: z.string(), statusCode: z.number().int() }),
                    },
                },
            },
            async (request, reply) => {
                const leagueIds = request.query.league_ids
                    .split(',')
                    .map((id) => id.trim())
                    .filter((id) => id.length > 0);

                if (
                    leagueIds.length === 0
                    || leagueIds.some((id) => !z.string().uuid().safeParse(id).success)
                ) {
                    return reply.status(400).send({
                        error: 'league_ids must contain one or more valid UUIDs',
                        statusCode: 400,
                    });
                }

                const uniqueLeagueIds = [...new Set(leagueIds)];
                const leagueIdArray = uuidArray(uniqueLeagueIds);
                const {
                    model,
                    page,
                    page_size: pageSize,
                    include_provisional: includeProvisional,
                } = request.query;
                const offset = (page - 1) * pageSize;

                const result = await sql<RankedRatingRow>`
                    WITH ranked AS (
                        SELECT
                            ROW_NUMBER() OVER (
                                ORDER BY rating.conservative_rating DESC, rating.rated_matches DESC, player.name ASC
                            ) AS rank,
                            COUNT(*) OVER () AS total,
                            rating.player_id,
                            player.name AS player_name,
                            rating.rating,
                            rating.rating_deviation,
                            rating.conservative_rating,
                            rating.rated_matches,
                            rating.rated_wins,
                            rating.rated_losses,
                            rating.provisional,
                            rating.first_rated_at,
                            rating.last_rated_at
                        FROM player_ratings rating
                        JOIN rating_models model_row ON model_row.id = rating.model_id
                        JOIN external_players player ON player.id = rating.player_id
                        WHERE model_row.key = ${model}
                          AND player.deleted_at IS NULL
                          AND (${includeProvisional} OR rating.provisional = false)
                          AND EXISTS (
                              SELECT 1
                              FROM player_active_leagues membership
                              WHERE membership.player_id = rating.player_id
                                AND membership.league_id = ANY(${leagueIdArray})
                          )
                    )
                    SELECT *
                    FROM ranked
                    ORDER BY rank
                    LIMIT ${pageSize}
                    OFFSET ${offset}
                `.execute(db);

                return reply.send({
                    data: result.rows.map(presentRankedRating),
                    total: Number(result.rows[0]?.total ?? 0),
                    page,
                    page_size: pageSize,
                    model,
                    league_ids: uniqueLeagueIds,
                });
            },
        );
    };
}

function uuidArray(ids: string[]): RawBuilder<string[]> {
    return sql`ARRAY[${sql.join(ids.map((id) => sql`${id}::uuid`))}]::uuid[]`;
}
