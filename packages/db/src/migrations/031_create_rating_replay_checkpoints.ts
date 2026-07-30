import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .alterTable('rating_processing_state')
        .addColumn('dirty_from_date', 'date')
        .execute();

    await db.schema
        .createIndex('idx_rating_processing_state_dirty')
        .on('rating_processing_state')
        .column('dirty_from_date')
        .where('dirty_from_date', 'is not', null)
        .execute();

    await db.schema
        .createTable('rating_checkpoints')
        .addColumn('model_id', 'uuid', (col) =>
            col.notNull().references('rating_models.id').onDelete('cascade')
        )
        .addColumn('checkpoint_date', 'date', (col) => col.notNull())
        .addColumn('player_count', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addPrimaryKeyConstraint('pk_rating_checkpoints', ['model_id', 'checkpoint_date'])
        .execute();

    await db.schema
        .createTable('rating_checkpoint_players')
        .addColumn('model_id', 'uuid', (col) => col.notNull())
        .addColumn('checkpoint_date', 'date', (col) => col.notNull())
        .addColumn('player_id', 'uuid', (col) =>
            col.notNull().references('external_players.id').onDelete('cascade')
        )
        .addColumn('rating', 'double precision', (col) => col.notNull())
        .addColumn('rating_deviation', 'double precision', (col) => col.notNull())
        .addColumn('volatility', 'double precision', (col) => col.notNull())
        .addColumn('conservative_rating', 'double precision', (col) => col.notNull())
        .addColumn('rated_matches', 'integer', (col) => col.notNull())
        .addColumn('rated_wins', 'integer', (col) => col.notNull())
        .addColumn('rated_losses', 'integer', (col) => col.notNull())
        .addColumn('first_rated_at', 'date')
        .addColumn('last_rated_at', 'date')
        .addColumn('provisional', 'boolean', (col) => col.notNull())
        .addColumn('checkpoint_week_start', 'date')
        .addColumn('checkpoint_snapshot_date', 'date')
        .addColumn('checkpoint_week_matches', 'integer')
        .addColumn('checkpoint_week_wins', 'integer')
        .addColumn('checkpoint_week_losses', 'integer')
        .addPrimaryKeyConstraint('pk_rating_checkpoint_players', [
            'model_id',
            'checkpoint_date',
            'player_id',
        ])
        .addForeignKeyConstraint(
            'fk_rating_checkpoint_players_checkpoint',
            ['model_id', 'checkpoint_date'],
            'rating_checkpoints',
            ['model_id', 'checkpoint_date'],
            (constraint) => constraint.onDelete('cascade'),
        )
        .execute();

    await db.schema
        .createIndex('idx_rating_checkpoint_players_restore')
        .on('rating_checkpoint_players')
        .columns(['model_id', 'checkpoint_date'])
        .execute();

    await db.schema
        .alterTable('player_rating_weekly_history')
        .addColumn('first_rated_at', 'date')
        .execute();

    await sql`
        UPDATE player_rating_weekly_history history
        SET first_rated_at = ratings.first_rated_at
        FROM player_ratings ratings
        WHERE ratings.model_id = history.model_id
          AND ratings.player_id = history.player_id
    `.execute(db);

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
            IF current_setting('tt_players.rating_replay_restore', true) = 'on' THEN
                RETURN NEW;
            END IF;

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
                first_rated_at,
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
                NEW.first_rated_at,
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
                first_rated_at = EXCLUDED.first_rated_at,
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
        CREATE OR REPLACE FUNCTION clear_player_rating_weekly_history()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
            IF current_setting('tt_players.rating_replay_restore', true) = 'on' THEN
                RETURN OLD;
            END IF;

            DELETE FROM player_rating_weekly_history
            WHERE model_id = OLD.model_id
              AND player_id = OLD.player_id;
            RETURN OLD;
        END;
        $$
    `.execute(db);

    await sql`
        CREATE OR REPLACE FUNCTION mark_rating_models_dirty(p_affected_date date)
        RETURNS void
        LANGUAGE plpgsql
        AS $$
        BEGIN
            IF p_affected_date IS NULL THEN
                RETURN;
            END IF;

            UPDATE rating_processing_state
            SET dirty_from_date = CASE
                    WHEN dirty_from_date IS NULL THEN p_affected_date
                    ELSE LEAST(dirty_from_date, p_affected_date)
                END,
                status = 'dirty',
                finished_at = NULL,
                updated_at = now()
            WHERE last_processed_date IS NOT NULL
              AND p_affected_date <= last_processed_date;
        END;
        $$
    `.execute(db);

    await sql`
        CREATE OR REPLACE FUNCTION mark_ratings_dirty_from_rubber()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        DECLARE
            old_date date;
            new_date date;
            old_eligible boolean := false;
            new_eligible boolean := false;
        BEGIN
            IF TG_OP = 'UPDATE'
               AND OLD.played_at IS NOT DISTINCT FROM NEW.played_at
               AND OLD.fixture_id IS NOT DISTINCT FROM NEW.fixture_id
               AND OLD.is_doubles IS NOT DISTINCT FROM NEW.is_doubles
               AND OLD.outcome_type IS NOT DISTINCT FROM NEW.outcome_type
               AND OLD.home_player_1_id IS NOT DISTINCT FROM NEW.home_player_1_id
               AND OLD.away_player_1_id IS NOT DISTINCT FROM NEW.away_player_1_id
               AND OLD.home_games_won IS NOT DISTINCT FROM NEW.home_games_won
               AND OLD.away_games_won IS NOT DISTINCT FROM NEW.away_games_won
               AND OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at THEN
                RETURN NEW;
            END IF;

            IF TG_OP <> 'INSERT' THEN
                old_eligible := OLD.deleted_at IS NULL
                    AND OLD.is_doubles = false
                    AND OLD.outcome_type = 'normal'
                    AND OLD.home_player_1_id IS NOT NULL
                    AND OLD.away_player_1_id IS NOT NULL
                    AND OLD.home_games_won <> OLD.away_games_won;
                old_date := OLD.played_at::date;
                IF old_date IS NULL THEN
                    SELECT fixture.date_played
                    INTO old_date
                    FROM fixtures fixture
                    WHERE fixture.id = OLD.fixture_id
                      AND fixture.deleted_at IS NULL;
                END IF;
            END IF;

            IF TG_OP <> 'DELETE' THEN
                new_eligible := NEW.deleted_at IS NULL
                    AND NEW.is_doubles = false
                    AND NEW.outcome_type = 'normal'
                    AND NEW.home_player_1_id IS NOT NULL
                    AND NEW.away_player_1_id IS NOT NULL
                    AND NEW.home_games_won <> NEW.away_games_won;
                new_date := NEW.played_at::date;
                IF new_date IS NULL THEN
                    SELECT fixture.date_played
                    INTO new_date
                    FROM fixtures fixture
                    WHERE fixture.id = NEW.fixture_id
                      AND fixture.deleted_at IS NULL;
                END IF;
            END IF;

            IF old_eligible THEN
                PERFORM mark_rating_models_dirty(old_date);
            END IF;
            IF new_eligible THEN
                PERFORM mark_rating_models_dirty(new_date);
            END IF;

            RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        END;
        $$
    `.execute(db);

    await sql`
        CREATE TRIGGER trg_mark_ratings_dirty_from_rubber
        AFTER INSERT OR DELETE OR UPDATE OF
            played_at,
            fixture_id,
            is_doubles,
            outcome_type,
            home_player_1_id,
            away_player_1_id,
            home_games_won,
            away_games_won,
            deleted_at
        ON rubbers
        FOR EACH ROW
        EXECUTE FUNCTION mark_ratings_dirty_from_rubber()
    `.execute(db);

    await sql`
        CREATE OR REPLACE FUNCTION mark_ratings_dirty_from_fixture()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        DECLARE
            has_fallback_rubbers boolean;
        BEGIN
            IF OLD.date_played IS NOT DISTINCT FROM NEW.date_played
               AND OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at THEN
                RETURN NEW;
            END IF;

            SELECT EXISTS (
                SELECT 1
                FROM rubbers rubber
                WHERE rubber.fixture_id = NEW.id
                  AND rubber.deleted_at IS NULL
                  AND rubber.played_at IS NULL
                  AND rubber.is_doubles = false
                  AND rubber.outcome_type = 'normal'
                  AND rubber.home_player_1_id IS NOT NULL
                  AND rubber.away_player_1_id IS NOT NULL
                  AND rubber.home_games_won <> rubber.away_games_won
            ) INTO has_fallback_rubbers;

            IF has_fallback_rubbers THEN
                IF OLD.deleted_at IS NULL THEN
                    PERFORM mark_rating_models_dirty(OLD.date_played);
                END IF;
                IF NEW.deleted_at IS NULL THEN
                    PERFORM mark_rating_models_dirty(NEW.date_played);
                END IF;
            END IF;

            RETURN NEW;
        END;
        $$
    `.execute(db);

    await sql`
        CREATE TRIGGER trg_mark_ratings_dirty_from_fixture
        AFTER UPDATE OF date_played, deleted_at
        ON fixtures
        FOR EACH ROW
        EXECUTE FUNCTION mark_ratings_dirty_from_fixture()
    `.execute(db);

    await sql`
        CREATE OR REPLACE FUNCTION mark_ratings_dirty_from_player_identity()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        DECLARE
            earliest_date date;
        BEGIN
            IF OLD.canonical_player_id IS NOT DISTINCT FROM NEW.canonical_player_id THEN
                RETURN NEW;
            END IF;

            SELECT MIN(
                COALESCE(
                    rubber.played_at::date,
                    CASE WHEN fixture.deleted_at IS NULL THEN fixture.date_played END
                )
            )
            INTO earliest_date
            FROM rubbers rubber
            LEFT JOIN fixtures fixture ON fixture.id = rubber.fixture_id
            WHERE rubber.deleted_at IS NULL
              AND rubber.is_doubles = false
              AND rubber.outcome_type = 'normal'
              AND rubber.home_player_1_id IS NOT NULL
              AND rubber.away_player_1_id IS NOT NULL
              AND rubber.home_games_won <> rubber.away_games_won
              AND (
                  rubber.home_player_1_id = NEW.id
                  OR rubber.away_player_1_id = NEW.id
              );

            PERFORM mark_rating_models_dirty(earliest_date);
            RETURN NEW;
        END;
        $$
    `.execute(db);

    await sql`
        CREATE TRIGGER trg_mark_ratings_dirty_from_player_identity
        AFTER UPDATE OF canonical_player_id
        ON external_players
        FOR EACH ROW
        EXECUTE FUNCTION mark_ratings_dirty_from_player_identity()
    `.execute(db);

    await sql`
        INSERT INTO rating_checkpoints (model_id, checkpoint_date, player_count)
        SELECT
            state.model_id,
            state.last_processed_date,
            COUNT(rating.player_id)::int
        FROM rating_processing_state state
        LEFT JOIN player_ratings rating ON rating.model_id = state.model_id
        WHERE state.last_processed_date IS NOT NULL
        GROUP BY state.model_id, state.last_processed_date
        ON CONFLICT (model_id, checkpoint_date) DO NOTHING
    `.execute(db);

    await sql`
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
            state.last_processed_date,
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
        FROM rating_processing_state state
        JOIN player_ratings rating ON rating.model_id = state.model_id
        LEFT JOIN player_rating_weekly_history history
          ON history.model_id = rating.model_id
         AND history.player_id = rating.player_id
         AND history.week_start = date_trunc('week', state.last_processed_date::timestamp)::date
        WHERE state.last_processed_date IS NOT NULL
        ON CONFLICT (model_id, checkpoint_date, player_id) DO NOTHING
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`DROP TRIGGER IF EXISTS trg_mark_ratings_dirty_from_player_identity ON external_players`.execute(db);
    await sql`DROP FUNCTION IF EXISTS mark_ratings_dirty_from_player_identity()`.execute(db);
    await sql`DROP TRIGGER IF EXISTS trg_mark_ratings_dirty_from_fixture ON fixtures`.execute(db);
    await sql`DROP FUNCTION IF EXISTS mark_ratings_dirty_from_fixture()`.execute(db);
    await sql`DROP TRIGGER IF EXISTS trg_mark_ratings_dirty_from_rubber ON rubbers`.execute(db);
    await sql`DROP FUNCTION IF EXISTS mark_ratings_dirty_from_rubber()`.execute(db);
    await sql`DROP FUNCTION IF EXISTS mark_rating_models_dirty(date)`.execute(db);

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
                model_id, player_id, week_start, snapshot_date, rating,
                rating_deviation, volatility, conservative_rating, rated_matches,
                rated_wins, rated_losses, week_matches, week_wins, week_losses,
                provisional, created_at, updated_at
            ) VALUES (
                NEW.model_id, NEW.player_id, rating_week, NEW.last_rated_at, NEW.rating,
                NEW.rating_deviation, NEW.volatility, NEW.conservative_rating,
                NEW.rated_matches, NEW.rated_wins, NEW.rated_losses,
                match_delta, win_delta, loss_delta, NEW.provisional, now(), now()
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

    await db.schema
        .alterTable('player_rating_weekly_history')
        .dropColumn('first_rated_at')
        .execute();
    await db.schema.dropTable('rating_checkpoint_players').ifExists().execute();
    await db.schema.dropTable('rating_checkpoints').ifExists().execute();
    await db.schema
        .alterTable('rating_processing_state')
        .dropColumn('dirty_from_date')
        .execute();
}
