import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .alterTable('competitions')
        .addColumn('display_name', 'varchar')
        .addColumn('event_date', 'date')
        .addColumn('category', 'varchar')
        .execute();

    await sql`
        CREATE INDEX idx_competitions_type_event_date
        ON competitions (type, event_date)
        WHERE deleted_at IS NULL
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`DROP INDEX IF EXISTS idx_competitions_type_event_date`.execute(db);
    await db.schema
        .alterTable('competitions')
        .dropColumn('category')
        .dropColumn('event_date')
        .dropColumn('display_name')
        .execute();
}
