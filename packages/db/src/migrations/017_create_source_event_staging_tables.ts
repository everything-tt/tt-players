import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createTable('source_events')
        .addColumn('id', 'uuid', (col) =>
            col.primaryKey().defaultTo(sql`gen_random_uuid()`),
        )
        .addColumn('platform_id', 'uuid', (col) =>
            col.notNull().references('platforms.id'),
        )
        .addColumn('source', 'varchar', (col) => col.notNull())
        .addColumn('external_id', 'varchar', (col) => col.notNull())
        .addColumn('name', 'varchar', (col) => col.notNull())
        .addColumn('event_date', 'date')
        .addColumn('category', 'varchar')
        .addColumn('public_url', 'varchar')
        .addColumn('raw_payload', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
        .addColumn('canonical_competition_id', 'uuid', (col) =>
            col.references('competitions.id'),
        )
        .addColumn('first_seen_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('last_seen_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addUniqueConstraint('uq_source_events_source_external', ['source', 'external_id'])
        .execute();

    await db.schema
        .createIndex('idx_source_events_platform_date')
        .on('source_events')
        .columns(['platform_id', 'event_date'])
        .execute();

    await db.schema
        .createTable('source_event_result_rows')
        .addColumn('id', 'uuid', (col) =>
            col.primaryKey().defaultTo(sql`gen_random_uuid()`),
        )
        .addColumn('source_event_id', 'uuid', (col) =>
            col.notNull().references('source_events.id'),
        )
        .addColumn('source', 'varchar', (col) => col.notNull())
        .addColumn('external_id', 'varchar', (col) => col.notNull())
        .addColumn('played_at', 'timestamp')
        .addColumn('round_name', 'varchar')
        .addColumn('round_order', 'integer')
        .addColumn('round_raw', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
        .addColumn('home_raw', 'text', (col) => col.notNull())
        .addColumn('away_raw', 'text', (col) => col.notNull())
        .addColumn('home_player_name', 'varchar', (col) => col.notNull())
        .addColumn('home_player_external_id', 'varchar', (col) => col.notNull())
        .addColumn('away_player_name', 'varchar', (col) => col.notNull())
        .addColumn('away_player_external_id', 'varchar', (col) => col.notNull())
        .addColumn('winner_side', 'varchar', (col) => col.notNull())
        .addColumn('raw_payload', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
        .addColumn('canonical_rubber_id', 'uuid', (col) =>
            col.references('rubbers.id'),
        )
        .addColumn('first_seen_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('last_seen_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addUniqueConstraint('uq_source_event_result_rows_source_external', ['source', 'external_id'])
        .execute();

    await db.schema
        .createIndex('idx_source_event_result_rows_event')
        .on('source_event_result_rows')
        .columns(['source_event_id', 'played_at'])
        .execute();

    await db.schema
        .createIndex('idx_source_event_result_rows_players')
        .on('source_event_result_rows')
        .columns(['home_player_external_id', 'away_player_external_id'])
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropIndex('idx_source_event_result_rows_players').ifExists().execute();
    await db.schema.dropIndex('idx_source_event_result_rows_event').ifExists().execute();
    await db.schema.dropTable('source_event_result_rows').ifExists().execute();
    await db.schema.dropIndex('idx_source_events_platform_date').ifExists().execute();
    await db.schema.dropTable('source_events').ifExists().execute();
}
