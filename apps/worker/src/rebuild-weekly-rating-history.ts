import dotenv from 'dotenv';
import { db } from '@tt-players/db';
import { sql } from 'kysely';
import { calculateRatings } from './ratings/calculate-ratings.js';

dotenv.config();

const DEFAULT_MODEL_KEY = 'global-singles-glicko2-v1';
const DEFAULT_YEARS = 10;
const DEFAULT_MAX_PERIODS = 100000;
const LOCK_KEY = 'tt-players:calculated-ratings';

function readArg(name: string): string | undefined {
    const prefix = `--${name}=`;
    return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
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

function parseStartDate(value: string | undefined, years: number): string {
    if (value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            throw new Error('--start-date must use YYYY-MM-DD');
        }
        const parsed = new Date(`${value}T00:00:00.000Z`);
        if (Number.isNaN(parsed.getTime()) || formatDate(parsed) !== value) {
            throw new Error(`Invalid --start-date: ${value}`);
        }
        return formatDate(startOfIsoWeek(parsed));
    }

    return formatDate(startOfIsoWeek(subtractCalendarYears(new Date(), years)));
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

async function rebuild(): Promise<void> {
    const modelKey = readArg('model') ?? DEFAULT_MODEL_KEY;
    const years = parsePositiveInteger(readArg('years'), DEFAULT_YEARS);
    const maxPeriods = parsePositiveInteger(readArg('max-periods'), DEFAULT_MAX_PERIODS);
    const startDate = parseStartDate(readArg('start-date'), years);

    console.log(`ratings history: rebuilding ${modelKey} from ${startDate}`);
    console.log('ratings history: existing ratings, checkpoints, and weekly history for this model will be replaced');
    await resetFromDate(modelKey, startDate);

    let totalPeriods = 0;
    let totalMatches = 0;
    let lastProcessedDate: string | null = null;

    while (true) {
        const result = await calculateRatings(
            db,
            { modelKey, maxPeriods },
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

    console.log(JSON.stringify({
        modelKey,
        startDate,
        processedPeriods: totalPeriods,
        processedMatches: totalMatches,
        lastProcessedDate,
        complete: true,
    }, null, 2));
}

try {
    await rebuild();
} finally {
    await db.destroy();
}
