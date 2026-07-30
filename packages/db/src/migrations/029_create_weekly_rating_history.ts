import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createTable('player_rating_weekly_history')
        .addColumn('model_id', 'uuid', (col) =>
            col.notNull().references('rating_models.id').onDelete('cascade')
        )
        .addColumn('player_id', 'uuid', (col) =>
            col.notNull().references('external_players.id').onDelete('cascade')
        )
        .addColumn('week_start', 'date', (col) => col.notNull())
        .addColumn('snapshot_date', 'date', (col) => col.notNull())
        .addColumn('rating', 'double precision', (col) => col.notNull())
        .addColumn('rating_deviation', 'double precision', (col) => col.notNull())
        .addColumn('volatility', 'double precision', (col) => col.notNull())
        .addColumn('conservative_rating', 'double precision', (col) => col.notNull())
        .addColumn('rated_matches', 'integer', (col) => col.notNull())
        .addColumn('rated_wins', 'integer', (col) => col.notNull())
        .addColumn('rated_losses', 'integer', (col) => col.notNull())
        .addColumn('week_matches', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('week_wins', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('week_losses', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('provisional', 'boolean', (col) => col.notNull().defaultTo(true))
        .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addPrimaryKeyConstraint('pk_player_rating_weekly_history', [
            'model_id',
            'player_id',
            'week_start',
        ])
        .execute();

    await db.schema
        .createIndex('idx_player_rating_weekly_history_player_date')
        .on('player_rating_weekly_history')
        .columns(['model_id', 'player_id', 'week_start'])
        .execute();

    await sql`
        CREATE OR REPLACE FUNCTION capture_player_rating_weekly_history()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        DECLARE
            match_delta integer;
            win_delta integer;
            loss_delta integer;
            rating_week date;
        BEGIN
            IF NEW.last_rated_at IS NULL THEN
                RETURN NEW;
            END IF;

            IF TG_OP = 'INSERT' THEN
                match_delta := NEW.rated_matches;
                win_delta := NEW.rated_wins;
                loss_delta := NEW.rated_losses;
            ELSE
                match_delta := GREATEST(NEW.rated_matches - OLD.rated_matches, 0);
                win_delta := GREATEST(NEW.rated_wins - OLD.rated_wins, 0);
                loss_delta := GREATEST(NEW.rated_losses - OLD.rated_losses, 0);
            END IF;

            rating_week := date_trunc('week', NEW.last_rated_at::timestamp)::date;

            INSERT INTO player_rating_weekly_history (
                model_id,
                player_id,
                week_start,
                snapshot_date,
                rating,
                rating_deviation,
                volatility,
                conservative_rating,
                rated_matches,
                rated_wins,
                rated_losses,
                week_matches,
                week_wins,
                week_losses,
                provisional,
                created_at,
                updated_at
            ) VALUES (
                NEW.model_id,
                NEW.player_id,
                rating_week,
                NEW.last_rated_at,
                NEW.rating,
                NEW.rating_deviation,
                NEW.volatility,
                NEW.conservative_rating,
                NEW.rated_matches,
                NEW.rated_wins,
                NEW.rated_losses,
                match_delta,
                win_delta,
                loss_delta,
                NEW.provisional,
                now(),
                now()
            )
            ON CONFLICT (model_id, player_id, week_start) DO UPDATE SET
                snapshot_date = EXCLUDED.snapshot_date,
                rating = EXCLUDED.rating,
                rating_deviation = EXCLUDED.rating_deviation,
                volatility = EXCLUDED.volatility,
                conservative_rating = EXCLUDED.conservative_rating,
                rated_matches = EXCLUDED.rated_matches,
                rated_wins = EXCLUDED.rated_wins,
                rated_losses = EXCLUDED.rated_losses,
                week_matches = player_rating_weekly_history.week_matches + EXCLUDED.week_matches,
                week_wins = player_rating_weekly_history.week_wins + EXCLUDED.week_wins,
                week_losses = player_rating_weekly_history.week_losses + EXCLUDED.week_losses,
                provisional = EXCLUDED.provisional,
                updated_at = now();

            RETURN NEW;
        END;
        $$
    `.execute(db);

    await sql`
        CREATE TRIGGER trg_capture_player_rating_weekly_history
        AFTER INSERT OR UPDATE ON player_ratings
        FOR EACH ROW
        EXECUTE FUNCTION capture_player_rating_weekly_history()
    `.execute(db);

    await sql`
        CREATE OR REPLACE FUNCTION clear_player_rating_weekly_history()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
            DELETE FROM player_rating_weekly_history
            WHERE model_id = OLD.model_id
              AND player_id = OLD.player_id;
            RETURN OLD;
        END;
        $$
    `.execute(db);

    await sql`
        CREATE TRIGGER trg_clear_player_rating_weekly_history
        AFTER DELETE ON player_ratings
        FOR EACH ROW
        EXECUTE FUNCTION clear_player_rating_weekly_history()
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`DROP TRIGGER IF EXISTS trg_clear_player_rating_weekly_history ON player_ratings`.execute(db);
    await sql`DROP FUNCTION IF EXISTS clear_player_rating_weekly_history()`.execute(db);
    await sql`DROP TRIGGER IF EXISTS trg_capture_player_rating_weekly_history ON player_ratings`.execute(db);
    await sql`DROP FUNCTION IF EXISTS capture_player_rating_weekly_history()`.execute(db);
    await db.schema.dropTable('player_rating_weekly_history').ifExists().execute();
}
