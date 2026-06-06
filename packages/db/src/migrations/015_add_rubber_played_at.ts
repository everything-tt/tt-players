import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .alterTable('rubbers')
        .addColumn('played_at', 'timestamp')
        .execute();

    await sql`
        CREATE INDEX idx_rubbers_played_at_active
        ON rubbers (played_at)
        WHERE deleted_at IS NULL
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`DROP INDEX IF EXISTS idx_rubbers_played_at_active`.execute(db);
    await db.schema
        .alterTable('rubbers')
        .dropColumn('played_at')
        .execute();
}
