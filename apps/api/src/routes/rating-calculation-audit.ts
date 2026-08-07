import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { sql, type Kysely } from 'kysely';
import { z } from 'zod';
import type { Database } from '@tt-players/db';
import { DEFAULT_RATING_MODEL_KEY } from '../ratings/domain.js';

const RunSchema = z.object({
    id: z.string().uuid(),
    model_key: z.string(),
    model_version: z.string(),
    started_at: z.string(),
    completed_at: z.string().nullable(),
    source_data_cutoff: z.string().nullable(),
    code_commit_sha: z.string(),
    algorithm_parameters: z.unknown(),
    input_hash: z.string(),
    run_status: z.string(),
    processed_periods: z.number().int(),
    processed_matches: z.number().int(),
    failure_message: z.string().nullable(),
});

const MoverSchema = z.object({
    player_id: z.string().uuid(),
    player_name: z.string(),
    change: z.number(),
    rating_before: z.number(),
    rating_after: z.number(),
    rating_deviation_after: z.number(),
    public_rank_after: z.number().int().nullable(),
});

const ExceptionalResultSchema = z.object({
    match_date: z.string(),
    rubber_id: z.string().uuid(),
    player_id: z.string().uuid(),
    player_name: z.string(),
    opponent_id: z.string().uuid(),
    opponent_name: z.string(),
    result: z.string(),
    game_score: z.string().nullable(),
    expected_win_probability: z.number(),
    surprise: z.number(),
    attributed_rating_delta: z.number(),
});

const LatestRunResponseSchema = z.object({
    run: RunSchema.nullable(),
    summary: z.object({
        included_matches: z.number().int(),
        excluded_matches: z.number().int(),
        players: z.number().int(),
        provisional_players: z.number().int(),
        exclusions_by_reason: z.array(z.object({
            reason: z.string(),
            matches: z.number().int(),
        })),
    }),
    movers: z.object({
        increases: z.array(MoverSchema),
        decreases: z.array(MoverSchema),
    }),
    exceptional_results: z.array(ExceptionalResultSchema),
    backtest: z.object({
        generated_at: z.string(),
        evaluation_start_date: z.string(),
        evaluation_end_date: z.string(),
        evaluated_matches: z.number().int(),
        brier_score: z.number(),
        log_loss: z.number(),
    }).nullable(),
});

const PlayerParamsSchema = z.object({
    playerId: z.string().uuid(),
});

const PlayerEvidenceQuerySchema = z.object({
    model: z.string().min(1).default(DEFAULT_RATING_MODEL_KEY),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

const PlayerEvidenceSchema = z.object({
    rubber_id: z.string().uuid(),
    match_date: z.string(),
    opponent_id: z.string().uuid(),
    opponent_name: z.string(),
    result: z.string(),
    game_score: z.string().nullable(),
    player_rating_before: z.number(),
    player_rating_deviation_before: z.number(),
    opponent_rating_before: z.number(),
    opponent_rating_deviation_before: z.number(),
    expected_win_probability: z.number(),
    actual_score: z.number(),
    surprise: z.number(),
    attributed_rating_delta: z.number(),
    information_contribution: z.number().nullable(),
    rating_after: z.number(),
    rating_deviation_after: z.number(),
    public_rank_after: z.number().int().nullable(),
    provisional_after: z.boolean(),
    period_matches: z.number().int(),
    period_combined_delta: z.number(),
});

const PlayerEvidenceResponseSchema = z.object({
    player_id: z.string().uuid(),
    player_name: z.string(),
    model: z.string(),
    data: z.array(PlayerEvidenceSchema),
});

const ErrorResponseSchema = z.object({
    error: z.string(),
    statusCode: z.number().int(),
});

interface RunRow {
    id: string;
    model_key: string;
    model_version: string;
    started_at: string | Date;
    completed_at: string | Date | null;
    source_data_cutoff: string | Date | null;
    code_commit_sha: string;
    algorithm_parameters: unknown;
    input_hash: string;
    run_status: string;
    processed_periods: number | string;
    processed_matches: number | string;
    failure_message: string | null;
}

interface CountRow {
    count: number | string;
}

interface ExclusionRow {
    reason: string;
    matches: number | string;
}

interface MoverRow {
    player_id: string;
    player_name: string | null;
    change: number | string;
    rating_before: number | string;
    rating_after: number | string;
    rating_deviation_after: number | string;
    public_rank_after: number | string | null;
}

interface ExceptionalRow {
    match_date: string | Date;
    rubber_id: string;
    player_id: string;
    player_name: string | null;
    opponent_id: string;
    opponent_name: string | null;
    result: string;
    game_score: string | null;
    expected_win_probability: number | string;
    surprise: number | string;
    attributed_rating_delta: number | string;
}

interface PlayerRow {
    name: string;
}

interface PlayerEvidenceRow {
    rubber_id: string;
    match_date: string | Date;
    opponent_id: string;
    opponent_name: string | null;
    result: string;
    game_score: string | null;
    player_rating_before: number | string;
    player_rating_deviation_before: number | string;
    opponent_rating_before: number | string;
    opponent_rating_deviation_before: number | string;
    expected_win_probability: number | string;
    actual_score: number | string;
    surprise: number | string;
    attributed_rating_delta: number | string;
    information_contribution: number | string | null;
    rating_after: number | string;
    rating_deviation_after: number | string;
    public_rank_after: number | string | null;
    provisional_after: boolean;
    period_matches: number | string;
    period_combined_delta: number | string;
}

function toIsoTimestamp(value: string | Date): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toDateString(value: string | Date | null): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return value.slice(0, 10);
}

function toMover(row: MoverRow) {
    return {
        player_id: row.player_id,
        player_name: row.player_name ?? 'Unknown player',
        change: Number(row.change),
        rating_before: Number(row.rating_before),
        rating_after: Number(row.rating_after),
        rating_deviation_after: Number(row.rating_deviation_after),
        public_rank_after: row.public_rank_after === null ? null : Number(row.public_rank_after),
    };
}

export function ratingCalculationAuditRoutes(db: Kysely<Database>): FastifyPluginAsync {
    return async function (fastify) {
        const app = fastify.withTypeProvider<ZodTypeProvider>();

        app.get('/audit/calculation-runs/latest', {
            schema: {
                querystring: z.object({
                    model: z.string().min(1).default(DEFAULT_RATING_MODEL_KEY),
                }),
                response: { 200: LatestRunResponseSchema },
            },
        }, async (request, reply) => {
            const { model } = request.query;
            const runResult = await sql<RunRow>`
                SELECT
                    id,
                    model_key,
                    model_version,
                    started_at,
                    completed_at,
                    source_data_cutoff,
                    code_commit_sha,
                    algorithm_parameters,
                    input_hash,
                    run_status,
                    processed_periods,
                    processed_matches,
                    failure_message
                FROM rating_calculation_runs
                WHERE model_key = ${model}
                ORDER BY started_at DESC, id DESC
                LIMIT 1
            `.execute(db);
            const run = runResult.rows[0];

            if (!run) {
                return reply.send({
                    run: null,
                    summary: {
                        included_matches: 0,
                        excluded_matches: 0,
                        players: 0,
                        provisional_players: 0,
                        exclusions_by_reason: [],
                    },
                    movers: { increases: [], decreases: [] },
                    exceptional_results: [],
                    backtest: null,
                });
            }

            const [includedResult, excludedResult, playerResult, provisionalResult, exclusionsResult, moversResult, exceptionalResult] = await Promise.all([
                sql<CountRow>`
                    SELECT COUNT(DISTINCT rubber_id)::int AS count
                    FROM rating_match_audits
                    WHERE run_id = ${run.id}::uuid AND included = true
                `.execute(db),
                sql<CountRow>`
                    SELECT COUNT(DISTINCT rubber_id)::int AS count
                    FROM rating_match_audits
                    WHERE run_id = ${run.id}::uuid AND included = false
                `.execute(db),
                sql<CountRow>`
                    SELECT COUNT(DISTINCT player_id)::int AS count
                    FROM rating_period_audits
                    WHERE run_id = ${run.id}::uuid
                `.execute(db),
                sql<CountRow>`
                    WITH latest_player_period AS (
                        SELECT DISTINCT ON (player_id)
                            player_id,
                            provisional_after
                        FROM rating_period_audits
                        WHERE run_id = ${run.id}::uuid
                        ORDER BY player_id, rating_date DESC, created_at DESC
                    )
                    SELECT COUNT(*)::int AS count
                    FROM latest_player_period
                    WHERE provisional_after = true
                `.execute(db),
                sql<ExclusionRow>`
                    SELECT
                        COALESCE(exclusion_reason, 'unknown') AS reason,
                        COUNT(DISTINCT rubber_id)::int AS matches
                    FROM rating_match_audits
                    WHERE run_id = ${run.id}::uuid AND included = false
                    GROUP BY COALESCE(exclusion_reason, 'unknown')
                    ORDER BY matches DESC, reason
                `.execute(db),
                sql<MoverRow>`
                    WITH ordered_periods AS (
                        SELECT
                            period.*,
                            ROW_NUMBER() OVER (
                                PARTITION BY player_id
                                ORDER BY rating_date ASC, created_at ASC, id ASC
                            ) AS first_row,
                            ROW_NUMBER() OVER (
                                PARTITION BY player_id
                                ORDER BY rating_date DESC, created_at DESC, id DESC
                            ) AS last_row
                        FROM rating_period_audits period
                        WHERE run_id = ${run.id}::uuid
                    ), aggregated AS (
                        SELECT
                            player_id,
                            SUM(combined_rating_delta) AS change,
                            MAX(rating_before) FILTER (WHERE first_row = 1) AS rating_before,
                            MAX(rating_after) FILTER (WHERE last_row = 1) AS rating_after,
                            MAX(rating_deviation_after) FILTER (WHERE last_row = 1) AS rating_deviation_after,
                            MAX(public_rank_after) FILTER (WHERE last_row = 1) AS public_rank_after
                        FROM ordered_periods
                        GROUP BY player_id
                    )
                    SELECT
                        aggregated.player_id,
                        player.name AS player_name,
                        aggregated.change,
                        aggregated.rating_before,
                        aggregated.rating_after,
                        aggregated.rating_deviation_after,
                        aggregated.public_rank_after
                    FROM aggregated
                    LEFT JOIN external_players player ON player.id = aggregated.player_id
                `.execute(db),
                sql<ExceptionalRow>`
                    SELECT
                        audit.rating_date AS match_date,
                        audit.rubber_id,
                        audit.player_id,
                        player.name AS player_name,
                        audit.opponent_id,
                        opponent.name AS opponent_name,
                        audit.result,
                        audit.game_score,
                        audit.expected_win_probability,
                        audit.surprise_value AS surprise,
                        audit.attributed_rating_delta
                    FROM rating_match_audits audit
                    LEFT JOIN external_players player ON player.id = audit.player_id
                    LEFT JOIN external_players opponent ON opponent.id = audit.opponent_id
                    WHERE audit.run_id = ${run.id}::uuid
                      AND audit.included = true
                      AND audit.actual_score = 1
                      AND audit.player_id IS NOT NULL
                      AND audit.opponent_id IS NOT NULL
                      AND audit.rating_date IS NOT NULL
                      AND audit.result IS NOT NULL
                      AND audit.expected_win_probability IS NOT NULL
                      AND audit.surprise_value IS NOT NULL
                      AND audit.attributed_rating_delta IS NOT NULL
                    ORDER BY audit.surprise_value DESC, ABS(audit.attributed_rating_delta) DESC, audit.rubber_id
                    LIMIT 5
                `.execute(db),
            ]);

            const sortedMovers = moversResult.rows.slice().sort((left, right) => Number(right.change) - Number(left.change));
            const increases = sortedMovers.filter((row) => Number(row.change) > 0).slice(0, 5).map(toMover);
            const decreases = sortedMovers.filter((row) => Number(row.change) < 0).slice(-5).reverse().map(toMover);

            return reply.send({
                run: {
                    id: run.id,
                    model_key: run.model_key,
                    model_version: run.model_version,
                    started_at: toIsoTimestamp(run.started_at),
                    completed_at: run.completed_at ? toIsoTimestamp(run.completed_at) : null,
                    source_data_cutoff: toDateString(run.source_data_cutoff),
                    code_commit_sha: run.code_commit_sha,
                    algorithm_parameters: run.algorithm_parameters,
                    input_hash: run.input_hash,
                    run_status: run.run_status,
                    processed_periods: Number(run.processed_periods),
                    processed_matches: Number(run.processed_matches),
                    failure_message: run.failure_message,
                },
                summary: {
                    included_matches: Number(includedResult.rows[0]?.count ?? 0),
                    excluded_matches: Number(excludedResult.rows[0]?.count ?? 0),
                    players: Number(playerResult.rows[0]?.count ?? 0),
                    provisional_players: Number(provisionalResult.rows[0]?.count ?? 0),
                    exclusions_by_reason: exclusionsResult.rows.map((row) => ({
                        reason: row.reason,
                        matches: Number(row.matches),
                    })),
                },
                movers: { increases, decreases },
                exceptional_results: exceptionalResult.rows.map((row) => ({
                    match_date: toDateString(row.match_date)!,
                    rubber_id: row.rubber_id,
                    player_id: row.player_id,
                    player_name: row.player_name ?? 'Unknown player',
                    opponent_id: row.opponent_id,
                    opponent_name: row.opponent_name ?? 'Unknown player',
                    result: row.result,
                    game_score: row.game_score,
                    expected_win_probability: Number(row.expected_win_probability),
                    surprise: Number(row.surprise),
                    attributed_rating_delta: Number(row.attributed_rating_delta),
                })),
                // Current backtests are generated as workflow artifacts, not persisted against a run.
                // Phase 3 can populate this field when candidate-model metrics become durable data.
                backtest: null,
            });
        });

        app.get('/:playerId/audit-evidence', {
            schema: {
                params: PlayerParamsSchema,
                querystring: PlayerEvidenceQuerySchema,
                response: {
                    200: PlayerEvidenceResponseSchema,
                    404: ErrorResponseSchema,
                },
            },
        }, async (request, reply) => {
            const { playerId } = request.params;
            const { model, limit } = request.query;
            const playerResult = await sql<PlayerRow>`
                SELECT name
                FROM external_players
                WHERE id = ${playerId}::uuid
                LIMIT 1
            `.execute(db);
            const player = playerResult.rows[0];
            if (!player) {
                return reply.code(404).send({
                    error: 'Player not found',
                    statusCode: 404,
                });
            }

            const evidenceResult = await sql<PlayerEvidenceRow>`
                WITH latest_match_evidence AS (
                    SELECT DISTINCT ON (audit.rubber_id, audit.player_id)
                        audit.*
                    FROM rating_match_audits audit
                    JOIN rating_calculation_runs run ON run.id = audit.run_id
                    WHERE audit.player_id = ${playerId}::uuid
                      AND audit.included = true
                      AND run.model_key = ${model}
                      AND run.run_status IN ('complete', 'partial')
                    ORDER BY
                        audit.rubber_id,
                        audit.player_id,
                        COALESCE(run.completed_at, run.started_at) DESC,
                        run.started_at DESC,
                        audit.created_at DESC
                )
                SELECT
                    evidence.rubber_id,
                    evidence.rating_date AS match_date,
                    evidence.opponent_id,
                    opponent.name AS opponent_name,
                    evidence.result,
                    evidence.game_score,
                    evidence.player_rating_before,
                    evidence.player_rating_deviation_before,
                    evidence.opponent_rating_before,
                    evidence.opponent_rating_deviation_before,
                    evidence.expected_win_probability,
                    evidence.actual_score,
                    evidence.surprise_value AS surprise,
                    evidence.attributed_rating_delta,
                    evidence.information_contribution,
                    period.rating_after,
                    period.rating_deviation_after,
                    period.public_rank_after,
                    period.provisional_after,
                    period.rated_matches_in_period AS period_matches,
                    period.combined_rating_delta AS period_combined_delta
                FROM latest_match_evidence evidence
                JOIN rating_period_audits period ON period.id = evidence.period_audit_id
                LEFT JOIN external_players opponent ON opponent.id = evidence.opponent_id
                WHERE evidence.rating_date IS NOT NULL
                  AND evidence.opponent_id IS NOT NULL
                  AND evidence.result IS NOT NULL
                  AND evidence.player_rating_before IS NOT NULL
                  AND evidence.player_rating_deviation_before IS NOT NULL
                  AND evidence.opponent_rating_before IS NOT NULL
                  AND evidence.opponent_rating_deviation_before IS NOT NULL
                  AND evidence.expected_win_probability IS NOT NULL
                  AND evidence.actual_score IS NOT NULL
                  AND evidence.surprise_value IS NOT NULL
                  AND evidence.attributed_rating_delta IS NOT NULL
                ORDER BY evidence.rating_date DESC, evidence.rubber_id
                LIMIT ${limit}
            `.execute(db);

            return reply.send({
                player_id: playerId,
                player_name: player.name,
                model,
                data: evidenceResult.rows.map((row) => ({
                    rubber_id: row.rubber_id,
                    match_date: toDateString(row.match_date)!,
                    opponent_id: row.opponent_id,
                    opponent_name: row.opponent_name ?? 'Unknown player',
                    result: row.result,
                    game_score: row.game_score,
                    player_rating_before: Number(row.player_rating_before),
                    player_rating_deviation_before: Number(row.player_rating_deviation_before),
                    opponent_rating_before: Number(row.opponent_rating_before),
                    opponent_rating_deviation_before: Number(row.opponent_rating_deviation_before),
                    expected_win_probability: Number(row.expected_win_probability),
                    actual_score: Number(row.actual_score),
                    surprise: Number(row.surprise),
                    attributed_rating_delta: Number(row.attributed_rating_delta),
                    information_contribution: row.information_contribution === null
                        ? null
                        : Number(row.information_contribution),
                    rating_after: Number(row.rating_after),
                    rating_deviation_after: Number(row.rating_deviation_after),
                    public_rank_after: row.public_rank_after === null ? null : Number(row.public_rank_after),
                    provisional_after: row.provisional_after,
                    period_matches: Number(row.period_matches),
                    period_combined_delta: Number(row.period_combined_delta),
                })),
            });
        });
    };
}
