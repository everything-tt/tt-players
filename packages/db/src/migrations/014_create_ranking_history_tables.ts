import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await sql`CREATE TYPE ranking_list_kind AS ENUM ('ranking', 'rating')`.execute(db);

    await db.schema
        .createTable('ranking_categories')
        .addColumn('id', 'uuid', (col) =>
            col.primaryKey().defaultTo(sql`gen_random_uuid()`),
        )
        .addColumn('platform_id', 'uuid', (col) =>
            col.notNull().references('platforms.id'),
        )
        .addColumn('external_id', 'varchar', (col) => col.notNull())
        .addColumn('name', 'varchar', (col) => col.notNull())
        .addColumn('created_at', 'timestamp', (col) =>
            col.notNull().defaultTo(sql`now()`),
        )
        .addColumn('updated_at', 'timestamp', (col) =>
            col.notNull().defaultTo(sql`now()`),
        )
        .addUniqueConstraint('uq_ranking_categories_platform_external', [
            'platform_id',
            'external_id',
        ])
        .execute();

    await db.schema
        .createTable('ranking_periods')
        .addColumn('id', 'uuid', (col) =>
            col.primaryKey().defaultTo(sql`gen_random_uuid()`),
        )
        .addColumn('platform_id', 'uuid', (col) =>
            col.notNull().references('platforms.id'),
        )
        .addColumn('external_id', 'varchar', (col) => col.notNull())
        .addColumn('label', 'varchar', (col) => col.notNull())
        .addColumn('period_end_date', 'date')
        .addColumn('created_at', 'timestamp', (col) =>
            col.notNull().defaultTo(sql`now()`),
        )
        .addColumn('updated_at', 'timestamp', (col) =>
            col.notNull().defaultTo(sql`now()`),
        )
        .addUniqueConstraint('uq_ranking_periods_platform_external', [
            'platform_id',
            'external_id',
        ])
        .execute();

    await db.schema
        .createTable('ranking_entries')
        .addColumn('id', 'uuid', (col) =>
            col.primaryKey().defaultTo(sql`gen_random_uuid()`),
        )
        .addColumn('period_id', 'uuid', (col) =>
            col.notNull().references('ranking_periods.id'),
        )
        .addColumn('category_id', 'uuid', (col) =>
            col.notNull().references('ranking_categories.id'),
        )
        .addColumn('player_id', 'uuid', (col) =>
            col.notNull().references('external_players.id'),
        )
        .addColumn('list_kind', sql`ranking_list_kind`, (col) => col.notNull())
        .addColumn('ranking_row_external_id', 'varchar')
        .addColumn('athlete_external_id', 'varchar')
        .addColumn('rank', 'integer')
        .addColumn('points', 'integer')
        .addColumn('county_country', 'varchar')
        .addColumn('inactive_periods', 'integer')
        .addColumn('is_initial_rating', 'boolean', (col) =>
            col.notNull().defaultTo(false),
        )
        .addColumn('created_at', 'timestamp', (col) =>
            col.notNull().defaultTo(sql`now()`),
        )
        .addColumn('updated_at', 'timestamp', (col) =>
            col.notNull().defaultTo(sql`now()`),
        )
        .addUniqueConstraint('uq_ranking_entries_snapshot_player_kind', [
            'period_id',
            'category_id',
            'player_id',
            'list_kind',
        ])
        .execute();

    await sql`
        CREATE INDEX idx_ranking_entries_player_period
        ON ranking_entries (player_id, period_id)
    `.execute(db);

    await sql`
        CREATE INDEX idx_ranking_entries_category_period_rank
        ON ranking_entries (category_id, period_id, rank)
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`DROP INDEX IF EXISTS idx_ranking_entries_category_period_rank`.execute(db);
    await sql`DROP INDEX IF EXISTS idx_ranking_entries_player_period`.execute(db);
    await db.schema.dropTable('ranking_entries').ifExists().execute();
    await db.schema.dropTable('ranking_periods').ifExists().execute();
    await db.schema.dropTable('ranking_categories').ifExists().execute();
    await sql`DROP TYPE IF EXISTS ranking_list_kind`.execute(db);
}
