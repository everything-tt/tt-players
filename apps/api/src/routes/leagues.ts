import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql, type Kysely } from 'kysely';
import type { Database } from '@tt-players/db';

const DivisionSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
});

const RegionSchema = z.object({
    id: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
});

const LeagueSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    platform: z.string(),
    season_id: z.string().uuid(),
    season: z.string(),
    regions: z.array(RegionSchema),
    divisions: z.array(DivisionSchema),
});

const ResponseSchema = z.object({
    data: z.array(LeagueSchema),
});

const LeagueSnapshotSchema = z.object({
    divisions: z.array(z.object({
        divisionId: z.string().uuid(),
        divisionName: z.string(),
        teams: z.number().int(),
        players: z.number().int(),
        matches: z.number().int(),
    })),
    totals: z.object({
        divisions: z.number().int(),
        teams: z.number().int(),
        players: z.number().int(),
        matches: z.number().int(),
    }),
});

const ParamsSchema = z.object({
    id: z.string().uuid(),
});

const ErrorSchema = z.object({
    error: z.string(),
    statusCode: z.number(),
});

const OverviewQuerySchema = z.object({
    league_ids: z.string().optional(),
});

const LeagueOverviewItemSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    season_id: z.string().uuid(),
    season: z.string(),
    divisions: z.number().int(),
    teams: z.number().int(),
    matches_played: z.number().int(),
    upcoming_fixtures: z.number().int(),
    last_scraped_at: z.string().nullable(),
    status: z.enum(['no_data', 'in_progress']),
});

const LeagueDashboardSchema = z.object({
    league: z.object({
        id: z.string().uuid(),
        name: z.string(),
        season_id: z.string().uuid(),
        season: z.string(),
    }),
    recent_results: z.array(z.object({
        fixture_id: z.string().uuid(),
        competition_id: z.string().uuid(),
        competition_name: z.string(),
        date_played: z.string().nullable(),
        home_team_id: z.string().uuid().nullable(),
        home_team_name: z.string().nullable(),
        away_team_id: z.string().uuid().nullable(),
        away_team_name: z.string().nullable(),
        home_score: z.number().int(),
        away_score: z.number().int(),
    })),
    upcoming_fixtures: z.array(z.object({
        fixture_id: z.string().uuid(),
        competition_id: z.string().uuid(),
        competition_name: z.string(),
        date_played: z.string().nullable(),
        home_team_id: z.string().uuid().nullable(),
        home_team_name: z.string().nullable(),
        away_team_id: z.string().uuid().nullable(),
        away_team_name: z.string().nullable(),
    })),
    title_races: z.array(z.object({
        competition_id: z.string().uuid(),
        competition_name: z.string(),
        leader_name: z.string(),
        leader_points: z.number().int(),
        points_gap: z.number().int().nullable(),
    })),
    history: z.array(z.object({
        season_id: z.string().uuid(),
        season: z.string(),
        is_active: z.boolean(),
        divisions: z.number().int(),
        teams: z.number().int(),
        fixtures: z.number().int(),
        champions: z.array(z.object({
            division_name: z.string(),
            team_name: z.string(),
        })),
    })),
});

const CollectionDashboardSchema = z.object({
    totals: z.object({
        leagues: z.number().int(),
        divisions: z.number().int(),
        teams: z.number().int(),
        matches_played: z.number().int(),
        upcoming_fixtures: z.number().int(),
    }),
    recent_results: z.array(z.object({
        fixture_id: z.string().uuid(),
        league_id: z.string().uuid(),
        league_name: z.string(),
        competition_id: z.string().uuid(),
        division_name: z.string(),
        date_played: z.string().nullable(),
        home_team_name: z.string().nullable(),
        away_team_name: z.string().nullable(),
        home_score: z.number().int(),
        away_score: z.number().int(),
    })),
    upcoming_fixtures: z.array(z.object({
        fixture_id: z.string().uuid(),
        league_id: z.string().uuid(),
        league_name: z.string(),
        competition_id: z.string().uuid(),
        division_name: z.string(),
        date_played: z.string().nullable(),
        home_team_name: z.string().nullable(),
        away_team_name: z.string().nullable(),
    })),
    top_teams: z.array(z.object({
        team_id: z.string().uuid(),
        team_name: z.string(),
        league_id: z.string().uuid(),
        league_name: z.string(),
        competition_id: z.string().uuid(),
        division_name: z.string(),
        position: z.number().int(),
        played: z.number().int(),
        won: z.number().int(),
        drawn: z.number().int(),
        lost: z.number().int(),
        points: z.number().int(),
        win_rate: z.number(),
    })),
});

/**
 * GET /leagues — returns all leagues grouped with their divisions.
 * Used by the frontend to dynamically list leagues without needing
 * hardcoded competition IDs.
 */
export function leaguesRoutes(db: Kysely<Database>): FastifyPluginAsync {
    return async function (fastify) {
        const app = fastify.withTypeProvider<ZodTypeProvider>();

        app.get(
            '/',
            {
                schema: {
                    response: {
                        200: ResponseSchema,
                    },
                },
            },
            async (_request, reply) => {
                const rows = await db
                    .selectFrom('competitions as c')
                    .innerJoin('seasons as s', 's.id', 'c.season_id')
                    .innerJoin('leagues as l', 'l.id', 's.league_id')
                    .innerJoin('platforms as p', 'p.id', 'l.platform_id')
                    .select([
                        'l.id as league_id',
                        'l.name as league_name',
                        'p.name as platform_name',
                        's.id as season_id',
                        's.name as season_name',
                        'c.id as competition_id',
                        'c.name as division_name',
                    ])
                    .where('c.type', '=', 'league')
                    .where('c.deleted_at', 'is', null)
                    .where('l.deleted_at', 'is', null)
                    .where('s.is_active', '=', true)
                    .orderBy('l.name', 'asc')
                    .orderBy('c.name', 'asc')
                    .execute();

                const leagueIds = Array.from(new Set(rows.map((row) => row.league_id)));
                const regionRows = leagueIds.length === 0
                    ? []
                    : await db
                        .selectFrom('league_regions as lr')
                        .innerJoin('regions as r', 'r.id', 'lr.region_id')
                        .select([
                            'lr.league_id as league_id',
                            'r.id as region_id',
                            'r.slug as region_slug',
                            'r.name as region_name',
                        ])
                        .where('lr.league_id', 'in', leagueIds)
                        .orderBy('r.name', 'asc')
                        .execute();

                const leagueMap = new Map<string, {
                    id: string;
                    name: string;
                    platform: string;
                    season_id: string;
                    season: string;
                    regions: { id: string; slug: string; name: string }[];
                    divisions: { id: string; name: string }[];
                }>();

                for (const row of rows) {
                    if (!leagueMap.has(row.league_id)) {
                        leagueMap.set(row.league_id, {
                            id: row.league_id,
                            name: row.league_name,
                            platform: row.platform_name,
                            season_id: row.season_id,
                            season: row.season_name,
                            regions: [],
                            divisions: [],
                        });
                    }
                    leagueMap.get(row.league_id)!.divisions.push({
                        id: row.competition_id,
                        name: row.division_name,
                    });
                }

                for (const row of regionRows) {
                    const league = leagueMap.get(row.league_id);
                    if (!league) continue;
                    league.regions.push({
                        id: row.region_id,
                        slug: row.region_slug,
                        name: row.region_name,
                    });
                }

                return reply.send({ data: Array.from(leagueMap.values()) });
            },
        );

        app.get(
            '/overview',
            {
                schema: {
                    querystring: OverviewQuerySchema,
                    response: {
                        200: z.object({ data: z.array(LeagueOverviewItemSchema) }),
                    },
                },
            },
            async (request, reply) => {
                const leagueIds = (request.query.league_ids ?? '')
                    .split(',')
                    .map((id) => id.trim())
                    .filter((id) => z.string().uuid().safeParse(id).success);

                const result = await sql<{
                    id: string;
                    name: string;
                    season_id: string;
                    season: string;
                    divisions: number;
                    teams: number;
                    matches_played: number;
                    upcoming_fixtures: number;
                    last_scraped_at: Date | null;
                }>`
                    WITH selected_competitions AS MATERIALIZED (
                        SELECT
                            c.id AS competition_id,
                            c.last_scraped_at,
                            l.id AS league_id,
                            l.name AS league_name,
                            s.id AS season_id,
                            s.name AS season_name
                        FROM leagues l
                        JOIN seasons s
                          ON s.league_id = l.id
                         AND s.is_active = true
                         AND s.deleted_at IS NULL
                        JOIN competitions c
                          ON c.season_id = s.id
                         AND c.type = 'league'
                         AND c.deleted_at IS NULL
                        WHERE l.deleted_at IS NULL
                          AND (${leagueIds.length} = 0 OR l.id = ANY(${sql`ARRAY[${sql.join(leagueIds.map((id) => sql`${id}::uuid`))}]::uuid[]`}))
                    ),
                    standing_summary AS (
                        SELECT
                            selected.competition_id,
                            COUNT(DISTINCT standings.team_id)::int AS teams,
                            COALESCE(ROUND(SUM(standings.played)::numeric / 2), 0)::int AS matches_played
                        FROM selected_competitions selected
                        LEFT JOIN league_standings standings
                          ON standings.competition_id = selected.competition_id
                         AND standings.deleted_at IS NULL
                        GROUP BY selected.competition_id
                    ),
                    upcoming_summary AS (
                        SELECT
                            selected.competition_id,
                            COUNT(fixtures.id)::int AS upcoming_fixtures
                        FROM selected_competitions selected
                        LEFT JOIN fixtures
                          ON fixtures.competition_id = selected.competition_id
                         AND fixtures.status = 'upcoming'
                         AND fixtures.deleted_at IS NULL
                        GROUP BY selected.competition_id
                    )
                    SELECT
                        selected.league_id AS id,
                        selected.league_name AS name,
                        selected.season_id,
                        selected.season_name AS season,
                        COUNT(selected.competition_id)::int AS divisions,
                        COALESCE(SUM(standing_summary.teams), 0)::int AS teams,
                        COALESCE(SUM(standing_summary.matches_played), 0)::int AS matches_played,
                        COALESCE(SUM(upcoming_summary.upcoming_fixtures), 0)::int AS upcoming_fixtures,
                        MAX(selected.last_scraped_at) AS last_scraped_at
                    FROM selected_competitions selected
                    LEFT JOIN standing_summary
                      ON standing_summary.competition_id = selected.competition_id
                    LEFT JOIN upcoming_summary
                      ON upcoming_summary.competition_id = selected.competition_id
                    GROUP BY selected.league_id, selected.league_name, selected.season_id, selected.season_name
                    ORDER BY selected.league_name ASC
                `.execute(db);

                return reply.send({
                    data: result.rows.map((row) => ({
                        ...row,
                        divisions: Number(row.divisions),
                        teams: Number(row.teams),
                        matches_played: Number(row.matches_played),
                        upcoming_fixtures: Number(row.upcoming_fixtures),
                        last_scraped_at: row.last_scraped_at?.toISOString() ?? null,
                        status: Number(row.matches_played) > 0 ? 'in_progress' as const : 'no_data' as const,
                    })),
                });
            },
        );

        app.get(
            '/dashboard',
            {
                schema: {
                    querystring: OverviewQuerySchema,
                    response: {
                        200: CollectionDashboardSchema,
                    },
                },
            },
            async (request, reply) => {
                const leagueIds = (request.query.league_ids ?? '')
                    .split(',')
                    .map((id) => id.trim())
                    .filter((id) => z.string().uuid().safeParse(id).success);
                const leagueIdArray = sql`ARRAY[${sql.join(leagueIds.map((id) => sql`${id}::uuid`))}]::uuid[]`;
                const leagueFilter = sql`(${leagueIds.length} = 0 OR l.id = ANY(${leagueIdArray}))`;

                const [totalsResult, recentResult, upcomingResult, teamsResult] = await Promise.all([
                    sql<{
                        leagues: number;
                        divisions: number;
                        teams: number;
                        matches_played: number;
                        upcoming_fixtures: number;
                    }>`
                        WITH selected_competitions AS (
                            SELECT c.id, l.id AS league_id
                            FROM leagues l
                            JOIN seasons s
                              ON s.league_id = l.id
                             AND s.is_active = true
                             AND s.deleted_at IS NULL
                            JOIN competitions c
                              ON c.season_id = s.id
                             AND c.type = 'league'
                             AND c.deleted_at IS NULL
                            WHERE l.deleted_at IS NULL
                              AND ${leagueFilter}
                        ),
                        standing_totals AS (
                            SELECT
                                COUNT(DISTINCT ls.team_id)::int AS teams,
                                COALESCE(ROUND(SUM(ls.played)::numeric / 2), 0)::int AS matches_played
                            FROM selected_competitions sc
                            LEFT JOIN league_standings ls
                              ON ls.competition_id = sc.id
                             AND ls.deleted_at IS NULL
                        ),
                        upcoming_totals AS (
                            SELECT COUNT(*)::int AS upcoming_fixtures
                            FROM selected_competitions sc
                            JOIN fixtures f
                              ON f.competition_id = sc.id
                             AND f.deleted_at IS NULL
                             AND f.status = 'upcoming'
                        )
                        SELECT
                            COUNT(DISTINCT sc.league_id)::int AS leagues,
                            COUNT(DISTINCT sc.id)::int AS divisions,
                            st.teams,
                            st.matches_played,
                            ut.upcoming_fixtures
                        FROM selected_competitions sc
                        CROSS JOIN standing_totals st
                        CROSS JOIN upcoming_totals ut
                        GROUP BY st.teams, st.matches_played, ut.upcoming_fixtures
                    `.execute(db),
                    sql<{
                        fixture_id: string;
                        league_id: string;
                        league_name: string;
                        competition_id: string;
                        division_name: string;
                        date_played: Date | null;
                        home_team_name: string | null;
                        away_team_name: string | null;
                        home_score: number;
                        away_score: number;
                    }>`
                        WITH recent AS MATERIALIZED (
                            SELECT
                                f.id AS fixture_id,
                                l.id AS league_id,
                                l.name AS league_name,
                                c.id AS competition_id,
                                c.name AS division_name,
                                f.date_played,
                                ht.name AS home_team_name,
                                at.name AS away_team_name
                            FROM leagues l
                            JOIN seasons s ON s.league_id = l.id AND s.is_active = true
                            JOIN competitions c ON c.season_id = s.id AND c.type = 'league'
                            JOIN fixtures f ON f.competition_id = c.id
                            LEFT JOIN teams ht ON ht.id = f.home_team_id
                            LEFT JOIN teams at ON at.id = f.away_team_id
                            WHERE l.deleted_at IS NULL
                              AND s.deleted_at IS NULL
                              AND c.deleted_at IS NULL
                              AND f.deleted_at IS NULL
                              AND f.status = 'completed'
                              AND ${leagueFilter}
                            ORDER BY f.date_played DESC NULLS LAST, f.id DESC
                            LIMIT 8
                        )
                        SELECT
                            recent.*,
                            COUNT(r.id) FILTER (WHERE r.home_games_won > r.away_games_won)::int AS home_score,
                            COUNT(r.id) FILTER (WHERE r.away_games_won > r.home_games_won)::int AS away_score
                        FROM recent
                        LEFT JOIN rubbers r ON r.fixture_id = recent.fixture_id AND r.deleted_at IS NULL
                        GROUP BY
                            recent.fixture_id, recent.league_id, recent.league_name,
                            recent.competition_id, recent.division_name, recent.date_played,
                            recent.home_team_name, recent.away_team_name
                        ORDER BY recent.date_played DESC NULLS LAST, recent.fixture_id DESC
                    `.execute(db),
                    sql<{
                        fixture_id: string;
                        league_id: string;
                        league_name: string;
                        competition_id: string;
                        division_name: string;
                        date_played: Date | null;
                        home_team_name: string | null;
                        away_team_name: string | null;
                    }>`
                        SELECT
                            f.id AS fixture_id,
                            l.id AS league_id,
                            l.name AS league_name,
                            c.id AS competition_id,
                            c.name AS division_name,
                            f.date_played,
                            ht.name AS home_team_name,
                            at.name AS away_team_name
                        FROM leagues l
                        JOIN seasons s ON s.league_id = l.id AND s.is_active = true
                        JOIN competitions c ON c.season_id = s.id AND c.type = 'league'
                        JOIN fixtures f ON f.competition_id = c.id
                        LEFT JOIN teams ht ON ht.id = f.home_team_id
                        LEFT JOIN teams at ON at.id = f.away_team_id
                        WHERE l.deleted_at IS NULL
                          AND s.deleted_at IS NULL
                          AND c.deleted_at IS NULL
                          AND f.deleted_at IS NULL
                          AND f.status = 'upcoming'
                          AND ${leagueFilter}
                        ORDER BY f.date_played ASC NULLS LAST, f.id ASC
                        LIMIT 5
                    `.execute(db),
                    sql<{
                        team_id: string;
                        team_name: string;
                        league_id: string;
                        league_name: string;
                        competition_id: string;
                        division_name: string;
                        position: number;
                        played: number;
                        won: number;
                        drawn: number;
                        lost: number;
                        points: number;
                        win_rate: number;
                    }>`
                        SELECT
                            t.id AS team_id,
                            t.name AS team_name,
                            l.id AS league_id,
                            l.name AS league_name,
                            c.id AS competition_id,
                            c.name AS division_name,
                            ls.position,
                            ls.played,
                            ls.won,
                            ls.drawn,
                            ls.lost,
                            ls.points,
                            ROUND((ls.won::numeric / NULLIF(ls.played, 0)) * 100, 1)::float8 AS win_rate
                        FROM leagues l
                        JOIN seasons s ON s.league_id = l.id AND s.is_active = true
                        JOIN competitions c ON c.season_id = s.id AND c.type = 'league'
                        JOIN league_standings ls ON ls.competition_id = c.id AND ls.deleted_at IS NULL
                        JOIN teams t ON t.id = ls.team_id AND t.deleted_at IS NULL
                        WHERE l.deleted_at IS NULL
                          AND s.deleted_at IS NULL
                          AND c.deleted_at IS NULL
                          AND ls.played >= 3
                          AND ${leagueFilter}
                        ORDER BY win_rate DESC, ls.played DESC, ls.won DESC, t.name ASC
                        LIMIT 8
                    `.execute(db),
                ]);

                const totals = totalsResult.rows[0] ?? {
                    leagues: 0,
                    divisions: 0,
                    teams: 0,
                    matches_played: 0,
                    upcoming_fixtures: 0,
                };
                const toDateString = (value: Date | string | null) => value instanceof Date
                    ? value.toISOString().slice(0, 10)
                    : value ? String(value).slice(0, 10) : null;

                return reply.send({
                    totals: Object.fromEntries(
                        Object.entries(totals).map(([key, value]) => [key, Number(value)]),
                    ) as typeof totals,
                    recent_results: recentResult.rows.map((row) => ({
                        ...row,
                        date_played: toDateString(row.date_played),
                        home_score: Number(row.home_score),
                        away_score: Number(row.away_score),
                    })),
                    upcoming_fixtures: upcomingResult.rows.map((row) => ({
                        ...row,
                        date_played: toDateString(row.date_played),
                    })),
                    top_teams: teamsResult.rows.map((row) => ({
                        ...row,
                        position: Number(row.position),
                        played: Number(row.played),
                        won: Number(row.won),
                        drawn: Number(row.drawn),
                        lost: Number(row.lost),
                        points: Number(row.points),
                        win_rate: Number(row.win_rate),
                    })),
                });
            },
        );

        app.get(
            '/:id/dashboard',
            {
                schema: {
                    params: ParamsSchema,
                    response: {
                        200: LeagueDashboardSchema,
                        404: ErrorSchema,
                    },
                },
            },
            async (request, reply) => {
                const { id } = request.params;
                const league = await db
                    .selectFrom('leagues as l')
                    .innerJoin('seasons as s', (join) => join
                        .onRef('s.league_id', '=', 'l.id')
                        .on('s.is_active', '=', true)
                        .on('s.deleted_at', 'is', null))
                    .select([
                        'l.id',
                        'l.name',
                        's.id as season_id',
                        's.name as season',
                    ])
                    .where('l.id', '=', id)
                    .where('l.deleted_at', 'is', null)
                    .executeTakeFirst();

                if (!league) {
                    return reply.status(404).send({
                        error: `League ${id} not found`,
                        statusCode: 404,
                    });
                }

                const [recentResult, upcomingResult, titleRaceResult, historyResult] = await Promise.all([
                    sql<{
                        fixture_id: string;
                        competition_id: string;
                        competition_name: string;
                        date_played: Date | null;
                        home_team_id: string | null;
                        home_team_name: string | null;
                        away_team_id: string | null;
                        away_team_name: string | null;
                        home_score: number;
                        away_score: number;
                    }>`
                        WITH recent AS MATERIALIZED (
                            SELECT
                                f.id AS fixture_id,
                                f.date_played,
                                f.home_team_id,
                                ht.name AS home_team_name,
                                f.away_team_id,
                                at.name AS away_team_name,
                                c.id AS competition_id,
                                c.name AS competition_name
                            FROM fixtures f
                            JOIN competitions c ON c.id = f.competition_id
                            JOIN seasons s ON s.id = c.season_id
                            LEFT JOIN teams ht ON ht.id = f.home_team_id
                            LEFT JOIN teams at ON at.id = f.away_team_id
                            WHERE s.id = ${league.season_id}
                              AND c.type = 'league'
                              AND c.deleted_at IS NULL
                              AND f.deleted_at IS NULL
                              AND f.status = 'completed'
                            ORDER BY f.date_played DESC NULLS LAST, f.id DESC
                            LIMIT 5
                        )
                        SELECT
                            recent.*,
                            COUNT(r.id) FILTER (WHERE r.home_games_won > r.away_games_won)::int AS home_score,
                            COUNT(r.id) FILTER (WHERE r.away_games_won > r.home_games_won)::int AS away_score
                        FROM recent
                        LEFT JOIN rubbers r ON r.fixture_id = recent.fixture_id AND r.deleted_at IS NULL
                        GROUP BY
                            recent.fixture_id, recent.date_played, recent.home_team_id,
                            recent.home_team_name, recent.away_team_id, recent.away_team_name,
                            recent.competition_id, recent.competition_name
                        ORDER BY recent.date_played DESC NULLS LAST, recent.fixture_id DESC
                    `.execute(db),
                    db
                        .selectFrom('fixtures as f')
                        .innerJoin('competitions as c', 'c.id', 'f.competition_id')
                        .leftJoin('teams as ht', 'ht.id', 'f.home_team_id')
                        .leftJoin('teams as at', 'at.id', 'f.away_team_id')
                        .select([
                            'f.id as fixture_id',
                            'c.id as competition_id',
                            'c.name as competition_name',
                            'f.date_played',
                            'f.home_team_id',
                            'ht.name as home_team_name',
                            'f.away_team_id',
                            'at.name as away_team_name',
                        ])
                        .where('c.season_id', '=', league.season_id)
                        .where('c.type', '=', 'league')
                        .where('c.deleted_at', 'is', null)
                        .where('f.deleted_at', 'is', null)
                        .where('f.status', '=', 'upcoming')
                        .orderBy('f.date_played', 'asc')
                        .orderBy('f.id', 'asc')
                        .limit(5)
                        .execute(),
                    sql<{
                        competition_id: string;
                        competition_name: string;
                        leader_name: string;
                        leader_points: number;
                        points_gap: number | null;
                    }>`
                        WITH ranked AS (
                            SELECT
                                c.id AS competition_id,
                                c.name AS competition_name,
                                t.name AS team_name,
                                ls.points,
                                ROW_NUMBER() OVER (
                                    PARTITION BY c.id
                                    ORDER BY ls.position ASC
                                ) AS standing_rank
                            FROM competitions c
                            JOIN league_standings ls
                              ON ls.competition_id = c.id
                             AND ls.deleted_at IS NULL
                            JOIN teams t ON t.id = ls.team_id
                            WHERE c.season_id = ${league.season_id}
                              AND c.type = 'league'
                              AND c.deleted_at IS NULL
                        )
                        SELECT
                            competition_id,
                            competition_name,
                            MAX(team_name) FILTER (WHERE standing_rank = 1) AS leader_name,
                            MAX(points) FILTER (WHERE standing_rank = 1)::int AS leader_points,
                            (
                                MAX(points) FILTER (WHERE standing_rank = 1)
                                - MAX(points) FILTER (WHERE standing_rank = 2)
                            )::int AS points_gap
                        FROM ranked
                        WHERE standing_rank <= 2
                        GROUP BY competition_id, competition_name
                        ORDER BY points_gap ASC NULLS LAST, competition_name ASC
                    `.execute(db),
                    sql<{
                        season_id: string;
                        season: string;
                        is_active: boolean;
                        divisions: number;
                        teams: number;
                        fixtures: number;
                        champions: unknown;
                    }>`
                        SELECT
                            s.id AS season_id,
                            s.name AS season,
                            s.is_active,
                            COUNT(DISTINCT c.id)::int AS divisions,
                            COUNT(DISTINCT t.id)::int AS teams,
                            COUNT(DISTINCT f.id)::int AS fixtures,
                            COALESCE(
                                JSONB_AGG(
                                    DISTINCT JSONB_BUILD_OBJECT(
                                        'division_name', c.name,
                                        'team_name', champion.name
                                    )
                                ) FILTER (WHERE champion.id IS NOT NULL),
                                '[]'::jsonb
                            ) AS champions
                        FROM seasons s
                        JOIN competitions c
                          ON c.season_id = s.id
                         AND c.type = 'league'
                         AND c.deleted_at IS NULL
                        LEFT JOIN teams t
                          ON t.competition_id = c.id
                         AND t.deleted_at IS NULL
                        LEFT JOIN fixtures f
                          ON f.competition_id = c.id
                         AND f.deleted_at IS NULL
                        LEFT JOIN league_standings winner
                          ON winner.competition_id = c.id
                         AND winner.position = 1
                         AND winner.deleted_at IS NULL
                        LEFT JOIN teams champion ON champion.id = winner.team_id
                        WHERE s.league_id = ${id}
                          AND s.deleted_at IS NULL
                        GROUP BY s.id, s.name, s.is_active
                        ORDER BY s.is_active DESC, MAX(f.date_played) DESC NULLS LAST, s.name DESC
                        LIMIT 6
                    `.execute(db),
                ]);

                const toDateString = (value: Date | string | null) => value instanceof Date
                    ? value.toISOString().slice(0, 10)
                    : value ? String(value).slice(0, 10) : null;

                return reply.send({
                    league,
                    recent_results: recentResult.rows.map((row) => ({
                        ...row,
                        date_played: toDateString(row.date_played),
                        home_score: Number(row.home_score),
                        away_score: Number(row.away_score),
                    })),
                    upcoming_fixtures: upcomingResult.map((row) => ({
                        ...row,
                        date_played: toDateString(row.date_played),
                    })),
                    title_races: titleRaceResult.rows.map((row) => ({
                        ...row,
                        leader_points: Number(row.leader_points),
                        points_gap: row.points_gap === null ? null : Number(row.points_gap),
                    })),
                    history: historyResult.rows.map((row) => ({
                        ...row,
                        divisions: Number(row.divisions),
                        teams: Number(row.teams),
                        fixtures: Number(row.fixtures),
                        champions: Array.isArray(row.champions) ? row.champions : [],
                    })),
                });
            },
        );

        app.get(
            '/:id/snapshot',
            {
                schema: {
                    params: ParamsSchema,
                    response: {
                        200: LeagueSnapshotSchema,
                        404: ErrorSchema,
                    },
                },
            },
            async (request, reply) => {
                const { id } = request.params;

                const league = await db
                    .selectFrom('leagues')
                    .select('id')
                    .where('id', '=', id)
                    .where('deleted_at', 'is', null)
                    .executeTakeFirst();

                if (!league) {
                    return reply.status(404).send({
                        error: `League ${id} not found`,
                        statusCode: 404,
                    });
                }

                const snapshot = await sql<{
                    division_id: string;
                    division_name: string;
                    teams: number;
                    players: number;
                    matches: number;
                    total_players: number;
                }>`
                    WITH active_competitions AS MATERIALIZED (
                        SELECT c.id, c.name
                        FROM competitions c
                        JOIN seasons s ON s.id = c.season_id
                        WHERE s.league_id = ${id}
                          AND s.is_active = true
                          AND s.deleted_at IS NULL
                          AND c.type = 'league'
                          AND c.deleted_at IS NULL
                    ),
                    standing_counts AS (
                        SELECT
                            ls.competition_id,
                            COUNT(*)::int AS teams,
                            COALESCE(ROUND(SUM(ls.played)::numeric / 2), 0)::int AS matches
                        FROM league_standings ls
                        JOIN active_competitions ac ON ac.id = ls.competition_id
                        WHERE ls.deleted_at IS NULL
                        GROUP BY ls.competition_id
                    ),
                    player_appearances AS MATERIALIZED (
                        SELECT f.competition_id, r.home_player_1_id AS player_id
                        FROM fixtures f
                        JOIN active_competitions ac ON ac.id = f.competition_id
                        JOIN rubbers r ON r.fixture_id = f.id
                        WHERE f.deleted_at IS NULL
                          AND r.deleted_at IS NULL
                          AND r.home_player_1_id IS NOT NULL
                        UNION ALL
                        SELECT f.competition_id, r.home_player_2_id AS player_id
                        FROM fixtures f
                        JOIN active_competitions ac ON ac.id = f.competition_id
                        JOIN rubbers r ON r.fixture_id = f.id
                        WHERE f.deleted_at IS NULL
                          AND r.deleted_at IS NULL
                          AND r.home_player_2_id IS NOT NULL
                        UNION ALL
                        SELECT f.competition_id, r.away_player_1_id AS player_id
                        FROM fixtures f
                        JOIN active_competitions ac ON ac.id = f.competition_id
                        JOIN rubbers r ON r.fixture_id = f.id
                        WHERE f.deleted_at IS NULL
                          AND r.deleted_at IS NULL
                          AND r.away_player_1_id IS NOT NULL
                        UNION ALL
                        SELECT f.competition_id, r.away_player_2_id AS player_id
                        FROM fixtures f
                        JOIN active_competitions ac ON ac.id = f.competition_id
                        JOIN rubbers r ON r.fixture_id = f.id
                        WHERE f.deleted_at IS NULL
                          AND r.deleted_at IS NULL
                          AND r.away_player_2_id IS NOT NULL
                    ),
                    player_counts AS (
                        SELECT competition_id, COUNT(DISTINCT player_id)::int AS players
                        FROM player_appearances
                        GROUP BY competition_id
                    ),
                    total_players AS (
                        SELECT COUNT(DISTINCT player_id)::int AS players
                        FROM player_appearances
                    )
                    SELECT
                        ac.id AS division_id,
                        ac.name AS division_name,
                        COALESCE(sc.teams, 0)::int AS teams,
                        COALESCE(pc.players, 0)::int AS players,
                        COALESCE(sc.matches, 0)::int AS matches,
                        total_players.players AS total_players
                    FROM active_competitions ac
                    CROSS JOIN total_players
                    LEFT JOIN standing_counts sc ON sc.competition_id = ac.id
                    LEFT JOIN player_counts pc ON pc.competition_id = ac.id
                    ORDER BY ac.name ASC
                `.execute(db);

                const divisions = snapshot.rows.map((row) => ({
                    divisionId: row.division_id,
                    divisionName: row.division_name,
                    teams: Number(row.teams),
                    players: Number(row.players),
                    matches: Number(row.matches),
                }));


                return reply.send({
                    divisions,
                    totals: {
                        divisions: divisions.length,
                        teams: divisions.reduce((sum, division) => sum + division.teams, 0),
                        players: Number(snapshot.rows[0]?.total_players ?? 0),
                        matches: divisions.reduce((sum, division) => sum + division.matches, 0),
                    },
                });
            },
        );
    };
}
