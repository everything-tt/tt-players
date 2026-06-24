import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import { sql } from 'kysely';

const ParamsSchema = z.object({
    id: z.string().uuid(),
});

const QuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
});

const RosterItemSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    played: z.number().int(),
    winRate: z.number().int(),
    wins: z.number().int(),
});

const DataAvailabilitySchema = z.enum(['available', 'no_matches_yet', 'source_data_missing']);

const RosterResponseSchema = z.object({
    availability: DataAvailabilitySchema,
    data: z.array(RosterItemSchema),
});

const FormResponseSchema = z.object({
    form: z.array(z.string()),
    position: z.number().int().nullable(),
    points: z.number().int().nullable(),
});

const TeamSummaryResponseSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    league_id: z.string().uuid().nullable(),
    league_name: z.string().nullable(),
    season_id: z.string().uuid().nullable(),
    season_name: z.string().nullable(),
    competition_id: z.string().uuid().nullable(),
    competition_name: z.string().nullable(),
});

const FixtureItemSchema = z.object({
    id: z.string().uuid(),
    competition_id: z.string().uuid(),
    external_id: z.string(),
    home_team_id: z.string().uuid().nullable(),
    away_team_id: z.string().uuid().nullable(),
    home_team_name: z.string().nullable(),
    away_team_name: z.string().nullable(),
    home_score: z.number().int().nullable(),
    away_score: z.number().int().nullable(),
    date_played: z.string(),   // ISO string from serialisation
    status: z.enum(['upcoming', 'completed', 'postponed']),
    round_name: z.string().nullable(),
    round_order: z.number().int().nullable(),
});

const ResponseSchema = z.object({
    availability: DataAvailabilitySchema,
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
    data: z.array(FixtureItemSchema),
});

const ErrorSchema = z.object({
    error: z.string(),
    statusCode: z.number(),
});

export function teamsRoutes(db: Kysely<Database>): FastifyPluginAsync {
    return async function (fastify) {
        const app = fastify.withTypeProvider<ZodTypeProvider>();

        async function resolveTeamDataAvailability(teamId: string): Promise<'available' | 'no_matches_yet' | 'source_data_missing'> {
            const latestStanding = await db
                .selectFrom('league_standings')
                .select(['played'])
                .where('team_id', '=', teamId)
                .where('deleted_at', 'is', null)
                .orderBy('updated_at', 'desc')
                .limit(1)
                .executeTakeFirst();

            if ((latestStanding?.played ?? 0) > 0) {
                return 'source_data_missing';
            }
            return 'no_matches_yet';
        }

        app.get(
            '/:id/summary',
            {
                schema: {
                    params: ParamsSchema,
                    response: {
                        200: TeamSummaryResponseSchema,
                        404: ErrorSchema,
                        500: ErrorSchema,
                    },
                },
            },
            async (request, reply) => {
                const { id } = request.params;

                const row = await db
                    .selectFrom('teams as t')
                    .leftJoin('competitions as c', 'c.id', 't.competition_id')
                    .leftJoin('seasons as s', 's.id', 'c.season_id')
                    .leftJoin('leagues as l', 'l.id', 's.league_id')
                    .select([
                        't.id',
                        't.name',
                        sql<string | null>`l.id`.as('league_id'),
                        sql<string | null>`l.name`.as('league_name'),
                        sql<string | null>`s.id`.as('season_id'),
                        sql<string | null>`s.name`.as('season_name'),
                        sql<string | null>`c.id`.as('competition_id'),
                        sql<string | null>`c.name`.as('competition_name'),
                    ])
                    .where('t.id', '=', id)
                    .where('t.deleted_at', 'is', null)
                    .executeTakeFirst();

                if (!row) {
                    return reply.status(404).send({
                        error: `Team ${id} not found`,
                        statusCode: 404,
                    });
                }

                return reply.send(row);
            }
        );

        app.get(
            '/:id/fixtures',
            {
                schema: {
                    params: ParamsSchema,
                    querystring: QuerySchema,
                    response: {
                        200: ResponseSchema,
                        404: ErrorSchema,
                        500: ErrorSchema,
                    },
                },
            },
            async (request, reply) => {
                const { id } = request.params;
                const { limit, offset } = request.query;

                // Verify team exists
                const team = await db
                    .selectFrom('teams')
                    .select('id')
                    .where('id', '=', id)
                    .where('deleted_at', 'is', null)
                    .executeTakeFirst();

                if (!team) {
                    return reply.status(404).send({
                        error: `Team ${id} not found`,
                        statusCode: 404,
                    });
                }

                // Count total
                const { count } = await db
                    .selectFrom('fixtures')
                    .select((eb) => eb.fn.countAll<number>().as('count'))
                    .where((eb) =>
                        eb.or([
                            eb('home_team_id', '=', id),
                            eb('away_team_id', '=', id),
                        ])
                    )
                    .where('deleted_at', 'is', null)
                    .executeTakeFirstOrThrow();

                const rows = await db
                    .with('paged_fixtures', (qb) =>
                        qb
                            .selectFrom('fixtures as f')
                            .select([
                                'f.id',
                                'f.competition_id',
                                'f.external_id',
                                'f.home_team_id',
                                'f.away_team_id',
                                'f.date_played',
                                'f.status',
                                'f.round_name',
                                'f.round_order',
                            ])
                            .where((eb) =>
                                eb.or([
                                    eb('f.home_team_id', '=', id),
                                    eb('f.away_team_id', '=', id),
                                ])
                            )
                            .where('f.deleted_at', 'is', null)
                            .orderBy('f.date_played', 'desc')
                            .orderBy('f.id', 'desc')
                            .limit(limit)
                            .offset(offset)
                    )
                    .with('score_by_fixture', (qb) =>
                        qb
                            .selectFrom('rubbers as r')
                            .innerJoin('paged_fixtures as pf', 'pf.id', 'r.fixture_id')
                            .select([
                                'r.fixture_id',
                                sql<number>`
                                    (
                                        SUM(
                                            CASE
                                                WHEN r.home_games_won > r.away_games_won THEN 1
                                                ELSE 0
                                            END
                                        )
                                    )::int
                                `.as('home_score'),
                                sql<number>`
                                    (
                                        SUM(
                                            CASE
                                                WHEN r.away_games_won > r.home_games_won THEN 1
                                                ELSE 0
                                            END
                                        )
                                    )::int
                                `.as('away_score'),
                            ])
                            .where('r.deleted_at', 'is', null)
                            .groupBy('r.fixture_id')
                    )
                    .selectFrom('paged_fixtures as pf')
                    .leftJoin('teams as home', 'home.id', 'pf.home_team_id')
                    .leftJoin('teams as away', 'away.id', 'pf.away_team_id')
                    .leftJoin('score_by_fixture as sbf', 'sbf.fixture_id', 'pf.id')
                    .select([
                        'pf.id',
                        'pf.competition_id',
                        'pf.external_id',
                        'pf.home_team_id',
                        'pf.away_team_id',
                        'pf.date_played',
                        'pf.status',
                        'pf.round_name',
                        'pf.round_order',
                        sql<string | null>`home.name`.as('home_team_name'),
                        sql<string | null>`away.name`.as('away_team_name'),
                        sql<number | null>`sbf.home_score`.as('home_score'),
                        sql<number | null>`sbf.away_score`.as('away_score'),
                    ])
                    .orderBy('pf.date_played', 'desc')
                    .orderBy('pf.id', 'desc')
                    .execute();

                // Serialise dates to ISO strings
                const data = rows.map((r) => ({
                    ...r,
                    date_played:
                        r.date_played instanceof Date
                            ? r.date_played.toISOString()
                            : String(r.date_played),
                }));

                return reply.send({
                    availability: Number(count) > 0
                        ? 'available'
                        : await resolveTeamDataAvailability(id),
                    total: Number(count),
                    limit,
                    offset,
                    data,
                });
            },
        );

        app.get(
            '/:id/roster',
            {
                schema: {
                    params: ParamsSchema,
                    response: {
                        200: RosterResponseSchema,
                        404: ErrorSchema,
                        500: ErrorSchema,
                    },
                },
            },
            async (request, reply) => {
                const { id } = request.params;

                // Split into 4 focused subqueries that can each use a single index,
                // then UNION ALL and aggregate by player.
                const roster = await sql<any>`
                    WITH home_p1 AS (
                        SELECT r.id AS rubber_id, r.home_player_1_id AS player_id,
                               CASE WHEN r.home_games_won > r.away_games_won THEN 1 ELSE 0 END AS is_win
                        FROM rubbers r
                        JOIN fixtures f ON f.id = r.fixture_id
                        WHERE f.home_team_id = ${id}
                          AND r.home_player_1_id IS NOT NULL
                          AND r.deleted_at IS NULL
                          AND r.outcome_type != 'walkover'
                    ),
                    home_p2 AS (
                        SELECT r.id AS rubber_id, r.home_player_2_id AS player_id,
                               CASE WHEN r.home_games_won > r.away_games_won THEN 1 ELSE 0 END AS is_win
                        FROM rubbers r
                        JOIN fixtures f ON f.id = r.fixture_id
                        WHERE f.home_team_id = ${id}
                          AND r.home_player_2_id IS NOT NULL
                          AND r.deleted_at IS NULL
                          AND r.outcome_type != 'walkover'
                    ),
                    away_p1 AS (
                        SELECT r.id AS rubber_id, r.away_player_1_id AS player_id,
                               CASE WHEN r.away_games_won > r.home_games_won THEN 1 ELSE 0 END AS is_win
                        FROM rubbers r
                        JOIN fixtures f ON f.id = r.fixture_id
                        WHERE f.away_team_id = ${id}
                          AND r.away_player_1_id IS NOT NULL
                          AND r.deleted_at IS NULL
                          AND r.outcome_type != 'walkover'
                    ),
                    away_p2 AS (
                        SELECT r.id AS rubber_id, r.away_player_2_id AS player_id,
                               CASE WHEN r.away_games_won > r.home_games_won THEN 1 ELSE 0 END AS is_win
                        FROM rubbers r
                        JOIN fixtures f ON f.id = r.fixture_id
                        WHERE f.away_team_id = ${id}
                          AND r.away_player_2_id IS NOT NULL
                          AND r.deleted_at IS NULL
                          AND r.outcome_type != 'walkover'
                    ),
                    all_players AS (
                        SELECT * FROM home_p1
                        UNION ALL SELECT * FROM home_p2
                        UNION ALL SELECT * FROM away_p1
                        UNION ALL SELECT * FROM away_p2
                    )
                    SELECT
                        ep.id, ep.name,
                        COUNT(DISTINCT ap.rubber_id) AS played,
                        SUM(ap.is_win)::int AS wins
                    FROM all_players ap
                    JOIN external_players ep ON ep.id = ap.player_id
                    GROUP BY ep.id, ep.name
                    ORDER BY wins DESC, played DESC
                `.execute(db);

                const data = roster.rows.map((row: any) => {
                    const played = Number(row.played);
                    const wins = Number(row.wins);
                    return {
                        id: row.id,
                        name: row.name,
                        played,
                        wins,
                        winRate: played > 0 ? Math.round((wins / played) * 100) : 0,
                    };
                });

                return reply.send({
                    availability: data.length > 0
                        ? 'available'
                        : await resolveTeamDataAvailability(id),
                    data,
                });
            }
        );

        app.get(
            '/:id/form',
            {
                schema: {
                    params: ParamsSchema,
                    response: {
                        200: FormResponseSchema,
                        404: ErrorSchema,
                        500: ErrorSchema,
                    },
                },
            },
            async (request, reply) => {
                const { id } = request.params;

                const [standing, recentsRes] = await Promise.all([
                    db.selectFrom('league_standings')
                        .select(['position', 'points'])
                        .where('team_id', '=', id)
                        .orderBy('created_at', 'desc')
                        .limit(1)
                        .executeTakeFirst(),
                    sql<any>`
                        SELECT f.home_team_id, f.away_team_id,
                            SUM(CASE WHEN r.home_games_won > r.away_games_won THEN 1 ELSE 0 END) as home_score,
                            SUM(CASE WHEN r.away_games_won > r.home_games_won THEN 1 ELSE 0 END) as away_score
                        FROM fixtures f
                        JOIN rubbers r ON r.fixture_id = f.id
                        WHERE (f.home_team_id = ${id} OR f.away_team_id = ${id})
                          AND f.status = 'completed'
                          AND r.deleted_at IS NULL
                        GROUP BY f.id, f.date_played, f.home_team_id, f.away_team_id
                        ORDER BY f.date_played DESC
                    `.execute(db),
                ]);

                const recents = recentsRes;

                const form = recents.rows.map((r: any) => {
                    const isHome = r.home_team_id === id;
                    const hs = Number(r.home_score);
                    const as = Number(r.away_score);

                    let teamScore = isHome ? hs : as;
                    let oppScore = isHome ? as : hs;

                    if (teamScore > oppScore) return 'W';
                    if (teamScore < oppScore) return 'L';
                    return 'D';
                });

                return reply.send({
                    form: form.reverse(), // chronologically oldest to newest for display
                    position: standing ? standing.position : null,
                    points: standing ? standing.points : null,
                });
            }
        );
    };
}
