import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createTable('rating_backtest_runs')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('model_id', 'uuid', (col) =>
            col.notNull().references('rating_models.id').onDelete('cascade'))
        .addColumn('status', 'varchar', (col) => col.notNull())
        .addColumn('evaluation_start_date', 'date', (col) => col.notNull())
        .addColumn('evaluation_end_date', 'date', (col) => col.notNull())
        .addColumn('config', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
        .addColumn('generated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('completed_at', 'timestamp')
        .addColumn('error_message', 'text')
        .addCheckConstraint(
            'chk_rating_backtest_status',
            sql`status IN ('running', 'completed', 'failed')`,
        )
        .addCheckConstraint(
            'chk_rating_backtest_dates',
            sql`evaluation_start_date <= evaluation_end_date`,
        )
        .execute();

    await db.schema
        .createIndex('idx_rating_backtest_runs_latest')
        .on('rating_backtest_runs')
        .columns(['model_id', 'status', 'generated_at'])
        .execute();

    await db.schema
        .createTable('rating_backtest_metrics')
        .addColumn('run_id', 'uuid', (col) =>
            col.notNull().references('rating_backtest_runs.id').onDelete('cascade'))
        .addColumn('window_years', 'integer', (col) => col.notNull())
        .addColumn('training_start_date', 'date', (col) => col.notNull())
        .addColumn('evaluated_matches', 'integer', (col) => col.notNull())
        .addColumn('cold_start_matches', 'integer', (col) => col.notNull())
        .addColumn('brier_score', 'double precision', (col) => col.notNull())
        .addColumn('log_loss', 'double precision', (col) => col.notNull())
        .addColumn('favourite_accuracy', 'double precision', (col) => col.notNull())
        .addColumn('calibration_error', 'double precision', (col) => col.notNull())
        .addColumn('calibration', 'jsonb', (col) => col.notNull())
        .addColumn('top_players', 'jsonb', (col) => col.notNull())
        .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addPrimaryKeyConstraint('pk_rating_backtest_metrics', ['run_id', 'window_years'])
        .addCheckConstraint('chk_rating_backtest_window_years', sql`window_years > 0`)
        .addCheckConstraint('chk_rating_backtest_evaluated_matches', sql`evaluated_matches >= 0`)
        .addCheckConstraint('chk_rating_backtest_cold_start_matches', sql`cold_start_matches >= 0`)
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('rating_backtest_metrics').ifExists().execute();
    await db.schema.dropTable('rating_backtest_runs').ifExists().execute();
}
