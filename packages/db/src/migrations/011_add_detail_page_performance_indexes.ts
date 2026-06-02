import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await sql`
        CREATE INDEX IF NOT EXISTS idx_rubbers_home_p1_fixture_nonwalkover_active
        ON rubbers (home_player_1_id, fixture_id)
        WHERE deleted_at IS NULL
          AND outcome_type <> 'walkover'
          AND home_player_1_id IS NOT NULL
    `.execute(db);

    await sql`
        CREATE INDEX IF NOT EXISTS idx_rubbers_away_p1_fixture_nonwalkover_active
        ON rubbers (away_player_1_id, fixture_id)
        WHERE deleted_at IS NULL
          AND outcome_type <> 'walkover'
          AND away_player_1_id IS NOT NULL
    `.execute(db);

    await sql`
        CREATE INDEX IF NOT EXISTS idx_rubbers_home_p2_fixture_nonwalkover_active
        ON rubbers (home_player_2_id, fixture_id)
        WHERE deleted_at IS NULL
          AND outcome_type <> 'walkover'
          AND home_player_2_id IS NOT NULL
    `.execute(db);

    await sql`
        CREATE INDEX IF NOT EXISTS idx_rubbers_away_p2_fixture_nonwalkover_active
        ON rubbers (away_player_2_id, fixture_id)
        WHERE deleted_at IS NULL
          AND outcome_type <> 'walkover'
          AND away_player_2_id IS NOT NULL
    `.execute(db);

    await sql`
        CREATE INDEX IF NOT EXISTS idx_rubbers_home_p1_fixture_singles_all_active
        ON rubbers (home_player_1_id, fixture_id)
        WHERE deleted_at IS NULL
          AND is_doubles = false
          AND home_player_1_id IS NOT NULL
    `.execute(db);

    await sql`
        CREATE INDEX IF NOT EXISTS idx_rubbers_away_p1_fixture_singles_all_active
        ON rubbers (away_player_1_id, fixture_id)
        WHERE deleted_at IS NULL
          AND is_doubles = false
          AND away_player_1_id IS NOT NULL
    `.execute(db);

    await sql`
        CREATE INDEX IF NOT EXISTS idx_fixtures_home_team_completed_date_active
        ON fixtures (home_team_id, date_played DESC, id)
        WHERE deleted_at IS NULL
          AND status = 'completed'
    `.execute(db);

    await sql`
        CREATE INDEX IF NOT EXISTS idx_fixtures_away_team_completed_date_active
        ON fixtures (away_team_id, date_played DESC, id)
        WHERE deleted_at IS NULL
          AND status = 'completed'
    `.execute(db);

    await sql`
        CREATE INDEX IF NOT EXISTS idx_league_standings_competition_position_active
        ON league_standings (competition_id, position)
        WHERE deleted_at IS NULL
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`DROP INDEX IF EXISTS idx_league_standings_competition_position_active`.execute(db);
    await sql`DROP INDEX IF EXISTS idx_fixtures_away_team_completed_date_active`.execute(db);
    await sql`DROP INDEX IF EXISTS idx_fixtures_home_team_completed_date_active`.execute(db);
    await sql`DROP INDEX IF EXISTS idx_rubbers_away_p1_fixture_singles_all_active`.execute(db);
    await sql`DROP INDEX IF EXISTS idx_rubbers_home_p1_fixture_singles_all_active`.execute(db);
    await sql`DROP INDEX IF EXISTS idx_rubbers_away_p2_fixture_nonwalkover_active`.execute(db);
    await sql`DROP INDEX IF EXISTS idx_rubbers_home_p2_fixture_nonwalkover_active`.execute(db);
    await sql`DROP INDEX IF EXISTS idx_rubbers_away_p1_fixture_nonwalkover_active`.execute(db);
    await sql`DROP INDEX IF EXISTS idx_rubbers_home_p1_fixture_nonwalkover_active`.execute(db);
}
