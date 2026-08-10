import { type Kysely, sql } from 'kysely';

async function createRatingClassificationView(
    db: Kysely<any>,
    gateByFixtureStatus: boolean,
): Promise<void> {
    const baseEligibilityReason = sql`rating_rubber_exclusion_reason(
        rubber.is_doubles,
        rubber.outcome_type::text,
        COALESCE(
            rubber.played_at::date,
            CASE WHEN fixture.deleted_at IS NULL THEN fixture.date_played END
        ),
        rubber.home_player_1_id,
        rubber.away_player_1_id,
        home_player.id,
        away_player.id,
        COALESCE(home_player.canonical_player_id, home_player.id),
        COALESCE(away_player.canonical_player_id, away_player.id),
        rubber.home_games_won,
        rubber.away_games_won
    )`;
    const fixtureStatusGate = gateByFixtureStatus
        ? sql`CASE
                WHEN fixture.status IS DISTINCT FROM 'completed'
                     AND ${baseEligibilityReason} = 'eligible'
                    THEN 'fixture_not_completed'
                ELSE ${baseEligibilityReason}
            END`
        : baseEligibilityReason;

    await sql`
        CREATE OR REPLACE VIEW rating_rubber_classification AS
        SELECT
            rubber.id AS rubber_id,
            rubber.fixture_id,
            fixture.competition_id,
            league.platform_id,
            COALESCE(
                rubber.played_at::date,
                CASE WHEN fixture.deleted_at IS NULL THEN fixture.date_played END
            ) AS effective_date,
            rubber.is_doubles,
            rubber.outcome_type::text AS outcome_type,
            rubber.home_player_1_id,
            rubber.away_player_1_id,
            home_player.id AS home_player_record_id,
            away_player.id AS away_player_record_id,
            COALESCE(home_player.canonical_player_id, home_player.id) AS home_canonical_player_id,
            COALESCE(away_player.canonical_player_id, away_player.id) AS away_canonical_player_id,
            rubber.home_games_won,
            rubber.away_games_won,
            ${fixtureStatusGate} AS eligibility_reason
        FROM rubbers rubber
        LEFT JOIN fixtures fixture ON fixture.id = rubber.fixture_id
        LEFT JOIN competitions competition ON competition.id = fixture.competition_id
        LEFT JOIN seasons season ON season.id = competition.season_id
        LEFT JOIN leagues league ON league.id = season.league_id
        LEFT JOIN external_players home_player ON home_player.id = rubber.home_player_1_id
        LEFT JOIN external_players away_player ON away_player.id = rubber.away_player_1_id
        WHERE rubber.deleted_at IS NULL
    `.execute(db);
}

async function createStatusAwareDirtyTriggers(db: Kysely<any>): Promise<void> {
    await sql`
        CREATE OR REPLACE FUNCTION mark_ratings_dirty_from_rubber()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        DECLARE
            old_date date;
            new_date date;
            old_fixture_eligible boolean := false;
            new_fixture_eligible boolean := false;
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
                SELECT
                    fixture.deleted_at IS NULL AND fixture.status = 'completed',
                    COALESCE(
                        OLD.played_at::date,
                        CASE WHEN fixture.deleted_at IS NULL THEN fixture.date_played END
                    )
                INTO old_fixture_eligible, old_date
                FROM fixtures fixture
                WHERE fixture.id = OLD.fixture_id;

                old_eligible := OLD.deleted_at IS NULL
                    AND OLD.is_doubles = false
                    AND OLD.outcome_type = 'normal'
                    AND OLD.home_player_1_id IS NOT NULL
                    AND OLD.away_player_1_id IS NOT NULL
                    AND OLD.home_games_won <> OLD.away_games_won
                    AND old_fixture_eligible;
            END IF;

            IF TG_OP <> 'DELETE' THEN
                SELECT
                    fixture.deleted_at IS NULL AND fixture.status = 'completed',
                    COALESCE(
                        NEW.played_at::date,
                        CASE WHEN fixture.deleted_at IS NULL THEN fixture.date_played END
                    )
                INTO new_fixture_eligible, new_date
                FROM fixtures fixture
                WHERE fixture.id = NEW.fixture_id;

                new_eligible := NEW.deleted_at IS NULL
                    AND NEW.is_doubles = false
                    AND NEW.outcome_type = 'normal'
                    AND NEW.home_player_1_id IS NOT NULL
                    AND NEW.away_player_1_id IS NOT NULL
                    AND NEW.home_games_won <> NEW.away_games_won
                    AND new_fixture_eligible;
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
        CREATE OR REPLACE FUNCTION mark_ratings_dirty_from_fixture()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        DECLARE
            earliest_old_date date;
            earliest_new_date date;
            has_fallback_rubbers boolean;
        BEGIN
            IF OLD.date_played IS NOT DISTINCT FROM NEW.date_played
               AND OLD.status IS NOT DISTINCT FROM NEW.status
               AND OLD.deleted_at IS NOT DISTINCT FROM NEW.deleted_at THEN
                RETURN NEW;
            END IF;

            IF OLD.status IS DISTINCT FROM NEW.status
               OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at THEN
                SELECT
                    MIN(COALESCE(rubber.played_at::date, OLD.date_played)),
                    MIN(COALESCE(rubber.played_at::date, NEW.date_played))
                INTO earliest_old_date, earliest_new_date
                FROM rubbers rubber
                WHERE rubber.fixture_id = NEW.id
                  AND rubber.deleted_at IS NULL
                  AND rubber.is_doubles = false
                  AND rubber.outcome_type = 'normal'
                  AND rubber.home_player_1_id IS NOT NULL
                  AND rubber.away_player_1_id IS NOT NULL
                  AND rubber.home_games_won <> rubber.away_games_won;

                IF OLD.deleted_at IS NULL AND OLD.status = 'completed' THEN
                    PERFORM mark_rating_models_dirty(earliest_old_date);
                END IF;
                IF NEW.deleted_at IS NULL AND NEW.status = 'completed' THEN
                    PERFORM mark_rating_models_dirty(earliest_new_date);
                END IF;

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

            IF has_fallback_rubbers AND NEW.status = 'completed' THEN
                PERFORM mark_rating_models_dirty(OLD.date_played);
                PERFORM mark_rating_models_dirty(NEW.date_played);
            END IF;

            RETURN NEW;
        END;
        $$
    `.execute(db);

    await sql`
        DROP TRIGGER IF EXISTS trg_mark_ratings_dirty_from_fixture ON fixtures
    `.execute(db);
    await sql`
        CREATE TRIGGER trg_mark_ratings_dirty_from_fixture
        AFTER UPDATE OF date_played, status, deleted_at
        ON fixtures
        FOR EACH ROW
        EXECUTE FUNCTION mark_ratings_dirty_from_fixture()
    `.execute(db);
}

async function createLegacyDirtyTriggers(db: Kysely<any>): Promise<void> {
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
        DROP TRIGGER IF EXISTS trg_mark_ratings_dirty_from_fixture ON fixtures
    `.execute(db);
    await sql`
        CREATE TRIGGER trg_mark_ratings_dirty_from_fixture
        AFTER UPDATE OF date_played, deleted_at
        ON fixtures
        FOR EACH ROW
        EXECUTE FUNCTION mark_ratings_dirty_from_fixture()
    `.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
    await createRatingClassificationView(db, true);
    await createStatusAwareDirtyTriggers(db);

    await sql`
        SELECT mark_rating_models_dirty(MIN(effective_date))
        FROM rating_rubber_classification
        WHERE eligibility_reason = 'fixture_not_completed'
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await createRatingClassificationView(db, false);
    await createLegacyDirtyTriggers(db);

    await sql`
        SELECT mark_rating_models_dirty(MIN(classification.effective_date))
        FROM rating_rubber_classification classification
        JOIN fixtures fixture ON fixture.id = classification.fixture_id
        WHERE classification.eligibility_reason = 'eligible'
          AND fixture.status IS DISTINCT FROM 'completed'
    `.execute(db);
}
