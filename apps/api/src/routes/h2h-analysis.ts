import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql, type Kysely } from 'kysely';
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

interface IdentityRow { player_key: number; player_id: string; player_name: string }
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
interface FormRow { player_key: number; result: 'W' | 'L' }
interface RatingRow {
    player_key: number;
    current_rating: number | null;
    prior_rating: number | null;
    confidence: 'high' | 'medium' | 'low' | null;
    provisional: boolean | null;
}

export function percentage(wins: number, played: number): number {
    return played > 0 ? Math.round((wins / played) * 100) : 0;
}

export function evidenceConfidence(sampleSize: number, sharedOpponents: number): 'high' | 'medium' | 'low' {
    if (sampleSize >= 30 && sharedOpponents >= 5) return 'high';
    if (sampleSize >= 14) return 'medium';
    return 'low';
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
                    )
                    SELECT
                        requested.player_key,
                        COALESCE(ep.canonical_player_id, ep.id) AS player_id,
                        COALESCE(canonical.name, ep.name) AS player_name
                    FROM requested
                    JOIN external_players ep ON ep.id = requested.input_id
                    LEFT JOIN external_players canonical
                      ON canonical.id = COALESCE(ep.canonical_player_id, ep.id)
                     AND canonical.deleted_at IS NULL
                    WHERE ep.deleted_at IS NULL
                    ORDER BY requested.player_key
                `.execute(db);

                const identity1 = identities.rows.find((row) => Number(row.player_key) === 1);
                const identity2 = identities.rows.find((row) => Number(row.player_key) === 2);
                if (!identity1 || !identity2 || identity1.player_id === identity2.player_id) {
                    return reply.status(404).send({ error: 'One or both players were not found', statusCode: 404 });
                }

                const [commonResult, formResult, ratingResult] = await Promise.all([
                    sql<CommonRow>`
                        WITH aliases AS (
                            SELECT id, COALESCE(canonical_player_id, id) AS canonical_id
                            FROM external_players
                            WHERE deleted_at IS NULL
                        ), singles AS (
                            SELECT
                                CASE
                                    WHEN hp.canonical_id = ${identity1.player_id}::uuid OR ap.canonical_id = ${identity1.player_id}::uuid THEN 1
                                    ELSE 2
                                END AS player_key,
                                CASE
                                    WHEN hp.canonical_id IN (${identity1.player_id}::uuid, ${identity2.player_id}::uuid) THEN ap.canonical_id
                                    ELSE hp.canonical_id
                                END AS opponent_id,
                                CASE
                                    WHEN (hp.canonical_id IN (${identity1.player_id}::uuid, ${identity2.player_id}::uuid) AND r.home_games_won > r.away_games_won)
                                      OR (ap.canonical_id IN (${identity1.player_id}::uuid, ${identity2.player_id}::uuid) AND r.away_games_won > r.home_games_won)
                                    THEN 1 ELSE 0
                                END AS is_win
                            FROM rubbers r
                            JOIN aliases hp ON hp.id = r.home_player_1_id
                            JOIN aliases ap ON ap.id = r.away_player_1_id
                            JOIN fixtures f ON f.id = r.fixture_id
                            WHERE (hp.canonical_id IN (${identity1.player_id}::uuid, ${identity2.player_id}::uuid)
                                OR ap.canonical_id IN (${identity1.player_id}::uuid, ${identity2.player_id}::uuid))
                              AND hp.canonical_id <> ap.canonical_id
                              AND r.is_doubles = false
                              AND r.deleted_at IS NULL
                              AND r.outcome_type <> 'walkover'
                              AND f.deleted_at IS NULL
                        ), aggregate AS (
                            SELECT player_key, opponent_id, COUNT(*)::int AS played, SUM(is_win)::int AS wins
                            FROM singles
                            WHERE opponent_id NOT IN (${identity1.player_id}::uuid, ${identity2.player_id}::uuid)
                            GROUP BY player_key, opponent_id
                        ), common AS (
                            SELECT
                                p1.opponent_id,
                                COALESCE(canonical.name, external.name) AS opponent_name,
                                p1.played AS p1_played,
                                p1.wins AS p1_wins,
                                ROUND((p1.wins::numeric / NULLIF(p1.played, 0)) * 100)::int AS p1_rate,
                                p2.played AS p2_played,
                                p2.wins AS p2_wins,
                                ROUND((p2.wins::numeric / NULLIF(p2.played, 0)) * 100)::int AS p2_rate
                            FROM aggregate p1
                            JOIN aggregate p2 ON p2.opponent_id = p1.opponent_id AND p2.player_key = 2
                            LEFT JOIN external_players external ON external.id = p1.opponent_id
                            LEFT JOIN external_players canonical ON canonical.id = COALESCE(external.canonical_player_id, external.id)
                            WHERE p1.player_key = 1
                              AND NULLIF(TRIM(COALESCE(canonical.name, external.name)), '') IS NOT NULL
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
                        WITH aliases AS (
                            SELECT id, COALESCE(canonical_player_id, id) AS canonical_id
                            FROM external_players
                            WHERE deleted_at IS NULL
                        ), perspectives AS (
                            SELECT
                                1 AS player_key,
                                CASE
                                    WHEN (hp.canonical_id = ${identity1.player_id}::uuid AND r.home_games_won > r.away_games_won)
                                      OR (ap.canonical_id = ${identity1.player_id}::uuid AND r.away_games_won > r.home_games_won)
                                    THEN 'W' ELSE 'L'
                                END AS result,
                                COALESCE(f.date_played::timestamp, r.played_at, f.created_at) AS played_at,
                                r.id
                            FROM rubbers r
                            JOIN aliases hp ON hp.id = r.home_player_1_id
                            JOIN aliases ap ON ap.id = r.away_player_1_id
                            JOIN fixtures f ON f.id = r.fixture_id
                            WHERE (hp.canonical_id = ${identity1.player_id}::uuid OR ap.canonical_id = ${identity1.player_id}::uuid)
                              AND r.is_doubles = false AND r.deleted_at IS NULL AND r.outcome_type <> 'walkover' AND f.deleted_at IS NULL
                            UNION ALL
                            SELECT
                                2 AS player_key,
                                CASE
                                    WHEN (hp.canonical_id = ${identity2.player_id}::uuid AND r.home_games_won > r.away_games_won)
                                      OR (ap.canonical_id = ${identity2.player_id}::uuid AND r.away_games_won > r.home_games_won)
                                    THEN 'W' ELSE 'L'
                                END AS result,
                                COALESCE(f.date_played::timestamp, r.played_at, f.created_at) AS played_at,
                                r.id
                            FROM rubbers r
                            JOIN aliases hp ON hp.id = r.home_player_1_id
                            JOIN aliases ap ON ap.id = r.away_player_1_id
                            JOIN fixtures f ON f.id = r.fixture_id
                            WHERE (hp.canonical_id = ${identity2.player_id}::uuid OR ap.canonical_id = ${identity2.player_id}::uuid)
                              AND r.is_doubles = false AND r.deleted_at IS NULL AND r.outcome_type <> 'walkover' AND f.deleted_at IS NULL
                        ), ordered AS (
                            SELECT player_key, result,
                                ROW_NUMBER() OVER (PARTITION BY player_key ORDER BY played_at DESC, id DESC) AS rn
                            FROM perspectives
                        )
                        SELECT player_key, result FROM ordered WHERE rn <= ${request.query.form_window}
                        ORDER BY player_key, rn
                    `.execute(db),
                    sql<RatingRow>`
                        WITH ranked AS (
                            SELECT
                                CASE WHEN history.player_id = ${identity1.player_id}::uuid THEN 1 ELSE 2 END AS player_key,
                                history.week_start,
                                history.rating,
                                history.rating_deviation,
                                history.provisional,
                                ROW_NUMBER() OVER (PARTITION BY history.player_id ORDER BY history.week_start DESC) AS latest_rank
                            FROM player_rating_weekly_history history
                            JOIN rating_models model ON model.id = history.model_id
                            WHERE history.player_id IN (${identity1.player_id}::uuid, ${identity2.player_id}::uuid)
                              AND model.key = ${request.query.model}
                        )
                        SELECT
                            latest.player_key,
                            latest.rating AS current_rating,
                            prior.rating AS prior_rating,
                            CASE
                                WHEN latest.rating_deviation <= 80 THEN 'high'
                                WHEN latest.rating_deviation <= 140 THEN 'medium'
                                ELSE 'low'
                            END AS confidence,
                            latest.provisional
                        FROM ranked latest
                        LEFT JOIN LATERAL (
                            SELECT rating FROM ranked candidate
                            WHERE candidate.player_key = latest.player_key
                              AND candidate.week_start <= latest.week_start - INTERVAL '12 weeks'
                            ORDER BY candidate.week_start DESC LIMIT 1
                        ) prior ON true
                        WHERE latest.latest_rank = 1
                    `.execute(db),
                ]);

                const common = commonResult.rows.map((row) => {
                    const p1Played = Number(row.p1_played);
                    const p1Wins = Number(row.p1_wins);
                    const p2Played = Number(row.p2_played);
                    const p2Wins = Number(row.p2_wins);
                    const p1Rate = Number(row.p1_rate);
                    const p2Rate = Number(row.p2_rate);
                    return {
                        opponent_id: row.opponent_id,
                        opponent_name: row.opponent_name,
                        player1: { played: p1Played, wins: p1Wins, losses: p1Played - p1Wins, win_rate: p1Rate },
                        player2: { played: p2Played, wins: p2Wins, losses: p2Played - p2Wins, win_rate: p2Rate },
                        edge: Number(row.edge),
                    };
                });

                const buildForm = (key: number) => {
                    const results = formResult.rows.filter((row) => Number(row.player_key) === key).map((row) => row.result);
                    const wins = results.filter((result) => result === 'W').length;
                    return { played: results.length, wins, losses: results.length - wins, win_rate: percentage(wins, results.length), recent_results: results };
                };
                const buildRating = (key: number) => {
                    const row = ratingResult.rows.find((item) => Number(item.player_key) === key);
                    const current = row?.current_rating === null || row?.current_rating === undefined ? null : Math.round(Number(row.current_rating));
                    const prior = row?.prior_rating === null || row?.prior_rating === undefined ? null : Math.round(Number(row.prior_rating));
                    return {
                        current,
                        change_12_weeks: current !== null && prior !== null ? current - prior : null,
                        confidence: row?.confidence ?? null,
                        provisional: row?.provisional ?? null,
                    };
                };

                const summary = commonResult.rows[0];
                const totalCommon = Number(summary?.total_count ?? 0);
                const player1Advantage = Number(summary?.player1_advantage ?? 0);
                const player2Advantage = Number(summary?.player2_advantage ?? 0);
                const even = Number(summary?.even_count ?? 0);
                const aggregateEdge = Number(summary?.aggregate_edge ?? 0);
                const sharedSampleSize = Number(summary?.shared_sample_size ?? 0);
                const form1 = buildForm(1);
                const form2 = buildForm(2);
                const rating1 = buildRating(1);
                const rating2 = buildRating(2);
                const reasons: string[] = [];
                if (totalCommon > 0) reasons.push(`${totalCommon} shared opponents provide indirect matchup evidence.`);
                if (Math.abs(aggregateEdge) >= 5) reasons.push(`${aggregateEdge > 0 ? identity1.player_name : identity2.player_name} has the stronger aggregate record against shared opponents.`);
                if (Math.abs(form1.win_rate - form2.win_rate) >= 10) reasons.push(`${form1.win_rate > form2.win_rate ? identity1.player_name : identity2.player_name} has the stronger recent form.`);
                if (rating1.current !== null && rating2.current !== null) reasons.push(`Current ability ratings differ by ${Math.abs(rating1.current - rating2.current)} points.`);
                if (reasons.length === 0) reasons.push('Available evidence is balanced or limited; treat the prediction cautiously.');
                const sampleSize = sharedSampleSize + form1.played + form2.played;

                return reply.send({
                    players: {
                        player1: { id: identity1.player_id, name: identity1.player_name },
                        player2: { id: identity2.player_id, name: identity2.player_name },
                    },
                    common_opponents: {
                        total: totalCommon,
                        player1_advantage: player1Advantage,
                        player2_advantage: player2Advantage,
                        even,
                        aggregate_edge: aggregateEdge,
                        data: common,
                    },
                    form: { player1: form1, player2: form2 },
                    rating: { player1: rating1, player2: rating2 },
                    evidence: {
                        confidence: evidenceConfidence(sampleSize, totalCommon),
                        sample_size: sampleSize,
                        reasons,
                    },
                });
            },
        );
    };
}
