import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { sql, type Kysely } from 'kysely';
import { z } from 'zod';
import type { Database } from '@tt-players/db';
import { DEFAULT_RATING_MODEL_KEY } from '../ratings/domain.js';

const MAX_HIGHLIGHT_RATING_DEVIATION = 200;

const QuerySchema = z.object({
    model: z.string().min(1).default(DEFAULT_RATING_MODEL_KEY),
    limit: z.coerce.number().int().min(1).max(50).default(5),
});

const RunSchema = z.object({
    id: z.string().uuid(),
    completed_at: z.string().nullable(),
    source_data_cutoff: z.string().nullable(),
});

const RatingJumpSchema = z.object({
    player_id: z.string().uuid(),
    player_name: z.string(),
    change: z.number(),
    rating_before: z.number(),
    rating_after: z.number(),
    rating_deviation_after: z.number(),
    public_rank_after: z.number().int().nullable(),
});

const SurpriseWinSchema = z.object({
    match_date: z.string(),
    rubber_id: z.string().uuid(),
    player_id: z.string().uuid(),
    player_name: z.string(),
    opponent_id: z.string().uuid(),
    opponent_name: z.string(),
    game_score: z.string().nullable(),
    expected_win_probability: z.number(),
    surprise: z.number(),
    attributed_rating_delta: z.number(),
});

const ResponseSchema = z.object({
    run: RunSchema.nullable(),
    rating_jumps: z.array(RatingJumpSchema),
    surprise_wins: z.array(SurpriseWinSchema),
});

interface RunRow {
    id: string;
    completed_at: string | Date | null;
    source_data_cutoff: string | Date | null;
}

interface RatingJumpRow {
    player_id: string;
    player_name: string | null;
    change: number | string;
    rating_before: number | string;
    rating_after: number | string;
    rating_deviation_after: number | string;
    public_rank_after: number | string | null;
}

interface SurpriseWinRow {
    match_date: string | Date;
    rubber_id: string;
    player_id: string;
    player_name: string | null;
    opponent_id: string;
    opponent_name: string | null;
    game_score: string | null;
    expected_win_probability: number | string;
    surprise: number | string;
    attributed_rating_delta: number | string;
}

function toIsoTimestamp(value: string | Date): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toDateString(value: string | Date | null): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return value.slice(0, 10);
}

export function ratingHighlightsRoutes(db: Kysely<Database>): FastifyPluginAsync {
    return async function (fastify) {
        const app = fastify.withTypeProvider<ZodTypeProvider>();

        app.get('/highlights', {
            schema: {
                querystring: QuerySchema,
                response: { 200: ResponseSchema },
            },
        }, async (request, reply) => {
            const { model, limit } = request.query;
            const runResult = await sql<RunRow>`
                SELECT id, completed_at, source_data_cutoff
                FROM rating_calculation_runs
                WHERE model_key = ${model}
                  AND run_status = 'complete'
                ORDER BY completed_at DESC NULLS LAST, started_at DESC, id DESC
                LIMIT 1
            `.execute(db);
            const run = runResult.rows[0];

            if (!run) {
                return reply.send({
                    run: null,
                    rating_jumps: [],
                    surprise_wins: [],
                });
            }

            const [jumpsResult, surprisesResult] = await Promise.all([
                sql<RatingJumpRow>`
                    WITH changes AS (
                        SELECT
                            player_id,
                            SUM(combined_rating_delta) AS change
                        FROM rating_period_audits
                        WHERE run_id = ${run.id}::uuid
                        GROUP BY player_id
                    ), first_period AS (
                        SELECT DISTINCT ON (player_id)
                            player_id,
                            rating_before
                        FROM rating_period_audits
                        WHERE run_id = ${run.id}::uuid
                        ORDER BY player_id, rating_date ASC, created_at ASC, id ASC
                    ), last_period AS (
                        SELECT DISTINCT ON (player_id)
                            player_id,
                            rating_after,
                            rating_deviation_after,
                            public_rank_after,
                            provisional_after
                        FROM rating_period_audits
                        WHERE run_id = ${run.id}::uuid
                        ORDER BY player_id, rating_date DESC, created_at DESC, id DESC
                    )
                    SELECT
                        changes.player_id,
                        player.name AS player_name,
                        changes.change,
                        first_period.rating_before,
                        last_period.rating_after,
                        last_period.rating_deviation_after,
                        last_period.public_rank_after
                    FROM changes
                    JOIN first_period ON first_period.player_id = changes.player_id
                    JOIN last_period ON last_period.player_id = changes.player_id
                    LEFT JOIN external_players player ON player.id = changes.player_id
                    WHERE changes.change > 0
                      AND last_period.provisional_after = false
                      AND last_period.rating_deviation_after <= ${MAX_HIGHLIGHT_RATING_DEVIATION}
                      AND ABS(first_period.rating_before - 1500) >= 1
                    ORDER BY changes.change DESC, last_period.rating_after DESC, player.name ASC
                    LIMIT ${limit}
                `.execute(db),
                sql<SurpriseWinRow>`
                    SELECT
                        audit.rating_date AS match_date,
                        audit.rubber_id,
                        audit.player_id,
                        player.name AS player_name,
                        audit.opponent_id,
                        opponent.name AS opponent_name,
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
                      AND audit.expected_win_probability IS NOT NULL
                      AND audit.surprise_value IS NOT NULL
                      AND audit.attributed_rating_delta IS NOT NULL
                    ORDER BY audit.surprise_value DESC, ABS(audit.attributed_rating_delta) DESC, audit.rubber_id
                    LIMIT ${limit}
                `.execute(db),
            ]);

            return reply.send({
                run: {
                    id: run.id,
                    completed_at: run.completed_at ? toIsoTimestamp(run.completed_at) : null,
                    source_data_cutoff: toDateString(run.source_data_cutoff),
                },
                rating_jumps: jumpsResult.rows.map((row) => ({
                    player_id: row.player_id,
                    player_name: row.player_name ?? 'Unknown player',
                    change: Number(row.change),
                    rating_before: Number(row.rating_before),
                    rating_after: Number(row.rating_after),
                    rating_deviation_after: Number(row.rating_deviation_after),
                    public_rank_after: row.public_rank_after === null ? null : Number(row.public_rank_after),
                })),
                surprise_wins: surprisesResult.rows.map((row) => ({
                    match_date: toDateString(row.match_date)!,
                    rubber_id: row.rubber_id,
                    player_id: row.player_id,
                    player_name: row.player_name ?? 'Unknown player',
                    opponent_id: row.opponent_id,
                    opponent_name: row.opponent_name ?? 'Unknown player',
                    game_score: row.game_score,
                    expected_win_probability: Number(row.expected_win_probability),
                    surprise: Number(row.surprise),
                    attributed_rating_delta: Number(row.attributed_rating_delta),
                })),
            });
        });
    };
}
