import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    // Keep the existing v1 eligibility boundary while making non-normal outcomes
    // explainable in the audit trail instead of grouping them under one reason.
    await sql`
        CREATE OR REPLACE FUNCTION rating_rubber_exclusion_reason(
            p_is_doubles boolean,
            p_outcome_type text,
            p_effective_date date,
            p_home_player_id uuid,
            p_away_player_id uuid,
            p_home_record_id uuid,
            p_away_record_id uuid,
            p_home_canonical_id uuid,
            p_away_canonical_id uuid,
            p_home_games_won integer,
            p_away_games_won integer
        ) RETURNS text
        LANGUAGE sql
        IMMUTABLE
        PARALLEL SAFE
        AS $$
            SELECT CASE
                WHEN p_is_doubles THEN 'doubles'
                WHEN p_outcome_type = 'walkover' THEN 'walkover'
                WHEN p_outcome_type = 'retired' THEN 'retirement'
                WHEN p_outcome_type = 'void' THEN 'void_result'
                WHEN p_outcome_type <> 'normal' THEN 'non_normal_outcome'
                WHEN p_effective_date IS NULL THEN 'missing_date'
                WHEN p_home_player_id IS NULL AND p_away_player_id IS NULL THEN 'missing_both_player_ids'
                WHEN p_home_player_id IS NULL THEN 'missing_home_player_id'
                WHEN p_away_player_id IS NULL THEN 'missing_away_player_id'
                WHEN p_home_record_id IS NULL AND p_away_record_id IS NULL THEN 'missing_both_player_records'
                WHEN p_home_record_id IS NULL THEN 'missing_home_player_record'
                WHEN p_away_record_id IS NULL THEN 'missing_away_player_record'
                WHEN p_home_canonical_id = p_away_canonical_id THEN 'same_canonical_player'
                WHEN p_home_games_won = p_away_games_won THEN 'tied_score'
                ELSE 'eligible'
            END
        $$
    `.execute(db);

    await db.schema
        .createTable('rating_calculation_runs')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('model_id', 'uuid', (col) =>
            col.notNull().references('rating_models.id').onDelete('cascade'))
        .addColumn('model_key', 'varchar', (col) => col.notNull())
        .addColumn('model_version', 'varchar', (col) => col.notNull())
        .addColumn('started_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('completed_at', 'timestamp')
        .addColumn('source_data_cutoff', 'date')
        .addColumn('code_commit_sha', 'varchar', (col) => col.notNull())
        .addColumn('algorithm_parameters', 'jsonb', (col) => col.notNull())
        .addColumn('input_hash', 'varchar', (col) => col.notNull())
        .addColumn('run_status', 'varchar', (col) => col.notNull().defaultTo('running'))
        .addColumn('processed_periods', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('processed_matches', 'bigint', (col) => col.notNull().defaultTo(0))
        .addColumn('failure_message', 'text')
        .execute();

    await db.schema
        .createIndex('idx_rating_calculation_runs_model_started')
        .on('rating_calculation_runs')
        .columns(['model_id', 'started_at'])
        .execute();

    await db.schema
        .createTable('rating_period_audits')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('run_id', 'uuid', (col) =>
            col.notNull().references('rating_calculation_runs.id').onDelete('cascade'))
        .addColumn('model_id', 'uuid', (col) =>
            col.notNull().references('rating_models.id').onDelete('cascade'))
        .addColumn('rating_date', 'date', (col) => col.notNull())
        .addColumn('player_id', 'uuid', (col) => col.notNull())
        .addColumn('rating_before', 'double precision', (col) => col.notNull())
        .addColumn('rating_deviation_before', 'double precision', (col) => col.notNull())
        .addColumn('volatility_before', 'double precision', (col) => col.notNull())
        .addColumn('ranking_score_before', 'double precision', (col) => col.notNull())
        .addColumn('public_rank_before', 'integer')
        .addColumn('rating_after', 'double precision', (col) => col.notNull())
        .addColumn('rating_deviation_after', 'double precision', (col) => col.notNull())
        .addColumn('volatility_after', 'double precision', (col) => col.notNull())
        .addColumn('ranking_score_after', 'double precision', (col) => col.notNull())
        .addColumn('public_rank_after', 'integer')
        .addColumn('rated_matches_in_period', 'integer', (col) => col.notNull())
        .addColumn('total_rated_matches', 'integer', (col) => col.notNull())
        .addColumn('unique_opponent_count', 'integer', (col) => col.notNull())
        .addColumn('provisional_before', 'boolean', (col) => col.notNull())
        .addColumn('provisional_after', 'boolean', (col) => col.notNull())
        .addColumn('combined_rating_delta', 'double precision', (col) => col.notNull())
        .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addUniqueConstraint('uq_rating_period_audit_run_player_date', [
            'run_id',
            'rating_date',
            'player_id',
        ])
        .execute();

    await db.schema
        .createIndex('idx_rating_period_audits_player_date')
        .on('rating_period_audits')
        .columns(['model_id', 'player_id', 'rating_date'])
        .execute();

    await db.schema
        .createTable('rating_match_audits')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('run_id', 'uuid', (col) =>
            col.notNull().references('rating_calculation_runs.id').onDelete('cascade'))
        .addColumn('period_audit_id', 'uuid', (col) =>
            col.references('rating_period_audits.id').onDelete('cascade'))
        .addColumn('rating_date', 'date')
        .addColumn('rubber_id', 'uuid', (col) => col.notNull())
        .addColumn('side', 'varchar', (col) => col.notNull())
        .addColumn('player_id', 'uuid')
        .addColumn('opponent_id', 'uuid')
        .addColumn('result', 'varchar')
        .addColumn('game_score', 'varchar')
        .addColumn('player_rating_before', 'double precision')
        .addColumn('player_rating_deviation_before', 'double precision')
        .addColumn('opponent_rating_before', 'double precision')
        .addColumn('opponent_rating_deviation_before', 'double precision')
        .addColumn('expected_win_probability', 'double precision')
        .addColumn('actual_score', 'double precision')
        .addColumn('surprise_value', 'double precision')
        .addColumn('attributed_rating_delta', 'double precision')
        .addColumn('information_contribution', 'double precision')
        .addColumn('included', 'boolean', (col) => col.notNull())
        .addColumn('exclusion_reason', 'varchar')
        .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addUniqueConstraint('uq_rating_match_audit_run_rubber_side', [
            'run_id',
            'rubber_id',
            'side',
        ])
        .execute();

    await db.schema
        .createIndex('idx_rating_match_audits_player_date')
        .on('rating_match_audits')
        .columns(['player_id', 'rating_date'])
        .execute();

    await db.schema
        .createIndex('idx_rating_match_audits_run_included')
        .on('rating_match_audits')
        .columns(['run_id', 'included', 'exclusion_reason'])
        .execute();

    await db.schema
        .createIndex('idx_rating_match_audits_rubber')
        .on('rating_match_audits')
        .columns(['rubber_id', 'run_id'])
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('rating_match_audits').ifExists().execute();
    await db.schema.dropTable('rating_period_audits').ifExists().execute();
    await db.schema.dropTable('rating_calculation_runs').ifExists().execute();

    await sql`
        CREATE OR REPLACE FUNCTION rating_rubber_exclusion_reason(
            p_is_doubles boolean,
            p_outcome_type text,
            p_effective_date date,
            p_home_player_id uuid,
            p_away_player_id uuid,
            p_home_record_id uuid,
            p_away_record_id uuid,
            p_home_canonical_id uuid,
            p_away_canonical_id uuid,
            p_home_games_won integer,
            p_away_games_won integer
        ) RETURNS text
        LANGUAGE sql
        IMMUTABLE
        PARALLEL SAFE
        AS $$
            SELECT CASE
                WHEN p_is_doubles THEN 'doubles'
                WHEN p_outcome_type <> 'normal' THEN 'non_normal_outcome'
                WHEN p_effective_date IS NULL THEN 'missing_date'
                WHEN p_home_player_id IS NULL AND p_away_player_id IS NULL THEN 'missing_both_player_ids'
                WHEN p_home_player_id IS NULL THEN 'missing_home_player_id'
                WHEN p_away_player_id IS NULL THEN 'missing_away_player_id'
                WHEN p_home_record_id IS NULL AND p_away_record_id IS NULL THEN 'missing_both_player_records'
                WHEN p_home_record_id IS NULL THEN 'missing_home_player_record'
                WHEN p_away_record_id IS NULL THEN 'missing_away_player_record'
                WHEN p_home_canonical_id = p_away_canonical_id THEN 'same_canonical_player'
                WHEN p_home_games_won = p_away_games_won THEN 'tied_score'
                ELSE 'eligible'
            END
        $$
    `.execute(db);
}
