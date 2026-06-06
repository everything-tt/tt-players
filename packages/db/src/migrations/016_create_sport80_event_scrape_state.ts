import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createTable('sport80_event_scrape_state')
        .addColumn('id', 'uuid', (col) =>
            col.primaryKey().defaultTo(sql`gen_random_uuid()`),
        )
        .addColumn('event_id', 'varchar', (col) => col.notNull())
        .addColumn('event_name', 'varchar')
        .addColumn('event_date', 'date')
        .addColumn('category', 'varchar')
        .addColumn('status', sql`scrape_status`, (col) => col.notNull().defaultTo('pending'))
        .addColumn('result_rows', 'integer')
        .addColumn('last_error', 'text')
        .addColumn('first_seen_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('last_attempted_at', 'timestamp')
        .addColumn('processed_at', 'timestamp')
        .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addUniqueConstraint('uq_sport80_event_scrape_state_event_id', ['event_id'])
        .execute();

    await db.schema
        .createIndex('idx_sport80_event_scrape_state_status')
        .on('sport80_event_scrape_state')
        .columns(['status', 'event_date'])
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropIndex('idx_sport80_event_scrape_state_status').ifExists().execute();
    await db.schema.dropTable('sport80_event_scrape_state').ifExists().execute();
}
