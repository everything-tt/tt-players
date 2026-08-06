import { sql, type Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import { DEFAULT_RATING_MODEL_KEY } from './domain.js';

interface ModelRow {
    id: string;
}

interface CountRow {
    count: number | string;
}

const RUBBER_ISSUE_TYPES = [
    'missing_date',
    'missing_both_player_ids',
    'missing_home_player_id',
    'missing_away_player_id',
    'missing_both_player_records',
    'missing_home_player_record',
    'missing_away_player_record',
    'same_canonical_player',
    'tied_score',
] as const;

export async function refreshRatingAuditIssues(
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
            UPDATE rating_audit_issues
            SET resolved_at = ${generatedAt},
                snapshot_generated_at = ${generatedAt}
            WHERE model_id = ${model.id}::uuid
              AND entity_type = 'rubber'
              AND issue_type = ANY(${RUBBER_ISSUE_TYPES}::text[])
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
                classification.eligibility_reason,
                CASE
                    WHEN classification.eligibility_reason IN (
                        'missing_both_player_records',
                        'missing_home_player_record',
                        'missing_away_player_record',
                        'same_canonical_player'
                    ) THEN 'critical'
                    ELSE 'warning'
                END,
                'rubber',
                classification.rubber_id,
                classification.platform_id,
                classification.competition_id,
                classification.effective_date,
                jsonb_build_object(
                    'fixture_id', classification.fixture_id,
                    'home_player_id', classification.home_player_1_id,
                    'away_player_id', classification.away_player_1_id,
                    'home_player_record_id', classification.home_player_record_id,
                    'away_player_record_id', classification.away_player_record_id,
                    'home_canonical_player_id', classification.home_canonical_player_id,
                    'away_canonical_player_id', classification.away_canonical_player_id,
                    'home_games_won', classification.home_games_won,
                    'away_games_won', classification.away_games_won
                ),
                ${generatedAt},
                ${generatedAt},
                ${generatedAt},
                NULL
            FROM rating_rubber_classification classification
            WHERE classification.eligibility_reason = ANY(${RUBBER_ISSUE_TYPES}::text[])
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

        const countResult = await sql<CountRow>`
            SELECT COUNT(*)::int AS count
            FROM rating_audit_issues
            WHERE model_id = ${model.id}::uuid
              AND resolved_at IS NULL
        `.execute(trx);

        return Number(countResult.rows[0]?.count ?? 0);
    });
}
