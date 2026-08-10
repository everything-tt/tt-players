import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Kysely, RawBuilder } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '@tt-players/db';

const ParamsSchema = z.object({
    id: z.string().uuid(),
});

const FilteredRubbersQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
    team_id: z.string().uuid().optional(),
    event_id: z.string().uuid().optional(),
}).refine(
    (value) => Boolean(value.team_id) !== Boolean(value.event_id),
    'Exactly one of team_id or event_id is required',
);

const RubberItemSchema = z.object({
    id: z.string().uuid(),
    fixture_id: z.string().uuid(),
    date: z.string(),
    source: z.enum(['league', 'tournament']),
    source_label: z.string(),
    event_id: z.string().uuid().nullable(),
    event_name: z.string().nullable(),
    league: z.string(),
    opponent: z.string(),
    opponent_id: z.string().uuid().nullable(),
    result: z.string(),
    isWin: z.boolean(),
});

const ResponseSchema = z.object({
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    data: z.array(RubberItemSchema),
});

const ErrorSchema = z.object({
    error: z.string(),
    statusCode: z.number(),
});

interface ResolvedPlayerIdentity {
    sourceIds: string[];
}

function uuidArray(ids: string[]): RawBuilder<string[]> {
    if (ids.length === 0) return sql`ARRAY[]::uuid[]`;
    return sql`ARRAY[${sql.join(ids.map((id) => sql`${id}::uuid`))}]::uuid[]`;
}

async function resolvePlayerIdentity(
    db: Kysely<Database>,
    requestedId: string,
): Promise<ResolvedPlayerIdentity | null> {
    const result = await sql<{
        source_ids: string[];
    }>`
        WITH player_info AS (
            SELECT COALESCE(ep.canonical_player_id, ep.id) AS canonical_id
            FROM external_players ep
            WHERE ep.id = ${requestedId}::uuid
              AND ep.deleted_at IS NULL
        )
        SELECT ARRAY_AGG(DISTINCT ep2.id) AS source_ids
        FROM player_info pi
        JOIN external_players ep2
          ON COALESCE(ep2.canonical_player_id, ep2.id) = pi.canonical_id
        WHERE ep2.deleted_at IS NULL
        HAVING COUNT(*) > 0
    `.execute(db);

    const row = result.rows[0];
    return row ? { sourceIds: row.source_ids } : null;
}

export function playerMatchFiltersRoutes(db: Kysely<Database>): FastifyPluginAsync {
    return async (app) => {
        const typedApp = app.withTypeProvider<ZodTypeProvider>();

        typedApp.get(
            '/:id/rubbers-filtered',
            {
                schema: {
                    params: ParamsSchema,
                    querystring: FilteredRubbersQuerySchema,
                    response: {
                        200: ResponseSchema,
                        400: ErrorSchema,
                        404: ErrorSchema,
                        500: ErrorSchema,
                    },
                },
            },
            async (request, reply) => {
                const { id } = request.params;
                const { limit, offset, team_id: teamId, event_id: eventId } = request.query;
                const player = await resolvePlayerIdentity(db, id);

                if (!player) {
                    return reply.status(404).send({
                        error: `Player ${id} not found`,
                        statusCode: 404,
                    });
                }

                const sourceIds = uuidArray(player.sourceIds);
                const selectedTeamId = teamId ?? null;
                const selectedEventId = eventId ?? null;

                const baseMatches = sql<any>`
                    WITH player_matches AS (
                        SELECT
                            r.id,
                            r.fixture_id,
                            COALESCE(f.date_played::timestamp, r.played_at, c.event_date::timestamp, f.created_at) as date,
                            CASE WHEN c.type = 'individual' THEN 'tournament' ELSE 'league' END as source,
                            CASE
                                WHEN c.type = 'individual' THEN COALESCE(c.display_name, c.name)
                                ELSE CONCAT(l.name, ' · ', c.name)
                            END as source_label,
                            CASE WHEN c.type = 'individual' THEN c.id ELSE NULL END as event_id,
                            CASE WHEN c.type = 'individual' THEN COALESCE(c.display_name, c.name) ELSE NULL END as event_name,
                            CONCAT(l.name, ' · ', c.name) as league,
                            COALESCE(opp_ep.canonical_player_id, opp_ep.id) as opponent_id,
                            COALESCE(opp_cp.name, opp_ep.name) as opponent,
                            CASE
                                WHEN (r.home_player_1_id = ANY(${sourceIds}) AND r.home_games_won > r.away_games_won)
                                  OR (r.away_player_1_id = ANY(${sourceIds}) AND r.away_games_won > r.home_games_won) THEN true
                                ELSE false
                            END as "isWin",
                            CASE
                                WHEN r.score_source = 'win_loss_only' THEN 'Won'
                                WHEN r.home_player_1_id = ANY(${sourceIds}) THEN CONCAT('Won ', r.home_games_won, '-', r.away_games_won)
                                WHEN r.away_player_1_id = ANY(${sourceIds}) THEN CONCAT('Won ', r.away_games_won, '-', r.home_games_won)
                            END as result_win,
                            CASE
                                WHEN r.score_source = 'win_loss_only' THEN 'Lost'
                                WHEN r.home_player_1_id = ANY(${sourceIds}) THEN CONCAT('Lost ', r.home_games_won, '-', r.away_games_won)
                                WHEN r.away_player_1_id = ANY(${sourceIds}) THEN CONCAT('Lost ', r.away_games_won, '-', r.home_games_won)
                            END as result_loss
                        FROM rubbers r
                        JOIN fixtures f ON f.id = r.fixture_id
                        JOIN competitions c ON c.id = f.competition_id
                        JOIN seasons s ON s.id = c.season_id
                        JOIN leagues l ON l.id = s.league_id
                        LEFT JOIN external_players opp_ep
                          ON opp_ep.id = CASE
                              WHEN r.home_player_1_id = ANY(${sourceIds}) THEN r.away_player_1_id
                              ELSE r.home_player_1_id
                          END
                        LEFT JOIN external_players opp_cp
                          ON opp_cp.id = COALESCE(opp_ep.canonical_player_id, opp_ep.id)
                        WHERE (r.home_player_1_id = ANY(${sourceIds}) OR r.away_player_1_id = ANY(${sourceIds}))
                          AND r.is_doubles = false
                          AND r.deleted_at IS NULL
                          AND r.outcome_type != 'walkover'
                          AND f.deleted_at IS NULL
                          AND c.deleted_at IS NULL
                          AND s.deleted_at IS NULL
                          AND l.deleted_at IS NULL
                          AND (
                              (
                                  ${selectedTeamId}::uuid IS NOT NULL
                                  AND c.type <> 'individual'
                                  AND (
                                      (r.home_player_1_id = ANY(${sourceIds}) AND f.home_team_id = ${selectedTeamId}::uuid)
                                      OR (r.away_player_1_id = ANY(${sourceIds}) AND f.away_team_id = ${selectedTeamId}::uuid)
                                  )
                              )
                              OR (
                                  ${selectedEventId}::uuid IS NOT NULL
                                  AND c.type = 'individual'
                                  AND c.id = ${selectedEventId}::uuid
                              )
                          )
                          AND NULLIF(TRIM(COALESCE(opp_cp.name, opp_ep.name)), '') IS NOT NULL
                          AND LOWER(TRIM(COALESCE(opp_cp.name, opp_ep.name))) <> 'unknown'
                    )
                `;

                const [matches, countResult] = await Promise.all([
                    sql<any>`
                        ${baseMatches}
                        SELECT *
                        FROM player_matches
                        ORDER BY date DESC, id DESC
                        LIMIT ${limit}
                        OFFSET ${offset}
                    `.execute(db),
                    sql<{ count: number }>`
                        ${baseMatches}
                        SELECT COUNT(*)::int as count
                        FROM player_matches
                    `.execute(db),
                ]);

                const data = matches.rows.map((match: any) => ({
                    id: match.id,
                    fixture_id: match.fixture_id,
                    date: String(match.date),
                    source: match.source,
                    source_label: match.source_label,
                    event_id: match.event_id,
                    event_name: match.event_name,
                    league: match.league,
                    opponent: match.opponent ?? 'Unknown',
                    opponent_id: match.opponent_id,
                    result: match.isWin ? match.result_win : match.result_loss,
                    isWin: match.isWin,
                }));

                return reply.send({
                    total: Number(countResult.rows[0]?.count ?? 0),
                    limit,
                    offset,
                    data,
                });
            },
        );
    };
}
