import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createTable('rating_ranking_policies')
        .addColumn('model_id', 'uuid', (col) =>
            col.primaryKey().references('rating_models.id').onDelete('cascade'))
        .addColumn('active_days', 'integer', (col) => col.notNull().defaultTo(365))
        .addColumn('minimum_matches', 'integer', (col) => col.notNull().defaultTo(10))
        .addColumn('minimum_unique_opponents', 'integer', (col) => col.notNull().defaultTo(5))
        .addColumn('maximum_deviation', 'double precision', (col) => col.notNull().defaultTo(110))
        .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addCheckConstraint('chk_rating_policy_active_days', sql`active_days > 0`)
        .addCheckConstraint('chk_rating_policy_minimum_matches', sql`minimum_matches >= 0`)
        .addCheckConstraint('chk_rating_policy_minimum_opponents', sql`minimum_unique_opponents >= 0`)
        .addCheckConstraint('chk_rating_policy_maximum_deviation', sql`maximum_deviation > 0`)
        .execute();

    await sql`
        INSERT INTO rating_ranking_policies (model_id)
        SELECT id FROM rating_models
        ON CONFLICT (model_id) DO NOTHING
    `.execute(db);

    await db.schema
        .createTable('rating_current_rankings')
        .addColumn('model_id', 'uuid', (col) =>
            col.notNull().references('rating_models.id').onDelete('cascade'))
        .addColumn('player_id', 'uuid', (col) =>
            col.notNull().references('external_players.id').onDelete('cascade'))
        .addColumn('effective_deviation', 'double precision', (col) => col.notNull())
        .addColumn('effective_conservative_rating', 'double precision', (col) => col.notNull())
        .addColumn('days_inactive', 'integer', (col) => col.notNull())
        .addColumn('unique_opponents', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('eligible', 'boolean', (col) => col.notNull())
        .addColumn('eligibility_reason', 'varchar', (col) => col.notNull())
        .addColumn('current_rank', 'integer')
        .addColumn('historical_rank', 'integer', (col) => col.notNull())
        .addColumn('calculated_at', 'timestamp', (col) => col.notNull())
        .addPrimaryKeyConstraint('pk_rating_current_rankings', ['model_id', 'player_id'])
        .addCheckConstraint(
            'chk_rating_current_ranking_reason',
            sql`eligibility_reason IN (
                'ranked',
                'insufficient_matches',
                'insufficient_opponents',
                'inactive',
                'high_uncertainty',
                'critical_data_issue'
            )`,
        )
        .execute();

    await db.schema
        .createIndex('idx_rating_current_rankings_rank')
        .on('rating_current_rankings')
        .columns(['model_id', 'eligible', 'current_rank'])
        .execute();

    await db.schema
        .createIndex('idx_rating_current_rankings_reason')
        .on('rating_current_rankings')
        .columns(['model_id', 'eligibility_reason', 'effective_conservative_rating'])
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('rating_current_rankings').ifExists().execute();
    await db.schema.dropTable('rating_ranking_policies').ifExists().execute();
}
