import { sql, type Kysely, type Transaction } from 'kysely';
import type { Database } from '@tt-players/db';

const LOCK_KEY = 'tt-players:calculated-ratings';

interface StoredModel {
    id: string;
}

interface DirtyStateRow {
    dirty_from_date: string | Date | null;
}

interface CheckpointRow {
    checkpoint_date: string | Date | null;
}

interface NextDateRow {
    next_date: string | Date | null;
}

export interface RatingReplayResult {
    busy: boolean;
    replayed: boolean;
    dirtyFromDate: string | null;
    checkpointDate: string | null;
    replayFromDate: string | null;
}

export async function rewindDirtyRatingModel(
    db: Kysely<Database>,
    modelKey: string,
): Promise<RatingReplayResult> {
    return db.transaction().execute(async (trx) => {
        if (!(await acquireLock(trx))) {
            return {
                busy: true,
                replayed: false,
                dirtyFromDate: null,
                checkpointDate: null,
                replayFromDate: null,
            };
        }

        const model = await loadModel(trx, modelKey);
        await sql`
            INSERT INTO rating_processing_state (model_id, status, started_at)
            VALUES (${model.id}::uuid, 'running', now())
            ON CONFLICT (model_id) DO NOTHING
        `.execute(trx);

        const stateResult = await sql<DirtyStateRow>`
            SELECT dirty_from_date
            FROM rating_processing_state
            WHERE model_id = ${model.id}::uuid
            FOR UPDATE
        `.execute(trx);
        const dirtyFromDate = toDateString(stateResult.rows[0]?.dirty_from_date ?? null);
        if (!dirtyFromDate) {
            return {
                busy: false,
                replayed: false,
                dirtyFromDate: null,
                checkpointDate: null,
                replayFromDate: null,
            };
        }

        const checkpointResult = await sql<CheckpointRow>`
            SELECT MAX(checkpoint_date) AS checkpoint_date
            FROM rating_checkpoints
            WHERE model_id = ${model.id}::uuid
              AND checkpoint_date < ${dirtyFromDate}::date
        `.execute(trx);
        const checkpointDate = toDateString(checkpointResult.rows[0]?.checkpoint_date ?? null);

        await sql`SELECT set_config('tt_players.rating_replay_restore', 'on', true)`.execute(trx);

        if (checkpointDate) {
            await restoreCheckpoint(trx, model.id, checkpointDate);
            await sql`
                DELETE FROM rating_checkpoints
                WHERE model_id = ${model.id}::uuid
                  AND checkpoint_date > ${checkpointDate}::date
            `.execute(trx);
        } else {
            await sql`
                DELETE FROM player_rating_weekly_history
                WHERE model_id = ${model.id}::uuid
            `.execute(trx);
            await sql`
                DELETE FROM player_ratings
                WHERE model_id = ${model.id}::uuid
            `.execute(trx);
            await sql`
                DELETE FROM rating_checkpoints
                WHERE model_id = ${model.id}::uuid
            `.execute(trx);
        }

        await sql`
            UPDATE rating_processing_state
            SET last_processed_date = ${checkpointDate}::date,
                dirty_from_date = NULL,
                status = 'running',
                processed_periods = 0,
                processed_matches = 0,
                last_error = NULL,
                started_at = now(),
                finished_at = NULL,
                updated_at = now()
            WHERE model_id = ${model.id}::uuid
        `.execute(trx);

        return {
            busy: false,
            replayed: true,
            dirtyFromDate,
            checkpointDate,
            replayFromDate: checkpointDate ? addDays(checkpointDate, 1) : null,
        };
    });
}

async function restoreCheckpoint(
    trx: Transaction<Database>,
    modelId: string,
    checkpointDate: string,
): Promise<void> {
    await sql`
        DELETE FROM player_ratings
        WHERE model_id = ${modelId}::uuid
    `.execute(trx);

    await sql`
        INSERT INTO player_ratings (
            model_id,
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
            updated_at
        )
        SELECT
            model_id,
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
            now()
        FROM rating_checkpoint_players
        WHERE model_id = ${modelId}::uuid
          AND checkpoint_date = ${checkpointDate}::date
    `.execute(trx);

    await sql`
        DELETE FROM player_rating_weekly_history
        WHERE model_id = ${modelId}::uuid
          AND week_start >= date_trunc('week', ${checkpointDate}::date::timestamp)::date
    `.execute(trx);

    await sql`
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
        )
        SELECT
            model_id,
            player_id,
            checkpoint_week_start,
            checkpoint_snapshot_date,
            rating,
            rating_deviation,
            volatility,
            conservative_rating,
            rated_matches,
            rated_wins,
            rated_losses,
            first_rated_at,
            checkpoint_week_matches,
            checkpoint_week_wins,
            checkpoint_week_losses,
            provisional,
            now(),
            now()
        FROM rating_checkpoint_players
        WHERE model_id = ${modelId}::uuid
          AND checkpoint_date = ${checkpointDate}::date
          AND checkpoint_week_start IS NOT NULL
    `.execute(trx);
}

export async function createRatingCheckpointIfMonthComplete(
    trx: Transaction<Database>,
    modelId: string,
    processedDate: string,
): Promise<boolean> {
    const nextDate = await findNextEligibleDate(trx, processedDate);
    if (nextDate && nextDate.slice(0, 7) === processedDate.slice(0, 7)) {
        return false;
    }

    await sql`
        INSERT INTO rating_checkpoints (
            model_id,
            checkpoint_date,
            player_count,
            created_at
        )
        SELECT
            ${modelId}::uuid,
            ${processedDate}::date,
            COUNT(*)::int,
            now()
        FROM player_ratings
        WHERE model_id = ${modelId}::uuid
        ON CONFLICT (model_id, checkpoint_date) DO UPDATE SET
            player_count = EXCLUDED.player_count,
            created_at = now()
    `.execute(trx);

    await sql`
        DELETE FROM rating_checkpoint_players
        WHERE model_id = ${modelId}::uuid
          AND checkpoint_date = ${processedDate}::date
    `.execute(trx);

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
            ${processedDate}::date,
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
         AND history.week_start = date_trunc('week', ${processedDate}::date::timestamp)::date
        WHERE rating.model_id = ${modelId}::uuid
    `.execute(trx);

    return true;
}

async function findNextEligibleDate(
    trx: Transaction<Database>,
    afterDate: string,
): Promise<string | null> {
    const result = await sql<NextDateRow>`
        SELECT MIN(candidate_date) AS next_date
        FROM (
            SELECT MIN(rubber.played_at::date) AS candidate_date
            FROM rubbers rubber
            WHERE rubber.deleted_at IS NULL
              AND rubber.played_at > ${afterDate}::date
              AND rubber.is_doubles = false
              AND rubber.outcome_type = 'normal'
              AND rubber.home_player_1_id IS NOT NULL
              AND rubber.away_player_1_id IS NOT NULL
              AND rubber.home_games_won <> rubber.away_games_won

            UNION ALL

            SELECT MIN(fixture.date_played) AS candidate_date
            FROM fixtures fixture
            WHERE fixture.deleted_at IS NULL
              AND fixture.date_played > ${afterDate}::date
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
        ) candidates
    `.execute(trx);
    return toDateString(result.rows[0]?.next_date ?? null);
}

async function acquireLock(trx: Transaction<Database>): Promise<boolean> {
    const result = await sql<{ locked: boolean }>`
        SELECT pg_try_advisory_xact_lock(hashtext(${LOCK_KEY})) AS locked
    `.execute(trx);
    return result.rows[0]?.locked === true;
}

async function loadModel(
    trx: Transaction<Database>,
    modelKey: string,
): Promise<StoredModel> {
    const result = await sql<StoredModel>`
        SELECT id
        FROM rating_models
        WHERE key = ${modelKey}
        LIMIT 1
    `.execute(trx);
    const model = result.rows[0];
    if (!model) throw new Error(`Unknown rating model: ${modelKey}`);
    return model;
}

function toDateString(value: string | Date | null): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return value.slice(0, 10);
}

function addDays(value: string, days: number): string {
    const date = new Date(`${value}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}
