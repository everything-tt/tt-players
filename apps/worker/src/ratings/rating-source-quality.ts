import { sql, type Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import { DEFAULT_RATING_MODEL_KEY } from './domain.js';

interface ModelRow {
    id: string;
}

interface CountRow {
    count: number | string;
}

const SOURCE_ISSUE_TYPES = [
    'suspicious_old_date',
    'future_match_date',
    'fixture_rubber_date_conflict',
    'exact_duplicate_candidate',
    'conflicting_duplicate_candidate',
] as const;

export async function refreshRatingSourceQuality(
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
        await sql`DELETE FROM rating_duplicate_candidate_groups WHERE model_id = ${model.id}::uuid`.execute(trx);
        await sql`DELETE FROM rating_competition_quality WHERE model_id = ${model.id}::uuid`.execute(trx);
        await sql`DELETE FROM rating_source_quality WHERE model_id = ${model.id}::uuid`.execute(trx);

        await sql`
            INSERT INTO rating_duplicate_candidate_groups (
                model_id,
                competition_id,
                match_date,
                player_a_id,
                player_b_id,
                candidate_type,
                rubber_count,
                rubber_ids,
                source_ids,
                score_signatures,
                updated_at
            )
            WITH normalized AS MATERIALIZED (
                SELECT
                    classification.rubber_id,
                    classification.competition_id,
                    classification.platform_id,
                    classification.effective_date AS match_date,
                    LEAST(
                        classification.home_canonical_player_id,
                        classification.away_canonical_player_id
                    ) AS player_a_id,
                    GREATEST(
                        classification.home_canonical_player_id,
                        classification.away_canonical_player_id
                    ) AS player_b_id,
                    CASE
                        WHEN classification.home_canonical_player_id
                           = LEAST(
                               classification.home_canonical_player_id,
                               classification.away_canonical_player_id
                           )
                        THEN classification.home_games_won::text || ':' || classification.away_games_won::text
                        ELSE classification.away_games_won::text || ':' || classification.home_games_won::text
                    END AS score_signature
                FROM rating_rubber_classification classification
                WHERE classification.eligibility_reason = 'eligible'
                  AND classification.competition_id IS NOT NULL
                  AND classification.effective_date IS NOT NULL
            )
            SELECT
                ${model.id}::uuid,
                normalized.competition_id,
                normalized.match_date,
                normalized.player_a_id,
                normalized.player_b_id,
                CASE
                    WHEN COUNT(DISTINCT normalized.score_signature) > 1
                    THEN 'conflicting_score_candidate'
                    ELSE 'exact_score_candidate'
                END,
                COUNT(*)::int,
                jsonb_agg(normalized.rubber_id ORDER BY normalized.rubber_id),
                COALESCE(
                    jsonb_agg(DISTINCT normalized.platform_id) FILTER (
                        WHERE normalized.platform_id IS NOT NULL
                    ),
                    '[]'::jsonb
                ),
                jsonb_agg(DISTINCT normalized.score_signature),
                ${generatedAt}
            FROM normalized
            GROUP BY
                normalized.competition_id,
                normalized.match_date,
                normalized.player_a_id,
                normalized.player_b_id
            HAVING COUNT(*) > 1
        `.execute(trx);

        await sql`
            INSERT INTO rating_source_quality (
                model_id,
                source_id,
                total_rubbers,
                eligible_rubbers,
                missing_identity_rubbers,
                missing_date_rubbers,
                invalid_single_rubbers,
                suspicious_date_rubbers,
                duplicate_candidate_groups,
                conflicting_candidate_groups,
                first_match_date,
                last_match_date,
                updated_at
            )
            SELECT
                ${model.id}::uuid,
                platform.id,
                COUNT(classification.rubber_id)::int,
                COUNT(classification.rubber_id) FILTER (
                    WHERE classification.eligibility_reason = 'eligible'
                )::int,
                COUNT(classification.rubber_id) FILTER (
                    WHERE classification.eligibility_reason IN (
                        'missing_both_player_ids',
                        'missing_home_player_id',
                        'missing_away_player_id',
                        'missing_both_player_records',
                        'missing_home_player_record',
                        'missing_away_player_record'
                    )
                )::int,
                COUNT(classification.rubber_id) FILTER (
                    WHERE classification.eligibility_reason = 'missing_date'
                )::int,
                COUNT(classification.rubber_id) FILTER (
                    WHERE classification.eligibility_reason NOT IN (
                        'eligible', 'doubles', 'non_normal_outcome'
                    )
                )::int,
                COUNT(classification.rubber_id) FILTER (
                    WHERE classification.effective_date < DATE '1950-01-01'
                       OR classification.effective_date > CURRENT_DATE + 1
                       OR EXTRACT(YEAR FROM classification.effective_date) IN (1900, 1919, 1970)
                )::int,
                (
                    SELECT COUNT(*)::int
                    FROM rating_duplicate_candidate_groups candidate
                    WHERE candidate.model_id = ${model.id}::uuid
                      AND candidate.source_ids ? platform.id::text
                ),
                (
                    SELECT COUNT(*)::int
                    FROM rating_duplicate_candidate_groups candidate
                    WHERE candidate.model_id = ${model.id}::uuid
                      AND candidate.candidate_type = 'conflicting_score_candidate'
                      AND candidate.source_ids ? platform.id::text
                ),
                MIN(classification.effective_date),
                MAX(classification.effective_date),
                ${generatedAt}
            FROM platforms platform
            LEFT JOIN rating_rubber_classification classification
              ON classification.platform_id = platform.id
            GROUP BY platform.id
        `.execute(trx);

        await sql`
            INSERT INTO rating_competition_quality (
                model_id,
                competition_id,
                source_id,
                total_rubbers,
                eligible_rubbers,
                missing_identity_rubbers,
                missing_date_rubbers,
                invalid_single_rubbers,
                suspicious_date_rubbers,
                duplicate_candidate_groups,
                conflicting_candidate_groups,
                first_match_date,
                last_match_date,
                updated_at
            )
            SELECT
                ${model.id}::uuid,
                competition.id,
                MAX(classification.platform_id),
                COUNT(classification.rubber_id)::int,
                COUNT(classification.rubber_id) FILTER (
                    WHERE classification.eligibility_reason = 'eligible'
                )::int,
                COUNT(classification.rubber_id) FILTER (
                    WHERE classification.eligibility_reason IN (
                        'missing_both_player_ids',
                        'missing_home_player_id',
                        'missing_away_player_id',
                        'missing_both_player_records',
                        'missing_home_player_record',
                        'missing_away_player_record'
                    )
                )::int,
                COUNT(classification.rubber_id) FILTER (
                    WHERE classification.eligibility_reason = 'missing_date'
                )::int,
                COUNT(classification.rubber_id) FILTER (
                    WHERE classification.eligibility_reason NOT IN (
                        'eligible', 'doubles', 'non_normal_outcome'
                    )
                )::int,
                COUNT(classification.rubber_id) FILTER (
                    WHERE classification.effective_date < DATE '1950-01-01'
                       OR classification.effective_date > CURRENT_DATE + 1
                       OR EXTRACT(YEAR FROM classification.effective_date) IN (1900, 1919, 1970)
                )::int,
                (
                    SELECT COUNT(*)::int
                    FROM rating_duplicate_candidate_groups candidate
                    WHERE candidate.model_id = ${model.id}::uuid
                      AND candidate.competition_id = competition.id
                ),
                (
                    SELECT COUNT(*)::int
                    FROM rating_duplicate_candidate_groups candidate
                    WHERE candidate.model_id = ${model.id}::uuid
                      AND candidate.competition_id = competition.id
                      AND candidate.candidate_type = 'conflicting_score_candidate'
                ),
                MIN(classification.effective_date),
                MAX(classification.effective_date),
                ${generatedAt}
            FROM competitions competition
            LEFT JOIN rating_rubber_classification classification
              ON classification.competition_id = competition.id
            WHERE competition.deleted_at IS NULL
            GROUP BY competition.id
        `.execute(trx);

        await sql`
            UPDATE rating_audit_issues
            SET resolved_at = ${generatedAt},
                snapshot_generated_at = ${generatedAt}
            WHERE model_id = ${model.id}::uuid
              AND issue_type = ANY(${SOURCE_ISSUE_TYPES}::text[])
              AND resolved_at IS NULL
        `.execute(trx);

        await sql`
            INSERT INTO rating_audit_issues (
                model_id,
                issue_type,
                severity,
                entity_type,
                entity_id,
                source_id,
                competition_id,
                match_date,
                details,
                snapshot_generated_at,
                first_seen_at,
                last_seen_at,
                resolved_at
            )
            SELECT
                ${model.id}::uuid,
                CASE
                    WHEN classification.effective_date > CURRENT_DATE + 1 THEN 'future_match_date'
                    ELSE 'suspicious_old_date'
                END,
                CASE
                    WHEN classification.effective_date > CURRENT_DATE + 1 THEN 'critical'
                    ELSE 'warning'
                END,
                'rubber',
                classification.rubber_id,
                classification.platform_id,
                classification.competition_id,
                classification.effective_date,
                jsonb_build_object(
                    'fixture_id', classification.fixture_id,
                    'effective_date', classification.effective_date,
                    'eligibility_reason', classification.eligibility_reason
                ),
                ${generatedAt},
                ${generatedAt},
                ${generatedAt},
                NULL
            FROM rating_rubber_classification classification
            WHERE classification.effective_date < DATE '1950-01-01'
               OR classification.effective_date > CURRENT_DATE + 1
               OR EXTRACT(YEAR FROM classification.effective_date) IN (1900, 1919, 1970)
            ON CONFLICT (model_id, issue_type, entity_type, entity_id) DO UPDATE SET
                severity = EXCLUDED.severity,
                source_id = EXCLUDED.source_id,
                competition_id = EXCLUDED.competition_id,
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
                source_id,
                competition_id,
                match_date,
                details,
                snapshot_generated_at,
                first_seen_at,
                last_seen_at,
                resolved_at
            )
            SELECT
                ${model.id}::uuid,
                'fixture_rubber_date_conflict',
                'warning',
                'rubber',
                rubber.id,
                classification.platform_id,
                fixture.competition_id,
                rubber.played_at::date,
                jsonb_build_object(
                    'fixture_id', fixture.id,
                    'rubber_date', rubber.played_at::date,
                    'fixture_date', fixture.date_played,
                    'difference_days', ABS(rubber.played_at::date - fixture.date_played)
                ),
                ${generatedAt},
                ${generatedAt},
                ${generatedAt},
                NULL
            FROM rubbers rubber
            JOIN fixtures fixture ON fixture.id = rubber.fixture_id
            LEFT JOIN rating_rubber_classification classification
              ON classification.rubber_id = rubber.id
            WHERE rubber.deleted_at IS NULL
              AND fixture.deleted_at IS NULL
              AND rubber.played_at IS NOT NULL
              AND fixture.date_played IS NOT NULL
              AND ABS(rubber.played_at::date - fixture.date_played) > 7
            ON CONFLICT (model_id, issue_type, entity_type, entity_id) DO UPDATE SET
                severity = EXCLUDED.severity,
                source_id = EXCLUDED.source_id,
                competition_id = EXCLUDED.competition_id,
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
                competition_id,
                match_date,
                details,
                snapshot_generated_at,
                first_seen_at,
                last_seen_at,
                resolved_at
            )
            SELECT
                candidate.model_id,
                CASE
                    WHEN candidate.candidate_type = 'conflicting_score_candidate'
                    THEN 'conflicting_duplicate_candidate'
                    ELSE 'exact_duplicate_candidate'
                END,
                CASE
                    WHEN candidate.candidate_type = 'conflicting_score_candidate'
                    THEN 'warning'
                    ELSE 'info'
                END,
                'duplicate_group',
                candidate.id,
                candidate.competition_id,
                candidate.match_date,
                jsonb_build_object(
                    'player_a_id', candidate.player_a_id,
                    'player_b_id', candidate.player_b_id,
                    'rubber_count', candidate.rubber_count,
                    'rubber_ids', candidate.rubber_ids,
                    'source_ids', candidate.source_ids,
                    'score_signatures', candidate.score_signatures
                ),
                ${generatedAt},
                ${generatedAt},
                ${generatedAt},
                NULL
            FROM rating_duplicate_candidate_groups candidate
            WHERE candidate.model_id = ${model.id}::uuid
            ON CONFLICT (model_id, issue_type, entity_type, entity_id) DO UPDATE SET
                severity = EXCLUDED.severity,
                competition_id = EXCLUDED.competition_id,
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
