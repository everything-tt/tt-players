import { sql, type Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import { DEFAULT_RATING_MODEL_KEY } from './domain.js';

interface ModelRow {
    id: string;
}

interface CountRow {
    count: number | string;
}

const PLAYER_ISSUE_TYPES = [
    'eligible_in_window_without_rating',
    'rating_without_eligible_evidence',
    'only_invalid_singles',
    'high_opponent_count',
    'same_day_cross_platform_activity',
] as const;

export async function refreshRatingPlayerCoverage(
    db: Kysely<Database>,
    generatedAt: Date,
    modelKey = DEFAULT_RATING_MODEL_KEY,
): Promise<number> {
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
            DELETE FROM rating_player_coverage
            WHERE model_id = ${model.id}::uuid
        `.execute(trx);

        await sql`
            INSERT INTO rating_player_coverage (
                model_id,
                player_id,
                category,
                raw_matches,
                singles_matches,
                normal_singles_matches,
                eligible_matches_all_time,
                eligible_matches_in_window,
                unique_opponents_in_window,
                first_match_date,
                last_match_date,
                rating_exists,
                rated_matches,
                rating_deviation,
                updated_at
            )
            WITH selected_model AS (
                SELECT
                    rating_model.id,
                    COALESCE(
                        rating_model.window_start_date,
                        (
                            SELECT MIN(rating.first_rated_at)
                            FROM player_ratings rating
                            WHERE rating.model_id = rating_model.id
                        ),
                        '-infinity'::date
                    ) AS window_start_date
                FROM rating_models rating_model
                WHERE rating_model.id = ${model.id}::uuid
            ),
            canonical_players AS MATERIALIZED (
                SELECT player.id, player.name
                FROM external_players player
                WHERE player.deleted_at IS NULL
                  AND COALESCE(player.canonical_player_id, player.id) = player.id
            ),
            match_sides AS MATERIALIZED (
                SELECT
                    classification.rubber_id,
                    classification.home_canonical_player_id AS player_id,
                    classification.away_canonical_player_id AS opponent_id,
                    classification.effective_date,
                    classification.is_doubles,
                    classification.outcome_type,
                    classification.eligibility_reason
                FROM rating_rubber_classification classification
                WHERE classification.home_canonical_player_id IS NOT NULL

                UNION ALL

                SELECT
                    classification.rubber_id,
                    classification.away_canonical_player_id AS player_id,
                    classification.home_canonical_player_id AS opponent_id,
                    classification.effective_date,
                    classification.is_doubles,
                    classification.outcome_type,
                    classification.eligibility_reason
                FROM rating_rubber_classification classification
                WHERE classification.away_canonical_player_id IS NOT NULL
            ),
            player_stats AS MATERIALIZED (
                SELECT
                    side.player_id,
                    COUNT(DISTINCT side.rubber_id)::int AS raw_matches,
                    COUNT(DISTINCT side.rubber_id) FILTER (
                        WHERE side.is_doubles = false
                    )::int AS singles_matches,
                    COUNT(DISTINCT side.rubber_id) FILTER (
                        WHERE side.is_doubles = false
                          AND side.outcome_type = 'normal'
                    )::int AS normal_singles_matches,
                    COUNT(DISTINCT side.rubber_id) FILTER (
                        WHERE side.eligibility_reason = 'eligible'
                    )::int AS eligible_matches_all_time,
                    COUNT(DISTINCT side.rubber_id) FILTER (
                        WHERE side.eligibility_reason = 'eligible'
                          AND side.effective_date >= selected_model.window_start_date
                    )::int AS eligible_matches_in_window,
                    COUNT(DISTINCT side.opponent_id) FILTER (
                        WHERE side.eligibility_reason = 'eligible'
                          AND side.effective_date >= selected_model.window_start_date
                          AND side.opponent_id IS NOT NULL
                    )::int AS unique_opponents_in_window,
                    MIN(side.effective_date) AS first_match_date,
                    MAX(side.effective_date) AS last_match_date
                FROM match_sides side
                CROSS JOIN selected_model
                GROUP BY side.player_id
            )
            SELECT
                selected_model.id,
                player.id,
                CASE
                    WHEN rating.player_id IS NOT NULL
                      AND COALESCE(stats.eligible_matches_in_window, 0) = 0
                        THEN 'rating_without_eligible_evidence'
                    WHEN COALESCE(stats.eligible_matches_in_window, 0) > 0
                      AND rating.player_id IS NULL
                        THEN 'eligible_in_window_without_rating'
                    WHEN COALESCE(stats.raw_matches, 0) = 0
                        THEN 'no_raw_matches'
                    WHEN COALESCE(stats.singles_matches, 0) = 0
                        THEN 'only_doubles'
                    WHEN COALESCE(stats.normal_singles_matches, 0) = 0
                        THEN 'only_non_normal'
                    WHEN COALESCE(stats.eligible_matches_all_time, 0) = 0
                        THEN 'only_invalid_singles'
                    WHEN COALESCE(stats.eligible_matches_in_window, 0) = 0
                        THEN 'only_before_model_window'
                    ELSE 'covered'
                END,
                COALESCE(stats.raw_matches, 0),
                COALESCE(stats.singles_matches, 0),
                COALESCE(stats.normal_singles_matches, 0),
                COALESCE(stats.eligible_matches_all_time, 0),
                COALESCE(stats.eligible_matches_in_window, 0),
                COALESCE(stats.unique_opponents_in_window, 0),
                stats.first_match_date,
                stats.last_match_date,
                rating.player_id IS NOT NULL,
                rating.rated_matches,
                rating.rating_deviation,
                ${generatedAt}
            FROM canonical_players player
            CROSS JOIN selected_model
            LEFT JOIN player_stats stats ON stats.player_id = player.id
            LEFT JOIN player_ratings rating
              ON rating.model_id = selected_model.id
             AND rating.player_id = player.id
        `.execute(trx);

        await sql`
            UPDATE rating_audit_issues
            SET resolved_at = ${generatedAt},
                snapshot_generated_at = ${generatedAt}
            WHERE model_id = ${model.id}::uuid
              AND entity_type = 'player'
              AND issue_type = ANY(${PLAYER_ISSUE_TYPES}::text[])
              AND resolved_at IS NULL
        `.execute(trx);

        await sql`
            INSERT INTO rating_audit_issues (
                model_id,
                issue_type,
                severity,
                entity_type,
                entity_id,
                match_date,
                details,
                snapshot_generated_at,
                first_seen_at,
                last_seen_at,
                resolved_at
            )
            SELECT
                coverage.model_id,
                coverage.category,
                CASE
                    WHEN coverage.category IN (
                        'eligible_in_window_without_rating',
                        'rating_without_eligible_evidence'
                    ) THEN 'critical'
                    ELSE 'warning'
                END,
                'player',
                coverage.player_id,
                coverage.last_match_date,
                jsonb_build_object(
                    'raw_matches', coverage.raw_matches,
                    'singles_matches', coverage.singles_matches,
                    'normal_singles_matches', coverage.normal_singles_matches,
                    'eligible_matches_all_time', coverage.eligible_matches_all_time,
                    'eligible_matches_in_window', coverage.eligible_matches_in_window,
                    'unique_opponents_in_window', coverage.unique_opponents_in_window,
                    'first_match_date', coverage.first_match_date,
                    'last_match_date', coverage.last_match_date,
                    'rating_exists', coverage.rating_exists,
                    'rated_matches', coverage.rated_matches,
                    'rating_deviation', coverage.rating_deviation
                ),
                ${generatedAt},
                ${generatedAt},
                ${generatedAt},
                NULL
            FROM rating_player_coverage coverage
            WHERE coverage.model_id = ${model.id}::uuid
              AND coverage.category IN (
                  'eligible_in_window_without_rating',
                  'rating_without_eligible_evidence',
                  'only_invalid_singles'
              )
            ON CONFLICT (model_id, issue_type, entity_type, entity_id) DO UPDATE SET
                severity = EXCLUDED.severity,
                match_date = EXCLUDED.match_date,
                details = EXCLUDED.details,
                snapshot_generated_at = EXCLUDED.snapshot_generated_at,
                last_seen_at = EXCLUDED.last_seen_at,
                resolved_at = NULL
        `.execute(trx);

        await sql`
            INSERT INTO rating_audit_issues (
                model_id,
                issue_type,
                severity,
                entity_type,
                entity_id,
                match_date,
                details,
                snapshot_generated_at,
                first_seen_at,
                last_seen_at,
                resolved_at
            )
            SELECT
                coverage.model_id,
                'high_opponent_count',
                'info',
                'player',
                coverage.player_id,
                coverage.last_match_date,
                jsonb_build_object(
                    'unique_opponents_in_window', coverage.unique_opponents_in_window,
                    'eligible_matches_in_window', coverage.eligible_matches_in_window,
                    'last_match_date', coverage.last_match_date
                ),
                ${generatedAt},
                ${generatedAt},
                ${generatedAt},
                NULL
            FROM rating_player_coverage coverage
            WHERE coverage.model_id = ${model.id}::uuid
              AND coverage.eligible_matches_in_window > 0
            ORDER BY coverage.unique_opponents_in_window DESC, coverage.player_id
            LIMIT 20
            ON CONFLICT (model_id, issue_type, entity_type, entity_id) DO UPDATE SET
                severity = EXCLUDED.severity,
                match_date = EXCLUDED.match_date,
                details = EXCLUDED.details,
                snapshot_generated_at = EXCLUDED.snapshot_generated_at,
                last_seen_at = EXCLUDED.last_seen_at,
                resolved_at = NULL
        `.execute(trx);

        await sql`
            INSERT INTO rating_audit_issues (
                model_id,
                issue_type,
                severity,
                entity_type,
                entity_id,
                match_date,
                details,
                snapshot_generated_at,
                first_seen_at,
                last_seen_at,
                resolved_at
            )
            WITH match_sides AS MATERIALIZED (
                SELECT
                    classification.home_canonical_player_id AS player_id,
                    classification.effective_date,
                    classification.platform_id,
                    classification.competition_id
                FROM rating_rubber_classification classification
                WHERE classification.home_canonical_player_id IS NOT NULL
                  AND classification.effective_date IS NOT NULL
                  AND classification.platform_id IS NOT NULL

                UNION ALL

                SELECT
                    classification.away_canonical_player_id AS player_id,
                    classification.effective_date,
                    classification.platform_id,
                    classification.competition_id
                FROM rating_rubber_classification classification
                WHERE classification.away_canonical_player_id IS NOT NULL
                  AND classification.effective_date IS NOT NULL
                  AND classification.platform_id IS NOT NULL
            ),
            overlap_days AS (
                SELECT
                    side.player_id,
                    side.effective_date,
                    COUNT(DISTINCT side.platform_id)::int AS platform_count,
                    COUNT(DISTINCT side.competition_id)::int AS competition_count
                FROM match_sides side
                GROUP BY side.player_id, side.effective_date
                HAVING COUNT(DISTINCT side.platform_id) > 1
            ),
            player_overlaps AS (
                SELECT
                    overlap.player_id,
                    COUNT(*)::int AS affected_days,
                    MAX(overlap.effective_date) AS latest_date,
                    MAX(overlap.platform_count)::int AS maximum_platforms,
                    MAX(overlap.competition_count)::int AS maximum_competitions
                FROM overlap_days overlap
                GROUP BY overlap.player_id
            )
            SELECT
                ${model.id}::uuid,
                'same_day_cross_platform_activity',
                'warning',
                'player',
                overlap.player_id,
                overlap.latest_date,
                jsonb_build_object(
                    'affected_days', overlap.affected_days,
                    'latest_date', overlap.latest_date,
                    'maximum_platforms', overlap.maximum_platforms,
                    'maximum_competitions', overlap.maximum_competitions
                ),
                ${generatedAt},
                ${generatedAt},
                ${generatedAt},
                NULL
            FROM player_overlaps overlap
            ON CONFLICT (model_id, issue_type, entity_type, entity_id) DO UPDATE SET
                severity = EXCLUDED.severity,
                match_date = EXCLUDED.match_date,
                details = EXCLUDED.details,
                snapshot_generated_at = EXCLUDED.snapshot_generated_at,
                last_seen_at = EXCLUDED.last_seen_at,
                resolved_at = NULL
        `.execute(trx);

        const countResult = await sql<CountRow>`
            SELECT COUNT(*)::int AS count
            FROM rating_audit_issues
            WHERE model_id = ${model.id}::uuid
              AND resolved_at IS NULL
        `.execute(trx);

        return Number(countResult.rows[0]?.count ?? 0);
    });
}
