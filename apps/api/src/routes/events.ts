import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql, type Kysely } from 'kysely';
import type { Database } from '@tt-players/db';

const ParamsSchema = z.object({
    id: z.string().uuid(),
});

const EventItemSchema = z.object({
    id: z.string().uuid(),
    platform_id: z.string().uuid(),
    source: z.string(),
    external_id: z.string(),
    name: z.string(),
    event_date: z.string().nullable(),
    category: z.string().nullable(),
    public_url: z.string().nullable(),
    platform_name: z.string(),
    match_count: z.coerce.number().int(),
});

const ListResponseSchema = z.object({
    data: z.array(EventItemSchema),
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
});

const EventResultRowSchema = z.object({
    id: z.string().uuid(),
    played_at: z.string().nullable(),
    round_name: z.string().nullable(),
    round_order: z.number().int().nullable(),
    home_player_name: z.string(),
    home_player_external_id: z.string().nullable(),
    away_player_name: z.string(),
    away_player_external_id: z.string().nullable(),
    winner_side: z.string(),
    canonical_rubber_id: z.string().uuid().nullable(),
    home_player_resolved_id: z.string().uuid().nullable(),
    away_player_resolved_id: z.string().uuid().nullable(),
});

const GetResponseSchema = z.object({
    event: EventItemSchema,
    results: z.array(EventResultRowSchema),
});

const ErrorSchema = z.object({
    error: z.string(),
    statusCode: z.number(),
});

const QuerySchema = z.object({
    q: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
});

export function eventsRoutes(db: Kysely<Database>): FastifyPluginAsync {
    return async function (fastify) {
        const app = fastify.withTypeProvider<ZodTypeProvider>();

        app.get(
            '/',
            {
                schema: {
                    querystring: QuerySchema,
                    response: {
                        200: ListResponseSchema,
                        500: ErrorSchema,
                    },
                },
            },
            async (request) => {
                const { q, limit, offset } = request.query;
                let countBuilder = db
                    .selectFrom('competitions as c')
                    .select(db.fn.countAll().as('count'))
                    .where('c.type', '=', 'individual')
                    .where('c.deleted_at', 'is', null);

                if (q) {
                    countBuilder = countBuilder.where(
                        sql`coalesce(c.display_name, c.name)`,
                        'ilike',
                        `%${q}%`,
                    );
                }

                const countRes = await countBuilder.executeTakeFirst();
                const total = Number(countRes?.count ?? 0);

                let queryBuilder = db
                    .selectFrom('competitions as c')
                    .innerJoin('seasons as s', 's.id', 'c.season_id')
                    .innerJoin('leagues as l', 'l.id', 's.league_id')
                    .innerJoin('platforms as p', 'p.id', 'l.platform_id')
                    .select([
                        'c.id',
                        'p.id as platform_id',
                        sql<string>`coalesce(c.source, 'canonical')`.as('source'),
                        'c.external_id',
                        sql<string>`coalesce(c.display_name, c.name)`.as('name'),
                        sql<string | null>`c.event_date::text`.as('event_date'),
                        'c.category',
                        'c.source_url as public_url',
                        'p.name as platform_name',
                        (qb) => qb
                            .selectFrom('rubbers as r')
                            .innerJoin('fixtures as f', 'f.id', 'r.fixture_id')
                            .select(qb.fn.countAll().as('count'))
                            .whereRef('f.competition_id', '=', 'c.id')
                            .where('r.deleted_at', 'is', null)
                            .where('r.is_doubles', '=', false)
                            .as('match_count'),
                    ]);

                if (q) {
                    queryBuilder = queryBuilder.where(
                        sql`coalesce(c.display_name, c.name)`,
                        'ilike',
                        `%${q}%`,
                    );
                }

                const events = await queryBuilder
                    .where('c.type', '=', 'individual')
                    .where('c.deleted_at', 'is', null)
                    .orderBy('c.event_date', 'desc')
                    .orderBy(sql`coalesce(c.display_name, c.name)`, 'asc')
                    .limit(limit)
                    .offset(offset)
                    .execute();

                return {
                    data: events.map((event) => ({
                        ...event,
                        event_date: event.event_date ?? null,
                        match_count: Number(event.match_count ?? 0),
                    })),
                    total,
                    limit,
                    offset,
                };
            },
        );

        app.get(
            '/:id',
            {
                schema: {
                    params: ParamsSchema,
                    response: {
                        200: GetResponseSchema,
                        404: ErrorSchema,
                        500: ErrorSchema,
                    },
                },
            },
            async (request, reply) => {
                const { id } = request.params;
                const event = await db
                    .selectFrom('competitions as c')
                    .innerJoin('seasons as s', 's.id', 'c.season_id')
                    .innerJoin('leagues as l', 'l.id', 's.league_id')
                    .innerJoin('platforms as p', 'p.id', 'l.platform_id')
                    .select([
                        'c.id',
                        'p.id as platform_id',
                        sql<string>`coalesce(c.source, 'canonical')`.as('source'),
                        'c.external_id',
                        sql<string>`coalesce(c.display_name, c.name)`.as('name'),
                        sql<string | null>`c.event_date::text`.as('event_date'),
                        'c.category',
                        'c.source_url as public_url',
                        'p.name as platform_name',
                        (qb) => qb
                            .selectFrom('rubbers as r')
                            .innerJoin('fixtures as f', 'f.id', 'r.fixture_id')
                            .select(qb.fn.countAll().as('count'))
                            .whereRef('f.competition_id', '=', 'c.id')
                            .where('r.deleted_at', 'is', null)
                            .where('r.is_doubles', '=', false)
                            .as('match_count'),
                    ])
                    .where('c.id', '=', id)
                    .where('c.type', '=', 'individual')
                    .where('c.deleted_at', 'is', null)
                    .executeTakeFirst();

                if (!event) {
                    return reply.status(404).send({
                        error: `Event ${id} not found`,
                        statusCode: 404,
                    });
                }

                const results = await db
                    .selectFrom('rubbers as r')
                    .innerJoin('fixtures as f', 'f.id', 'r.fixture_id')
                    .leftJoin('external_players as hp1', 'hp1.id', 'r.home_player_1_id')
                    .leftJoin('external_players as ap1', 'ap1.id', 'r.away_player_1_id')
                    .select([
                        'r.id',
                        'r.played_at',
                        'f.round_name',
                        'f.round_order',
                        sql<string>`COALESCE(hp1.name, 'Unknown')`.as('home_player_name'),
                        sql<string | null>`hp1.external_id`.as('home_player_external_id'),
                        sql<string>`COALESCE(ap1.name, 'Unknown')`.as('away_player_name'),
                        sql<string | null>`ap1.external_id`.as('away_player_external_id'),
                        sql<string>`CASE WHEN r.home_games_won > r.away_games_won THEN 'home' ELSE 'away' END`.as('winner_side'),
                        sql<string | null>`r.id`.as('canonical_rubber_id'),
                        sql<string | null>`COALESCE(hp1.canonical_player_id, hp1.id)`.as('home_player_resolved_id'),
                        sql<string | null>`COALESCE(ap1.canonical_player_id, ap1.id)`.as('away_player_resolved_id'),
                    ])
                    .where('f.competition_id', '=', id)
                    .where('r.deleted_at', 'is', null)
                    .where('r.is_doubles', '=', false)
                    .orderBy('f.round_order', 'asc')
                    .orderBy('r.played_at', 'asc')
                    .execute();

                return {
                    event: {
                        ...event,
                        event_date: event.event_date ?? null,
                        match_count: Number(event.match_count ?? 0),
                    },
                    results: results.map((result) => ({
                        ...result,
                        played_at: result.played_at
                            ? result.played_at instanceof Date
                                ? result.played_at.toISOString()
                                : String(result.played_at)
                            : null,
                    })),
                };
            },
        );
    };
}
