import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql, type Kysely, type RawBuilder } from 'kysely';
import type { Database } from '@tt-players/db';

const DEFAULT_MODEL_KEY = 'global-singles-glicko2-v1';

type RatingConfidence = 'high' | 'medium' | 'low';

const QuerySchema = z.object({
    model: z.string().min(1).default(DEFAULT_MODEL_KEY),
    league_ids: z.string().min(1),
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(5),
    include_provisional: z.enum(['true', 'false']).default('false').transform((value: string) => value === 'true'),
});

const RatingSchema = z.object({
    rank: z.number().int(),
    player_id: z.string().uuid(),
    player_name: z.string(),
    rating: z.number(),
    rating_deviation: z.number(),
    conservative_rating: z.number(),
    rating_low: z.number(),
    rating_high: z.number(),
    confidence: z.enum(['high', 'medium', 'low']),
    rated_matches: z.number().int(),
    rated_wins: z.number().int(),
    rated_losses: z.number().int(),
    win_rate: z.number(),
    provisional: z.boolean(),
    first_rated_at: z.string().nullable(),
    last_rated_at: z.string().nullable(),
});

interface RatingRow {
    rank: number | string;
    total: number | string;
    player_id: string;
    player_name: string;
    rating: number | string;
    rating_deviation: number | string;
    conservative_rating: number | string;
    rated_matches: number | string;
    rated_wins: number | string;
    rated_losses: number | string;
    provisional: boolean;
    first_rated_at: string | Date | null;
    last_rated_at: string | Date | null;
}

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
                            data: z.array(RatingSchema),
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

                if (leagueIds.length === 0 || leagueIds.some((id) => !z.string().uuid().safeParse(id).success)) {
                    return reply.status(400).send({
                        error: 'league_ids must contain one or more valid UUIDs',
                        statusCode: 400,
                    });
                }

                const leagueIdArray = uuidArray([...new Set(leagueIds)]);
                const {
                    model,
                    page,
                    page_size: pageSize,
                    include_provisional: includeProvisional,
                } = request.query;
                const offset = (page - 1) * pageSize;

                const result = await sql<RatingRow>`
                    WITH eligible_players AS (
                        SELECT COALESCE(player.canonical_player_id, player.id) AS player_id
                        FROM rubbers rubber
                        JOIN external_players player ON player.id = rubber.home_player_1_id
                        JOIN fixtures fixture ON fixture.id = rubber.fixture_id
                        JOIN competitions competition ON competition.id = fixture.competition_id
                        JOIN seasons season ON season.id = competition.season_id
                        WHERE rubber.deleted_at IS NULL
                          AND rubber.is_doubles = false
                          AND player.deleted_at IS NULL
                          AND season.is_active = true
                          AND season.league_id = ANY(${leagueIdArray})

                        UNION

                        SELECT COALESCE(player.canonical_player_id, player.id) AS player_id
                        FROM rubbers rubber
                        JOIN external_players player ON player.id = rubber.away_player_1_id
                        JOIN fixtures fixture ON fixture.id = rubber.fixture_id
                        JOIN competitions competition ON competition.id = fixture.competition_id
                        JOIN seasons season ON season.id = competition.season_id
                        WHERE rubber.deleted_at IS NULL
                          AND rubber.is_doubles = false
                          AND player.deleted_at IS NULL
                          AND season.is_active = true
                          AND season.league_id = ANY(${leagueIdArray})
                    ),
                    ranked AS (
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
                        JOIN eligible_players eligible ON eligible.player_id = rating.player_id
                        WHERE model_row.key = ${model}
                          AND player.deleted_at IS NULL
                          AND (${includeProvisional} OR rating.provisional = false)
                    )
                    SELECT *
                    FROM ranked
                    ORDER BY rank
                    LIMIT ${pageSize}
                    OFFSET ${offset}
                `.execute(db);

                return reply.send({
                    data: result.rows.map(presentRating),
                    total: Number(result.rows[0]?.total ?? 0),
                    page,
                    page_size: pageSize,
                    model,
                    league_ids: [...new Set(leagueIds)],
                });
            },
        );
    };
}

function uuidArray(ids: string[]): RawBuilder<string[]> {
    return sql`ARRAY[${sql.join(ids.map((id) => sql`${id}::uuid`))}]::uuid[]`;
}

function presentRating(row: RatingRow) {
    const rating = Number(row.rating);
    const deviation = Number(row.rating_deviation);
    const ratedMatches = Number(row.rated_matches);
    const ratedWins = Number(row.rated_wins);

    return {
        rank: Number(row.rank),
        player_id: row.player_id,
        player_name: row.player_name,
        rating,
        rating_deviation: deviation,
        conservative_rating: Number(row.conservative_rating),
        rating_low: round(rating - 2 * deviation, 2),
        rating_high: round(rating + 2 * deviation, 2),
        confidence: ratingConfidence(deviation),
        rated_matches: ratedMatches,
        rated_wins: ratedWins,
        rated_losses: Number(row.rated_losses),
        win_rate: ratedMatches > 0 ? ratedWins / ratedMatches : 0,
        provisional: row.provisional,
        first_rated_at: toDateString(row.first_rated_at),
        last_rated_at: toDateString(row.last_rated_at),
    };
}

function ratingConfidence(deviation: number): RatingConfidence {
    if (deviation <= 70) return 'high';
    if (deviation <= 120) return 'medium';
    return 'low';
}

function round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

function toDateString(value: string | Date | null): string | null {
    if (!value) return null;
    return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}
