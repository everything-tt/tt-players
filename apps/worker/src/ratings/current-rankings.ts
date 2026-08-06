import { sql, type Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import { DEFAULT_RATING_MODEL_KEY } from './domain.js';

interface ModelRow {
    id: string;
}

interface CountRow {
    total: number | string;
    ranked: number | string;
}

export interface CurrentRankingRefreshResult {
    modelKey: string;
    calculatedAt: Date;
    totalPlayers: number;
    rankedPlayers: number;
}

export async function refreshCurrentRankings(
    db: Kysely<Database>,
    modelKey = DEFAULT_RATING_MODEL_KEY,
    calculatedAt = new Date(),
): Promise<CurrentRankingRefreshResult> {
    const modelResult = await sql<ModelRow>`
        SELECT id
        FROM rating_models
        WHERE key = ${modelKey}
        LIMIT 1
    `.execute(db);
    const model = modelResult.rows[0];
    if (!model) throw new Error(`Unknown rating model: ${modelKey}`);

    return db.transaction().execute(async (trx) => {
        await sql`
            INSERT INTO rating_ranking_policies (model_id)
            VALUES (${model.id}::uuid)
            ON CONFLICT (model_id) DO NOTHING
        `.execute(trx);

        await sql`
            DELETE FROM rating_current_rankings
            WHERE model_id = ${model.id}::uuid
        `.execute(trx);

        await sql`
            INSERT INTO rating_current_rankings (
                model_id,
                player_id,
                effective_deviation,
                effective_conservative_rating,
                days_inactive,
                unique_opponents,
                eligible,
                eligibility_reason,
                current_rank,
                historical_rank,
                calculated_at
            )
            WITH settings AS (
                SELECT
                    rating_model.id AS model_id,
                    COALESCE((rating_model.config ->> 'initialDeviation')::double precision, 350) AS initial_deviation,
                    COALESCE((rating_model.config ->> 'ratingScale')::double precision, 173.7178) AS rating_scale,
                    COALESCE((rating_model.config ->> 'conservativeDeviationMultiplier')::double precision, 2) AS deviation_multiplier,
                    policy.active_days,
                    policy.minimum_matches,
                    policy.minimum_unique_opponents,
                    policy.maximum_deviation
                FROM rating_models rating_model
                JOIN rating_ranking_policies policy ON policy.model_id = rating_model.id
                WHERE rating_model.id = ${model.id}::uuid
            ),
            evidence AS MATERIALIZED (
                SELECT
                    rating.player_id,
                    rating.rating,
                    rating.rating_deviation,
                    rating.volatility,
                    rating.conservative_rating,
                    rating.rated_matches,
                    rating.last_rated_at,
                    COALESCE(coverage.unique_opponents_in_window, 0)::int AS unique_opponents,
                    GREATEST(
                        0,
                        ${calculatedAt}::date - COALESCE(rating.last_rated_at, ${calculatedAt}::date)
                    )::int AS days_inactive,
                    EXISTS (
                        SELECT 1
                        FROM rating_audit_issues issue
                        WHERE issue.model_id = rating.model_id
                          AND issue.entity_type = 'player'
                          AND issue.entity_id = rating.player_id
                          AND issue.severity = 'critical'
                          AND issue.resolved_at IS NULL
                    ) AS has_critical_issue,
                    settings.initial_deviation,
                    settings.rating_scale,
                    settings.deviation_multiplier,
                    settings.active_days,
                    settings.minimum_matches,
                    settings.minimum_unique_opponents,
                    settings.maximum_deviation
                FROM player_ratings rating
                CROSS JOIN settings
                LEFT JOIN rating_player_coverage coverage
                  ON coverage.model_id = rating.model_id
                 AND coverage.player_id = rating.player_id
                JOIN external_players player ON player.id = rating.player_id
                WHERE rating.model_id = settings.model_id
                  AND player.deleted_at IS NULL
            ),
            effective AS MATERIALIZED (
                SELECT
                    evidence.*,
                    LEAST(
                        evidence.initial_deviation,
                        SQRT(
                            POWER(evidence.rating_deviation / evidence.rating_scale, 2)
                            + POWER(evidence.volatility, 2) * evidence.days_inactive
                        ) * evidence.rating_scale
                    ) AS effective_deviation
                FROM evidence
            ),
            classified AS MATERIALIZED (
                SELECT
                    effective.*,
                    effective.rating
                        - effective.deviation_multiplier * effective.effective_deviation
                        AS effective_conservative_rating,
                    CASE
                        WHEN effective.has_critical_issue THEN 'critical_data_issue'
                        WHEN effective.rated_matches < effective.minimum_matches THEN 'insufficient_matches'
                        WHEN effective.unique_opponents < effective.minimum_unique_opponents THEN 'insufficient_opponents'
                        WHEN effective.days_inactive > effective.active_days THEN 'inactive'
                        WHEN effective.effective_deviation > effective.maximum_deviation THEN 'high_uncertainty'
                        ELSE 'ranked'
                    END AS eligibility_reason
                FROM effective
            ),
            ranked AS (
                SELECT
                    classified.*,
                    ROW_NUMBER() OVER (
                        ORDER BY
                            classified.conservative_rating DESC,
                            classified.rated_matches DESC,
                            classified.player_id
                    )::int AS historical_rank,
                    CASE
                        WHEN classified.eligibility_reason = 'ranked' THEN
                            SUM(
                                CASE WHEN classified.eligibility_reason = 'ranked' THEN 1 ELSE 0 END
                            ) OVER (
                                ORDER BY
                                    classified.effective_conservative_rating DESC,
                                    classified.rated_matches DESC,
                                    classified.player_id
                                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                            )::int
                        ELSE NULL
                    END AS current_rank
                FROM classified
            )
            SELECT
                ${model.id}::uuid,
                ranked.player_id,
                ranked.effective_deviation,
                ranked.effective_conservative_rating,
                ranked.days_inactive,
                ranked.unique_opponents,
                ranked.eligibility_reason = 'ranked',
                ranked.eligibility_reason,
                ranked.current_rank,
                ranked.historical_rank,
                ${calculatedAt}
            FROM ranked
        `.execute(trx);

        const countResult = await sql<CountRow>`
            SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE eligible)::int AS ranked
            FROM rating_current_rankings
            WHERE model_id = ${model.id}::uuid
        `.execute(trx);
        const counts = countResult.rows[0];

        return {
            modelKey,
            calculatedAt,
            totalPlayers: Number(counts?.total ?? 0),
            rankedPlayers: Number(counts?.ranked ?? 0),
        };
    });
}
