import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import { sql } from 'kysely';
import { resolveFixtureSourceUrl } from './source-url.js';

const ParamsSchema = z.object({
    id: z.string().uuid(),
});

const QuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(500).default(500),
    offset: z.coerce.number().int().min(0).default(0),
});

const RubberItemSchema = z.object({
    id: z.string().uuid(),
    fixture_id: z.string().uuid(),
    is_doubles: z.boolean(),
    home_player_1_id: z.string().uuid().nullable(),
    home_player_2_id: z.string().uuid().nullable(),
    away_player_1_id: z.string().uuid().nullable(),
    away_player_2_id: z.string().uuid().nullable(),
    home_player_1_name: z.string().nullable(),
    home_player_2_name: z.string().nullable(),
    away_player_1_name: z.string().nullable(),
    away_player_2_name: z.string().nullable(),
    home_games_won: z.number().int(),
    away_games_won: z.number().int(),
});

const FixtureMetaSchema = z.object({
    id: z.string().uuid(),
    played_at: z.string().nullable(),
    league_name: z.string(),
    division_name: z.string(),
    home_team_id: z.string().uuid().nullable(),
    home_team_name: z.string().nullable(),
    away_team_id: z.string().uuid().nullable(),
    away_team_name: z.string().nullable(),
    source_url: z.string().nullable(),
});

const ErrorSchema = z.object({
    error: z.string(),
    statusCode: z.number(),
});

export function fixturesRoutes(db: Kysely<Database>): FastifyPluginAsync {
    return async function (fastify) {
        const app = fastify.withTypeProvider<ZodTypeProvider>();

        app.get(
            '/:id/rubbers',
            {
                schema: {
                    params: ParamsSchema,
                    querystring: QuerySchema,
                    response: {
                        200: z.object({
                            fixture: FixtureMetaSchema,
                            total: z.number().int(),
                            limit: z.number().int(),
                            offset: z.number().int(),
                            data: z.array(RubberItemSchema),
                        }),
                        404: ErrorSchema,
                        500: ErrorSchema,
                    },
                },
            },
            async (request, reply) => {
                const { id } = request.params;
                const { limit, offset } = request.query;

                const fixture = await db
                    .selectFrom('fixtures as f')
                    .innerJoin('competitions as c', 'c.id', 'f.competition_id')
                    .innerJoin('seasons as s', 's.id', 'c.season_id')
                    .innerJoin('leagues as l', 'l.id', 's.league_id')
                    .innerJoin('platforms as p', 'p.id', 'l.platform_id')
                    .leftJoin('teams as ht', 'ht.id', 'f.home_team_id')
                    .leftJoin('teams as at', 'at.id', 'f.away_team_id')
                    .select([
                        'f.id',
                        'f.external_id as fixture_external_id',
                        'f.updated_at',
                        'f.date_played',
                        'c.external_id as competition_external_id',
                        's.external_id as season_external_id',
                        'l.external_id as league_external_id',
                        'p.base_url as platform_base_url',
                        'l.name as league_name',
                        'c.name as division_name',
                        'f.home_team_id',
                        'ht.name as home_team_name',
                        'f.away_team_id',
                        'at.name as away_team_name',
                    ])
                    .where('f.id', '=', id)
                    .where('f.deleted_at', 'is', null)
                    .executeTakeFirst();

                if (!fixture) {
                    return reply.status(404).send({
                        error: `Fixture ${id} not found`,
                        statusCode: 404,
                    });
                }

                const [countRow, rubbers] = await Promise.all([
                    db
                        .selectFrom('rubbers')
                        .select((eb) => eb.fn.countAll<number>().as('count'))
                        .where('fixture_id', '=', id)
                        .where('deleted_at', 'is', null)
                        .executeTakeFirstOrThrow(),
                    db
                    .selectFrom('rubbers')
                    .leftJoin('external_players as hp1', 'hp1.id', 'rubbers.home_player_1_id')
                    .leftJoin('external_players as hp2', 'hp2.id', 'rubbers.home_player_2_id')
                    .leftJoin('external_players as ap1', 'ap1.id', 'rubbers.away_player_1_id')
                    .leftJoin('external_players as ap2', 'ap2.id', 'rubbers.away_player_2_id')
                    .leftJoin('external_players as hcp1', (join) =>
                        join.onRef('hcp1.id', '=', sql<string>`coalesce(hp1.canonical_player_id, hp1.id)`)
                    )
                    .leftJoin('external_players as hcp2', (join) =>
                        join.onRef('hcp2.id', '=', sql<string>`coalesce(hp2.canonical_player_id, hp2.id)`)
                    )
                    .leftJoin('external_players as acp1', (join) =>
                        join.onRef('acp1.id', '=', sql<string>`coalesce(ap1.canonical_player_id, ap1.id)`)
                    )
                    .leftJoin('external_players as acp2', (join) =>
                        join.onRef('acp2.id', '=', sql<string>`coalesce(ap2.canonical_player_id, ap2.id)`)
                    )
                    .select([
                        'rubbers.id',
                        'rubbers.fixture_id',
                        'rubbers.is_doubles',
                        sql<string | null>`COALESCE(hp1.canonical_player_id, hp1.id)`.as('home_player_1_id'),
                        sql<string | null>`COALESCE(hp2.canonical_player_id, hp2.id)`.as('home_player_2_id'),
                        sql<string | null>`COALESCE(ap1.canonical_player_id, ap1.id)`.as('away_player_1_id'),
                        sql<string | null>`COALESCE(ap2.canonical_player_id, ap2.id)`.as('away_player_2_id'),
                        'rubbers.home_games_won',
                        'rubbers.away_games_won',
                        sql<string | null>`COALESCE(hcp1.name, hp1.name)`.as('home_player_1_name'),
                        sql<string | null>`COALESCE(hcp2.name, hp2.name)`.as('home_player_2_name'),
                        sql<string | null>`COALESCE(acp1.name, ap1.name)`.as('away_player_1_name'),
                        sql<string | null>`COALESCE(acp2.name, ap2.name)`.as('away_player_2_name'),
                    ])
                    .where('rubbers.fixture_id', '=', id)
                    .where('rubbers.deleted_at', 'is', null)
                    .orderBy('rubbers.created_at', 'asc')
                    .orderBy('rubbers.external_id', 'asc')
                    .limit(limit)
                    .offset(offset)
                    .execute(),
                ]);

                const sourceUrl = await resolveFixtureSourceUrl(
                    db,
                    fixture.fixture_external_id,
                    {
                        competitionExternalId: fixture.competition_external_id,
                        seasonExternalId: fixture.season_external_id,
                        leagueExternalId: fixture.league_external_id,
                        platformBaseUrl: fixture.platform_base_url,
                    },
                    fixture.updated_at ?? null,
                );

                return reply.send({
                    fixture: {
                        id: fixture.id,
                        played_at:
                            fixture.date_played instanceof Date
                                ? fixture.date_played.toISOString()
                                : fixture.date_played
                                    ? String(fixture.date_played)
                                    : null,
                        league_name: fixture.league_name,
                        division_name: fixture.division_name,
                        home_team_id: fixture.home_team_id,
                        home_team_name: fixture.home_team_name,
                        away_team_id: fixture.away_team_id,
                        away_team_name: fixture.away_team_name,
                        source_url: sourceUrl,
                    },
                    total: Number(countRow.count),
                    limit,
                    offset,
                    data: rubbers as any,
                });
            }
        );
    };
}
