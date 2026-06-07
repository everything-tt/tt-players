import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await sql`
        CREATE INDEX IF NOT EXISTS idx_rubbers_updated_at ON rubbers(updated_at);
    `.execute(db);

    await sql`
        CREATE INDEX IF NOT EXISTS idx_fixtures_updated_at ON fixtures(updated_at);
    `.execute(db);

    await sql`
        CREATE INDEX IF NOT EXISTS idx_external_players_updated_at ON external_players(updated_at);
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`DROP INDEX IF EXISTS idx_external_players_updated_at;`.execute(db);
    await sql`DROP INDEX IF EXISTS idx_fixtures_updated_at;`.execute(db);
    await sql`DROP INDEX IF EXISTS idx_rubbers_updated_at;`.execute(db);
}
