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
    home_player_external_id: z.string(),
    away_player_name: z.string(),
    away_player_external_id: z.string(),
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

        // List all events
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
            async (request, reply) => {
                const { q, limit, offset } = request.query;
                try {
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
                        .leftJoin('source_events as se', 'se.canonical_competition_id', 'c.id')
                        .select([
                            'c.id',
                            'p.id as platform_id',
                            sql<string>`coalesce(se.source, 'canonical')`.as('source'),
                            'c.external_id',
                            sql<string>`coalesce(c.display_name, c.name)`.as('name'),
                            sql<string | null>`c.event_date::text`.as('event_date'),
                            'c.category',
                            'se.public_url',
                            'p.name as platform_name',
                            (qb) => qb
                                .selectFrom('source_event_result_rows as serr')
                                .innerJoin('source_events as result_se', 'result_se.id', 'serr.source_event_id')
                                .select(qb.fn.countAll().as('count'))
                                .whereRef('result_se.canonical_competition_id', '=', 'c.id')
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

                    const formattedEvents = events.map(e => ({
                        ...e,
                        event_date: e.event_date ?? null,
                        match_count: Number(e.match_count ?? 0),
                    }));

                    return {
                        data: formattedEvents,
                        total,
                        limit,
                        offset,
                    };
                } catch (error: any) {
                    return reply.status(500).send({
                        error: error.message ?? 'Failed to fetch events',
                        statusCode: 500,
                    });
                }
            }
        );

        // Get details of a single event
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
                try {
                    const event = await db
                        .selectFrom('competitions as c')
                        .innerJoin('seasons as s', 's.id', 'c.season_id')
                        .innerJoin('leagues as l', 'l.id', 's.league_id')
                        .innerJoin('platforms as p', 'p.id', 'l.platform_id')
                        .leftJoin('source_events as se', 'se.canonical_competition_id', 'c.id')
                        .select([
                            'c.id',
                            'p.id as platform_id',
                            sql<string>`coalesce(se.source, 'canonical')`.as('source'),
                            'c.external_id',
                            sql<string>`coalesce(c.display_name, c.name)`.as('name'),
                            sql<string | null>`c.event_date::text`.as('event_date'),
                            'c.category',
                            'se.public_url',
                            'p.name as platform_name',
                            (qb) => qb
                                .selectFrom('source_event_result_rows as serr')
                                .innerJoin('source_events as result_se', 'result_se.id', 'serr.source_event_id')
                                .select(qb.fn.countAll().as('count'))
                                .whereRef('result_se.canonical_competition_id', '=', 'c.id')
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
                        .selectFrom('source_event_result_rows as serr')
                        .innerJoin('source_events as se', 'se.id', 'serr.source_event_id')
                        .leftJoin('external_players as hp', (join) =>
                            join
                                .onRef('hp.platform_id', '=', 'se.platform_id')
                                .onRef('hp.external_id', '=', 'serr.home_player_external_id')
                                .on('hp.deleted_at', 'is', null)
                        )
                        .leftJoin('external_players as ap', (join) =>
                            join
                                .onRef('ap.platform_id', '=', 'se.platform_id')
                                .onRef('ap.external_id', '=', 'serr.away_player_external_id')
                                .on('ap.deleted_at', 'is', null)
                        )
                        .select([
                            'serr.id',
                            'serr.played_at',
                            'serr.round_name',
                            'serr.round_order',
                            'serr.home_player_name',
                            'serr.home_player_external_id',
                            'serr.away_player_name',
                            'serr.away_player_external_id',
                            'serr.winner_side',
                            'serr.canonical_rubber_id',
                            'hp.id as home_player_resolved_id',
                            'ap.id as away_player_resolved_id',
                        ])
                        .where('se.canonical_competition_id', '=', id)
                        .orderBy('serr.round_order', 'asc')
                        .orderBy('serr.played_at', 'asc')
                        .execute();

                    // Format dates
                    const formattedResults = results.map(r => ({
                        ...r,
                        played_at: r.played_at ? (r.played_at instanceof Date ? r.played_at.toISOString() : String(r.played_at)) : null,
                    }));

                    return {
                        event: {
                            ...event,
                            event_date: event.event_date ?? null,
                            match_count: Number(event.match_count ?? 0),
                        },
                        results: formattedResults,
                    };
                } catch (error: any) {
                    return reply.status(500).send({
                        error: error.message ?? 'Failed to fetch event details',
                        statusCode: 500,
                    });
                }
            }
        );
    };
}
