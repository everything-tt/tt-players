import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await sql`
        UPDATE rating_models model
        SET window_start_date = coverage.first_rated_at,
            updated_at = now()
        FROM (
            SELECT model_id, MIN(first_rated_at) AS first_rated_at
            FROM player_ratings
            WHERE first_rated_at IS NOT NULL
            GROUP BY model_id
        ) coverage
        WHERE model.id = coverage.model_id
          AND model.window_start_date IS NULL
    `.execute(db);

    await db.schema
        .createTable('rating_player_coverage')
        .addColumn('model_id', 'uuid', (col) =>
            col.notNull().references('rating_models.id').onDelete('cascade'))
        .addColumn('player_id', 'uuid', (col) =>
            col.notNull().references('external_players.id').onDelete('cascade'))
        .addColumn('category', 'varchar', (col) => col.notNull())
        .addColumn('raw_matches', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('singles_matches', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('normal_singles_matches', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('eligible_matches_all_time', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('eligible_matches_in_window', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('unique_opponents_in_window', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('first_match_date', 'date')
        .addColumn('last_match_date', 'date')
        .addColumn('rating_exists', 'boolean', (col) => col.notNull().defaultTo(false))
        .addColumn('rated_matches', 'integer')
        .addColumn('rating_deviation', 'double precision')
        .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addPrimaryKeyConstraint('pk_rating_player_coverage', ['model_id', 'player_id'])
        .addCheckConstraint(
            'chk_rating_player_coverage_category',
            sql`category IN (
                'covered',
                'no_raw_matches',
                'only_doubles',
                'only_non_normal',
                'only_invalid_singles',
                'only_before_model_window',
                'eligible_in_window_without_rating',
                'rating_without_eligible_evidence'
            )`,
        )
        .execute();

    await db.schema
        .createIndex('idx_rating_player_coverage_category')
        .on('rating_player_coverage')
        .columns(['model_id', 'category', 'last_match_date'])
        .execute();

    await db.schema
        .createIndex('idx_rating_player_coverage_opponents')
        .on('rating_player_coverage')
        .columns(['model_id', 'unique_opponents_in_window'])
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('rating_player_coverage').ifExists().execute();
}
