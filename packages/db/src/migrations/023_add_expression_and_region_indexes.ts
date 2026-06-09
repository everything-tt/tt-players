import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    // Expression index for player identity resolution: COALESCE(canonical_player_id, id)
    await sql`
        CREATE INDEX IF NOT EXISTS idx_external_players_canonical_coalesce
        ON external_players (COALESCE(canonical_player_id, id))
        WHERE deleted_at IS NULL;
    `.execute(db);

    // Standalone index on league_regions.region_id for regional queries
    await sql`
        CREATE INDEX IF NOT EXISTS idx_league_regions_region_id
        ON league_regions (region_id);
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`DROP INDEX IF EXISTS idx_league_regions_region_id;`.execute(db);
    await sql`DROP INDEX IF EXISTS idx_external_players_canonical_coalesce;`.execute(db);
}
