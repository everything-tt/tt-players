import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await sql`
        CREATE INDEX IF NOT EXISTS idx_fixtures_date_competition_active
        ON fixtures(date_played DESC, competition_id, id)
        WHERE deleted_at IS NULL;
    `.execute(db);

    await sql`
        CREATE INDEX IF NOT EXISTS idx_seasons_active_id_league
        ON seasons(id, league_id)
        WHERE deleted_at IS NULL
          AND is_active = true;
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`DROP INDEX IF EXISTS idx_seasons_active_id_league;`.execute(db);
    await sql`DROP INDEX IF EXISTS idx_fixtures_date_competition_active;`.execute(db);
}
