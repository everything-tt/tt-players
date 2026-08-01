import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql, type Kysely, type RawBuilder } from 'kysely';
import type { Database } from '@tt-players/db';
import { DEFAULT_RATING_MODEL_KEY } from '../ratings/domain.js';

const ParamsSchema = z.object({
    playerId1: z.string().uuid(),
    playerId2: z.string().uuid(),
});

const QuerySchema = z.object({
    common_limit: z.coerce.number().int().min(1).max(50).default(10),
    form_window: z.coerce.number().int().min(5).max(50).default(10),
    model: z.string().min(1).default(DEFAULT_RATING_MODEL_KEY),
});

const FormSchema = z.object({
    played: z.number().int(),
    wins: z.number().int(),
    losses: z.number().int(),
    win_rate: z.number().int(),
    recent_results: z.array(z.enum(['W', 'L'])),
});

const RatingSchema = z.object({
    current: z.number().nullable(),
    change_12_weeks: z.number().nullable(),
    confidence: z.enum(['high', 'medium', 'low']).nullable(),
    provisional: z.boolean().nullable(),
});

const ResponseSchema = z.object({
    players: z.object({
        player1: z.object({ id: z.string().uuid(), name: z.string() }),
        player2: z.object({ id: z.string().uuid(), name: z.string() }),
    }),
    common_opponents: z.object({
        total: z.number().int(),
        player1_advantage: z.number().int(),
        player2_advantage: z.number().int(),
        even: z.number().int(),
        aggregate_edge: z.number().int(),
        data: z.array(z.object({
            opponent_id: z.string().uuid(),
            opponent_name: z.string(),
            player1: z.object({ played: z.number().int(), wins: z.number().int(), losses: z.number().int(), win_rate: z.number().int() }),
            player2: z.object({ played: z.number().int(), wins: z.number().int(), losses: z.number().int(), win_rate: z.number().int() }),
            edge: z.number().int(),
        })),
    }),
    form: z.object({ player1: FormSchema, player2: FormSchema }),
    rating: z.object({ player1: RatingSchema, player2: RatingSchema }),
    evidence: z.object({
        confidence: z.enum(['high', 'medium', 'low']),
        sample_size: z.number().int(),
        reasons: z.array(z.string()),
    }),
});

type AnalysisResponse = z.infer<typeof ResponseSchema>;

interface IdentityRow {
    player_key: number;
    player_id: string;
    player_name: string;
    source_ids: string[];
}

interface CommonRow {
    opponent_id: string;
    opponent_name: string;
    p1_played: number;
    p1_wins: number;
    p1_rate: number;
    p2_played: number;
    p2_wins: number;
    p2_rate: number;
    edge: number;
    total_count: number;
    player1_advantage: number;
    player2_advantage: number;
    even_count: number;
    aggregate_edge: number;
    shared_sample_size: number;
}

interface FormRow {
    player_key: number;
    result: 'W' | 'L';
}

interface RatingRow {
    player_key: number;
    current_rating: number | null;
    prior_rating: number | null;
    confidence: 'high' | 'medium' | 'low' | null;
    provisional: boolean | null;
}

const H2H_ANALYSIS_CACHE_TYPE = 'h2h-analysis';
const H2H_ANALYSIS_CACHE_TTL_MS = Number(
    process.env['H2H_ANALYSIS_CACHE_TTL_MS'] ?? `${60 * 60 * 1000}`,
);

function uuidArray(ids: string[]): RawBuilder<string[]> {
    if (ids.length === 0) return sql`ARRAY[]::uuid[]`;
    return sql`ARRAY[${sql.join(ids.map((id) => sql`${id}::uuid`))}]::uuid[]`;
}

function toEpochMs(value: Date | string | null | undefined): number {
    if (!value) return 0;
    const date = value instanceof Date ? value : new Date(String(value));
    const time = date.getTime();
    return Number.isNaN(time) ? 0 : time;
}

async function readAnalysisCache(
    db: Kysely<Database>,
    cacheKey: string,
    sourceVersion: string,
): Promise<AnalysisResponse | null> {
    const cached = await db
        .selectFrom('cache_entries')
        .select(['content', 'source_version', 'expires_at'])
        .where('type', '=', H2H_ANALYSIS_CACHE_TYPE)
        .where('cache_key', '=', cacheKey)
        .executeTakeFirst();

    if (
        cached
        && cached.source_version === sourceVersion
        && toEpochMs(cached.expires_at) > Date.now()
    ) {
        return cached.content as AnalysisResponse;
    }
    return null;
}

async function writeAnalysisCache(
    db: Kysely<Database>,
    cacheKey: string,
    sourceVersion: string,
    payload: AnalysisResponse,
): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + H2H_ANALYSIS_CACHE_TTL_MS);
    await db
        .insertInto('cache_entries')
        .values({
            type: H2H_ANALYSIS_CACHE_TYPE,
            cache_key: cacheKey,
            content: payload,
            source_version: sourceVersion,
            expires_at: expiresAt,
            updated_at: now,
        })
        .onConflict((conflict) => conflict.columns(['type', 'cache_key']).doUpdateSet({
            content: payload,
            source_version: sourceVersion,
            expires_at: expiresAt,
            updated_at: now,
        }))
        .execute();
}

export function percentage(wins: number, played: number): number {
    return played > 0 ? Math.round((wins / played) * 100) : 0;
}

export function evidenceConfidence(sampleSize: number, sharedOpponents: number): 'high' | 'medium' | 'low' {
    if (sampleSize >= 30 && sharedOpponents >= 5) return 'high';
    if (sampleSize >= 14) return 'medium';
    return 'low';
}

function buildEvidenceReasons(response: AnalysisResponse): string[] {
    const reasons: string[] = [];
    const { player1, player2 } = response.players;
    const { total, aggregate_edge: aggregateEdge } = response.common_opponents;
    const { player1: form1, player2: form2 } = response.form;
    const { player1: rating1, player2: rating2 } = response.rating;

    if (total > 0) reasons.push(`${total} shared opponents provide indirect matchup evidence.`);
    if (Math.abs(aggregateEdge) >= 5) {
        reasons.push(`${aggregateEdge > 0 ? player1.name : player2.name} has the stronger aggregate record against shared opponents.`);
    }
    if (Math.abs(form1.win_rate - form2.win_rate) >= 10) {
        reasons.push(`${form1.win_rate > form2.win_rate ? player1.name : player2.name} has the stronger recent form.`);
    }
    if (rating1.current !== null && rating2.current !== null) {
        reasons.push(`Current ability ratings differ by ${Math.abs(rating1.current - rating2.current)} points.`);
    }
    if (reasons.length === 0) reasons.push('Available evidence is balanced or limited; treat the prediction cautiously.');
    return reasons;
}

function orientAnalysisResponse(response: AnalysisResponse, reverse: boolean): AnalysisResponse {
    if (!reverse) return response;

    const oriented: AnalysisResponse = {
        players: {
            player1: response.players.player2,
            player2: response.players.player1,
        },
        common_opponents: {
            total: response.common_opponents.total,
            player1_advantage: response.common_opponents.player2_advantage,
            player2_advantage: response.common_opponents.player1_advantage,
            even: response.common_opponents.even,
            aggregate_edge: -response.common_opponents.aggregate_edge,
            data: response.common_opponents.data.map((opponent) => ({
                ...opponent,
                player1: opponent.player2,
                player2: opponent.player1,
                edge: -opponent.edge,
            })),
        },
        form: {
            player1: response.form.player2,
            player2: response.form.player1,
        },
        rating: {
            player1: response.rating.player2,
            player2: response.rating.player1,
        },
        evidence: {
            confidence: response.evidence.confidence,
            sample_size: response.evidence.sample_size,
            reasons: [],
        },
    };
    oriented.evidence.reasons = buildEvidenceReasons(oriented);
    return oriented;
}

export function h2hAnalysisRoutes(db: Kysely<Database>): FastifyPluginAsync {
    return async function (fastify) {
        const app = fastify.withTypeProvider<ZodTypeProvider>();

        app.get(
            '/:playerId1/h2h/:playerId2/analysis',
            {
                schema: {
                    params: ParamsSchema,
                    querystring: QuerySchema,
                    response: {
                        200: ResponseSchema,
                        404: z.object({ error: z.string(), statusCode: z.number().int() }),
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

                const requestedIdentity1 = identities.rows.find((row) => Number(row.player_key) === 1);
                const requestedIdentity2 = identities.rows.find((row) => Number(row.player_key) === 2);
                if (!requestedIdentity1 || !requestedIdentity2 || requestedIdentity1.player_id === requestedIdentity2.player_id) {
                    return reply.status(404).send({ error: 'One or both players were not found', statusCode: 404 });
                }

                const normalized = [requestedIdentity1, requestedIdentity2]
                    .sort((left, right) => left.player_id.localeCompare(right.player_id));
                const identity1 = normalized[0]!;
                const identity2 = normalized[1]!;
                const reverseForRequest = requestedIdentity1.player_id !== identity1.player_id;
                const player1SourceIds = uuidArray(identity1.source_ids);
                const player2SourceIds = uuidArray(identity2.source_ids);

                const versionResult = await sql<{ data_version: string }>`
                    WITH relevant_rubbers AS (
                        SELECT
                            rubber.fixture_id,
                            rubber.updated_at,
                            CASE
                                WHEN rubber.home_player_1_id = ANY(${player1SourceIds})
                                  OR rubber.home_player_1_id = ANY(${player2SourceIds})
                                THEN rubber.away_player_1_id
                                ELSE rubber.home_player_1_id
                            END AS opponent_source_id
                        FROM rubbers rubber
                        WHERE (
                            rubber.home_player_1_id = ANY(${player1SourceIds})
                            OR rubber.away_player_1_id = ANY(${player1SourceIds})
                            OR rubber.home_player_1_id = ANY(${player2SourceIds})
                            OR rubber.away_player_1_id = ANY(${player2SourceIds})
                        )
                          AND rubber.is_doubles = false
                          AND rubber.deleted_at IS NULL
                          AND rubber.outcome_type <> 'walkover'
                    ), relevant_player_ids AS (
                        SELECT UNNEST(${player1SourceIds}) AS player_id
                        UNION
                        SELECT UNNEST(${player2SourceIds}) AS player_id
                        UNION
                        SELECT opponent_source_id FROM relevant_rubbers WHERE opponent_source_id IS NOT NULL
                        UNION
                        SELECT COALESCE(player.canonical_player_id, player.id)
                        FROM external_players player
                        WHERE player.id IN (
                            SELECT opponent_source_id FROM relevant_rubbers WHERE opponent_source_id IS NOT NULL
                        )
                    )
                    SELECT GREATEST(
                        COALESCE((
                            SELECT MAX(GREATEST(relevant.updated_at, fixture.updated_at))
                            FROM relevant_rubbers relevant
                            JOIN fixtures fixture ON fixture.id = relevant.fixture_id
                        ), '-infinity'::timestamptz),
                        COALESCE((
                            SELECT MAX(player.updated_at)
                            FROM external_players player
                            JOIN relevant_player_ids relevant ON relevant.player_id = player.id
                        ), '-infinity'::timestamptz),
                        COALESCE((
                            SELECT MAX(history.updated_at)
                            FROM player_rating_weekly_history history
                            JOIN rating_models model ON model.id = history.model_id
                            WHERE history.player_id IN (${identity1.player_id}::uuid, ${identity2.player_id}::uuid)
                              AND model.key = ${request.query.model}
                        ), '-infinity'::timestamptz)
                    )::text AS data_version
                `.execute(db);
                const sourceVersion = versionResult.rows[0]?.data_version ?? 'none';
                const cacheKey = [
                    identity1.player_id,
                    identity2.player_id,
                    request.query.common_limit,
                    request.query.form_window,
                    request.query.model,
                ].join(':');

                const cached = await readAnalysisCache(db, cacheKey, sourceVersion);
                if (cached) return reply.send(orientAnalysisResponse(cached, reverseForRequest));

                const [commonResult, formResult, ratingResult] = await Promise.all([
                    sql<CommonRow>`
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
                                END AS is_win
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
                                relevant.is_win
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
                                SUM(is_win)::int AS wins
                            FROM canonicalized
                            GROUP BY player_key, opponent_id, opponent_name
                        ), common AS (
                            SELECT
                                player1.opponent_id,
                                player1.opponent_name,
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
                        ), scored AS (
                            SELECT *, (p1_rate - p2_rate)::int AS edge
                            FROM common
                        ), summarized AS (
                            SELECT
                                *,
                                COUNT(*) OVER ()::int AS total_count,
                                COUNT(*) FILTER (WHERE edge >= 10) OVER ()::int AS player1_advantage,
                                COUNT(*) FILTER (WHERE edge <= -10) OVER ()::int AS player2_advantage,
                                COUNT(*) FILTER (WHERE edge > -10 AND edge < 10) OVER ()::int AS even_count,
                                ROUND(AVG(edge) OVER ())::int AS aggregate_edge,
                                SUM(LEAST(p1_played, p2_played)) OVER ()::int AS shared_sample_size
                            FROM scored
                        )
                        SELECT *
                        FROM summarized
                        ORDER BY (p1_played + p2_played) DESC, opponent_name ASC
                        LIMIT ${request.query.common_limit}
                    `.execute(db),
                    sql<FormRow>`
                        WITH relevant AS MATERIALIZED (
                            SELECT
                                rubber.id,
                                rubber.home_player_1_id,
                                rubber.away_player_1_id,
                                rubber.home_games_won,
                                rubber.away_games_won,
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
                        ), perspectives AS (
                            SELECT
                                1 AS player_key,
                                CASE
                                    WHEN (relevant.home_player_1_id = ANY(${player1SourceIds}) AND relevant.home_games_won > relevant.away_games_won)
                                      OR (relevant.away_player_1_id = ANY(${player1SourceIds}) AND relevant.away_games_won > relevant.home_games_won)
                                    THEN 'W' ELSE 'L'
                                END AS result,
                                relevant.played_at,
                                relevant.id
                            FROM relevant
                            WHERE relevant.home_player_1_id = ANY(${player1SourceIds})
                               OR relevant.away_player_1_id = ANY(${player1SourceIds})

                            UNION ALL

                            SELECT
                                2 AS player_key,
                                CASE
                                    WHEN (relevant.home_player_1_id = ANY(${player2SourceIds}) AND relevant.home_games_won > relevant.away_games_won)
                                      OR (relevant.away_player_1_id = ANY(${player2SourceIds}) AND relevant.away_games_won > relevant.home_games_won)
                                    THEN 'W' ELSE 'L'
                                END AS result,
                                relevant.played_at,
                                relevant.id
                            FROM relevant
                            WHERE relevant.home_player_1_id = ANY(${player2SourceIds})
                               OR relevant.away_player_1_id = ANY(${player2SourceIds})
                        ), ordered AS (
                            SELECT
                                player_key,
                                result,
                                ROW_NUMBER() OVER (PARTITION BY player_key ORDER BY played_at DESC, id DESC) AS row_number
                            FROM perspectives
                        )
                        SELECT player_key, result
                        FROM ordered
                        WHERE row_number <= ${request.query.form_window}
                        ORDER BY player_key, row_number
                    `.execute(db),
                    sql<RatingRow>`
                        WITH requested(player_key, player_id) AS (
                            VALUES (1, ${identity1.player_id}::uuid), (2, ${identity2.player_id}::uuid)
                        ), selected_model AS (
                            SELECT id FROM rating_models WHERE key = ${request.query.model} LIMIT 1
                        )
                        SELECT
                            requested.player_key,
                            latest.rating AS current_rating,
                            prior.rating AS prior_rating,
                            CASE
                                WHEN latest.rating_deviation <= 80 THEN 'high'
                                WHEN latest.rating_deviation <= 140 THEN 'medium'
                                ELSE 'low'
                            END AS confidence,
                            latest.provisional
                        FROM requested
                        CROSS JOIN selected_model
                        LEFT JOIN LATERAL (
                            SELECT
                                history.week_start,
                                history.rating,
                                history.rating_deviation,
                                history.provisional
                            FROM player_rating_weekly_history history
                            WHERE history.model_id = selected_model.id
                              AND history.player_id = requested.player_id
                            ORDER BY history.week_start DESC
                            LIMIT 1
                        ) latest ON true
                        LEFT JOIN LATERAL (
                            SELECT history.rating
                            FROM player_rating_weekly_history history
                            WHERE history.model_id = selected_model.id
                              AND history.player_id = requested.player_id
                              AND history.week_start <= latest.week_start - INTERVAL '12 weeks'
                            ORDER BY history.week_start DESC
                            LIMIT 1
                        ) prior ON true
                    `.execute(db),
                ]);

                const common = commonResult.rows.map((row) => {
                    const player1Played = Number(row.p1_played);
                    const player1Wins = Number(row.p1_wins);
                    const player2Played = Number(row.p2_played);
                    const player2Wins = Number(row.p2_wins);
                    return {
                        opponent_id: row.opponent_id,
                        opponent_name: row.opponent_name,
                        player1: {
                            played: player1Played,
                            wins: player1Wins,
                            losses: player1Played - player1Wins,
                            win_rate: Number(row.p1_rate),
                        },
                        player2: {
                            played: player2Played,
                            wins: player2Wins,
                            losses: player2Played - player2Wins,
                            win_rate: Number(row.p2_rate),
                        },
                        edge: Number(row.edge),
                    };
                });

                const buildForm = (key: number) => {
                    const results = formResult.rows
                        .filter((row) => Number(row.player_key) === key)
                        .map((row) => row.result);
                    const wins = results.filter((result) => result === 'W').length;
                    return {
                        played: results.length,
                        wins,
                        losses: results.length - wins,
                        win_rate: percentage(wins, results.length),
                        recent_results: results,
                    };
                };
                const buildRating = (key: number) => {
                    const row = ratingResult.rows.find((item) => Number(item.player_key) === key);
                    const current = row?.current_rating === null || row?.current_rating === undefined
                        ? null
                        : Math.round(Number(row.current_rating));
                    const prior = row?.prior_rating === null || row?.prior_rating === undefined
                        ? null
                        : Math.round(Number(row.prior_rating));
                    return {
                        current,
                        change_12_weeks: current !== null && prior !== null ? current - prior : null,
                        confidence: row?.confidence ?? null,
                        provisional: row?.provisional ?? null,
                    };
                };

                const summary = commonResult.rows[0];
                const totalCommon = Number(summary?.total_count ?? 0);
                const sharedSampleSize = Number(summary?.shared_sample_size ?? 0);
                const form1 = buildForm(1);
                const form2 = buildForm(2);
                const rating1 = buildRating(1);
                const rating2 = buildRating(2);
                const sampleSize = sharedSampleSize + form1.played + form2.played;

                const payload: AnalysisResponse = {
                    players: {
                        player1: { id: identity1.player_id, name: identity1.player_name },
                        player2: { id: identity2.player_id, name: identity2.player_name },
                    },
                    common_opponents: {
                        total: totalCommon,
                        player1_advantage: Number(summary?.player1_advantage ?? 0),
                        player2_advantage: Number(summary?.player2_advantage ?? 0),
                        even: Number(summary?.even_count ?? 0),
                        aggregate_edge: Number(summary?.aggregate_edge ?? 0),
                        data: common,
                    },
                    form: { player1: form1, player2: form2 },
                    rating: { player1: rating1, player2: rating2 },
                    evidence: {
                        confidence: evidenceConfidence(sampleSize, totalCommon),
                        sample_size: sampleSize,
                        reasons: [],
                    },
                };
                payload.evidence.reasons = buildEvidenceReasons(payload);

                await writeAnalysisCache(db, cacheKey, sourceVersion, payload);
                return reply.send(orientAnalysisResponse(payload, reverseForRequest));
            },
        );
    };
}
