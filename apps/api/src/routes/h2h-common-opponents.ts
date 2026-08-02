import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql, type Kysely, type RawBuilder } from 'kysely';
import type { Database } from '@tt-players/db';

const ParamsSchema = z.object({
    playerId1: z.string().uuid(),
    playerId2: z.string().uuid(),
});

const SortSchema = z.enum(['evidence', 'recent', 'edge', 'closest']);

const QuerySchema = z.object({
    sort: SortSchema.default('evidence'),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).optional(),
});

const RecordSchema = z.object({
    played: z.number().int(),
    wins: z.number().int(),
    losses: z.number().int(),
    win_rate: z.number().int(),
});

const CommonOpponentSchema = z.object({
    opponent_id: z.string().uuid(),
    opponent_name: z.string(),
    latest_played_at: z.string().nullable(),
    combined_played: z.number().int(),
    player1: RecordSchema,
    player2: RecordSchema,
    edge: z.number().int(),
});

const ResponseSchema = z.object({
    players: z.object({
        player1: z.object({ id: z.string().uuid(), name: z.string() }),
        player2: z.object({ id: z.string().uuid(), name: z.string() }),
    }),
    total: z.number().int(),
    data: z.array(CommonOpponentSchema),
    next_cursor: z.string().nullable(),
});

const ErrorSchema = z.object({
    error: z.string(),
    statusCode: z.number().int(),
});

export type CommonOpponentSort = z.infer<typeof SortSchema>;
type CommonOpponentItem = z.infer<typeof CommonOpponentSchema>;

interface IdentityRow {
    player_key: number;
    player_id: string;
    player_name: string;
    source_ids: string[];
}

interface CommonRow {
    opponent_id: string;
    opponent_name: string;
    latest_played_at: string | null;
    p1_played: number;
    p1_wins: number;
    p1_rate: number;
    p2_played: number;
    p2_wins: number;
    p2_rate: number;
}

interface CursorPayload {
    version: 1;
    sort: CommonOpponentSort;
    item: CommonOpponentItem;
}

function uuidArray(ids: string[]): RawBuilder<string[]> {
    if (ids.length === 0) return sql`ARRAY[]::uuid[]`;
    return sql`ARRAY[${sql.join(ids.map((id) => sql`${id}::uuid`))}]::uuid[]`;
}

function compareText(left: string, right: string): number {
    return left.localeCompare(right);
}

function compareNewestFirst(left: string | null, right: string | null): number {
    if (left === right) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return right.localeCompare(left);
}

export function compareCommonOpponents(
    left: CommonOpponentItem,
    right: CommonOpponentItem,
    sort: CommonOpponentSort,
): number {
    const evidenceTieBreak = () =>
        right.combined_played - left.combined_played
        || compareText(left.opponent_name, right.opponent_name)
        || compareText(left.opponent_id, right.opponent_id);

    if (sort === 'recent') {
        return compareNewestFirst(left.latest_played_at, right.latest_played_at)
            || evidenceTieBreak();
    }

    const leftMagnitude = Math.abs(left.edge);
    const rightMagnitude = Math.abs(right.edge);
    if (sort === 'edge') {
        return rightMagnitude - leftMagnitude || evidenceTieBreak();
    }
    if (sort === 'closest') {
        return leftMagnitude - rightMagnitude || evidenceTieBreak();
    }
    return evidenceTieBreak();
}

function encodeCursor(item: CommonOpponentItem, sort: CommonOpponentSort): string {
    const payload: CursorPayload = { version: 1, sort, item };
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(value: string, sort: CommonOpponentSort): CommonOpponentItem | null {
    try {
        const payload = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as CursorPayload;
        if (payload.version !== 1 || payload.sort !== sort) return null;
        return CommonOpponentSchema.parse(payload.item);
    } catch {
        return null;
    }
}

export function h2hCommonOpponentRoutes(db: Kysely<Database>): FastifyPluginAsync {
    return async function (fastify) {
        const app = fastify.withTypeProvider<ZodTypeProvider>();

        app.get(
            '/:playerId1/h2h/:playerId2/common-opponents',
            {
                schema: {
                    params: ParamsSchema,
                    querystring: QuerySchema,
                    response: {
                        200: ResponseSchema,
                        400: ErrorSchema,
                        404: ErrorSchema,
                    },
                },
            },
            async (request, reply) => {
                const { playerId1, playerId2 } = request.params;
                const identities = await sql<IdentityRow>`
                    WITH requested(input_id, player_key) AS (
                        VALUES (${playerId1}::uuid, 1), (${playerId2}::uuid, 2)
                    ), resolved AS (
                        SELECT
                            requested.player_key,
                            COALESCE(player.canonical_player_id, player.id) AS player_id,
                            COALESCE(canonical.name, player.name) AS player_name
                        FROM requested
                        JOIN external_players player ON player.id = requested.input_id
                        LEFT JOIN external_players canonical
                          ON canonical.id = COALESCE(player.canonical_player_id, player.id)
                         AND canonical.deleted_at IS NULL
                        WHERE player.deleted_at IS NULL
                    )
                    SELECT
                        resolved.player_key,
                        resolved.player_id,
                        resolved.player_name,
                        ARRAY_AGG(DISTINCT source.id)::uuid[] AS source_ids
                    FROM resolved
                    JOIN external_players source
                      ON COALESCE(source.canonical_player_id, source.id) = resolved.player_id
                     AND source.deleted_at IS NULL
                    GROUP BY resolved.player_key, resolved.player_id, resolved.player_name
                    ORDER BY resolved.player_key
                `.execute(db);

                const identity1 = identities.rows.find((row) => Number(row.player_key) === 1);
                const identity2 = identities.rows.find((row) => Number(row.player_key) === 2);
                if (!identity1 || !identity2 || identity1.player_id === identity2.player_id) {
                    return reply.status(404).send({
                        error: 'One or both players were not found',
                        statusCode: 404,
                    });
                }

                const player1SourceIds = uuidArray(identity1.source_ids);
                const player2SourceIds = uuidArray(identity2.source_ids);
                const result = await sql<CommonRow>`
                    WITH relevant AS (
                        SELECT
                            CASE
                                WHEN rubber.home_player_1_id = ANY(${player1SourceIds})
                                  OR rubber.away_player_1_id = ANY(${player1SourceIds})
                                THEN 1 ELSE 2
                            END AS player_key,
                            CASE
                                WHEN rubber.home_player_1_id = ANY(${player1SourceIds})
                                  OR rubber.home_player_1_id = ANY(${player2SourceIds})
                                THEN rubber.away_player_1_id
                                ELSE rubber.home_player_1_id
                            END AS opponent_source_id,
                            CASE
                                WHEN (
                                    (rubber.home_player_1_id = ANY(${player1SourceIds})
                                      OR rubber.home_player_1_id = ANY(${player2SourceIds}))
                                    AND rubber.home_games_won > rubber.away_games_won
                                ) OR (
                                    (rubber.away_player_1_id = ANY(${player1SourceIds})
                                      OR rubber.away_player_1_id = ANY(${player2SourceIds}))
                                    AND rubber.away_games_won > rubber.home_games_won
                                ) THEN 1 ELSE 0
                            END AS is_win,
                            COALESCE(fixture.date_played::timestamp, rubber.played_at, fixture.created_at) AS played_at
                        FROM rubbers rubber
                        JOIN fixtures fixture ON fixture.id = rubber.fixture_id
                        WHERE (
                            rubber.home_player_1_id = ANY(${player1SourceIds})
                            OR rubber.away_player_1_id = ANY(${player1SourceIds})
                            OR rubber.home_player_1_id = ANY(${player2SourceIds})
                            OR rubber.away_player_1_id = ANY(${player2SourceIds})
                        )
                          AND rubber.is_doubles = false
                          AND rubber.deleted_at IS NULL
                          AND rubber.outcome_type <> 'walkover'
                          AND fixture.deleted_at IS NULL
                    ), canonicalized AS (
                        SELECT
                            relevant.player_key,
                            COALESCE(opponent.canonical_player_id, opponent.id) AS opponent_id,
                            COALESCE(canonical.name, opponent.name) AS opponent_name,
                            relevant.is_win,
                            relevant.played_at
                        FROM relevant
                        JOIN external_players opponent ON opponent.id = relevant.opponent_source_id
                        LEFT JOIN external_players canonical
                          ON canonical.id = COALESCE(opponent.canonical_player_id, opponent.id)
                         AND canonical.deleted_at IS NULL
                        WHERE opponent.deleted_at IS NULL
                          AND COALESCE(opponent.canonical_player_id, opponent.id)
                              NOT IN (${identity1.player_id}::uuid, ${identity2.player_id}::uuid)
                    ), aggregate AS (
                        SELECT
                            player_key,
                            opponent_id,
                            opponent_name,
                            COUNT(*)::int AS played,
                            SUM(is_win)::int AS wins,
                            MAX(played_at) AS latest_played_at
                        FROM canonicalized
                        GROUP BY player_key, opponent_id, opponent_name
                    )
                    SELECT
                        player1.opponent_id,
                        player1.opponent_name,
                        GREATEST(player1.latest_played_at, player2.latest_played_at)::text AS latest_played_at,
                        player1.played AS p1_played,
                        player1.wins AS p1_wins,
                        ROUND((player1.wins::numeric / NULLIF(player1.played, 0)) * 100)::int AS p1_rate,
                        player2.played AS p2_played,
                        player2.wins AS p2_wins,
                        ROUND((player2.wins::numeric / NULLIF(player2.played, 0)) * 100)::int AS p2_rate
                    FROM aggregate player1
                    JOIN aggregate player2
                      ON player2.opponent_id = player1.opponent_id
                     AND player2.player_key = 2
                    WHERE player1.player_key = 1
                      AND NULLIF(TRIM(player1.opponent_name), '') IS NOT NULL
                `.execute(db);

                const allItems: CommonOpponentItem[] = result.rows.map((row) => {
                    const player1Played = Number(row.p1_played);
                    const player1Wins = Number(row.p1_wins);
                    const player2Played = Number(row.p2_played);
                    const player2Wins = Number(row.p2_wins);
                    const player1Rate = Number(row.p1_rate);
                    const player2Rate = Number(row.p2_rate);
                    return {
                        opponent_id: row.opponent_id,
                        opponent_name: row.opponent_name,
                        latest_played_at: row.latest_played_at,
                        combined_played: player1Played + player2Played,
                        player1: {
                            played: player1Played,
                            wins: player1Wins,
                            losses: player1Played - player1Wins,
                            win_rate: player1Rate,
                        },
                        player2: {
                            played: player2Played,
                            wins: player2Wins,
                            losses: player2Played - player2Wins,
                            win_rate: player2Rate,
                        },
                        edge: player1Rate - player2Rate,
                    };
                }).sort((left, right) => compareCommonOpponents(left, right, request.query.sort));

                let startIndex = 0;
                if (request.query.cursor) {
                    const cursorItem = decodeCursor(request.query.cursor, request.query.sort);
                    if (!cursorItem) {
                        return reply.status(400).send({ error: 'Invalid cursor', statusCode: 400 });
                    }
                    startIndex = allItems.findIndex((item) =>
                        compareCommonOpponents(item, cursorItem, request.query.sort) > 0,
                    );
                    if (startIndex < 0) startIndex = allItems.length;
                }

                const data = allItems.slice(startIndex, startIndex + request.query.limit);
                const hasMore = startIndex + data.length < allItems.length;
                const lastItem = data.at(-1);

                return reply.send({
                    players: {
                        player1: { id: identity1.player_id, name: identity1.player_name },
                        player2: { id: identity2.player_id, name: identity2.player_name },
                    },
                    total: allItems.length,
                    data,
                    next_cursor: hasMore && lastItem
                        ? encodeCursor(lastItem, request.query.sort)
                        : null,
                });
            },
        );
    };
}
