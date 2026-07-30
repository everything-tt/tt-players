import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await sql`
        CREATE OR REPLACE FUNCTION prepare_rating_state_reset()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
            IF NEW.last_processed_date IS NULL
               AND OLD.last_processed_date IS NOT NULL THEN
                DELETE FROM rating_checkpoints
                WHERE model_id = NEW.model_id;
                NEW.dirty_from_date := NULL;
            END IF;
            RETURN NEW;
        END;
        $$
    `.execute(db);

    await sql`
        CREATE TRIGGER trg_prepare_rating_state_reset
        BEFORE UPDATE OF last_processed_date
        ON rating_processing_state
        FOR EACH ROW
        EXECUTE FUNCTION prepare_rating_state_reset()
    `.execute(db);

    await sql`
        CREATE OR REPLACE FUNCTION capture_monthly_rating_checkpoint()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        DECLARE
            next_match_date date;
        BEGIN
            IF current_setting('tt_players.rating_replay_restore', true) = 'on' THEN
                RETURN NEW;
            END IF;
            IF NEW.last_processed_date IS NULL THEN
                RETURN NEW;
            END IF;
            IF TG_OP = 'UPDATE'
               AND OLD.last_processed_date IS NOT DISTINCT FROM NEW.last_processed_date THEN
                RETURN NEW;
            END IF;

            SELECT MIN(candidate_date)
            INTO next_match_date
            FROM (
                SELECT MIN(rubber.played_at::date) AS candidate_date
                FROM rubbers rubber
                WHERE rubber.deleted_at IS NULL
                  AND rubber.played_at::date > NEW.last_processed_date
                  AND rubber.is_doubles = false
                  AND rubber.outcome_type = 'normal'
                  AND rubber.home_player_1_id IS NOT NULL
                  AND rubber.away_player_1_id IS NOT NULL
                  AND rubber.home_games_won <> rubber.away_games_won

                UNION ALL

                SELECT MIN(fixture.date_played) AS candidate_date
                FROM fixtures fixture
                WHERE fixture.deleted_at IS NULL
                  AND fixture.date_played > NEW.last_processed_date
                  AND EXISTS (
                      SELECT 1
                      FROM rubbers rubber
                      WHERE rubber.fixture_id = fixture.id
                        AND rubber.deleted_at IS NULL
                        AND rubber.played_at IS NULL
                        AND rubber.is_doubles = false
                        AND rubber.outcome_type = 'normal'
                        AND rubber.home_player_1_id IS NOT NULL
                        AND rubber.away_player_1_id IS NOT NULL
                        AND rubber.home_games_won <> rubber.away_games_won
                  )
            ) candidates;

            IF next_match_date IS NOT NULL
               AND date_trunc('month', next_match_date::timestamp)
                   = date_trunc('month', NEW.last_processed_date::timestamp) THEN
                RETURN NEW;
            END IF;

            INSERT INTO rating_checkpoints (
                model_id,
                checkpoint_date,
                player_count,
                created_at
            )
            SELECT
                NEW.model_id,
                NEW.last_processed_date,
                COUNT(*)::int,
                now()
            FROM player_ratings
            WHERE model_id = NEW.model_id
            ON CONFLICT (model_id, checkpoint_date) DO UPDATE SET
                player_count = EXCLUDED.player_count,
                created_at = now();

            DELETE FROM rating_checkpoint_players
            WHERE model_id = NEW.model_id
              AND checkpoint_date = NEW.last_processed_date;

            INSERT INTO rating_checkpoint_players (
                model_id,
                checkpoint_date,
                player_id,
                rating,
                rating_deviation,
                volatility,
                conservative_rating,
                rated_matches,
                rated_wins,
                rated_losses,
                first_rated_at,
                last_rated_at,
                provisional,
                checkpoint_week_start,
                checkpoint_snapshot_date,
                checkpoint_week_matches,
                checkpoint_week_wins,
                checkpoint_week_losses
            )
            SELECT
                rating.model_id,
                NEW.last_processed_date,
                rating.player_id,
                rating.rating,
                rating.rating_deviation,
                rating.volatility,
                rating.conservative_rating,
                rating.rated_matches,
                rating.rated_wins,
                rating.rated_losses,
                rating.first_rated_at,
                rating.last_rated_at,
                rating.provisional,
                history.week_start,
                history.snapshot_date,
                history.week_matches,
                history.week_wins,
                history.week_losses
            FROM player_ratings rating
            LEFT JOIN player_rating_weekly_history history
              ON history.model_id = rating.model_id
             AND history.player_id = rating.player_id
             AND history.week_start = date_trunc('week', NEW.last_processed_date::timestamp)::date
            WHERE rating.model_id = NEW.model_id;

            RETURN NEW;
        END;
        $$
    `.execute(db);

    await sql`
        CREATE TRIGGER trg_capture_monthly_rating_checkpoint
        AFTER INSERT OR UPDATE OF last_processed_date
        ON rating_processing_state
        FOR EACH ROW
        EXECUTE FUNCTION capture_monthly_rating_checkpoint()
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`
        DROP TRIGGER IF EXISTS trg_capture_monthly_rating_checkpoint
        ON rating_processing_state
    `.execute(db);
    await sql`DROP FUNCTION IF EXISTS capture_monthly_rating_checkpoint()`.execute(db);
    await sql`
        DROP TRIGGER IF EXISTS trg_prepare_rating_state_reset
        ON rating_processing_state
    `.execute(db);
    await sql`DROP FUNCTION IF EXISTS prepare_rating_state_reset()`.execute(db);
}
