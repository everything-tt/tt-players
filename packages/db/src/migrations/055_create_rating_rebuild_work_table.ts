import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await sql`
        CREATE UNLOGGED TABLE rating_rebuild_matches (
            rubber_id uuid PRIMARY KEY,
            effective_date date NOT NULL,
            home_canonical_player_id uuid NOT NULL,
            away_canonical_player_id uuid NOT NULL,
            home_games_won integer NOT NULL,
            away_games_won integer NOT NULL,
            eligibility_reason varchar NOT NULL
        )
    `.execute(db);

    await sql`
        CREATE INDEX rating_rebuild_matches_effective_date_idx
        ON rating_rebuild_matches (effective_date, rubber_id)
    `.execute(db);
    await sql`
        CREATE INDEX rating_rebuild_matches_home_date_away_idx
        ON rating_rebuild_matches
            (home_canonical_player_id, effective_date, away_canonical_player_id)
    `.execute(db);
    await sql`
        CREATE INDEX rating_rebuild_matches_away_date_home_idx
        ON rating_rebuild_matches
            (away_canonical_player_id, effective_date, home_canonical_player_id)
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`DROP TABLE IF EXISTS rating_rebuild_matches`.execute(db);
}
