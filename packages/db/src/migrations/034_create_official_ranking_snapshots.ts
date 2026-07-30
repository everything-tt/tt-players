import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createTable('official_ranking_snapshots')
        .addColumn('id', 'uuid', (col) =>
            col.primaryKey().defaultTo(sql`gen_random_uuid()`)
        )
        .addColumn('platform_id', 'uuid', (col) =>
            col.notNull().references('platforms.id').onDelete('cascade')
        )
        .addColumn('player_id', 'uuid', (col) =>
            col.notNull().references('external_players.id').onDelete('cascade')
        )
        .addColumn('source_category_external_id', 'varchar', (col) => col.notNull())
        .addColumn('category_name', 'varchar', (col) => col.notNull())
        .addColumn('source_period_external_id', 'varchar', (col) => col.notNull())
        .addColumn('period_label', 'varchar', (col) => col.notNull())
        .addColumn('period_end_date', 'date')
        .addColumn('list_kind', sql`ranking_list_kind`, (col) => col.notNull())
        .addColumn('ranking_row_external_id', 'varchar')
        .addColumn('athlete_external_id', 'varchar')
        .addColumn('rank', 'integer')
        .addColumn('points', 'integer')
        .addColumn('county_country', 'varchar')
        .addColumn('inactive_periods', 'integer')
        .addColumn('is_initial_rating', 'boolean', (col) => col.notNull().defaultTo(false))
        .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addUniqueConstraint('uq_official_ranking_snapshot_player', [
            'platform_id',
            'source_category_external_id',
            'source_period_external_id',
            'player_id',
            'list_kind',
        ])
        .execute();

    await db.schema
        .createIndex('idx_official_ranking_snapshots_player_period')
        .on('official_ranking_snapshots')
        .columns(['player_id', 'period_end_date'])
        .execute();

    await db.schema
        .createIndex('idx_official_ranking_snapshots_category_latest')
        .on('official_ranking_snapshots')
        .columns(['category_name', 'list_kind', 'period_end_date'])
        .execute();

    await sql`
        DO $$
        BEGIN
            IF to_regclass('staging.ranking_entries') IS NOT NULL THEN
                INSERT INTO official_ranking_snapshots (
                    platform_id,
                    player_id,
                    source_category_external_id,
                    category_name,
                    source_period_external_id,
                    period_label,
                    period_end_date,
                    list_kind,
                    ranking_row_external_id,
                    athlete_external_id,
                    rank,
                    points,
                    county_country,
                    inactive_periods,
                    is_initial_rating,
                    created_at,
                    updated_at
                )
                SELECT
                    category.platform_id,
                    entry.player_id,
                    category.external_id,
                    category.name,
                    period.external_id,
                    period.label,
                    period.period_end_date,
                    entry.list_kind,
                    entry.ranking_row_external_id,
                    entry.athlete_external_id,
                    entry.rank,
                    entry.points,
                    entry.county_country,
                    entry.inactive_periods,
                    entry.is_initial_rating,
                    entry.created_at,
                    entry.updated_at
                FROM staging.ranking_entries entry
                JOIN staging.ranking_categories category ON category.id = entry.category_id
                JOIN staging.ranking_periods period ON period.id = entry.period_id
                ON CONFLICT (
                    platform_id,
                    source_category_external_id,
                    source_period_external_id,
                    player_id,
                    list_kind
                ) DO UPDATE SET
                    category_name = EXCLUDED.category_name,
                    period_label = EXCLUDED.period_label,
                    period_end_date = EXCLUDED.period_end_date,
                    ranking_row_external_id = EXCLUDED.ranking_row_external_id,
                    athlete_external_id = EXCLUDED.athlete_external_id,
                    rank = EXCLUDED.rank,
                    points = EXCLUDED.points,
                    county_country = EXCLUDED.county_country,
                    inactive_periods = EXCLUDED.inactive_periods,
                    is_initial_rating = EXCLUDED.is_initial_rating,
                    updated_at = EXCLUDED.updated_at;
            END IF;
        END
        $$
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('official_ranking_snapshots').ifExists().execute();
}
