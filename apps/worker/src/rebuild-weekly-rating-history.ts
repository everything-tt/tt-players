import dotenv from 'dotenv';
import { db } from '@tt-players/db';
import { sql } from 'kysely';
import { calculateRatings } from './ratings/calculate-ratings.js';

dotenv.config();

const DEFAULT_MODEL_KEY = 'global-singles-glicko2-v1';
const DEFAULT_YEARS = 10;
const DEFAULT_MAX_PERIODS = 100000;
const LOCK_KEY = 'tt-players:calculated-ratings';
const RATING_REBUILD_SOURCE_TABLE = 'rating_rebuild_matches';

interface DateRow {
    first_date: string | Date | null;
}

function readArg(name: string): string | undefined {
    const prefix = `--${name}=`;
    return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(name: string): boolean {
    return process.argv.includes(`--${name}`);
}

function parsePositiveInteger(
    name: string,
    value: string | undefined,
    fallback: number,
): number {
    if (value === undefined) return fallback;
    if (!/^\d+$/.test(value)) {
        throw new Error(`--${name} must be a positive integer`);
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error(`--${name} must be a positive integer`);
    }
    return parsed;
}

function formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function toDateString(value: string | Date | null): string | null {
    if (!value) return null;
    return value instanceof Date ? formatDate(value) : String(value).slice(0, 10);
}

function startOfIsoWeek(date: Date): Date {
    const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const mondayOffset = (result.getUTCDay() + 6) % 7;
    result.setUTCDate(result.getUTCDate() - mondayOffset);
    return result;
}

function subtractCalendarYears(date: Date, years: number): Date {
    const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const originalMonth = result.getUTCMonth();
    result.setUTCFullYear(result.getUTCFullYear() - years);

    // 29 February becomes 28 February when the target year is not a leap year.
    if (result.getUTCMonth() !== originalMonth) {
        result.setUTCDate(0);
    }
    return result;
}

function parseExplicitStartDate(value: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error('--start-date must use YYYY-MM-DD');
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || formatDate(parsed) !== value) {
        throw new Error(`Invalid --start-date: ${value}`);
    }
    return formatDate(startOfIsoWeek(parsed));
}

async function resolveStartDate(
    allHistory: boolean,
    explicitStartDate: string | undefined,
    yearsArg: string | undefined,
): Promise<{ startDate: string; scope: 'all' | 'start-date' | 'years'; years: number | null }> {
    if (allHistory && (explicitStartDate !== undefined || yearsArg !== undefined)) {
        throw new Error('--all cannot be combined with --start-date or --years');
    }
    if (explicitStartDate !== undefined && yearsArg !== undefined) {
        throw new Error('--start-date cannot be combined with --years');
    }

    if (allHistory) {
        const result = await sql<DateRow>`
            SELECT MIN(effective_date) AS first_date
            FROM rating_rubber_classification
            WHERE eligibility_reason = 'eligible'
        `.execute(db);
        const firstDate = toDateString(result.rows[0]?.first_date ?? null);
        if (!firstDate) {
            throw new Error('No eligible rating matches are available to rebuild');
        }
        return {
            startDate: formatDate(startOfIsoWeek(new Date(`${firstDate}T00:00:00.000Z`))),
            scope: 'all',
            years: null,
        };
    }

    if (explicitStartDate !== undefined) {
        return {
            startDate: parseExplicitStartDate(explicitStartDate),
            scope: 'start-date',
            years: null,
        };
    }

    const years = parsePositiveInteger('years', yearsArg, DEFAULT_YEARS);
    return {
        startDate: formatDate(startOfIsoWeek(subtractCalendarYears(new Date(), years))),
        scope: 'years',
        years,
    };
}

async function resetFromDate(modelKey: string, startDate: string): Promise<void> {
    await db.transaction().execute(async (trx) => {
        const lockResult = await sql<{ locked: boolean }>`
            SELECT pg_try_advisory_xact_lock(hashtext(${LOCK_KEY})) AS locked
        `.execute(trx);
        if (lockResult.rows[0]?.locked !== true) {
            throw new Error('The ratings worker is currently busy. Stop it or rerun this command shortly.');
        }

        const modelResult = await sql<{ id: string }>`
            SELECT id
            FROM rating_models
            WHERE key = ${modelKey}
            LIMIT 1
        `.execute(trx);
        const model = modelResult.rows[0];
        if (!model) throw new Error(`Unknown rating model: ${modelKey}`);

        await sql`
            UPDATE rating_models
            SET window_start_date = ${startDate}::date,
                updated_at = now()
            WHERE id = ${model.id}::uuid
        `.execute(trx);

        await sql`
            DELETE FROM rating_current_rankings
            WHERE model_id = ${model.id}::uuid
        `.execute(trx);
        await sql`
            DELETE FROM rating_checkpoints
            WHERE model_id = ${model.id}::uuid
        `.execute(trx);
        await sql`
            DELETE FROM player_rating_weekly_history
            WHERE model_id = ${model.id}::uuid
        `.execute(trx);
        await sql`
            DELETE FROM player_ratings
            WHERE model_id = ${model.id}::uuid
        `.execute(trx);
        await sql`
            INSERT INTO rating_processing_state (
                model_id,
                last_processed_date,
                dirty_from_date,
                status,
                processed_periods,
                processed_matches,
                last_error,
                started_at,
                finished_at,
                updated_at
            ) VALUES (
                ${model.id}::uuid,
                (${startDate}::date - 1),
                NULL,
                'running',
                0,
                0,
                NULL,
                now(),
                NULL,
                now()
            )
            ON CONFLICT (model_id) DO UPDATE SET
                last_processed_date = EXCLUDED.last_processed_date,
                dirty_from_date = NULL,
                status = 'running',
                processed_periods = 0,
                processed_matches = 0,
                last_error = NULL,
                started_at = now(),
                finished_at = NULL,
                updated_at = now()
        `.execute(trx);
    });
}

async function markFailed(modelKey: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await sql`
        UPDATE rating_processing_state processing
        SET status = 'failed',
            last_error = ${message},
            finished_at = now(),
            updated_at = now()
        FROM rating_models model
        WHERE model.id = processing.model_id
          AND model.key = ${modelKey}
    `.execute(db);
}

async function prepareRebuildSource(startDate: string): Promise<void> {
    await db.transaction().execute(async (trx) => {
        await sql`SET LOCAL statement_timeout = '5min'`.execute(trx);
        await sql`DROP TABLE IF EXISTS ${sql.raw(RATING_REBUILD_SOURCE_TABLE)}`.execute(trx);
        await sql`
            CREATE UNLOGGED TABLE ${sql.raw(RATING_REBUILD_SOURCE_TABLE)} AS
            SELECT
                rubber_id,
                effective_date,
                home_canonical_player_id,
                away_canonical_player_id,
                home_games_won,
                away_games_won,
                eligibility_reason
            FROM rating_rubber_classification
            WHERE eligibility_reason = 'eligible'
              AND effective_date >= ${startDate}::date
        `.execute(trx);
        await sql`
            CREATE INDEX rating_rebuild_matches_effective_date_idx
            ON ${sql.raw(RATING_REBUILD_SOURCE_TABLE)} (effective_date, rubber_id)
        `.execute(trx);
        await sql`
            CREATE INDEX rating_rebuild_matches_home_date_away_idx
            ON ${sql.raw(RATING_REBUILD_SOURCE_TABLE)}
                (home_canonical_player_id, effective_date, away_canonical_player_id)
        `.execute(trx);
        await sql`
            CREATE INDEX rating_rebuild_matches_away_date_home_idx
            ON ${sql.raw(RATING_REBUILD_SOURCE_TABLE)}
                (away_canonical_player_id, effective_date, home_canonical_player_id)
        `.execute(trx);
        await sql`ANALYZE ${sql.raw(RATING_REBUILD_SOURCE_TABLE)}`.execute(trx);
    });
}

async function cleanupRebuildSource(): Promise<void> {
    await db.transaction().execute(async (trx) => {
        await sql`SET LOCAL statement_timeout = '2min'`.execute(trx);
        await sql`DROP TABLE IF EXISTS ${sql.raw(RATING_REBUILD_SOURCE_TABLE)}`.execute(trx);
    });
}

async function rebuild(): Promise<void> {
    const modelKey = readArg('model') ?? DEFAULT_MODEL_KEY;
    if (!/^[a-zA-Z0-9._-]+$/.test(modelKey)) {
        throw new Error('--model contains unsupported characters');
    }

    const maxPeriods = parsePositiveInteger(
        'max-periods',
        readArg('max-periods'),
        DEFAULT_MAX_PERIODS,
    );
    const resolved = await resolveStartDate(
        hasFlag('all'),
        readArg('start-date'),
        readArg('years'),
    );

    console.log(`ratings history: rebuilding ${modelKey} from ${resolved.startDate}`);
    console.log(`ratings history: scope=${resolved.scope}`);
    console.log('ratings history: current ratings, current rankings, checkpoints, and weekly history for this model will be replaced');

    let totalPeriods = 0;
    let totalMatches = 0;
    let lastProcessedDate: string | null = null;
    let sourcePrepared = false;

    try {
        await resetFromDate(modelKey, resolved.startDate);
        await prepareRebuildSource(resolved.startDate);
        sourcePrepared = true;

        while (true) {
            const result = await calculateRatings(
                db,
                {
                    modelKey,
                    maxPeriods,
                    ratingSource: 'rebuild-table',
                },
                console.log,
            );

            if (result.busy) {
                console.log('ratings history: another worker owns the current period; retrying shortly');
                await new Promise((resolve) => setTimeout(resolve, 1000));
                continue;
            }

            totalPeriods += result.processedPeriods;
            totalMatches += result.processedMatches;
            lastProcessedDate = result.lastProcessedDate ?? lastProcessedDate;

            if (result.complete) break;
        }

        await cleanupRebuildSource();
        sourcePrepared = false;
    } catch (error) {
        await markFailed(modelKey, error);
        if (sourcePrepared) {
            await cleanupRebuildSource().catch((cleanupError) => {
                console.error('ratings history: failed to clean up rebuild source', cleanupError);
            });
        }
        throw error;
    }

    const summary = {
        modelKey,
        scope: resolved.scope,
        years: resolved.years,
        startDate: resolved.startDate,
        processedPeriods: totalPeriods,
        processedMatches: totalMatches,
        lastProcessedDate,
        complete: true,
    };
    console.log(JSON.stringify(summary, null, 2));
    console.log(`RATING_REBUILD=${JSON.stringify(summary)}`);
}

try {
    await rebuild();
} finally {
    await db.destroy();
}
