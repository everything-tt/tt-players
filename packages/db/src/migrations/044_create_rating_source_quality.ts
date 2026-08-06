import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createTable('rating_source_quality')
        .addColumn('model_id', 'uuid', (col) =>
            col.notNull().references('rating_models.id').onDelete('cascade'))
        .addColumn('source_id', 'uuid', (col) =>
            col.notNull().references('platforms.id').onDelete('cascade'))
        .addColumn('total_rubbers', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('eligible_rubbers', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('missing_identity_rubbers', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('missing_date_rubbers', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('invalid_single_rubbers', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('suspicious_date_rubbers', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('duplicate_candidate_groups', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('conflicting_candidate_groups', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('first_match_date', 'date')
        .addColumn('last_match_date', 'date')
        .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addPrimaryKeyConstraint('pk_rating_source_quality', ['model_id', 'source_id'])
        .execute();

    await db.schema
        .createIndex('idx_rating_source_quality_health')
        .on('rating_source_quality')
        .columns(['model_id', 'missing_identity_rubbers', 'invalid_single_rubbers'])
        .execute();

    await db.schema
        .createTable('rating_competition_quality')
        .addColumn('model_id', 'uuid', (col) =>
            col.notNull().references('rating_models.id').onDelete('cascade'))
        .addColumn('competition_id', 'uuid', (col) =>
            col.notNull().references('competitions.id').onDelete('cascade'))
        .addColumn('source_id', 'uuid', (col) => col.references('platforms.id').onDelete('set null'))
        .addColumn('total_rubbers', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('eligible_rubbers', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('missing_identity_rubbers', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('missing_date_rubbers', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('invalid_single_rubbers', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('suspicious_date_rubbers', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('duplicate_candidate_groups', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('conflicting_candidate_groups', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('first_match_date', 'date')
        .addColumn('last_match_date', 'date')
        .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addPrimaryKeyConstraint('pk_rating_competition_quality', ['model_id', 'competition_id'])
        .execute();

    await db.schema
        .createIndex('idx_rating_competition_quality_health')
        .on('rating_competition_quality')
        .columns(['model_id', 'source_id', 'missing_identity_rubbers'])
        .execute();

    await db.schema
        .createTable('rating_duplicate_candidate_groups')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('model_id', 'uuid', (col) =>
            col.notNull().references('rating_models.id').onDelete('cascade'))
        .addColumn('competition_id', 'uuid', (col) => col.references('competitions.id').onDelete('cascade'))
        .addColumn('match_date', 'date', (col) => col.notNull())
        .addColumn('player_a_id', 'uuid', (col) =>
            col.notNull().references('external_players.id').onDelete('cascade'))
        .addColumn('player_b_id', 'uuid', (col) =>
            col.notNull().references('external_players.id').onDelete('cascade'))
        .addColumn('candidate_type', 'varchar', (col) => col.notNull())
        .addColumn('rubber_count', 'integer', (col) => col.notNull())
        .addColumn('rubber_ids', 'jsonb', (col) => col.notNull())
        .addColumn('source_ids', 'jsonb', (col) => col.notNull())
        .addColumn('score_signatures', 'jsonb', (col) => col.notNull())
        .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addCheckConstraint(
            'chk_rating_duplicate_candidate_type',
            sql`candidate_type IN ('exact_score_candidate', 'conflicting_score_candidate')`,
        )
        .addUniqueConstraint('uq_rating_duplicate_candidate_group', [
            'model_id',
            'competition_id',
            'match_date',
            'player_a_id',
            'player_b_id',
        ])
        .execute();

    await db.schema
        .createIndex('idx_rating_duplicate_candidates_type')
        .on('rating_duplicate_candidate_groups')
        .columns(['model_id', 'candidate_type', 'match_date'])
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('rating_duplicate_candidate_groups').ifExists().execute();
    await db.schema.dropTable('rating_competition_quality').ifExists().execute();
    await db.schema.dropTable('rating_source_quality').ifExists().execute();
}
