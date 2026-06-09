import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await sql`
        CREATE INDEX IF NOT EXISTS idx_rubbers_home_p1_fixture_updated_active
        ON rubbers(home_player_1_id, fixture_id, updated_at DESC)
        WHERE deleted_at IS NULL
          AND home_player_1_id IS NOT NULL;
    `.execute(db);

    await sql`
        CREATE INDEX IF NOT EXISTS idx_rubbers_away_p1_fixture_updated_active
        ON rubbers(away_player_1_id, fixture_id, updated_at DESC)
        WHERE deleted_at IS NULL
          AND away_player_1_id IS NOT NULL;
    `.execute(db);

    await sql`
        CREATE INDEX IF NOT EXISTS idx_rubbers_home_p2_fixture_updated_active
        ON rubbers(home_player_2_id, fixture_id, updated_at DESC)
        WHERE deleted_at IS NULL
          AND home_player_2_id IS NOT NULL;
    `.execute(db);

    await sql`
        CREATE INDEX IF NOT EXISTS idx_rubbers_away_p2_fixture_updated_active
        ON rubbers(away_player_2_id, fixture_id, updated_at DESC)
        WHERE deleted_at IS NULL
          AND away_player_2_id IS NOT NULL;
    `.execute(db);

    await sql`
        CREATE INDEX IF NOT EXISTS idx_fixtures_id_updated_active
        ON fixtures(id, updated_at DESC)
        WHERE deleted_at IS NULL;
    `.execute(db);

    await sql`
        CREATE INDEX IF NOT EXISTS idx_external_players_updated_at_active
        ON external_players(updated_at DESC)
        WHERE deleted_at IS NULL;
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`DROP INDEX IF EXISTS idx_external_players_updated_at_active;`.execute(db);
    await sql`DROP INDEX IF EXISTS idx_fixtures_id_updated_active;`.execute(db);
    await sql`DROP INDEX IF EXISTS idx_rubbers_away_p2_fixture_updated_active;`.execute(db);
    await sql`DROP INDEX IF EXISTS idx_rubbers_home_p2_fixture_updated_active;`.execute(db);
    await sql`DROP INDEX IF EXISTS idx_rubbers_away_p1_fixture_updated_active;`.execute(db);
    await sql`DROP INDEX IF EXISTS idx_rubbers_home_p1_fixture_updated_active;`.execute(db);
}
