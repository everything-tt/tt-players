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
                }>`
                    WITH active_competitions AS (
                        SELECT c.id, c.name
                        FROM competitions c
                        JOIN seasons s ON s.id = c.season_id
                        WHERE s.league_id = ${id}
                          AND s.is_active = true
                          AND s.deleted_at IS NULL
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
                    player_appearances AS (
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
                    )
                    SELECT
                        ac.id AS division_id,
                        ac.name AS division_name,
                        COALESCE(sc.teams, 0)::int AS teams,
                        COALESCE(pc.players, 0)::int AS players,
                        COALESCE(sc.matches, 0)::int AS matches
                    FROM active_competitions ac
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

                const totalPlayerIds = await sql<{ players: number }>`
                    WITH active_competitions AS (
                        SELECT c.id
                        FROM competitions c
                        JOIN seasons s ON s.id = c.season_id
                        WHERE s.league_id = ${id}
                          AND s.is_active = true
                          AND s.deleted_at IS NULL
                          AND c.deleted_at IS NULL
                    ),
                    player_appearances AS (
                        SELECT r.home_player_1_id AS player_id
                        FROM fixtures f
                        JOIN active_competitions ac ON ac.id = f.competition_id
                        JOIN rubbers r ON r.fixture_id = f.id
                        WHERE f.deleted_at IS NULL AND r.deleted_at IS NULL AND r.home_player_1_id IS NOT NULL
                        UNION ALL
                        SELECT r.home_player_2_id AS player_id
                        FROM fixtures f
                        JOIN active_competitions ac ON ac.id = f.competition_id
                        JOIN rubbers r ON r.fixture_id = f.id
                        WHERE f.deleted_at IS NULL AND r.deleted_at IS NULL AND r.home_player_2_id IS NOT NULL
                        UNION ALL
                        SELECT r.away_player_1_id AS player_id
                        FROM fixtures f
                        JOIN active_competitions ac ON ac.id = f.competition_id
                        JOIN rubbers r ON r.fixture_id = f.id
                        WHERE f.deleted_at IS NULL AND r.deleted_at IS NULL AND r.away_player_1_id IS NOT NULL
                        UNION ALL
                        SELECT r.away_player_2_id AS player_id
                        FROM fixtures f
                        JOIN active_competitions ac ON ac.id = f.competition_id
                        JOIN rubbers r ON r.fixture_id = f.id
                        WHERE f.deleted_at IS NULL AND r.deleted_at IS NULL AND r.away_player_2_id IS NOT NULL
                    )
                    SELECT COUNT(DISTINCT player_id)::int AS players
                    FROM player_appearances
                `.execute(db);

                return reply.send({
                    divisions,
                    totals: {
                        divisions: divisions.length,
                        teams: divisions.reduce((sum, division) => sum + division.teams, 0),
                        players: Number(totalPlayerIds.rows[0]?.players ?? 0),
                        matches: divisions.reduce((sum, division) => sum + division.matches, 0),
                    },
                });
            },
        );
    };
}
