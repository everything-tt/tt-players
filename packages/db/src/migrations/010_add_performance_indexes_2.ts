import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await sql`
        CREATE INDEX IF NOT EXISTS idx_league_standings_competition_active
        ON league_standings (competition_id)
        WHERE deleted_at IS NULL
    `.execute(db);

    await sql`
        CREATE INDEX IF NOT EXISTS idx_competitions_season_active
        ON competitions (season_id)
        WHERE deleted_at IS NULL
    `.execute(db);

    await sql`
        CREATE INDEX IF NOT EXISTS idx_seasons_league_active
        ON seasons (league_id, is_active)
        WHERE deleted_at IS NULL
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`DROP INDEX IF EXISTS idx_seasons_league_active`.execute(db);
    await sql`DROP INDEX IF EXISTS idx_competitions_season_active`.execute(db);
    await sql`DROP INDEX IF EXISTS idx_league_standings_competition_active`.execute(db);
}
