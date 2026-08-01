import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .alterTable('competitions')
        .addColumn('start_date', 'date')
        .addColumn('end_date', 'date')
        .addColumn('venue_name', 'varchar')
        .addColumn('venue_address', 'text')
        .addColumn('venue_town', 'varchar')
        .addColumn('venue_postcode', 'varchar')
        .addColumn('entry_deadline', 'timestamp')
        .addColumn('entry_url', 'text')
        .addColumn('information_url', 'text')
        .addColumn('event_status', 'varchar', (col) => col.notNull().defaultTo('upcoming'))
        .addColumn('status_override', 'varchar')
        .addColumn('normalized_name', 'varchar')
        .addColumn('normalized_venue', 'varchar')
        .addColumn('calendar_first_seen_at', 'timestamp')
        .addColumn('calendar_last_seen_at', 'timestamp')
        .addColumn('calendar_missing_count', 'integer', (col) => col.notNull().defaultTo(0))
        .execute();

    await db
        .updateTable('competitions')
        .set({ start_date: sql`event_date` })
        .where('event_date', 'is not', null)
        .execute();

    await db.schema
        .createIndex('idx_competitions_event_status_start_date')
        .on('competitions')
        .columns(['event_status', 'start_date'])
        .execute();

    await db.schema
        .createTable('tournament_sources')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('competition_id', 'uuid', (col) =>
            col.notNull().references('competitions.id').onDelete('cascade'),
        )
        .addColumn('provider', 'varchar', (col) => col.notNull())
        .addColumn('source_type', 'varchar', (col) => col.notNull())
        .addColumn('external_id', 'varchar')
        .addColumn('source_url', 'text', (col) => col.notNull())
        .addColumn('source_key', 'varchar', (col) => col.notNull())
        .addColumn('payload_hash', 'varchar')
        .addColumn('raw_payload', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
        .addColumn('first_seen_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('last_seen_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('missing_count', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('match_method', 'varchar')
        .addColumn('match_confidence', 'numeric')
        .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addUniqueConstraint('uq_tournament_sources_identity', ['provider', 'source_type', 'source_key'])
        .execute();

    await db.schema
        .createIndex('idx_tournament_sources_competition')
        .on('tournament_sources')
        .column('competition_id')
        .execute();

    await db.schema
        .createTable('tournament_match_candidates')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('incoming_provider', 'varchar', (col) => col.notNull())
        .addColumn('incoming_external_id', 'varchar')
        .addColumn('incoming_name', 'varchar', (col) => col.notNull())
        .addColumn('incoming_date', 'date')
        .addColumn('incoming_venue', 'varchar')
        .addColumn('candidate_competition_id', 'uuid', (col) =>
            col.notNull().references('competitions.id').onDelete('cascade'),
        )
        .addColumn('name_score', 'numeric', (col) => col.notNull())
        .addColumn('date_score', 'numeric', (col) => col.notNull())
        .addColumn('venue_score', 'numeric', (col) => col.notNull())
        .addColumn('category_score', 'numeric', (col) => col.notNull())
        .addColumn('total_score', 'numeric', (col) => col.notNull())
        .addColumn('status', 'varchar', (col) => col.notNull().defaultTo('pending'))
        .addColumn('resolution', 'varchar')
        .addColumn('reviewed_at', 'timestamp')
        .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();

    await db.schema
        .createIndex('idx_tournament_match_candidates_status')
        .on('tournament_match_candidates')
        .columns(['status', 'total_score'])
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropIndex('idx_tournament_match_candidates_status').ifExists().execute();
    await db.schema.dropTable('tournament_match_candidates').ifExists().execute();
    await db.schema.dropIndex('idx_tournament_sources_competition').ifExists().execute();
    await db.schema.dropTable('tournament_sources').ifExists().execute();
    await db.schema.dropIndex('idx_competitions_event_status_start_date').ifExists().execute();

    await db.schema
        .alterTable('competitions')
        .dropColumn('calendar_missing_count')
        .dropColumn('calendar_last_seen_at')
        .dropColumn('calendar_first_seen_at')
        .dropColumn('normalized_venue')
        .dropColumn('normalized_name')
        .dropColumn('status_override')
        .dropColumn('event_status')
        .dropColumn('information_url')
        .dropColumn('entry_url')
        .dropColumn('entry_deadline')
        .dropColumn('venue_postcode')
        .dropColumn('venue_town')
        .dropColumn('venue_address')
        .dropColumn('venue_name')
        .dropColumn('end_date')
        .dropColumn('start_date')
        .execute();
}
